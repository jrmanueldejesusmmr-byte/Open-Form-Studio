import * as THREE from 'three'
import { applyMeterUVs } from './MaterialSystem'
import { DEFAULT_ROOF_OVERHANG, DEFAULT_ROOF_SLOPE, DEFAULT_ROOF_THICKNESS } from '../models/Roof'

/**
 * Constructor del techo ajustado a la vivienda.
 *
 * Dos bloques:
 *   1. `traceFootprint`: a partir de los muros de un piso (segmentos en XZ)
 *      encuentra el polígono cerrado que los une; si hay extremos sueltos
 *      devuelve los problemas para marcarlos en rojo en el visor.
 *   2. `buildFittedRoofGeometry`: genera la geometría del techo (voladizo,
 *      pendiente y caballete calculados) sobre esa huella. Para plantas
 *      rectangulares, «A dos aguas» y «A cuatro aguas» son exactas; para
 *      formas en L se aproxima con la envolvente (el llamador avisa).
 *
 * La geometría sale en coordenadas locales: x/z = mundo − ancla de la huella
 * y base en y = 0 (la cota la pone `SceneObject.position`).
 */

/** Punto 2D del plano XZ (x, z en metros; mundo o locales). */
export interface Point2 {
  x: number
  z: number
}

/** Segmento de muro proyectado al plano XZ. */
export interface FootprintSegment {
  a: Point2
  b: Point2
}

export interface FootprintTrace {
  /** Contorno cerrado (antihorario) o `null` si los muros no lo forman. */
  polygon: Point2[] | null
  /** Extremos sin unir (se marcan en rojo en el visor). */
  endpoints: Point2[]
  /** Pares de extremos que deberían unirse (línea sugerida). */
  joins: Array<[Point2, Point2]>
}

/** Separación máxima (m) entre extremos de muro para considerarlos unidos. */
const CLOSE_TOLERANCE = 0.15

export const DEG2RAD = Math.PI / 180

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function mod2pi(angle: number): number {
  const twoPi = Math.PI * 2
  return ((angle % twoPi) + twoPi) % twoPi
}

/* -------------------------------------------------------------------------- */
/* Utilidades de polígono                                                     */
/* -------------------------------------------------------------------------- */

/** Área con signo (shoelace en XZ): positiva = antihorario. */
export function polygonArea(points: readonly Point2[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.z - b.x * a.z
  }
  return area / 2
}

/** Quita duplicados consecutivos y vértices colineales (muros en T). */
export function simplifyPolygon(points: readonly Point2[], eps = 1e-6): Point2[] {
  const dedup: Point2[] = []
  for (const point of points) {
    const last = dedup[dedup.length - 1]
    if (last && Math.hypot(last.x - point.x, last.z - point.z) < eps) continue
    dedup.push({ x: point.x, z: point.z })
  }
  if (dedup.length > 1) {
    const first = dedup[0]
    const last = dedup[dedup.length - 1]
    if (Math.hypot(first.x - last.x, first.z - last.z) < eps) dedup.pop()
  }

  let current = dedup
  for (let pass = 0; pass < 3 && current.length > 3; pass++) {
    const next: Point2[] = []
    const n = current.length
    for (let i = 0; i < n; i++) {
      const prev = current[(i - 1 + n) % n]
      const cur = current[i]
      const after = current[(i + 1) % n]
      const cross = (cur.x - prev.x) * (after.z - prev.z) - (cur.z - prev.z) * (after.x - prev.x)
      const scale = Math.max(1, Math.hypot(after.x - prev.x, after.z - prev.z))
      if (Math.abs(cross) > eps * scale) next.push(cur)
    }
    if (next.length < 3) break
    const done = next.length === current.length
    current = next
    if (done) break
  }
  return current.length >= 3 ? current : dedup.map((p) => ({ ...p }))
}

/** Centroid del área (shoelace); si el polígono es degenerado, la media. */
export function polygonCentroid(points: readonly Point2[]): Point2 {
  let area = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const cross = a.x * b.z - b.x * a.z
    area += cross
    cx += (a.x + b.x) * cross
    cz += (a.z + b.z) * cross
  }
  if (Math.abs(area) < 1e-9) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 })
    return { x: sum.x / Math.max(1, points.length), z: sum.z / Math.max(1, points.length) }
  }
  return { x: cx / (3 * area), z: cz / (3 * area) }
}

/**
 * ¿Rectángulo con lados paralelos a los ejes? Es la condición para que
 * «A dos aguas» y «A cuatro aguas» salgan exactas (el trazo con rejilla y
 * ortogonal del editor produce este tipo de planta).
 */
export function isAxisAlignedRect(points: readonly Point2[]): boolean {
  const poly = simplifyPolygon(points)
  if (poly.length !== 4) return false
  if (Math.abs(polygonArea(poly)) < 0.01) return false
  for (let i = 0; i < 4; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % 4]
    const dx = Math.abs(b.x - a.x)
    const dz = Math.abs(b.z - a.z)
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) return false
    // Cada arista horizontal o vertical (al alternarse cierra ángulos de 90°).
    if (Math.min(dx, dz) > 1e-3 * Math.max(1, len)) return false
  }
  return true
}

/**
 * Desplaza un polígono CCW hacia fuera `distance` metros (miter acotado):
 * es el voladizo del techo.
 */
export function offsetPolygon(points: readonly Point2[], distance: number): Point2[] {
  if (distance <= 0 || points.length < 3) return points.map((p) => ({ ...p }))
  const n = points.length
  const out: Point2[] = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]

    const d1len = Math.hypot(cur.x - prev.x, cur.z - prev.z) || 1
    const d1 = { x: (cur.x - prev.x) / d1len, z: (cur.z - prev.z) / d1len }
    const d2len = Math.hypot(next.x - cur.x, next.z - cur.z) || 1
    const d2 = { x: (next.x - cur.x) / d2len, z: (next.z - cur.z) / d2len }
    // Normal saliente de una arista CCW en XZ: (dz, -dx).
    const n1 = { x: d1.z, z: -d1.x }
    const n2 = { x: d2.z, z: -d2.x }

    const denom = d1.x * d2.z - d1.z * d2.x
    let px: number
    let pz: number
    if (Math.abs(denom) < 1e-9) {
      px = cur.x + n1.x * distance
      pz = cur.z + n1.z * distance
    } else {
      // Intersección de las rectas desplazadas (miter).
      const rhs = { x: (n2.x - n1.x) * distance, z: (n2.z - n1.z) * distance }
      const t = (rhs.x * d2.z - rhs.z * d2.x) / denom
      px = cur.x + n1.x * distance + t * d1.x
      pz = cur.z + n1.z * distance + t * d1.z
    }
    // Miter acotado: evita picos en esquinas muy cerradas o reflexas (L).
    const vx = px - cur.x
    const vz = pz - cur.z
    const len = Math.hypot(vx, vz)
    const maxLen = Math.max(distance * 4, distance + 1e-6)
    if (len > maxLen) {
      px = cur.x + (vx / len) * maxLen
      pz = cur.z + (vz / len) * maxLen
    }
    out.push({ x: px, z: pz })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Trazado del contorno cerrado                                               */
/* -------------------------------------------------------------------------- */

interface FootNode {
  x: number
  z: number
  edges: number[]
}

interface FootEdge {
  n0: number
  n1: number
}

/**
 * Recorre una cara del grafo de muros empezando por `firstEdge` en `start`,
 * girando en cada cruce hacia la arista situada más a la izquierda del rayo
 * entrante. Probando todas las aristas del nodo más a la izquierda se cubre
 * el contorno externo (y se queda después el de mayor área). Devuelve el
 * orden de nodos sin cierre duplicado, o `null` si no logra cerrar.
 */
function walkFace(
  start: number,
  firstEdge: number,
  nodes: readonly FootNode[],
  edges: readonly FootEdge[]
): number[] | null {
  const used = new Set<number>()
  const order: number[] = [start]
  let node = start
  let dir = 0

  const advance = (edgeIdx: number): boolean => {
    used.add(edgeIdx)
    const edge = edges[edgeIdx]
    const next = edge.n0 === node ? edge.n1 : edge.n0
    dir = Math.atan2(nodes[next].z - nodes[node].z, nodes[next].x - nodes[node].x)
    node = next
    order.push(node)
    return node === start
  }

  if (advance(firstEdge)) return null
  for (let step = 0; step < edges.length; step++) {
    if (node === start) break
    const candidates = nodes[node].edges.filter((idx) => !used.has(idx))
    if (candidates.length === 0) return null

    const reverse = dir + Math.PI
    let pick = candidates[0]
    let pickPos = Infinity
    for (const idx of candidates) {
      const edge = edges[idx]
      const other = edge.n0 === node ? edge.n1 : edge.n0
      const angle = Math.atan2(nodes[other].z - nodes[node].z, nodes[other].x - nodes[node].x)
      const pos = mod2pi(angle - reverse)
      if (pos < pickPos) {
        pickPos = pos
        pick = idx
      }
    }
    if (advance(pick)) break
  }
  if (node !== start || order.length < 4) return null
  order.pop()
  return order
}

/** Empareja extremos sueltos con su vecino más cercano (línea sugerida). */
function pairEndpoints(points: Point2[]): { endpoints: Point2[]; joins: Array<[Point2, Point2]> } {
  const rest = points.map((p) => ({ ...p }))
  const joins: Array<[Point2, Point2]> = []
  while (rest.length > 0) {
    const p = rest.shift()!
    if (rest.length === 0) break
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < rest.length; i++) {
      const d = Math.hypot(rest[i].x - p.x, rest[i].z - p.z)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    const q = rest.splice(best, 1)[0]
    joins.push([p, q])
  }
  return { endpoints: points.map((p) => ({ ...p })), joins }
}

/**
 * Trazado del contorno de los muros de un piso.
 *
 * - Cualquier extremo de grado 1 («muro sin cerrar») ⇒ `polygon: null` más
 *   los extremos y pares sugeridos para el marcador rojo del visor.
 * - Si todos están unidos, devuelve el circuito cerrado de MAYOR área desde
 *   el nodo más a la izquierda (los tabiques interiores quedan fuera).
 */
export function traceFootprint(segments: ReadonlyArray<FootprintSegment>): FootprintTrace {
  const nodes: FootNode[] = []
  const edges: FootEdge[] = []

  const nodeFor = (p: Point2): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z) <= CLOSE_TOLERANCE) return i
    }
    nodes.push({ x: p.x, z: p.z, edges: [] })
    return nodes.length - 1
  }

  for (const segment of segments) {
    const n0 = nodeFor(segment.a)
    const n1 = nodeFor(segment.b)
    if (n0 === n1) continue
    edges.push({ n0, n1 })
    const idx = edges.length - 1
    nodes[n0].edges.push(idx)
    nodes[n1].edges.push(idx)
  }

  // Extremos sin unir: el contorno NO cierra.
  const dangling = nodes.filter((node) => node.edges.length === 1)
  if (dangling.length > 0) {
    const paired = pairEndpoints(dangling.map((node) => ({ x: node.x, z: node.z })))
    return { polygon: null, ...paired }
  }
  if (edges.length < 3) return { polygon: null, endpoints: [], joins: [] }

  // Nodo más a la izquierda (desempate: el más abajo).
  let start = 0
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].x < nodes[start].x || (nodes[i].x === nodes[start].x && nodes[i].z < nodes[start].z)) {
      start = i
    }
  }

  let bestOrder: number[] | null = null
  let bestArea = 0
  for (const firstEdge of [...nodes[start].edges]) {
    const order = walkFace(start, firstEdge, nodes, edges)
    if (!order) continue
    const pts = order.map((idx) => ({ x: nodes[idx].x, z: nodes[idx].z }))
    const area = Math.abs(polygonArea(pts))
    if (area > bestArea) {
      bestArea = area
      bestOrder = order
    }
  }
  if (!bestOrder) return { polygon: null, endpoints: [], joins: [] }

  let polygon = simplifyPolygon(bestOrder.map((idx) => ({ x: nodes[idx].x, z: nodes[idx].z })))
  if (polygon.length < 3) return { polygon: null, endpoints: [], joins: [] }
  if (polygonArea(polygon) < 0) polygon = polygon.reverse()
  return { polygon, endpoints: [], joins: [] }
}

/* -------------------------------------------------------------------------- */
/* 2. Geometría del techo                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Área en planta de un contorno (m², siempre positiva). Misma fórmula de
 * shoelace que `costs/takeoff`, expuesta aquí para que el constructor y los
 * tests la compartan sin duplicar lógica.
 */
export function footprintPlanArea(points: readonly Point2[]): number {
  return Math.abs(polygonArea(points))
}

/**
 * Área inclinada de cubierta (m²): área en planta / cos(pendiente).
 * `slopeDeg` en grados (0 = plana).
 */
export function inclinedArea(planArea: number, slopeDeg: number): number {
  const slope = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(slopeDeg, 0, 89))
  const cos = Math.cos(slope)
  if (!Number.isFinite(cos) || cos < 1e-6) return planArea
  return planArea / cos
}

/**
 * Área total de cubierta con aleros (m²):
 *   área inclinada del contorno + perímetro × alero.
 * El alero se mide como banda de ancho `overhang` alrededor del contorno
 * (perímetro × alero), aproximación estándar de cubicación.
 */
export function roofTotalArea(
  footprint: readonly Point2[],
  slopeDeg: number,
  overhang: number
): number {
  const plan = footprintPlanArea(footprint)
  if (plan <= 0) return 0
  let perimeter = 0
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % footprint.length]
    perimeter += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return inclinedArea(plan, slopeDeg) + Math.max(0, perimeter) * Math.max(0, overhang)
}

/**
 * Cota del alero de un techo: elevación del piso origen + su altura.
 * Dinámica (1, 2, 3… N pisos): nunca usa una fórmula fija de 2 pisos.
 */
export function eaveElevation(sourceElevation: number, sourceHeight: number): number {
  return sourceElevation + sourceHeight
}

/** Perfil (perpendicular, y) de un prisma. */
type Profile = Array<[number, number]>

function pushTri(positions: number[], a: number[], b: number[], c: number[]): void {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
}

function pushQuad(positions: number[], a: number[], b: number[], c: number[], d: number[]): void {
  pushTri(positions, a, b, c)
  pushTri(positions, a, c, d)
}

function finalize(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  // UVs métricas: las tejas escalan igual en cualquier tamaño de cubierta.
  applyMeterUVs(geometry)
  return geometry
}

function bbox(points: readonly Point2[]): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    z0 = Math.min(z0, p.z)
    z1 = Math.max(z1, p.z)
  }
  return { x0, x1, z0, z1 }
}

/** Triangulación «ear clipping» de un polígono simple CCW (devuelve índices). */
function triangulate(points: readonly Point2[]): Array<[number, number, number]> {
  const n = points.length
  if (n < 3) return []
  if (n === 3) return [[0, 1, 2]]

  const isConvex = (a: Point2, b: Point2, c: Point2): boolean =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 1e-9

  const pointInTri = (p: Point2, a: Point2, b: Point2, c: Point2): boolean => {
    const d1 = (p.x - b.x) * (a.z - b.z) - (a.x - b.x) * (p.z - b.z)
    const d2 = (p.x - c.x) * (b.z - c.z) - (b.x - c.x) * (p.z - c.z)
    const d3 = (p.x - a.x) * (c.z - a.z) - (c.x - a.x) * (p.z - a.z)
    const neg = d1 < 0 || d2 < 0 || d3 < 0
    const pos = d1 > 0 || d2 > 0 || d3 > 0
    return !(neg && pos)
  }

  const remaining = Array.from({ length: n }, (_, i) => i)
  const tris: Array<[number, number, number]> = []
  let guard = 0
  while (remaining.length > 3 && guard++ < n * n + 16) {
    let cut = false
    for (let i = 0; i < remaining.length; i++) {
      const ia = remaining[(i - 1 + remaining.length) % remaining.length]
      const ib = remaining[i]
      const ic = remaining[(i + 1) % remaining.length]
      if (!isConvex(points[ia], points[ib], points[ic])) continue
      let contains = false
      for (const io of remaining) {
        if (io === ia || io === ib || io === ic) continue
        if (pointInTri(points[io], points[ia], points[ib], points[ic])) {
          contains = true
          break
        }
      }
      if (contains) continue
      tris.push([ia, ib, ic])
      remaining.splice(i, 1)
      cut = true
      break
    }
    if (!cut) {
      // Degenerado: abanico simple con el resto (mejor que no cerrar la malla).
      for (let i = 1; i + 1 < remaining.length; i++) {
        tris.push([remaining[0], remaining[i], remaining[i + 1]])
      }
      return tris
    }
  }
  if (remaining.length === 3) tris.push([remaining[0], remaining[1], remaining[2]])
  return tris
}

/* -------------------------------------------------------------------------- */
/* 3. Geometría ajustada al contorno (techos por área)                        */
/* -------------------------------------------------------------------------- */

export interface FittedRoofInput {
  /** Contorno de muros (mundo XZ, sin voladizo). */
  footprint: readonly Point2[]
  /** 'flat' | 'gable' | 'hip' (otros tipos caen a su equivalente). */
  type: string
  /** Pendiente en grados (0 = plana). */
  slope: number
  /** Voladizo en m. */
  overhang: number
  /** Espesor de la losa (m). */
  thickness: number
  /** Dirección de cumbrera en dos aguas ('x' | 'z'). */
  ridgeDir: 'x' | 'z'
}

export interface FittedRoofGeometry {
  geometry: THREE.BufferGeometry
  /** Ancla mundo XZ (mínimo del bbox con voladizo): posición del objeto. */
  anchor: Point2
  /** Altura máxima sobre el alero (m). */
  ridgeHeight: number
}

/**
 * Construye la geometría de un techo que cubre el contorno dado (rectángulo,
 * L, T o polígono simple cualquiera). Locales: x/z = mundo − ancla, base del
 * alero en y = 0 (la cota la pone `SceneObject.position`).
 */
export function buildFittedRoofGeometry(input: FittedRoofInput): FittedRoofGeometry | null {
  const clean = simplifyPolygon(input.footprint)
  if (clean.length < 3) return null
  const ccw = polygonArea(clean) < 0 ? [...clean].reverse() : [...clean]
  const slopeDeg = Number.isFinite(input.slope) ? clamp(input.slope, 0, 60) : DEFAULT_ROOF_SLOPE
  const overhang = Number.isFinite(input.overhang) ? Math.max(0, Math.min(2, input.overhang)) : DEFAULT_ROOF_OVERHANG
  const thickness = Number.isFinite(input.thickness) ? Math.max(0.02, Math.min(1, input.thickness)) : DEFAULT_ROOF_THICKNESS
  const type = input.type === 'flat' ? 'flat' : input.type === 'hip' ? 'hip' : 'gable'
  if (type === 'flat') return buildFlatSlab(ccw, overhang, thickness)
  const expanded = offsetPolygon(ccw, overhang)
  const box = bbox(expanded)
  const anchor: Point2 = { x: box.x0, z: box.z0 }
  const local = expanded.map((p) => ({ x: p.x - anchor.x, z: p.z - anchor.z }))
  const w = Math.max(0.05, box.x1 - box.x0)
  const d = Math.max(0.05, box.z1 - box.z0)
  const tan = Math.tan(slopeDeg * DEG2RAD)
  const ridgeAlongX = input.ridgeDir === 'z' ? false : input.ridgeDir === 'x' ? true : w >= d
  const half = (ridgeAlongX ? d : w) / 2
  const ridgeHeight = half * tan
  const positions: number[] = []
  if (type === 'hip' && isAxisAlignedRect(ccw)) {
    buildHipRect(positions, w, d, ridgeHeight, thickness)
    return { geometry: finalize(positions), anchor, ridgeHeight }
  }
  buildGableOverBox(positions, local, w, d, ridgeAlongX, ridgeHeight, thickness)
  return { geometry: finalize(positions), anchor, ridgeHeight }
}

/** Losa plana con espesor sobre el contorno + voladizo. */
function buildFlatSlab(poly: Point2[], overhang: number, thickness: number): FittedRoofGeometry {
  const expanded = offsetPolygon(poly, overhang)
  const box = bbox(expanded)
  const anchor: Point2 = { x: box.x0, z: box.z0 }
  const local = expanded.map((p) => ({ x: p.x - anchor.x, z: p.z - anchor.z }))
  const top = thickness
  const positions: number[] = []
  for (const [a, b, c] of triangulate(local)) {
    const A = local[a]; const B = local[b]; const C = local[c]
    pushTri(positions, [A.x, top, A.z], [C.x, top, C.z], [B.x, top, B.z])
    pushTri(positions, [A.x, 0, A.z], [B.x, 0, B.z], [C.x, 0, C.z])
  }
  const n = local.length
  for (let i = 0; i < n; i++) {
    const A = local[i]; const B = local[(i + 1) % n]
    pushQuad(positions, [A.x, 0, A.z], [B.x, 0, B.z], [B.x, top, B.z], [A.x, top, A.z])
  }
  return { geometry: finalize(positions), anchor, ridgeHeight: thickness }
}

/** Dos faldones sobre el bbox con voladizo (exacto en rectángulo). */
function buildGableOverBox(
  positions: number[],
  local: Point2[],
  w: number,
  d: number,
  ridgeAlongX: boolean,
  ridgeHeight: number,
  thickness: number
): void {
  const tris = triangulate(local)
  const yAt = (x: number, z: number): number => {
    const t = ridgeAlongX ? Math.abs(z - d / 2) / (d / 2 || 1) : Math.abs(x - w / 2) / (w / 2 || 1)
    return Math.max(0, ridgeHeight * (1 - Math.min(1, t)))
  }
  for (const [a, b, c] of tris) {
    const A = local[a]; const B = local[b]; const C = local[c]
    pushTri(
      positions,
      [A.x, yAt(A.x, A.z) + thickness, A.z],
      [C.x, yAt(C.x, C.z) + thickness, C.z],
      [B.x, yAt(B.x, B.z) + thickness, B.z]
    )
    pushTri(
      positions,
      [A.x, yAt(A.x, A.z), A.z],
      [B.x, yAt(B.x, B.z), B.z],
      [C.x, yAt(C.x, C.z), C.z]
    )
  }
  const n = local.length
  for (let i = 0; i < n; i++) {
    const A = local[i]; const B = local[(i + 1) % n]
    const yA = yAt(A.x, A.z); const yB = yAt(B.x, B.z)
    pushQuad(positions, [A.x, yA, A.z], [B.x, yB, B.z], [B.x, yB + thickness, B.z], [A.x, yA + thickness, A.z])
  }
}

/** Cuatro aguas exacto sobre rectángulo (pirámide o cumbrera corta). */
function buildHipRect(
  positions: number[],
  w: number,
  d: number,
  ridgeHeight: number,
  thickness: number
): void {
  const hw = w / 2; const hd = d / 2
  const alongX = w >= d
  const ridgeHalf = Math.max(0, (Math.max(w, d) - Math.min(w, d)) / 2)
  const R0 = alongX ? { x: hw - ridgeHalf, z: hd } : { x: hw, z: hd - ridgeHalf }
  const R1 = alongX ? { x: hw + ridgeHalf, z: hd } : { x: hw, z: hd + ridgeHalf }
  const C = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }]
  const cornerH = (p: { x: number; z: number }): number => {
    const t = alongX ? Math.abs(p.z - hd) / (hd || 1) : Math.abs(p.x - hw) / (hw || 1)
    return Math.max(0, ridgeHeight * (1 - Math.min(1, t)))
  }
  const top = (p: { x: number; z: number }): number[] => [p.x, cornerH(p) + thickness, p.z]
  const r0t = [R0.x, ridgeHeight + thickness, R0.z]
  const r1t = [R1.x, ridgeHeight + thickness, R1.z]
  pushQuad(positions, top(C[0]), top(C[1]), r1t, r0t)
  pushQuad(positions, top(C[1]), top(C[2]), r1t, r1t)
  pushQuad(positions, top(C[2]), top(C[3]), r0t, r1t)
  pushQuad(positions, top(C[3]), top(C[0]), r0t, r0t)
  for (let i = 0; i < 4; i++) {
    const A = C[i]; const B = C[(i + 1) % 4]
    pushQuad(positions, [A.x, 0, A.z], [B.x, 0, B.z], top(B), top(A))
  }
}
