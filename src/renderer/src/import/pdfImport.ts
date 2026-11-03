/** Importador de PDF vectorial — extrae líneas con pdf.js y las convierte en muros 2D. */

import * as THREE from 'three'
import { WallSegmentType } from '../models/Wall'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ParsedPdf {
  lines: PdfLine[]
  pageCount: number
}

/** Extrae las líneas vectoriales de la primera página del PDF. */
export async function extractPdfLines(buffer: ArrayBuffer, options?: { disableWorker?: boolean }): Promise<PdfLine[]> {
  const data = new Uint8Array(buffer)
  const getDocOptions = options?.disableWorker ? { data, disableWorker: true } : { data }
  const doc = await pdfjsLib.getDocument(getDocOptions).promise
  const lines: PdfLine[] = []
  const numPages = doc.numPages
  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p)
    const ops = await page.getOperatorList()
    const fn = ops.fnArray
    const args = ops.argsArray
    let x = 0
    let y = 0
    let startX = 0
    let startY = 0
    for (let i = 0; i < fn.length; i++) {
      const f = fn[i]
      const a = args[i] ?? []
      if (f === pdfjsLib.OPS.moveTo) {
        x = a[0]; y = a[1]; startX = x; startY = y
      } else if (f === pdfjsLib.OPS.lineTo) {
        const nx = a[0]; const ny = a[1]
        if (Math.hypot(nx - x, ny - y) > 1e-9) {
          lines.push({ x1: x, y1: y, x2: nx, y2: ny })
        }
        x = nx; y = ny
      } else if (f === pdfjsLib.OPS.rectangle) {
        const rx = a[0]; const ry = a[1]; const rw = a[2]; const rh = a[3]
        const corners = [
          [rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]
        ]
        for (let c = 0; c < 4; c++) {
          const [x1, y1] = corners[c]
          const [x2, y2] = corners[(c + 1) % 4]
          lines.push({ x1, y1, x2, y2 })
        }
        x = rx; y = ry
      } else if (f === pdfjsLib.OPS.constructPath) {
        // constructPath: [ops..., coords...] en args[0]/args[1]
        const opsArr = (a[0] ?? []) as number[]
        const coords = (a[1] ?? []) as number[]
        let ci = 0
        let cx = 0
        let cy = 0
        let sx = 0
        let sy = 0
        for (const op of opsArr) {
          if (op === pdfjsLib.OPS.moveTo) {
            cx = coords[ci++]; cy = coords[ci++]; sx = cx; sy = cy
          } else if (op === pdfjsLib.OPS.lineTo) {
            const nx = coords[ci++]; const ny = coords[ci++]
            if (Math.hypot(nx - cx, ny - cy) > 1e-9) lines.push({ x1: cx, y1: cy, x2: nx, y2: ny })
            cx = nx; cy = ny
          } else if (op === pdfjsLib.OPS.curveTo) {
            // Aproxima la curva con el segmento inicial-final.
            const x1 = coords[ci++]; const y1 = coords[ci++]
            const x2 = coords[ci++]; const y2 = coords[ci++]
            const x3 = coords[ci++]; const y3 = coords[ci++]
            if (Math.hypot(x3 - cx, y3 - cy) > 1e-9) lines.push({ x1: cx, y1: cy, x2: x3, y2: y3 })
            cx = x3; cy = y3
            void x1; void y1; void x2; void y2
          } else if (op === pdfjsLib.OPS.rectangle) {
            const rx = coords[ci++]; const ry = coords[ci++]
            const rw = coords[ci++]; const rh = coords[ci++]
            const cs = [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]]
            for (let c = 0; c < 4; c++) {
              lines.push({ x1: cs[c][0], y1: cs[c][1], x2: cs[(c + 1) % 4][0], y2: cs[(c + 1) % 4][1] })
            }
            cx = rx; cy = ry
          } else if (op === pdfjsLib.OPS.closePath) {
            if (Math.hypot(sx - cx, sy - cy) > 1e-9) lines.push({ x1: cx, y1: cy, x2: sx, y2: sy })
            cx = sx; cy = sy
          } else {
            // otros ops sin coords
          }
        }
      }
    }
  }
  return lines
}

export async function parsePdf(buffer: ArrayBuffer, options?: { disableWorker?: boolean }): Promise<ParsedPdf> {
  const data = new Uint8Array(buffer)
  const getDocOptions = options?.disableWorker ? { data, disableWorker: true } : { data }
  const doc = await pdfjsLib.getDocument(getDocOptions).promise
  const lines = await extractPdfLines(buffer, options)
  return { lines, pageCount: doc.numPages }
}

/** Convierte líneas PDF a líneas DXF (misma estructura) para reutilizar inferWalls. */
export function pdfLinesToDxfLines(lines: PdfLine[], layer = 'MUROS'): import('../export/dxfImport').DxfLine[] {
  return lines.map((l) => ({ layer, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }))
}

import {
  inferWalls,
  transformInferredWalls,
  type InferredWall,
  type ParsedDxf,
  type DxfLine,
  type DxfWallAdder,
  type Plan2DTransformOptions
} from '../export/dxfImport'

export interface PdfImportPlan {
  walls: InferredWall[]
  skipped: number
  /** Número de líneas vectoriales extraídas del PDF. */
  lineCount: number
  /** Factor de escala aplicado (metros por unidad PDF). */
  unitFactor: number
}

/**
 * Infiere muros desde las líneas de un PDF vectorial.
 *
 * `scale` es la escala del plano expresada en metros por unidad PDF
 * (1 unidad PDF ≈ 1/72 pulgadas ≈ 0.000353 m). El valor por defecto 0.001
 * asume que el PDF está en milímetros. Si el PDF no contiene vectores, el
 * plan queda vacío y `lineCount === 0`.
 */
export function planPdfImport(lines: PdfLine[], scale = 0.001): PdfImportPlan {
  const unitFactor = Math.abs(scale) > 0 ? scale : 0.001
  const scaled: DxfLine[] = lines.map((l) => ({
    layer: 'MUROS',
    x1: l.x1 * unitFactor,
    y1: l.y1 * unitFactor,
    x2: l.x2 * unitFactor,
    y2: l.y2 * unitFactor
  }))
  const parsed: ParsedDxf = { lines: scaled, insUnits: 6, textCount: 0 }
  const result = inferWalls(parsed)
  return { walls: result.walls, skipped: result.skipped, lineCount: lines.length, unitFactor }
}

/** Resultado de aplicar un plan PDF (idéntico a applyDxfImport). */
export interface PdfImportResult {
  ok: boolean
  walls: number
  skipped: number
  message: string
}

/**
 * Crea un muro por línea inferida del PDF. Recibe solo `adder` (con
 * `addWall`) para que el diálogo envuelva la operación en una transacción de
 * historial. Reutiliza la misma lógica de `applyDxfImport`.
 */
export function applyPdfImport(
  adder: DxfWallAdder,
  plan: PdfImportPlan,
  transform?: Plan2DTransformOptions
): PdfImportResult {
  if (plan.walls.length === 0) {
    return {
      ok: false,
      walls: 0,
      skipped: plan.skipped,
      message: 'Importar PDF: no se encontraron líneas de muro.'
    }
  }
  const yOffset = transform?.position?.y ?? 0
  const transformedWalls = transformInferredWalls(plan.walls, transform)
  for (const wall of transformedWalls) {
    const created = adder.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(wall.startX, yOffset, wall.startZ),
      new THREE.Vector3(wall.endX, yOffset, wall.endZ)
    )
    created.thickness = wall.thickness
  }
  const extra = plan.skipped > 0 ? ` (${plan.skipped} líneas omitidas)` : ''
  return {
    ok: true,
    walls: transformedWalls.length,
    skipped: plan.skipped,
    message: `Importar PDF: ${transformedWalls.length} muro${transformedWalls.length === 1 ? '' : 's'} creado${transformedWalls.length === 1 ? '' : 's'}${extra}.`
  }
}

