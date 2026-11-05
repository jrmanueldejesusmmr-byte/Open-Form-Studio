import * as THREE from 'three'
import type { Wall } from '../models/Wall'

/**
 * Identificadores de las plantillas de muros 2D (atajos de dibujo arquitectónico).
 * A diferencia de un objeto 3D rígido, cada plantilla genera verdaderos segmentos
 * `Wall` independientes y conectados por sus vértices dentro de `SceneManager`.
 */
export type WallTemplateId = 'rect' | 'l' | 'u' | 'c' | 't' | 'cross' | 'ring' | 'arc'

/** Variante para Perfil L: habitación cerrada (6 muros) o esquina abierta (2 muros). */
export type LProfileVariant = 'room' | 'corner'

export interface WallTemplateDef {
  id: WallTemplateId
  actionId: string
  label: string
  shortLabel: string
  shortcut: string
  defaultWidth: number
  defaultDepth: number
  defaultSegments?: number
  closed: boolean
  hint: string
  /** Trazado SVG (viewBox 0 0 48 48) en estilo de plano arquitectónico 2D. */
  previewSvg: string
}

export interface WallSegmentPoints {
  start: THREE.Vector3
  end: THREE.Vector3
}

export interface BuildWallTemplateOptions {
  templateId: WallTemplateId
  centerX: number
  centerZ: number
  width: number
  depth: number
  /** Rotación en planta en grados (múltiplos de 90°: 0, 90, 180, 270). */
  rotationDeg?: number
  elevation?: number
  lVariant?: LProfileVariant
  segmentsCount?: number
}

export const WALL_TEMPLATES: readonly WallTemplateDef[] = [
  {
    id: 'rect',
    actionId: 'template.rect',
    label: 'Habitación Rectangular',
    shortLabel: 'Habitación Rect.',
    shortcut: 'R',
    defaultWidth: 4.0,
    defaultDepth: 4.0,
    closed: true,
    hint: '4 muros cerrados conectados (4.0 × 4.0 m o arrastrando de esquina a esquina)',
    previewSvg:
      '<rect x="8" y="10" width="32" height="28" stroke-width="2.4"/><rect x="11.5" y="13.5" width="25" height="21" stroke-width="1" opacity="0.55"/><circle cx="8" cy="10" r="2" fill="currentColor"/><circle cx="40" cy="10" r="2" fill="currentColor"/><circle cx="40" cy="38" r="2" fill="currentColor"/><circle cx="8" cy="38" r="2" fill="currentColor"/>'
  },
  {
    id: 'l',
    actionId: 'template.l',
    label: 'Perfil L (Habitación / Esquina)',
    shortLabel: 'Perfil L',
    shortcut: 'L',
    defaultWidth: 5.0,
    defaultDepth: 4.0,
    closed: true,
    hint: 'Planta en L a escala real (5.0 × 4.0 m · conmutable 6 muros cerrados o 2 muros en esquina)',
    previewSvg:
      '<polygon points="9,8 25,8 25,23 39,23 39,40 9,40" stroke-width="2.3"/><circle cx="9" cy="8" r="1.9" fill="currentColor"/><circle cx="25" cy="8" r="1.9" fill="currentColor"/><circle cx="25" cy="23" r="1.9" fill="currentColor"/><circle cx="39" cy="23" r="1.9" fill="currentColor"/><circle cx="39" cy="40" r="1.9" fill="currentColor"/><circle cx="9" cy="40" r="1.9" fill="currentColor"/>'
  },
  {
    id: 'u',
    actionId: 'template.u',
    label: 'Perfil U (3 muros conectados)',
    shortLabel: 'Perfil U',
    shortcut: 'U',
    defaultWidth: 5.0,
    defaultDepth: 4.0,
    closed: false,
    hint: '3 muros conectados en U (5.0 × 4.0 m) listos para continuar o cerrar',
    previewSvg:
      '<polyline points="10,9 10,39 38,39 38,9" stroke-width="2.5"/><polyline points="13.5,10 13.5,35.5 34.5,35.5 34.5,10" stroke-width="1" opacity="0.55"/><circle cx="10" cy="9" r="2" fill="currentColor"/><circle cx="10" cy="39" r="2" fill="currentColor"/><circle cx="38" cy="39" r="2" fill="currentColor"/><circle cx="38" cy="9" r="2" fill="currentColor"/>'
  },
  {
    id: 'c',
    actionId: 'template.c',
    label: 'Perfil C (3 muros laterales)',
    shortLabel: 'Perfil C',
    shortcut: 'P',
    defaultWidth: 5.0,
    defaultDepth: 4.0,
    closed: false,
    hint: '3 muros conectados en C (5.0 × 4.0 m) abiertos hacia un costado',
    previewSvg:
      '<polyline points="38,10 10,10 10,38 38,38" stroke-width="2.5"/><polyline points="37,13.5 13.5,13.5 13.5,34.5 37,34.5" stroke-width="1" opacity="0.55"/><circle cx="38" cy="10" r="2" fill="currentColor"/><circle cx="10" cy="10" r="2" fill="currentColor"/><circle cx="10" cy="38" r="2" fill="currentColor"/><circle cx="38" cy="38" r="2" fill="currentColor"/>'
  },
  {
    id: 't',
    actionId: 'template.t',
    label: 'Perfil T (División interior)',
    shortLabel: 'Perfil T',
    shortcut: 'T',
    defaultWidth: 5.0,
    defaultDepth: 4.0,
    closed: false,
    hint: 'Muros de división interior conectados en T (5.0 × 4.0 m) para partir espacios',
    previewSvg:
      '<line x1="8" y1="11" x2="40" y2="11" stroke-width="2.6"/><line x1="24" y1="11" x2="24" y2="40" stroke-width="2.6"/><circle cx="8" cy="11" r="2" fill="currentColor"/><circle cx="24" cy="11" r="2.3" fill="currentColor"/><circle cx="40" cy="11" r="2" fill="currentColor"/><circle cx="24" cy="40" r="2" fill="currentColor"/>'
  },
  {
    id: 'cross',
    actionId: 'template.cross',
    label: 'Cruz (+) (División 4 cuartos)',
    shortLabel: 'Cruz (+)',
    shortcut: 'Y',
    defaultWidth: 6.0,
    defaultDepth: 6.0,
    closed: false,
    hint: '4 tramos de muro interiores en cruz (+) (6.0 × 6.0 m) para dividir en 4 ambientes',
    previewSvg:
      '<line x1="8" y1="24" x2="40" y2="24" stroke-width="2.6"/><line x1="24" y1="8" x2="24" y2="40" stroke-width="2.6"/><circle cx="24" cy="24" r="2.4" fill="currentColor"/><circle cx="8" cy="24" r="1.9" fill="currentColor"/><circle cx="40" cy="24" r="1.9" fill="currentColor"/><circle cx="24" cy="8" r="1.9" fill="currentColor"/><circle cx="24" cy="40" r="1.9" fill="currentColor"/>'
  },
  {
    id: 'ring',
    actionId: 'template.ring',
    label: 'Anillo / Muro Circular',
    shortLabel: 'Anillo Circular',
    shortcut: 'N',
    defaultWidth: 6.0,
    defaultDepth: 6.0,
    defaultSegments: 12,
    closed: true,
    hint: 'Polilínea cerrada de muros poligonales a escala de habitación (Ø 6.0 m)',
    previewSvg:
      '<polygon points="24,7 32.5,9.3 38.7,15.5 41,24 38.7,32.5 32.5,38.7 24,41 15.5,38.7 9.3,32.5 7,24 9.3,15.5 15.5,9.3" stroke-width="2.3"/><circle cx="24" cy="7" r="1.6" fill="currentColor"/><circle cx="41" cy="24" r="1.6" fill="currentColor"/><circle cx="24" cy="41" r="1.6" fill="currentColor"/><circle cx="7" cy="24" r="1.6" fill="currentColor"/>'
  },
  {
    id: 'arc',
    actionId: 'template.arc',
    label: 'Arco / Bahía Curva de Muros',
    shortLabel: 'Muro en Arco',
    shortcut: 'B',
    defaultWidth: 5.0,
    defaultDepth: 2.5,
    defaultSegments: 8,
    closed: false,
    hint: 'Polilínea abierta de muros en arco (5.0 × 2.5 m) para fachadas curvas o ábsides',
    previewSvg:
      '<polyline points="7,36 9.5,24.5 16,15.5 24,12 32,15.5 38.5,24.5 41,36" stroke-width="2.4"/><circle cx="7" cy="36" r="2" fill="currentColor"/><circle cx="24" cy="12" r="2" fill="currentColor"/><circle cx="41" cy="36" r="2" fill="currentColor"/>'
  }
]

const TEMPLATE_BY_ID = new Map<WallTemplateId, WallTemplateDef>(
  WALL_TEMPLATES.map((tpl) => [tpl.id, tpl])
)

const SHAPE_TO_TEMPLATE: Readonly<Record<string, WallTemplateId>> = {
  'shape.l': 'l',
  'shape.u': 'u',
  'shape.c': 'c',
  'shape.t': 't',
  'shape.cross': 'cross',
  'shape.ring': 'ring',
  'shape.arc': 'arc',
  'template.rect': 'rect',
  'template.l': 'l',
  'template.u': 'u',
  'template.c': 'c',
  'template.t': 't',
  'template.cross': 'cross',
  'template.ring': 'ring',
  'template.arc': 'arc'
}

export function getWallTemplateDef(id: WallTemplateId): WallTemplateDef {
  return TEMPLATE_BY_ID.get(id) ?? WALL_TEMPLATES[0]
}

/**
 * Si un id de catálogo (`shape.l`, `shape.u`, etc.) corresponde a una forma
 * predefinida de muros 2D, devuelve su `WallTemplateId`.
 */
export function resolveWallTemplateId(idOrShape: string | null | undefined): WallTemplateId | null {
  if (!idOrShape) return null
  return SHAPE_TO_TEMPLATE[idOrShape] ?? null
}

function roundCoord(v: number): number {
  return Math.round(v * 10000) / 10000
}

/**
 * Construye los segmentos de muro conectados en coordenadas de mundo (XZ + cota Y)
 * garantizando coincidencia exacta de vértices entre tramos contiguos.
 */
export function buildWallTemplateSegments(options: BuildWallTemplateOptions): WallSegmentPoints[] {
  const {
    templateId,
    centerX,
    centerZ,
    rotationDeg = 0,
    elevation = 0,
    lVariant = 'room'
  } = options

  const w = Math.max(0.5, options.width)
  const d = Math.max(0.5, options.depth)
  const hw = w * 0.5
  const hd = d * 0.5

  const rad = (((rotationDeg % 360) + 360) % 360) * (Math.PI / 180)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const toWorld = (lx: number, lz: number): THREE.Vector3 => {
    const rx = lx * cos - lz * sin
    const rz = lx * sin + lz * cos
    return new THREE.Vector3(roundCoord(centerX + rx), roundCoord(elevation), roundCoord(centerZ + rz))
  }

  const chainToSegments = (pts: THREE.Vector3[], closed: boolean): WallSegmentPoints[] => {
    const segs: WallSegmentPoints[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].distanceTo(pts[i + 1]) > 0.05) {
        segs.push({ start: pts[i].clone(), end: pts[i + 1].clone() })
      }
    }
    if (closed && pts.length >= 3 && pts[pts.length - 1].distanceTo(pts[0]) > 0.05) {
      segs.push({ start: pts[pts.length - 1].clone(), end: pts[0].clone() })
    }
    return segs
  }

  switch (templateId) {
    case 'rect': {
      const p0 = toWorld(-hw, -hd)
      const p1 = toWorld(hw, -hd)
      const p2 = toWorld(hw, hd)
      const p3 = toWorld(-hw, hd)
      return chainToSegments([p0, p1, p2, p3], true)
    }

    case 'l': {
      if (lVariant === 'corner') {
        // 2 muros conectados en esquina de 90°
        const p0 = toWorld(-hw, -hd)
        const p1 = toWorld(-hw, hd)
        const p2 = toWorld(hw, hd)
        return chainToSegments([p0, p1, p2], false)
      }
      // 6 muros conectados formando una habitación/pasillo cerrado en L
      // El brazo tiene 50 % del ancho/fondo redondeado a múltiplos limpios de 0.25 m
      const stepW = Math.max(0.5, Math.min(w - 0.5, Math.round((w * 0.5) * 4) / 4))
      const stepD = Math.max(0.5, Math.min(d - 0.5, Math.round((d * 0.5) * 4) / 4))
      const innerX = -hw + stepW
      const innerZ = hd - stepD
      const pts = [
        toWorld(-hw, -hd),
        toWorld(innerX, -hd),
        toWorld(innerX, innerZ),
        toWorld(hw, innerZ),
        toWorld(hw, hd),
        toWorld(-hw, hd)
      ]
      return chainToSegments(pts, true)
    }

    case 'u': {
      // 3 muros conectados abiertos hacia el norte (-Z local)
      const p0 = toWorld(-hw, -hd)
      const p1 = toWorld(-hw, hd)
      const p2 = toWorld(hw, hd)
      const p3 = toWorld(hw, -hd)
      return chainToSegments([p0, p1, p2, p3], false)
    }

    case 'c': {
      // 3 muros conectados abiertos hacia el este (+X local)
      const p0 = toWorld(hw, -hd)
      const p1 = toWorld(-hw, -hd)
      const p2 = toWorld(-hw, hd)
      const p3 = toWorld(hw, hd)
      return chainToSegments([p0, p1, p2, p3], false)
    }

    case 't': {
      // División en T: travesaño superior partido en el nodo central + alma vertical (3 tramos conectados en el nodo)
      const left = toWorld(-hw, -hd)
      const mid = toWorld(0, -hd)
      const right = toWorld(hw, -hd)
      const bottom = toWorld(0, hd)
      return [
        { start: left, end: mid.clone() },
        { start: mid.clone(), end: right },
        { start: mid.clone(), end: bottom }
      ]
    }

    case 'cross': {
      // División en Cruz (+): 4 brazos conectados exactamente en el vértice central
      const center = toWorld(0, 0)
      const west = toWorld(-hw, 0)
      const east = toWorld(hw, 0)
      const north = toWorld(0, -hd)
      const south = toWorld(0, hd)
      return [
        { start: west, end: center.clone() },
        { start: center.clone(), end: east },
        { start: north, end: center.clone() },
        { start: center.clone(), end: south }
      ]
    }

    case 'ring': {
      const n = Math.max(6, Math.min(32, Math.round(options.segmentsCount ?? 12)))
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2
        pts.push(toWorld(Math.cos(angle) * hw, Math.sin(angle) * hd))
      }
      return chainToSegments(pts, true)
    }

    case 'arc': {
      const n = Math.max(4, Math.min(24, Math.round(options.segmentsCount ?? 8)))
      const pts: THREE.Vector3[] = []
      // Arco de 180° desde (-hw, +hd) pasando por (0, -hd) hasta (+hw, +hd)
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const angle = Math.PI * (1 - t) // π -> 0
        const lx = Math.cos(angle) * hw
        const lz = hd - Math.sin(angle) * d
        pts.push(toWorld(lx, lz))
      }
      return chainToSegments(pts, false)
    }
  }
}

export type SnapKind = 'wall-vertex' | 'wall-edge' | 'grid' | 'none'

export interface SnapResult {
  point: THREE.Vector3
  kind: SnapKind
  snappedToVertex: boolean
  snappedToWall: boolean
}

/**
 * Imán CAD combinado para dibujo 2D/3D:
 * 1. Prioriza vértices existentes (`start` / `end`) de muros en la planta activa (radio magnético).
 * 2. Si no hay vértice cercano, proyecta sobre aristas de muros existentes y alinea la coordenada libre a la rejilla.
 * 3. En espacio libre, engancha al paso de cuadrícula (`gridStep`, por defecto 0.5 m).
 */
export function snapPointToWallsAndGrid(
  raw: THREE.Vector3,
  walls: readonly Wall[],
  activeLevelId: string,
  options: {
    snapEnabled?: boolean
    gridStep?: number
    vertexRadius?: number
    edgeRadius?: number
    excludeWallId?: string
  } = {}
): SnapResult {
  if (options.snapEnabled === false) {
    return { point: raw.clone(), kind: 'none', snappedToVertex: false, snappedToWall: false }
  }

  const gridStep = options.gridStep ?? 0.5
  const vertexRadius = options.vertexRadius ?? 0.38
  const edgeRadius = options.edgeRadius ?? 0.28

  // 1. Imán a vértices existentes
  let bestVertex: THREE.Vector3 | null = null
  let bestVertexDist = vertexRadius

  for (const wall of walls) {
    if (wall.levelId !== activeLevelId || !wall.visible) continue
    if (options.excludeWallId && wall.id === options.excludeWallId) continue

    const dStart = Math.hypot(raw.x - wall.start.x, raw.z - wall.start.z)
    if (dStart <= bestVertexDist) {
      bestVertexDist = dStart
      bestVertex = new THREE.Vector3(wall.start.x, 0, wall.start.z)
    }

    const dEnd = Math.hypot(raw.x - wall.end.x, raw.z - wall.end.z)
    if (dEnd <= bestVertexDist) {
      bestVertexDist = dEnd
      bestVertex = new THREE.Vector3(wall.end.x, 0, wall.end.z)
    }
  }

  if (bestVertex) {
    return { point: bestVertex, kind: 'wall-vertex', snappedToVertex: true, snappedToWall: true }
  }

  // 2. Imán a segmentos de muros existentes (para conectar divisiones T / Cruz sobre un muro)
  let bestEdgePoint: THREE.Vector3 | null = null
  let bestEdgeDist = edgeRadius

  for (const wall of walls) {
    if (wall.levelId !== activeLevelId || !wall.visible) continue
    if (options.excludeWallId && wall.id === options.excludeWallId) continue

    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const len = Math.hypot(dx, dz)
    if (len < 0.2) continue

    const ux = dx / len
    const uz = dz / len
    const proj = (raw.x - wall.start.x) * ux + (raw.z - wall.start.z) * uz
    if (proj <= 0.05 || proj >= len - 0.05) continue

    const perp = Math.abs((raw.x - wall.start.x) * -uz + (raw.z - wall.start.z) * ux)
    if (perp <= bestEdgeDist) {
      // Redondear el avance a lo largo del muro a incrementos de 0.25 m para cotas limpias
      const snappedProj = Math.min(len - 0.1, Math.max(0.1, Math.round(proj * 4) / 4))
      bestEdgeDist = perp
      bestEdgePoint = new THREE.Vector3(
        roundCoord(wall.start.x + ux * snappedProj),
        0,
        roundCoord(wall.start.z + uz * snappedProj)
      )
    }
  }

  if (bestEdgePoint) {
    return { point: bestEdgePoint, kind: 'wall-edge', snappedToVertex: false, snappedToWall: true }
  }

  // 3. Imán a la cuadrícula CAD (0.5 m)
  const gx = roundCoord(Math.round(raw.x / gridStep) * gridStep)
  const gz = roundCoord(Math.round(raw.z / gridStep) * gridStep)
  return {
    point: new THREE.Vector3(gx, 0, gz),
    kind: 'grid',
    snappedToVertex: false,
    snappedToWall: false
  }
}

/** Extrae la lista de vértices únicos en XZ de un conjunto de segmentos para pintar marcadores. */
export function uniqueTemplateVertices(segments: ReadonlyArray<WallSegmentPoints>): THREE.Vector3[] {
  const unique: THREE.Vector3[] = []
  const seen = new Set<string>()
  for (const seg of segments) {
    for (const pt of [seg.start, seg.end]) {
      const key = `${Math.round(pt.x * 1000)}:${Math.round(pt.z * 1000)}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(pt.clone())
      }
    }
  }
  return unique
}
