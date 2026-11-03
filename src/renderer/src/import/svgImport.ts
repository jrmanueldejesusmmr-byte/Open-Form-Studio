/**
 * Importador de planos vectoriales SVG — utiliza `SVGLoader` de Three.js
 * (`three/examples/jsm/loaders/SVGLoader.js`) junto con extracción de capas
 * CAD (`<g id="MUROS">`, `<line>`, `<polygon>`, `<polyline>`, `<rect>`, `<path>`)
 * para transformar las trayectorias vectoriales en trazos de plano 2D / muros
 * sobre el plano de trabajo (Y = 0).
 */

import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { WallSegmentType } from '../models/Wall'
import {
  inferWalls,
  transformInferredWalls,
  type DxfLine,
  type DxfWallAdder,
  type InferredWall,
  type Plan2DTransformOptions
} from '../export/dxfImport'

export interface ParsedSvgPlan {
  lines: DxfLine[]
  pathCount: number
}

export interface SvgImportPlan {
  walls: InferredWall[]
  skipped: number
  lineCount: number
  pathCount: number
}

export interface SvgImportResult {
  ok: boolean
  walls: number
  skipped: number
  message: string
}

/** Extrae el valor de un atributo XML simple. */
function getAttr(tag: string, name: string): string | null {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  const match = tag.match(regex)
  return match ? (match[1] ?? match[2] ?? null) : null
}

/** Convierte una lista `points="x1,y1 x2,y2 ..."` en pares numéricos. */
function parsePointsList(pointsAttr: string): Array<{ x: number; y: number }> {
  const nums = pointsAttr
    .trim()
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] })
  }
  return pts
}

/** Parsea comandos básicos de un atributo `d` de `<path>` (M, L, H, V, Z). */
function parseBasicSvgPathD(d: string, layer: string): DxfLine[] {
  const out: DxfLine[] = []
  const tokens = d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return out

  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0

  const nextNum = (): number => Number(tokens[i++]) || 0

  while (i < tokens.length) {
    const tok = tokens[i]
    if (/^[a-zA-Z]$/.test(tok)) {
      cmd = tok
      i++
    }
    switch (cmd) {
      case 'M': {
        cx = nextNum()
        cy = nextNum()
        sx = cx
        sy = cy
        cmd = 'L'
        break
      }
      case 'm': {
        cx += nextNum()
        cy += nextNum()
        sx = cx
        sy = cy
        cmd = 'l'
        break
      }
      case 'L': {
        const nx = nextNum()
        const ny = nextNum()
        if (Math.hypot(nx - cx, ny - cy) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: nx, y2: ny })
        }
        cx = nx
        cy = ny
        break
      }
      case 'l': {
        const nx = cx + nextNum()
        const ny = cy + nextNum()
        if (Math.hypot(nx - cx, ny - cy) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: nx, y2: ny })
        }
        cx = nx
        cy = ny
        break
      }
      case 'H': {
        const nx = nextNum()
        if (Math.abs(nx - cx) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: nx, y2: cy })
        }
        cx = nx
        break
      }
      case 'h': {
        const nx = cx + nextNum()
        if (Math.abs(nx - cx) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: nx, y2: cy })
        }
        cx = nx
        break
      }
      case 'V': {
        const ny = nextNum()
        if (Math.abs(ny - cy) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: cx, y2: ny })
        }
        cy = ny
        break
      }
      case 'v': {
        const ny = cy + nextNum()
        if (Math.abs(ny - cy) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: cx, y2: ny })
        }
        cy = ny
        break
      }
      case 'Z':
      case 'z': {
        if (Math.hypot(sx - cx, sy - cy) > 1e-6) {
          out.push({ layer, x1: cx, y1: cy, x2: sx, y2: sy })
        }
        cx = sx
        cy = sy
        cmd = ''
        break
      }
      default: {
        i++
        break
      }
    }
  }
  return out
}

/** Elimina segmentos duplicados (p. ej. cuando un SVG exporta <polygon> de relleno + <line> de borde). */
function deduplicateLines(lines: DxfLine[]): DxfLine[] {
  const unique: DxfLine[] = []
  const eps = 1e-4
  const samePt = (ax: number, ay: number, bx: number, by: number): boolean =>
    Math.hypot(ax - bx, ay - by) <= eps

  for (const candidate of lines) {
    const duplicate = unique.some(
      (u) =>
        u.layer === candidate.layer &&
        ((samePt(u.x1, u.y1, candidate.x1, candidate.y1) &&
          samePt(u.x2, u.y2, candidate.x2, candidate.y2)) ||
          (samePt(u.x1, u.y1, candidate.x2, candidate.y2) &&
            samePt(u.x2, u.y2, candidate.x1, candidate.y1)))
    )
    if (!duplicate) unique.push(candidate)
  }
  return unique
}

/**
 * Parsea un documento SVG extrayendo las trayectorias vectoriales mediante
 * `SVGLoader` de Three.js (cuando `DOMParser` está disponible) y/o el analizador
 * estructural de etiquetas SVG (`<g>`, `<line>`, `<polygon>`, `<polyline>`, `<rect>`, `<path>`).
 */
export function parseSvg(text: string): ParsedSvgPlan {
  const trimmed = text.trim()
  if (!trimmed || !trimmed.includes('<svg')) {
    throw new Error('El archivo no contiene un documento <svg> válido.')
  }

  // Ignorar el bloque <defs>...</defs> (patrones de sombreado)
  const withoutDefs = trimmed.replace(/<defs[\s\S]*?<\/defs>/gi, '')

  const lines: DxfLine[] = []
  let pathCount = 0

  // 1) Si `DOMParser` está disponible en el entorno (Electron / navegador),
  //    ejecutamos `SVGLoader` oficial de Three.js para soportar curvas Bézier y arcos complejos.
  if (typeof DOMParser !== 'undefined') {
    try {
      const loader = new SVGLoader()
      const svgData = loader.parse(withoutDefs)
      for (const shapePath of svgData.paths) {
        const node = (shapePath as unknown as { userData?: { node?: Element } }).userData?.node
        let layer = '0'
        let curr: Element | null = node ?? null
        let inDefs = false
        while (curr) {
          if (curr.tagName.toLowerCase() === 'defs' || curr.tagName.toLowerCase() === 'pattern') {
            inDefs = true
            break
          }
          const id = curr.getAttribute?.('id')
          if (id && layer === '0') {
            layer = id.toUpperCase()
          }
          curr = curr.parentElement
        }
        if (inDefs) continue
        pathCount++
        for (const subPath of shapePath.subPaths) {
          const pts = subPath.getPoints(12)
          for (let i = 0; i + 1 < pts.length; i++) {
            const p0 = pts[i]
            const p1 = pts[i + 1]
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-6) {
              lines.push({
                layer,
                x1: p0.x,
                y1: p0.y,
                x2: p1.x,
                y2: p1.y
              })
            }
          }
        }
      }
      if (lines.length > 0) {
        return { lines: deduplicateLines(lines), pathCount }
      }
    } catch {
      // Cae al analizador estructural de elementos SVG abajo
    }
  }

  // 2) Analizador estructural (funciona tanto en navegador como en Node/vitest sin DOMParser)
  const tagRegex = /<\/?([a-zA-Z0-9:_-]+)([^>]*)>/g
  const groupStack: string[] = ['0']
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(withoutDefs)) !== null) {
    const fullTag = match[0]
    const tagName = match[1].toLowerCase()
    const attrs = match[2] ?? ''
    const isClosing = fullTag.startsWith('</')
    const isSelfClosing = fullTag.endsWith('/>')

    if (tagName === 'g') {
      if (isClosing) {
        if (groupStack.length > 1) groupStack.pop()
      } else if (!isSelfClosing) {
        const id = getAttr(attrs, 'id')?.toUpperCase() || groupStack[groupStack.length - 1]
        groupStack.push(id)
      }
      continue
    }

    if (isClosing) continue
    const currentLayer = groupStack[groupStack.length - 1] || '0'

    if (tagName === 'line') {
      const x1 = Number(getAttr(attrs, 'x1')) || 0
      const y1 = Number(getAttr(attrs, 'y1')) || 0
      const x2 = Number(getAttr(attrs, 'x2')) || 0
      const y2 = Number(getAttr(attrs, 'y2')) || 0
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) {
        pathCount++
        lines.push({ layer: currentLayer, x1, y1, x2, y2 })
      }
    } else if (tagName === 'polygon' || tagName === 'polyline') {
      const ptsAttr = getAttr(attrs, 'points')
      if (!ptsAttr) continue
      const pts = parsePointsList(ptsAttr)
      if (pts.length < 2) continue
      pathCount++
      for (let i = 0; i + 1 < pts.length; i++) {
        lines.push({
          layer: currentLayer,
          x1: pts[i].x,
          y1: pts[i].y,
          x2: pts[i + 1].x,
          y2: pts[i + 1].y
        })
      }
      if (tagName === 'polygon' && pts.length >= 3) {
        const last = pts[pts.length - 1]
        const first = pts[0]
        if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) {
          lines.push({
            layer: currentLayer,
            x1: last.x,
            y1: last.y,
            x2: first.x,
            y2: first.y
          })
        }
      }
    } else if (tagName === 'rect') {
      const x = Number(getAttr(attrs, 'x')) || 0
      const y = Number(getAttr(attrs, 'y')) || 0
      const w = Number(getAttr(attrs, 'width')) || 0
      const h = Number(getAttr(attrs, 'height')) || 0
      if (w > 1e-6 && h > 1e-6) {
        pathCount++
        const corners = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h }
        ]
        for (let i = 0; i < 4; i++) {
          const c0 = corners[i]
          const c1 = corners[(i + 1) % 4]
          lines.push({ layer: currentLayer, x1: c0.x, y1: c0.y, x2: c1.x, y2: c1.y })
        }
      }
    } else if (tagName === 'path') {
      const d = getAttr(attrs, 'd')
      if (d) {
        const segs = parseBasicSvgPathD(d, currentLayer)
        if (segs.length > 0) {
          pathCount++
          for (const seg of segs) {
            lines.push({
              layer: seg.layer,
              x1: seg.x1,
              y1: seg.y1,
              x2: seg.x2,
              y2: seg.y2
            })
          }
        }
      }
    }
  }

  return { lines: deduplicateLines(lines), pathCount }
}

/**
 * Infiere muros de un plano SVG parseado.
 */
export function planSvgImport(parsed: ParsedSvgPlan, scale = 1): SvgImportPlan {
  const unitFactor = Math.abs(scale) > 0 ? scale : 1
  const scaledLines: DxfLine[] = parsed.lines.map((l) => ({
    layer: l.layer,
    x1: l.x1 * unitFactor,
    y1: l.y1 * unitFactor,
    x2: l.x2 * unitFactor,
    y2: l.y2 * unitFactor
  }))
  const inferred = inferWalls({ lines: scaledLines, insUnits: 6, textCount: 0 })
  return {
    walls: inferred.walls,
    skipped: inferred.skipped,
    lineCount: parsed.lines.length,
    pathCount: parsed.pathCount
  }
}

/**
 * Aplica la importación de un archivo SVG a la escena creando muros sobre el plano Y=0.
 */
export function applySvgImport(
  adder: DxfWallAdder,
  text: string,
  transform?: Plan2DTransformOptions
): SvgImportResult {
  let parsed: ParsedSvgPlan
  try {
    parsed = parseSvg(text)
  } catch (err) {
    return {
      ok: false,
      walls: 0,
      skipped: 0,
      message: `Importar SVG: ${err instanceof Error ? err.message : 'el archivo no es un SVG válido.'}`
    }
  }

  const plan = planSvgImport(parsed, 1)
  if (plan.walls.length === 0) {
    return {
      ok: false,
      walls: 0,
      skipped: plan.skipped,
      message: 'Importar SVG: no se encontraron trazos de muro en el archivo.'
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

  const extra = plan.skipped > 0 ? ` (${plan.skipped} trazos omitidos)` : ''
  return {
    ok: true,
    walls: transformedWalls.length,
    skipped: plan.skipped,
    message: `Importar SVG: ${transformedWalls.length} muro${transformedWalls.length === 1 ? '' : 's'} creado${transformedWalls.length === 1 ? '' : 's'}${extra}.`
  }
}

