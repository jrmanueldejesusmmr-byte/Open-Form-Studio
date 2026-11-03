/**
 * Pruebas de la lámina PDF (Fase 3).
 *
 * Verifica la estructura PDF 1.4 (cabecera, xref con offsets correctos,
 * trailer y %%EOF), el rótulo de escala normalizada y la presencia del
 * trazado del plano.
 *
 * Ejecución: `npx vitest run src/renderer/src/export/pdf.test.ts`
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'
import { collectPlanSegments } from './dxf'
import { normalizeScale, buildPdf, exportPdf, pointsPerMeter, layoutSheet, drawnLengthPt, ptToMm, escapePdfText, PDF_SHEETS, DEFAULT_SHEET } from './pdf'

/** Decodifica base64 a Latin-1 (un byte por carácter, como el PDF). */
function base64ToLatin1(base64: string): string {
  return Buffer.from(base64, 'base64').toString('latin1')
}

/** Comprueba que cada offset del xref apunta de verdad a su `N 0 obj`. */
function checkXrefOffsets(pdf: string): boolean {
  const startIdx = pdf.lastIndexOf('startxref')
  if (startIdx === -1) return false
  const xrefOffset = Number(pdf.slice(startIdx).split('\n')[1]?.trim())
  if (!Number.isInteger(xrefOffset)) return false
  if (!pdf.slice(xrefOffset).startsWith('xref')) return false

  const xrefSection = pdf.slice(xrefOffset).split('\n')
  const count = Number(xrefSection[1]?.split(' ')[1])
  if (!Number.isInteger(count) || count < 2) return false
  for (let i = 0; i < count - 1; i++) {
    const entry = xrefSection[3 + i]
    const offset = Number(entry.slice(0, 10))
    if (!Number.isInteger(offset)) return false
    if (!pdf.slice(offset).startsWith(`${i + 1} 0 obj`)) return false
  }
  return true
}

describe('lámina PDF', () => {
  it('estructura PDF 1.4 válida con xref correcto', async () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0))
    const context = {
      walls: scene.getWalls(),
      objects: [],
      levels: scene.getLevels(),
      projectName: 'Casa (norte)'
    }
    const base64 = await exportPdf(new THREE.Scene(), context)
    expect(base64.length).toBeGreaterThan(0)

    const pdf = base64ToLatin1(base64)
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Type /Catalog')
    expect(pdf).toContain('/Type /Page')
    expect(pdf).toContain('/MediaBox [0 0 1190.55 841.89]')
    expect(pdf).toContain('/BaseFont /Helvetica')
    expect(checkXrefOffsets(pdf)).toBe(true)
  })

  it('ofrece A4, A3 y A2 en horizontal y vertical', () => {
    expect(DEFAULT_SHEET).toBe('A3-H')
    expect(Object.keys(PDF_SHEETS).sort()).toEqual(['A2-H', 'A2-V', 'A3-H', 'A3-V', 'A4-H', 'A4-V'])
    // A4 = 210x297 mm, A3 = 297x420 mm, A2 = 420x594 mm (1 mm = 72/25.4 pt).
    const mm = (pt: number): number => (pt * 25.4) / 72
    expect(mm(PDF_SHEETS['A4-H'].width)).toBeCloseTo(297, 0)
    expect(mm(PDF_SHEETS['A4-H'].height)).toBeCloseTo(210, 0)
    expect(mm(PDF_SHEETS['A4-V'].width)).toBeCloseTo(210, 0)
    expect(mm(PDF_SHEETS['A4-V'].height)).toBeCloseTo(297, 0)
    expect(mm(PDF_SHEETS['A3-H'].width)).toBeCloseTo(420, 0)
    expect(mm(PDF_SHEETS['A3-H'].height)).toBeCloseTo(297, 0)
    expect(mm(PDF_SHEETS['A3-V'].width)).toBeCloseTo(297, 0)
    expect(mm(PDF_SHEETS['A3-V'].height)).toBeCloseTo(420, 0)
    expect(mm(PDF_SHEETS['A2-H'].width)).toBeCloseTo(594, 0)
    expect(mm(PDF_SHEETS['A2-H'].height)).toBeCloseTo(420, 0)
    expect(mm(PDF_SHEETS['A2-V'].width)).toBeCloseTo(420, 0)
    expect(mm(PDF_SHEETS['A2-V'].height)).toBeCloseTo(594, 0)
  })

  it.each(['A3-H', 'A2-H'] as const)('un muro de 5 m a 1:100 mide 50 mm en %s', (sheet) => {
    const segments = [
      { x1: 0, y1: 0, x2: 5, y2: 0, layer: 'MUROS' as const },
      { x1: 0, y1: 0.2, x2: 5, y2: 0.2, layer: 'MUROS' as const }
    ]
    const layout = layoutSheet(segments, sheet, 100)
    expect(layout?.scale).toBe(100)
    // 5 m a 1:100 = 50 mm en la lamina (con 0.1 mm de margen).
    expect(ptToMm(drawnLengthPt(layout!, 0, 0, 5, 0))).toBeCloseTo(50, 1)
    // Y el PDF generado declara esa hoja en el MediaBox.
    const context = { walls: [], objects: [], levels: [], sheet, scale: 100 }
    const pdf = buildPdf(context, segments)
    const box = PDF_SHEETS[sheet]
    expect(pdf).toContain('/MediaBox [0 0 ' + box.width.toFixed(2) + ' ' + box.height.toFixed(2) + ']')
  })

  it('normaliza la escala a la serie comercial', () => {
    expect(normalizeScale(pointsPerMeter(10))).toBe(10)
    expect(normalizeScale(pointsPerMeter(50))).toBe(50)
    // Un dibujo que a 1:10 no cabe, cae a la siguiente comercial.
    expect(normalizeScale(pointsPerMeter(10) * 0.9)).toBe(20)
    // Muy poco espacio → escala de la serie más pequeña.
    expect(normalizeScale(0.5)).toBe(1000)
  })

  it('el rótulo lleva la escala y las unidades', () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(8, 0, 0))
    const context = { walls: scene.getWalls(), objects: [], levels: [], projectName: 'Vivienda' }
    const pdf = buildPdf(context, collectPlanSegments(context))

    expect(pdf).toContain('Escala 1:')
    expect(pdf).toContain('unidades: metros')
    expect(pdf).toContain('Vivienda')
  })

  it('el plano se traza con operadores de línea', () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 0, 0))
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(6, 0, 0), new THREE.Vector3(6, 0, 4))
    const context = { walls: scene.getWalls(), objects: [], levels: [] }
    const pdf = buildPdf(context, collectPlanSegments(context))

    const moveCount = (pdf.match(/ m \d/g) ?? []).length
    const lineCount = (pdf.match(/ l S/g) ?? []).length
    expect(lineCount).toBeGreaterThanOrEqual(8) // 2 muros × 4 lados + losa
    expect(moveCount).toBe(lineCount)
  })

  it('escena vacía → PDF válido con el aviso de sin geometría', () => {
    const pdf = buildPdf({ walls: [], objects: [], levels: [] }, [])
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('Sin geometria que exportar')
    expect(checkXrefOffsets(pdf)).toBe(true)
  })

  it('el cajetín muestra proyecto, autor, fecha, escala y lámina', () => {
    const segments = [{ x1: 0, y1: 0, x2: 2, y2: 0, layer: 'MUROS' as const }]
    const pdf = buildPdf(
      {
        walls: [],
        objects: [],
        levels: [],
        projectName: 'Casa Mirador',
        author: 'Estudio Norte',
        sheetDate: '2026-10-17',
        sheetNumber: 'A-101',
        sheet: 'A3-H',
        scale: 50
      },
      segments
    )
    expect(pdf).toContain(escapePdfText('Casa Mirador'))
    expect(pdf).toContain(escapePdfText('Estudio Norte'))
    expect(pdf).toContain('2026-10-17')
    expect(pdf).toContain('A-101')
    expect(pdf).toContain(escapePdfText('Escala 1:50'))
    expect(pdf).toContain('/WinAnsiEncoding')
  })

  it('los acentos y eñes viajan en WinAnsi (octal Latin-1)', () => {
    const sample = 'Ubicación, habitación, diseño, cañería'
    const escaped = escapePdfText(sample)
    // ó=0xF3=363, ñ=0xF1=361, í=0xED=355: todo lo no-ASCII viaja en octal.
    expect(escaped).toContain('\\363') // ó de Ubicación
    expect(escaped).toContain('\\361') // ñ de diseño/cañería
    expect(escaped).toContain('\\355') // í de cañería
    expect(escaped).not.toContain('ó')
    expect(escaped).not.toContain('ñ')
    const pdf = buildPdf({ walls: [], objects: [], levels: [], projectName: sample }, [])
    expect(pdf).toContain(escaped)
    expect(pdf).toContain('/WinAnsiEncoding')
  })
})
