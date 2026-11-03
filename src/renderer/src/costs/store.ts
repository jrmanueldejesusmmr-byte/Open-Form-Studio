/** Persistencia de precios y parámetros de Costos (puro, sin DOM).
 *
 * Usa el mismo mecanismo que el resto de la app (`localStorage`) con la clave
 * `arqstudio.costs.v1`, igual que `ProjectStore` para los proyectos. Los
 * precios son **solo** los que escribe el usuario hoy: nunca se ponen por
 * defecto ni se buscan en internet.
 */
import { CostParams, CostPrices } from './types'

export const COSTS_STORAGE_KEY = 'arqstudio.costs.v1'

export interface CostStoreData {
  prices: CostPrices
  params: CostParams
}

/** Parámetros por defecto (neutros: no inflan el total si el usuario no toca nada). */
export function defaultParams(): CostParams {
  return {
    wastagePct: 0,
    labourMultiplier: 1,
    contingencyPct: 0,
    taxPct: 0,
    currencySymbol: '$',
    roundTo: 0,
    units: 'm2'
  }
}

/** Precios por defecto: vacíos (el usuario los rellena). */
export function defaultPrices(): CostPrices {
  return {}
}

export function defaultStoreData(): CostStoreData {
  return { prices: defaultPrices(), params: defaultParams() }
}

/** Fusiona datos crudos (de disco) con los defectos, tolerando valores ausentes. */
export function normalizeStoreData(raw: unknown): CostStoreData {
  const def = defaultStoreData()
  if (!raw || typeof raw !== 'object') return def
  const obj = raw as Partial<CostStoreData>

  const prices: CostPrices = {}
  if (obj.prices && typeof obj.prices === 'object') {
    for (const [k, v] of Object.entries(obj.prices)) {
      const n = Number(v)
      if (Number.isFinite(n)) prices[k] = n
    }
  }

  const p = (obj.params ?? {}) as Partial<CostParams>
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback

  const params: CostParams = {
    wastagePct: num(p.wastagePct, def.params.wastagePct),
    labourMultiplier: num(p.labourMultiplier, def.params.labourMultiplier),
    contingencyPct: num(p.contingencyPct, def.params.contingencyPct),
    taxPct: num(p.taxPct, def.params.taxPct),
    currencySymbol: typeof p.currencySymbol === 'string' && p.currencySymbol ? p.currencySymbol : def.params.currencySymbol,
    roundTo: num(p.roundTo, def.params.roundTo),
    units: typeof p.units === 'string' && p.units ? p.units : def.params.units
  }

  return { prices, params }
}

/** Lee del almacenamiento local; ante cualquier error devuelve los defectos. */
export function loadStore(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): CostStoreData {
  try {
    const raw = storage?.getItem(COSTS_STORAGE_KEY)
    if (!raw) return defaultStoreData()
    return normalizeStoreData(JSON.parse(raw))
  } catch {
    return defaultStoreData()
  }
}

/** Escribe en el almacenamiento local; ignora fallos (cuota, modo privado…). */
export function saveStore(data: CostStoreData, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(COSTS_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Sin persistencia disponible: no es crítico, la sesión sigue funcionando.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined
  } catch {
    return undefined
  }
}
