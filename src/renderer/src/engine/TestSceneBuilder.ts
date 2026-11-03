import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'

function createWall(
  scene: SceneManager,
  start: THREE.Vector3,
  end: THREE.Vector3,
  thickness: number,
  height: number,
  materialId: string
) {
  const wall = scene.addWall(WallSegmentType.SimpleWall, start, end)
  wall.thickness = thickness
  wall.height = height
  scene.setWallMaterial(wall.id, materialId)
  return wall
}

/**
 * Generador de la escena de verificación "Casa de prueba" (Fase 1 · Requisito A4).
 *
 * Incluye:
 * - Muros de ladrillo rústico (perimetrales) y estuco fino (fachada frontal e interior).
 * - Piso de madera natural con juntas de duela a escala métrica real.
 * - Techo a dos aguas con teja de barro curva española.
 * - 2 puertas (principal exterior de roble e interior de pino).
 * - 3 ventanas de vidrio templado transparente y carpintería.
 * - Mobiliario básico (sofá, sillón, mesa de centro, cama, mesa de comedor, silla, lámpara, planta).
 * - Cerca perimetral de madera en el jardín frontal con camino de grava y césped.
 */
export function buildTestHouseScene(scene: SceneManager): void {
  scene.clear()

  /* ---------- Muros exteriores y divisiones ---------- */

  // Muro posterior (Sur): 8m de largo, material ladrillo
  createWall(scene, new THREE.Vector3(0, 0, 0), new THREE.Vector3(8, 0, 0), 0.20, 2.80, 'mat.brick')

  // Muro lateral Oeste: 6m de largo, material ladrillo
  createWall(scene, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 6), 0.20, 2.80, 'mat.brick')

  // Muro lateral Este: 6m de largo, material ladrillo
  createWall(scene, new THREE.Vector3(8, 0, 0), new THREE.Vector3(8, 0, 6), 0.20, 2.80, 'mat.brick')

  // Muro frontal Norte continuo: 8m de largo, material estuco (se perfora con puerta y ventana)
  createWall(scene, new THREE.Vector3(0, 0, 6), new THREE.Vector3(8, 0, 6), 0.20, 2.80, 'mat.stucco')

  // Muro interior divisorio (distribuidor sala / dormitorio): 6m de largo, estuco (se perfora con puerta interior)
  createWall(scene, new THREE.Vector3(3.6, 0, 0), new THREE.Vector3(3.6, 0, 6), 0.15, 2.80, 'mat.stucco')

  /* ---------- Suelos y jardín ---------- */

  // Césped exterior
  const lawn = new SceneObject('Jardín frontal', 'furniture')
  lawn.size = new THREE.Vector3(12, 0.05, 10)
  lawn.position = new THREE.Vector3(4, -0.06, 5)
  lawn.materialId = 'mat.grass'
  scene.addObject(lawn)

  // Camino de acceso de grava hacia la entrada
  const path = new SceneObject('Camino de acceso', 'furniture')
  path.size = new THREE.Vector3(1.3, 0.06, 2.5)
  path.position = new THREE.Vector3(3.65, -0.04, 7.25)
  path.materialId = 'mat.gravel'
  scene.addObject(path)

  // Piso interior de madera (duela ~12.5 cm)
  const floor = new SceneObject('Piso de madera', 'furniture')
  floor.size = new THREE.Vector3(8, 0.10, 6)
  floor.position = new THREE.Vector3(4, -0.05, 3)
  floor.materialId = 'mat.wood'
  scene.addObject(floor)

  /* ---------- Cubierta de tejas ---------- */

  const roof = new SceneObject('Techo a dos aguas', 'roof')
  roof.shapeId = 'roof.gable'
  roof.size = new THREE.Vector3(8.6, 1.5, 6.6)
  roof.position = new THREE.Vector3(4, 2.80, 3)
  roof.materialId = 'mat.terracotta'
  scene.addObject(roof)

  /* ---------- Puertas (perforación booleana en muro + carpintería 3D + manija) ---------- */

  // Puerta principal (fachada norte)
  const frontDoor = new SceneObject('Puerta principal', 'shape')
  frontDoor.shapeId = 'opening.door'
  frontDoor.openingVariant = 'simple'
  frontDoor.size = new THREE.Vector3(1.0, 2.15, 0.20)
  frontDoor.position = new THREE.Vector3(2.2, 0, 6.0)
  frontDoor.materialId = 'mat.oak'
  scene.addObject(frontDoor)

  // Puerta interior (muro divisorio)
  const innerDoor = new SceneObject('Puerta interior', 'shape')
  innerDoor.shapeId = 'opening.door'
  innerDoor.openingVariant = 'simple'
  innerDoor.size = new THREE.Vector3(0.9, 2.1, 0.15)
  innerDoor.position = new THREE.Vector3(3.6, 0, 4.8)
  innerDoor.materialId = 'mat.pine'
  scene.addObject(innerDoor)

  /* ---------- Ventanas (perforación booleana en muro + marco + cristal físico PBR) ---------- */

  // Ventana 1 (Fachada norte)
  const win1 = new SceneObject('Ventana frontal', 'shape')
  win1.shapeId = 'opening.window.double'
  win1.openingVariant = 'dosHojas'
  win1.size = new THREE.Vector3(1.6, 1.2, 0.20)
  win1.position = new THREE.Vector3(6.0, 0.9, 6.0)
  win1.materialId = 'mat.glass'
  scene.addObject(win1)

  // Ventana 2 (Fachada lateral este)
  const win2 = new SceneObject('Ventana este', 'shape')
  win2.shapeId = 'opening.window.double'
  win2.openingVariant = 'dosHojas'
  win2.size = new THREE.Vector3(1.6, 1.2, 0.20)
  win2.position = new THREE.Vector3(8.0, 0.9, 3.0)
  win2.materialId = 'mat.glass'
  scene.addObject(win2)

  // Ventana 3 (Fachada lateral oeste)
  const win3 = new SceneObject('Ventana oeste', 'shape')
  win3.shapeId = 'opening.window.double'
  win3.openingVariant = 'dosHojas'
  win3.size = new THREE.Vector3(1.6, 1.2, 0.20)
  win3.position = new THREE.Vector3(0.0, 0.9, 3.8)
  win3.materialId = 'mat.glass'
  scene.addObject(win3)

  /* ---------- Mobiliario interior ---------- */

  // Sala de estar (zona oeste)
  const sofa = new SceneObject('Sofá sala', 'furniture')
  sofa.shapeId = 'furn.sofa'
  sofa.size = new THREE.Vector3(1.9, 0.85, 0.85)
  sofa.position = new THREE.Vector3(1.6, 0, 4.6)
  sofa.materialId = 'mat.wood'
  scene.addObject(sofa)

  const coffeeTable = new SceneObject('Mesa de centro', 'furniture')
  coffeeTable.shapeId = 'furn.table'
  coffeeTable.size = new THREE.Vector3(1.1, 0.45, 0.65)
  coffeeTable.position = new THREE.Vector3(1.6, 0, 3.3)
  coffeeTable.materialId = 'mat.walnut'
  scene.addObject(coffeeTable)

  const armchair = new SceneObject('Sillón individual', 'furniture')
  armchair.shapeId = 'furn.armchair'
  armchair.size = new THREE.Vector3(0.9, 0.85, 0.85)
  armchair.position = new THREE.Vector3(1.6, 0, 2.0)
  armchair.materialId = 'mat.wood'
  scene.addObject(armchair)

  // Dormitorio / estudio (zona este)
  const bed = new SceneObject('Cama matrimonial', 'furniture')
  bed.shapeId = 'furn.bed'
  bed.size = new THREE.Vector3(1.6, 0.85, 2.0)
  bed.position = new THREE.Vector3(5.8, 0, 4.6)
  bed.materialId = 'mat.wood'
  scene.addObject(bed)

  const desk = new SceneObject('Escritorio', 'furniture')
  desk.shapeId = 'furn.desk'
  desk.size = new THREE.Vector3(1.3, 0.75, 0.7)
  desk.position = new THREE.Vector3(5.8, 0, 1.8)
  desk.materialId = 'mat.oak'
  scene.addObject(desk)

  const chair = new SceneObject('Silla', 'furniture')
  chair.shapeId = 'furn.chair'
  chair.size = new THREE.Vector3(0.5, 0.85, 0.5)
  chair.position = new THREE.Vector3(5.8, 0, 1.0)
  chair.materialId = 'mat.walnut'
  scene.addObject(chair)

  const lamp = new SceneObject('Lámpara de pie', 'furniture')
  lamp.shapeId = 'furn.lamp'
  lamp.size = new THREE.Vector3(0.4, 1.6, 0.4)
  lamp.position = new THREE.Vector3(7.3, 0, 1.0)
  lamp.materialId = 'mat.metal-pot'
  scene.addObject(lamp)

  const plant = new SceneObject('Planta decorativa', 'furniture')
  plant.shapeId = 'furn.plant'
  plant.size = new THREE.Vector3(0.5, 1.2, 0.5)
  plant.position = new THREE.Vector3(7.3, 0, 5.2)
  scene.addObject(plant)

  /* ---------- Cerca perimetral ---------- */

  // Cerca frontal tramo izquierdo
  createWall(scene, new THREE.Vector3(-1.0, 0, 8.5), new THREE.Vector3(2.8, 0, 8.5), 0.10, 1.00, 'mat.wood')

  // Cerca frontal tramo derecho (cancela de entrada entre 2.8 y 4.5)
  createWall(scene, new THREE.Vector3(4.5, 0, 8.5), new THREE.Vector3(9.0, 0, 8.5), 0.10, 1.00, 'mat.wood')

  // Cerca lateral Oeste
  createWall(scene, new THREE.Vector3(-1.0, 0, 6.0), new THREE.Vector3(-1.0, 0, 8.5), 0.10, 1.00, 'mat.wood')

  // Cerca lateral Este
  createWall(scene, new THREE.Vector3(9.0, 0, 6.0), new THREE.Vector3(9.0, 0, 8.5), 0.10, 1.00, 'mat.wood')
}

