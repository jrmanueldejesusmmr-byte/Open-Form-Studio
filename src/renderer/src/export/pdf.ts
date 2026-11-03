import * as THREE from 'three'
import type { ExportContext, PdfSheetId } from './index'
import {
  collectPlanSegments,
  collectPlanTexts,
  collectWallHatchSegments,
  collectDimensionSegments,
  type PlanSegment
} from './dxf'
import { latin1ToBase64 } from './base64'

/** Lamina PDF vectorial - Fase 3 (solo Latin-1, sin dependencias). */

export const A3_LANDSCAPE = { width: 1190.55, height: 841.89 }
export const PDF_SHEETS: Record<PdfSheetId, { width: number; height: number; label: string }> = {
  'A4-H': { width: 841.89, height: 595.28, label: 'A4 horizontal' },
  'A4-V': { width: 595.28, height: 841.89, label: 'A4 vertical' },
  'A3-H': { width: 1190.55, height: 841.89, label: 'A3 horizontal' },
  'A3-V': { width: 841.89, height: 1190.55, label: 'A3 vertical' },
  'A2-H': { width: 1683.78, height: 1190.55, label: 'A2 horizontal' },
  'A2-V': { width: 1190.55, height: 1683.78, label: 'A2 vertical' }
}
export const DEFAULT_SHEET: PdfSheetId = 'A3-H'

export const STANDARD_SCALES = [10, 20, 50, 100, 200, 500, 1000] as const

export function pointsPerMeter(scale: number): number {
  return (1000 / scale) * (72 / 25.4)
}

export function normalizeScale(fit: number): number {
  for (const scale of STANDARD_SCALES) {
    if (pointsPerMeter(scale) <= fit) return scale
  }
  return 1000
}

export function escapePdfText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (ch === '\r' || ch === '\n') out += ' '
    else if (ch === '\\') out += '\\\\'
    else if (ch === '(') out += '\\('
    else if (ch === ')') out += '\\)'
    else if (code < 32 || code === 127) out += ' '
    else if (code > 255) out += '?'
    else if (code > 127) out += '\\' + code.toString(8).padStart(3, '0')
    else out += ch
  }
  return out
}

function segmentsBounds(segments: PlanSegment[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (segments.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2)
    maxX = Math.max(maxX, s.x1, s.x2)
    minY = Math.min(minY, s.y1, s.y2)
    maxY = Math.max(maxY, s.y1, s.y2)
  }
  return { minX, maxX, minY, maxY }
}

export interface SheetLayout {
  scale: number
  ptPerM: number
  offsetX: number
  offsetY: number
  areaWidth: number
  areaHeight: number
  sheet: PdfSheetId
  pageWidth: number
  pageHeight: number
}
export function layoutSheet(segments: PlanSegment[], sheet: PdfSheetId = DEFAULT_SHEET, forcedScale?: number): SheetLayout | null {
  const b = segmentsBounds(segments)
  if (!b) return null
  const page = PDF_SHEETS[sheet]
  const margin = 60
  const titleStrip = 70
  const areaWidth = page.width - margin * 2
  const areaHeight = page.height - margin * 2 - titleStrip
  const spanX = Math.max(b.maxX - b.minX, 1e-6)
  const spanY = Math.max(b.maxY - b.minY, 1e-6)
  const fit = Math.min(areaWidth / spanX, areaHeight / spanY)
  const scale = forcedScale ?? normalizeScale(fit)
  const ptPerM = pointsPerMeter(scale)
  const drawW = spanX * ptPerM
  const drawH = spanY * ptPerM
  const originX = margin + (areaWidth - drawW) / 2
  const originY = margin + titleStrip + (areaHeight - drawH) / 2
  return { scale, ptPerM, offsetX: originX - b.minX * ptPerM, offsetY: originY - b.minY * ptPerM, areaWidth, areaHeight, sheet, pageWidth: page.width, pageHeight: page.height }
}

export function toPaper(layout: SheetLayout, x: number, y: number): { x: number; y: number } {
  return { x: layout.offsetX + x * layout.ptPerM, y: layout.offsetY + y * layout.ptPerM }
}

/**
 * Largo de un segmento ya dibujado (en puntos PDF). Sirve para la prueba de
 * medición: un muro de 5 m a 1:100 debe medir 50 mm en la lámina.
 */
export function drawnLengthPt(layout: SheetLayout, x1: number, y1: number, x2: number, y2: number): number {
  const a = toPaper(layout, x1, y1)
  const b = toPaper(layout, x2, y2)
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Convierte puntos PDF a milímetros (1 pt = 25.4/72 mm). */
export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72
}

const LAYER_STYLE: Record<string, { rgb: [number, number, number]; width: number }> = {
  MUROS: { rgb: [0, 0, 0], width: 0.9 },
  MOBILIARIO: { rgb: [0.35, 0.35, 0.38], width: 0.55 },
  OBJETOS: { rgb: [0.35, 0.35, 0.38], width: 0.55 },
  PUERTAS: { rgb: [0.7, 0.15, 0.15], width: 0.5 },
  VENTANAS: { rgb: [0.15, 0.35, 0.7], width: 0.45 },
  PISOS: { rgb: [0.62, 0.6, 0.56], width: 0.45 },
  COTAS: { rgb: [0.1, 0.32, 0.72], width: 0.35 },
  TEXTO: { rgb: [0.2, 0.2, 0.2], width: 0.3 },
  RAYADO: { rgb: [0.45, 0.45, 0.45], width: 0.3 }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function buildContent(context: ExportContext, segments: PlanSegment[]): string {
  const sheet = context.sheet ?? DEFAULT_SHEET
  const page = PDF_SHEETS[sheet]
  const layout = layoutSheet(segments, sheet, context.scale)
  const f2 = (n: number): string => n.toFixed(2)
  const ops: string[] = []
  const m = 30
  const x2 = page.width - m
  const y2 = page.height - m
  ops.push('0.7 w 0 0 0 RG')
  ops.push(m + ' ' + m + ' m ' + f2(x2) + ' ' + m + ' l S')
  ops.push(f2(x2) + ' ' + m + ' m ' + f2(x2) + ' ' + f2(y2) + ' l S')
  ops.push(f2(x2) + ' ' + f2(y2) + ' m ' + m + ' ' + f2(y2) + ' l S')
  ops.push(m + ' ' + f2(y2) + ' m ' + m + ' ' + m + ' l S')
  const projectName = escapePdfText(context.projectName ?? 'Plano')
  const authorName = escapePdfText(context.author ?? 'ArqStudio 3D')
  const sheetName = PDF_SHEETS[sheet].label + ' (' + sheet + ')'
  const scaleLabel = layout ? ('Escala 1:' + layout.scale) : 'Escala 1:--'
  const dateLabel = context.sheetDate ?? todayIso()
  const numberLabel = context.sheetNumber ?? 'A-01'
  ops.push('BT /F2 20 Tf 1 0 0 1 60 ' + f2(page.height - 52) + ' Tm 0 0 0 rg')
  ops.push('(' + projectName + ' - Plano ' + sheet + ') Tj ET')
  ops.push('BT /F1 10 Tf 1 0 0 1 60 ' + f2(page.height - 70) + ' Tm 0.35 0.35 0.35 rg')
  ops.push('(Planta - unidades: metros - ' + escapePdfText(scaleLabel) + ' - ' + dateLabel + ' - ' + escapePdfText(sheetName) + ') Tj ET')
  if (segments.length === 0 || !layout) {
    ops.push('BT /F1 14 Tf 1 0 0 1 40 55 Tm 0 0 0 rg')
    ops.push('(Sin geometria que exportar) Tj ET')
  }
  if (layout) {
    const order = ['PISOS', 'MOBILIARIO', 'OBJETOS', 'PUERTAS', 'VENTANAS', 'MUROS', 'RAYADO', 'COTAS', 'TEXTO']
    for (const layer of order) {
      const ls = segments.filter((s) => s.layer === layer)
      if (ls.length === 0) continue
      const st = LAYER_STYLE[layer] ?? LAYER_STYLE.MUROS
      ops.push(st.rgb.join(' ') + ' RG ' + st.width + ' w')
      for (const s of ls) {
        const a = toPaper(layout, s.x1, s.y1)
        const b = toPaper(layout, s.x2, s.y2)
        ops.push(a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' m ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + ' l S')
      }
    }
  }
  if (layout) {
    const pdfTexts = collectPlanTexts(context)
    for (const t of pdfTexts) {
      const pp = toPaper(layout, t.x, t.y)
      ops.push('BT /F1 ' + (t.height ? Math.max(6, t.height * layout.ptPerM).toFixed(0) : '7') + ' Tf 1 0 0 1 ' + pp.x.toFixed(2) + ' ' + pp.y.toFixed(2) + ' Tm 0 0 0 rg (' + escapePdfText(t.text) + ') Tj ET')
    }
  }
  ops.push('0 0 0 RG 0.5 w')
  const footY = 60
  const footX2 = page.width - 60
  ops.push('60 ' + footY + ' m ' + f2(footX2) + ' ' + footY + ' l S')
  const col2 = Math.round(page.width * 0.34)
  const col3 = Math.round(page.width * 0.52)
  const col4 = Math.round(page.width * 0.76)
  ops.push('BT /F1 9 Tf 1 0 0 1 60 45 Tm 0 0 0 rg')
  ops.push('(' + projectName + ' | ' + authorName + ') Tj ET')
  ops.push('BT /F1 9 Tf 1 0 0 1 ' + col2 + ' 45 Tm 0 0 0 rg')
  ops.push('(' + escapePdfText(scaleLabel) + ' | ' + escapePdfText(sheetName) + ') Tj ET')
  ops.push('BT /F1 9 Tf 1 0 0 1 ' + col3 + ' 45 Tm 0 0 0 rg')
  ops.push('(' + numberLabel + ' | ' + dateLabel + ') Tj ET')
  ops.push('BT /F1 9 Tf 1 0 0 1 ' + col4 + ' 45 Tm 0 0 0 rg')
  ops.push('(unidades: metros) Tj ET')
  return ops.join('\n')
}
function assemblePdf(headerComment: string, parts: string[]): string {
  const header = '%PDF-1.4\n' + headerComment
  const offsets: number[] = []
  let cursor = header.length + 1
  const objs: string[] = []
  for (const part of parts) {
    offsets.push(cursor)
    objs.push(part)
    cursor += part.length + 1
  }
  const body = objs.join('\n')
  const xrefStart = cursor
  const lines: string[] = []
  lines.push('xref\n0 ' + (parts.length + 1))
  lines.push('0000000000 65535 f ')
  for (const o of offsets) lines.push(String(o).padStart(10, '0') + ' 00000 n ')
  lines.push('trailer\n<< /Size ' + (parts.length + 1) + ' /Root 1 0 R /Info 7 0 R >>')
  lines.push('startxref\n' + xrefStart)
  lines.push('%%EOF')
  return header + '\n' + body + '\n' + lines.join('\n') + '\n'
}

export function buildPdf(context: ExportContext, segments: PlanSegment[]): string {
  const sheet = context.sheet ?? DEFAULT_SHEET
  const page = PDF_SHEETS[sheet]
  const content = buildContent(context, segments)
  const info = '<< /Title (' + escapePdfText(context.projectName ?? 'Plano') + ' - Plano ' + sheet + ') /Author (' + escapePdfText(context.author ?? 'ArqStudio 3D') + ') /Creator (ArqStudio 3D) >>'
  const comment = '%\xE2\xE3\xCF\xD3\n'
  return assemblePdf(comment, [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + page.width.toFixed(2) + ' ' + page.height.toFixed(2) + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
    '6 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj',
    '7 0 obj\n' + info + '\nendobj'
  ])
}

export async function exportPdf(
  _scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const ctx = context ?? { walls: [], objects: [], levels: [] }
    const segments = [
      ...collectPlanSegments(ctx),
      ...collectWallHatchSegments(ctx),
      ...collectDimensionSegments(ctx)
    ]
    return latin1ToBase64(buildPdf(ctx, segments))
  } catch (err) {
    if (error) error.message = `PDF: ${(err as Error).message}`
    return ''
  }
}
