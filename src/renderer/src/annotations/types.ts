import { DEFAULT_LEVEL_ID } from '../models/Level'

/**
 * Modelo de datos de las anotaciones técnicas del menú «Notas».
 *
 * Todas las coordenadas se guardan en **metros del proyecto** (espacio mundo
 * Three.js: X/Z en planta, Y = cota). Así las anotaciones se proyectan igual
 * en la planta ortográfica 2D y en la perspectiva 3D, sin distorsionarse, y se
 * persisten junto al resto del proyecto (SQLite + respaldo local).
 */

/** Punto en metros (espacio mundo). */
export interface AnnotationPoint {
  x: number
  y: number
  z: number
}

/** Las 8 herramientas del menú «Notas». */
export type AnnotationMode =
  | 'note'
  | 'leader'
  | 'revision'
  | 'table'
  | 'text'
  | 'dimension'
  | 'tag'
  | 'highlight'

export type HighlightColor = 'yellow' | 'cyan'

interface AnnotationBase {
  id: string
  /** Piso al que pertenece (se oculta con el ojo del piso). */
  levelId: string
  createdAt: number
}

/** 1 · Nota adhesiva / cuadro de llamada. */
export interface NoteAnnotation extends AnnotationBase {
  type: 'note'
  position: AnnotationPoint
  text: string
}

/** 2 · Directriz con flecha (origen → codo → asiento horizontal + texto). */
export interface LeaderAnnotation extends AnnotationBase {
  type: 'leader'
  /** [punta de flecha, codo, final del asiento]. */
  points: [AnnotationPoint, AnnotationPoint, AnnotationPoint]
  text: string
}

/** 3 · Nube de revisión (polígono con arcos convexos) + badge. */
export interface RevisionAnnotation extends AnnotationBase {
  type: 'revision'
  points: AnnotationPoint[]
  badge: string
}

/** 4 · Tabla de planos / cuadro de rotulación (datos en vivo). */
export interface TableAnnotation extends AnnotationBase {
  type: 'table'
  position: AnnotationPoint
}

/** 5 · Texto libre (nombres de estancias). */
export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  position: AnnotationPoint
  text: string
  /** Altura del texto en metros reales (escala con el zoom). */
  fontSize: number
  /** Rotación en grados (múltiplos de 90). */
  rotation: 0 | 90 | 180 | 270
}

/** 6 · Cota lineal. */
export interface DimensionAnnotation extends AnnotationBase {
  type: 'dimension'
  start: AnnotationPoint
  end: AnnotationPoint
  /** Desplazamiento perpendicular (m) de la línea de cota (con signo). */
  offset: number
}

/** 7 · Etiqueta de material conectada con línea guía. */
export interface TagAnnotation extends AnnotationBase {
  type: 'tag'
  anchor: AnnotationPoint
  targetKind: 'wall' | 'object'
  targetId: string
  /** Texto detectado al crearla (respaldo si el elemento desaparece). */
  label: string
  /** Desplazamiento en píxeles de pantalla de la etiqueta respecto al ancla. */
  labelOffset: { dx: number; dy: number }
}

/** 8 · Resaltador (trazo a mano alzada o rectángulo). */
export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight'
  shape: 'freehand' | 'rect'
  points: AnnotationPoint[]
  color: HighlightColor
  /** Grosor del trazo a mano alzada, en metros. */
  width: number
}

export type AnnotationItem =
  | NoteAnnotation
  | LeaderAnnotation
  | RevisionAnnotation
  | TableAnnotation
  | TextAnnotation
  | DimensionAnnotation
  | TagAnnotation
  | HighlightAnnotation

export const ANNOTATION_MODE_LABELS: Record<AnnotationMode, string> = {
  note: 'Nota de texto',
  leader: 'Directriz',
  revision: 'Nube de revisión',
  table: 'Tabla de planos',
  text: 'Texto libre',
  dimension: 'Cota lineal',
  tag: 'Etiqueta de material',
  highlight: 'Resaltador'
}

/** Acción del menú «Notas» → modo de dibujo. */
export const ANNOTATION_ACTIONS: Readonly<Record<string, AnnotationMode>> = {
  'notas.note': 'note',
  'notas.leader': 'leader',
  'notas.revision': 'revision',
  'notas.table': 'table',
  'annot.text': 'text',
  'annot.dimension': 'dimension',
  'annot.tag': 'tag',
  'annot.highlight': 'highlight'
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#facc15',
  cyan: '#22d3ee'
}

let idCounter = 0
export function createAnnotationId(): string {
  idCounter += 1
  return `annot-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`
}

/* ---------- Validación al cargar (proyectos guardados / importados) ---------- */

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function point(raw: unknown): AnnotationPoint | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.z))) return null
  return { x: num(p.x), y: num(p.y), z: num(p.z) }
}

function points(raw: unknown): AnnotationPoint[] {
  return Array.isArray(raw) ? raw.map(point).filter((p): p is AnnotationPoint => p !== null) : []
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** Normaliza un array desconocido en `AnnotationItem[]` (descarta entradas corruptas). */
export function normalizeAnnotations(raw: unknown): AnnotationItem[] {
  if (!Array.isArray(raw)) return []
  const out: AnnotationItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    const base = {
      id: str(r.id) || createAnnotationId(),
      levelId: str(r.levelId, DEFAULT_LEVEL_ID) || DEFAULT_LEVEL_ID,
      createdAt: num(r.createdAt, Date.now())
    }
    switch (r.type) {
      case 'note': {
        const position = point(r.position)
        if (position) out.push({ ...base, type: 'note', position, text: str(r.text) })
        break
      }
      case 'leader': {
        const pts = points(r.points)
        if (pts.length >= 3) out.push({ ...base, type: 'leader', points: [pts[0], pts[1], pts[2]], text: str(r.text) })
        break
      }
      case 'revision': {
        const pts = points(r.points)
        if (pts.length >= 3) out.push({ ...base, type: 'revision', points: pts, badge: str(r.badge) })
        break
      }
      case 'table': {
        const position = point(r.position)
        if (position) out.push({ ...base, type: 'table', position })
        break
      }
      case 'text': {
        const position = point(r.position)
        const rot = num(r.rotation)
        const rotation = (rot === 90 || rot === 180 || rot === 270 ? rot : 0) as TextAnnotation['rotation']
        if (position) {
          out.push({
            ...base,
            type: 'text',
            position,
            text: str(r.text),
            fontSize: Math.min(3, Math.max(0.05, num(r.fontSize, 0.35))),
            rotation
          })
        }
        break
      }
      case 'dimension': {
        const start = point(r.start)
        const end = point(r.end)
        if (start && end) out.push({ ...base, type: 'dimension', start, end, offset: num(r.offset, 0.5) })
        break
      }
      case 'tag': {
        const anchor = point(r.anchor)
        const off = (r.labelOffset && typeof r.labelOffset === 'object' ? r.labelOffset : {}) as Record<string, unknown>
        if (anchor) {
          out.push({
            ...base,
            type: 'tag',
            anchor,
            targetKind: r.targetKind === 'object' ? 'object' : 'wall',
            targetId: str(r.targetId),
            label: str(r.label),
            labelOffset: { dx: num(off.dx, 70), dy: num(off.dy, -56) }
          })
        }
        break
      }
      case 'highlight': {
        const pts = points(r.points)
        if (pts.length >= 2) {
          out.push({
            ...base,
            type: 'highlight',
            shape: r.shape === 'rect' ? 'rect' : 'freehand',
            points: pts,
            color: r.color === 'cyan' ? 'cyan' : 'yellow',
            width: Math.min(3, Math.max(0.05, num(r.width, 0.35)))
          })
        }
        break
      }
    }
  }
  return out
}

/** Traslada todos los puntos de una anotación (mover con arrastre). */
export function translateAnnotation(item: AnnotationItem, dx: number, dz: number): void {
  const move = (p: AnnotationPoint): void => {
    p.x += dx
    p.z += dz
  }
  switch (item.type) {
    case 'note':
    case 'table':
    case 'text':
      move(item.position)
      break
    case 'leader':
    case 'revision':
    case 'highlight':
      item.points.forEach(move)
      break
    case 'dimension':
      move(item.start)
      move(item.end)
      break
    case 'tag':
      // El ancla queda pegada al elemento: se desplaza la etiqueta en pantalla.
      break
  }
}

/** ¿Tiene la anotación un texto editable? */
export function editableField(item: AnnotationItem): 'text' | 'badge' | null {
  if (item.type === 'note' || item.type === 'leader' || item.type === 'text') return 'text'
  if (item.type === 'revision') return 'badge'
  return null
}
