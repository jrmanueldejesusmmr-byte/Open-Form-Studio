import { measureWall, WallOpening, roofInclinedArea, roofTotalArea, takeoffScene } from './takeoff'
import type { Wall } from '../models/Wall'
import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'
import * as THREE from 'three'
import { SceneObject } from '../models/SceneObject'

let failed = 0

function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name} ${extra ?? ''}`)
  }
}

// Ejemplo del usuario, con la fórmula real de volumen.
{
  // Objeto mínimo con lo que `measureWall` necesita; se completa como `Wall`
  // completo (con `start`/`end`) para que sea asignable al tipo del módulo.
  const wall = {
    id: 'w-1',
    type: 'SimpleWall',
    length: 5,
    start: { distanceTo: () => 5 },
    end: {},
    height: 2.5,
    thickness: 0.15,
    color: 0,
    aiControlled: true,
    materialId: null,
    levelId: 'level-0',
    isSelected: false
  } as unknown as Wall
  const opening: WallOpening = { doorArea: 0.9 * 2.1, windowArea: 0 }
  const m = measureWall(wall, opening)
  check('grossArea (5*2.5)', Math.abs(m.grossArea - 12.5) < 1e-9)
  check('netArea (12.5-1.89)', Math.abs(m.netArea - 10.61) < 1e-9)
  // Volumen neto = 5*2.5*0.15 − (0.9*2.1)*0.15 = 1.875 − 0.2835 = 1.5915 ≈ 1.59.
  check('volume neto con puerta descontada (1.59)', Math.abs(m.volume - 1.5915) < 1e-9, String(m.volume))

  const mNo = measureWall(wall)
  check('noOpening net = gross', Math.abs(mNo.grossArea - mNo.netArea) < 1e-9)
  check('noOpening volume = grossVolume (1.875)', Math.abs(mNo.volume - 1.875) < 1e-9)
}

// Inclinación de techo.
{
  const footprint = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }]
  // plano = 12; pendiente 60°: cos(60°) = 0.5 => 24 m² inclinada.
  check('roofInclinedArea 60°', Math.abs(roofInclinedArea(footprint, 60) - 24) < 1e-9)
  // pendiente 30°: cos(30°) ≈ 0.8660254 => 12 / 0.8660254 ≈ 13.8564 m².
  check('roofInclinedArea 30°', Math.abs(roofInclinedArea(footprint, 30) - 12 / Math.cos(Math.PI / 6)) < 1e-9)
  // pendiente 0° (plana): el área inclinada coincide con la de planta (12).
  check('roofInclinedArea 0° = planta', Math.abs(roofInclinedArea(footprint, 0) - 12) < 1e-9)
}

// Ejemplo pedido: rectángulo 6×4 m, pendiente 30°, alero 0.5 m.
// Cálculo a mano:
//   área en planta = 6 × 4 = 24 m².
//   área inclinada = 24 / cos(30°) = 24 / 0.86602540378 ≈ 27.7128129211 m².
//   perímetro = 2 × (6 + 4) = 20 m; banda de alero = 20 × 0.5 = 10 m².
//   total = 27.7128129211 + 10 = 37.7128129211 m².
{
  const rect6x4 = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }]
  const expected = 24 / Math.cos(Math.PI / 6) + 20 * 0.5
  check('roofTotalArea 6x4 30° alero 0.5 (37.71)', Math.abs(roofTotalArea(rect6x4, 30, 0.5) - expected) < 1e-9, String(roofTotalArea(rect6x4, 30, 0.5)))
  check('roofTotalArea 6x4 valor manual', Math.abs(roofTotalArea(rect6x4, 30, 0.5) - 37.7128129211) < 1e-6)
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exitCode = 1
} else {
  console.log('All takeoff tests passed')
}

// -----------------------------------------------------------------
// Casa de prueba 10 x 8 m con división interior (requisito manual).
// -----------------------------------------------------------------

function house10x8(scene: SceneManager): void {
  // Perímetro de 10 x 8 (eje Z = 8 m).
  const mk = (start: THREE.Vector3, end: THREE.Vector3): void => {
    const wall = scene.addWall(WallSegmentType.SimpleWall, start, end)
    wall.height = 2.8
    wall.thickness = 0.2
  }
  mk(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0))
  mk(new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 0, 8))
  mk(new THREE.Vector3(10, 0, 8), new THREE.Vector3(0, 0, 8))
  mk(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, 0))
  // División interior paralela a los extremos (dirección Z).
  mk(new THREE.Vector3(3, 0, 0), new THREE.Vector3(3, 0, 8))
}

{
  const scene = new SceneManager()
  house10x8(scene)
  const takeoff = takeoffScene(scene, {})
  check('casa 10x8: 5 muros', takeoff.walls.length === 5, String(takeoff.walls.length))
  check('casa 10x8: 44 m lineales', Math.abs(takeoff.walls.reduce((s, w) => s + w.length, 0) - 44) < 1e-9, String(takeoff.walls.reduce((s, w) => s + w.length, 0)))
  // Altura 2.8 m, grosor 0.2 m -> volumen total de los muros = 44 * 2.8 * 0.2 = 24.64 m³.
  check('casa 10x8: volumen total muros (24.64)', Math.abs(takeoff.walls.reduce((s, w) => s + w.volume, 0) - 24.64) < 1e-9, String(takeoff.walls.reduce((s, w) => s + w.volume, 0)))
}