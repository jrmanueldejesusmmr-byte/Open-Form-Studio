/**
 * Validación de rangos y comprobación de escena contra especificación — Fase 2.
 *
 * Límites arquitectónicos actualizados: 3 a 200 m (área máxima 40.000 m²).
 * Provee verificación post-generación de elementos en la escena (muros,
 * puertas, ventanas, habitaciones).
 */

import type { DesignSpec } from './spec'
import type { SceneManager } from '../../engine/SceneManager'

/** Perfil de error: código, mensaje literal y sugerencia de corrección. */
export interface ValidationError {
  codigo: string
  mensaje: string
  sugerencia: string
}

/** Resultado de validar un `DesignSpec`: errores encontrados + supuestos. */
export interface ValidationResult {
  ok: boolean
  coordenadas: ValidationError[]
  dimensiones: ValidationError[]
  estructura: ValidationError[]
  faltantes: string[]
  supuestos: string[]
  puntosBase: { x: number; z: number }[]
}

/** Límites arquitectónicos del generador. */
export const ARCH_LIMITS = {
  MIN: 1.2,
  MAX: 200,
  HEIGHT_MIN: 0.3,
  HEIGHT_MAX: 12,
  FLOORS_MIN: 1,
  FLOORS_MAX: 4,
  ROOMS_PER_FLOOR_MAX: 60,
  AREA_MAX: 40000,
  ZONAS_MIN: 4,
  ZONAS_MAX: 32
} as const

/** Valida un número y normaliza notación decimal (',' -> '.'). */
export function num(value: unknown, nombre: string, min: number, max: number): { ok: boolean; value: number } {
  if (value === undefined || value === null) return { ok: false, value: 0 }
  const s = String(value).trim().replace(/[\u00a0\u2007]/g, ' ')
  if (s === '') return { ok: false, value: 0 }
  const n = Number(s.replace(/,/g, '.'))
  return Number.isFinite(n) && n >= min && n <= max ? { ok: true, value: n } : { ok: false, value: 0 }
}

/** Valida una coordenada XZ (usamos -500..500 para el plano base extendido). */
export function validarCoordenada(value: unknown, nombre: string, ev: ValidationError[]): number | null {
  const r = num(value, nombre, -500, 500)
  if (!r.ok) {
    ev.push({ codigo: 'COORD_OUT', mensaje: `«${nombre}» fuera de rango.`, sugerencia: `Usa un valor entre -500 y 500.` })
  }
  return r.ok ? r.value : null
}

/** Valida una dimensión cara a cara (ancho/largo de muro o habitación: 1.2 a 200 m). */
export function validarDimension(value: unknown, nombre: string, ev: ValidationError[]): number | null {
  const r = num(value, nombre, ARCH_LIMITS.MIN, ARCH_LIMITS.MAX)
  if (!r.ok) {
    ev.push({ codigo: 'DIM_OUT', mensaje: `«${nombre}» debe estar entre ${ARCH_LIMITS.MIN} y ${ARCH_LIMITS.MAX} m.`, sugerencia: `Usa un valor entre ${ARCH_LIMITS.MIN} y ${ARCH_LIMITS.MAX} m.` })
  }
  return r.ok ? r.value : null
}

/** Valida un número de plantas. */
export function validarPlanta(value: unknown, ev: ValidationError[]): number | null {
  const r = num(value, 'pisos', ARCH_LIMITS.FLOORS_MIN, ARCH_LIMITS.FLOORS_MAX)
  if (!r.ok) {
    ev.push({ codigo: 'N_PLANTAS', mensaje: 'Número de plantas fuera de rango.', sugerencia: `Usa entre ${ARCH_LIMITS.FLOORS_MIN} y ${ARCH_LIMITS.FLOORS_MAX} plantas.` })
  }
  return r.ok ? r.value : null
}

/** Valida una cantidad de habitaciones. */
export function validarHabitaciones(value: unknown, planta: number, ev: ValidationError[]): number | null {
  const r = num(value, 'habitaciones', 0, ARCH_LIMITS.ROOMS_PER_FLOOR_MAX)
  if (!r.ok) {
    ev.push({ codigo: 'HAB_OUT', mensaje: 'Habitaciones fuera de rango.', sugerencia: `Usa entre 0 y ${ARCH_LIMITS.ROOMS_PER_FLOOR_MAX} por planta.` })
  } else if (Number(value) > 0 && planta * ARCH_LIMITS.ROOMS_PER_FLOOR_MAX < Number(value)) {
    ev.push({ codigo: 'HAB_DENSO', mensaje: 'Demasiadas habitaciones para el número de plantas.', sugerencia: `Reduce a ${planta * ARCH_LIMITS.ROOMS_PER_FLOOR_MAX} o máx. ${ARCH_LIMITS.ROOMS_PER_FLOOR_MAX} por planta.` })
  }
  return r.ok ? r.value : null
}

/** Construye un `ValidationResult` a partir de un `DesignSpec`. */
export function validarDesignSpec(spec: Record<string, unknown>): ValidationResult {
  const ev: ValidationError[] = []
  const supuestos: string[] = []
  const faltantes: string[] = []
  const s = spec as DesignSpec

  const x = validarCoordenada(s.origen?.x ?? 0, 'origen.x', ev)
  const z = validarCoordenada(s.origen?.z ?? 0, 'origen.z', ev)
  const ancho = s.ancho !== undefined ? validarDimension(s.ancho, 'ancho', ev) : null
  const largo = s.largo !== undefined ? validarDimension(s.largo, 'largo', ev) : null
  const pisos = s.pisos !== undefined ? validarPlanta(s.pisos, ev) : 1
  validarHabitaciones(s.habitaciones?.cantidad ?? 1, pisos ?? 1, ev)

  if (s.ventanas?.total !== undefined) {
    num(s.ventanas.total, 'ventanas', 0, 200)
  }

  if (typeof s.ancho !== 'number' && typeof s.largo !== 'number') faltantes.push('ancho y largo (m)')

  const puntosBase: { x: number; z: number }[] = []
  if (x !== null && z !== null && ancho !== null && largo !== null) {
    const w = ancho / 2
    const d = largo / 2
    puntosBase.push({ x: x - w, z: z - d }, { x: x + w, z: z - d }, { x: x + w, z: z + d }, { x: x - w, z: z + d })
  }

  const area = (ancho ?? 0) * (largo ?? 0)
  if (area > ARCH_LIMITS.AREA_MAX) {
    ev.push({ codigo: 'SUPERFICIE', mensaje: 'Superficie de la huella demasiado amplia.', sugerencia: `El área máxima permitida es ${ARCH_LIMITS.AREA_MAX} m².` })
  }

  return {
    ok: ev.length === 0,
    coordenadas: ev.filter(e => e.codigo.startsWith('COORD')),
    dimensiones: ev.filter(e => e.codigo.startsWith('DIM')),
    estructura: ev.filter(e => e.codigo === 'N_PLANTAS' || e.codigo === 'HAB_OUT' || e.codigo === 'HAB_DENSO' || e.codigo === 'SUPERFICIE'),
    faltantes,
    supuestos,
    puntosBase
  }
}

/**
 * Valida la escena después de ejecutar una orden de generación contra el DesignSpec.
 * Cuenta muros, puertas, ventanas, techos y elementos creados.
 */
export interface SceneSpecValidationResult {
  ok: boolean
  discrepancias: string[]
  conteos: {
    muros: number
    puertas: number
    ventanas: number
    habitaciones: number
    techos: number
  }
}

export function validarEscenaContraSpec(spec: DesignSpec, scene: SceneManager): SceneSpecValidationResult {
  const walls = scene.getWalls()
  const objects = scene.getObjects()

  const puertas = objects.filter(o => /puerta|door/i.test(o.name) || o.shapeId?.includes('door')).length
  const ventanas = objects.filter(o => /ventana|window/i.test(o.name) || o.shapeId?.includes('window') || o.shapeId?.includes('opening')).length
  const techos = objects.filter(o => o.kind === 'roof').length

  // Si el spec pedía conteos específicos:
  const discrepancias: string[] = []

  if (spec.ventanas?.total !== undefined && ventanas < spec.ventanas.total) {
    discrepancias.push(`Se solicitaron ${spec.ventanas.total} ventanas pero hay ${ventanas} en la escena`)
  }

  const cantHab = spec.habitaciones?.cantidad ?? 0
  const puertasEsperadas = (spec.puertasPorHabitacion ?? 1) * (cantHab > 0 ? cantHab : 1)
  if (puertas < puertasEsperadas) {
    discrepancias.push(`Se esperaban al menos ${puertasEsperadas} puertas pero hay ${puertas}`)
  }

  if (spec.techo && techos < 1) {
    discrepancias.push('No se detectó el techo en la escena')
  }

  // Estimación de habitaciones según muros interiores y perimetrales
  const habitacionesEstimadas = Math.max(cantHab, Math.floor(puertas / (spec.puertasPorHabitacion ?? 1)))

  return {
    ok: discrepancias.length === 0,
    discrepancias,
    conteos: {
      muros: walls.length,
      puertas,
      ventanas,
      habitaciones: habitacionesEstimadas,
      techos
    }
  }
}
