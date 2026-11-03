import * as THREE from 'three'
import type { ExportContext } from './index'
import type { Level } from '../models/Level'
import type { Wall } from '../models/Wall'
import type { SceneObject } from '../models/SceneObject'
import { computeLevelFootprint } from './index'

export interface PlanSegment {
  layer: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PlanText {
  layer: string
  x: number
  y: number
  text: string
  height?: number
  rotation?: number
}

export interface PlanPolygon {
  layer: string
  points: { x: number; y: number }[]
  closed?: boolean
}

export const LAYERS = [
  'MUROS', 'PUERTAS', 'VENTANAS', 'COTAS', 'MOBILIARIO', 'TEXTO',
  'PISOS', 'OBJETOS', 'ANOTACIONES',
  'A-WALL', 'A-DOOR', 'A-GLAZ', 'A-DIMS', 'A-FURN', 'A-FLOR', 'A-ANNO'
] as const

export const LAYER_COLORS: Record<string, number> = {
  MUROS: 7,
  PUERTAS: 1,
  VENTANAS: 5,
  COTAS: 3,
  MOBILIARIO: 6,
  TEXTO: 2,
  PISOS: 8,
  OBJETOS: 4,
  ANOTACIONES: 9,
  'A-WALL': 7,
  'A-DOOR': 1,
  'A-GLAZ': 5,
  'A-DIMS': 3,
  'A-FURN': 6,
  'A-FLOR': 8,
  'A-ANNO': 2
}

export function toPlan(x: number, z: number): { x: number; y: number } {
  return { x, y: -z }
}

function wallBasis(wall: Wall) {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len
  const uz = dz / len
  // normal apuntando a la "izquierda" del muro (igual que WallMeshBuilder)
  const nx = -uz
  const nz = ux
  return { ux, uz, nx, nz, len }
}

function fmt(n: number): string {
  return Number(n).toFixed(6)
}

function collectWalls(context: ExportContext, levelId?: string): Wall[] {
  if (!levelId) return [...context.walls]
  return context.walls.filter((w) => (w.levelId) === levelId)
}

function collectObjects(context: ExportContext, levelId?: string): SceneObject[] {
  if (!levelId) return [...context.objects]
  return context.objects.filter((o) => (o.levelId) === levelId)
}

function levelsToExport(context: ExportContext, levelId?: string): Level[] {
  if (levelId) {
    const l = context.levels.find((x) => x.id === levelId)
    return l ? [l] : []
  }
  return context.levels.length ? [...context.levels] : []
}

function objectFootprintPoints(obj: SceneObject): { x: number; y: number }[] {
  const halfW = obj.size.x / 2
  const halfD = obj.size.z / 2
  const cos = Math.cos(obj.rotationY)
  const sin = Math.sin(obj.rotationY)
  const corners = [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW, z: halfD },
    { x: -halfW, z: halfD },
  ]
  return corners.map((c) => {
    const rx = c.x * cos - c.z * sin
    const rz = c.x * sin + c.z * cos
    const p = toPlan(obj.position.x + rx, obj.position.z + rz)
    return p
  })
}

function isDoorObject(obj: SceneObject): boolean {
  const name = (obj.name || '').toLowerCase()
  const shape = (obj.shapeId || '').toLowerCase()
  if (obj.openingVariant) return true
  return name.includes('puerta') || name.includes('door') || shape.includes('door') || shape.includes('puerta')
}

function isStairObject(obj: SceneObject): boolean {
  const name = (obj.name || '').toLowerCase()
  const shape = (obj.shapeId || '').toLowerCase()
  return name.includes('escalera') || name.includes('stair') || shape.includes('stair') || shape.includes('escalera')
}
function isWindowObject(obj: SceneObject): boolean {
  const name = (obj.name || '').toLowerCase()
  const shape = (obj.shapeId || '').toLowerCase()
  return name.includes('ventana') || name.includes('window') || shape.includes('window') || shape.includes('ventana')
}

function isFloorObject(obj: SceneObject): boolean {
  const name = (obj.name || '').toLowerCase()
  const shape = (obj.shapeId || '').toLowerCase()
  return name.includes('piso') || name.includes('suelo') || name.includes('floor') || shape.includes('floor') || shape.includes('piso')
}

function openingCenter(wall: Wall, opening: { x: number; width: number }) {
  const { ux, uz, len } = wallBasis(wall)
  return {
    cx: wall.start.x + ux * opening.x,
    cz: wall.start.z + uz * opening.x,
  }
}

export function collectPlanSegments(context: ExportContext, levelId?: string): PlanSegment[] {
  const segments: PlanSegment[] = []
  const walls = collectWalls(context, levelId)
  const objects = collectObjects(context, levelId)

  // Muros con huecos (puertas/ventanas) y jambas
  for (const wall of walls) {
    const { ux, uz, nx, nz, len } = wallBasis(wall)
    const half = wall.thickness / 2
    // esquinas exteriores/interiores
    const so = { x: wall.start.x + nx * half, z: wall.start.z + nz * half }
    const eo = { x: wall.end.x + nx * half, z: wall.end.z + nz * half }
    const si = { x: wall.start.x - nx * half, z: wall.start.z - nz * half }
    const ei = { x: wall.end.x - nx * half, z: wall.end.z - nz * half }

    // huecos ordenados
    const openings = [...wall.openings].sort((a, b) => a.x - b.x)
    const gaps: { s: number; e: number }[] = []
    let cursor = 0
    for (const o of openings) {
      const s = Math.max(0, o.x - o.width / 2)
      const e = Math.min(len, o.x + o.width / 2)
      if (s > cursor + 1e-9) gaps.push({ s: cursor, e: s })
      // jamba
      const j0 = { x: wall.start.x + ux * s, z: wall.start.z + uz * s }
      const j1 = { x: wall.start.x + ux * e, z: wall.start.z + uz * e }
      const o0 = { x: j0.x + nx * half, z: j0.z + nz * half }
      const i0 = { x: j0.x - nx * half, z: j0.z - nz * half }
      const o1 = { x: j1.x + nx * half, z: j1.z + nz * half }
      const i1 = { x: j1.x - nx * half, z: j1.z - nz * half }
      // jambas en segundo pase
      cursor = e
    }
    if (cursor < len - 1e-9) gaps.push({ s: cursor, e: len })

    // aristas exteriores/interiores con huecos
    for (const gap of gaps) {
      const a = { x: so.x + ux * gap.s, z: so.z + uz * gap.s }
      const b = { x: so.x + ux * gap.e, z: so.z + uz * gap.e }
      const c = { x: si.x + ux * gap.s, z: si.z + uz * gap.s }
      const d = { x: si.x + ux * gap.e, z: si.z + uz * gap.e }
      const pa = toPlan(a.x, a.z); const pb = toPlan(b.x, b.z)
      const pc = toPlan(c.x, c.z); const pd = toPlan(d.x, d.z)
      segments.push({ layer: 'MUROS', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y })
      segments.push({ layer: 'MUROS', x1: pc.x, y1: pc.y, x2: pd.x, y2: pd.y })
    }

    // jambas (ya añadidas arriba de forma incompleta) -> rehacer limpio
  }

  // jambas correctas
  for (const wall of walls) {
    const { ux, uz, nx, nz, len } = wallBasis(wall)
    const half = wall.thickness / 2
    // tapas de los extremos del muro
    for (const u of [0, len]) {
      const j = { x: wall.start.x + ux * u, z: wall.start.z + uz * u }
      const oPt = toPlan(j.x + nx * half, j.z + nz * half)
      const iPt = toPlan(j.x - nx * half, j.z - nz * half)
      segments.push({ layer: 'MUROS', x1: oPt.x, y1: oPt.y, x2: iPt.x, y2: iPt.y })
    }
    for (const o of wall.openings) {
      const s = Math.max(0, o.x - o.width / 2)
      const e = Math.min(len, o.x + o.width / 2)
      for (const u of [s, e]) {
        const j = { x: wall.start.x + ux * u, z: wall.start.z + uz * u }
        const oPt = toPlan(j.x + nx * half, j.z + nz * half)
        const iPt = toPlan(j.x - nx * half, j.z - nz * half)
        segments.push({ layer: 'MUROS', x1: oPt.x, y1: oPt.y, x2: iPt.x, y2: iPt.y })
      }
      // puerta: swing arc on PUERTAS
      const isDoor = o.type === 'door'
      const isWindow = o.type === 'window'
      if (isDoor) {
        // arc centrado en jamba s, radio = width, quarter circle hacia normal
        const hinge = { x: wall.start.x + ux * s, z: wall.start.z + uz * s }
        const cx = hinge.x, cz = hinge.z
        const r = o.width
        const steps = 12
        // dirección a lo largo del muro (ux,uz) y normal (nx,nz)
        for (let i = 0; i < steps; i++) {
          const a0 = (Math.PI / 2) * (i / steps)
          const a1 = (Math.PI / 2) * ((i + 1) / steps)
          // punto = hinge + r*(cos a * dir + sin a * normal) en XZ
          const p0x = cx + r * (Math.cos(a0) * ux + Math.sin(a0) * nx)
          const p0z = cz + r * (Math.cos(a0) * uz + Math.sin(a0) * nz)
          const p1x = cx + r * (Math.cos(a1) * ux + Math.sin(a1) * nx)
          const p1z = cz + r * (Math.cos(a1) * uz + Math.sin(a1) * nz)
          const a = toPlan(p0x, p0z); const b = toPlan(p1x, p1z)
          segments.push({ layer: 'PUERTAS', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
        }
        // linea de puerta cerrada
        const doorEnd = toPlan(hinge.x + ux * r, hinge.z + uz * r)
        const hingePt = toPlan(hinge.x, hinge.z)
        segments.push({ layer: 'PUERTAS', x1: hingePt.x, y1: hingePt.y, x2: doorEnd.x, y2: doorEnd.y })
      }
      if (isWindow) {
        // linea de vidrio a lo largo de la abertura
        const mid = { x: wall.start.x + ux * o.x, z: wall.start.z + uz * o.x }
        const a = toPlan(mid.x + ux * (-o.width / 2), mid.z + uz * (-o.width / 2))
        const b = toPlan(mid.x + ux * (o.width / 2), mid.z + uz * (o.width / 2))
        segments.push({ layer: 'VENTANAS', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }
    }
  }

  // eliminar la jamba duplicada mal generada arriba: ya no se usa (se rehizo)
  // objetos
  for (const obj of objects) {
    if (obj.openingId) continue // ya representado por hueco de muro
    if (isStairObject(obj)) continue // manejado aparte
    if (isDoorObject(obj)) {
      // simbodo de puerta standalone
      const pos = toPlan(obj.position.x, obj.position.z)
      const w = obj.size.x
      const cos = Math.cos(obj.rotationY)
      const sin = Math.sin(obj.rotationY)
      // eje local X -> world
      const dx = cos, dz = sin
      const nx = -sin, nz = cos
      const hinge = { x: obj.position.x - (w / 2) * dx, z: obj.position.z - (w / 2) * dz }
      const hingePt = toPlan(hinge.x, hinge.z)
      const doorEnd = toPlan(hinge.x + w * dx, hinge.z + w * dz)
      segments.push({ layer: 'PUERTAS', x1: hingePt.x, y1: hingePt.y, x2: doorEnd.x, y2: doorEnd.y })
      for (let i = 0; i < 12; i++) {
        const a0 = (Math.PI / 2) * (i / 12)
        const a1 = (Math.PI / 2) * ((i + 1) / 12)
        const p0 = toPlan(hinge.x + w * (Math.cos(a0) * dx + Math.sin(a0) * nx), hinge.z + w * (Math.cos(a0) * dz + Math.sin(a0) * nz))
        const p1 = toPlan(hinge.x + w * (Math.cos(a1) * dx + Math.sin(a1) * nx), hinge.z + w * (Math.cos(a1) * dz + Math.sin(a1) * nz))
        segments.push({ layer: 'PUERTAS', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y })
      }
    } else if (isWindowObject(obj)) {
      const pts = objectFootprintPoints(obj)
      // rectangulo simple
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length]
        segments.push({ layer: 'VENTANAS', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }
    } else if (isFloorObject(obj)) {
      const pts = objectFootprintPoints(obj)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length]
        segments.push({ layer: 'PISOS', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }
    } else {
      const pts = objectFootprintPoints(obj)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length]
        segments.push({ layer: 'MOBILIARIO', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }
    }
  }

  // escaleras (objetos con stairProps)
  for (const obj of objects) {
    if (!isStairObject(obj)) continue
    const pts = objectFootprintPoints(obj)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length]
      segments.push({ layer: 'MOBILIARIO', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    }
    // lineas de peldaños
    const steps = 10
    const p0 = pts[0], p2 = pts[2]
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const x = p0.x + (p2.x - p0.x) * t
      const y = p0.y + (p2.y - p0.y) * t
      // perpendicular small
      segments.push({ layer: 'MOBILIARIO', x1: x - (p2.y - p0.y) * 0.05, y1: y + (p2.x - p0.x) * 0.05, x2: x + (p2.y - p0.y) * 0.05, y2: y - (p2.x - p0.x) * 0.05 })
    }
  }

  // Niveles: contorno del footprint si existe
  for (const level of levelsToExport(context, levelId)) {
    const fp = computeLevelFootprint(level, context)
    if (fp) {
      const corners = [
        toPlan(fp.minX, fp.minZ),
        toPlan(fp.maxX, fp.minZ),
        toPlan(fp.maxX, fp.maxZ),
        toPlan(fp.minX, fp.maxZ)
      ]
      for (let i = 0; i < corners.length; i++) {
        const a = corners[i]; const b = corners[(i + 1) % corners.length]
        segments.push({ layer: 'PISOS', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }
    }
  }

  return segments
}

export function collectPlanTexts(context: ExportContext, levelId?: string, units: 'm' | 'mm' = 'm'): PlanText[] {
  const texts: PlanText[] = []
  const walls = collectWalls(context, levelId)
  const objects = collectObjects(context, levelId)
  const scale = units === 'mm' ? 1000 : 1
  const fmtLen = (m: number) => (units === 'mm' ? `${(m * 1000).toFixed(2)} mm` : `${m.toFixed(2)} m`)

  for (const wall of walls) {
    const { ux, uz, nx, nz, len } = wallBasis(wall)
    const half = wall.thickness / 2
    const off = half + 0.35
    const a = toPlan(wall.start.x + nx * off, wall.start.z + nz * off)
    const b = toPlan(wall.end.x + nx * off, wall.end.z + nz * off)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    texts.push({ layer: 'COTAS', x: mid.x, y: mid.y, text: fmtLen(len), height: 0.12 * scale, rotation: 0 })
    // cotas de aberturas
    for (const o of wall.openings) {
      const s = o.x - o.width / 2
      const e = o.x + o.width / 2
      const p0 = toPlan(wall.start.x + ux * s, wall.start.z + uz * s)
      const p1 = toPlan(wall.start.x + ux * e, wall.start.z + uz * e)
      const off2 = off + 0.15
      const q0 = toPlan(wall.start.x + ux * s + nx * off2, wall.start.z + uz * s + nz * off2)
      const q1 = toPlan(wall.start.x + ux * e + nx * off2, wall.start.z + uz * e + nz * off2)
      const m = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 }
      texts.push({ layer: 'COTAS', x: m.x, y: m.y, text: fmtLen(o.width), height: 0.1 * scale, rotation: 0 })
    }
  }

  // cotas totales de la planta
  const allPts: { x: number; y: number }[] = []
  for (const w of walls) {
    allPts.push(toPlan(w.start.x, w.start.z), toPlan(w.end.x, w.end.z))
  }
  for (const o of objects) {
    allPts.push(...objectFootprintPoints(o))
  }
  if (allPts.length) {
    const xs = allPts.map((p) => p.x)
    const ys = allPts.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const w = maxX - minX
    const h = maxY - minY
    texts.push({ layer: 'COTAS', x: (minX + maxX) / 2, y: minY - 0.5, text: fmtLen(w), height: 0.15 * scale, rotation: 0 })
    texts.push({ layer: 'COTAS', x: minX - 0.5, y: (minY + maxY) / 2, text: fmtLen(h), height: 0.15 * scale, rotation: 90 })
  }

  // etiquetas de objetos
  for (const obj of objects) {
    const p = toPlan(obj.position.x, obj.position.z)
    texts.push({ layer: 'TEXTO', x: p.x, y: p.y, text: obj.name || obj.id, height: 0.1 * scale, rotation: 0 })
  }

  return texts
}

export function collectPlanPolygons(context: ExportContext, levelId?: string): PlanPolygon[] {
  const polys: PlanPolygon[] = []
  const objects = collectObjects(context, levelId)
  // huellas de objetos como poligonos cerrados
  for (const obj of objects) {
    if (obj.openingId) continue
    const pts = objectFootprintPoints(obj)
    let layer = 'MOBILIARIO'
    if (isDoorObject(obj)) layer = 'PUERTAS'
    else if (isWindowObject(obj)) layer = 'VENTANAS'
    else if (isFloorObject(obj)) layer = 'PISOS'
    polys.push({ layer, points: pts, closed: true })
  }
  // muros como poligonos (cada muro rectangulo)
  const walls = collectWalls(context, levelId)
  for (const wall of walls) {
    const { ux, uz, nx, nz, len } = wallBasis(wall)
    const half = wall.thickness / 2
    const pts = [
      toPlan(wall.start.x + nx * half, wall.start.z + nz * half),
      toPlan(wall.end.x + nx * half, wall.end.z + nz * half),
      toPlan(wall.end.x - nx * half, wall.end.z - nz * half),
      toPlan(wall.start.x - nx * half, wall.start.z - nz * half),
    ]
    polys.push({ layer: 'MUROS', points: pts, closed: true })
  }
  return polys
}

function unitsCode(units: 'm' | 'mm'): number {
  return units === 'mm' ? 4 : 6
}

export function buildDxf(
  segmentsOrPlan: PlanSegment[] | { segments?: PlanSegment[]; texts?: PlanText[]; polygons?: PlanPolygon[]; units?: 'm' | 'mm' },
  textsOrOptions?: PlanText[] | { texts?: PlanText[]; polygons?: PlanPolygon[]; units?: 'm' | 'mm' },
  maybeOptions?: { units?: 'm' | 'mm' }
): string {
  let segments: PlanSegment[] = []
  let texts: PlanText[] = []
  let polygons: PlanPolygon[] = []
  let units: 'm' | 'mm' = 'm'
  if (Array.isArray(segmentsOrPlan)) {
    segments = segmentsOrPlan
    if (Array.isArray(textsOrOptions)) {
      texts = textsOrOptions
      units = maybeOptions?.units ?? units
    } else if (textsOrOptions && typeof textsOrOptions === 'object') {
      texts = textsOrOptions.texts ?? texts
      polygons = textsOrOptions.polygons ?? polygons
      units = textsOrOptions.units ?? units
    }
  } else if (segmentsOrPlan && typeof segmentsOrPlan === 'object') {
    segments = segmentsOrPlan.segments ?? segments
    texts = segmentsOrPlan.texts ?? texts
    polygons = segmentsOrPlan.polygons ?? polygons
    units = segmentsOrPlan.units ?? units
  }
  if (textsOrOptions && !Array.isArray(textsOrOptions) && textsOrOptions.units) units = textsOrOptions.units
  if (maybeOptions?.units) units = maybeOptions.units

  const scale = units === 'mm' ? 1000 : 1
  const layerSet = new Set<string>(LAYERS as unknown as string[])
  for (const s of segments) layerSet.add(s.layer)
  for (const t of texts) layerSet.add(t.layer)
  for (const p of polygons) layerSet.add(p.layer)

  const lines: string[] = []
  const w = (v: string) => lines.push(v)
  w('0'); w('SECTION'); w('2'); w('HEADER')
  w('9'); w('$ACADVER'); w('1'); w('AC1009')
  w('9'); w('$INSUNITS'); w('70'); w(String(unitsCode(units)))
  w('0'); w('ENDSEC')

  w('0'); w('SECTION'); w('2'); w('TABLES')
  w('0'); w('TABLE'); w('2'); w('LAYER'); w('70'); w(String(layerSet.size))
  for (const layer of layerSet) {
    const color = LAYER_COLORS[layer] ?? 7
    w('0'); w('LAYER'); w('2'); w(layer); w('70'); w('0'); w('62'); w(String(color)); w('6'); w('CONTINUOUS')
  }
  w('0'); w('ENDTAB')
  w('0'); w('ENDSEC')

  w('0'); w('SECTION'); w('2'); w('ENTITIES')

  // segments as LINE
  for (const s of segments) {
    w('0'); w('LINE'); w('8'); w(s.layer)
    w('10'); w(fmt(s.x1 * scale)); w('20'); w(fmt(s.y1 * scale)); w('30'); w('0')
    w('11'); w(fmt(s.x2 * scale)); w('21'); w(fmt(s.y2 * scale)); w('31'); w('0')
  }

  // polygons as LWPOLYLINE and R12 POLYLINE
  for (const p of polygons) {
    w('0'); w('LWPOLYLINE'); w('8'); w(p.layer)
    w('90'); w(String(p.points.length))
    w('70'); w(p.closed ? '1' : '0')
    for (const pt of p.points) {
      w('10'); w(fmt(pt.x * scale)); w('20'); w(fmt(pt.y * scale))
    }
    w('0'); w('POLYLINE'); w('8'); w(p.layer)
    w('66'); w('1'); w('70'); w(p.closed ? '1' : '0')
    w('10'); w('0'); w('20'); w('0'); w('30'); w('0')
    for (const pt of p.points) {
      w('0'); w('VERTEX'); w('8'); w(p.layer)
      w('10'); w(fmt(pt.x * scale)); w('20'); w(fmt(pt.y * scale)); w('30'); w('0')
    }
    w('0'); w('SEQEND'); w('8'); w(p.layer)
  }

  // wall polygons as POLYLINE too (helps R12 requirement) for each wall in segments? We'll also emit wall rectangles as polylines based on MUROS segments not enough. Already polygons passed.

  // texts
  for (const t of texts) {
    w('0'); w('TEXT'); w('8'); w(t.layer)
    w('10'); w(fmt(t.x * scale)); w('20'); w(fmt(t.y * scale)); w('30'); w('0')
    w('40'); w(fmt((t.height ?? 0.12) * scale))
    w('50'); w(fmt(t.rotation ?? 0))
    w('1'); w(t.text)
  }

  // Additionally, emit wall contours as POLYLINE from segments? Not needed.

  w('0'); w('ENDSEC')
  w('0'); w('EOF')
  return lines.join('\n')
}

export async function exportDxf(_scene: THREE.Scene, context?: ExportContext): Promise<string> {
  try {
    const ctx = context ?? { walls: [], objects: [], levels: [] }
    const units = (ctx as any).units === 'mm' ? 'mm' : 'm'
    const segments = collectPlanSegments(ctx)
    const texts = collectPlanTexts(ctx, undefined, units)
    const polygons = collectPlanPolygons(ctx)
    return buildDxf({ segments, texts, polygons, units })
  } catch (err) {
    return ''
  }
}

export const DXF_LAYERS = {
  walls: 'MUROS',
  objects: 'MOBILIARIO',
  doors: 'PUERTAS',
  windows: 'VENTANAS',
  floors: 'PISOS',
  dimensions: 'COTAS',
  text: 'TEXTO',
  hatch: 'RAYADO'
} as const

export function wallFootprint(wall: Wall): Array<{ x: number; y: number }> {
  const half = wall.thickness / 2
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz)
  const nx = length > 0 ? -dz / length : 0
  const nz = length > 0 ? dx / length : 1
  const corners = [
    { x: wall.start.x + nx * half, z: wall.start.z + nz * half },
    { x: wall.end.x + nx * half, z: wall.end.z + nz * half },
    { x: wall.end.x - nx * half, z: wall.end.z - nz * half },
    { x: wall.start.x - nx * half, z: wall.start.z - nz * half }
  ]
  return corners.map((c) => toPlan(c.x, c.z))
}

export function objectFootprint(object: SceneObject): Array<{ x: number; y: number }> {
  const halfX = object.size.x / 2
  const halfZ = object.size.z / 2
  const cos = Math.cos(object.rotationY)
  const sin = Math.sin(object.rotationY)
  const local = [
    { x: -halfX, z: -halfZ },
    { x: halfX, z: -halfZ },
    { x: halfX, z: halfZ },
    { x: -halfX, z: halfZ }
  ]
  return local.map((corner) => {
    const rx = corner.x * cos - corner.z * sin
    const rz = corner.x * sin + corner.z * cos
    return toPlan(object.position.x + rx, object.position.z + rz)
  })
}

/**
 * Genera el rayado diagonal a 45° de los muros (capa RAYADO) para láminas PDF.
 */
export function collectWallHatchSegments(context: ExportContext, levelId?: string): PlanSegment[] {
  const segments: PlanSegment[] = []
  const walls = collectWalls(context, levelId)
  const step = 0.25

  for (const wall of walls) {
    const { ux, uz, nx, nz, len } = wallBasis(wall)
    const half = wall.thickness / 2
    const openings = [...wall.openings].sort((a, b) => a.x - b.x)
    const isInsideOpening = (u: number): boolean =>
      openings.some((o) => u >= o.x - o.width / 2 && u <= o.x + o.width / 2)

    for (let u = step; u < len - half; u += step) {
      if (isInsideOpening(u)) continue
      const u0 = Math.max(0, u - half)
      const u1 = Math.min(len, u + half)
      const p0 = toPlan(
        wall.start.x + ux * u0 - nx * half,
        wall.start.z + uz * u0 - nz * half
      )
      const p1 = toPlan(
        wall.start.x + ux * u1 + nx * half,
        wall.start.z + uz * u1 + nz * half
      )
      segments.push({ layer: 'RAYADO', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y })
    }
  }
  return segments
}

/**
 * Genera las líneas de cota y patillas de referencia (capa COTAS) para cada muro.
 */
export function collectDimensionSegments(context: ExportContext, levelId?: string): PlanSegment[] {
  const segments: PlanSegment[] = []
  const walls = collectWalls(context, levelId)

  for (const wall of walls) {
    const { nx, nz } = wallBasis(wall)
    const half = wall.thickness / 2
    const off = half + 0.3
    const tick = 0.08
    const a = toPlan(wall.start.x + nx * off, wall.start.z + nz * off)
    const b = toPlan(wall.end.x + nx * off, wall.end.z + nz * off)
    segments.push({ layer: 'COTAS', x1: a.x, y1: a.y, x2: b.x, y2: b.y })

    const t0a = toPlan(wall.start.x + nx * (off - tick), wall.start.z + nz * (off - tick))
    const t0b = toPlan(wall.start.x + nx * (off + tick), wall.start.z + nz * (off + tick))
    segments.push({ layer: 'COTAS', x1: t0a.x, y1: t0a.y, x2: t0b.x, y2: t0b.y })

    const t1a = toPlan(wall.end.x + nx * (off - tick), wall.end.z + nz * (off - tick))
    const t1b = toPlan(wall.end.x + nx * (off + tick), wall.end.z + nz * (off + tick))
    segments.push({ layer: 'COTAS', x1: t1a.x, y1: t1a.y, x2: t1b.x, y2: t1b.y })
  }
  return segments
}
