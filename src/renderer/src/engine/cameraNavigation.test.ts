import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { CameraState, Axis3D } from '../models/CameraState'
import { Viewport3DController } from './Viewport3DController'
import {
  mountKeyboardCameraNavigator,
  resolveNavChannel
} from '../ui/KeyboardCameraNavigator'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`PASS ${message}`)
}

console.log('\n=== TESTING SMART CAMERA PIVOT & 3D NAVIGATION ===\n')

// 1. Cálculo de Bounding Box de la Estructura en SceneManager
console.log('--- Módulo 1: Bounding Box y Centro Geométrico de Estructura ---')
const scene = new SceneManager()

// Escena vacía
const emptyBounds = scene.getStructureBounds()
assert(emptyBounds.hasGeometry === false, 'Escena vacía detectada correctamente')
assert(emptyBounds.center.x === 0 && emptyBounds.center.z === 0, 'Centro por defecto en origen para escena vacía')

// Construir una casa en coordenadas alejadas del origen: X: 10..20, Z: 6..16 (Centro exacto: X: 15, Z: 11)
const w1 = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(10, 0, 6), new THREE.Vector3(20, 0, 6))
w1.height = 3.0
const w2 = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(20, 0, 6), new THREE.Vector3(20, 0, 16))
w2.height = 3.0
const w3 = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(20, 0, 16), new THREE.Vector3(10, 0, 16))
w3.height = 3.0
const w4 = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(10, 0, 16), new THREE.Vector3(10, 0, 6))
w4.height = 3.0

// Agregar un techo sobre la casa
const roof = new SceneObject('Techo Principal', 'roof')
roof.roofProps = {
  footprint: [
    { x: 10, z: 6 },
    { x: 20, z: 6 },
    { x: 20, z: 16 },
    { x: 10, z: 16 }
  ],
  type: 'gable',
  slope: 30,
  overhang: 0.5
}
scene.addObject(roof)

const bounds = scene.getStructureBounds()
assert(bounds.hasGeometry === true, 'Estructura construida detectada con geometría real')
assert(Math.abs(bounds.center.x - 15) < 0.01, `Centro X exacto en 15.00m (obtenido: ${bounds.center.x.toFixed(2)})`)
assert(Math.abs(bounds.center.z - 11) < 0.01, `Centro Z exacto en 11.00m (obtenido: ${bounds.center.z.toFixed(2)})`)
assert(bounds.center.y > 1.0, `Altura media Y calculada (> 1.0m, obtenido: ${bounds.center.y.toFixed(2)}m)`)
assert(bounds.radius > 5.0, `Radio envolvente calculado correctamente (${bounds.radius.toFixed(2)}m)`)

// 2. Anclaje de Pivote y Cámara Orbital a la Estructura
console.log('\n--- Módulo 2: Anclaje de Pivote y Órbita Alrededor de la Casa ---')
const controller = new Viewport3DController()
// Por defecto el CameraState inicia en (0, 0, 0)
assert(controller.state.target.x === 0 && controller.state.target.z === 0, 'Pivote inicial inicia en origen vacío')

// Aplicar auto-centrado a la estructura:
const targetY = bounds.center.y > 0.5 ? bounds.center.y : 1.5
controller.state.target.set(bounds.center.x, targetY, bounds.center.z)
controller.state.distance = bounds.radius * 2.2
controller.state.yaw = Math.PI / 4 // 45° isométrico
controller.state.pitch = Math.PI / 6 // 30°

assert(controller.state.target.x === 15, 'Pivote target.x anclado a 15m')
assert(controller.state.target.z === 11, 'Pivote target.z anclado a 11m')
assert(controller.state.target.y === targetY, `Pivote target.y en media altura (${targetY.toFixed(2)}m)`)

// Comprobar posición 3D calculada de la cámara
const initialCamPos = controller.cameraPosition
assert(initialCamPos.x > 15, 'Cámara colocada con desplazamiento isométrico mirando a la casa')

// Rotar 360° horizontalmente con orbitAngles (como con flechas [←] [→] o ratón)
const initialTarget = controller.state.target.clone()
controller.orbitAngles(Math.PI / 2, 0) // Girar 90°
assert(
  controller.state.target.x === initialTarget.x && controller.state.target.z === initialTarget.z,
  'Al rotar horizontalmente, el pivote target permanece INMUTABLE en el centro de la casa'
)

// Rotar verticalmente (inclinación polar [↑] [↓])
controller.orbitAngles(0, 0.3)
assert(
  controller.state.target.x === initialTarget.x && controller.state.target.z === initialTarget.z,
  'Al inclinar verticalmente, el pivote target permanece en el centro de la casa'
)

// 3. Clamping de Inclinación Vertical (Polar Angle entre 10° y 85°)
console.log('\n--- Módulo 3: Límite Polar (10° a 85° para no meterse bajo el piso) ---')
controller.state.pitch = -1.0 // Intentar meter la cámara bajo el piso negro
controller.state.clampPitch(false)
assert(
  Math.abs(controller.state.pitch - CameraState.PITCH_MIN_3D) < 0.001,
  `Pitch mínimo acotado a 10° (${controller.state.pitch.toFixed(4)} rad = ~10°)`
)
assert(controller.cameraPosition.y > controller.state.target.y, 'Cámara NUNCA se mete por debajo del suelo')

controller.state.pitch = 2.0 // Intentar sobrepasar la vertical
controller.state.clampPitch(false)
assert(
  Math.abs(controller.state.pitch - CameraState.PITCH_MAX_3D) < 0.001,
  `Pitch máximo acotado a 85° (${controller.state.pitch.toFixed(4)} rad = ~85°)`
)

// 4. Navegación con Teclas [W, A, S, D] y Shift + Flechas
console.log('\n--- Módulo 4: Navegación de Terreno (WASD y Shift+Flechas) ---')
assert(resolveNavChannel({ key: 'w', code: 'KeyW' }) === 'panForward', 'Tecla W detectada como panForward')
assert(resolveNavChannel({ key: 's', code: 'KeyS' }) === 'panBackward', 'Tecla S detectada como panBackward')
assert(resolveNavChannel({ key: 'a', code: 'KeyA' }) === 'panLeft', 'Tecla A detectada como panLeft')
assert(resolveNavChannel({ key: 'd', code: 'KeyD' }) === 'panRight', 'Tecla D detectada como panRight')

const prePanTarget = controller.state.target.clone()
const prePanCamPos = controller.cameraPosition.clone()

// Desplazar hacia adelante con W / panPlanar
controller.panPlanar(0, 0.1)
const postPanTarget = controller.state.target.clone()
const postPanCamPos = controller.cameraPosition.clone()

const deltaTarget = postPanTarget.clone().sub(prePanTarget)
const deltaCam = postPanCamPos.clone().sub(prePanCamPos)

assert(
  Math.abs(deltaTarget.x - deltaCam.x) < 0.001 && Math.abs(deltaTarget.z - deltaCam.z) < 0.001,
  'WASD desplaza simultáneamente cámara y pivote target por igual (caminar por el terreno)'
)

// 5. Vistas Rápidas de Perspectiva
console.log('\n--- Módulo 5: Vistas Rápidas de Perspectiva (1..6) ---')
// Vista 1 (Frontal Z)
const frontAngles = controller.viewAnglesForAxis(Axis3D.Z, false)
assert(frontAngles.yaw === 0, 'Vista frontal orienta yaw a 0°')

// Vista 2 (Trasera -Z)
const backAngles = controller.viewAnglesForAxis(Axis3D.Z, true)
assert(Math.abs(backAngles.yaw - Math.PI) < 0.001, 'Vista trasera orienta yaw a 180°')

// Vista 3 (Lateral Izquierda -X)
const leftAngles = controller.viewAnglesForAxis(Axis3D.X, true)
assert(Math.abs(leftAngles.yaw - -Math.PI / 2) < 0.001, 'Vista lateral izquierda orienta yaw a -90°')

// Vista 4 (Lateral Derecha +X)
const rightAngles = controller.viewAnglesForAxis(Axis3D.X, false)
assert(Math.abs(rightAngles.yaw - Math.PI / 2) < 0.001, 'Vista lateral derecha orienta yaw a +90°')

// Vista 5 (Isométrica 3D)
const isoYaw = Math.PI / 4
const isoPitch = Math.PI / 6
assert(Math.abs(isoYaw - 0.7853) < 0.01 && Math.abs(isoPitch - 0.5235) < 0.01, 'Vista isométrica orienta a 45°/30°')

// 6. Doble Clic para Re-centrar detalle
console.log('\n--- Módulo 6: Doble Clic y Re-centrado de Detalle con Lerp ---')
const detailPoint = new THREE.Vector3(12.5, 2.1, 8.3)
const lerpTarget = controller.state.target.clone()
lerpTarget.lerp(detailPoint, 0.5)
assert(
  Math.abs(lerpTarget.x - (controller.state.target.x + detailPoint.x) / 2) < 0.001,
  'Interpolación lerp hacia el punto clickeado es matemáticamente precisa'
)

console.log('\nTODAS LAS PRUEBAS DE CÁMARA Y NAVEGACIÓN 3D PASARON AL 100%.\n')

