import type { CameraState } from '../models/CameraState'

/**
 * Panel de depuración de la navegación del visor (tecla **F9**, oculto por
 * defecto). Muestra en vivo, sin necesidad de DevTools:
 *
 *  - El último evento recibido en `window` (fase de captura): tipo, `button`,
 *    `buttons`, `pointerType`, modificadores, `target` y si fue `preventDefault`.
 *  - Si `ViewportInteractions` aceptó o rechazó el gesto, y el motivo.
 *  - El estado de la cámara: `yaw`, `pitch`, `distance`, `target` y un contador
 *    de llamadas a `orbit()`.
 *  - El modo de vista (2D/3D) y la herramienta activa.
 *
 * Es una herramienta de desarrollo: no interviene en los eventos (solo los
 * observa en captura) y se puede cerrar con F9 o su botón.
 */

export interface DebugPanelOptions {
  /** Contenedor del visor (normalmente `#viewport-container`). */
  container: HTMLElement
  /** Devuelve el contador actual de llamadas a `orbit()`. */
  getOrbitCount: () => number
}

export interface DebugPanelHandle {
  toggle(): void
  open(): void
  close(): void
  isOpen(): boolean
  /** Registra el último evento de `window` observado en captura. */
  logEvent(e: Event): void
  /** Registra si el gesto de cámara fue aceptado y por qué. */
  logGesture(accepted: boolean, reason: string): void
  /** Refleja el estado de cámara, modo de vista y herramienta. */
  updateCamera(state: CameraState, viewMode: string, tool: string): void
}

/** Eventos de `window` que el panel observa en fase de captura. */
const TRACKED: ReadonlyArray<keyof WindowEventMap> = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'contextmenu',
  'wheel',
  'keydown'
]

function describeTarget(e: Event): string {
  const el = e.target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return '?'
  if (el.id) return `#${el.id}`
  const cn = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''
  return cn ? `.${cn}` : el.tagName.toLowerCase()
}

function describeEvent(e: Event): string {
  const pe = e as PointerEvent
  const we = e as WheelEvent
  const ke = e as KeyboardEvent
  const parts: string[] = [e.type]

  if ('button' in pe) parts.push(`button=${pe.button}`, `buttons=${pe.buttons}`)
  if ('pointerType' in pe) parts.push(pe.pointerType)
  if (typeof we.deltaY === 'number') parts.push(`deltaY=${Math.round(we.deltaY)}`)
  if (typeof ke.key === 'string') parts.push(`key=${ke.key}`)

  const mods: string[] = []
  const anyEv = e as unknown as { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }
  if (anyEv.ctrlKey) mods.push('Ctrl')
  if (anyEv.altKey) mods.push('Alt')
  if (anyEv.shiftKey) mods.push('Shift')
  if (anyEv.metaKey) mods.push('Meta')
  if (mods.length) parts.push(mods.join('+'))

  parts.push(`target=${describeTarget(e)}`, `prevented=${e.defaultPrevented}`)
  return parts.join(' · ')
}

export function mountDebugPanel(options: DebugPanelOptions): DebugPanelHandle {
  const root = document.createElement('div')
  root.id = 'debug-panel'
  root.className = 'debug-panel is-hidden'
  root.innerHTML = `
    <div class="debug-panel__head">
      <span>Depuración de navegación</span>
      <button class="debug-panel__close" type="button" title="Cerrar (F9)">✕</button>
    </div>
    <div class="debug-panel__row"><b>Evento:</b> <span data-dp="event">—</span></div>
    <div class="debug-panel__row"><b>Gesto:</b> <span data-dp="gesture">—</span></div>
    <div class="debug-panel__row"><b>Vista:</b> <span data-dp="view">—</span> · <b>Tool:</b> <span data-dp="tool">—</span></div>
    <div class="debug-panel__row"><b>yaw/pitch:</b> <span data-dp="angles">—</span></div>
    <div class="debug-panel__row"><b>dist/target:</b> <span data-dp="dist">—</span></div>
    <div class="debug-panel__row"><b>orbit():</b> <span data-dp="orbit">0</span></div>
  `
  options.container.appendChild(root)

  const eventEl = root.querySelector<HTMLElement>('[data-dp="event"]')!
  const gestureEl = root.querySelector<HTMLElement>('[data-dp="gesture"]')!
  const viewEl = root.querySelector<HTMLElement>('[data-dp="view"]')!
  const toolEl = root.querySelector<HTMLElement>('[data-dp="tool"]')!
  const anglesEl = root.querySelector<HTMLElement>('[data-dp="angles"]')!
  const distEl = root.querySelector<HTMLElement>('[data-dp="dist"]')!
  const orbitEl = root.querySelector<HTMLElement>('[data-dp="orbit"]')!

  const closeBtn = root.querySelector<HTMLButtonElement>('.debug-panel__close')!
  let open = false

  const setOpen = (next: boolean): void => {
    open = next
    root.classList.toggle('is-hidden', !next)
  }

  closeBtn.addEventListener('click', () => setOpen(false))

  // Observadores en fase de captura: solo leen, nunca modifican el evento.
  const capture = (e: Event): void => {
    if (!open) return
    eventEl.textContent = describeEvent(e)
    if (e.type === 'pointerdown' || e.type === 'contextmenu') {
      gestureEl.textContent = '—'
    }
  }
  for (const type of TRACKED) window.addEventListener(type, capture, true)

  return {
    toggle(): void {
      setOpen(!open)
    },
    open(): void {
      setOpen(true)
    },
    close(): void {
      setOpen(false)
    },
    isOpen(): boolean {
      return open
    },
    logEvent(e: Event): void {
      if (open) eventEl.textContent = describeEvent(e)
    },
    logGesture(accepted: boolean, reason: string): void {
      if (!open) return
      gestureEl.textContent = `${accepted ? 'ACEPTADO' : 'RECHAZADO'} · ${reason}`
      gestureEl.dataset.state = accepted ? 'ok' : 'no'
    },
    updateCamera(state: CameraState, viewMode: string, tool: string): void {
      if (!open) return
      viewEl.textContent = viewMode
      toolEl.textContent = tool
      anglesEl.textContent = `${state.yaw.toFixed(2)} / ${state.pitch.toFixed(2)}`
      distEl.textContent = `${state.distance.toFixed(2)} · (${state.target.x.toFixed(1)}, ${state.target.y.toFixed(1)}, ${state.target.z.toFixed(1)})`
      orbitEl.textContent = String(options.getOrbitCount())
    }
  }
}

