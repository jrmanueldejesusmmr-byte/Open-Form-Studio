/** Datos de demostración para el panel de Costos (puro, sin DOM ni Three.js).
 *
 * Construye una vivienda sencilla de dos plantas con muros, un techo a dos
 * aguas, una puerta, una ventana y algo de mobiliario, para que el panel
 * muestre cifras reales sin que el usuario tenga que dibujar a mano.
 */
import * as THREE from 'three'
import { Wall, WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { DEFAULT_ROOF_THICKNESS } from '../models/Roof'

export interface DemoScene {
  walls: Wall[]
  objects: SceneObject[]
}

/** Planta rectangular centrada en el origen, con muros perimetrales. */
function rectangularWalls(
  levelId: string,
  width: number,
  depth: number,
  height: number,
  thickness: number
): Wall[] {
  const x = width / 2
  const z = depth / 2
  const mk = (sx: number, sz: number, ex: number, ez: number): Wall => {
    const wall = new Wall(
      new THREE.Vector3(sx, 0, sz),
      new THREE.Vector3(ex, 0, ez),
      WallSegmentType.SimpleWall
    )
    wall.levelId = levelId
    wall.height = height
    wall.thickness = thickness
    wall.materialId = 'mat.brick'
    return wall
  }
  return [mk(-x, -z, x, -z), mk(x, -z, x, z), mk(x, z, -x, z), mk(-x, z, -x, -z)]
}

/**
 * Escena de demostración: dos plantas de 5 × 4 m, techo a dos aguas sobre la
 * planta alta, una puerta, una ventana y cuatro muebles. Todos los elementos
 * viven con `levelId` válido para que el takeoff los reparta por piso.
 */
export function buildDemoScene(): DemoScene {
  const walls = [...rectangularWalls('level-0', 5, 4, 2.5, 0.15)]

  // Puerta y ventana como objetos (el takeoff los detecta por nombre).
  const door = new SceneObject('Puerta principal', 'furniture')
  door.position.set(-2.5, 0, 2)
  door.size.set(0.9, 2.1, 0.1)
  door.levelId = 'level-0'

  const window = new SceneObject('Ventana salón', 'furniture')
  window.position.set(2.5, 1.1, -2)
  window.size.set(1.2, 1.2, 0.1)
  window.levelId = 'level-0'

  const chair = new SceneObject('Silla', 'furniture')
  chair.position.set(1, 0, 1)
  chair.levelId = 'level-0'

  const table = new SceneObject('Mesa', 'furniture')
  table.position.set(-1, 0, -1)
  table.levelId = 'level-0'

  // Techo a dos aguas ajustado a la huella de la planta (pendiente 30°).
  const roof = new SceneObject('Techo', 'roof')
  roof.shapeId = 'roof.gable'
  roof.levelId = 'level-0'
  roof.size.set(5, 0.4, 4)
  roof.roofProps = {
    type: 'gable',
    slope: 30,
    overhang: 0.3,
    thickness: DEFAULT_ROOF_THICKNESS,
    ridgeDir: 'x',
    footprint: [
      { x: -2.5, z: -2 },
      { x: 2.5, z: -2 },
      { x: 2.5, z: 2 },
      { x: -2.5, z: 2 }
    ],
    sourceLevelId: 'level-0'
  }

  return { walls, objects: [door, window, chair, table, roof] }
}
