import { icon } from './icons'
import { getActionMeta } from '../actions/ActionRegistry'
import { t } from '../i18n/es'

/**
 * Barra de menú superior más la fila de iconos de acceso rápido.
 *
 * Tanto los menús como la fila de iconos se dibujan a partir del **registro
 * central de acciones** (`actions/ActionRegistry`): aquí solo se declara la
 * *estructura* (qué acciones aparecen y en qué grupo) y el catálogo aporta la
 * etiqueta, el icono y el atajo. Cada entrada emite un `actionId` que el
 * workspace traduce a través del mismo `ActionRegistry.run()`.
 *
 * Regla de la Fase 1: la fila rápida NO repite lo que ya vive en el toolbox
 * (zoom, mover, copiar, recortar, borrar) ni «Añadir elemento».
 *
 * Regla del Bloque 2 (punto D): Guardar, Deshacer y Rehacer viven SOLO en la
 * fila rápida (quickbar). No se repeten como botones de menú ni dentro del
 * desplegable de Archivo (los atajos Ctrl+S / Ctrl+Z / Ctrl+Y siguen activos).
 */

interface MenuDefinition {
  label: string
  /** Si se define, el título del menú es una acción directa (Guardar, Deshacer…). */
  action?: string
  /** Acciones del desplegable, por id del catálogo. */
  items?: string[]
}

const MENU_LAYOUT: MenuDefinition[] = [
  {
    label: t('menu.file'),
    items: [
      'file.dashboard',
      'file.new',
      'file.open',
      'file.save',
      'file.import',
      'file.print',
      'file.export',
      'file.clear',
      'file.exit'
    ]
  },
  {
    label: t('menu.drawing'),
    items: [
      'tool.SimpleWall',
      'tool.StructuralSegment',
      'tool.RoomWalls',
      'tool.roof',
      'tool.slab',
      'tool.door',
      'tool.window',
      'tool.stairs',
      'tool.add',
      'level.add',
      'level.next'
    ]
  },
  {
    label: t('menu.aec'),
    items: ['aec.testHouse', 'aec.space', 'aec.curtain', 'aec.core', 'aec.quantity', 'aec.levels']
  },
  {
    label: t('menu.notas'),
    items: ['notas.note', 'notas.leader', 'notas.revision', 'notas.table', 'annot.text', 'annot.dimension', 'annot.tag', 'annot.highlight']
  },
  {
    label: t('menu.view'),
    items: [
      'view.toggleToolbox',
      'view.toggleLayers',
      'view.toggleNavigator',
      'view.toggleCosts',
      'view.toggleChat',
      'view.toggleTimeline',
      'view.focusMode',
      'view.resetLayout'
    ]
  },
  {
    label: t('menu.aux'),
    items: ['aux.2d', 'aux.3d', 'aux.fit', 'aux.reset', 'aux.top', 'aux.front', 'aux.right', 'aux.zoomIn', 'aux.zoomOut']
  },
  {
    label: t('menu.aids'),
    items: ['aids.grid', 'aids.snap', 'aids.ortho', 'aids.polar', 'aids.layers']
  }
]

/**
 * Fila de iconos de acceso rápido. Solo acciones de archivo/edición y
 * herramientas que NO están en el toolbox (Fase 1: sin duplicados).
 */
const QUICK_ACTIONS: ReadonlyArray<string | 'separator'> = [
  'file.open',
  'file.save',
  'file.print',
  'separator',
  'edit.undo',
  'edit.redo',
  'separator',
  'tool.pencil',
  'tool.highlighter',
  'tool.pen',
  'tool.eraser',
  'separator',
  'tool.roof',
  'separator',
  'tool.ruler',
  'tool.hand',
  'tool.crosshair',
  'view.orbit',
  'separator',
  'aux.fit'
]

export interface MenuBarOptions {
  /** Recibe el identificador de la acción elegida (p. ej. `file.save`, `edit.undo`). */
  onAction: (actionId: string) => void
  /** Called when the play button is clicked */
  onPlay?: () => void
  /** Called when the pause button is clicked */
  onPause?: () => void
  /** Called when the stop button is clicked */
  onStop?: () => void
  /** Called when the animate button is clicked */
  onAnimar?: () => void
  /** Called when the record video button is clicked */
  onToggleRecord?: () => void
}

export interface MenuBarHandle {
  /** Habilita/deshabilita Undo y Redo según el estado del historial. */
  setHistoryState(canUndo: boolean, canRedo: boolean): void
  /** Marca visualmente la herramienta activa en la fila de acceso rápido. */
  setActiveTool(actionId: string | null): void
  /** Marca/desmarca la palomita de las entradas con estado (menú «Ver»). */
  setChecks(checks: Readonly<Record<string, boolean>>): void
  /** Marca visualmente el estado activo del botón «Animar». */
  setAnimarActive(active: boolean): void
  /** Actualiza el estado habilitado/activo de los botones Play, Pausa y Detener. */
  setPlaybackState(state: 'stopped' | 'playing' | 'paused'): void
  /** Actualiza el estado de grabación de video (inactivo / grabando + cronómetro 00:00). */
  setRecordingState(isRecording: boolean, formattedTime?: string): void
}

function renderMenuItem(actionId: string): string {
  const meta = getActionMeta(actionId)
  if (!meta) return ''
  return `<button class="menu__item${meta.separatorBefore ? ' menu__item--sep' : ''}"
                  role="menuitem" data-menu-action="${meta.id}">
      <span class="menu__item-check" aria-hidden="true">✓</span>
      <span class="menu__item-icon">${icon(meta.icon, 15)}</span>
      <span class="menu__item-label">${meta.label}</span>
      ${meta.defaultShortcut ? `<span class="menu__item-shortcut">${meta.defaultShortcut}</span>` : ''}
    </button>`
}

function renderMenu(menu: MenuDefinition, index: number): string {
  if (menu.action) {
    return `<button class="menu__trigger menu__trigger--action" data-menu-action="${menu.action}">${menu.label}</button>`
  }

  return `<div class="menu" data-menu-index="${index}">
      <button class="menu__trigger" aria-haspopup="true" aria-expanded="false">${menu.label}</button>
      <div class="menu__dropdown" role="menu">
        ${(menu.items ?? []).map(renderMenuItem).join('')}
      </div>
    </div>`
}

function renderQuickAction(entry: string | 'separator'): string {
  if (entry === 'separator') return '<span class="quickbar__sep"></span>'
  const meta = getActionMeta(entry)
  if (!meta) return ''
  const title = meta.defaultShortcut ? `${meta.label} (${meta.defaultShortcut})` : meta.label
  return `<button class="quick-btn" data-menu-action="${meta.id}" title="${title}">${icon(meta.icon, 16)}</button>`
}

export function mountMenuBar(container: HTMLElement, options: MenuBarOptions): MenuBarHandle {
  container.innerHTML = `
    <nav class="menubar" role="menubar">
      ${MENU_LAYOUT.map(renderMenu).join('')}
    </nav>
    <div class="quickbar" role="toolbar" aria-label="${t('menu.quickbar')}">
      <div class="quickbar__actions">
        ${QUICK_ACTIONS.map(renderQuickAction).join('')}
      </div>
      <div class="quickbar__spacer"></div>
      <div class="quickbar__playback">
        <span class="quickbar__sep"></span>
        <button class="playback-btn playback-btn--play" data-playback="play" title="Reproducir (Espacio)">${icon('play', 15)}</button>
        <button class="playback-btn playback-btn--pause" data-playback="pause" title="Pausar (Espacio)">${icon('pause', 15)}</button>
        <button class="playback-btn playback-btn--stop" data-playback="stop" title="Detener (Esc)">${icon('stop', 15)}</button>
        <button class="playback-btn playback-btn--record" data-playback="record" aria-pressed="false" title="Grabar recorrido / animación">${icon('circleDot', 15)}</button>
        <div class="playback-rec-status is-hidden" data-rec-status aria-live="polite">
          <span class="playback-rec-dot-wrap" aria-hidden="true">
            <span class="playback-rec-dot-ping"></span>
            <span class="playback-rec-dot"></span>
          </span>
          <span class="playback-rec-label">REC</span>
          <span class="playback-rec-timer" data-rec-timer>00:00</span>
        </div>
        <button class="playback-btn playback-btn--animar" data-action="animar" aria-pressed="false" title="Modo Animar (Ctrl+Shift+T)">${icon('clock', 15)}</button>
      </div>
    </div>
  `

  const menus = [...container.querySelectorAll<HTMLDivElement>('.menu')]

  const closeAll = (): void => {
    menus.forEach((menu) => {
      menu.classList.remove('is-open')
      menu.querySelector('.menu__trigger')?.setAttribute('aria-expanded', 'false')
    })
  }

  const openMenu = (menu: HTMLDivElement): void => {
    closeAll()
    menu.classList.add('is-open')
    menu.querySelector('.menu__trigger')?.setAttribute('aria-expanded', 'true')
  }

  menus.forEach((menu) => {
    const trigger = menu.querySelector<HTMLButtonElement>('.menu__trigger')
    trigger?.addEventListener('click', (event) => {
      event.stopPropagation()
      if (menu.classList.contains('is-open')) closeAll()
      else openMenu(menu)
    })
    // Con un menú abierto, pasar por encima de otro lo cambia (comportamiento de escritorio).
    menu.addEventListener('mouseenter', () => {
      if (menus.some((m) => m.classList.contains('is-open'))) openMenu(menu)
    })
  })

  container.querySelectorAll<HTMLElement>('[data-menu-action]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation()
      const action = el.dataset.menuAction
      if (!action) return
      closeAll()
      options.onAction(action)
    })
  })

  container.querySelectorAll<HTMLButtonElement>('[data-playback]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation()
      if (btn.disabled) return
      const action = btn.dataset.playback
      if (action === 'play') {
        if (options.onPlay) options.onPlay()
      } else if (action === 'pause') {
        if (options.onPause) options.onPause()
      } else if (action === 'stop') {
        if (options.onStop) options.onStop()
      } else if (action === 'record') {
        if (options.onToggleRecord) options.onToggleRecord()
      }
    })
  })

  // Botón Animar - modo animación 3D (con icono distinto a Play y estado activo visible)
  container.querySelectorAll<HTMLButtonElement>('[data-action="animar"]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation()
      options.onAnimar?.()
    })
  })

  document.addEventListener('click', closeAll)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll()
  })

  const setActionEnabled = (action: string, enabled: boolean): void => {
    container.querySelectorAll<HTMLButtonElement>(`[data-menu-action="${action}"]`).forEach((el) => {
      el.disabled = !enabled
      el.classList.toggle('is-disabled', !enabled)
    })
  }

  return {
    setHistoryState(canUndo: boolean, canRedo: boolean): void {
      setActionEnabled('edit.undo', canUndo)
      setActionEnabled('edit.redo', canRedo)
    },
    setActiveTool(actionId: string | null): void {
      container.querySelectorAll<HTMLButtonElement>('.quick-btn').forEach((btn) => {
        btn.classList.toggle('is-active', actionId !== null && btn.dataset.menuAction === actionId)
      })
    },
    setChecks(checks: Readonly<Record<string, boolean>>): void {
      for (const [actionId, checked] of Object.entries(checks)) {
        container
          .querySelectorAll<HTMLElement>(`[data-menu-action="${actionId}"]`)
          .forEach((item) => item.classList.toggle('is-checked', checked))
      }
    },
    setAnimarActive(active: boolean): void {
      container.querySelectorAll<HTMLButtonElement>('[data-action="animar"]').forEach((btn) => {
        btn.classList.toggle('is-active', active)
        btn.setAttribute('aria-pressed', active ? 'true' : 'false')
      })
    },
    setPlaybackState(state: 'stopped' | 'playing' | 'paused'): void {
      const playBtn = container.querySelector<HTMLButtonElement>('[data-playback="play"]')
      const pauseBtn = container.querySelector<HTMLButtonElement>('[data-playback="pause"]')
      const stopBtn = container.querySelector<HTMLButtonElement>('[data-playback="stop"]')
      if (playBtn) {
        const canPlay = state !== 'playing'
        playBtn.disabled = !canPlay
        playBtn.classList.toggle('is-disabled', !canPlay)
        playBtn.classList.toggle('is-active', state === 'playing')
      }
      if (pauseBtn) {
        const canPause = state === 'playing'
        pauseBtn.disabled = !canPause
        pauseBtn.classList.toggle('is-disabled', !canPause)
        pauseBtn.classList.toggle('is-active', state === 'paused')
      }
      if (stopBtn) {
        const canStop = state !== 'stopped'
        stopBtn.disabled = !canStop
        stopBtn.classList.toggle('is-disabled', !canStop)
      }
    },
    setRecordingState(isRecording: boolean, formattedTime = '00:00'): void {
      const recordBtn = container.querySelector<HTMLButtonElement>('[data-playback="record"]')
      const recStatus = container.querySelector<HTMLElement>('[data-rec-status]')
      const recTimer = container.querySelector<HTMLElement>('[data-rec-timer]')
      if (recordBtn) {
        recordBtn.classList.toggle('is-recording', isRecording)
        recordBtn.setAttribute('aria-pressed', isRecording ? 'true' : 'false')
        recordBtn.title = isRecording
          ? 'Detener grabación y exportar video (.webm)'
          : 'Grabar recorrido / animación'
        recordBtn.innerHTML = isRecording ? icon('stop', 14) : icon('circleDot', 15)
      }
      if (recStatus) {
        recStatus.classList.toggle('is-hidden', !isRecording)
      }
      if (recTimer) {
        recTimer.textContent = formattedTime
      }
    }
  }
}
