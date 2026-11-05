import * as THREE from 'three'
import {
  CAD_BLOCKS,
  CAD_BLOCK_CATEGORIES,
  getCadBlock,
  isCadBlock,
  type CadBlockCategory
} from './cadBlocksData'
import { generateBlock2DSymbol, renderCadBlock2DSvg } from './cadBlocks2D'
import { buildCadBlock3DGeometry } from './cadBlocks3D'
import { SceneObject } from '../models/SceneObject'
import { SceneManager } from '../engine/SceneManager'
import { BimMasterTable } from '../bim/BimMasterTable'
import { Wall, WallSegmentType } from '../models/Wall'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
  console.log(`PASS ${msg}`)
}

console.log('\n=== TESTING CATALOGO DE BLOQUES CAD ESENCIALES (2D + 3D) & BIM COSTOS ===\n')

// 1. Verificación de las 7 Categorías y Contenido
console.log('--- Módulo 1: Las 7 Categorías del Catálogo ---')
assert(CAD_BLOCK_CATEGORIES.length === 7, 'Existen exactamente 7 categorías principales de bloques')

const categoryIds: CadBlockCategory[] = [
  'living',
  'dining',
  'bedrooms',
  'bathrooms',
  'kitchen',
  'office',
  'exterior'
]

for (const catId of categoryIds) {
  const catBlocks = CAD_BLOCKS.filter((b) => b.category === catId)
  assert(catBlocks.length >= 5, `Categoría «${catId}» contiene al menos 5 bloques arquitectónicos (${catBlocks.length} encontrados)`)
}

// 2. Muebles de Sala
console.log('\n--- Módulo 2: Sala y Estar (Living Room) ---')
const sofa3 = getCadBlock('furn.living.sofa3')
assert(sofa3 !== undefined, 'Sofá de 3 plazas presente en catálogo')
assert(sofa3!.defaultPrice === 650, 'Sofá 3 plazas tiene precio USD real ($650)')
const sofaL = getCadBlock('furn.living.sofaL')
assert(sofaL !== undefined, 'Sofá en L (Seccional) presente')
const piano = getCadBlock('furn.living.piano')
assert(piano !== undefined, 'Piano acústico presente')

// 3. Comedor y Desayunador
console.log('\n--- Módulo 3: Comedor y Desayunador (Dining) ---')
const d4 = getCadBlock('furn.dining.rect4')
const d6 = getCadBlock('furn.dining.rect6')
const d8 = getCadBlock('furn.dining.rect8')
const d10 = getCadBlock('furn.dining.rect10')
const dRound = getCadBlock('furn.dining.round6')
const dBar = getCadBlock('furn.dining.bar')
assert(d4 !== undefined && d6 !== undefined && d8 !== undefined && d10 !== undefined, 'Comedores rectangulares para 4, 6, 8 y 10 personas disponibles')
assert(dRound !== undefined, 'Comedor circular para 6 personas disponible')
assert(dBar !== undefined, 'Barra desayunadora con bancos altos disponible')

// 4. Dormitorios
console.log('\n--- Módulo 4: Dormitorios (Bedrooms) ---')
const bSingle = getCadBlock('furn.bed.single')
const bQueen = getCadBlock('furn.bed.queen')
const bKing = getCadBlock('furn.bed.king')
const bBunk = getCadBlock('furn.bed.bunk')
const bCloset = getCadBlock('furn.bed.closet')
assert(bSingle !== undefined && bQueen !== undefined && bKing !== undefined, 'Camas Individual, Queen y King Size presentes')
assert(bBunk !== undefined, 'Litera / Camarote presente')
assert(bCloset !== undefined, 'Clóset empotrado presente')

// 5. Baños y Sanitarios
console.log('\n--- Módulo 5: Baños y Sanitarios (Plumbing) ---')
const toilet = getCadBlock('furn.bath.toilet')
const sinkPedestal = getCadBlock('furn.bath.sinkPedestal')
const vanityDouble = getCadBlock('furn.bath.vanityDouble')
const shower = getCadBlock('furn.bath.shower')
const bathtub = getCadBlock('furn.bath.bathtub')
const jacuzzi = getCadBlock('furn.bath.jacuzzi')
assert(toilet !== undefined, 'Inodoro / WC presente')
assert(toilet!.defaultPrice === 185, 'WC tiene precio real USD $185')
assert(sinkPedestal !== undefined, 'Lavamanos de pedestal presente')
assert(vanityDouble !== undefined, 'Vanity doble presente')
assert(shower !== undefined && bathtub !== undefined && jacuzzi !== undefined, 'Ducha mampara 0.90x0.90m, bañera y jacuzzi esquinero presentes')

// 6. Cocina y Lavandería
console.log('\n--- Módulo 6: Cocina y Lavandería (Kitchen & Laundry) ---')
const sink2 = getCadBlock('furn.kitchen.sink2')
const stove4 = getCadBlock('furn.kitchen.stove4')
const stove6 = getCadBlock('furn.kitchen.stove6')
const fridge2 = getCadBlock('furn.kitchen.fridge2')
const island = getCadBlock('furn.kitchen.island')
const washer = getCadBlock('furn.kitchen.washer')
const washTub = getCadBlock('furn.kitchen.washTub')
assert(sink2 !== undefined, 'Fregadero 2 cubetas con escurridor presente')
assert(stove4 !== undefined && stove6 !== undefined, 'Estufas 4 y 6 quemadores presentes')
assert(fridge2 !== undefined, 'Refrigerador Side-by-Side presente')
assert(island !== undefined && washer !== undefined && washTub !== undefined, 'Isla, lavadora y pila de lavar presentes')

// 7. Oficina y Estudio
console.log('\n--- Módulo 7: Oficina y Estudio (Office) ---')
const deskPc = getCadBlock('furn.office.deskPc')
const deskL = getCadBlock('furn.office.deskL')
const meeting = getCadBlock('furn.office.meeting')
const bookcase = getCadBlock('furn.office.bookcase')
assert(deskPc !== undefined && deskL !== undefined, 'Escritorio con PC y Escritorio en L presentes')
assert(meeting !== undefined, 'Mesa de juntas 8 personas presente')
assert(bookcase !== undefined, 'Librero / Estantería presente')

// 8. Vehículos, Vegetación y Escala Humana
console.log('\n--- Módulo 8: Vehículos, Vegetación y Escala Humana ---')
const sedan = getCadBlock('furn.ext.sedan')
const suv = getCadBlock('furn.ext.suv')
const motorcycle = getCadBlock('furn.ext.motorcycle')
const bicycle = getCadBlock('furn.ext.bicycle')
const tree = getCadBlock('furn.ext.tree')
const palm = getCadBlock('furn.ext.palm')
const human = getCadBlock('furn.ext.human')
assert(sedan !== undefined && suv !== undefined, 'Auto Sedán y SUV presentes')
assert(motorcycle !== undefined && bicycle !== undefined, 'Moto y Bicicleta presentes')
assert(tree !== undefined && palm !== undefined, 'Árbol frondoso y Palmera presentes')
assert(human !== undefined, 'Escala Humana 1.70m presente')

// 9. Simbología Vectorial 2D CAD
console.log('\n--- Módulo 9: Simbología Técnica 2D CAD (Planta) ---')
for (const b of CAD_BLOCKS) {
  const svg = generateBlock2DSymbol(b.blockType, b.dimensions.width, b.dimensions.depth)
  assert(svg.length > 30, `Bloque «${b.label}» genera marcado 2D SVG válido`)
}

const testObj = new SceneObject('Mi Inodoro', 'furniture')
testObj.shapeId = 'furn.bath.toilet'
testObj.size.set(0.5, 0.8, 0.7)
testObj.position.set(3.5, 0, 2.0)
const renderedSvg = renderCadBlock2DSvg(testObj)
assert(renderedSvg.includes('cad-block-2d'), 'renderCadBlock2DSvg genera grupo con clase cad-block-2d')
assert(renderedSvg.includes('translate(3.5, 2)'), 'renderCadBlock2DSvg posiciona en coordenadas de planta')

// 10. Geometría 3D Compuesta en Three.js
console.log('\n--- Módulo 10: Geometría 3D Compuesta en Three.js ---')
for (const b of CAD_BLOCKS) {
  const size = new THREE.Vector3(b.dimensions.width, b.dimensions.height, b.dimensions.depth)
  const geo = buildCadBlock3DGeometry(b.id, size)
  assert(geo !== null, `Bloque «${b.label}» genera geometría 3D BufferGeometry`)
  assert(geo!.getAttribute('position').count > 10, `Geometría 3D de «${b.label}» tiene vértices válidos`)
}

// 11. Integración Financiera y Reactiva con BimMasterTable
console.log('\n--- Módulo 11: Integración con Tabla Maestra BIM y Costos ---')
const scene = new SceneManager()

// Crear muro de 10m de largo, 2.5m de alto, 0.15m de espesor
const wall = scene.addWall(
  WallSegmentType.SimpleWall,
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(10, 0, 0)
)
wall.height = 2.5
wall.thickness = 0.15

// Agregar ventana y puerta
scene.addOpening(wall.id, {
  type: 'door',
  x: 2.5,
  width: 0.9,
  height: 2.1,
  sill: 0,
  materialId: null
})

scene.addOpening(wall.id, {
  type: 'window',
  x: 6.5,
  width: 1.2,
  height: 1.2,
  sill: 0.9,
  materialId: null
})

// Colocar un bloque de catálogo (Sofá 3 plazas)
const placedSofa = new SceneObject('Sofá Principal', 'furniture')
placedSofa.shapeId = 'furn.living.sofa3'
placedSofa.size.set(2.1, 0.85, 0.9)
scene.addObject(placedSofa)

// Colocar Inodoro
const placedWc = new SceneObject('WC Baño', 'furniture')
placedWc.shapeId = 'furn.bath.toilet'
placedWc.size.set(0.5, 0.8, 0.7)
scene.addObject(placedWc)

const bimTable = new BimMasterTable(scene)
const rows = bimTable.getRows()
const totals = bimTable.getTotals()

assert(rows.length >= 5, `Tabla BIM contiene ${rows.length} filas (Muro, Puerta, Ventana, Sofá, Inodoro)`)

const wallRow = rows.find((r) => r.category === 'Muro')
assert(wallRow !== undefined, 'Fila de Muro presente en tabla')
assert(wallRow!.unitPrice === 28.5, `Precio unitario muro por defecto es $28.50 (valor actual: $${wallRow!.unitPrice})`)
assert(wallRow!.subtotalCost > 0, `Subtotal muro calculado en $${wallRow!.subtotalCost}`)

const doorRow = rows.find((r) => r.category === 'Puerta')
assert(doorRow !== undefined, 'Puerta cuantificada y presupuestada como fila independiente')
assert(doorRow!.unitPrice === 145, `Precio unitario puerta es $145.00 (valor: $${doorRow!.unitPrice})`)

const windowRow = rows.find((r) => r.category === 'Ventana')
assert(windowRow !== undefined, 'Ventana cuantificada y presupuestada')
assert(windowRow!.unitPrice === 110, `Precio unitario ventana es $110.00 (valor: $${windowRow!.unitPrice})`)

const sofaRow = rows.find((r) => r.id === placedSofa.id)
assert(sofaRow !== undefined, 'Sofá registrado automáticamente en la Tabla Maestra BIM')
assert(sofaRow!.category === 'Mobiliario', 'Sofá clasificado en categoría Mobiliario')
assert(sofaRow!.unitPrice === 650, `Sofá tiene precio catálogo $650 (valor: $${sofaRow!.unitPrice})`)

const wcRow = rows.find((r) => r.id === placedWc.id)
assert(wcRow !== undefined, 'Inodoro registrado automáticamente en Tabla BIM')
assert(wcRow!.category === 'Sanitario', 'Inodoro clasificado en categoría Sanitario')
assert(wcRow!.unitPrice === 185, `Inodoro tiene precio $185 (valor: $${wcRow!.unitPrice})`)

// Verificar Totales y KPIs
assert(totals.totalBudgetCost > 1500, `Presupuesto Total Estimado calculado en $${totals.totalBudgetCost} USD (nunca $0.00)`)
assert(totals.doorCountTotal === 1, 'Conteo de puertas es 1')
assert(totals.windowCountTotal === 1, 'Conteo de ventanas es 1')
assert(totals.openingsCountTotal === 2, 'Total de aberturas es 2')
assert(totals.furnitureCountTotal === 2, 'Conteo de mobiliario/sanitarios es 2')

// Edición en vivo de precio unitario
const prevTotal = totals.totalBudgetCost
const updateOk = bimTable.updateRow(wallRow!.id, 'unitPrice', 35.0)
assert(updateOk === true, 'updateRow de unitPrice a $35.00 exitoso')

const updatedTotals = bimTable.getTotals()
const updatedWallRow = bimTable.getRows().find((r) => r.id === wallRow!.id)
assert(updatedWallRow!.unitPrice === 35.0, 'Fila refleja precio unitario actualizado a $35.00')
assert(updatedTotals.totalBudgetCost > prevTotal, `Presupuesto Total se recalculó instantáneamente a $${updatedTotals.totalBudgetCost} USD`)

console.log('\nTODAS LAS PRUEBAS DE CATÁLOGO CAD Y TABLA MAESTRA BIM PASARON AL 100%.\n')
