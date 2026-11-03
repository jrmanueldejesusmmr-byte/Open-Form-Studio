import { icon } from './icons'

/**
 * Sello de hora de compilación inyectado por Vite (`define` en
 * `electron.vite.config.ts`). Es una sustitución textual en el bundle, por eso
 * se declara aquí para que el tipado la conozca.
 */
declare const __BUILD_TIME__: string | undefined

/**
 * Barra de estado inferior: contexto de la app a la izquierda (mensajes de la
 * última acción, herramienta activa, modo de vista y planta actual) y los
 * indicadores del sistema con reloj/fecha en vivo a la derecha.
 */
export interface StatusBarHandle {
  setMessage: (text: string) => void
  setTool: (name: string) => void
  setViewMode: (mode: '2d' | '3d') => void
  /**
   * Refleja el piso activo en la barra: selector con todos los pisos y texto
   * «· Elev. X m» (junto al nombre del selector forma «Piso 1 · Elev. 2.80 m»).
   */
  setLevels: (
    levels: ReadonlyArray<{ id: string; name: string; elevation: number }>,
    activeId: string,
    onChange: (id: string) => void
  ) => void
  /** Motor de datos activo («Nube · Supabase», «Local · SQLite»…). */
  setDatabase: (text: string) => void
}

export function mountStatusBar(container: HTMLElement, appName: string): StatusBarHandle {
  container.innerHTML = `
    <div class="statusbar__seg statusbar__seg--app">${icon('monitor', 13)}<span>${appName}</span></div>
    <div class="statusbar__seg statusbar__seg--message" id="status-message">Listo</div>
    <div class="statusbar__seg"><span class="statusbar__label">Herramienta:</span><span id="status-tool">Muro simple</span></div>
    <div class="statusbar__seg"><span class="statusbar__label">Vista:</span><span id="status-view">3D</span></div>
    <div class="statusbar__seg statusbar__seg--level"><span class="statusbar__label">Planta:</span><select id="status-level" class="statusbar__select" title="Piso activo (cambia de piso)"></select><span id="status-level-elev">· Elev. 0.00 m</span></div>
    <div class="statusbar__seg"><span class="statusbar__label">Datos:</span><span id="status-db">—</span></div>
    <div class="statusbar__seg statusbar__seg--build" title="Sello de hora de compilación (Vite)"><span class="statusbar__label">Build:</span><span id="status-build">—</span></div>
    <div class="statusbar__spacer"></div>
    <div class="statusbar__seg statusbar__seg--icons">
      ${icon('plug', 13)}${icon('wifi', 13)}${icon('volume', 13)}${icon('battery', 13)}
    </div>
    <div class="statusbar__seg statusbar__seg--clock">${icon('clock', 13)}<span id="status-time">--:--</span></div>
    <div class="statusbar__seg statusbar__seg--date"><span id="status-date">--/--/----</span></div>
  `

  const messageEl = container.querySelector<HTMLSpanElement>('#status-message')!
  const toolEl = container.querySelector<HTMLSpanElement>('#status-tool')!
  const viewEl = container.querySelector<HTMLSpanElement>('#status-view')!
  const levelSelectEl = container.querySelector<HTMLSelectElement>('#status-level')!
  const levelElevEl = container.querySelector<HTMLSpanElement>('#status-level-elev')!
  const dbEl = container.querySelector<HTMLSpanElement>('#status-db')!
  const buildEl = container.querySelector<HTMLSpanElement>('#status-build')!
  const timeEl = container.querySelector<HTMLSpanElement>('#status-time')!
  const dateEl = container.querySelector<HTMLSpanElement>('#status-date')!

  /** Callback del selector de pisos (lo fija `setLevels` en cada repintado). */
  let onLevelChange: ((id: string) => void) | null = null
  levelSelectEl.addEventListener('change', () => {
    onLevelChange?.(levelSelectEl.value)
  })

  let clockTimer = 0

  const paintClock = (): void => {
    // Verificación de estado: si la barra de estado ya no está montada en el
    // documento, el temporizador se autodestruye en vez de seguir reejecutándose
    // indefinidamente sobre nodos huérfanos.
    if (!timeEl.isConnected) {
      window.clearInterval(clockTimer)
      clockTimer = 0
      return
    }

    const now = new Date()
    timeEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    dateEl.textContent = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  paintClock()
  clockTimer = window.setInterval(paintClock, 15_000)

  // Sello de compilación («build YYYY-MM-DD HH:MM») inyectado por Vite. Si la
  // constante no está definida (p. ej. ejecución sin build), se muestra «dev».
  if (buildEl) {
    const pad = (n: number): string => String(n).padStart(2, '0')
    if (typeof __BUILD_TIME__ !== 'undefined' && __BUILD_TIME__) {
      const d = new Date(__BUILD_TIME__)
      const stamp = Number.isNaN(d.getTime())
        ? __BUILD_TIME__
        : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      buildEl.textContent = stamp
    } else {
      buildEl.textContent = 'dev'
    }
  }

  return {
    setMessage(text: string): void {
      messageEl.textContent = text
    },
    setTool(name: string): void {
      toolEl.textContent = name
    },
    setViewMode(mode: '2d' | '3d'): void {
      viewEl.textContent = mode === '2d' ? '2D (planta)' : '3D'
    },
    setLevels(levels, activeId, onChange): void {
      onLevelChange = onChange
      // Escape defensivo: el nombre del piso lo escribe el usuario.
      const escape = (text: string): string =>
        text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      levelSelectEl.innerHTML = levels
        .map(
          (level) =>
            `<option value="${escape(level.id)}"${level.id === activeId ? ' selected' : ''}>${escape(level.name)}</option>`
        )
        .join('')
      const active = levels.find((level) => level.id === activeId) ?? levels[0]
      levelElevEl.textContent = active ? `· Elev. ${active.elevation.toFixed(2)} m` : ''
    },
    setDatabase(text: string): void {
      dbEl.textContent = text
    }
  }
}
