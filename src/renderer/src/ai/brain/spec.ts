/**
 * Especificación intermedia de diseño (DesignSpec) — Fase 2.
 *
 * Convierte una orden en lenguaje natural en un `DesignSpec` estructurado
 * y riguroso.
 *
 * SEMÁNTICA DE MEDIDAS Y ORIENTACIÓN:
 * - `ancho` (metros): Medida frontal a lo largo del eje X (ancho / fachada).
 * - `largo` (metros): Medida de fondo / profundidad a lo largo del eje Z.
 * - `pisos` (entero >= 1): Altura estructural de plantas (altura estándar 2.8m por piso).
 * - `origen` {x, z}: Centro o esquina de referencia del edificio en el plano XZ.
 *
 * Todo es lógica pura sin dependencias de Three.js ni DOM.
 */

import { NUMBER_WORDS } from './lexicon'

/* ========================= Tipos de especificación ========================= */

export type TechoTipo = 'dosAguas' | 'cuatroAguas' | 'plano' | 'auto'
export type ArcoEstilo = 'hotel' | 'simple'
export type ColocacionRelativa = 'entre' | 'junto' | 'dentro' | 'derecha' | 'izquierda' | 'frente' | 'detras'

export interface EspecOrigen {
  /** Coordenada X en metros. */
  x: number
  /** Coordenada Z en metros. */
  z: number
}

export interface EspecMaterial {
  /** Id del material para muros exteriores e interiores ('mat.plaster', 'mat.brick', etc.). */
  muros: string
  interior?: string
  piso?: string
}

export interface EspecTecho {
  tipo: TechoTipo
  alero?: number
}

export interface EspecExterior {
  /** Terreno o losa con acabado de césped alrededor de la casa. */
  cesped?: boolean
  margen?: number
  /** Arco decorativo o pórtico en la entrada principal. */
  arco?: {
    estilo: ArcoEstilo
    ancho?: number
    alto?: number
  }
  cerca?: boolean
  camino?: boolean
}

export interface EspecColocacion {
  relativa?: ColocacionRelativa
  referencias?: string[]
}

export interface DesignSpec {
  /** Origen de la huella en XZ (metros). Por defecto {0,0}. */
  origen?: EspecOrigen
  /** Frente / ancho en eje X (metros). */
  ancho?: number
  /** Fondo / profundidad en eje Z (metros). */
  largo?: number
  /** Número de plantas / pisos. Por defecto 1. */
  pisos?: number
  /** Habitaciones exactas solicitadas. */
  habitaciones?: {
    cantidad: number
    nombres?: string[]
  }
  /** Número de puertas por habitación. Por defecto 1. */
  puertasPorHabitacion?: number
  /** Total de ventanas y su estrategia de distribución. */
  ventanas?: {
    total: number
    distribucion?: 'equilibrada' | 'fachada'
  }
  /** Materiales arquitectónicos. */
  material?: EspecMaterial
  /** Configuración de techumbre. */
  techo?: EspecTecho
  /** Elementos exteriores (césped, arco de entrada). */
  exterior?: EspecExterior
  /** Posicionamiento relativo a otros edificios en la escena. */
  colocacion?: EspecColocacion
  /** Nombre del proyecto / edificio. */
  nombre?: string
}

export interface SpecResult {
  spec: DesignSpec
  /** Supuestos razonables que Astro eligió automáticamente. */
  supuestos: string[]
  /** Parámetros obligatorios que faltan y requieren aclaración. */
  faltantes: string[]
}

/* ========================= Lectores de Números ========================= */

/**
 * Lee un número en arábigo o en palabras en español (0–999).
 */
export function leerNumero(fragmento: string): number | undefined {
  let texto = fragmento.toLowerCase().trim()
  if (/^de\s+/i.test(texto)) texto = texto.replace(/^de\s+/i, '').trim()
  if (!texto) return undefined

  // 1) Número arábigo
  const arab = texto.match(/-?\d+(?:[.,]\d+)?/)
  if (arab) return Number(arab[0].replace(',', '.'))

  // 2) Número compuesto ("cuarenta y cinco", "treinta y dos")
  const compuesto = texto.match(/(\w+)\s*y\s*(\w+)/)
  if (compuesto) {
    const a = NUMBER_WORDS[compuesto[1]]
    const b = NUMBER_WORDS[compuesto[2]]
    if (typeof a === 'number' && typeof b === 'number' && b < 100) return a + b
  }

  // 3) Palabra simple del léxico ("diez", "una", "dos", "tres")
  const simple = texto.match(/\b(\w+)\b/)
  if (simple) {
    const n = NUMBER_WORDS[simple[1]]
    if (typeof n === 'number') return n
  }

  return undefined
}

/**
 * Lee conteos ("10 habitaciones", "diez ventanas", "una puerta por habitación").
 */
export function leerConteo(texto: string, palabras: ReadonlyArray<string>): number | undefined {
  const normalizado = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const palabra of palabras) {
    const p = palabra.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    // «10 ventanas», «1 puerta por habitación»
    const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${p}\\b`, 'i')
    const m = normalizado.match(re)
    if (m) return Number(m[1].replace(',', '.'))

    // «ventanas 10»
    const re2 = new RegExp(`\\b(${p.replace(' ', '\\s+')})\\s*(\\d+(?:[.,]\\d+)?)\\b`, 'i')
    const m2 = normalizado.match(re2)
    if (m2) return Number(m2[2].replace(',', '.'))

    // En palabras: «diez ventanas», «una puerta por habitación»
    const re3 = new RegExp(`\\b([\\w]+\\s*y\\s*[\\w]+|[\\w]+)\\s*${p}\\b`, 'i')
    const m3 = normalizado.match(re3)
    if (m3) {
      const n = leerNumero(m3[1])
      if (typeof n === 'number') return n
    }
  }
  return undefined
}

/* ========================= Extractores Semánticos ========================= */

export function leerPosicion(texto: string): EspecOrigen | undefined {
  const normalizado = texto.toLowerCase()
  const tuple = normalizado.match(/\(\s*(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)\s*\)/)
  if (tuple) return { x: Number(tuple[1].replace(',', '.')), z: Number(tuple[2].replace(',', '.')) }

  const posw = normalizado.match(/posici[oó]n\s+(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)/)
  if (posw) return { x: Number(posw[1].replace(',', '.')), z: Number(posw[2].replace(',', '.')) }

  const xm = normalizado.match(/x\s*=?\s*(-?\d+(?:[.,]\d+)?)/i)
  const zm = normalizado.match(/z\s*=?\s*(-?\d+(?:[.,]\d+)?)/i)
  if (xm || zm) return { x: xm ? Number(xm[1].replace(',', '.')) : 0, z: zm ? Number(zm[1].replace(',', '.')) : 0 }

  if (/en\s+el\s+origen|en\s+el\s+centro/.test(normalizado)) return { x: 0, z: 0 }
  return undefined
}

/**
 * Lee medidas (ancho x largo).
 * Soporta: "45 × 30 m", "45 x 30", "45 por 30", "45 metros por 30", etc.
 */
export function leerMedidas(texto: string): { ancho?: number; largo?: number } {
  const normalizado = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // "45 × 30 m", "45 x 30", "45 por 30"
  const m = normalizado.match(/(\d+(?:[.,]\d+)?)\s*(?:metros?|mts?|m)?\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)/i)
  if (m) {
    return {
      ancho: Number(m[1].replace(',', '.')),
      largo: Number(m[2].replace(',', '.'))
    }
  }

  // Palabras: "cuarenta y cinco por treinta"
  const partes = normalizado.split(/(?:\s*(?:por|x|×)\s*)/i)
  if (partes.length >= 2) {
    const leidos: number[] = []
    for (const p of partes) {
      const n = leerNumero(p.trim())
      if (typeof n === 'number') leidos.push(n)
    }
    if (leidos.length >= 2) return { ancho: leidos[0], largo: leidos[1] }
  }

  const out: { ancho?: number; largo?: number } = {}
  const ma = normalizado.match(/(\d+(?:[.,]\d+)?)\s*(?:m|metros?)?\s*(?:de\s*)?(?:ancho|frente)/i)
  const ml = normalizado.match(/(?:largo|profundidad|fondo)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i)
  if (ma) out.ancho = Number(ma[1].replace(',', '.'))
  if (ml) out.largo = Number(ml[1].replace(',', '.'))
  return out
}

export function leerMaterial(texto: string): EspecMaterial | undefined {
  const normalizado = texto.toLowerCase()
  const sinonimos: ReadonlyArray<{ palabras: ReadonlyArray<string>; id: string }> = [
    { palabras: ['tabla roca', 'tablaroca', 'drywall', 'placa de yeso'], id: 'mat.plaster' },
    { palabras: ['yeso'], id: 'mat.plaster' },
    { palabras: ['ladrillo blanco', 'ladrillo'], id: 'mat.brick' },
    { palabras: ['concreto', 'hormigon'], id: 'mat.concrete' },
    { palabras: ['madera'], id: 'mat.wood' },
    { palabras: ['piedra'], id: 'mat.stone' },
    { palabras: ['vidrio', 'cristal'], id: 'mat.glass' }
  ]
  const muro = sinonimos.find((s) => s.palabras.some((p) => normalizado.includes(p.toLowerCase())))
  if (!muro) return undefined
  return { muros: muro.id }
}

export function leerTecho(texto: string): EspecTecho | undefined {
  const normalizado = texto.toLowerCase()
  if (/techo\s+adaptado/.test(normalizado) || /adaptado\s+a\s+la\s+casa/.test(normalizado)) {
    return { tipo: 'auto', alero: 0.3 }
  }
  if (/cuatro\s+aguas/.test(normalizado)) return { tipo: 'cuatroAguas', alero: 0.3 }
  if (/dos\s+aguas/.test(normalizado)) return { tipo: 'dosAguas', alero: 0.3 }
  if (/plano/.test(normalizado)) return { tipo: 'plano', alero: 0 }
  return undefined
}

export function leerExterior(texto: string): EspecExterior | undefined {
  const normalizado = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let cesped: boolean | undefined
  if (/cesped|zacate|pasto|hierba/.test(normalizado)) cesped = true

  let arco: EspecExterior['arco'] | undefined
  if (/arco/.test(normalizado)) {
    const estilo: ArcoEstilo = /hotel/.test(normalizado) ? 'hotel' : 'simple'
    arco = { estilo, ancho: 4, alto: 3.5 }
  }

  if (cesped === undefined && arco === undefined) return undefined
  return { cesped, margen: 5, arco, cerca: false, camino: false }
}

export function leerColocacion(texto: string): EspecColocacion | undefined {
  const normalizado = texto.toLowerCase()
  if (/en\s+medio\s+de|entre\s+(las|dos)\s+casas/.test(normalizado)) {
    return { relativa: 'entre' }
  }
  const matchDer = normalizado.match(/a\s+la\s+derecha\s+de(?:\s+la)?\s+([a-zA-Z0-9_-]+)/)
  if (matchDer) {
    return { relativa: 'derecha', referencias: [matchDer[1]] }
  }
  const matchIzq = normalizado.match(/a\s+la\s+izquierda\s+de(?:\s+la)?\s+([a-zA-Z0-9_-]+)/)
  if (matchIzq) {
    return { relativa: 'izquierda', referencias: [matchIzq[1]] }
  }
  if (/junto\s+a/.test(normalizado)) return { relativa: 'junto' }
  if (/dentro\s+de/.test(normalizado)) return { relativa: 'dentro' }
  return undefined
}

/**
 * Parsea el texto del usuario para construir el `DesignSpec` completo.
 */
export function parseDesignSpec(texto: string): SpecResult {
  const supuestos: string[] = []
  const faltantes: string[] = []
  const spec: DesignSpec = {}

  // 1. Origen
  const pos = leerPosicion(texto)
  if (pos) {
    spec.origen = pos
  } else {
    spec.origen = { x: 0, z: 0 }
    supuestos.push('Origen en (0,0) por defecto.')
  }

  // 2. Medidas
  const dims = leerMedidas(texto)
  if (dims.ancho !== undefined) spec.ancho = dims.ancho
  if (dims.largo !== undefined) spec.largo = dims.largo
  if (spec.ancho === undefined || spec.largo === undefined) {
    faltantes.push('medidas (ancho y largo en metros)')
  }

  // 3. Pisos
  const matchPisos = texto.match(/(\d+)\s*(?:pisos?|plantas?|niveles?)/i)
  if (matchPisos) {
    spec.pisos = Number(matchPisos[1])
  } else if (/dos\s+plantas|2\s+plantas/i.test(texto)) {
    spec.pisos = 2
  } else {
    spec.pisos = 1
  }

  // 4. Habitaciones
  const cantHab = leerConteo(texto, ['habitaciones', 'habitación', 'cuartos', 'recámaras', 'recamaras', 'dormitorios'])
  if (cantHab !== undefined) {
    spec.habitaciones = { cantidad: cantHab }
  }

  // 5. Puertas por habitación
  const puertasPorHab = leerConteo(texto, ['puerta por habitación', 'puertas por habitación', 'puerta por cuarto'])
  if (puertasPorHab !== undefined) {
    spec.puertasPorHabitacion = puertasPorHab
  } else {
    spec.puertasPorHabitacion = 1
    supuestos.push('Una puerta por habitación.')
  }

  // 6. Ventanas
  const totalVentanas = leerConteo(texto, ['ventanas', 'ventana'])
  if (totalVentanas !== undefined) {
    spec.ventanas = { total: totalVentanas, distribucion: 'equilibrada' }
  }

  // 7. Material
  const mat = leerMaterial(texto)
  if (mat) spec.material = mat

  // 8. Techo
  const techo = leerTecho(texto)
  if (techo) {
    spec.techo = techo
  } else {
    spec.techo = { tipo: 'auto', alero: 0.3 }
    supuestos.push('Techo adaptado según la proporción de la planta.')
  }

  // 9. Exterior (césped, arco)
  const ext = leerExterior(texto)
  if (ext) spec.exterior = ext

  // 10. Colocación relativa
  const coloc = leerColocacion(texto)
  if (coloc) spec.colocacion = coloc

  return { spec, supuestos, faltantes }
}
