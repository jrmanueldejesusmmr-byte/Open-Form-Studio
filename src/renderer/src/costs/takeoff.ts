/** Toma de precios (takeoff): lectura del modelo 3D en cantidades físicas.
 *
 * No depende de DOM ni de Three.js. El paso opcional `wallOpenings` resta las
 * áreas de puertas y ventanas de cada muro, para que el área neta sea exacta.
 */
import { SceneManager } from '../engine/SceneManager'
import type { Wall } from '../models/Wall'
import type { SceneObject } from '../models/SceneObject'
import {
  SCALE_GRID_BOX_TO_METERS,
  PhysicalQuantities,
  WallMeasurement,
  FloorQuantity,
  QuantityByKind
} from './types'
import type { CostDetailItem, CostTotals } from './types'

/** Fórmula de conversión: el cuadro de cuadrícula es exactamente 1 m. */
export const IS_METERS_PER_GRID_BOX = SCALE_GRID_BOX_TO_METERS

// ---------------------------------------------------------------------
// Openings (aperturas) opcionales por muro
// ---------------------------------------------------------------------

export interface WallOpening {
  doorArea: number
  windowArea: number
}

/** Propósito: permitir restar puertas/ventanas del área neta del muro. */
export interface WallOpeningsMap {
  [wallId: string]: WallOpening
}

// ---------------------------------------------------------------------
// Detección básica de objetos (sin tocar la UI ni la IA).
// ---------------------------------------------------------------------

function isObjectNamed(object: SceneObject, needle: string): boolean {
  return !!(object.name && object.name.toLowerCase().includes(needle))
}

function isShapeOf(object: SceneObject, needle: string): boolean {
  return !!(object.shapeId && object.shapeId.toLowerCase().includes(needle))
}

/** Un objeto importado (capa «importado») no cuenta en Costos a menos que el
 * usuario lo haya marcado al importar (`includeInCosts === true`). */
export function shouldCountInCosts(object: SceneObject): boolean {
  if (object.layer === 'importado' && !object.includeInCosts) return false
  return true
}

// -----------------------------------------------------------------
// Medición de un muro único (independiente de Three.js).
// -----------------------------------------------------------------

export function measureWall(wall: Wall, opening?: WallOpening): WallMeasurement {
  const length = wall.length
  const height = wall.height
  const thickness = wall.thickness
  const grossArea = length * height
  const grossVolume = grossArea * thickness
  const doorArea = opening?.doorArea ?? 0
  const windowArea = opening?.windowArea ?? 0
  const netArea = Math.max(0, grossArea - doorArea - windowArea)
  // Volumen neto: se descuenta el prisma de las aperturas (puertas/ventanas)
  // multiplicando su área por el espesor del muro.
  const openingArea = doorArea + windowArea
  const volume = Math.max(0, grossVolume - openingArea * thickness)
  return {
    id: wall.id,
    levelId: wall.levelId,
    length,
    height,
    thickness,
    grossArea,
    netArea,
    volume,
    doorArea,
    windowArea
  }
}

// -----------------------------------------------------------------
// Cálculo de área/ perímetro de un polígono en el plano XZ.
// -----------------------------------------------------------------

function polygonArea(points: Array<{ x: number; z: number }>): number {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    area += a.x * b.z
    area -= b.x * a.z
  }
  return Math.abs(area) / 2
}

function polygonPerimeter(points: Array<{ x: number; z: number }>): number {
  let perim = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    perim += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return perim
}

/** Área inclinada de un techo a partir de la huella plana y pendiente (grados). */
export function roofInclinedArea(footprint: Array<{ x: number; z: number }>, slopeDeg: number): number {
  const plan = polygonArea(footprint)
  if (!plan) return 0
  const cos = Math.cos((slopeDeg * Math.PI) / 180)
  if (!Number.isFinite(cos) || cos < 1e-6) return plan
  return plan / cos
}

/**
 * Área total de cubierta con aleros (m²):
 * área inclinada del contorno + perímetro × alero.
 * Misma fórmula que `engine/RoofBuilder.roofTotalArea` (duplicada aquí para
 * no meter Three.js en el módulo de costos, que es puro).
 */
export function roofTotalArea(footprint: Array<{ x: number; z: number }>, slopeDeg: number, overhang: number): number {
  const plan = polygonArea(footprint)
  if (!plan) return 0
  return roofInclinedArea(footprint, slopeDeg) + polygonPerimeter(footprint) * Math.max(0, overhang)
}

// -----------------------------------------------------------------
// Lectura del modelo y distribución por categoría.
// -----------------------------------------------------------------

export function takeoffScene(
  scene: SceneManager,
  wallOpenings: WallOpeningsMap = {}
): PhysicalQuantities {
  const walls = scene.getWalls().map((wall) => measureWall(wall, wallOpenings[wall.id]))
  const levels = scene.getLevels()

  // Losas/pisos: aproximación por piso usando la huella de muros por piso.
  // Cuando no hay muros, se deja 0 hasta tener un plano master.
  const wallsByLevel = new Map<string, WallMeasurement[]>()
  for (const wall of walls) {
    const list = wallsByLevel.get(wall.levelId) ?? []
    list.push(wall)
    wallsByLevel.set(wall.levelId, list)
  }

  const floorAreas = new Map<string, number>()
  for (const level of levels) {
    floorAreas.set(level.id, 0)
  }
  for (const [levelId, list] of wallsByLevel) {
    const totalLength = list.reduce((sum, w) => sum + w.length, 0)
    // Aproximación simple: perímetro estimado = 2 * longitud total en una planta
    // sencilla; se usa solo como estimación rápida de la cotización.
    const perimeter = totalLength * 2
    const area = perimeter * 1 // orientación X, no modifica la escala
    floorAreas.set(levelId, area)
  }

  const slabs: FloorQuantity[] = levels.map((level) => ({
    levelId: level.id,
    name: level.name,
    qty: floorAreas.get(level.id) ?? 0,
    unit: 'm2'
  }))

  const costObjects = scene.getObjects().filter(shouldCountInCosts)

  // Techos: objetos tipo techo con shapeId o kind 'roof'.
  const roofLike = costObjects.filter((obj) =>
    isShapeOf(obj, 'roof') || obj.kind === 'roof' || isObjectNamed(obj, 'tech')
  )
  const roofs: FloorQuantity[] = roofLike.map((obj) => {
    const size = obj.size
    const footprint = obj.roofProps?.footprint ?? []
    const slope = obj.roofProps?.slope ?? DEFAULT_ROOF_SLOPE
    const overhang = obj.roofProps?.overhang ?? DEFAULT_ROOF_OVERHANG
    // Área inclinada = área en planta / cos(pendiente) + perímetro × alero.
    const qty = footprint.length >= 3
      ? roofTotalArea(footprint, slope, overhang)
      : size.x * size.z
    return { levelId: obj.levelId, name: obj.name, qty, unit: 'm2' }
  })

  // Puertas y ventanas: se extraen de objetos de mobiliario cuyo nombre
  // indique una de estas categorías.
  const doorObjects = costObjects.filter((obj) =>
    isObjectNamed(obj, 'puerta') || isObjectNamed(obj, 'door') || isShapeOf(obj, 'door')
  )
  const windowObjects = costObjects.filter((obj) =>
    isObjectNamed(obj, 'ventana') || isObjectNamed(obj, 'window') || isShapeOf(obj, 'window')
  )
  const doors: QuantityByKind[] = doorObjects.map((obj) => ({
    kind: obj.name || 'puerta',
    qty: 1
  }))
  const windows: QuantityByKind[] = windowObjects.map((obj) => ({
    kind: obj.name || 'ventana',
    qty: 1
  }))

  // Muebles/otros objetos: agrupación por tipo de nombre.
  const otherObjects = costObjects.filter((obj) =>
    obj.kind === 'furniture' && !doorObjects.includes(obj) && !windowObjects.includes(obj)
  )
  const objectGroups = new Map<string, number>()
  for (const obj of otherObjects) {
    const key = obj.name || obj.kind || 'objeto'
    objectGroups.set(key, (objectGroups.get(key) ?? 0) + 1)
  }
  const objects: QuantityByKind[] = Array.from(objectGroups.entries()).map(([kind, qty]) => ({ kind, qty }))

  return { walls, slabs, roofs, doors, windows, objects }
}

/** Construye los elementos individuales (detalle) y los totales de los
 * costos a partir de una toma de precios y la escena, para la vista
 * "Detalle" expansible del panel. */
export function buildCostDetails(
  scene: SceneManager,
  takeoff: PhysicalQuantities
): { details: CostDetailItem[]; totals: CostTotals } {
  const details: CostDetailItem[] = []
  const totals: CostTotals = {
    wallLinearLength: 0,
    builtArea: 0,
    doorCount: 0,
    windowCount: 0,
    furnitureCount: 0,
    total: 0
  }

  // Muros: longitud total, área bruta/ neta y volumen.
  for (const wall of takeoff.walls) {
    totals.wallLinearLength += wall.length
    totals.builtArea += wall.grossArea
    details.push({
      id: wall.id,
      kind: 'muro',
      label: `Muro ${wall.id}`,
      levelId: wall.levelId,
      levelName: '',
      length: wall.length,
      height: wall.height,
      thickness: wall.thickness,
      grossArea: wall.grossArea,
      netArea: wall.netArea,
      volume: wall.volume,
      ids: [wall.id]
    })
  }

  // Objetos individuales (puertas, ventanas y muebles).
  const named = (obj: SceneObject, needle: string): boolean =>
    !!obj.name && obj.name.toLowerCase().includes(needle)
  const shaped = (obj: SceneObject, needle: string): boolean =>
    !!obj.shapeId && obj.shapeId.toLowerCase().includes(needle)

  for (const obj of scene.getObjects().filter(shouldCountInCosts)) {
    const level = scene.getLevel(obj.levelId)
    const levelName = level?.name ?? obj.levelId
    const isDoor = named(obj, 'puerta') || named(obj, 'door') || shaped(obj, 'door')
    const isWindow = named(obj, 'ventana') || named(obj, 'window') || shaped(obj, 'window')
    if (isDoor) {
      totals.doorCount += 1
      details.push({
        id: obj.id,
        kind: 'puerta',
        label: obj.name ?? 'Puerta',
        levelId: obj.levelId,
        levelName,
        width: obj.size?.x ?? 0,
        height: obj.size?.y ?? 0,
        material: obj.materialId ?? undefined,
        ids: [obj.id]
      })
    } else if (isWindow) {
      totals.windowCount += 1
      details.push({
        id: obj.id,
        kind: 'ventana',
        label: obj.name ?? 'Ventana',
        levelId: obj.levelId,
        levelName,
        width: obj.size?.x ?? 0,
        height: obj.size?.y ?? 0,
        material: obj.materialId ?? undefined,
        ids: [obj.id]
      })
    } else if (obj.kind === 'furniture') {
      totals.furnitureCount += 1
      details.push({
        id: obj.id,
        kind: 'mueble',
        label: obj.name ?? 'Objeto',
        levelId: obj.levelId,
        levelName,
        width: obj.size?.x ?? 0,
        depth: obj.size?.z ?? 0,
        height: obj.size?.y ?? 0,
        material: obj.materialId ?? undefined,
        ids: [obj.id]
      })
    }
  }

  // Área total construida: muros en bruto + techos.
  for (const roof of takeoff.roofs) {
    totals.builtArea += roof.qty
  }

  return { details, totals }
}
// Constantes de referencia para techos (valores por defecto).
// -----------------------------------------------------------------

export const DEFAULT_ROOF_SLOPE = 30

export const DEFAULT_ROOF_OVERHANG = 0.3

export const ROOF_FLAT_THICKNESS = 0.35
