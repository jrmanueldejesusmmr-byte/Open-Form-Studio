import { icon } from './icons'

export interface ShortcutsModalHandle {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  dispose(): void
}

interface ShortcutRow {
  keys: string[]
  label: string
  detail?: string
}

const DRAWING_SHORTCUTS: readonly ShortcutRow[] = [
  { keys: ['M'], label: 'Muro simple', detail: 'Trazar muros conectados punto a punto' },
  { keys: ['R'], label: 'Habitación Rectangular', detail: '4 muros cerrados de un clic o arrastrando' },
  { keys: ['L'], label: 'Plantilla Perfil L', detail: 'Habitación en L (6 muros) o esquina (2 muros)' },
  { keys: ['U'], label: 'Plantilla Perfil U', detail: '3 muros conectados formando espacio en U' },
  { keys: ['P'], label: 'Plantilla Perfil C', detail: '3 muros laterales abiertos hacia un costado' },
  { keys: ['T'], label: 'Plantilla Perfil T', detail: 'División interior en T con vértices unidos' },
  { keys: ['Y'], label: 'Plantilla Cruz (+)', detail: '4 tramos en cruz para dividir ambientes' },
  { keys: ['N'], label: 'Anillo / Muro Circular', detail: 'Polilínea cerrada de muros curvos/poligonales' },
  { keys: ['B'], label: 'Muro en Arco', detail: 'Bahía curva abierta de segmentos de muro' },
  { keys: ['E'], label: 'Trazar cableado eléctrico / Segmento', detail: 'Conectar cajas, tomas y switches con tubería conduit' },
  { keys: ['A'], label: 'Añadir elemento', detail: 'Puertas, ventanas, mobiliario y catálogo' }
]

const EDITING_SHORTCUTS: readonly ShortcutRow[] = [
  { keys: ['S', 'Esc'], label: 'Seleccionar / Cancelar trazo', detail: 'Cancela el trazo activo sin borrar lo dibujado' },
  { keys: ['V'], label: 'Mover elemento', detail: 'Arrastrar cuerpo mueve · extremos azules estiran' },
  { keys: ['G'], label: 'Rotar 90°', detail: 'Gira plantilla antes de colocar o selección actual' },
  { keys: ['Supr', '⌫'], label: 'Borrar selección', detail: 'Elimina el muro, lado u objeto seleccionado' },
  { keys: ['Ctrl + D'], label: 'Duplicar selección', detail: 'Clona el muro, habitación o grupo seleccionado' },
  { keys: ['Ctrl + Z'], label: 'Deshacer', detail: 'Revierte la última acción o plantilla completa' },
  { keys: ['Ctrl + Y'], label: 'Rehacer', detail: 'También disponible con Ctrl + Shift + Z' },
  { keys: ['Ctrl + A'], label: 'Seleccionar todo', detail: 'Selecciona todos los muros y objetos' },
  { keys: ['X'], label: 'Vaciar escena', detail: 'Limpia el plano con confirmación rápida' }
]

const VIEW_SHORTCUTS: readonly ShortcutRow[] = [
  { keys: ['← →', '↑ ↓'], label: 'Rotar 3D / Inclinar', detail: '3D: orbita alrededor del centro de la casa (10° a 85°) · 2D: desplaza planta' },
  { keys: ['W A S D', 'Shift + Flechas'], label: 'Desplazar cámara (Caminar)', detail: 'Recorre adelante, atrás, izquierda y derecha en el terreno' },
  { keys: ['C', 'F'], label: '🎯 Enfocar Casa (Centrar)', detail: 'Re-encuadra instantáneamente la estructura en el centro del visor' },
  { keys: ['Doble Clic'], label: 'Enfocar detalle 3D', detail: 'Centra el pivote de rotación sobre el elemento clickeado' },
  { keys: ['1', '2', '3', '4', '5', '6'], label: 'Vistas Rápidas', detail: '1: Frontal · 2: Trasera · 3: Izq · 4: Der · 5: Isométrica 3D · 6: Planta' },
  { keys: ['+ / −', 'Scroll'], label: 'Zoom amortiguado', detail: 'Zoom fluido con damping hacia el cursor o centro de la casa' },
  { keys: ['Espacio'], label: 'Alternar Vista 2D / 3D', detail: 'Cambia al instante entre Planta 2D y Perspectiva 3D' },
  { keys: ['O'], label: 'Herramienta Orbitar 3D', detail: 'También con clic derecho sobre el fondo vacío' },
  { keys: ['K'], label: 'Vista Rayos X MEP', detail: 'Muros semitransparentes para ver cableado y tuberías internas' },
  { keys: ['Ctrl + K'], label: 'Paleta de comandos', detail: 'Busca y ejecuta cualquier herramienta' },
  { keys: ['?', 'H'], label: 'Atajos de teclado', detail: 'Abre o cierra esta guía rápida' }
]

function renderRows(rows: readonly ShortcutRow[]): string {
  return rows
    .map(
      (row) => `
      <div class="sc-row">
        <div class="sc-info">
          <span class="sc-label">${row.label}</span>
          ${row.detail ? `<span class="sc-detail">${row.detail}</span>` : ''}
        </div>
        <div class="sc-keys">
          ${row.keys
            .map((k) => `<kbd class="sc-kbd">${k}</kbd>`)
            .join('<span class="sc-or">/</span>')}
        </div>
      </div>
    `
    )
    .join('')
}

/**
 * Modal limpio y compacto con la guía visual de todos los atajos de teclado 2D y 3D.
 * Se activa desde el botón superior `⌨️ Atajos [?]` o pulsando `?` / `H`.
 */
export function mountShortcutsModal(host: HTMLElement): ShortcutsModalHandle {
  const backdrop = document.createElement('div')
  backdrop.className = 'shortcuts-backdrop'
  backdrop.hidden = true
  backdrop.setAttribute('role', 'dialog')
  backdrop.setAttribute('aria-modal', 'true')
  backdrop.setAttribute('aria-label', 'Atajos de teclado para diseño rápido 2D y 3D')

  backdrop.innerHTML = `
    <div class="shortcuts-modal">
      <header class="shortcuts-header">
        <div class="shortcuts-title-wrap">
          <span class="shortcuts-icon">${icon('keyboard', 18)}</span>
          <div>
            <h2 class="shortcuts-title">Atajos de Teclado 2D / 3D</h2>
            <p class="shortcuts-subtitle">Se pausan automáticamente al escribir en campos de texto o en el chat de IA</p>
          </div>
        </div>
        <button type="button" class="shortcuts-close" data-action="close" aria-label="Cerrar ventana de atajos">
          ${icon('close', 16)}
          <kbd class="kbd-badge">Esc</kbd>
        </button>
      </header>

      <div class="shortcuts-grid">
        <section class="shortcuts-col">
          <h3 class="shortcuts-col-title">Dibujo y Plantillas de Muros 2D</h3>
          <div class="shortcuts-list">${renderRows(DRAWING_SHORTCUTS)}</div>
        </section>

        <section class="shortcuts-col">
          <h3 class="shortcuts-col-title">Edición y Modificadores</h3>
          <div class="shortcuts-list">${renderRows(EDITING_SHORTCUTS)}</div>

          <h3 class="shortcuts-col-title shortcuts-col-title--spaced">Vista y Navegación</h3>
          <div class="shortcuts-list">${renderRows(VIEW_SHORTCUTS)}</div>
        </section>
      </div>

      <footer class="shortcuts-footer">
        <span><strong>Tip CAD:</strong> En cualquier plantilla 2D puedes hacer <em>clic directo</em> para medidas estándar o <em>arrastrar de esquina a esquina</em> con imán a muros y cuadrícula.</span>
      </footer>
    </div>
  `

  host.appendChild(backdrop)

  let opened = false

  function open(): void {
    opened = true
    backdrop.hidden = false
  }

  function close(): void {
    if (!opened) return
    opened = false
    backdrop.hidden = true
  }

  function toggle(): void {
    if (opened) close()
    else open()
  }

  backdrop.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === backdrop || target.closest('[data-action="close"]')) {
      close()
    }
  })

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!opened) return
    if (e.key === 'Escape' || e.key === '?' || e.key === '¿' || e.key.toLowerCase() === 'h') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  window.addEventListener('keydown', onKeyDown, true)

  return {
    open,
    close,
    toggle,
    isOpen: () => opened,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown, true)
      backdrop.remove()
    }
  }
}

