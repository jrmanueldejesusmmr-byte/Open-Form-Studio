/** Tests de techos por área: geometría, altura por piso y vínculo techo-piso.
 *
 * Se ejecutan con esbuild igual que los de costos:
 *   node scripts/_run-costs-tests.mjs (añadido a la lista TESTS)
 */
import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import { buildFittedRoofGeometry, eaveElevation, roofTotalArea } from '../engine/RoofBuilder'
import { WallSegmentType } from '../models/Wall'

let failed = 0

function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name} ${extra ?? ''}`)
  }
}

function rectFoot(w: number, d: number): Array<{ x: number; z: number }> {
  return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }]
}

function lFoot(): Array<{ x: number; z: number }> {
  // L de 6×4 con muesca de 3×2: área = 24 − 6 = 18 m².
  return [
    { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 },
    { x: 3, z: 2 }, { x: 3, z: 4 }, { x: 0, z: 4 }
  ]
}

function addRectWalls(scene: SceneManager, pts: Array<{ x: number; z: number }>, levelId: string): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    scene.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(a.x, 0, a.z),
      new THREE.Vector3(b.x, 0, b.z),
      false,
      levelId
    )
  }
}

// Geometría: rectángulo y L generan malla válida con el ancla esperada.
{
  const g = buildFittedRoofGeometry({ footprint: rectFoot(6, 4), type: 'gable', slope: 30, overhang: 0.5, thickness: 0.15, ridgeDir: 'x' })
  check('gable 6x4 genera geometría', !!g && g.geometry.getAttribute('position').count > 0)
  // Ancla = mínimo del bbox con voladizo: (−0.5, −0.5).
  check('gable 6x4 ancla (−0.5,−0.5)', !!g && Math.abs(g.anchor.x + 0.5) < 1e-9 && Math.abs(g.anchor.z + 0.5) < 1e-9, JSON.stringify(g?.anchor))
  // Cumbrera = (4/2+0.5) × tan(30°) ≈ 1.44337567297.
  check('gable 6x4 cumbrera 1.4433', !!g && Math.abs(g.ridgeHeight - 2.5 * Math.tan(Math.PI / 6)) < 1e-9, String(g?.ridgeHeight))
}

{
  const g = buildFittedRoofGeometry({ footprint: lFoot(), type: 'gable', slope: 30, overhang: 0.3, thickness: 0.15, ridgeDir: 'x' })
  check('gable en L genera geometría', !!g && g.geometry.getAttribute('position').count > 0)
  const hip = buildFittedRoofGeometry({ footprint: rectFoot(5, 4), type: 'hip', slope: 30, overhang: 0.3, thickness: 0.15, ridgeDir: 'x' })
  check('hip rectangular genera geometría', !!hip && hip.geometry.getAttribute('position').count > 0)
  const flat = buildFittedRoofGeometry({ footprint: rectFoot(5, 4), type: 'flat', slope: 0, overhang: 0.3, thickness: 0.15, ridgeDir: 'x' })
  check('plana genera losa', !!flat && Math.abs(flat.ridgeHeight - 0.15) < 1e-9)
}

// Área con aleros: 6×4 a 30° con 0.5 → 37.7128129211 (cálculo a mano).
{
  check('área 6x4 30° + alero 0.5', Math.abs(roofTotalArea(rectFoot(6, 4), 30, 0.5) - 37.7128129211) < 1e-6)
  // L de 18 m² en planta a 30° sin alero: 18 / cos(30°) ≈ 20.7846.
  check('área L 30° sin alero', Math.abs(roofTotalArea(lFoot(), 30, 0) - 18 / Math.cos(Math.PI / 6)) < 1e-9)
}

// Altura dinámica: elevación + altura del piso origen (1, 2, 3 y 10 pisos).
{
  for (const n of [1, 2, 3, 10]) {
    const scene = new SceneManager()
    for (let i = 1; i < n; i++) scene.addLevel()
    const top = scene.getLevels()[scene.getLevels().length - 1]
    addRectWalls(scene, rectFoot(6, 4), top.id)
    const roof = scene.createRoof({ auto: true, type: 'gable', slope: 30, overhang: 0.5, levelId: top.id })
    const expected = eaveElevation(top.elevation, top.height)
    check(`cota techo con ${n} piso(s) = ${expected.toFixed(1)}`, !!roof && Math.abs(roof.position.y - expected) < 1e-9, String(roof?.position.y))
  }
}

// Vínculo techo-piso: se mueve con el piso y se borra con él.
{
  const scene = new SceneManager()
  const l0 = scene.getActiveLevel()
  addRectWalls(scene, rectFoot(6, 4), l0.id)
  const roof = scene.createRoof({ auto: true, type: 'gable', slope: 30, overhang: 0.3, levelId: l0.id })
  check('techo creado en piso 0', !!roof)
  // Cambiar la altura del piso recoloca la cota del techo.
  scene.updateLevel(l0.id, { height: 3.2 })
  const after = scene.getLevel(l0.id)
  check('techo sigue al piso (3.2)', !!roof && !!after && Math.abs(roof.position.y - (after.elevation + after.height)) < 1e-9, String(roof?.position.y))
  // Borrar el piso borra el techo con él.
  const l1 = scene.addLevel()
  void l1
  scene.removeLevel(l0.id)
  check('techo borrado con su piso', !!roof && scene.getObject(roof.id) === undefined)
}

// Duplicar piso copia el techo con su contorno y la cota del piso nuevo.
{
  const scene = new SceneManager()
  const l0 = scene.getActiveLevel()
  addRectWalls(scene, rectFoot(4, 3), l0.id)
  const roof = scene.createRoof({ auto: true, type: 'hip', slope: 25, overhang: 0.4, levelId: l0.id })
  check('techo origen creado', !!roof)
  const dst = scene.addLevel()
  scene.updateLevel(dst.id, { height: l0.height })
  // Copia manual igual que duplicar_planta (misma lógica, sin IA).
  const copy = scene.createRoof({
    footprint: roof?.roofProps?.footprint,
    auto: false,
    type: 'hip',
    slope: 25,
    overhang: 0.4,
    thickness: 0.15,
    levelId: dst.id
  })
  check('techo copiado al piso nuevo', !!copy && copy.levelId === dst.id)
  const lvl = scene.getLevel(dst.id)
  check('copia en la cota del piso nuevo', !!copy && !!lvl && Math.abs(copy.position.y - (lvl.elevation + lvl.height)) < 1e-9)
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exitCode = 1
} else {
  console.log('All roof tests passed')
}
