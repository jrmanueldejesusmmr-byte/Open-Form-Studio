import * as THREE from 'three'
import {
  detectSwingFromPointer,
  toggleSwingHand,
  toggleSwingDirection,
  generateOpening2DSvg,
  buildOpening2DThreeGroup,
  CAD_COLORS
} from './Opening2DSymbology'
import {
  buildDoor,
  buildWindow,
  type DoorOptions,
  type WindowOptions
} from './OpeningMeshBuilder'
import {
  subtractOpeningsFromWallBox,
  buildObjectMesh
} from './WallMeshBuilder'
import { Wall, WallSegmentType } from '../models/Wall'
import {
  ARCHITECTURAL_DOOR_PRESETS,
  ARCHITECTURAL_WINDOW_PRESETS,
  SILL_PRESETS,
  DOOR_STYLES,
  WINDOW_STYLES,
  type Opening
} from '../models/Opening'
import { SceneObject } from '../models/SceneObject'
import { SceneManager } from './SceneManager'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`PASS ${msg}`)
}

console.log('\n=== TESTING PUERTAS Y VENTANAS BIM CAD REDESIGN ===\n')

// ===================================================================
// MÓDULO 1: Simbología CAD en Planta 2D para Puertas y Control de Abatimiento
// ===================================================================
console.log('--- Módulo 1: Simbología 2D Puertas & Abatimiento ---')

// 1. Detección automática del puntero respecto al muro
const wallStart = new THREE.Vector3(0, 0, 0)
const wallEnd = new THREE.Vector3(5, 0, 0) // Muro a lo largo del eje X

// Cursor al interior (+Z) y cerca del inicio
const swingInLeft = detectSwingFromPointer(wallStart, wallEnd, new THREE.Vector3(1, 0, 1), 2.5)
assert(swingInLeft.swingDirection === 'in', 'Detección dirección interior (+Z)')
assert(swingInLeft.swingHand === 'left', 'Detección mano izquierda (t < centro)')

// Cursor al exterior (-Z) y pasando el centro
const swingOutRight = detectSwingFromPointer(wallStart, wallEnd, new THREE.Vector3(3.5, 0, -1), 2.5)
assert(swingOutRight.swingDirection === 'out', 'Detección dirección exterior (-Z)')
assert(swingOutRight.swingHand === 'right', 'Detección mano derecha (t > centro)')

// 2. Inversión rápida de mano y apertura (Flip [F] / [Tab])
assert(toggleSwingHand('left') === 'right', 'toggleSwingHand invierte left a right')
assert(toggleSwingHand('right') === 'left', 'toggleSwingHand invierte right a left')
assert(toggleSwingDirection('in') === 'out', 'toggleSwingDirection invierte in a out')
assert(toggleSwingDirection('out') === 'in', 'toggleSwingDirection invierte out a in')

// 3. Geometría SVG 2D de Puertas CAD
const testWall = new Wall(wallStart, wallEnd, WallSegmentType.SimpleWall, 'wall-1')
testWall.thickness = 0.20

const doorOpening: Opening = {
  id: 'door-op-1',
  wallId: 'wall-1',
  x: 2.5,
  width: 0.90,
  height: 2.10,
  sill: 0,
  type: 'door',
  materialId: null,
  swingHand: 'left',
  swingDirection: 'in'
}

const doorSvg = generateOpening2DSvg(testWall, doorOpening, {
  variant: 'simple',
  swingHand: 'left',
  swingDirection: 'in',
  isSelected: true
})

assert(doorSvg.includes('cad-door-2d'), 'SVG contiene clase cad-door-2d')
assert(doorSvg.includes(CAD_COLORS.doorGreen), 'Simbología de puerta usa verde CAD #22c55e')
assert(doorSvg.includes('Jambas'), 'SVG incluye jambas/marcos laterales')
assert(doorSvg.includes('Arco de abatimiento CAD'), 'SVG incluye arco de 90° de abatimiento')
assert(doorSvg.includes('cad-flip-controls'), 'Puerta seleccionada muestra controles interactivos de flip')

// Puerta Doble
const doubleDoorOpening: Opening = {
  ...doorOpening,
  width: 1.80,
  variant: 'doble'
}
const doubleSvg = generateOpening2DSvg(testWall, doubleDoorOpening, {
  variant: 'doble'
})
assert(doubleSvg.includes('Arco izquierdo') && doubleSvg.includes('Arco derecho'), 'Puerta doble incluye doble arco simétrico en M')

// Puerta Corrediza
const slidingSvg = generateOpening2DSvg(testWall, doorOpening, { variant: 'corrediza' })
assert(slidingSvg.includes('Hoja corrediza 1') && slidingSvg.includes('Guía de riel'), 'Puerta corrediza incluye rieles paralelos desfasados')

// Puerta Vaivén
const vaivenSvg = generateOpening2DSvg(testWall, doorOpening, { variant: 'vaiven' })
assert(vaivenSvg.includes('Arco exterior cruzado (vaivén)'), 'Puerta vaivén incluye doble arco cruzado en ambas direcciones')

// 4. Malla Three.js 2D
const three2DDoor = buildOpening2DThreeGroup(testWall, doorOpening)
assert(three2DDoor instanceof THREE.Group, 'buildOpening2DThreeGroup genera un Three.Group')
assert(three2DDoor.children.length >= 2, 'Three.Group contiene hoja y arco 2D')

// ===================================================================
// MÓDULO 2: Simbología CAD en Planta 2D para Ventanas
// ===================================================================
console.log('\n--- Módulo 2: Simbología 2D Ventanas ---')

const windowOpening: Opening = {
  id: 'win-op-1',
  wallId: 'wall-1',
  x: 2.5,
  width: 1.20,
  height: 1.20,
  sill: 0.90,
  type: 'window',
  materialId: null
}

const windowSvg = generateOpening2DSvg(testWall, windowOpening, {
  variant: 'corrediza'
})
assert(windowSvg.includes('cad-window-2d'), 'SVG contiene clase cad-window-2d')
assert(windowSvg.includes(CAD_COLORS.windowCyan), 'Ventana usa color cian CAD #06b6d4')
assert(windowSvg.includes('Antepecho continuo'), 'Ventana conserva las dos líneas exteriores continuas de mampostería')
assert(windowSvg.includes('Hoja corredera 1') && windowSvg.includes('Hoja corredera 2'), 'Ventana corrediza dibuja dos hojas escalonadas')
assert(windowSvg.includes('V 1.20m (A:0.90)'), 'Ventana incluye etiqueta de cota CAD con Vano y Antepecho')

// Ventana Fija
const fixedSvg = generateOpening2DSvg(testWall, windowOpening, { variant: 'fija' })
assert(fixedSvg.includes('Doble línea central de cristal fijo'), 'Ventana fija dibuja doble línea central de cristal')

// Ventana Abatible
const casementSvg = generateOpening2DSvg(testWall, windowOpening, { variant: 'abatible' })
assert(casementSvg.includes('Proyección abatible punteada'), 'Ventana abatible dibuja líneas punteadas de proyección')

// ===================================================================
// MÓDULO 3: Representación 3D Realista, Corte de Muro y Catálogo de Estilos
// ===================================================================
console.log('\n--- Módulo 3: Representación 3D Realista y Diseños ---')

// 1. Corte real de muro en 3D
const wallCutDoor = subtractOpeningsFromWallBox(5.0, 2.80, 0.20, [doorOpening])
assert(wallCutDoor.getAttribute('position').count > 0, 'Muro 3D con puerta perforada genera geometría limpia')

const wallCutWin = subtractOpeningsFromWallBox(5.0, 2.80, 0.20, [windowOpening])
assert(wallCutWin.getAttribute('position').count > 0, 'Muro 3D con ventana perforada genera geometría limpia')

// 2. Catálogo de Estilos de Puertas 3D
for (const style of DOOR_STYLES) {
  const result = buildDoor(doorOpening, 0.20, {
    style: style.id,
    openingAngle: 45,
    swingHand: 'right',
    swingDirection: 'out'
  })
  assert(result.geometry.getAttribute('position').count > 0, `Puerta estilo «${style.label}» (${style.id}) genera geometría 3D`)
  assert(result.materials.length > 0, `Puerta estilo «${style.label}» contiene materiales asignados`)
}

// 3. Catálogo de Estilos de Ventanas 3D
for (const style of WINDOW_STYLES) {
  const result = buildWindow(windowOpening, 0.20, {
    style: style.id,
    openingAngle: 30,
    swingHand: 'left',
    swingDirection: 'in'
  })
  assert(result.geometry.getAttribute('position').count > 0, `Ventana estilo «${style.label}» (${style.id}) genera geometría 3D`)
  assert(result.materials.length > 0, `Ventana estilo «${style.label}» contiene materiales asignados`)
}

// 4. buildObjectMesh con SceneObject de carpintería
const doorObj = new SceneObject('Puerta Principal', 'furniture')
doorObj.openingId = 'door-op-1'
doorObj.shapeId = 'opening.door'
doorObj.openingVariant = 'simple'
doorObj.doorStyle = 'conVisor'
doorObj.swingHand = 'right'
doorObj.swingDirection = 'out'
doorObj.openingAngle = 90
doorObj.size.set(0.90, 2.10, 0.20)

const mesh = buildObjectMesh(doorObj)
assert(mesh instanceof THREE.Mesh, 'buildObjectMesh devuelve THREE.Mesh para puerta con estilo y rotación')
assert(mesh.geometry.getAttribute('position').count > 0, 'Malla de puerta tiene vértices válidos')

// ===================================================================
// MÓDULO 4: Selector Rápido de Medidas Estándar Normalizadas
// ===================================================================
console.log('\n--- Módulo 4: Medidas Estándar Arquitectónicas ---')

assert(ARCHITECTURAL_DOOR_PRESETS.length >= 10, 'Catálogo de medidas de puerta contiene más de 10 normas estándar')
assert(ARCHITECTURAL_DOOR_PRESETS.some((p) => p.width === 0.65), 'Incluye estándar 0.65m Baño')
assert(ARCHITECTURAL_DOOR_PRESETS.some((p) => p.width === 0.90), 'Incluye estándar 0.90m Accesible')
assert(ARCHITECTURAL_DOOR_PRESETS.some((p) => p.width === 1.20), 'Incluye estándar 1.20m Pivote')
assert(ARCHITECTURAL_DOOR_PRESETS.some((p) => p.width === 1.80 && p.category === 'door-double'), 'Incluye puerta doble estándar 1.80m')

assert(ARCHITECTURAL_WINDOW_PRESETS.some((p) => p.width === 1.20 && p.height === 1.20), 'Incluye ventana estándar 1.20m x 1.20m')
assert(SILL_PRESETS.some((s) => s.value === 0.90), 'Incluye antepecho normal 0.90m')
assert(SILL_PRESETS.some((s) => s.value === 1.60), 'Incluye antepecho baño 1.60m')
assert(SILL_PRESETS.some((s) => s.value === 0.00), 'Incluye antepecho balcón / piso a techo 0.00m')

// Prueba de actualización reactiva en SceneManager
const scene = new SceneManager()
const wall = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 0, 0))
const opening = scene.addOpening(wall.id, {
  wallId: wall.id,
  x: 2.0,
  width: 0.90,
  height: 2.10,
  sill: 0,
  type: 'door',
  materialId: null
})

// Aplicar un preset de medida estándar (ej. 1.20m)
scene.updateOpening(wall.id, opening.id, {
  width: 1.20,
  height: 2.40,
  style: 'francesa',
  swingHand: 'right',
  swingDirection: 'out',
  openingAngle: 60
})

const updatedOp = wall.openings.find((o) => o.id === opening.id)!
assert(updatedOp.width === 1.20, 'updateOpening actualiza ancho a 1.20m')
assert(updatedOp.height === 2.40, 'updateOpening actualiza alto a 2.40m')
assert(updatedOp.style === 'francesa', 'updateOpening actualiza estilo a francesa')
assert(updatedOp.swingHand === 'right', 'updateOpening actualiza mano a right')
assert(updatedOp.swingDirection === 'out', 'updateOpening actualiza apertura a out')
assert(updatedOp.openingAngle === 60, 'updateOpening actualiza ángulo a 60°')

console.log('\nTODAS LAS PRUEBAS DE PUERTAS Y VENTANAS BIM CAD PASARON AL 100%.\n')

