/**
 * Pruebas del exportador DXF (Fase 2).
 *
 * Verifica la estructura R12 (HEADER/TABLES/ENTITIES/EOF), las capas, la
 * proyección X→X, Z→−Y y la geometría exacta de la huella de un muro.
 *
 * Ejecución: `npx vitest run src/renderer/src/export/dxf.test.ts`
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { SceneManager } from '../engine/SceneManager'
import { SceneObject } from '../models/SceneObject'
import { WallSegmentType } from '../models/Wall'
import { buildDxf, collectPlanSegments, DXF_LAYERS, toPlan, wallFootprint } from './dxf'

/** Lee los pares código/valor de un DXF. */
function dxfPairs(text: string): Array<{ code: number; value: string }> {
  const lines = text.split('\n')
  const pairs: Array<{ code: number; value: string }> = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (!Number.isFinite(code)) continue
    pairs.push({ code, value: lines[i + 1] })
  }
  return pairs
}

/** Extrae las entidades LINE de un DXF. */
function parseLines(text: string): Array<{ layer: string; x1: number; y1: number; x2: number; y2: number }> {
  const pairs = dxfPairs(text)
  const lines: Array<{ layer: string; x1: number; y1: number; x2: number; y2: number }> = []
  let current: { layer?: string; x1?: number; y1?: number; x2?: number; y2?: number } | null = null
  const flush = (): void => {
    if (current?.layer !== undefined && current.x1 !== undefined && current.y1 !== undefined) {
      lines.push({
        layer: current.layer,
        x1: current.x1,
        y1: current.y1,
        x2: current.x2 ?? 0,
        y2: current.y2 ?? 0
      })
    }
  }
  for (const pair of pairs) {
    if (pair.code === 0) {
      flush()
      current = pair.value === 'LINE' ? {} : null
    } else if (current) {
      if (pair.code === 8) current.layer = pair.value
      if (pair.code === 10) current.x1 = Number(pair.value)
      if (pair.code === 20) current.y1 = Number(pair.value)
      if (pair.code === 11) current.x2 = Number(pair.value)
      if (pair.code === 21) current.y2 = Number(pair.value)
    }
  }
  flush()
  return lines
}


describe('exportación DXF', () => {
  it('muro de 5 m genera 4 líneas en MUROS con la huella exacta', () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0))
    const context = { walls: scene.getWalls(), objects: [], levels: [] }
    const text = buildDxf(collectPlanSegments(context))

    // Estructura R12.
    expect(text).toContain('AC1009')
    expect(text).toContain('SECTION')
    expect(text).toContain('TABLES')
    expect(text).toContain('ENTITIES')
    expect(text.trimEnd().endsWith('EOF')).toBe(true)

    const lines = parseLines(text)
    expect(lines.length).toBe(4)
    expect(lines.every((line) => line.layer === DXF_LAYERS.walls)).toBe(true)

    // Huella: X ∈ [0, 5]; Y de plano = −Z, Z ∈ [−0,1; 0,1] → Y ∈ [−0,1; 0,1].
    const xs = lines.flatMap((line) => [line.x1, line.x2])
    const ys = lines.flatMap((line) => [line.y1, line.y2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5, 6)
    expect(Math.min(...xs)).toBeCloseTo(0, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.2, 6)
  })

  it('proyecta X→X y Z→−Y (vista cenital)', () => {
    const plan = toPlan(3, 4)
    expect(plan.x).toBe(3)
    expect(plan.y).toBe(-4)
  })

  it('los pisos añaden su huella en la capa PISOS', () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 0, 0))
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(6, 0, 0), new THREE.Vector3(6, 0, 4))
    const context = { walls: scene.getWalls(), objects: [], levels: scene.getLevels() }
    const segments = collectPlanSegments(context)

    expect(segments.some((segment) => segment.layer === DXF_LAYERS.floors)).toBe(true)
    expect(segments.some((segment) => segment.layer === DXF_LAYERS.walls)).toBe(true)

    const text = buildDxf(segments)
    expect(text).toContain(`\n${DXF_LAYERS.floors}\n`)
    expect(text).toContain(`\n${DXF_LAYERS.walls}\n`)
  })

  it('los objetos rotados giran su huella (45° en un cuadrado)', () => {
    const object = new SceneObject('Mesa', 'furniture')
    object.position.set(2, 0, 2)
    object.size.set(2, 1, 2)
    object.rotationY = Math.PI / 4

    const segments = collectPlanSegments({ walls: [], objects: [object], levels: [] })
    expect(segments.length).toBe(4)
    expect(segments.every((segment) => segment.layer === DXF_LAYERS.objects)).toBe(true)

    // Tras rotar 45°, la diagonal de un cuadrado de lado 2 es 2√2 ≈ 2,828.
    const xs = segments.flatMap((segment) => [segment.x1, segment.x2])
    const ys = segments.flatMap((segment) => [segment.y1, segment.y2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.SQRT2 * 2, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(Math.SQRT2 * 2, 6)
  })

  it('wallFootprint de un muro vertical queda en X constante', () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 4))
    const footprint = wallFootprint(scene.getWalls()[0])
    const xs = footprint.map((point) => point.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 6)
    const ys = footprint.map((point) => point.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 6)
  })

  it('escena vacía → DXF válido con secciones y sin LINE', () => {
    const text = buildDxf(collectPlanSegments({ walls: [], objects: [], levels: [] }))
    expect(text).toContain('SECTION')
    expect(text.trimEnd().endsWith('EOF')).toBe(true)
    expect(parseLines(text).length).toBe(0)
  })
})
