import { icon } from './icons'
import { showToast } from './Toast'
import {
  ACCENT_COLORS,
  BACKGROUND_THEMES,
  themeManager,
  type AccentColorId,
  type BackgroundThemeId,
  type WorkBgStyleId
} from '../services/ThemeManager'

export type SettingsTabId = 'general' | 'drawing' | 'ai' | 'shortcuts' | 'advanced'

export interface SettingsModalOptions {
  onResetLayout?: () => void
  isGridVisible?: () => boolean
  onToggleGrid?: () => void
  isSnapEnabled?: () => boolean
  onToggleSnap?: () => void
  isOrthoEnabled?: () => boolean
  onToggleOrtho?: () => void
  isAiAutoApplyEnabled?: () => boolean
  onToggleAiAutoApply?: () => void
}

export interface SettingsModalHandle {
  open: (initialTab?: SettingsTabId) => void
  close: () => void
}

/**
 * Renderiza un interruptor tipo Switch animado accesible con Tailwind CSS.
 */
function renderSwitch(id: string, active: boolean, label: string): string {
  return `
    <button
      type="button"
      role="switch"
      id="${id}"
      aria-checked="${active}"
      aria-label="${label}"
      class="settings-switch relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
        active ? 'bg-blue-600' : 'bg-slate-700'
      }"
    >
      <span
        aria-hidden="true"
        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          active ? 'translate-x-5' : 'translate-x-0'
        }"
      ></span>
    </button>
  `
}

function updateSwitchUi(btn: HTMLElement, isActive: boolean): void {
  btn.setAttribute('aria-checked', String(isActive))
  btn.className = `settings-switch relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
    isActive ? 'bg-blue-600' : 'bg-slate-700'
  }`
  const thumb = btn.querySelector('span')
  if (thumb) {
    thumb.className = `pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
      isActive ? 'translate-x-5' : 'translate-x-0'
    }`
  }
}

export function mountSettingsModal(options: SettingsModalOptions): SettingsModalHandle {
  let modalEl: HTMLElement | null = null
  let activeTab: SettingsTabId = 'general'

  // Estados locales para switches no cableados globalmente
  let antialiasingEnabled = true
  let shadowsEnabled = true
  let debugAiLogsEnabled = false

  function close(): void {
    if (!modalEl) return
    modalEl.classList.remove('is-open')
    window.removeEventListener('keydown', onKeyDown)
    setTimeout(() => {
      modalEl?.remove()
      modalEl = null
    }, 150)
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      close()
    }
  }

  function renderGeneralTab(): string {
    const cfg = themeManager.getConfig()
    const themeOptionsHtml = (Object.keys(BACKGROUND_THEMES) as BackgroundThemeId[])
      .map((id) => {
        const def = BACKGROUND_THEMES[id]
        return `<option value="${id}" ${cfg.themeId === id ? 'selected' : ''}>${def.name} (${def.subtitle})</option>`
      })
      .join('')
    const accentOptionsHtml = (Object.keys(ACCENT_COLORS) as AccentColorId[])
      .map((id) => {
        const def = ACCENT_COLORS[id]
        return `<option value="${id}" ${cfg.accentId === id ? 'selected' : ''}>${def.name}</option>`
      })
      .join('')

    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span class="text-blue-400">${icon('palette', 16)}</span>
            <span>General y Entorno</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Personaliza la apariencia gráfica, tema visual, estilo del lienzo 3D y localización.</p>
        </div>

        <!-- Tarjeta 1: Tema visual sincronizado globalmente -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Tema visual (Dashboard + Editor 3D)</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Sincroniza paneles flotantes, menús, chat de IA y escena WebGL 3D.</span>
          </div>
          <div class="shrink-0">
            <select id="pref-theme-select" class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer">
              ${themeOptionsHtml}
            </select>
          </div>
        </div>

        <!-- Tarjeta 1B: Color de acento y estilo de fondo 3D -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-slate-200 block">Color de Acento</span>
            <select id="pref-accent-select" class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer">
              ${accentOptionsHtml}
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-slate-200 block">Estilo de Fondo de Trabajo 3D</span>
            <select id="pref-workbg-select" class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer">
              <option value="grid" ${cfg.workBgStyle === 'grid' ? 'selected' : ''}>Retícula métrica (Grid)</option>
              <option value="dots" ${cfg.workBgStyle === 'dots' ? 'selected' : ''}>Matriz de puntos (Dots)</option>
              <option value="solid" ${cfg.workBgStyle === 'solid' ? 'selected' : ''}>Fondo sólido limpio</option>
            </select>
          </div>
        </div>

        <!-- Tarjeta 2: Idioma -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Idioma de la interfaz</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Traducción de herramientas, diálogos y comandos del software.</span>
          </div>
          <div class="shrink-0">
            <select class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer">
              <option value="es-ES" selected>Español (es-ES)</option>
              <option value="en-US">English (en-US)</option>
              <option value="fr-FR">Français (fr-FR)</option>
            </select>
          </div>
        </div>

        <!-- Tarjeta 3: Renderizado y Gráficos -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3.5">
          <span class="text-xs font-semibold text-slate-200 block">Renderizado Gráfico WebGL</span>

          <div class="flex items-center justify-between pt-1 border-t border-slate-700/40">
            <div>
              <span class="text-xs text-slate-300 font-medium block">Antialiasing suavizado (FXAA)</span>
              <span class="text-[11px] text-slate-400 block">Reduce los bordes dentados en geometrías curvas y muros 3D.</span>
            </div>
            ${renderSwitch('pref-antialiasing-toggle', antialiasingEnabled, 'Antialiasing')}
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-700/40">
            <div>
              <span class="text-xs text-slate-300 font-medium block">Sombras suaves en tiempo real</span>
              <span class="text-[11px] text-slate-400 block">Calcula mapas de sombra dinámicos bajo luz solar arquitectónica.</span>
            </div>
            ${renderSwitch('pref-shadows-toggle', shadowsEnabled, 'Sombras suaves')}
          </div>
        </div>
      </div>
    `
  }

  function renderDrawingTab(): string {
    const isGrid = options.isGridVisible?.() ?? true
    const isSnap = options.isSnapEnabled?.() ?? true
    const isOrtho = options.isOrthoEnabled?.() ?? false

    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span class="text-blue-400">${icon('grid', 16)}</span>
            <span>Ayudas de Dibujo 2D / 3D</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Controla la precisión magnética, rejilla de trabajo y restricciones ortogonales.</p>
        </div>

        <!-- Rejilla del lienzo -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Rejilla del lienzo métrico</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Muestra la cuadrícula de referencia métrica en el plano de trabajo XY/XZ.</span>
          </div>
          ${renderSwitch('pref-grid-toggle', isGrid, 'Rejilla')}
        </div>

        <!-- Enganche a rejilla (Snap) -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Enganche a rejilla (Snap magnético)</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Ajusta el cursor automáticamente a múltiplos de 0.25 m / 0.50 m.</span>
          </div>
          ${renderSwitch('pref-snap-toggle', isSnap, 'Snap magnético')}
        </div>

        <!-- Modo Ortogonal (Ortho) -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Modo Ortogonal (Ortho)</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Restringe el trazo de muros a ángulos rectos estrictos (0°, 90°, 180°, 270°).</span>
          </div>
          ${renderSwitch('pref-ortho-toggle', isOrtho, 'Modo Ortogonal')}
        </div>

        <!-- Selector de Unidades -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Unidades de acotación</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Unidades predeterminadas para longitudes, alturas y áreas.</span>
          </div>
          <div class="shrink-0">
            <select class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer">
              <option value="meters" selected>Sistema Métrico (Metros - m)</option>
              <option value="centimeters">Centímetros (cm)</option>
              <option value="imperial">Imperial (Pies / Pulgadas - ft/in)</option>
            </select>
          </div>
        </div>
      </div>
    `
  }

  function renderAiTab(): string {
    const isAiAuto = options.isAiAutoApplyEnabled?.() ?? false

    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span class="text-blue-400">${icon('sparkles', 16)}</span>
            <span>Asistente IA (Astro)</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Configura el comportamiento del copiloto arquitectónico impulsado por IA.</p>
        </div>

        <!-- Switch Aplicar sin confirmar -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Aplicar cambios sin confirmación previa</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">
              Ejecuta las órdenes del chat directamente en la escena. Desactivado: muestra una vista previa con Aplicar/Cancelar antes de tocar la escena.
            </span>
          </div>
          ${renderSwitch('pref-ai-autoapply-toggle', isAiAuto, 'Aplicar sin confirmar')}
        </div>

        <!-- Motor IA -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Motor de razonamiento</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Procesamiento del lenguaje natural e inferencia geométrica.</span>
          </div>
          <div class="shrink-0">
            <select class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer">
              <option value="gemini" selected>Gemini 2.5 Flash (Edge Cloud)</option>
              <option value="heuristic">Reglas Heurísticas (Offline)</option>
            </select>
          </div>
        </div>

        <!-- Depuración de logs -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Trazas de herramientas en consola</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Registra la llamada a funciones (\`place_wall\`, \`query_catalog\`) en Developer Tools.</span>
          </div>
          ${renderSwitch('pref-ai-debug-toggle', debugAiLogsEnabled, 'Depuración IA')}
        </div>
      </div>
    `
  }

  function renderShortcutsTab(): string {
    const shortcuts = [
      { key: 'Ctrl + K', desc: 'Paleta de comandos principal' },
      { key: 'Ctrl + S', desc: 'Guardar proyecto actual' },
      { key: 'Ctrl + B', desc: 'Barra de herramientas AEC' },
      { key: 'Ctrl + Shift + N', desc: 'Navegador del Proyecto' },
      { key: 'Ctrl + Shift + L', desc: 'Capas y Propiedades' },
      { key: 'Ctrl + Shift + I', desc: 'Chat de IA · Astro' },
      { key: 'Ctrl + K Z', desc: 'Modo concentración (solo lienzo)' },
      { key: 'Ctrl + Z / Y', desc: 'Deshacer / Rehacer acción' },
      { key: 'W / S / R', desc: 'Muro simple / Estructural / Cuarto' },
      { key: '2 / 3', desc: 'Vista 2D Planta / 3D Órbita' },
      { key: 'Supr', desc: 'Eliminar elemento seleccionado' },
      { key: 'Esc', desc: 'Cancelar / Herramienta selección' }
    ]

    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span class="text-blue-400">${icon('keyboard', 16)}</span>
            <span>Atajos de Teclado</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Combinaciones rápidas para agilizar el modelado 3D y navegación del espacio.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          ${shortcuts
            .map(
              (item) => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600/80 transition">
              <span class="text-xs text-slate-300 font-medium">${item.desc}</span>
              <kbd class="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-blue-400 font-semibold shadow-sm shrink-0 ml-2">
                ${item.key}
              </kbd>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
  }

  function renderAdvancedTab(): string {
    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span class="text-blue-400">${icon('rotateCcw', 16)}</span>
            <span>Restablecer & Avanzado</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Gestión de la disposición de interfaz, almacenamiento en caché y diagnóstico.</p>
        </div>

        <!-- Disposición de Paneles -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Restablecer interfaz de trabajo</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Vuelve a la disposición predeterminada de la barra de actividades, docks y paneles laterales.</span>
          </div>
          <button
            type="button"
            id="pref-reset-layout"
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer shrink-0"
          >
            Restablecer paneles
          </button>
        </div>

        <!-- Limpieza de Caché -->
        <div class="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold text-slate-200 block">Caché gráfica de texturas y mallas</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Libera memoria VRAM de texturas PBR y geometrías temporales sin alterar tus proyectos.</span>
          </div>
          <button
            type="button"
            id="pref-clear-cache"
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer shrink-0"
          >
            Vaciar caché
          </button>
        </div>

        <!-- Acerca de Open Form Studio -->
        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
          <div class="flex items-center gap-2 font-semibold text-slate-200">
            <span class="text-blue-400">${icon('cube', 16)}</span>
            <span>Open Form Studio</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">v0.1.0</span>
          </div>
          <p class="m-0 text-[11px] text-slate-400 leading-relaxed">
            Plataforma Profesional de Arquitectura & CAD Interactivo en 2D/3D.<br />
            Motor Three.js WebGL · Supabase Realtime Cloud & Base de Datos SQLite Local.
          </p>
        </div>
      </div>
    `
  }

  function renderContent(): void {
    if (!modalEl) return
    const contentEl = modalEl.querySelector<HTMLElement>('[data-settings-content]')
    if (!contentEl) return

    switch (activeTab) {
      case 'general':
        contentEl.innerHTML = renderGeneralTab()
        break
      case 'drawing':
        contentEl.innerHTML = renderDrawingTab()
        break
      case 'ai':
        contentEl.innerHTML = renderAiTab()
        break
      case 'shortcuts':
        contentEl.innerHTML = renderShortcutsTab()
        break
      case 'advanced':
        contentEl.innerHTML = renderAdvancedTab()
        break
    }

    // Actualizar botones del sidebar
    modalEl.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((btn) => {
      const isCurrent = btn.dataset.settingsTab === activeTab
      if (isCurrent) {
        btn.className =
          'settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition cursor-pointer bg-blue-600/15 text-blue-400 border-l-2 border-blue-500 shadow-sm'
      } else {
        btn.className =
          'settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent'
      }
    })

    wireTabEvents()
  }

  function wireTabEvents(): void {
    if (!modalEl) return

    // Selectores de Tema, Acento y Estilo de Fondo 3D
    const themeSel = modalEl.querySelector<HTMLSelectElement>('#pref-theme-select')
    themeSel?.addEventListener('change', () => {
      themeManager.setTheme(themeSel.value as BackgroundThemeId)
    })

    const accentSel = modalEl.querySelector<HTMLSelectElement>('#pref-accent-select')
    accentSel?.addEventListener('change', () => {
      themeManager.setAccent(accentSel.value as AccentColorId)
    })

    const workBgSel = modalEl.querySelector<HTMLSelectElement>('#pref-workbg-select')
    workBgSel?.addEventListener('change', () => {
      themeManager.setWorkBgStyle(workBgSel.value as WorkBgStyleId)
    })

    // Switch de Rejilla
    const gridBtn = modalEl.querySelector<HTMLButtonElement>('#pref-grid-toggle')
    gridBtn?.addEventListener('click', () => {
      options.onToggleGrid?.()
      const nextState = options.isGridVisible?.() ?? true
      updateSwitchUi(gridBtn, nextState)
    })

    // Switch de Snap
    const snapBtn = modalEl.querySelector<HTMLButtonElement>('#pref-snap-toggle')
    snapBtn?.addEventListener('click', () => {
      options.onToggleSnap?.()
      const nextState = options.isSnapEnabled?.() ?? true
      updateSwitchUi(snapBtn, nextState)
    })

    // Switch de Ortho
    const orthoBtn = modalEl.querySelector<HTMLButtonElement>('#pref-ortho-toggle')
    orthoBtn?.addEventListener('click', () => {
      options.onToggleOrtho?.()
      const nextState = options.isOrthoEnabled?.() ?? false
      updateSwitchUi(orthoBtn, nextState)
    })

    // Switch de IA AutoApply
    const aiAutoBtn = modalEl.querySelector<HTMLButtonElement>('#pref-ai-autoapply-toggle')
    aiAutoBtn?.addEventListener('click', () => {
      options.onToggleAiAutoApply?.()
      const nextState = options.isAiAutoApplyEnabled?.() ?? false
      updateSwitchUi(aiAutoBtn, nextState)
    })

    // Switches locales (Antialiasing, Shadows, Debug)
    const aaBtn = modalEl.querySelector<HTMLButtonElement>('#pref-antialiasing-toggle')
    aaBtn?.addEventListener('click', () => {
      antialiasingEnabled = !antialiasingEnabled
      updateSwitchUi(aaBtn, antialiasingEnabled)
    })

    const shadowsBtn = modalEl.querySelector<HTMLButtonElement>('#pref-shadows-toggle')
    shadowsBtn?.addEventListener('click', () => {
      shadowsEnabled = !shadowsEnabled
      updateSwitchUi(shadowsBtn, shadowsEnabled)
    })

    const aiDebugBtn = modalEl.querySelector<HTMLButtonElement>('#pref-ai-debug-toggle')
    aiDebugBtn?.addEventListener('click', () => {
      debugAiLogsEnabled = !debugAiLogsEnabled
      updateSwitchUi(aiDebugBtn, debugAiLogsEnabled)
    })

    // Reset layout
    modalEl.querySelector('#pref-reset-layout')?.addEventListener('click', () => {
      options.onResetLayout?.()
      showToast({
        title: 'Interfaz restablecida',
        subtitle: 'La disposición de paneles y barras volvió a los valores iniciales.',
        type: 'info'
      })
      close()
    })

    // Clear cache
    modalEl.querySelector('#pref-clear-cache')?.addEventListener('click', () => {
      showToast({
        title: 'Caché vaciada',
        subtitle: 'Se liberó la memoria de texturas y geometrías temporales.',
        type: 'success'
      })
    })
  }

  function open(initialTab?: SettingsTabId): void {
    if (modalEl) return
    if (initialTab) activeTab = initialTab

    modalEl = document.createElement('div')
    modalEl.className = 'settings-modal fixed inset-0 z-[1000] flex items-center justify-center p-4'
    modalEl.innerHTML = `
      <div class="settings-modal__backdrop absolute inset-0 bg-slate-950/80 backdrop-blur-sm" data-settings-close></div>
      <div class="settings-modal__dialog relative max-w-4xl w-full h-[620px] max-h-[90vh] bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl" role="dialog" aria-modal="true" aria-label="Preferencias de Open Form Studio">
        
        <!-- Header del Modal -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              ${icon('settings', 18)}
            </div>
            <div>
              <h2 class="text-sm font-semibold text-slate-100 m-0">Preferencias de Open Form Studio</h2>
              <p class="text-[11px] text-slate-400 m-0">Configura el entorno de modelado, motor gráfico, asistencias y accesos rápidos</p>
            </div>
          </div>
          <button class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer" data-settings-close title="Cerrar (Esc)">
            ${icon('close', 16)}
          </button>
        </header>

        <!-- Cuerpo en 2 Columnas -->
        <div class="flex-1 flex min-h-0 overflow-hidden">
          <!-- Sidebar Izquierdo (w-56) -->
          <nav class="w-56 shrink-0 border-r border-slate-800 bg-slate-950/40 p-3 flex flex-col justify-between" role="tablist">
            <div class="space-y-1">
              <button
                type="button"
                role="tab"
                class="settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition cursor-pointer bg-blue-600/15 text-blue-400 border-l-2 border-blue-500 shadow-sm"
                data-settings-tab="general"
              >
                ${icon('palette', 16)}
                <span>General y Entorno</span>
              </button>

              <button
                type="button"
                role="tab"
                class="settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent"
                data-settings-tab="drawing"
              >
                ${icon('grid', 16)}
                <span>Ayudas de Dibujo</span>
              </button>

              <button
                type="button"
                role="tab"
                class="settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent"
                data-settings-tab="ai"
              >
                ${icon('sparkles', 16)}
                <span>Asistente IA (Astro)</span>
              </button>

              <button
                type="button"
                role="tab"
                class="settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent"
                data-settings-tab="shortcuts"
              >
                ${icon('keyboard', 16)}
                <span>Atajos de Teclado</span>
              </button>

              <button
                type="button"
                role="tab"
                class="settings-nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent"
                data-settings-tab="advanced"
              >
                ${icon('rotateCcw', 16)}
                <span>Restablecer & Avanzado</span>
              </button>
            </div>

            <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-[11px] text-slate-500">
              <div class="font-semibold text-slate-400">Open Form Studio</div>
              <div>v0.1.0 · Motor WebGL 3D</div>
            </div>
          </nav>

          <!-- Área de Contenido Derecha (flex-1 p-6 overflow-y-auto) -->
          <main class="flex-1 p-6 overflow-y-auto space-y-4 min-h-0 bg-slate-900/30" data-settings-content>
            <!-- Contenido dinámico -->
          </main>
        </div>

        <!-- Pie del Modal Fijo -->
        <footer class="border-t border-slate-800 bg-slate-900/90 px-6 py-3.5 flex items-center justify-between shrink-0">
          <button
            type="button"
            id="pref-reset-defaults"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            title="Restaura los valores por defecto de la aplicación"
          >
            ${icon('rotateCcw', 14)}
            <span>Restablecer por defecto</span>
          </button>

          <div class="flex items-center gap-2.5">
            <button
              type="button"
              class="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition cursor-pointer border border-slate-700/60"
              data-settings-close
            >
              Cancelar
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition cursor-pointer shadow-lg shadow-blue-500/20"
              data-settings-save
            >
              ${icon('check', 14)}
              <span>Aceptar / Guardar cambios</span>
            </button>
          </div>
        </footer>
      </div>
    `

    document.body.appendChild(modalEl)

    // Renderizar pestaña inicial
    renderContent()

    // Listeners de cambio de tab
    modalEl.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.settingsTab as SettingsTabId
        if (tab && tab !== activeTab) {
          activeTab = tab
          renderContent()
        }
      })
    })

    // Listeners de cierre y guardado
    modalEl.querySelectorAll('[data-settings-close]').forEach((el) => {
      el.addEventListener('click', close)
    })

    modalEl.querySelector('[data-settings-save]')?.addEventListener('click', () => {
      showToast({
        title: 'Preferencias guardadas',
        subtitle: 'La configuración de Open Form Studio se aplicó correctamente.',
        type: 'success'
      })
      close()
    })

    modalEl.querySelector('#pref-reset-defaults')?.addEventListener('click', () => {
      themeManager.resetToDefaults()
      // Restablecer valores de dibujo si están desactivados
      if (!(options.isGridVisible?.() ?? true)) options.onToggleGrid?.()
      if (!(options.isSnapEnabled?.() ?? true)) options.onToggleSnap?.()
      if (options.isOrthoEnabled?.() ?? false) options.onToggleOrtho?.()
      if (options.isAiAutoApplyEnabled?.() ?? false) options.onToggleAiAutoApply?.()
      antialiasingEnabled = true
      shadowsEnabled = true
      debugAiLogsEnabled = false

      renderContent()
      showToast({
        title: 'Valores restablecidos',
        subtitle: 'Se han reestablecido todas las preferencias por defecto.',
        type: 'info'
      })
    })

    requestAnimationFrame(() => {
      modalEl?.classList.add('is-open')
      window.addEventListener('keydown', onKeyDown)
    })
  }

  return { open, close }
}
