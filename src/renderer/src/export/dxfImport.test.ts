/**
 * Pruebas de la importación DXF (Fase 4).
 *
 * Verifica el camino de vuelta exportar→importar (un muro de 5 m vuelve
 * como un muro de 5 m con su espesor), la lectura de DXF genéricos
 * (línea = eje de muro), las unidades $INSUNITS y el filtrado por capas.
 *
 * Ejecución: `npx vitest run src/renderer/src/export/dxfImport.test.ts`
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { SceneManager } from '../engine/SceneManager'
import { HistoryManager } from '../engine/HistoryManager'
import { WallSegmentType } from '../models/Wall'
import { buildDxf, collectPlanSegments } from './dxf'
import { applyDxfImport, inferWalls, insUnitsToMeters, parseDxf } from './dxfImport'

function sceneWithWalls(specs: Array<[[number, number, number], [number, number, number]]>): SceneManager {
  const scene = new SceneManager()
  for (const [start, end] of specs) {
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(...start), new THREE.Vector3(...end))
  }
  return scene
}

describe('importación DXF', () => {
  it('camino de vuelta: un muro de 5 m vuelve como un muro de 5 m', () => {
    const scene = sceneWithWalls([[[0, 0, 0], [5, 0, 0]]])
    const context = { walls: scene.getWalls(), objects: [], levels: scene.getLevels() }
    const dxf = buildDxf(collectPlanSegments(context))

    const plan = inferWalls(parseDxf(dxf))
    expect(plan.skipped).toBe(0)
    expect(plan.walls).toHaveLength(1)
    const [wall] = plan.walls
    const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ)
    expect(length).toBeCloseTo(5, 6)
    expect(wall.thickness).toBeCloseTo(0.2, 6)
  })

  it('DXF genérico (AutoCAD): cada línea es el eje de un muro', () => {
    const dxf = [
      '0\nSECTION\n2\nENTITIES',
      '0\nLINE\n8\n0\n10\n1.0\n20\n2.0\n30\n0.0\n11\n4.0\n21\n6.0\n31\n0.0',
      '0\nENDSEC\n0\nEOF\n'
    ].join('\n')
    const plan = inferWalls(parseDxf(dxf))
    expect(plan.walls).toHaveLength(1)
    const [wall] = plan.walls
    // Plano (1,2)→(4,6); mundo X=X, Z=−Y.
    expect(wall.startX).toBeCloseTo(1, 6)
    expect(wall.startZ).toBeCloseTo(-2, 6)
    expect(wall.endX).toBeCloseTo(4, 6)
    expect(wall.endZ).toBeCloseTo(-6, 6)
    expect(wall.thickness).toBeCloseTo(0.2, 6)
  })

  it('respeta $INSUNITS (mm → m)', () => {
    expect(insUnitsToMeters(4)).toBe(0.001)
    expect(insUnitsToMeters(6)).toBe(1)
    expect(insUnitsToMeters(null)).toBe(1)
    const dxf = [
      '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC',
      '0\nSECTION\n2\nENTITIES',
      '0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n5000.0\n21\n0.0\n31\n0.0',
      '0\nENDSEC\n0\nEOF\n'
    ].join('\n')
    const plan = inferWalls(parseDxf(dxf))
    expect(plan.unitFactor).toBe(0.001)
    const [wall] = plan.walls
    expect(Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ)).toBeCloseTo(5, 6)
  })

  it('ignora capas PISOS/COTAS/RAYADO/OBJETOS y líneas degeneradas', () => {
    const dxf = [
      '0\nSECTION\n2\nENTITIES',
      '0\nLINE\n8\nPISOS\n10\n0.0\n20\n0.0\n30\n0.0\n11\n9.0\n21\n9.0\n31\n0.0',
      '0\nLINE\n8\nCOTAS\n10\n0.0\n20\n0.0\n30\n0.0\n11\n2.0\n21\n0.0\n31\n0.0',
      '0\nLINE\n8\n0\n10\n3.0\n20\n3.0\n30\n0.0\n11\n3.0\n21\n3.0\n31\n0.0',
      '0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n2.0\n21\n0.0\n31\n0.0',
      '0\nENDSEC\n0\nEOF\n'
    ].join('\n')
    const plan = inferWalls(parseDxf(dxf))
    expect(plan.walls).toHaveLength(1)
    expect(plan.skipped).toBe(1)
  })

  it('aplica la importación a la escena (un paso de historial)', () => {
    const scene = new SceneManager()
    const dxf = [
      '0\nSECTION\n2\nENTITIES',
      '0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n5.0\n21\n0.0\n31\n0.0',
      '0\nENDSEC\n0\nEOF\n'
    ].join('\n')
    const result = applyDxfImport(scene, dxf)
    expect(result.ok).toBe(true)
    expect(result.walls).toBe(1)
    expect(scene.getWalls()).toHaveLength(1)
    const [wall] = scene.getWalls()
    expect(wall.length).toBeCloseTo(5, 6)
    expect(result.message).toContain('1 muro')
  })

  it('DXF vacío o sin líneas → error controlado, sin muros', () => {
    const scene = new SceneManager()
    const empty = applyDxfImport(scene, 'esto no es un dxf')
    expect(empty.ok).toBe(false)
    expect(empty.walls).toBe(0)
    expect(scene.getWalls()).toHaveLength(0)

    const noLines = applyDxfImport(scene, '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')
    expect(noLines.ok).toBe(false)
    expect(scene.getWalls()).toHaveLength(0)
  })

  it('TEXT se cuenta y se ignora con aviso', () => {
    const dxf = [
      '0\nSECTION\n2\nENTITIES',
      '0\nTEXT\n8\n0\n10\n1.0\n20\n1.0\n1\nHabitación',
      '0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n3.0\n21\n0.0\n31\n0.0',
      '0\nENDSEC\n0\nEOF\n'
    ].join('\n')
    const parsed = parseDxf(dxf)
    expect(parsed.textCount).toBe(1)
    const plan = inferWalls(parsed)
    expect(plan.textCount).toBe(1)
    expect(plan.walls).toHaveLength(1)
  })

  it('ida y vuelta de una casa (4 muros): conserva muros y medidas ±0.001 m', () => {
    const house = sceneWithWalls([
      [[0, 0, 0], [5, 0, 0]],
      [[5, 0, 0], [5, 0, 4]],
      [[5, 0, 4], [0, 0, 4]],
      [[0, 0, 4], [0, 0, 0]]
    ])
    const context = { walls: house.getWalls(), objects: [], levels: house.getLevels() }
    const dxf = buildDxf(collectPlanSegments(context))

    const target = new SceneManager()
    const history = new HistoryManager(target)
    history.transaction('Importar DXF', () => {
      const result = applyDxfImport(target, dxf)
      expect(result.ok).toBe(true)
    })
    expect(target.getWalls()).toHaveLength(4)
    const lengths = target.getWalls().map((w) => w.length).sort((a, b) => a - b)
    expect(lengths[0]).toBeCloseTo(4, 3)
    expect(lengths[1]).toBeCloseTo(4, 3)
    expect(lengths[2]).toBeCloseTo(5, 3)
    expect(lengths[3]).toBeCloseTo(5, 3)
    for (const wall of target.getWalls()) {
      expect(wall.thickness).toBeCloseTo(0.2, 3)
    }
  })

  it('una importación completa se deshace con un solo Ctrl+Z', () => {
    const house = sceneWithWalls([
      [[0, 0, 0], [5, 0, 0]],
      [[5, 0, 0], [5, 0, 4]]
    ])
    const context = { walls: house.getWalls(), objects: [], levels: house.getLevels() }
    const dxf = buildDxf(collectPlanSegments(context))

    const target = new SceneManager()
    const history = new HistoryManager(target)
    history.transaction('Importar DXF', () => {
      applyDxfImport(target, dxf)
    })
    expect(target.getWalls()).toHaveLength(2)
    expect(history.canUndo()).toBe(true)
    expect(history.undo()).toBe(true)
    expect(target.getWalls()).toHaveLength(0)
  })
})
