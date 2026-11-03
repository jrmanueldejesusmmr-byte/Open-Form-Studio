/** Cotización: fórmula cerrada sobre una toma de precios (sin DOM, sin Three.js). */
import { PhysicalQuantities, CostParams, CostPrices, CostLine, CostQuote, CostGroup } from './types'

/** Redondea un valor al múltiplo `step` más cercano; `step <= 0` -> Math.round. */
export function roundTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value)
  return Math.round(value / step) * step
}

/** Aplica un porcentaje neto (8% -> 1.08). */
export function applyPct(value: number, pct: number): number {
  return value * (1 + pct / 100)
}

/** Normaliza la cantidad a la unidad solicitada para la cotización. */
function normalizeQty(qty: number, unit: string): number {
  const u = unit.trim().toLowerCase()
  if (u === 'unidades' || u === 'unidad' || u === 'piece' || u === 'pieces' || u === 'cnt' || u === 'count') return qty
  if (u === 'm2' || u === 'm²' || u === 'metros cuadrados') return qty
  if (u === 'm' || u === 'metro') return qty
  if (u === 'm3' || u === 'm³' || u === 'metros cúbicos') return qty
  return qty
}

/** Genera las líneas de coste a partir de la toma de precios. */
export function toLines(takeoff: PhysicalQuantities, prices: CostPrices, params: CostParams): CostLine[] {
  const items: CostLine[] = []
  const push = (category: string, qty: number, unit: string, price: number, name: string) => {
    const qtyNorm = normalizeQty(qty, unit)
    const unitPrice = price
    const subtotal = qtyNorm * unitPrice
    items.push({ id: category, category, name, qty: qtyNorm, unit, unitPrice, subtotal, highlighted: false })
  }

  const walls = takeoff.walls
  if (walls.length > 0) {
    const netArea = walls.reduce((s, w) => s + w.netArea, 0)
    const grossArea = walls.reduce((s, w) => s + w.grossArea, 0)
    const totalLength = walls.reduce((s, w) => s + w.length, 0)
    const price = prices['muros'] ?? 0
    // Las líneas de muros usan el área neta en m2; se añade una fila adicional
    // con la longitud total útil para referencia, en m y m3.
    if (price > 0 || params.wastagePct > 0 || params.labourMultiplier > 0) {
      push('muros', netArea, 'm2', price, 'Muros (área neta)')
      push('muros', totalLength, 'm', 0, 'Muros (longitud total)')
      push('muros', grossArea, 'm3', 0, 'Muros (área bruta)')
    }
  }

  // Losas/pisos: una línea por cada piso (aprox. por área de planta).
  for (const slab of takeoff.slabs) {
    const price = prices['slabs'] ?? 0
    if (price > 0 || params.wastagePct > 0 || params.labourMultiplier > 0) {
      push('slabs', slab.qty, slab.unit, price, `Losa ${slab.name}`)
    }
  }

  // Techos: una línea por cada techo detectado (incluida aleros).
  for (const roof of takeoff.roofs) {
    const price = prices['roofs'] ?? 0
    if (price > 0 || params.wastagePct > 0 || params.labourMultiplier > 0) {
      push('roofs', roof.qty, roof.unit, price, `Techo`)
    }
  }

  // Puertas y ventanas: cantidades por tipo.
  for (const door of takeoff.doors) {
    const price = prices['puertas'] ?? 0
    if (price > 0 || params.wastagePct > 0 || params.labourMultiplier > 0) {
      push('puertas', door.qty, 'unidades', price, `Puerta ${door.kind}`)
    }
  }
  for (const win of takeoff.windows) {
    const price = prices['ventanas'] ?? 0
    if (price > 0 || params.wastagePct > 0 || params.labourMultiplier > 0) {
      push('ventanas', win.qty, 'unidades', price, `Ventana ${win.kind}`)
    }
  }

  // Muebles/objetos: cantidades por tipo.
  for (const obj of takeoff.objects) {
    const price = prices['muebles'] ?? 0
    if (price > 0 || params.wastagePct > 0 || params.labourMultiplier > 0) {
      push('muebles', obj.qty, 'unidades', price, `Mueble ${obj.kind}`)
    }
  }

  // Ordenamos estables: muros (área), losas, techos, puertas, ventanas, muebles.
  items.sort((a, b) => a.category.localeCompare(b.category))
  return items
}

/** Construye la cotización aplicando el orden de porcentajes solicitado:
 *
 *   subtotal -> desperdicio -> mano de obra -> imprevistos -> impuestos -> redondeo
 */
export function buildQuote(
  takeoff: PhysicalQuantities,
  prices: CostPrices,
  params: CostParams
): CostQuote {
  const lines = toLines(takeoff, prices, params)
  const subtotal = lines.reduce((sum, item) => sum + item.subtotal, 0)
  const wastage = applyPct(subtotal, params.wastagePct)
  // Un multiplicador de mano de obra ≤ 0 no tiene sentido (anularía el total):
  // se interpreta como «sin ajuste» (1). Así, sin parámetros, total = subtotal.
  const labour = wastage * (params.labourMultiplier > 0 ? params.labourMultiplier : 1)
  const contingency = applyPct(labour, params.contingencyPct)
  const beforeTax = contingency
  const total = roundTo(applyPct(beforeTax, params.taxPct), params.roundTo)

  return {
    items: lines,
    subtotal,
    total,
    base: beforeTax,
    date: new Date().toISOString().slice(0, 10),
    params,
    prices
  }
}

/** Agrupaciones encajan exactamente al esquema `CostGroup` de `types.ts`. */
export function groupLinesByCategory(items: CostLine[]): CostGroup[] {
  const map = new Map<string, CostGroup>()
  for (const item of items) {
    const existing = map.get(item.category)
    if (existing) {
      existing.qty += item.qty
      existing.subtotal += item.subtotal
    } else {
      map.set(item.category, { category: item.category, label: item.name, qty: item.qty, unit: item.unit, subtotal: item.subtotal })
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}
