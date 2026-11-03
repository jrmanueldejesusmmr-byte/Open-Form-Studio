/**
 * Léxico en español del cerebro local (Fase 2).
 *
 * Diccionarios puros (sin dependencias del motor) que el parser usa para
 * reconocer intenciones, cantidades con unidades, materiales y techos. Un
 * cambio aquí se propaga solo al intérprete; no hay que tocar el parser.
 */

/** Palabras de número → valor. Cubre 0–29, decenas y especiales frecuentes. */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, quinientos: 500, mil: 1000,
  medio: 0.5, media: 0.5
}

/**
 * Sinónimos de material → id del catálogo (`mat.*`).
 * Se prueban en orden; el primero que aparezca en el texto gana. Se prioriza
 * la forma más específica (p. ej. «ladrillo blanco» antes de «ladrillo»).
 */
export const MATERIAL_SYNONYMS: ReadonlyArray<{ words: ReadonlyArray<string>; id: string }> = [
  { words: ['ladrillo blanco', 'ladrillo pintado'], id: 'mat.brick-painted' },
  { words: ['ladrillo rustico', 'ladrillo visto', 'ladrillo'], id: 'mat.brick' },
  { words: ['hormigon', 'concreto gris', 'concreto'], id: 'mat.concrete' },
  { words: ['cemento pulido', 'concreto pulido'], id: 'mat.concrete-smooth' },
  { words: ['cemento'], id: 'mat.concrete' },
  { words: ['estuco'], id: 'mat.stucco' },
  { words: ['tabla roca', 'tablaroca', 'drywall', 'placa de yeso'], id: 'mat.plaster' },
  { words: ['yeso'], id: 'mat.plaster' },
  { words: ['marmol negro'], id: 'mat.marble-dark' },
  { words: ['marmol crema'], id: 'mat.marble-cream' },
  { words: ['marmol'], id: 'mat.marble' },
  { words: ['piedra'], id: 'mat.stone' },
  { words: ['nogal'], id: 'mat.walnut' },
  { words: ['roble'], id: 'mat.oak' },
  { words: ['pino'], id: 'mat.pine' },
  { words: ['madera'], id: 'mat.wood' },
  { words: ['azulejo', 'baldosa', 'ceramica'], id: 'mat.ceramic' },
  { words: ['barro cocido'], id: 'mat.ceramic-terracotta' },
  { words: ['teja envejecida', 'teja vieja'], id: 'mat.terracotta-old' },
  { words: ['pizarra'], id: 'mat.roof-slate' },
  { words: ['teja', 'terracota', 'terracotta'], id: 'mat.terracotta' },
  { words: ['lamina acanalada', 'lamina ondulada', 'zinc', 'acanalada'], id: 'mat.metal-corrugated' },
  { words: ['chapa oxidada', 'oxidada'], id: 'mat.rust' },
  { words: ['acero'], id: 'mat.steel' },
  { words: ['cobre'], id: 'mat.copper' },
  { words: ['cristal esmerilado'], id: 'mat.glass-frosted' },
  { words: ['vidrio esmerilado'], id: 'mat.glass-frosted' },
  { words: ['cristal', 'vidrio'], id: 'mat.glass' },
  { words: ['pintura blanca'], id: 'mat.paint-white' },
  { words: ['pintura gris'], id: 'mat.paint-gray' },
  { words: ['pintura'], id: 'mat.paint-warm' },
  { words: ['cesped', 'pasto'], id: 'mat.grass' },
  { words: ['grava'], id: 'mat.gravel' },
  { words: ['asfalto'], id: 'mat.asphalt' }
]

/** Palabras que activan la intención de crear/añadir. */
export const CREATE_VERBS: ReadonlyArray<string> = [
  'crea', 'crear', 'creame', 'hazme', 'añade', 'añadir', 'anade', 'anadir', 'agrega', 'agregar', 'pon', 'poner', 'coloca', 'colocar',
  'haz', 'hacer', 'hace', 'genera', 'generar', 'construye', 'construir', 'dibuja', 'dibujar', 'traza', 'trazar', 'arma', 'armar',
  'quiero', 'necesito'
]

/** Palabras que activan borrar. */
export const DELETE_VERBS: ReadonlyArray<string> = ['borra', 'borrar', 'elimina', 'eliminar', 'quita', 'quitar', 'suprime', 'suprimir']

/** Palabras que activan mover. */
export const MOVE_VERBS: ReadonlyArray<string> = ['mueve', 'mover', 'desplaza', 'desplazar', 'traslada', 'trasladar', 'corre', 'correr']

/** Palabras que activan deshacer/rehacer. */
export const UNDO_WORDS: ReadonlyArray<string> = ['deshacer', 'deshaz', 'undo', 'revertir', 'revierto']
export const REDO_WORDS: ReadonlyArray<string> = ['rehacer', 'rehaz', 'redo']

/** Palabras que activan describir/consultar. */
export const DESCRIBE_WORDS: ReadonlyArray<string> = ['describe', 'describir', 'explica', 'explicar', 'que hay', 'qué hay', 'muestra', 'mostrar', 'estado', 'resumen', 'lista', 'listar']

/** Sinónimos de tipo de techo → id del modelo Roof. */
export const ROOF_SYNONYMS: ReadonlyArray<{ words: ReadonlyArray<string>; id: string }> = [
  { words: ['dos aguas', 'dos aguas', 'gablete', 'gable'], id: 'gable' },
  { words: ['cuatro aguas', 'cuatro faldones', 'hip'], id: 'hip' },
  { words: ['un agua', 'una agua', 'shed', 'inclinado'], id: 'shed' },
  { words: ['plano', 'plana', 'plano', 'azotea', 'flat'], id: 'flat' },
  { words: ['mansard', 'mansarda'], id: 'mansard' },
  { words: ['diente de sierra', 'sawtooth'], id: 'sawtooth' }
]

/** Palabras de planta (piso). */
export const FLOOR_WORDS: ReadonlyArray<string> = ['planta', 'piso', 'nivel', 'entrepiso']

/** Unidades de longitud reconocidas y su factor a metros. */
export const UNIT_FACTORS: Readonly<Record<string, number>> = {
  m: 1, metro: 1, metros: 1, mt: 1, mts: 1,
  cm: 0.01, centimetro: 0.01, centimetros: 0.01,
  mm: 0.001, milimetro: 0.001, milimetros: 0.001
}

/** Normaliza para comparar: minúsculas y sin signos que estorben. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^\w\s.,×x]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
