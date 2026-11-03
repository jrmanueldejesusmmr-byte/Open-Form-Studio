/**
 * Importador de IFC4 (STEP / ISO-10303-21) — Fase 3+.
 *
 * Lee archivos IFC (incluyendo los generados por la exportación de ArqStudio y
 * modelos BIM estándar) e integra elementos geométricos (`IfcWall`, `IfcSlab`,
 * `IfcColumn`, `IfcRoof`, `IfcDoor`, `IfcWindow`, `IfcFurnishingElement`) como
 * entidades nativas paramétricas editables en la escena.
 */

import * as THREE from 'three'
import { WallSegmentType, type Wall } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import type { Opening } from '../models/Opening'

/** Entidad IFC leída del archivo STEP. */
export interface IfcEntity {
  id: number
  type: string
  args: string[]
}

/** Resultado de leer un archivo IFC. */
export interface ParsedIfc {
  entities: IfcEntity[]
  lengthUnit: 'METRE' | null
  projectName: string | null
}

/** Divide los argumentos de una entidad STEP respetando paréntesis y comillas. */
export function splitIfcArgs(text: string): string[] {
  const args: string[] = []
  let depth = 0
  let inString = false
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      current += ch
      if (ch === "'") {
        if (text[i + 1] === "'") {
          current += "'"
          i++
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
      continue
    }
    if (ch === '(') {
      depth++
      current += ch
      continue
    }
    if (ch === ')') {
      depth--
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim() !== '') args.push(current.trim())
  return args
}

/** Quita las comillas de un literal STEP. */
export function ifcString(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("'")) return null
  const end = trimmed.lastIndexOf("'")
  if (end <= 0) return null
  return trimmed.slice(1, end).replace(/''/g, "'")
}

/** Lee un número de un argumento (o null). Los números IFC usan punto final (ej. "8."). */
export function ifcNumber(text: string | undefined): number | null {
  if (text === undefined) return null
  const cleaned = text.trim().replace(/^\$/, '').replace(/\.$/, '')
  if (cleaned === '' || cleaned === '$') return null
  const n = Number(cleaned.replace(/[()]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Lee el id (#N) de un argumento. */
export function ifcRef(text: string | undefined): number | null {
  if (!text) return null
  const m = text.trim().match(/^#(\d+)$/)
  return m ? Number(m[1]) : null
}

/** Lee el archivo IFC y devuelve sus entidades. */
export function parseIfc(text: string): ParsedIfc {
  const entities: IfcEntity[] = []
  let lengthUnit: 'METRE' | null = null
  let projectName: string | null = null

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const id = Number(line.slice(1, eq))
    const body = line.slice(eq + 1).replace(/;\s*$/, '')
    const open = body.indexOf('(')
    if (open < 0) continue
    const type = body.slice(0, open).trim().toUpperCase()
    const args = splitIfcArgs(body.slice(open + 1, body.lastIndexOf(')')))
    entities.push({ id, type, args })

    if (type === 'IFCSIUNIT') {
      const unitRaw = args[3] ?? ''
      const unit = unitRaw.startsWith('.') ? unitRaw.slice(1, -1) : (ifcString(unitRaw) ?? '')
      if (unit === 'METRE') lengthUnit = 'METRE'
    }
    if (type === 'IFCPROJECT' && projectName === null) {
      projectName = ifcString(args[0] ?? '') ?? ifcString(args[2] ?? '')
    }
  }

  return { entities, lengthUnit, projectName }
}

/** Una pared importada del IFC. */
export interface IfcImportedWall {
  name?: string
  x: number
  y: number
  z: number
  length: number
  thickness: number
  height: number
  angle: number
}

/** Un hueco importado del IFC (puerta o ventana). */
export interface IfcImportedOpening {
  kind: 'door' | 'window'
  name: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  angle: number
}

/** Elemento estructural o arquitectónico importado del IFC (losa, columna, cubierta, mobiliario). */
export interface IfcImportedStructuralElement {
  kind: 'slab' | 'column' | 'roof' | 'furnishing'
  name: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  angle: number
}

/** Resultado de la planificación de importación de un IFC. */
export interface IfcImportPlan {
  walls: IfcImportedWall[]
  openings: IfcImportedOpening[]
  slabs: IfcImportedStructuralElement[]
  columns: IfcImportedStructuralElement[]
  roofs: IfcImportedStructuralElement[]
  furnishings: IfcImportedStructuralElement[]
  skipped: number
  projectName: string | null
}

/** Tipos de entidad que el importador interpreta. */
const WALL_TYPES = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'])
const OPENING_TYPES = new Set(['IFCDOOR', 'IFCWINDOW'])
const SLAB_TYPES = new Set(['IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE'])
const COLUMN_TYPES = new Set(['IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE', 'IFCBEAM'])
const ROOF_TYPES = new Set(['IFCROOF'])
const FURNISHING_TYPES = new Set(['IFCFURNISHINGELEMENT', 'IFCBUILDINGELEMENTPROXY'])

/** Coordenadas de un IfcCartesianPoint. */
function ifcPoint(entity: IfcEntity): { x: number; y: number; z: number } | null {
  const raw = entity.args[entity.args.length - 1] ?? entity.args[1] ?? entity.args[0] ?? ''
  const openIdx = raw.indexOf('(')
  const closeIdx = raw.lastIndexOf(')')
  const inner = openIdx >= 0 && closeIdx > openIdx ? raw.slice(openIdx + 1, closeIdx) : raw
  const parts = inner.split(',').map((p) => Number(p.trim()))
  if (parts.length === 2 && parts.every((p) => Number.isFinite(p))) {
    return { x: parts[0], y: parts[1], z: 0 }
  }
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null
  return { x: parts[0], y: parts[1], z: parts[2] }
}

/** Componentes de un IfcDirection. Admite 2 ó 3 componentes. */
function ifcDirection(entity: IfcEntity): { x: number; y: number; z: number } | null {
  const raw = entity.args[entity.args.length - 1] ?? entity.args[1] ?? entity.args[0] ?? ''
  const openIdx = raw.indexOf('(')
  const closeIdx = raw.lastIndexOf(')')
  const inner = openIdx >= 0 && closeIdx > openIdx ? raw.slice(openIdx + 1, closeIdx) : raw
  const parts = inner.split(',').map((p) => Number(p.trim()))
  if (parts.length === 2) {
    if (parts.some((p) => !Number.isFinite(p))) return null
    return { x: parts[0], y: parts[1], z: 0 }
  }
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null
  return { x: parts[0], y: parts[1], z: parts[2] }
}

/** Posición y giro de un IfcLocalPlacement, acumulando el placement padre. */
function ifcPlacementOffset(
  byId: Map<number, IfcEntity>,
  placement: IfcEntity,
  visited: Set<number> = new Set()
): { x: number; y: number; z: number; angle: number } | null {
  if (visited.has(placement.id)) return null
  visited.add(placement.id)

  const axisId = ifcRef(placement.args[1])
  const axis = axisId !== null ? byId.get(axisId) : undefined
  if (!axis) return null

  const originId = ifcRef(axis.args[1]) ?? ifcRef(axis.args[0])
  const origin = originId !== null ? byId.get(originId) : undefined
  if (!origin) return null
  const coords = ifcPoint(origin)
  if (!coords) return null

  const xAxisId = ifcRef(axis.args[3]) ?? ifcRef(axis.args[2])
  const xAxis = xAxisId !== null ? byId.get(xAxisId) : undefined
  let angle = 0
  if (xAxis) {
    const dir = ifcDirection(xAxis)
    if (dir && (dir.x !== 0 || dir.y !== 0)) angle = Math.atan2(dir.y, dir.x)
  }

  const local = { x: coords.x, y: coords.y, z: coords.z, angle }

  const parentId = ifcRef(placement.args[0])
  if (parentId === null) return local
  const parent = byId.get(parentId)
  if (!parent || parent.type !== 'IFCLOCALPLACEMENT') return local
  const parentOffset = ifcPlacementOffset(byId, parent, visited)
  if (!parentOffset) return local

  const cos = Math.cos(parentOffset.angle)
  const sin = Math.sin(parentOffset.angle)
  return {
    x: parentOffset.x + local.x * cos - local.z * sin,
    y: parentOffset.y + local.y,
    z: parentOffset.z + local.x * sin + local.z * cos,
    angle: parentOffset.angle + local.angle
  }
}

/** Dimensiones y posición local de un IfcExtrudedAreaSolid. */
interface IfcBox {
  x: number
  y: number
  z: number
  length: number
  width: number
  depth: number
  angle: number
}

/** Resuelve un IFCEXTRUDEDAREASOLID directo o anidado dentro de IFCPRODUCTDEFINITIONSHAPE / IFCSHAPEREPRESENTATION. */
function resolveExtrudedSolid(byId: Map<number, IfcEntity>, start: IfcEntity, depth = 0): IfcEntity | null {
  if (depth > 5) return null
  if (start.type === 'IFCEXTRUDEDAREASOLID') return start
  for (const arg of start.args) {
    const matches = arg.match(/#(\d+)/g)
    if (!matches) continue
    for (const refStr of matches) {
      const refId = Number(refStr.slice(1))
      const child = byId.get(refId)
      if (!child) continue
      const found = resolveExtrudedSolid(byId, child, depth + 1)
      if (found) return found
    }
  }
  return null
}

function ifcBoxFromShape(byId: Map<number, IfcEntity>, shapeOrRep: IfcEntity): IfcBox | null {
  const shape = resolveExtrudedSolid(byId, shapeOrRep)
  if (!shape) return null

  // shape es un IFCEXTRUDEDAREASOLID: ($, #perfil, #posicion, #direccion, profundidad) o (#perfil, #pos, #dir, profundidad)
  const profileId = ifcRef(shape.args[1]) ?? ifcRef(shape.args[0])
  const profile = profileId !== null ? byId.get(profileId) : undefined
  if (!profile) return null

  let xSize: number | null = null
  let ySize: number | null = null
  if (profile.type === 'IFCCIRCLEPROFILEDEF' || profile.type === 'IFCCIRCLEHOLLOWPROFILEDEF') {
    const r = ifcNumber(profile.args[3]) ?? ifcNumber(profile.args[2])
    if (r !== null) {
      xSize = r * 2
      ySize = r * 2
    }
  } else {
    // IFCRECTANGLEPROFILEDEF: (.AREA., 'nombre', $, #posicion, XDim, YDim) o (.AREA., 'nombre', #pos, XDim, YDim)
    xSize = ifcNumber(profile.args[4]) ?? ifcNumber(profile.args[3])
    ySize = ifcNumber(profile.args[5]) ?? ifcNumber(profile.args[4])
  }

  const depth = ifcNumber(shape.args[4]) ?? ifcNumber(shape.args[3])
  if (xSize === null || ySize === null || depth === null) return null

  const posId = ifcRef(shape.args[2]) ?? ifcRef(shape.args[1])
  const pos = posId !== null ? byId.get(posId) : undefined
  const local = pos ? (ifcPoint(pos) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 }

  return {
    x: local.x,
    y: local.y,
    z: local.z,
    length: xSize,
    width: ySize,
    depth,
    angle: 0
  }
}

function extractEntityName(entity: IfcEntity, fallback: string): string {
  return ifcString(entity.args[0] ?? '') ?? ifcString(entity.args[2] ?? '') ?? fallback
}

/** Interpreta un IFC y devuelve el plan de importación con muros, vanos, losas, columnas, techos y mobiliario. */
export function planIfcImport(parsed: ParsedIfc): IfcImportPlan {
  const byId = new Map<number, IfcEntity>()
  for (const entity of parsed.entities) byId.set(entity.id, entity)

  const walls: IfcImportedWall[] = []
  const openings: IfcImportedOpening[] = []
  const slabs: IfcImportedStructuralElement[] = []
  const columns: IfcImportedStructuralElement[] = []
  const roofs: IfcImportedStructuralElement[] = []
  const furnishings: IfcImportedStructuralElement[] = []
  let skipped = 0

  for (const entity of parsed.entities) {
    const isWall = WALL_TYPES.has(entity.type)
    const isOpening = OPENING_TYPES.has(entity.type)
    const isSlab = SLAB_TYPES.has(entity.type)
    const isColumn = COLUMN_TYPES.has(entity.type)
    const isRoof = ROOF_TYPES.has(entity.type)
    const isFurnishing = FURNISHING_TYPES.has(entity.type)

    if (!isWall && !isOpening && !isSlab && !isColumn && !isRoof && !isFurnishing) continue

    const placementId = ifcRef(entity.args[5])
    const placement = placementId !== null ? byId.get(placementId) : undefined
    const relative = placement ? ifcPlacementOffset(byId, placement) : null
    if (!relative) {
      skipped++
      continue
    }

    const shapeId = ifcRef(entity.args[7]) ?? ifcRef(entity.args[6])
    const shape = shapeId !== null ? byId.get(shapeId) : undefined
    const box = shape ? ifcBoxFromShape(byId, shape) : null
    if (!box) {
      skipped++
      continue
    }

    const x = relative.x + box.x
    const y = relative.y + box.y
    const z = relative.z + box.z
    const angle = relative.angle + box.angle

    if (isWall) {
      walls.push({
        name: extractEntityName(entity, 'Muro IFC'),
        x,
        y,
        z,
        length: box.length,
        thickness: box.width,
        height: box.depth,
        angle
      })
    } else if (isOpening) {
      openings.push({
        kind: entity.type === 'IFCDOOR' ? 'door' : 'window',
        name: extractEntityName(entity, entity.type === 'IFCDOOR' ? 'Puerta' : 'Ventana'),
        x,
        y,
        z,
        width: box.length,
        height: box.depth,
        depth: box.width,
        angle
      })
    } else if (isSlab) {
      slabs.push({
        kind: 'slab',
        name: extractEntityName(entity, 'Losa IFC'),
        x,
        y,
        z,
        width: box.length,
        height: box.depth,
        depth: box.width,
        angle
      })
    } else if (isColumn) {
      columns.push({
        kind: 'column',
        name: extractEntityName(entity, 'Columna IFC'),
        x,
        y,
        z,
        width: box.length,
        height: box.depth,
        depth: box.width,
        angle
      })
    } else if (isRoof) {
      roofs.push({
        kind: 'roof',
        name: extractEntityName(entity, 'Cubierta IFC'),
        x,
        y,
        z,
        width: box.length,
        height: box.depth,
        depth: box.width,
        angle
      })
    } else if (isFurnishing) {
      furnishings.push({
        kind: 'furnishing',
        name: extractEntityName(entity, 'Mobiliario IFC'),
        x,
        y,
        z,
        width: box.length,
        height: box.depth,
        depth: box.width,
        angle
      })
    }
  }

  return {
    walls,
    openings,
    slabs,
    columns,
    roofs,
    furnishings,
    skipped,
    projectName: parsed.projectName
  }
}

export interface IfcSceneTarget {
  addWall(type: WallSegmentType, start: THREE.Vector3, end: THREE.Vector3): Wall
  addObject(object: SceneObject): SceneObject
  addOpening?(wallId: string, spec: Omit<Opening, 'id' | 'wallId'>): Opening | null
}

export interface ApplyIfcOptions {
  scale?: number
  position?: { x: number; y: number; z: number }
  rotationY?: number
  centerAtOrigin?: boolean
  includeInCosts?: boolean
}

export interface ApplyIfcResult {
  ok: boolean
  walls: number
  openings: number
  slabs: number
  columns: number
  objects: number
  message: string
}

/**
 * Inyecta el plan IFC en la escena como entidades paramétricas nativas editables:
 * - `IfcWall` → `Wall` real (`scene.addWall`) con grosor y altura paramétricos.
 * - `IfcDoor` / `IfcWindow` → abertura en muro (`scene.addOpening`) + objeto puerta/ventana.
 * - `IfcSlab` → losa estructural (`opening.slab`).
 * - `IfcColumn` → columna estructural (`shape.column`).
 * - `IfcRoof` → cubierta (`roof.flat`).
 * - `IfcFurnishingElement` → mobiliario (`SceneObject`).
 */
export function applyIfcImport(
  scene: IfcSceneTarget,
  plan: IfcImportPlan,
  options: ApplyIfcOptions = {}
): ApplyIfcResult {
  const totalCount =
    plan.walls.length +
    plan.openings.length +
    plan.slabs.length +
    plan.columns.length +
    plan.roofs.length +
    plan.furnishings.length

  if (totalCount === 0) {
    return {
      ok: false,
      walls: 0,
      openings: 0,
      slabs: 0,
      columns: 0,
      objects: 0,
      message: 'Importar IFC: no se encontraron elementos geométricos compatibles (IfcWall, IfcSlab, IfcColumn…).'
    }
  }

  const scale = options.scale !== undefined && options.scale > 0 ? options.scale : 1
  const posX = options.position?.x ?? 0
  const posY = options.position?.y ?? 0
  const posZ = options.position?.z ?? 0
  const rotY = options.rotationY ?? 0
  const centerAtOrigin = options.centerAtOrigin ?? false
  const includeInCosts = options.includeInCosts ?? true

  let cx = 0
  let cz = 0
  if (centerAtOrigin) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    const expand = (x: number, z: number): void => {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    for (const w of plan.walls) expand(w.x, w.z)
    for (const s of plan.slabs) expand(s.x, s.z)
    for (const c of plan.columns) expand(c.x, c.z)
    for (const r of plan.roofs) expand(r.x, r.z)
    for (const f of plan.furnishings) expand(f.x, f.z)
    if (Number.isFinite(minX)) {
      cx = (minX + maxX) / 2
      cz = (minZ + maxZ) / 2
    }
  }

  const cosR = Math.cos(rotY)
  const sinR = Math.sin(rotY)
  const transformXZ = (x: number, z: number): { x: number; z: number } => {
    const dx = (x - cx) * scale
    const dz = (z - cz) * scale
    return {
      x: dx * cosR - dz * sinR + posX,
      z: dx * sinR + dz * cosR + posZ
    }
  }

  const createdWalls: Wall[] = []
  for (const w of plan.walls) {
    const halfLen = w.length / 2
    const wx0 = w.x - Math.cos(w.angle) * halfLen
    const wz0 = w.z - Math.sin(w.angle) * halfLen
    const wx1 = w.x + Math.cos(w.angle) * halfLen
    const wz1 = w.z + Math.sin(w.angle) * halfLen

    const p0 = transformXZ(wx0, wz0)
    const p1 = transformXZ(wx1, wz1)
    const wy = w.y * scale + posY

    const wall = scene.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(p0.x, wy, p0.z),
      new THREE.Vector3(p1.x, wy, p1.z)
    )
    wall.thickness = Math.max(0.05, w.thickness * scale)
    wall.height = Math.max(0.2, w.height * scale)
    createdWalls.push(wall)
  }

  let openingsCount = 0
  let objectsCount = 0

  for (const op of plan.openings) {
    const p = transformXZ(op.x, op.z)
    const width = Math.max(0.2, op.width * scale)
    const height = Math.max(0.2, op.height * scale)
    const depth = Math.max(0.05, op.depth * scale)
    const sill = Math.max(0, (op.y - op.height / 2) * scale)

    // Intentar alojar el hueco en el muro más cercano si cae sobre su eje
    let hostedOnWall: Wall | null = null
    let hostDistAlong = 0
    for (const wall of createdWalls) {
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      const len = Math.hypot(dx, dz)
      if (len < width) continue
      const ux = dx / len
      const uz = dz / len
      const rx = p.x - wall.start.x
      const rz = p.z - wall.start.z
      const along = rx * ux + rz * uz
      const perp = Math.abs(-rx * uz + rz * ux)
      if (along >= width / 2 - 0.05 && along <= len - width / 2 + 0.05 && perp <= wall.thickness + 0.15) {
        hostedOnWall = wall
        hostDistAlong = Math.min(Math.max(along, width / 2), len - width / 2)
        break
      }
    }

    if (hostedOnWall && scene.addOpening) {
      scene.addOpening(hostedOnWall.id, {
        type: op.kind,
        x: hostDistAlong,
        width,
        height,
        sill: op.kind === 'door' ? 0 : sill,
        materialId: null
      })
    }

    const obj = new SceneObject(op.name, 'furniture')
    obj.shapeId = op.kind === 'door' ? 'opening.door' : 'opening.window'
    obj.openingVariant = 'simple'
    obj.position.set(p.x, op.kind === 'door' ? posY : posY + sill, p.z)
    obj.size.set(width, height, depth)
    obj.rotationY = -(op.angle + rotY)
    obj.color = op.kind === 'door' ? 0x8b5a2b : 0x88b4d8
    obj.includeInCosts = includeInCosts
    scene.addObject(obj)
    openingsCount++
    objectsCount++
  }

  for (const slab of plan.slabs) {
    const p = transformXZ(slab.x, slab.z)
    const obj = new SceneObject(slab.name, 'shape')
    obj.shapeId = 'opening.slab'
    obj.position.set(p.x, slab.y * scale + posY, p.z)
    obj.size.set(
      Math.max(0.1, slab.width * scale),
      Math.max(0.05, slab.height * scale),
      Math.max(0.1, slab.depth * scale)
    )
    obj.rotationY = -(slab.angle + rotY)
    obj.color = 0x9c9689
    obj.includeInCosts = includeInCosts
    scene.addObject(obj)
    objectsCount++
  }

  for (const col of plan.columns) {
    const p = transformXZ(col.x, col.z)
    const obj = new SceneObject(col.name, 'shape')
    obj.shapeId = 'shape.column'
    obj.position.set(p.x, col.y * scale + posY, p.z)
    obj.size.set(
      Math.max(0.1, col.width * scale),
      Math.max(0.2, col.height * scale),
      Math.max(0.1, col.depth * scale)
    )
    obj.rotationY = -(col.angle + rotY)
    obj.color = 0xb8b4aa
    obj.includeInCosts = includeInCosts
    scene.addObject(obj)
    objectsCount++
  }

  for (const roof of plan.roofs) {
    const p = transformXZ(roof.x, roof.z)
    const obj = new SceneObject(roof.name, 'roof')
    obj.shapeId = 'roof.flat'
    obj.position.set(p.x, roof.y * scale + posY, p.z)
    obj.size.set(
      Math.max(0.2, roof.width * scale),
      Math.max(0.05, roof.height * scale),
      Math.max(0.2, roof.depth * scale)
    )
    obj.rotationY = -(roof.angle + rotY)
    obj.color = 0x8c584c
    obj.includeInCosts = includeInCosts
    scene.addObject(obj)
    objectsCount++
  }

  for (const furn of plan.furnishings) {
    const p = transformXZ(furn.x, furn.z)
    const obj = new SceneObject(furn.name, 'furniture')
    obj.position.set(p.x, furn.y * scale + posY, p.z)
    obj.size.set(
      Math.max(0.1, furn.width * scale),
      Math.max(0.1, furn.height * scale),
      Math.max(0.1, furn.depth * scale)
    )
    obj.rotationY = -(furn.angle + rotY)
    obj.color = 0x9aa4b2
    obj.includeInCosts = includeInCosts
    scene.addObject(obj)
    objectsCount++
  }

  const parts: string[] = []
  if (createdWalls.length > 0) {
    parts.push(`${createdWalls.length} muro${createdWalls.length === 1 ? '' : 's'}`)
  }
  if (plan.slabs.length > 0) {
    parts.push(`${plan.slabs.length} losa${plan.slabs.length === 1 ? '' : 's'}`)
  }
  if (plan.columns.length > 0) {
    parts.push(`${plan.columns.length} columna${plan.columns.length === 1 ? '' : 's'}`)
  }
  if (openingsCount > 0) {
    parts.push(`${openingsCount} vano${openingsCount === 1 ? '' : 's'}`)
  }
  if (plan.roofs.length + plan.furnishings.length > 0) {
    const rest = plan.roofs.length + plan.furnishings.length
    parts.push(`${rest} elemento${rest === 1 ? '' : 's'}`)
  }

  return {
    ok: true,
    walls: createdWalls.length,
    openings: openingsCount,
    slabs: plan.slabs.length,
    columns: plan.columns.length,
    objects: objectsCount,
    message: `Importar IFC: ${parts.join(', ')} integrados en la escena.`
  }
}
