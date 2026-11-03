/**
 * Pruebas unitarias de la exportación OBJ.
 *
 * - Verifica que un muro de 5 m queda en el OBJ con la geometría esperada.
 *
 * Ejecución: `npx vitest run src/renderer/src/export/obj.test.ts`
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'
import { buildExportScene } from './index'
import { exportObj } from './obj'

 describe('exportación OBJ', () => {
  it('guardaría un muro de 5 m con la geometría esperada', async () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0,0,0), new THREE.Vector3(5,0,0))

    const exported = await exportObj(
      new THREE.Scene(),
      { walls: scene.getWalls(), objects: [], levels: [] }
    )

    expect(exported).toContain('v ')
    expect(exported).toContain('f ')
    expect(exported.split('\n').length).toBeGreaterThan(5)

    const lines = exported.split('\n')
    const vertexLines = lines.filter((line) => line.startsWith('v '))
    expect(vertexLines.length).toBeGreaterThan(0)

    const vertices = vertexLines.map((line) => {
      const parts = line.trim().split(/\s+/)
      return { x: Number(parts[1]), y: Number(parts[2]), z: Number(parts[3]) }
    })

    const xs = vertices.map((v) => v.x)
    const zs = vertices.map((v) => v.z)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5, 5)
    // El muro tiene 0,20 m de espesor: la caja abarca z ∈ [−0,1; 0,1].
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.2, 5)
  })

  it('exporta un escenario vacío sin lanzar', async () => {
    const exported = await exportObj(new THREE.Scene(), { walls: [], objects: [], levels: [] })
    expect(exported.length).toBeGreaterThanOrEqual(0)
  })
})
