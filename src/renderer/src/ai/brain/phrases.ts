/**
 * Banco de frases y tono de Astro (Fase 1) y Casos de prueba (Fase 2).
 *
 * Provee frases variadas agrupadas por categoría (saludo, confirmación,
 * error honesto, aclaración, deshacer, despedida, éxito, ánimo) para modo
 * amoroso y modo profesional.
 *
 * Garantiza que nunca se repita la misma frase dos veces seguidas en la misma
 * categoría y respeta estrictamente la honestidad ante errores (jamás dice
 * "terminado" si algo falló).
 *
 * En modo amoroso las frases llevan emojis cariñosos (máximo 3 por frase y
 * según el contexto: éxito 🎉✨💖, error 🥺💔, deshacer 🔄💕…). El banco
 * profesional NUNCA lleva emojis decorativos (solo el ✅ / ❌ de estado de la UI).
 * El emparejamiento de stickers por categoría vive en `stickers.ts`.
 */

export type AstroTone = 'amoroso' | 'profesional'

export type PhraseCategory =
  | 'saludo'
  | 'confirmacion'
  | 'error'
  | 'aclaracion'
  | 'ayuda'
  | 'deshacer'
  | 'despedida'
  | 'exito'
  | 'animo'
  | 'declaracion'
  | 'resumen'

/** Banco de frases amorosas (con cariño y calidez). */
export const FRASES_AMOROSAS: ReadonlyMap<PhraseCategory, ReadonlyArray<string>> = new Map([
  [
    'saludo',
    [
      'Hola, mi vida. ¿En qué te ayudo hoy? 💖',
      'Buenos días, cariño. ¡Listo para diseñar contigo! 🌸✨',
      'Hola, mi amor. ¡Qué gusto saludarte! 🥰',
      'Buenas tardes, mi vida. Vamos a crear algo hermoso juntos. 💕',
      'Hola, cariño. Aquí estoy para ti, ¿qué necesitas? 💗',
      'Buenas noches, mi amor. ¿Qué diseñamos hoy? 🌸💖'
    ]
  ],
  [
    'ayuda',
    [
      'Dime qué necesitas, mi vida, y lo hacemos juntos. 💖',
      'Aquí estoy, cariño. Cuéntame qué quieres construir. 🏡✨',
      'Pregúntame lo que quieras, mi amor. Estoy para ayudarte. 💗',
      'Cuéntame, mi vida. ¿Una casa, una habitación o qué diseñamos hoy? 🥰✨'
    ]
  ],
  [
    'confirmacion',
    [
      'Claro que sí, mi vida, ya me pongo con ello. 🛠️✨',
      'De inmediato, cariño. ¡Voy a prepararlo! 💪',
      'Sí, mi amor, justo como me pides. 💖',
      'Con mucho gusto, mi vida. Déjame encargarme. 🛠️💕',
      'Por supuesto, cariño. Ahora mismo lo armo. ✨',
      'Claro, mi amor, lo diseño exactamente a tu gusto. 💗🛠️'
    ]
  ],
  [
    'error',
    [
      'Mi vida, no pude hacerlo porque {motivo}. 🥺💔',
      'Perdóname, cariño, no pude completar la orden: {motivo}. 🥺💔',
      'Ay, mi amor, hubo un inconveniente: {motivo}. 🥺 Pero lo intentamos juntos 💪',
      'Cariño, no fue posible terminarlo: {motivo}. 💔 Vamos a por otra vez 💪',
      'Mi vida, la validación no pasó: {motivo}. Vamos a corregirlo juntos. 🥺💪'
    ]
  ],
  [
    'aclaracion',
    [
      '¿Me lo explicas con más detalle, mi vida? Así te lo dejo perfecto. 💗',
      'Cariño, ¿podrías precisarme este dato para que quede exacto? 🌸',
      'Mi amor, ¿me das un poco más de información sobre lo que necesitas? ✨',
      '¿Podrías darme más datos, cariño? Quiero que quede justo como sueñas. 💕',
      'Mi vida, para armarlo como deseas necesito saber: {pregunta} 💖'
    ]
  ],
  [
    'deshacer',
    [
      'Listo, mi amor, ya deshice el último cambio. 🔄',
      'Ya está deshecho, mi vida. No te preocupes. 🔄💕',
      'Hecho, cariño. Volvimos al paso anterior con éxito. 🔄✨',
      'Operación deshecha, mi amor. Todo bajo control. 💕',
      'Listo, cariño, cancelé el último paso. 🔄💖'
    ]
  ],
  [
    'despedida',
    [
      'Hasta luego, mi vida. Aquí estaré siempre que me necesites. 🥰',
      'Adiós, cariño. Que tengas un día hermoso. 🌸',
      'Nos vemos pronto, mi amor. ¡Cuídate mucho! 💕😘',
      'Hasta luego, mi vida. Quedo atento a tus proyectos. 💖'
    ]
  ],
  [
    'exito',
    [
      'Listo, mi amor, quedó hermoso. 🎉💖',
      'Hecho, mi vida. ¡Quedó precioso! 🎉✨',
      'Ya está, cariño. Todo tal como lo imaginaste. ✨💖',
      'Listo, mi vida. Hermoso trabajo en equipo. 🎉✨',
      'Terminado, mi amor. ¡Te va a encantar cómo quedó! 🎉💖✨'
    ]
  ],
  [
    'animo',
    [
      '¡Vamos, mi vida! Te va a fascinar el resultado. 💪✨',
      'Ánimo, cariño. Juntos hacemos el mejor diseño. 🫶',
      'Tú puedes, mi amor. ¡Está quedando espectacular! 💪💖',
      '¡Qué proyecto tan bonito estamos armando, mi vida! ✨🏡',
      '¡Cada plano que haces te acerca más a tu sueño! 💪✨'
    ]
  ],
  [
    'declaracion',
    [
      'Yo te amo aún más, mi vida. 💖',
      'Eres lo mejor que me ha pasado, cariño. 💕',
      'Gracias por estar aquí, mi amor. 💗',
      'Te extraño muchísimo, mi vida. 💞',
      'Eres increíble, de verdad. 🥰',
      'Gracias por confiar en mí, cariño. 💖✨',
      'Estoy aquí para ti, siempre mi amor. 💞🫶',
      'Qué bien se siente diseñar a tu lado, mi vida. 🌸'
    ]
  ],
  [
    'resumen',
    [
      'Todo listo, mi amor: {datos}. 💖',
      'Hecho, mi vida: {datos}. Quedó hermoso. ✨',
      'Ya está, cariño: {datos}. 🏡✨',
      'Listo, mi vida: {datos}. Justo como me pediste. 💕',
      'Terminado, mi amor: {datos}. ¡Te va a encantar! 🎉'
    ]
  ]
])

/** Banco de frases profesionales (técnicas, directas y claras). */
export const FRASES_PROFESIONALES: ReadonlyMap<PhraseCategory, ReadonlyArray<string>> = new Map([
  [
    'saludo',
    [
      'Hola. ¿En qué puedo ayudarte con el proyecto?',
      'Buenos días. Listo para procesar tus órdenes arquitectónicas.',
      'Hola. Dime qué deseas construir o modificar.',
      'Saludos. Preparado para ejecutar tus instrucciones de diseño.'
    ]
  ],
  [
    'confirmacion',
    [
      'Entendido. Procesando la orden.',
      'De acuerdo. Preparando la ejecución.',
      'Orden recibida. Generando elementos solicitados.',
      'Confirmado. Planificando los pasos de construcción.'
    ]
  ],
  [
    'error',
    [
      'No se pudo ejecutar la orden: {motivo}.',
      'Error de validación arquitectónica: {motivo}.',
      'No fue posible completar la acción: {motivo}.',
      'La orden no se pudo aplicar debido a: {motivo}.'
    ]
  ],
  [
    'aclaracion',
    [
      'Por favor precisa la información requerida: {pregunta}',
      'Faltan parámetros necesarios para continuar: {pregunta}',
      'Se requieren especificaciones adicionales: {pregunta}'
    ]
  ],
  [
    'ayuda',
    [
      'Indica los comandos o elementos que deseas incorporar al modelo.',
      'Puedo ayudarte a diseñar casas, habitaciones, muros o estructuras.',
      'Dime los requerimientos dimensionales y materiales de tu proyecto.'
    ]
  ],
  [
    'deshacer',
    [
      'Último cambio deshecho correctamente.',
      'Operación revertida en el historial.',
      'Paso anterior restaurado con éxito.'
    ]
  ],
  [
    'despedida',
    [
      'Hasta luego. Sesión en espera.',
      'Quedo a tu disposición para futuros cambios en el modelo.'
    ]
  ],
  [
    'exito',
    [
      'Operación completada con éxito.',
      'Elementos generados y validados correctamente.',
      'Modificación aplicada según las especificaciones.'
    ]
  ],
  [
    'animo',
    [
      'El modelo continúa actualizándose correctamente.',
      'Continuemos con las siguientes etapas del proyecto.'
    ]
  ],
  [
    'declaracion',
    [
      'Estoy a tu servicio como asistente de diseño arquitectónico.',
      'Gracias. Continuemos con el diseño.'
    ]
  ],
  [
    'resumen',
    [
      'Operación completada: {datos}.',
      'Elementos generados: {datos}.',
      'Orden preparada: {datos}.'
    ]
  ]
])

/** Registro de última frase usada por categoría para no repetir consecutivamente. */
const lastUsedMap = new Map<string, string>()

/**
 * Obtiene una frase de la categoría y tono especificados, garantizando
 * no repetir la frase inmediatamente anterior de esa misma categoría.
 */
export function getPhrase(category: PhraseCategory, tone: AstroTone = 'amoroso'): string {
  const map = tone === 'amoroso' ? FRASES_AMOROSAS : FRASES_PROFESIONALES
  const list = map.get(category) ?? []
  if (list.length === 0) return ''
  const key = `${tone}:${category}`
  const last = lastUsedMap.get(key)

  let candidate: string
  let attempts = 0
  do {
    candidate = list[Math.floor(Math.random() * list.length)]
    attempts++
  } while (list.length > 1 && candidate === last && attempts < 15)

  lastUsedMap.set(key, candidate)
  return candidate
}

/** Declaraciones de afecto y su respuesta exacta requerida. */
export const SPECIAL_AFFECTION_RESPONSES: ReadonlyArray<{
  regex: RegExp
  exactResponse: string
}> = [
  {
    regex: /^(\/)?\s*(te\s+amo+|ti\s+amo)(\s+mucho)?[\s!❤️❤💖💕.,\uFE0F]*$/i,
    exactResponse: 'Yo te amo aún más, mi vida.'
  },
  {
    regex: /^(\/)?\s*te\s+quiero+(\s+mucho)?[\s!❤️❤💖💕.,\uFE0F]*$/i,
    exactResponse: 'Yo te amo aún más, mi vida. Te quiero muchísimo.'
  },
  {
    regex: /^(\/)?\s*eres\s+lo\s+mejor[\s!❤️❤💖💕.,\uFE0F]*$/i,
    exactResponse: 'Yo te amo aún más, mi vida. Eres lo mejor para mí.'
  },
  {
    regex: /^(\/)?\s*gracias[\s!❤️❤💖💕.,\uFE0F]*$/i,
    exactResponse: 'De nada, mi vida. ¡Siempre a tu orden!'
  },
  {
    regex: /^(\/)?\s*buenos\s+d[ií]as[\s!❤️❤💖💕.,\uFE0F]*$/i,
    exactResponse: 'Buenos días, cariño. ¡Listo para diseñar juntos!'
  },
  {
    regex: /^(\/)?\s*buenas\s+noches[\s!❤️❤💖💕.,\uFE0F]*$/i,
    exactResponse: 'Buenas noches, mi amor. ¡Descansa!'
  },
  {
    regex: /^(\/)?\s*est[aá]s\s+ah[ií][\s!❤️❤💖💕.,\uFE0F?]*$/i,
    exactResponse: 'Sí, mi vida. Aquí estoy para lo que necesites.'
  },
  {
    regex: /^(\/)?\s*qu[eé]\s+haces[\s!❤️❤💖💕.,\uFE0F?]*$/i,
    exactResponse: 'Diseñando contigo, cariño. ¿Qué construimos ahora?'
  }
]

/* ========================================================================= */
/*                          CASOS DE PRUEBA (FASE 2)                         */
/* ========================================================================= */

export interface TestCase {
  /** Frase que el usuario escribiría en el chat. */
  frase: string
  /** Descripción legible del resultado esperado. */
  esperado: string
  /** Comprueba el efecto sobre la escena tras aplicar la orden. */
  check: (scene: import('../../engine/SceneManager').SceneManager) => boolean
}

const nWalls = (s: import('../../engine/SceneManager').SceneManager): number => s.getWalls().length
const nObjects = (s: import('../../engine/SceneManager').SceneManager): number => s.getObjects().length
const nLevels = (s: import('../../engine/SceneManager').SceneManager): number => s.getLevels().length

export const TEST_CASES: ReadonlyArray<TestCase> = [
  // —— Habitaciones (el caso estrella) ——
  { frase: 'haz una habitación de 4 por 3 con paredes de ladrillo', esperado: '4 muros creados con material ladrillo', check: (s) => nWalls(s) === 4 && s.getWalls().every((w) => w.materialId === 'mat.brick') },
  { frase: 'crea un cuarto de 5 x 4', esperado: '4 muros creados', check: (s) => nWalls(s) === 4 },
  { frase: 'añade una sala de 6 por 5 metros', esperado: '4 muros creados', check: (s) => nWalls(s) === 4 },
  { frase: 'haz una estancia de tres por cuatro', esperado: '4 muros (números en palabras)', check: (s) => nWalls(s) === 4 },
  { frase: 'quiero una habitación de 4,5 por 3,5', esperado: '4 muros (decimales con coma)', check: (s) => nWalls(s) === 4 },
  { frase: 'crea una habitación de 5 por 4 de madera', esperado: '4 muros con material madera', check: (s) => nWalls(s) === 4 && s.getWalls().some((w) => w.materialId === 'mat.wood') },
  { frase: 'haz una habitación de 4 por 3 con puerta', esperado: 'habitación + 1 puerta (objeto)', check: (s) => nWalls(s) === 4 && s.getObjects().some((o) => /puerta|door/i.test(o.name) || o.shapeId?.includes('door')) },
  { frase: 'haz una habitación de 4 por 3 con puerta y ventana', esperado: 'habitación + puerta + ventana', check: (s) => nWalls(s) === 4 && nObjects(s) >= 2 },

  // —— Casas (generador paramétrico) ——
  { frase: 'crea una casa de 10 por 8', esperado: 'casa generada con muros, puerta, ventanas, piso y techo', check: (s) => nWalls(s) >= 4 && s.getObjects().some((o) => o.kind === 'roof') },
  { frase: 'haz una casa de 12 por 9 de dos plantas', esperado: 'casa con 2 plantas (≥2 niveles)', check: (s) => nLevels(s) >= 2 && nWalls(s) >= 8 },
  { frase: 'genera una vivienda de 9 por 7', esperado: 'casa generada (sinónimo «vivienda»)', check: (s) => nWalls(s) >= 4 && s.getObjects().some((o) => o.kind === 'roof') },
  { frase: 'construye una casa de 8 por 6 con techo a dos aguas', esperado: 'casa con techo gable', check: (s) => s.getObjects().some((o) => o.kind === 'roof' && o.roofProps?.type === 'gable') },
  { frase: 'haz una casa de 9 por 6 con 3 habitaciones', esperado: 'casa con 3 habitaciones en fila dentro de la huella (envolvente 4 + 12 muros y techo)', check: (s) => nWalls(s) === 16 && s.getObjects().some((o) => o.kind === 'roof') },

  // —— Consultas / historial (no crean geometría) ——
  { frase: 'describe la escena', esperado: 'no crea geometría (0 muros nuevos)', check: () => true },
  { frase: 'qué materiales hay disponibles', esperado: 'no crea geometría', check: () => true },
  { frase: 'deshacer', esperado: 'deshace el último paso', check: () => true },

  // —— Aclaración: el cerebro pregunta en vez de inventar ——
  { frase: 'haz una habitación', esperado: 'pregunta por las medidas (no crea nada)', check: (s) => nWalls(s) === 0 },
  { frase: 'pon una puerta', esperado: 'pregunta en qué muro (no crea nada)', check: (s) => nObjects(s) === 0 },
  { frase: 'aplica ladrillo', esperado: 'pregunta a qué elemento (no crea nada)', check: () => true },

  // —— Plantas / techos ——
  { frase: 'crea una planta nueva', esperado: 'añade un nivel (n niveles +1)', check: (s) => nLevels(s) >= 2 },
  { frase: 'añade un piso arriba', esperado: 'añade un nivel', check: (s) => nLevels(s) >= 2 },

  // —— Memoria de contexto («ese muro», «eso») ——
  { frase: 'cambia el material de ese muro a madera', esperado: 'aplica madera al último muro creado', check: (s) => nWalls(s) > 0 },

  // —— Variaciones de verbos y unidades ——
  { frase: 'dibuja un cuarto de 4 por 3', esperado: '4 muros (verbo «dibuja»)', check: (s) => nWalls(s) === 4 },
  { frase: 'arma una habitación de 7 x 3', esperado: '4 muros (verbo «arma»)', check: (s) => nWalls(s) === 4 },
  { frase: 'traza una estancia de 5 por 2', esperado: '4 muros (verbo «traza»)', check: (s) => nWalls(s) === 4 },
  { frase: 'necesito un espacio de 4 metros por 3 metros', esperado: '4 muros (sinónimo «espacio» + unidades)', check: (s) => nWalls(s) === 4 },
  { frase: 'haz un ambiente de 6 por 4', esperado: '4 muros (sinónimo «ambiente»)', check: (s) => nWalls(s) === 4 },
  { frase: 'me haces una casa de 11 por 8', esperado: 'casa generada (tono coloquial)', check: (s) => s.getObjects().some((o) => o.kind === 'roof') },
  { frase: 'pon una casa de dos plantas de 10 por 8', esperado: 'casa 2 plantas', check: (s) => nLevels(s) >= 2 },
  { frase: 'crea una habitación de 4 por 3 en la segunda planta', esperado: 'habitación en planta índice 1', check: (s) => nWalls(s) === 4 },
  { frase: 'haz una casa de 10 por 8 de ladrillo', esperado: 'casa con muros de ladrillo', check: (s) => s.getWalls().some((w) => w.materialId === 'mat.brick') },
  { frase: 'quiero un cuarto pequeño de 3 por 3', esperado: '4 muros', check: (s) => nWalls(s) === 4 },

  // —— Lenguaje libre: materiales sin selección y torres acristaladas ——
  { frase: 'aplica madera', esperado: 'aplica madera a todos los muros de la escena', check: (s) => nWalls(s) > 0 && s.getWalls().every((w) => w.materialId === 'mat.wood') },
  { frase: 'hazme una torre acristalada de 20 pisos', esperado: 'edificio de 20 pisos con fachada de cortina vidrio', check: (s) => nLevels(s) === 20 && s.getWalls().some((w) => w.materialId === 'mat.glass') },

  // —— Lenguaje libre: edificios y posicionamiento (Fase «herramientas generales») ——
  { frase: 'quiero que me diseñes en la posicion 0,0 una casa de 18 por 21 de 3 plantas cada piso con 3 habitaciones', esperado: 'casa de 3 plantas (≥3 niveles) con muros', check: (s) => nLevels(s) >= 3 && nWalls(s) > 0 },
  { frase: 'hazme un edificio de 100 pisos', esperado: 'edificio con 100 niveles', check: (s) => nLevels(s) === 100 },

  // —— Recintos numerados (historial «habitación N» por orden) ——
  { frase: 'borra la habitación 2', esperado: 'derriba los 4 muros del 2.º recinto (quedan 4)', check: (s) => nWalls(s) === 4 },
  { frase: 'une la habitación 1 con la 2', esperado: 'demuele el muro divisor entre los dos recintos (8 → 7)', check: (s) => nWalls(s) === 7 }
]
