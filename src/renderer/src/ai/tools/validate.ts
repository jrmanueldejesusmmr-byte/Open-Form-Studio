/** Validadores compartidos (rangos en metros razonables, errores en español). */
import { ToolValidationError } from './types'
export const LIMITS = {
  COORD_MIN: -100,
  COORD_MAX: 100,
  WALL_MIN: 0.2,
  WALL_MAX: 60,
  HEIGHT_MIN: 0.3,
  HEIGHT_MAX: 12,
  THICK_MIN: 0.05,
  THICK_MAX: 1,
  DELTA_MAX: 30,
  SLOPE_MIN: 0,
  SLOPE_MAX: 60,
  OVERHANG_MIN: 0,
  OVERHANG_MAX: 2,
  FENCE_H_MIN: 0.3,
  FENCE_H_MAX: 3,
  HOUSE_FLOORS_MAX: 4
} as const
function num(value: unknown, nombre: string): number {
  const n = typeof value === 'string' ? Number(value) : (value as number)
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new ToolValidationError(`«${nombre}» debe ser un número.`)
  }
  return n
}
export function reqNum(params: Record<string, unknown>, nombre: string, min: number, max: number): number {
  if (params[nombre] === undefined || params[nombre] === null) {
    throw new ToolValidationError(`Falta el parámetro obligatorio «${nombre}».`)
  }
  const n = num(params[nombre], nombre)
  if (n < min || n > max) {
    throw new ToolValidationError(`«${nombre}» debe estar entre ${min} y ${max} (recibido ${n}).`)
  }
  return n
}
export function optNum(params: Record<string, unknown>, nombre: string, porDefecto: number, min: number, max: number): number {
  if (params[nombre] === undefined || params[nombre] === null) return porDefecto
  return reqNum(params, nombre, min, max)
}
export function reqStr(params: Record<string, unknown>, nombre: string): string {
  const v = params[nombre]
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ToolValidationError(`Falta el parámetro obligatorio «${nombre}».`)
  }
  return v.trim()
}
export function optStr(params: Record<string, unknown>, nombre: string, porDefecto: string): string {
  const v = params[nombre]
  if (v === undefined || v === null) return porDefecto
  if (typeof v !== 'string') throw new ToolValidationError(`«${nombre}» debe ser texto.`)
  return v
}
export function reqPunto(params: Record<string, unknown>, nombre: string): { x: number; z: number } {
  const v = params[nombre] as { x?: unknown; z?: unknown } | undefined
  if (!v || typeof v !== 'object') {
    throw new ToolValidationError(`Falta el punto «${nombre}» (formato {x, z} en metros).`)
  }
  const x = reqNum({ v: v.x }, 'v', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
  const z = reqNum({ v: v.z }, 'v', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
  return { x, z }
}
export function fmt(n: number): string {
  return Number(n.toFixed(2)).toString()
}
