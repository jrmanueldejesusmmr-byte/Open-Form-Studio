import type { ActionRegistry } from './ActionRegistry'

/**
 * Gestor de atajos de teclado del editor.
 *
 * Los atajos dejan de estar escritos a mano en un `switch` del workspace: se
 * declaran una sola vez como `defaultShortcut` en `ACTION_CATALOG` y este
 * gestor los traduce a pulsaciones reales. Así una acción tiene el mismo atajo
 * en el teclado, en la paleta de comandos y en los menús, sin duplicar lógica.
 *
 * El formato canónico es `Ctrl+Shift+P`: modificadores siempre en el orden
 * `Ctrl`, `Alt`, `Shift`, `Meta` y tecla al final (`+`, `-`, `Space`, `Esc`,
 * `A`…). `shortcutFromEvent()` produce exactamente ese formato a partir de un
 * `KeyboardEvent`, de modo que la comparación es una simple búsqueda en un mapa.
 */
export type Shortcut = string

/** Normaliza una tecla suelta al formato canónico (`−` tipográfico → `-`). */
function normalizeKey(key: string): string {
  if (key === 'Escape') return 'Esc'
  if (key === ' ') return 'Space'
  // El catálogo escribe el menos con el signo tipográfico (U+2212).
  if (key === '\u2212') return '-'
  return key.length === 1 ? key.toLowerCase() : key
}

/** Convierte un `KeyboardEvent` en su atajo canónico (`Ctrl+Shift+P`). */
export function shortcutFromEvent(event: KeyboardEvent): Shortcut {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(normalizeKey(event.key))
  return parts.join('+')
}

/**
 * Atajos alternativos que la app acepta aunque no figuren en el catálogo.
 * Se normalizan a su forma canónica antes de buscar la acción.
 */
const DEFAULT_ALIASES: Readonly<Record<Shortcut, Shortcut>> = {
  // Ctrl+Shift+Z es el «Rehacer» estándar en editores y Cad: mismo destino.
  'Ctrl+Shift+Z': 'Ctrl+Y'
}

/**
 * Ordena los modificadores (`Ctrl`, `Alt`, `Shift`, `Meta`) y normaliza la tecla
 * final sin consultar los alias, para poder usarla también al construirlos.
 *
 * Soporta acordes (`Ctrl+K Z`): se separan las pulsaciones por espacios y cada
 * una se normaliza por separado, de modo que `Ctrl+K Z` y `ctrl+k z` producen
 * exactamente la misma forma canónica.
 */
function canonicalForm(shortcut: Shortcut): Shortcut {
  return shortcut
    .trim()
    .split(/\s+/)
    .map((stroke) => {
      const tokens = stroke.split('+').map((token) => token.trim())
      const modifiers = ['Ctrl', 'Alt', 'Shift', 'Meta'].filter((modifier) =>
        tokens.some((token) => token.toLowerCase() === modifier.toLowerCase())
      )
      const key = tokens.find(
        (token) => !['ctrl', 'alt', 'shift', 'meta'].includes(token.toLowerCase())
      )
      return [...modifiers, ...(key ? [normalizeKey(key)] : [])].join('+')
    })
    .join(' ')
}

/**
 * Forma canónica legible para mostrar al usuario: `Ctrl+k z` → `Ctrl+K Z`.
 * (Internamente se compara en minúscula; se muestra en la forma habitual.)
 */
export function formatShortcut(canonical: Shortcut): string {
  if (!canonical) return ''
  return canonical
    .split(' ')
    .map((stroke) => {
      if (stroke.length === 1) return stroke.toUpperCase()
      return stroke.replace(/\+([a-z])$/, (_, key: string) => `+${key.toUpperCase()}`)
    })
    .join(' ')
}

export interface KeybindingOptions {
  /**
   * Devuelve `true` cuando el evento debe ignorarse (otra pantalla visible, foco
   * en un campo de texto…). Se evalúa en cada tecla, así que también puede
   * consultar el estado real de la interfaz. Recibe el evento para poder dejar
   * pasar atajos globales (p. ej. la paleta) aunque el foco esté en un campo.
   */
  isBlocked?: (event: KeyboardEvent) => boolean
  /** Traducciones adicionales de atajos alternativos a su forma canónica. */
  aliases?: Readonly<Record<Shortcut, Shortcut>>
}

/** Atajo declarado por la app (para mostrarlo en menús, toolbox y paleta). */
export interface KeybindingInfo {
  actionId: string
  shortcut: Shortcut
}

export class KeybindingManager {
  /** Ventana de espera de la segunda pulsación de un acorde (Ctrl+K … Z). */
  private static readonly CHORD_WINDOW_MS = 300

  private readonly registry: ActionRegistry
  private readonly aliases: Record<Shortcut, Shortcut>
  private readonly isBlocked: (event: KeyboardEvent) => boolean
  private readonly byShortcut = new Map<Shortcut, string>()
  private readonly byAction = new Map<string, Shortcut>()

  /** Primera pulsación de un acorde pendiente (p. ej. `Ctrl+k`), si la hay. */
  private pendingStroke: Shortcut | null = null
  private chordTimer: ReturnType<typeof setTimeout> | null = null

  constructor(registry: ActionRegistry, options: KeybindingOptions = {}) {
    this.registry = registry
    // Los alias se guardan ya canónicos (`Ctrl+Shift+Z` → `Ctrl+Shift+z`): si
    // no, la clave del mapa y el resultado de `resolve()` nunca coincidirían.
    this.aliases = {}
    for (const [from, to] of Object.entries({ ...DEFAULT_ALIASES, ...options.aliases })) {
      this.aliases[canonicalForm(from)] = canonicalForm(to)
    }
    this.isBlocked = options.isBlocked ?? (() => false)

    for (const action of registry.all()) {
      if (!action.defaultShortcut) continue

      const shortcut = this.resolve(action.defaultShortcut)
      const owner = this.byShortcut.get(shortcut)
      if (owner) {
        // Un conflicto no debe romper la app: se avisa en consola y gana la
        // primera acción declarada (el catálogo está en orden estable).
        console.warn(`[KeybindingManager] «${shortcut}» está repetido (${owner} y ${action.id}).`)
        continue
      }
      this.byShortcut.set(shortcut, action.id)
      this.byAction.set(action.id, shortcut)
    }
  }

  /**
   * Normaliza un atajo escrito en cualquier orden a su forma canónica y aplica
   * los alias: `shift+ctrl+p` → `Ctrl+P`, `Ctrl+Shift+Z` → `Ctrl+Y`.
   */
  resolve(shortcut: Shortcut): Shortcut {
    const canonical = canonicalForm(shortcut)
    return this.aliases[canonical] ?? canonical
  }

  /** Atajo canónico de una acción, si la app le ha declarado uno. */
  shortcutFor(actionId: string): Shortcut | undefined {
    return this.byAction.get(actionId)
  }

  /** Todos los atajos declarados (para la ayuda de atajos y la paleta). */
  list(): readonly KeybindingInfo[] {
    return [...this.byAction].map(([actionId, shortcut]) => ({ actionId, shortcut }))
  }

  /**
   * Traduce una pulsación a una acción y la ejecuta.
   *
   * Devuelve `true` si la pulsación corresponde a una acción disponible (y por
   * tanto el evento ya está consumido: el llamante puede hacer `preventDefault`).
   * Una acción deshabilitada —Rehacer sin historial, por ejemplo— devuelve
   * `false` para no impedir el comportamiento por defecto del navegador.
   */
  handle(event: KeyboardEvent): boolean {
    const stroke = this.resolve(shortcutFromEvent(event))

    if (this.pendingStroke) {
      const combined = `${this.pendingStroke} ${stroke}`
      this.clearPending()
      const chordId = this.byShortcut.get(combined)
      if (chordId) return this.registry.run(chordId)
      // Acorde cancelado: esta pulsación sigue su curso normal más abajo.
    }

    if (this.isBlocked(event)) return false

    const actionId = this.byShortcut.get(stroke)
    if (!actionId) return false

    if (this.hasChordStartingWith(stroke)) {
      this.startPending(stroke)
      return true
    }

    return this.registry.run(actionId)
  }

  /** ¿Existe algún atajo que continúe con `stroke` como primera pulsación? */
  private hasChordStartingWith(stroke: Shortcut): boolean {
    const prefix = `${stroke} `
    for (const shortcut of this.byShortcut.keys()) {
      if (shortcut.startsWith(prefix)) return true
    }
    return false
  }

  private startPending(stroke: Shortcut): void {
    this.clearPending()
    this.pendingStroke = stroke
    this.chordTimer = setTimeout(() => {
      // Sin segunda pulsación: manda la acción simple (Ctrl+K → paleta).
      const plainId = this.byShortcut.get(stroke)
      this.clearPending()
      if (plainId) this.registry.run(plainId)
    }, KeybindingManager.CHORD_WINDOW_MS)
  }

  private clearPending(): void {
    if (this.chordTimer !== null) {
      clearTimeout(this.chordTimer)
      this.chordTimer = null
    }
    this.pendingStroke = null
  }
}