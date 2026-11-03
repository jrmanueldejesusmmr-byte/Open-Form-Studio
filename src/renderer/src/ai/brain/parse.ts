/**
 * Intérprete de órdenes en español (Fase 2).
 *
 * Convierte una frase del usuario en un `ParsedOrder` estructurado (intención,
 * dimensiones, material, ubicación, planta…). No inventa: si falta algo
 * imprescindible devuelve `missing` para que el planificador pregunte.
 */

import {
  CREATE_VERBS, DELETE_VERBS, DESCRIBE_WORDS, FLOOR_WORDS, MATERIAL_SYNONYMS,
  MOVE_VERBS, NUMBER_WORDS, REDO_WORDS, ROOF_SYNONYMS, UNDO_WORDS, normalize
} from './lexicon'
import { leerExterior, type EspecExterior } from './spec'

export type Intent =
  | 'create_room' | 'create_house' | 'create_building' | 'create_wall' | 'create_roof' | 'create_floor'
  | 'place_door' | 'place_window' | 'place_object' | 'apply_material' | 'move' | 'delete'
  | 'delete_room' | 'merge_rooms' | 'add_rooms'
  | 'describe' | 'undo' | 'redo' | 'list_materials' | 'exterior' | 'clarify' | 'unknown'

export interface ParsedOrder {
  intent: Intent
  /** Texto original normalizado (para depuración y tests). */
  text: string
  ancho?: number
  largo?: number
  alto?: number
  x?: number
  z?: number
  material?: string
  roofType?: string
  /** Fachada del edificio: 'solida' | 'cortina_vidrio'. */
  fachada?: string
  plantas?: number
  /** Número de pisos explícito leído de «N pisos/plantas» (para edificios). */
  pisos?: number
  /** Altura de piso en m («cada piso de X», «altura de piso X»). */
  alturaPiso?: number
  /** Divisiones interiores por piso («con N habitaciones por piso»). */
  habitaciones?: number
  plantaIdx?: number
  referencia?: 'ese_muro' | 'ese_objeto' | 'la_habitacion' | 'la_casa' | 'seleccion'
  /** Índice 1-based de la habitación nombrada («la habitación 3»). */
  habitacionIdx?: number
  /** Índices 1-based de las dos habitaciones a unir («une la 1 con la 2»). */
  habitacionIdxs?: [number, number]
  /** Elementos exteriores (césped, arco…) cuando la orden solo pide eso. */
  exterior?: EspecExterior
  etiqueta?: string
  missing: string[]
  confianza: number
}

/** Extrae un número (arábigo o en palabras) de un fragmento de texto. */
function readNumber(fragment: string): number | undefined {
  const arabic = fragment.match(/-?\d+(?:[.,]\d+)?/)
  if (arabic) return Number(arabic[0].replace(',', '.'))
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(fragment)) return value
  }
  return undefined
}

/** Busca «ancho por largo» / «4 x 3» / «4 por 3» en el texto. */
function readDimensions(text: string): { ancho?: number; largo?: number } {
  // Se admite una unidad entre el número y el conector: «4 metros por 3».
  const porMatch = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:mts?|metros?|cm|mm)?\s*(?:por|x|×|y)\s*(-?\d+(?:[.,]\d+)?)/i)
  if (porMatch) {
    return { ancho: Number(porMatch[1].replace(',', '.')), largo: Number(porMatch[2].replace(',', '.')) }
  }
  // Números en palabras: «tres por cuatro».
  const words = Object.keys(NUMBER_WORDS).join('|')
  const wordPor = text.match(new RegExp(`\\b(${words})\\s*(?:por|x)\\s*(${words})\\b`, 'i'))
  if (wordPor) {
    const ancho = readNumber(wordPor[1])
    const largo = readNumber(wordPor[2])
    if (ancho !== undefined && largo !== undefined) return { ancho, largo }
  }
  const out: { ancho?: number; largo?: number } = {}
  const anchoM = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m|metros?)?\s*(?:de\s*)?(?:ancho|frente)/i)
  const largoM = text.match(/(?:largo|profundidad|fondo)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i)
  if (anchoM) out.ancho = Number(anchoM[1].replace(',', '.'))
  if (largoM) out.largo = Number(largoM[1].replace(',', '.'))
  return out
}

/** Detecta el material por sinónimos. */
function readMaterial(text: string): string | undefined {
  for (const syn of MATERIAL_SYNONYMS) {
    for (const w of syn.words) {
      if (text.includes(w)) return syn.id
    }
  }
  return undefined
}

/** Detecta el tipo de techo por sinónimos. */
function readRoof(text: string): string | undefined {
  for (const syn of ROOF_SYNONYMS) {
    for (const w of syn.words) {
      if (text.includes(w)) return syn.id
    }
  }
  return undefined
}

/** Detecta número de plantas/pisos («dos plantas», «100 pisos»). */
function readFloors(text: string): number | undefined {
  const arabic = text.match(/(\d+)\s*(?:plantas?|pisos?|niveles?)/i)
  if (arabic) return Number(arabic[1])
  const w = text.match(/(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|veinte|treinta|cincuenta|cien)\s*(?:plantas?|pisos?|niveles?)/i)
  if (w) return readNumber(w[1])
  if (/segunda planta|planta alta|dos plantas|2 plantas/.test(text)) return 2
  return undefined
}

/** Altura de piso en m («cada piso de 3», «altura de piso 3.2», «pisos de 3 metros»). */
function readFloorHeight(text: string): number | undefined {
  const m = text.match(/(?:altura (?:de )?piso|piso(?:s)? (?:de )|cada piso (?:de )?)(\d+(?:[.,]\d+)?)/i)
  return m ? Number(m[1].replace(',', '.')) : undefined
}

/** Habitaciones por piso («3 habitaciones por piso», «cada piso con 2 habitaciones»). */
function readRoomsPerFloor(text: string): number | undefined {
  const m = text.match(/(\d+)\s*habitacion/i)
  return m ? Number(m[1]) : undefined
}

/** Detecta «planta 1 / en la segunda planta» → índice 0-based. */
function readFloorIndex(text: string): number | undefined {
  const m = text.match(/(?:planta|piso|nivel)\s*(?:numero\s*)?(\d+)/i)
  if (m) return Math.max(0, Number(m[1]) - 1)
  const words = text.match(/(?:en\s*la\s*)?(primera|segunda|tercera|cuarta)\s*(?:planta|piso)/i)
  if (words) {
    const map: Record<string, number> = { primera: 0, segunda: 1, tercera: 2, cuarta: 3 }
    return map[words[1].toLowerCase()]
  }
  return undefined
}

/** Detecta una posición «en x=2 z=3», «en (2, 3)» o «en la posicion 2,3». */
function readPosition(text: string): { x?: number; z?: number } {
  const tuple = text.match(/\(\s*(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)\s*\)/)
  if (tuple) return { x: Number(tuple[1].replace(',', '.')), z: Number(tuple[2].replace(',', '.')) }
  const posw = text.match(/posicion\s+(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)/i)
  if (posw) return { x: Number(posw[1].replace(',', '.')), z: Number(posw[2].replace(',', '.')) }
  const xm = text.match(/x\s*=?\s*(-?\d+(?:[.,]\d+)?)/i)
  const zm = text.match(/z\s*=?\s*(-?\d+(?:[.,]\d+)?)/i)
  const out: { x?: number; z?: number } = {}
  if (xm) out.x = Number(xm[1].replace(',', '.'))
  if (zm) out.z = Number(zm[1].replace(',', '.'))
  return out
}

/** Detecta referencias a memoria («ese muro», «eso»…). */
function readReference(text: string): ParsedOrder['referencia'] {
  if (/\b(?:esa|esta|la|aquella)\s+(?:habitacion|cuarto|estancia)\b/.test(text)) return 'la_habitacion'
  if (/\b(?:esa|esta|la|aquella)\s+casa\b/.test(text)) return 'la_casa'
  if (/\b(?:el\s+)?(?:ultimo|ultima)\s+(?:muro|pared)\b/.test(text)) return 'ese_muro'
  if (/\b(?:ese|este|el|aquel)\s+(?:muro|pared)\b/.test(text)) return 'ese_muro'
  if (/\b(?:ese|este|el|aquel)\s+(?:objeto|mueble|elemento)\b/.test(text)) return 'ese_objeto'
  if (/\b(?:eso|seleccion|lo seleccionado|la seleccion)\b/.test(text)) return 'seleccion'
  return undefined
}

function hasAny(text: string, words: ReadonlyArray<string>): boolean {
  return words.some((w) => text.includes(w))
}

/**
 * Interpreta una frase. Devuelve un `ParsedOrder`. Si no reconoce nada con
 * suficiente confianza, `intent` es `unknown`/`clarify` y `missing` explica qué
 * falta para que el planificador pregunte en lugar de inventar.
 */
export function interpret(raw: string): ParsedOrder {
  const text = normalize(raw)
  const base: ParsedOrder = { intent: 'unknown', text, missing: [], confianza: 0 }

  const dims = readDimensions(text)
  const material = readMaterial(text)
  const roof = readRoof(text)
  const plantas = readFloors(text)
  const alturaPiso = readFloorHeight(text)
  const habitaciones = readRoomsPerFloor(text)
  const plantaIdx = readFloorIndex(text)
  const pos = readPosition(text)
  const ref = readReference(text)

  // —— Consultas / deshacer / rehacer (no crean geometría) ——
  if (hasAny(text, UNDO_WORDS)) return { ...base, intent: 'undo', confianza: 0.95, etiqueta: 'Deshacer' }
  if (hasAny(text, REDO_WORDS)) return { ...base, intent: 'redo', confianza: 0.95, etiqueta: 'Rehacer' }
  if (/\blista(r)? (los )?materiales|que materiales|materiales (hay|disponibles)/.test(text)) {
    return { ...base, intent: 'list_materials', confianza: 0.9, etiqueta: 'Listar materiales' }
  }
  if (hasAny(text, DESCRIBE_WORDS) && !hasAny(text, CREATE_VERBS)) {
    return { ...base, intent: 'describe', confianza: 0.85, etiqueta: 'Describir la escena' }
  }

  const isDirectArchitecture =
    /\b(casa|vivienda|chalet|residencia|edificio|torre|habitacion|cuarto|estancia|sala)\b/.test(text) &&
    (dims.ancho !== undefined || /\b(plantas?|pisos?|habitacion|habitaciones|medidas)\b/.test(text))

  // —— Aplicar material a algo existente ——
  if (material && !hasAny(text, CREATE_VERBS) && !isDirectArchitecture && (/\b(aplica|aplicar|cambia|cambiar|ponle|usa)\b/.test(text) || ref)) {
    return { ...base, intent: 'apply_material', material, referencia: ref ?? 'seleccion', confianza: 0.8, etiqueta: `Aplicar ${material}` }
  }

  // —— Unir habitaciones ——
  if (/\b(une|unir|fusiona|fusionar|junta|juntar)\b/.test(text) && /\b(habitacion|habitaciones|cuarto|cuartos|recinto|recintos)\b/.test(text)) {
    const order: ParsedOrder = { ...base, intent: 'merge_rooms', ...pos, confianza: 0.85, etiqueta: 'Unir habitaciones' }
    const idxs = readTwoHabitaciones(text)
    if (idxs) order.habitacionIdxs = idxs
    return order
  }

  // —— Borrar habitación ——
  if (hasAny(text, DELETE_VERBS) && /\b(habitacion|cuarto|estancia|sala)\b/.test(text)) {
    const order: ParsedOrder = { ...base, intent: 'delete_room', referencia: ref ?? 'la_habitacion', ...pos, confianza: 0.85, etiqueta: 'Borrar habitación' }
    if (ref === 'la_habitacion') order.habitacionIdx = readHabitacionIdx(text)
    return order
  }

  // —— Borrar genérico ——
  if (hasAny(text, DELETE_VERBS)) {
    return { ...base, intent: 'delete', referencia: ref ?? 'seleccion', confianza: 0.8, etiqueta: 'Borrar' }
  }

  // —— Mover ——
  if (hasAny(text, MOVE_VERBS)) {
    const order: ParsedOrder = { ...base, intent: 'move', referencia: ref ?? 'seleccion', ...pos, confianza: 0.75, etiqueta: 'Mover' }
    if (order.x === undefined && order.z === undefined) order.missing.push('destino (x, z en metros)')
    return order
  }

  // —— Agregar habitaciones adicionales ——
  if (/\b(agrega|agregar|anade|añadir|incorpora|incorporar)\b/.test(text) && /\b(habitaciones|cuartos|dormitorios)\b/.test(text)) {
    return { ...base, intent: 'add_rooms', ancho: dims.ancho, largo: dims.largo, habitaciones, material, ...pos, confianza: 0.85, etiqueta: 'Agregar habitaciones' }
  }

  // —— Crear (verbos o descripción directa de inmueble con medidas) ——
  const creating = hasAny(text, CREATE_VERBS) || isDirectArchitecture
  if (!creating) {
    const missing: string[] = []
    if (!ref) missing.push('una acción (crear, mover, borrar…)')
    return { ...base, intent: ref ? 'clarify' : 'unknown', referencia: ref, missing, confianza: 0.2 }
  }

  // Edificio (muchas plantas, sin tope): «edificio|torre|rascacielos» o «N pisos» con N>4.
  if (/edificio|torre|rascacielos|bloque de/.test(text) || (plantas !== undefined && plantas > 4)) {
    const fachada = /vidrio|cristal|acristalad|cortina/.test(text) ? 'cortina_vidrio' : undefined
    const order: ParsedOrder = { ...base, intent: 'create_building', ancho: dims.ancho, largo: dims.largo, material, roofType: roof, fachada, pisos: plantas, alturaPiso, habitaciones, ...pos, confianza: 0.85, etiqueta: 'Edificio' }
    return order
  }

  // Casa
  if (/\bcasa\b|vivienda|chalet|residencia/.test(text)) {
    const order: ParsedOrder = { ...base, intent: 'create_house', ancho: dims.ancho, largo: dims.largo, material, roofType: roof, plantas, habitaciones, plantaIdx, ...pos, confianza: 0.85, etiqueta: 'Casa' }
    if (order.ancho === undefined || order.largo === undefined) order.missing.push('medidas (ancho y largo en metros)')
    return order
  }

  // Techo / cubierta
  if (/\btecho|cubierta|tejado/.test(text)) {
    return { ...base, intent: 'create_roof', roofType: roof ?? 'gable', material, plantaIdx, confianza: 0.8, etiqueta: 'Techo' }
  }

  // Planta / piso nuevo
  if (hasAny(text, FLOOR_WORDS) && /\b(nuev|otra|agregar|añadir|anadir|crear|encima|arriba)/.test(text)) {
    return { ...base, intent: 'create_floor', alto: dims.ancho, confianza: 0.75, etiqueta: 'Nueva planta' }
  }

  // Puerta
  if (/\bpuerta|porton|portón|acceso\b/.test(text)) {
    const order: ParsedOrder = { ...base, intent: 'place_door', confianza: 0.8, etiqueta: 'Puerta' }
    if (dims.ancho !== undefined || dims.largo !== undefined) {
      order.intent = 'create_room'; order.ancho = dims.ancho; order.largo = dims.largo; order.material = material
      order.missing.push('habitación con puerta')
    }
    return order
  }

  // Ventana
  if (/\bventana|ventanal|abertura\b/.test(text)) {
    return { ...base, intent: 'place_window', confianza: 0.8, etiqueta: 'Ventana' }
  }

  // Muro suelto
  if (/\bmuro|pared|tabique|mural\b/.test(text) && !/\bhabitacion|cuarto|estancia\b/.test(text)) {
    return { ...base, intent: 'create_wall', material, ...pos, confianza: 0.7, etiqueta: 'Muro' }
  }

  // Habitación / cuarto / estancia
  if (/\bhabitacion|cuarto|estancia|sala|espacio|ambiente\b/.test(text)) {
    const order: ParsedOrder = { ...base, intent: 'create_room', ancho: dims.ancho, largo: dims.largo, material, plantaIdx, ...pos, confianza: 0.9, etiqueta: 'Habitación' }
    if (order.ancho === undefined || order.largo === undefined) order.missing.push('medidas (ancho y largo en metros)')
    return order
  }

  // —— Elementos exteriores sueltos (césped, arco) alrededor de lo construido ——
  // Solo llega aquí si ninguna otra orden encajó. Se exige palabra completa
  // («arco» y no «marco») antes de gastar el lector de exterior.
  if (/\b(cesped|zacate|pasto|hierba|arco)\b/.test(text)) {
    const exterior = leerExterior(text)
    if (exterior) {
      return { ...base, intent: 'exterior', exterior, confianza: 0.8, etiqueta: 'Exterior' }
    }
  }

  return { ...base, intent: 'unknown', missing: ['una acción reconocible'], confianza: 0.1 }
}


/** Lee «la habitación 3» → 3 (1-based). */
function readHabitacionIdx(text: string): number | undefined {
  const m = text.match(/\bhabitacion\s+(\d+)\b/)
  return m ? Number(m[1]) : undefined
}

/** Lee «la habitación 1 con la 2» o «la 1 con la 2» → [1, 2] (1-based). */
function readTwoHabitaciones(text: string): [number, number] | undefined {
  const m =
    text.match(/\bhabitacion\s+(\d+)\s+con\s+la\s+(\d+)\b/) ??
    text.match(/\bla\s+(\d+)\s+con\s+la\s+(\d+)\b/)
  return m ? [Number(m[1]), Number(m[2])] : undefined
}
/** Etiqueta corta del intent para logs/tests. */
export const INTENT_LABEL: Record<Intent, string> = {
  create_room: 'Crear habitación', create_house: 'Crear casa', create_building: 'Crear edificio', create_wall: 'Crear muro',
  create_roof: 'Crear techo', create_floor: 'Crear planta', place_door: 'Colocar puerta',
  place_window: 'Colocar ventana', place_object: 'Colocar objeto', apply_material: 'Aplicar material',
  move: 'Mover', delete: 'Borrar',
  delete_room: 'Borrar habitación', merge_rooms: 'Unir habitaciones', add_rooms: 'Agregar habitaciones',
  describe: 'Describir', undo: 'Deshacer', redo: 'Rehacer',
  list_materials: 'Listar materiales', exterior: 'Exterior', clarify: 'Aclarar', unknown: 'No entendido'
}

