/** Formulario de parámetros persistentes para la cotización.
 *
 * Guarda/lee los `CostParams` en `localStorage` bajo `arqstudio:costs:params`.
 */
import type { CostParams } from './types'

const STORAGE_KEY = 'arqstudio:costs:params'

const DEFAULT_PARAMS: CostParams = {
  wastagePct: 10,
  labourMultiplier: 1,
  contingencyPct: 5,
  taxPct: 0,
  currencySymbol: '$',
  roundTo: 100,
  units: 'm2'
}

export function readParams(): CostParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PARAMS }
    const parsed = JSON.parse(raw) as Partial<CostParams>
    return { ...DEFAULT_PARAMS, ...parsed }
  } catch {
    return { ...DEFAULT_PARAMS }
  }
}

export function writeParams(params: CostParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
  } catch {
    // Almacenamiento local ilimitado no está garantizado; el fallback es usar
    // el mecanismo de base de datos si este se encuentra disponible.
  }
}
