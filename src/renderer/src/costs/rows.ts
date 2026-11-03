/** Filas de coste por piso y categoría (cálculo puro, sin DOM ni Three.js).
 *
 * `quote.ts` agrega la escena completa; aquí se conserva el desglose **por
 * piso y por categoría** que pide el panel, junto a los ids de los elementos
 * que componen cada fila (para resaltarlos en 3D). El encadenado de
 * porcentajes (desperdicio → mano de obra → imprevistos → impuestos →
 * redondeo) es el mismo de `quote.ts`.
 */
import { takeoffScene, measureWall, shouldCountInCosts, buildCostDetails } from './takeoff'
import type { CostDetailItem, CostTotals } from './types'

export type { CostDetailItem }
import { applyPct, roundTo } from './quote'
import type { SceneManager } from '../engine/SceneManager'
import type { CostPrices, CostParams } from './types'

export type CostCategory = 'muros' | 'slabs' | 'roofs' | 'puertas' | 'ventanas' | 'muebles'

export interface CostRow {
  /** Clave única de fila: `piso|categoría`. */
  id: string
  levelId: string
  levelName: string
  category: CostCategory
  /** Cantidad medida (m², m³, m o unidades según `unit`). */
  qty: number
  unit: string
  /** Precio unitario vigente (el que escribe el usuario, hoy). */
  unitPrice: number
  subtotal: number
  /** Ids de muros/objetos que componen la fila (para resaltar en 3D). */
  wallIds: string[]
  objectIds: string[]
}

export interface CostRowsResult {
  rows: CostRow[]
  subtotal: number
  /** Tras desperdicio y mano de obra. */
  withLabour: number
  /** Tras imprevistos (base antes de impuestos). */
  beforeTax: number
  total: number
  /** Detalle de elementos individuales (muros, puertas, ventanas, muebles). */
  details: CostDetailItem[]
  /** Totales siempre visibles (metros lineales de muros, área construida, conteos). */
  totals: CostTotals
}

const CATEGORY_UNIT: Readonly<Record<CostCategory, string>> = {
  muros: 'm2',
  slabs: 'm2',
  roofs: 'm2',
  puertas: 'unidades',
  ventanas: 'unidades',
  muebles: 'unidades'
}

const CATEGORY_LABEL: Readonly<Record<CostCategory, string>> = {
  muros: 'Muros',
  slabs: 'Losa / Piso',
  roofs: 'Techo',
  puertas: 'Puertas',
  ventanas: 'Ventanas',
  muebles: 'Muebles'
}

/** Unidad legible de una categoría. */
export function categoryUnit(category: CostCategory): string {
  return CATEGORY_UNIT[category]
}

/** Etiqueta legible de una categoría. */
export function categoryLabel(category: CostCategory): string {
  return CATEGORY_LABEL[category]
}

/**
 * Construye las filas por piso y categoría a partir del modelo y los precios
 * actuales. `openings` permite descontar puertas/ventanas del área neta de los
 * muros (mismo mapa que usa `takeoffScene`).
 */
export function buildRows(
  scene: SceneManager,
  prices: CostPrices,
  params: CostParams,
  openings: Record<string, { doorArea: number; windowArea: number }> = {}
): CostRowsResult {
  const levels = scene.getLevels()
  const levelName = (id: string): string => levels.find((l) => l.id === id)?.name ?? id
  const rows: CostRow[] = []

  // --- Muros por piso: cantidad = área neta (m²). ---
  const wallsByLevel = new Map<string, string[]>()
  const netAreaByLevel = new Map<string, number>()
  for (const wall of scene.getWalls()) {
    const m = measureWall(wall, openings[wall.id])
    wallsByLevel.set(wall.levelId, [...(wallsByLevel.get(wall.levelId) ?? []), wall.id])
    netAreaByLevel.set(wall.levelId, (netAreaByLevel.get(wall.levelId) ?? 0) + m.netArea)
  }
  for (const [levelId, wallIds] of wallsByLevel) {
    const qty = netAreaByLevel.get(levelId) ?? 0
    const unitPrice = prices['muros'] ?? 0
    rows.push({
      id: `${levelId}|muros`,
      levelId,
      levelName: levelName(levelId),
      category: 'muros',
      qty,
      unit: 'm2',
      unitPrice,
      subtotal: qty * unitPrice,
      wallIds,
      objectIds: []
    })
  }

  // --- Losas/pisos por piso: cantidad = área de planta (m²). ---
  const takeoff = takeoffScene(scene, openings)
  for (const slab of takeoff.slabs) {
    const unitPrice = prices['slabs'] ?? 0
    rows.push({
      id: `${slab.levelId}|slabs`,
      levelId: slab.levelId,
      levelName: slab.name,
      category: 'slabs',
      qty: slab.qty,
      unit: slab.unit,
      unitPrice,
      subtotal: slab.qty * unitPrice,
      wallIds: [],
      objectIds: []
    })
  }

  // --- Techos por piso: área inclinada + aleros (m²). ---
  for (const roof of takeoff.roofs) {
    const unitPrice = prices['roofs'] ?? 0
    rows.push({
      id: `${roof.levelId}|roofs|${roof.name}`,
      levelId: roof.levelId,
      levelName: levelName(roof.levelId),
      category: 'roofs',
      qty: roof.qty,
      unit: roof.unit,
      unitPrice,
      subtotal: roof.qty * unitPrice,
      wallIds: [],
      objectIds: roofObjectIds(scene, roof.levelId)
    })
  }

  // --- Puertas / ventanas / muebles: cantidad por piso (unidades). ---
  const counts = countObjectsByLevel(scene)
  for (const category of ['puertas', 'ventanas', 'muebles'] as const) {
    for (const [levelId, entry] of counts[category]) {
      const unitPrice = prices[category] ?? 0
      rows.push({
        id: `${levelId}|${category}`,
        levelId,
        levelName: levelName(levelId),
        category,
        qty: entry.qty,
        unit: 'unidades',
        unitPrice,
        subtotal: entry.qty * unitPrice,
        wallIds: [],
        objectIds: entry.ids
      })
    }
  }

  // Orden estable: por piso (orden de `levels`) y luego por categoría.
  const levelOrder = new Map(levels.map((l, i) => [l.id, i]))
  const categoryOrder: CostCategory[] = ['muros', 'slabs', 'roofs', 'puertas', 'ventanas', 'muebles']
  rows.sort((a, b) => {
    const la = levelOrder.get(a.levelId) ?? 99
    const lb = levelOrder.get(b.levelId) ?? 99
    if (la !== lb) return la - lb
    return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
  })

  // Toma de precios para el detalle y los totales.
  const takeoffForDetails = takeoffScene(scene, openings)
  const { details, totals } = buildCostDetails(scene, takeoffForDetails)

  const { rows: rowsWithDetails, subtotal, withLabour, beforeTax, total } = finalize(rows, params)
  return { rows: rowsWithDetails, subtotal, withLabour, beforeTax, total, details, totals }
}

/** Aplica el encadenado de porcentajes sobre las filas ya construidas. */
export function finalize(rows: CostRow[], params: CostParams): CostRowsResult {
  const subtotal = rows.reduce((sum, r) => sum + r.subtotal, 0)
  // Multiplicador de mano de obra ≤ 0 => sin ajuste (1), igual que en quote.ts.
  const labourFactor = params.labourMultiplier > 0 ? params.labourMultiplier : 1
  const withLabour = applyPct(subtotal, params.wastagePct) * labourFactor
  const beforeTax = applyPct(withLabour, params.contingencyPct)
  const total = roundTo(applyPct(beforeTax, params.taxPct), params.roundTo)
  return {
    rows,
    subtotal,
    withLabour,
    beforeTax,
    total,
    details: [],
    totals: {
      wallLinearLength: 0,
      builtArea: 0,
      doorCount: 0,
      windowCount: 0,
      furnitureCount: 0,
      total: 0
    }
  }
}

/** Ids de objetos «techo» de un piso (para resaltar). */
function roofObjectIds(scene: SceneManager, levelId: string): string[] {
  return scene
    .getObjects()
    .filter(
      (o) =>
        o.levelId === levelId &&
        (o.kind === 'roof' || (o.shapeId ?? '').toLowerCase().includes('roof') || (o.name ?? '').toLowerCase().includes('tech'))
    )
    .map((o) => o.id)
}

/** Cuenta puertas / ventanas / muebles por piso con sus ids. */
function countObjectsByLevel(scene: SceneManager): Record<
  'puertas' | 'ventanas' | 'muebles',
  Map<string, { qty: number; ids: string[] }>
> {
  const out = {
    puertas: new Map<string, { qty: number; ids: string[] }>(),
    ventanas: new Map<string, { qty: number; ids: string[] }>(),
    muebles: new Map<string, { qty: number; ids: string[] }>()
  }
  const bump = (
    map: Map<string, { qty: number; ids: string[] }>,
    key: string,
    id: string
  ): void => {
    const e = map.get(key) ?? { qty: 0, ids: [] }
    e.qty += 1
    e.ids.push(id)
    map.set(key, e)
  }

  const named = (o: { name?: string }, needle: string): boolean =>
    !!o.name && o.name.toLowerCase().includes(needle)
  const shaped = (o: { shapeId?: string | null }, needle: string): boolean =>
    !!o.shapeId && o.shapeId.toLowerCase().includes(needle)

  for (const obj of scene.getObjects().filter(shouldCountInCosts)) {
    const isDoor = named(obj, 'puerta') || named(obj, 'door') || shaped(obj, 'door')
    const isWindow = named(obj, 'ventana') || named(obj, 'window') || shaped(obj, 'window')
    if (isDoor) {
      bump(out.puertas, obj.levelId, obj.id)
    } else if (isWindow) {
      bump(out.ventanas, obj.levelId, obj.id)
    } else if (obj.kind === 'furniture') {
      bump(out.muebles, obj.levelId, obj.id)
    }
  }
  return out
}
