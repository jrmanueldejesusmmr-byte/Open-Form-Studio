import { icon } from './icons'
import { t, type MessageKey } from '../i18n/es'
import type { ActionCategory, ActionDefinition, ActionRegistry } from '../actions/ActionRegistry'
import { formatShortcut, type KeybindingManager } from '../actions/KeybindingManager'

/**
 * Paleta de comandos (Fase 4, punto F).
 *
 * Búsqueda incremental sobre el registro central de acciones: escribe, filtra y
 * pulsa Intro. No inventa atajos ni lógica propia —lista lo que declara
 * `ACTION_CATALOG` y ejecuta por `ActionRegistry.run(id)`, igual que los menús
 * o el teclado—, así que toda acción del editor queda a un clic de distancia.
 *
 * Detalles de comportamiento:
 * - El filtro no distingue acentos ni mayúsculas («ahorrar» encuentra «Guardar»).
 * - Las acciones no disponibles se listan atenuadas y no se ejecutan, en lugar de
 *   desaparecer: el usuario ve que existen y por qué no puede usarlas ahora.
 * - `Esc` cierra y devuelve el foco al editor; al abrirse queda resaltada la
 *   primera acción, que es la que ejecuta `Intro` sin tocar el ratón.
 */

export interface CommandPaletteOptions {
  /** Registro central: aporta etiqueta, icono, categoría y disponibilidad. */
  actions: ActionRegistry
  /** Atajos declarados por la app, para mostrar la tecla a la derecha. */
  keybindings: KeybindingManager
}

export interface CommandPaletteHandle {
  isOpen(): boolean
  open(): void
  close(): void
  toggle(): void
}

/** Acción visible en la lista, con su atajo y su estado actual. */
interface PaletteEntry {
  action: ActionDefinition
  shortcut: string
  enabled: boolean
}

/** Normaliza para comparar sin acentos ni mayúsculas. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return map[char] ?? char
  })
}

/**
 * Filtra por subsecuencia: «gsr» encuentra «Guardar escena…». Es el criterio
 * afianzable que usan las paletas de los editores de código, y además de no
 * exigir acentos premia coincidir al inicio de la palabra.
 * Devuelve `null` si la consulta no encaja en la etiqueta.
 */
function fuzzyScore(label: string, query: string): number | null {
  let score = 0
  let cursor = 0
  for (const char of query) {
    const found = label.indexOf(char, cursor)
    if (found === -1) return null
    score += found === 0 || label[found - 1] === ' ' ? 5 : 1
    cursor = found + 1
  }
  return score
}

/** Etiqueta legible de cada categoría de acciones. */
const CATEGORY_LABELS: Readonly<Record<ActionCategory, MessageKey>> = {
  archivo: 'category.archivo',
  edicion: 'category.edicion',
  dibujo: 'category.dibujo',
  modificadores: 'category.modificadores',
  herramientas: 'category.herramientas',
  anotacion: 'category.anotacion',
  aec: 'category.aec',
  notas: 'category.notas',
  vista: 'category.vista',
  ayudas: 'category.ayudas'
}

export function mountCommandPalette(
  container: HTMLElement,
  options: CommandPaletteOptions
): CommandPaletteHandle {
  container.classList.add('is-hidden')

  let entries: PaletteEntry[] = []
  let highlighted = 0

  const input = container.querySelector<HTMLInputElement>('.command-palette__input')!
  const list = container.querySelector<HTMLElement>('.command-palette__list')!
  const empty = container.querySelector<HTMLElement>('.command-palette__empty')!

  /** Acciones visibles para la consulta actual, en el orden del catálogo. */
  function collect(query: string): PaletteEntry[] {
    const folded = fold(query.trim())
    const scored: { entry: PaletteEntry; score: number }[] = []

    for (const action of options.actions.all()) {
      const entry: PaletteEntry = {
        action,
        shortcut: formatShortcut(options.keybindings.shortcutFor(action.id) ?? ''),
        enabled: options.actions.isEnabled(action.id)
      }
      if (!folded) {
        scored.push({ entry, score: 0 })
        continue
      }
      const score = fuzzyScore(fold(action.label), folded)
      if (score !== null) scored.push({ entry, score })
    }

    // Sin consulta se respeta el orden del catálogo (que ya agrupa por familia);
    // con consulta manda la relevancia, y el orden del catálogo desempata.
    scored.sort((a, b) => b.score - a.score)
    return scored.map((item) => item.entry)
  }

  function render(): void {
    if (entries.length === 0) {
      list.innerHTML = ''
      empty.classList.remove('is-hidden')
      return
    }
    empty.classList.add('is-hidden')

    list.innerHTML = entries
      .map((entry, index) => {
        const classes = ['command-palette__item']
        if (index === highlighted) classes.push('is-highlighted')
        if (!entry.enabled) classes.push('is-disabled')
        return `
        <button class="${classes.join(' ')}" data-index="${index}" role="option"
          aria-selected="${index === highlighted}" ${entry.enabled ? '' : 'disabled'}>
          <span class="command-palette__icon">${icon(entry.action.icon, 15)}</span>
          <span class="command-palette__label">${escapeHtml(entry.action.label)}</span>
          <span class="command-palette__category">${t(CATEGORY_LABELS[entry.action.category])}</span>
          ${
            entry.shortcut
              ? `<kbd class="command-palette__shortcut">${escapeHtml(entry.shortcut)}</kbd>`
              : ''
          }
        </button>`
      })
      .join('')

    // Mantiene visible la fila resaltada al navegar con el teclado.
    list.querySelector<HTMLElement>('.is-highlighted')?.scrollIntoView({ block: 'nearest' })
  }

  /** Recalcula la lista conservando el resaltado dentro del rango nuevo. */
  function refresh(): void {
    entries = collect(input.value)
    highlighted = Math.min(highlighted, Math.max(entries.length - 1, 0))
    render()
  }

  /** Desplaza el resaltado; al llegar al borde continúa por el otro lado. */
  function move(step: number): void {
    if (entries.length === 0) return
    highlighted = (highlighted + step + entries.length) % entries.length
    render()
  }

  function run(index: number): void {
    const entry = entries[index]
    if (!entry) return
    if (!entry.enabled) return

    // Cierra antes de ejecutar: algunas acciones abren sus propios diálogos y la
    // paleta no debe quedar encima tapándolos.
    close()
    options.actions.run(entry.action.id)
  }

  function isOpen(): boolean {
    return !container.classList.contains('is-hidden')
  }

  function open(): void {
    container.classList.remove('is-hidden')
    input.value = ''
    highlighted = 0
    refresh()
    input.focus()
  }

  function close(): void {
    if (!isOpen()) return
    container.classList.add('is-hidden')
    // Devuelve el foco al editor para que los atajos sigan respondiendo.
    ;(document.getElementById('viewport-canvas') as HTMLElement | null)?.focus()
  }

  input.placeholder = t('palette.placeholder')
  input.setAttribute('aria-label', t('palette.title'))
  empty.textContent = t('palette.empty')

  input.addEventListener('input', refresh)

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        move(-1)
        break
      case 'Enter':
        event.preventDefault()
        event.stopPropagation()
        run(highlighted)
        break
      case 'Escape':
        event.preventDefault()
        // Se consume del todo: sin esto, la burbuja llega al gestor global y
        // `Esc` también activaría la herramienta Seleccionar al cerrar.
        event.stopPropagation()
        close()
        break
    }
    // Cualquier otra tecla la sigue atendiendo el gestor global de atajos.
  })

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-index]')
    if (button) run(Number(button.dataset.index))
  })

  // El ratón resalta la fila apuntada, para poder decidir con un solo clic.
  list.addEventListener('mousemove', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-index]')
    if (!button) return
    const index = Number(button.dataset.index)
    if (index === highlighted) return
    highlighted = index
    render()
  })

  // Clic fuera de la tarjeta: mismo efecto que `Esc`.
  container.addEventListener('click', (event) => {
    if (event.target === container) close()
  })

  return {
    isOpen,
    open,
    close,
    toggle: () => (isOpen() ? close() : open())
  }
}
