import * as THREE from 'three'
import { WallSegmentType } from '../models/Wall'

/** Línea 2D leída de un DXF (coordenadas de plano, metros). */
export interface DxfLine {
  layer: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Resultado del parseo: líneas + unidades declaradas en el HEADER. */
export interface ParsedDxf {
  lines: DxfLine[]
  /** $INSUNITS del HEADER (4 = mm, 6 = m); null si no se declara. */
  insUnits: number | null
  /** Entidades TEXT encontradas (se ignoran con aviso al importar). */
  textCount: number
}

/**
 * Parsea el subconjunto DXF que genera la Fase 2 (y el que escriben
 * AutoCAD/LibreCAD/QCAD): pares código/valor, sección ENTITIES con
 * entidades LINE (capas, x1/y1/x2/y2) y $INSUNITS del HEADER.
 *
 * Tolera: CRLF/LF, entidades POINT/LWPOLYLINE ignoradas, XDATA extendido
 * (1001+) ignorado, bloques (BLOCKS) saltados salvo sus LINE.
 */
export function parseDxf(text: string): ParsedDxf {
  const raw = text.split(/\r\n|\r|\n/)
  const lines: string[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    lines.push(raw[i].trim(), raw[i + 1].trim())
  }
  const pairs: Array<{ code: number; value: string }> = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i])
    if (!Number.isInteger(code)) continue
    pairs.push({ code, value: lines[i + 1] ?? '' })
  }

  let insUnits: number | null = null
  const entities: DxfLine[] = []
  let section = ''
  let current: { layer: string; x1: number; y1: number; x2: number; y2: number } | null = null
  let currentLwPoly: {
    layer: string
    flags: number
    vertices: Array<{ x: number; y: number }>
    pendingX: number | null
  } | null = null
  let currentPoly: {
    layer: string
    flags: number
    vertices: Array<{ x: number; y: number }>
    inVertex: boolean
    vx: number
    vy: number
  } | null = null
  let currentCircleArc: {
    kind: 'CIRCLE' | 'ARC'
    layer: string
    cx: number
    cy: number
    r: number
    startAngle: number
    endAngle: number
  } | null = null
  let pendingVar: string | null = null
  let textCount = 0

  const flush = (): void => {
    if (current) {
      entities.push({
        layer: current.layer || '0',
        x1: current.x1,
        y1: current.y1,
        x2: current.x2,
        y2: current.y2
      })
      current = null
    }
    if (currentLwPoly) {
      const verts = currentLwPoly.vertices
      const layer = currentLwPoly.layer || '0'
      for (let i = 0; i + 1 < verts.length; i++) {
        entities.push({
          layer,
          x1: verts[i].x,
          y1: verts[i].y,
          x2: verts[i + 1].x,
          y2: verts[i + 1].y
        })
      }
      if ((currentLwPoly.flags & 1) !== 0 && verts.length >= 3) {
        const last = verts[verts.length - 1]
        const first = verts[0]
        if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) {
          entities.push({ layer, x1: last.x, y1: last.y, x2: first.x, y2: first.y })
        }
      }
      currentLwPoly = null
    }
    if (currentCircleArc && currentCircleArc.r > 1e-6) {
      const { kind, layer, cx, cy, r, startAngle, endAngle } = currentCircleArc
      const lyr = layer || '0'
      if (kind === 'CIRCLE') {
        const steps = 16
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * Math.PI * 2
          const a1 = ((i + 1) / steps) * Math.PI * 2
          entities.push({
            layer: lyr,
            x1: cx + Math.cos(a0) * r,
            y1: cy + Math.sin(a0) * r,
            x2: cx + Math.cos(a1) * r,
            y2: cy + Math.sin(a1) * r
          })
        }
      } else {
        let aStart = (startAngle * Math.PI) / 180
        let aEnd = (endAngle * Math.PI) / 180
        while (aEnd <= aStart) aEnd += Math.PI * 2
        const span = aEnd - aStart
        const steps = Math.max(4, Math.min(24, Math.ceil((span / (Math.PI * 2)) * 16)))
        for (let i = 0; i < steps; i++) {
          const a0 = aStart + (i / steps) * span
          const a1 = aStart + ((i + 1) / steps) * span
          entities.push({
            layer: lyr,
            x1: cx + Math.cos(a0) * r,
            y1: cy + Math.sin(a0) * r,
            x2: cx + Math.cos(a1) * r,
            y2: cy + Math.sin(a1) * r
          })
        }
      }
      currentCircleArc = null
    } else {
      currentCircleArc = null
    }
  }

  const flushPoly = (): void => {
    if (!currentPoly) return
    if (currentPoly.inVertex) {
      currentPoly.vertices.push({ x: currentPoly.vx, y: currentPoly.vy })
      currentPoly.inVertex = false
    }
    const verts = currentPoly.vertices
    const layer = currentPoly.layer || '0'
    for (let i = 0; i + 1 < verts.length; i++) {
      entities.push({
        layer,
        x1: verts[i].x,
        y1: verts[i].y,
        x2: verts[i + 1].x,
        y2: verts[i + 1].y
      })
    }
    if ((currentPoly.flags & 1) !== 0 && verts.length >= 3) {
      const last = verts[verts.length - 1]
      const first = verts[0]
      if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) {
        entities.push({ layer, x1: last.x, y1: last.y, x2: first.x, y2: first.y })
      }
    }
    currentPoly = null
  }

  for (const { code, value } of pairs) {
    if (code === 2 && (value === 'HEADER' || value === 'TABLES' || value === 'BLOCKS' || value === 'ENTITIES' || value === 'OBJECTS')) {
      flush()
      flushPoly()
      section = value
      continue
    }
    if (code === 0) {
      const inEntitySection = section === 'ENTITIES' || section === 'BLOCKS'
      if (currentPoly && inEntitySection) {
        if (value === 'VERTEX') {
          if (currentPoly.inVertex) {
            currentPoly.vertices.push({ x: currentPoly.vx, y: currentPoly.vy })
          }
          currentPoly.inVertex = true
          currentPoly.vx = 0
          currentPoly.vy = 0
          continue
        }
        if (value === 'SEQEND') {
          flushPoly()
          continue
        }
        flushPoly()
      }

      if (value === 'LINE' && inEntitySection) {
        flush()
        current = { layer: '0', x1: 0, y1: 0, x2: 0, y2: 0 }
        continue
      }
      if (value === 'LWPOLYLINE' && inEntitySection) {
        flush()
        currentLwPoly = { layer: '0', flags: 0, vertices: [], pendingX: null }
        continue
      }
      if (value === 'POLYLINE' && inEntitySection) {
        flush()
        currentPoly = { layer: '0', flags: 0, vertices: [], inVertex: false, vx: 0, vy: 0 }
        continue
      }
      if ((value === 'CIRCLE' || value === 'ARC') && inEntitySection) {
        flush()
        currentCircleArc = {
          kind: value,
          layer: '0',
          cx: 0,
          cy: 0,
          r: 0,
          startAngle: 0,
          endAngle: 360
        }
        continue
      }
      // TEXT / MTEXT se ignora con aviso (se cuenta para el mensaje del diálogo).
      if ((value === 'TEXT' || value === 'MTEXT') && inEntitySection) {
        flush()
        textCount++
        pendingVar = null
        continue
      }
      // Cualquier otra entidad cierra la entidad en curso.
      flush()
      pendingVar = null
      continue
    }
    if (section === 'HEADER' && code === 9 && value === '$INSUNITS') {
      // El valor llega en el siguiente par con código 70.
      pendingVar = 'INSUNITS'
      continue
    }
    if (section === 'HEADER' && pendingVar === 'INSUNITS' && code === 70) {
      const units = Number(value)
      if (Number.isInteger(units)) insUnits = units
      pendingVar = null
      continue
    }
    if (current) {
      if (code === 8) current.layer = value || '0'
      else if (code === 10) current.x1 = Number(value) || 0
      else if (code === 20) current.y1 = Number(value) || 0
      else if (code === 11) current.x2 = Number(value) || 0
      else if (code === 21) current.y2 = Number(value) || 0
    } else if (currentLwPoly) {
      if (code === 8) currentLwPoly.layer = value || '0'
      else if (code === 70) currentLwPoly.flags = Number(value) || 0
      else if (code === 10) currentLwPoly.pendingX = Number(value) || 0
      else if (code === 20 && currentLwPoly.pendingX !== null) {
        currentLwPoly.vertices.push({ x: currentLwPoly.pendingX, y: Number(value) || 0 })
        currentLwPoly.pendingX = null
      }
    } else if (currentPoly) {
      if (!currentPoly.inVertex) {
        if (code === 8) currentPoly.layer = value || '0'
        else if (code === 70) currentPoly.flags = Number(value) || 0
      } else {
        if (code === 10) currentPoly.vx = Number(value) || 0
        else if (code === 20) currentPoly.vy = Number(value) || 0
      }
    } else if (currentCircleArc) {
      if (code === 8) currentCircleArc.layer = value || '0'
      else if (code === 10) currentCircleArc.cx = Number(value) || 0
      else if (code === 20) currentCircleArc.cy = Number(value) || 0
      else if (code === 40) currentCircleArc.r = Math.abs(Number(value) || 0)
      else if (code === 50) currentCircleArc.startAngle = Number(value) || 0
      else if (code === 51) currentCircleArc.endAngle = Number(value) || 0
    }
  }
  flush()
  flushPoly()
  return { lines: entities, insUnits, textCount }
}

/** Factor de conversión a metros según $INSUNITS (4 = mm, 5 = cm, 6 = m). */
export function insUnitsToMeters(insUnits: number | null): number {
  if (insUnits === 4) return 0.001
  if (insUnits === 5) return 0.01
  if (insUnits === 2) return 0.0254
  return 1
}

/**
 * Muro inferido de un DXF: eje en coordenadas de mundo XZ (metros) más el
 * espesor detectado (o el valor por defecto 0.2 m para líneas sueltas).
 */
export interface InferredWall {
  startX: number
  startZ: number
  endX: number
  endZ: number
  thickness: number
}

/** Resultado de la inferencia: muros listos para crear + líneas omitidas. */
export interface DxfImportPlan {
  walls: InferredWall[]
  skipped: number
  /** Factor de unidades aplicado (de $INSUNITS a metros). */
  unitFactor: number
  /** Entidades TEXT ignoradas (con aviso en el diálogo). */
  textCount: number
}

/** Espesor por defecto cuando la línea no trae huella (DXF genérico). */
export const DEFAULT_IMPORT_THICKNESS = 0.2

/** Longitud mínima de una línea para considerarse muro (1 mm). */
export const MIN_IMPORT_LENGTH = 0.001

/**
 * Infiere muros desde un DXF ya parseado.
 *
 * - Capa MUROS (huellas rectangulares de 4 lados de la Fase 2) → un muro
 *   por rectángulo: eje = lado largo, espesor = lado corto.
 * - Si no hay capa MUROS, se usan todas las líneas (DXF genérico de
 *   AutoCAD/LibreCAD): cada línea suelta → un muro sobre su eje.
 * - Las capas PISOS/COTAS/RAYADO/OBJETOS nunca generan muros.
 *
 * Conversión plano→mundo: X = X, Z = −Y (inversa de `toPlan` de la Fase 2).
 */
export function inferWalls(parsed: ParsedDxf): DxfImportPlan {
  const unitFactor = insUnitsToMeters(parsed.insUnits)
  const ignoredLayers = new Set(['PISOS', 'COTAS', 'RAYADO', 'OBJETOS'])
  const wallsLayer = parsed.lines.filter((l) => l.layer.toUpperCase() === 'MUROS')
  const candidates = (wallsLayer.length > 0 ? wallsLayer : parsed.lines).filter((l) => !ignoredLayers.has(l.layer.toUpperCase()))

  const walls: InferredWall[] = []
  let skipped = 0

  if (wallsLayer.length > 0) {
    // Huellas propias: agrupa por conectividad de extremos (tolerancia 1 mm).
    const eps = 0.001
    const remaining = candidates.map((l) => ({ ...l }))
    while (remaining.length > 0) {
      // Componente conexa por extremos compartidos.
      const component = [remaining.shift()!]
      let grown = true
      while (grown) {
        grown = false
        for (let i = remaining.length - 1; i >= 0; i--) {
          const candidate = remaining[i]
          const touches = component.some(
            (member) =>
              pointsClose(member.x1, member.y1, candidate.x1, candidate.y1, eps) ||
              pointsClose(member.x1, member.y1, candidate.x2, candidate.y2, eps) ||
              pointsClose(member.x2, member.y2, candidate.x1, candidate.y1, eps) ||
              pointsClose(member.x2, member.y2, candidate.x2, candidate.y2, eps)
          )
          if (touches) {
            component.push(candidate)
            remaining.splice(i, 1)
            grown = true
          }
        }
      }
      const wall = rectangleToWall(joinCollinear(component, 0.001), unitFactor)
      if (wall) walls.push(wall)
      else skipped += component.length
    }
  } else {
    // DXF genérico: cada línea es el eje de un muro.
    for (const line of candidates) {
      const x1 = line.x1 * unitFactor
      const y1 = line.y1 * unitFactor
      const x2 = line.x2 * unitFactor
      const y2 = line.y2 * unitFactor
      if (Math.hypot(x2 - x1, y2 - y1) < MIN_IMPORT_LENGTH) {
        skipped++
        continue
      }
      walls.push({ startX: x1, startZ: -y1, endX: x2, endZ: -y2, thickness: DEFAULT_IMPORT_THICKNESS })
    }
  }
  return { walls, skipped, unitFactor, textCount: parsed.textCount }
}

function pointsClose(ax: number, ay: number, bx: number, by: number, eps: number): boolean {
  return Math.hypot(ax - bx, ay - by) <= eps
}

/**
 * Une dos lineas si comparten un extremo y son colineales (mismo tramo de la
 * huella). En huellas con ingletes a 45 grados, dos lados del rectangulo
 * llegan como segmentos separados que hay que unir antes de detectar el
 * rectangulo.
 */
function tryJoinCollinear(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
  tol: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  const ax = a.x2 - a.x1
  const ay = a.y2 - a.y1
  const aLen = Math.hypot(ax, ay)
  if (aLen < 1e-9) return null
  const bx = b.x2 - b.x1
  const by = b.y2 - b.y1
  const bLen = Math.hypot(bx, by)
  if (bLen < 1e-9) return null
  const cross = Math.abs(ax * by - ay * bx) / (aLen * bLen)
  if (cross > 1e-6) return null
  if (pointsClose(a.x2, a.y2, b.x1, b.y1, tol)) return { x1: a.x1, y1: a.y1, x2: b.x2, y2: b.y2 }
  if (pointsClose(a.x2, a.y2, b.x2, b.y2, tol)) return { x1: a.x1, y1: a.y1, x2: b.x1, y2: b.y1 }
  if (pointsClose(a.x1, a.y1, b.x1, b.y1, tol)) return { x1: a.x2, y1: a.y2, x2: b.x2, y2: b.y2 }
  if (pointsClose(a.x1, a.y1, b.x2, b.y2, tol)) return { x1: a.x2, y1: a.y2, x2: b.x1, y2: b.y1 }
  return null
}

/**
 * Une los segmentos colineales de un componente (mismo tramo de huella).
 * Repite hasta que no queden uniones: en un rectangulo con ingletes, cada
 * lado largo llega partido en dos.
 */
function joinCollinear(
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  tol: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  let current = [...lines]
  let changed = true
  while (changed && current.length > 1) {
    changed = false
    const used = new Array<boolean>(current.length).fill(false)
    const next: typeof current = []
    for (let i = 0; i < current.length; i++) {
      if (used[i]) continue
      let merged = current[i]
      used[i] = true
      let extended = true
      while (extended) {
        extended = false
        for (let j = 0; j < current.length; j++) {
          if (used[j]) continue
          const joined = tryJoinCollinear(merged, current[j], tol)
          if (joined) {
            merged = joined
            used[j] = true
            extended = true
            changed = true
          }
        }
      }
      next.push(merged)
    }
    current = next
  }
  return current
}

/**
 * Convierte un componente de líneas en un muro si forma un rectángulo
/**
 * Convierte un componente de líneas en un muro si forma un rectángulo
 * cerrado (4 lados, 4 esquinas): eje = lado largo, espesor = lado corto.
 * Devuelve null si no es un rectángulo válido.
 */
function rectangleToWall(
  component: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  unitFactor: number
): InferredWall | null {
  if (component.length !== 4) return null
  const corners: Array<{ x: number; y: number }> = []
  for (const line of component) {
    for (const point of [
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 }
    ]) {
      if (!corners.some((c) => pointsClose(c.x, c.y, point.x, point.y, 1e-6))) corners.push(point)
    }
  }
  if (corners.length !== 4) return null
  // Eje largo = dirección del segmento más largo del componente (lado largo
  // del rectángulo). Usar la dirección a una esquina desaligna el eje en
  // rectángulos no cuadrados y distorsiona la longitud (p. ej. 5,004 m).
  let longest: { dx: number; dy: number } | null = null
  let longestLen = 0
  for (const line of component) {
    const dx = line.x2 - line.x1
    const dy = line.y2 - line.y1
    const len = Math.hypot(dx, dy)
    if (len > longestLen) {
      longestLen = len
      longest = { dx: dx / len, dy: dy / len }
    }
  }
  if (!longest) return null
  const { dx: lx, dy: ly } = longest
  // Centroide
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  // Proyecciones sobre el eje largo y su normal.
  let halfLen = 0
  let halfThick = 0
  for (const corner of corners) {
    const rx = corner.x - cx
    const ry = corner.y - cy
    halfLen = Math.max(halfLen, Math.abs(rx * lx + ry * ly))
    halfThick = Math.max(halfThick, Math.abs(-rx * ly + ry * lx))
  }
  const lengthM = halfLen * 2 * unitFactor
  if (lengthM < MIN_IMPORT_LENGTH) return null
  const cxM = cx * unitFactor
  const cyM = cy * unitFactor
  const hx = lx * halfLen * unitFactor
  const hy = ly * halfLen * unitFactor
  return {
    startX: cxM - hx,
    startZ: -(cyM - hy),
    endX: cxM + hx,
    endZ: -(cyM + hy),
    thickness: Math.max(halfThick * 2 * unitFactor, 0.05)
  }
}

export interface DxfWallAdder {
  addWall(type: WallSegmentType, start: THREE.Vector3, end: THREE.Vector3): { thickness: number }
}

/** Opciones de transformación espacial al insertar un plano 2D (DXF / SVG / PDF). */
export interface Plan2DTransformOptions {
  scale?: number
  position?: { x: number; y?: number; z: number }
  rotationY?: number
  centerAtOrigin?: boolean
}

/** Aplica escala, centrado opcional, rotación en Y y traslación a una lista de muros inferidos. */
export function transformInferredWalls(
  walls: InferredWall[],
  options?: Plan2DTransformOptions
): InferredWall[] {
  if (!options || walls.length === 0) return walls
  const scale = options.scale !== undefined && Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1
  const posX = options.position?.x ?? 0
  const posZ = options.position?.z ?? 0
  const rotY = options.rotationY ?? 0
  const centerAtOrigin = options.centerAtOrigin ?? false

  let cx = 0
  let cz = 0
  if (centerAtOrigin) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const w of walls) {
      minX = Math.min(minX, w.startX, w.endX)
      maxX = Math.max(maxX, w.startX, w.endX)
      minZ = Math.min(minZ, w.startZ, w.endZ)
      maxZ = Math.max(maxZ, w.startZ, w.endZ)
    }
    if (Number.isFinite(minX)) {
      cx = (minX + maxX) / 2
      cz = (minZ + maxZ) / 2
    }
  }

  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)

  return walls.map((w) => {
    const sx0 = (w.startX - cx) * scale
    const sz0 = (w.startZ - cz) * scale
    const ex0 = (w.endX - cx) * scale
    const ez0 = (w.endZ - cz) * scale

    const sx = sx0 * cos - sz0 * sin + posX
    const sz = sx0 * sin + sz0 * cos + posZ
    const ex = ex0 * cos - ez0 * sin + posX
    const ez = ex0 * sin + ez0 * cos + posZ

    return {
      startX: sx,
      startZ: sz,
      endX: ex,
      endZ: ez,
      thickness: Math.max(0.05, w.thickness * scale)
    }
  })
}

/**
 * Aplica un DXF creando un muro por línea inferida.
 *
 * Recibe solo `addWall` (no la escena ni el historial): el llamante decide el
 * encuadre — el diálogo de importación lo envuelve en una transacción para que
 * toda la importación sea un único paso de historial (un Ctrl+Z la revierte).
 *
 * Devuelve `{ ok, walls, skipped, message }`; `message` ya viene en
 * español para la barra de estado. No crea nada si no hay muros.
 */
export function applyDxfImport(
  adder: DxfWallAdder,
  text: string,
  transform?: Plan2DTransformOptions
): { ok: boolean; walls: number; skipped: number; message: string } {
  let plan: DxfImportPlan
  try {
    plan = inferWalls(parseDxf(text))
  } catch {
    return { ok: false, walls: 0, skipped: 0, message: 'Importar DXF: el archivo no es un DXF válido.' }
  }
  if (plan.walls.length === 0) {
    return { ok: false, walls: 0, skipped: plan.skipped, message: 'Importar DXF: no se encontraron líneas de muro.' }
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
    message: `Importar DXF: ${transformedWalls.length} muro${transformedWalls.length === 1 ? '' : 's'} creado${transformedWalls.length === 1 ? '' : 's'}${extra}.`
  }
}

