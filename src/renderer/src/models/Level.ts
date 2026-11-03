/**
 * Nivel ("piso") de un proyecto.
 *
 * Cada muro y objeto del lienzo pertenece a un `Level` mediante su `levelId`.
 * La elevación es derivada: la de un piso es la suma de las alturas de todos
 * los anteriores (véase `withRecomputedElevations`), de modo que un piso nuevo
 * siempre nace encima del anterior.
 */
export interface Level {
  /** Identificador estable (se persiste junto a cada muro/objeto). */
  id: string
  /** Nombre visible («Piso 0», «Piso 1»… o un nombre personalizado). */
  name: string
  /** Cota del forjado de este piso, en metros sobre el nivel 0. */
  elevation: number
  /** Altura del piso (cota a cota), en metros. */
  height: number
  /** Cota inicial de este piso sobre el nivel 0 (0 = nivel inferior). */
  initialElevation: number
}
/** Id del nivel por defecto: todos los proyectos migrados acaban aquí. */
export const DEFAULT_LEVEL_ID = 'level-0'

/** Altura por defecto de un piso (metros). */
export const DEFAULT_LEVEL_HEIGHT = 2.8

/** Serial para generar ids únicos dentro de la sesión. */
let nextLevelSerial = 1

/** Nivel por defecto «Piso 0»: elevación 0 y altura 2.8 m. */
export function createDefaultLevel(): Level {
  return { id: DEFAULT_LEVEL_ID, name: 'Piso 0', elevation: 0, height: DEFAULT_LEVEL_HEIGHT, initialElevation: 0 }
}

/**
 * Id único para un piso nuevo. Combina marca temporal y serial para no
 * colisionar con los ids ya persistidos al recargar un proyecto.
 */
export function createLevelId(): string {
  return `level-${Date.now().toString(36)}-${nextLevelSerial++}`
}

/** Nombre por defecto del siguiente piso: «Piso 1», «Piso 2»… */
export function nextLevelName(levels: readonly Level[]): string {
  return `Piso ${levels.length}`
}

/**
 * Recalcula las elevaciones (suma acumulada de alturas) y devuelve un array
 * NUEVO de objetos nuevos: el historial guarda copias `before`/`after` y debe
 * poder compararlas sin aliasing mutable.
 */
export function withRecomputedElevations(levels: readonly Level[]): Level[] {
  let elevation = 0
  return levels.map((level) => {
    const next = { ...level, elevation }
    elevation += next.height
    return next
  })
}

/**
 * Normaliza una lista de niveles leída de disco/almacenamiento tolerando
 * datos ausentes o corruptos. Devuelve `null` si no hay nada aprovechable
 * (el llamador cae al «Piso 0» por defecto → migración de proyectos antiguos).
 */
export function normalizeLevels(data: unknown): Level[] | null {
  if (!Array.isArray(data) || data.length === 0) return null
  const levels: Level[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') return null
    const raw = entry as Partial<Level>
    if (typeof raw.id !== 'string' || raw.id.length === 0) return null
    const height = Number(raw.height)
    levels.push({
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name : `Piso ${levels.length}`,
      elevation: 0,
      initialElevation: Number.isFinite(Number(raw.initialElevation)) ? Number(raw.initialElevation) : 0,
      height: Number.isFinite(height) && height > 0 ? height : DEFAULT_LEVEL_HEIGHT
    })
  }
  return withRecomputedElevations(levels)
}
