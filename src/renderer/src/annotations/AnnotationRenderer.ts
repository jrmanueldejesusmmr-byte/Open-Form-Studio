import type {
  AnnotationItem,
  AnnotationPoint,
  DimensionAnnotation,
  HighlightAnnotation,
  LeaderAnnotation,
  NoteAnnotation,
  RevisionAnnotation,
  TableAnnotation,
  TagAnnotation,
  TextAnnotation
} from './types'
import { HIGHLIGHT_COLORS } from './types'

/**
 * Componentes visuales de las anotaciones (SVG + etiquetas HTML).
 *
 * Funciones puras: reciben un proyector mundo → pantalla sincronizado con la
 * cámara activa (ortográfica 2D o perspectiva 3D) y devuelven el marcado de la
 * capa overlay. Las líneas, flechas y arcos se calculan en píxeles de pantalla
 * a partir de puntos en metros, así nunca se deforman con el zoom.
 */

export interface ScreenPoint {
  x: number
  y: number
}

export interface TableData {
  projectName: string
  date: string
  scale: string
  wallCount: number
  area: string
  level: string
}

export interface AnnotationRenderContext {
  /** Proyección mundo → píxeles CSS; `null` si el punto no es visible. */
  project(p: AnnotationPoint): ScreenPoint | null
  /** Píxeles por metro alrededor de un punto (para grosores/tamaños en metros). */
  pixelsPerMeter(p: AnnotationPoint): number
  selectedId: string | null
  /** Id en edición: su texto lo pinta el editor flotante (no se duplica). */
  editingId: string | null
  tableData(): TableData
  tagLabel(item: TagAnnotation): string
}

export interface RenderedLayer {
  svg: string
  html: string
}

const BLUE = '#3b82f6'
const BLUE_LIGHT = '#93c5fd'
const DIM_COLOR = '#f59e0b'
const REV_COLOR = '#ef4444'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n: number): string {
  return n.toFixed(1)
}

/** Triángulo de cabeza de flecha con la punta en `tip`, orientado desde `from`. */
export function arrowHead(tip: ScreenPoint, from: ScreenPoint, size = 11, spread = 0.42): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
  const a1 = angle + Math.PI - spread
  const a2 = angle + Math.PI + spread
  const p1 = { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size }
  const p2 = { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size }
  return `M${fmt(tip.x)},${fmt(tip.y)} L${fmt(p1.x)},${fmt(p1.y)} L${fmt(p2.x)},${fmt(p2.y)} Z`
}

/**
 * Trayectoria de nube de revisión: cada arista del polígono (en pantalla) se
 * divide en tramos y cada tramo se dibuja como un arco convexo hacia fuera.
 */
export function revisionCloudPath(pts: ScreenPoint[], arcLength = 22): string {
  if (pts.length < 3) return ''
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  // Con Y hacia abajo, área > 0 = recorrido horario: el exterior queda a la
  // izquierda del avance → `sweep = 1` abomba el arco hacia fuera.
  const sweep = area > 0 ? 1 : 0
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const segments = Math.max(1, Math.round(len / Math.max(8, arcLength)))
    for (let s = 1; s <= segments; s++) {
      const t = s / segments
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const r = (len / segments) * 0.58
      d += ` A${fmt(r)},${fmt(r)} 0 0 ${sweep} ${fmt(x)},${fmt(y)}`
    }
  }
  return `${d} Z`
}

function selectedClass(ctx: AnnotationRenderContext, item: AnnotationItem): string {
  return ctx.selectedId === item.id ? ' is-selected' : ''
}

/* ---------- 1 · Nota ---------- */

function renderNote(item: NoteAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const p = ctx.project(item.position)
  if (!p) return
  const editing = ctx.editingId === item.id
  out.svg += `<g class="annot-node${selectedClass(ctx, item)}" data-annot-id="${item.id}">
    <circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="4.5" fill="${BLUE}" stroke="#0f172a" stroke-width="1.5" />
  </g>`
  if (editing) return
  const lines = (item.text || 'Nota').split('\n').map(escapeHtml).join('<br/>')
  out.html += `<div class="annot-note${selectedClass(ctx, item)}" data-annot-id="${item.id}"
      style="left:${fmt(p.x + 8)}px;top:${fmt(p.y + 8)}px">${lines}</div>`
}

/* ---------- 2 · Directriz ---------- */

export function leaderLanding(elbow: ScreenPoint, end: ScreenPoint, length = 72): ScreenPoint {
  const dir = end.x >= elbow.x ? 1 : -1
  return { x: end.x + dir * length, y: end.y }
}

function renderLeader(item: LeaderAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const [tipW, elbowW, endW] = item.points
  const tip = ctx.project(tipW)
  const elbow = ctx.project(elbowW)
  const end = ctx.project(endW)
  if (!tip || !elbow || !end) return
  const landing = leaderLanding(elbow, end)
  const path = `M${fmt(tip.x)},${fmt(tip.y)} L${fmt(elbow.x)},${fmt(elbow.y)} L${fmt(end.x)},${fmt(end.y)} L${fmt(landing.x)},${fmt(landing.y)}`
  out.svg += `<g class="annot-node${selectedClass(ctx, item)}" data-annot-id="${item.id}">
    <path class="annot-hit" d="${path}" />
    <path d="${path}" fill="none" stroke="${BLUE_LIGHT}" stroke-width="1.6" />
    <path d="${arrowHead(tip, elbow)}" fill="${BLUE_LIGHT}" />
    <circle cx="${fmt(elbow.x)}" cy="${fmt(elbow.y)}" r="2.2" fill="${BLUE_LIGHT}" />
  </g>`
  if (ctx.editingId === item.id) return
  const left = Math.min(end.x, landing.x)
  out.html += `<div class="annot-leader-text${selectedClass(ctx, item)}" data-annot-id="${item.id}"
      style="left:${fmt(left)}px;top:${fmt(end.y - 4)}px;min-width:${fmt(Math.abs(landing.x - end.x))}px">${escapeHtml(item.text || 'Descripción técnica')}</div>`
}

/* ---------- 3 · Nube de revisión ---------- */

function renderRevision(item: RevisionAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const pts = item.points.map((p) => ctx.project(p))
  if (pts.some((p) => !p)) return
  const screen = pts as ScreenPoint[]
  const ppm = ctx.pixelsPerMeter(item.points[0])
  const arc = Math.min(40, Math.max(12, ppm * 0.35))
  const d = revisionCloudPath(screen, arc)
  out.svg += `<g class="annot-node${selectedClass(ctx, item)}" data-annot-id="${item.id}">
    <path d="${d}" fill="rgba(239,68,68,0.06)" stroke="${REV_COLOR}" stroke-width="2" stroke-linejoin="round" />
    <path class="annot-hit" d="${d}" />
  </g>`
  if (!item.badge || ctx.editingId === item.id) return
  // Badge en el vértice superior derecho de la nube (en pantalla).
  const corner = screen.reduce((best, p) => (p.x - p.y > best.x - best.y ? p : best), screen[0])
  out.html += `<div class="annot-rev-badge${selectedClass(ctx, item)}" data-annot-id="${item.id}"
      style="left:${fmt(corner.x + 6)}px;top:${fmt(corner.y - 26)}px">
      <span class="annot-rev-badge__tri">△</span>${escapeHtml(item.badge)}</div>`
}

/* ---------- 4 · Tabla de planos ---------- */

function renderTable(item: TableAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const p = ctx.project(item.position)
  if (!p) return
  const data = ctx.tableData()
  const row = (label: string, value: string): string =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
  out.html += `<div class="annot-table${selectedClass(ctx, item)}" data-annot-id="${item.id}"
      style="left:${fmt(p.x)}px;top:${fmt(p.y)}px">
      <div class="annot-table__head"><span>ARQSTUDIO 3D</span><span>Cuadro de rotulación</span></div>
      <table>
        ${row('Proyecto', data.projectName)}
        ${row('Fecha', data.date)}
        ${row('Escala', data.scale)}
        ${row('Total de muros', String(data.wallCount))}
        ${row('Superficie est.', data.area)}
        ${row('Nivel actual', data.level)}
      </table>
    </div>`
}

/* ---------- 5 · Texto libre ---------- */

function renderText(item: TextAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const p = ctx.project(item.position)
  if (!p || ctx.editingId === item.id) return
  const ppm = ctx.pixelsPerMeter(item.position)
  const fontPx = Math.min(120, Math.max(9, item.fontSize * ppm))
  out.html += `<div class="annot-text${selectedClass(ctx, item)}" data-annot-id="${item.id}"
      style="left:${fmt(p.x)}px;top:${fmt(p.y)}px;font-size:${fmt(fontPx)}px;transform:translate(-50%,-50%) rotate(${item.rotation}deg)">${escapeHtml(item.text || 'TEXTO')}</div>`
}

/* ---------- 6 · Cota lineal ---------- */

/** Puntos desplazados de la línea de cota (en metros) según el offset perpendicular. */
export function dimensionLine(item: Pick<DimensionAnnotation, 'start' | 'end' | 'offset'>): {
  a: AnnotationPoint
  b: AnnotationPoint
  length: number
} {
  const dx = item.end.x - item.start.x
  const dz = item.end.z - item.start.z
  const len = Math.hypot(dx, dz)
  const nx = len > 1e-9 ? -dz / len : 0
  const nz = len > 1e-9 ? dx / len : 0
  return {
    a: { x: item.start.x + nx * item.offset, y: item.start.y, z: item.start.z + nz * item.offset },
    b: { x: item.end.x + nx * item.offset, y: item.end.y, z: item.end.z + nz * item.offset },
    length: Math.hypot(dx, item.end.y - item.start.y, dz)
  }
}

export function formatMeters(length: number): string {
  return `${length.toFixed(2)} m`
}

export function renderDimensionMarkup(
  item: Pick<DimensionAnnotation, 'start' | 'end' | 'offset'>,
  ctx: Pick<AnnotationRenderContext, 'project'>,
  extraClass = '',
  dataId = ''
): { svg: string; html: string } {
  const s = ctx.project(item.start)
  const e = ctx.project(item.end)
  const { a, b, length } = dimensionLine(item)
  const as = ctx.project(a)
  const bs = ctx.project(b)
  if (!s || !e || !as || !bs) return { svg: '', html: '' }
  const ext = (from: ScreenPoint, to: ScreenPoint): string => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const l = Math.hypot(dx, dy) || 1
    // La línea de extensión sobrepasa 6 px la línea de cota (norma de dibujo).
    return `M${fmt(from.x + (dx / l) * 3)},${fmt(from.y + (dy / l) * 3)} L${fmt(to.x + (dx / l) * 6)},${fmt(to.y + (dy / l) * 6)}`
  }
  const mid = { x: (as.x + bs.x) / 2, y: (as.y + bs.y) / 2 }
  let angle = (Math.atan2(bs.y - as.y, bs.x - as.x) * 180) / Math.PI
  if (angle > 90) angle -= 180
  if (angle <= -90) angle += 180
  const id = dataId ? ` data-annot-id="${dataId}"` : ''
  const dimPath = `M${fmt(as.x)},${fmt(as.y)} L${fmt(bs.x)},${fmt(bs.y)}`
  const svg = `<g class="annot-node${extraClass}"${id}>
    <path d="${ext(s, as)} ${ext(e, bs)}" stroke="${DIM_COLOR}" stroke-width="1" fill="none" opacity="0.85" />
    <path d="${dimPath}" stroke="${DIM_COLOR}" stroke-width="1.5" fill="none" />
    <path class="annot-hit" d="${dimPath}" />
    <path d="${arrowHead(as, bs, 10)} ${arrowHead(bs, as, 10)}" fill="${DIM_COLOR}" />
  </g>`
  const html = `<div class="annot-dim-label${extraClass}"${id}
      style="left:${fmt(mid.x)}px;top:${fmt(mid.y)}px;transform:translate(-50%,-50%) rotate(${fmt(angle)}deg) translateY(-11px)">${formatMeters(length)}</div>`
  return { svg, html }
}

function renderDimension(item: DimensionAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const markup = renderDimensionMarkup(item, ctx, selectedClass(ctx, item), item.id)
  out.svg += markup.svg
  out.html += markup.html
}

/* ---------- 7 · Etiqueta de material ---------- */

function renderTag(item: TagAnnotation, ctx: AnnotationRenderContext, out: RenderedLayer): void {
  const p = ctx.project(item.anchor)
  if (!p) return
  const lx = p.x + item.labelOffset.dx
  const ly = p.y + item.labelOffset.dy
  out.svg += `<g class="annot-node${selectedClass(ctx, item)}" data-annot-id="${item.id}">
    <path d="M${fmt(p.x)},${fmt(p.y)} L${fmt(lx)},${fmt(ly)}" stroke="#34d399" stroke-width="1.4" fill="none" stroke-dasharray="4 3" />
    <circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="4" fill="#34d399" stroke="#022c22" stroke-width="1.5" />
  </g>`
  out.html += `<div class="annot-tag${selectedClass(ctx, item)}" data-annot-id="${item.id}"
      style="left:${fmt(lx)}px;top:${fmt(ly)}px">
      <span class="annot-tag__swatch"></span>${escapeHtml(ctx.tagLabel(item))}</div>`
}

/* ---------- 8 · Resaltador ---------- */

export function renderHighlightMarkup(
  item: Pick<HighlightAnnotation, 'shape' | 'points' | 'color' | 'width'>,
  ctx: Pick<AnnotationRenderContext, 'project' | 'pixelsPerMeter'>,
  extraClass = '',
  dataId = ''
): string {
  const color = HIGHLIGHT_COLORS[item.color]
  const id = dataId ? ` data-annot-id="${dataId}"` : ''
  if (item.shape === 'rect') {
    const [p0, p1] = [item.points[0], item.points[item.points.length - 1]]
    const corners = [
      p0,
      { x: p1.x, y: p0.y, z: p0.z },
      p1,
      { x: p0.x, y: p0.y, z: p1.z }
    ].map((p) => ctx.project(p))
    if (corners.some((c) => !c)) return ''
    const d = `M${(corners as ScreenPoint[]).map((c) => `${fmt(c.x)},${fmt(c.y)}`).join(' L')} Z`
    return `<g class="annot-node annot-highlight${extraClass}"${id}>
      <path d="${d}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-opacity="0.7" stroke-width="1.5" />
    </g>`
  }
  const pts = item.points.map((p) => ctx.project(p)).filter((p): p is ScreenPoint => p !== null)
  if (pts.length < 2) return ''
  const widthPx = Math.min(80, Math.max(4, item.width * ctx.pixelsPerMeter(item.points[0])))
  const d = `M${pts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' L')}`
  return `<g class="annot-node annot-highlight${extraClass}"${id}>
    <path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="${fmt(widthPx)}" stroke-linecap="round" stroke-linejoin="round" />
  </g>`
}

/* ---------- Capa completa ---------- */

/** Pinta todas las anotaciones visibles; los resaltados van debajo del resto. */
export function renderAnnotations(items: readonly AnnotationItem[], ctx: AnnotationRenderContext): RenderedLayer {
  const out: RenderedLayer = { svg: '', html: '' }
  for (const item of items) {
    if (item.type === 'highlight') out.svg += renderHighlightMarkup(item, ctx, selectedClass(ctx, item), item.id)
  }
  for (const item of items) {
    switch (item.type) {
      case 'note':
        renderNote(item, ctx, out)
        break
      case 'leader':
        renderLeader(item, ctx, out)
        break
      case 'revision':
        renderRevision(item, ctx, out)
        break
      case 'table':
        renderTable(item, ctx, out)
        break
      case 'text':
        renderText(item, ctx, out)
        break
      case 'dimension':
        renderDimension(item, ctx, out)
        break
      case 'tag':
        renderTag(item, ctx, out)
        break
      case 'highlight':
        break
    }
  }
  return out
}

/* ---------- Previsualización en curso (Borrador) ---------- */

export type AnnotationDraft =
  | { type: 'leader'; tip: AnnotationPoint; elbow?: AnnotationPoint; current: AnnotationPoint }
  | { type: 'dimension'; start: AnnotationPoint; end?: AnnotationPoint; current: AnnotationPoint; offset?: number }
  | { type: 'revision'; points: AnnotationPoint[]; current?: AnnotationPoint }
  | { type: 'highlight'; points: AnnotationPoint[]; shape: 'freehand' | 'rect'; color: import('./types').HighlightColor; width: number }

export function renderDraft(draft: AnnotationDraft, ctx: AnnotationRenderContext): RenderedLayer {
  const out: RenderedLayer = { svg: '', html: '' }
  switch (draft.type) {
    case 'leader': {
      const tip = ctx.project(draft.tip)
      const elbow = draft.elbow ? ctx.project(draft.elbow) : ctx.project(draft.current)
      const current = ctx.project(draft.current)
      if (!tip || !current) return out
      if (!draft.elbow) {
        const path = `M${fmt(tip.x)},${fmt(tip.y)} L${fmt(current.x)},${fmt(current.y)}`
        out.svg = `<g class="annot-draft">
          <path d="${path}" fill="none" stroke="${BLUE_LIGHT}" stroke-width="1.6" stroke-dasharray="4 3" />
          <path d="${arrowHead(tip, current)}" fill="${BLUE_LIGHT}" />
          <circle cx="${fmt(current.x)}" cy="${fmt(current.y)}" r="3" fill="${BLUE}" />
        </g>`
      } else if (elbow) {
        const landing = leaderLanding(elbow, current)
        const path = `M${fmt(tip.x)},${fmt(tip.y)} L${fmt(elbow.x)},${fmt(elbow.y)} L${fmt(current.x)},${fmt(current.y)} L${fmt(landing.x)},${fmt(landing.y)}`
        out.svg = `<g class="annot-draft">
          <path d="${path}" fill="none" stroke="${BLUE_LIGHT}" stroke-width="1.6" />
          <path d="${arrowHead(tip, elbow)}" fill="${BLUE_LIGHT}" />
          <circle cx="${fmt(elbow.x)}" cy="${fmt(elbow.y)}" r="2.5" fill="${BLUE_LIGHT}" />
          <circle cx="${fmt(current.x)}" cy="${fmt(current.y)}" r="3" fill="${BLUE}" />
        </g>`
      }
      break
    }
    case 'dimension': {
      if (!draft.end) {
        const s = ctx.project(draft.start)
        const c = ctx.project(draft.current)
        if (!s || !c) return out
        const dx = draft.current.x - draft.start.x
        const dz = draft.current.z - draft.start.z
        const len = Math.hypot(dx, draft.current.y - draft.start.y, dz)
        out.svg = `<g class="annot-draft">
          <path d="M${fmt(s.x)},${fmt(s.y)} L${fmt(c.x)},${fmt(c.y)}" stroke="${DIM_COLOR}" stroke-width="1.5" stroke-dasharray="4 3" fill="none" />
          <circle cx="${fmt(s.x)}" cy="${fmt(s.y)}" r="3.5" fill="${DIM_COLOR}" />
          <circle cx="${fmt(c.x)}" cy="${fmt(c.y)}" r="3.5" fill="${DIM_COLOR}" />
        </g>`
        const mid = { x: (s.x + c.x) / 2, y: (s.y + c.y) / 2 }
        out.html = `<div class="annot-dim-label is-draft" style="left:${fmt(mid.x)}px;top:${fmt(mid.y)}px;transform:translate(-50%,-50%) translateY(-11px)">${formatMeters(len)}</div>`
      } else {
        const offset = draft.offset ?? 0.5
        const markup = renderDimensionMarkup({ start: draft.start, end: draft.end, offset }, ctx, ' is-draft')
        out.svg = markup.svg
        out.html = markup.html
      }
      break
    }
    case 'revision': {
      const allPts = draft.current ? [...draft.points, draft.current] : draft.points
      if (allPts.length >= 3) {
        const screen = allPts.map((p) => ctx.project(p))
        if (!screen.some((p) => !p)) {
          const ppm = ctx.pixelsPerMeter(allPts[0])
          const arc = Math.min(40, Math.max(12, ppm * 0.35))
          const d = revisionCloudPath(screen as ScreenPoint[], arc)
          out.svg = `<g class="annot-draft">
            <path d="${d}" fill="rgba(239,68,68,0.08)" stroke="${REV_COLOR}" stroke-width="2" stroke-dasharray="5 3" />
          </g>`
        }
      } else if (allPts.length > 0) {
        const screen = allPts.map((p) => ctx.project(p)).filter((p): p is ScreenPoint => p !== null)
        if (screen.length > 0) {
          const d = `M${screen.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' L')}`
          out.svg = `<g class="annot-draft">
            <path d="${d}" stroke="${REV_COLOR}" stroke-width="1.5" stroke-dasharray="4 3" fill="none" />
            ${screen.map((p) => `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="3" fill="${REV_COLOR}" />`).join('')}
          </g>`
        }
      }
      break
    }
    case 'highlight': {
      out.svg = renderHighlightMarkup(draft, ctx, ' is-draft')
      break
    }
  }
  return out
}


