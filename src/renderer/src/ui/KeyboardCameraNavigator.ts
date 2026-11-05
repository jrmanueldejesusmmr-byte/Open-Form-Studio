import type { Viewport3DController } from '../engine/Viewport3DController'
import type { ViewMode } from '../engine/ViewportRenderer'

export type NavChannel = 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut'

export interface KeyboardCameraNavigatorOptions {
  controller: Viewport3DController
  getViewMode: () => ViewMode
  /** Devuelve `true` si el foco está en un `<input>`, chat de IA, modal abierto o fuera del editor. */
  isBlocked: () => boolean
  /** Sincroniza cámaras 2D/3D, gizmos y HUD tras actualizar `CameraState`. */
  onFrame: () => void
  /** Opcional: permite inyectar reloj y `rAF` deterministas en tests unitarios. */
  now?: () => number
  requestFrame?: (cb: (timestamp: number) => void) => number
  cancelFrame?: (id: number) => void
  /** Si se pasa `false`, no registra listeners globales automáticamente (útil en tests). */
  autoBindWindow?: boolean
}

export interface KeyboardCameraNavigatorHandle {
  handleKeyDown(event: KeyboardEvent): boolean
  handleKeyUp(event: KeyboardEvent): void
  step(dtSeconds: number): boolean
  clear(): void
  isNavigating(): boolean
  dispose(): void
}

const ORBIT_YAW_SPEED = 1.85 // rad/s (rotación horizontal azimutal en 3D)
const ORBIT_PITCH_SPEED = 1.35 // rad/s (inclinación polar vertical en 3D)
const PAN_3D_SPEED = 0.85 // fracción de `distance` por segundo con Shift+Flechas en 3D
const PAN_2D_SPEED = 0.8 // fracción de `distance` por segundo con Flechas en Planta 2D
const PAN_2D_SHIFT_MULTIPLIER = 1.75
const ZOOM_SPEED = 1.55 // tasa exponencial continua por segundo (+ / - / RePág / AvPág)
const INITIAL_TAP_DT = 1 / 60 // respuesta inmediata en el primer frame al pulsar
const MAX_FRAME_DT = 0.05 // límite de seguridad ante cambios de pestaña

/**
 * Clasifica una tecla (sin `Ctrl`/`Alt`/`Meta`) en un canal de navegación continua de cámara.
 * Mapea tanto `key` como `code` para evitar teclas «pegadas» cuando `Shift` cambia `+`/`=` o `-`/`_`.
 */
export function resolveNavChannel(event: Pick<KeyboardEvent, 'key' | 'code'>): NavChannel | null {
  const { key, code } = event
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'

  if (
    key === 'PageUp' ||
    code === 'PageUp' ||
    code === 'NumpadAdd' ||
    key === '+' ||
    key === '='
  ) {
    return 'zoomIn'
  }

  if (
    key === 'PageDown' ||
    code === 'PageDown' ||
    code === 'NumpadSubtract' ||
    key === '-' ||
    key === '_' ||
    key === '\u2212'
  ) {
    return 'zoomOut'
  }

  return null
}

/**
 * Navegador fluido de cámara 2D/3D por teclado mediante bucle `requestAnimationFrame`
 * activo únicamente mientras al menos una tecla de navegación permanezca presionada:
 *
 * - **Vista 3D**:
 *   - `←` / `→`: rota la perspectiva horizontalmente (ángulo azimutal `yaw`).
 *   - `↑` / `↓`: inclina la perspectiva verticalmente (ángulo polar `pitch`).
 *   - `Shift + ↑/↓/←/→`: desplaza/panea cámara y `target` sobre el plano horizontal para recorrer la obra.
 * - **Vista 2D (Planta)**:
 *   - `↑` / `↓` / `←` / `→`: desplaza suavemente el plano 2D sin provocar scroll en la página.
 * - **Ambas vistas**:
 *   - `[+]` / `[−]` (o `RePág` / `AvPág` / teclado numérico): acerca y aleja el zoom suavemente.
 */
export function mountKeyboardCameraNavigator(
  options: KeyboardCameraNavigatorOptions
): KeyboardCameraNavigatorHandle {
  const { controller, getViewMode, isBlocked, onFrame } = options

  const getNow =
    options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  const reqFrame =
    options.requestFrame ??
    ((cb: (ts: number) => void) =>
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(cb)
        : (setTimeout(() => cb(getNow()), 16) as unknown as number))
  const cxlFrame =
    options.cancelFrame ??
    ((id: number) => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id)
      } else {
        clearTimeout(id)
      }
    })

  const held = new Set<NavChannel>()
  let shiftHeld = false
  let rafId: number | null = null
  let lastTimestamp = 0

  function stopLoop(): void {
    if (rafId !== null) {
      cxlFrame(rafId)
      rafId = null
    }
  }

  function clear(): void {
    held.clear()
    shiftHeld = false
    stopLoop()
  }

  function step(dtSeconds: number): boolean {
    if (held.size === 0) return false
    if (isBlocked()) {
      clear()
      return false
    }

    const dt = Math.min(MAX_FRAME_DT, Math.max(0, dtSeconds))
    if (dt <= 0) return false

    const horiz = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    const vert = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0)
    const zoomDir = (held.has('zoomIn') ? 1 : 0) - (held.has('zoomOut') ? 1 : 0)

    let changed = false

    if (horiz !== 0 || vert !== 0) {
      const mode = getViewMode()
      if (mode === '2d') {
        const mult = shiftHeld ? PAN_2D_SHIFT_MULTIPLIER : 1
        controller.panPlanar(horiz * PAN_2D_SPEED * mult * dt, vert * PAN_2D_SPEED * mult * dt)
      } else if (shiftHeld) {
        // Shift + Flechas en 3D: desplazamiento horizontal sobre el plano del proyecto
        controller.panPlanar(horiz * PAN_3D_SPEED * dt, vert * PAN_3D_SPEED * dt)
      } else {
        // Flechas solas en 3D: órbita azimutal (←/→) e inclinación polar (↑/↓)
        controller.orbitAngles(horiz * ORBIT_YAW_SPEED * dt, vert * ORBIT_PITCH_SPEED * dt)
      }
      changed = true
    }

    if (zoomDir !== 0) {
      controller.zoomByFactor(Math.exp(-zoomDir * ZOOM_SPEED * dt))
      changed = true
    }

    if (changed) {
      onFrame()
    }

    return changed
  }

  function tick(timestamp: number): void {
    rafId = null
    if (held.size === 0) return
    if (isBlocked()) {
      clear()
      return
    }
    const elapsed = (timestamp - lastTimestamp) / 1000
    lastTimestamp = timestamp
    if (elapsed > 0) {
      step(elapsed)
    }
    if (held.size > 0) {
      rafId = reqFrame(tick)
    }
  }

  function ensureLoopRunning(): void {
    if (rafId !== null || held.size === 0) return
    lastTimestamp = getNow()
    rafId = reqFrame(tick)
  }

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Shift') {
      shiftHeld = true
      return false
    }

    // No interceptar combinaciones con Ctrl, Alt o Meta (ej. Ctrl++, Ctrl+-, Alt+Flecha).
    if (event.ctrlKey || event.altKey || event.metaKey) return false
    if (isBlocked()) return false

    const channel = resolveNavChannel(event)
    if (!channel) return false

    shiftHeld = Boolean(event.shiftKey)
    event.preventDefault?.()

    const wasHeld = held.has(channel)
    held.add(channel)

    // En la primera pulsación real aplicamos un micro-paso inmediato de 1 frame
    // para respuesta instantánea incluso en toques cortos; el resto lo mueve `rAF`.
    if (!wasHeld && !event.repeat) {
      step(INITIAL_TAP_DT)
    }

    ensureLoopRunning()
    return true
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      shiftHeld = false
      return
    }
    shiftHeld = Boolean(event.shiftKey)
    const channel = resolveNavChannel(event)
    if (!channel) return

    // Si se suelta `=` o `+` limpiamos `zoomIn`; igual con `-` o `_` para `zoomOut`.
    held.delete(channel)
    if (held.size === 0) {
      stopLoop()
    }
  }

  const onWindowKeyUp = (e: KeyboardEvent): void => handleKeyUp(e)
  const onWindowBlur = (): void => clear()
  const onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) clear()
  }

  const bindWindow = (options.autoBindWindow ?? true) && typeof window !== 'undefined'
  if (bindWindow) {
    window.addEventListener('keyup', onWindowKeyUp)
    window.addEventListener('blur', onWindowBlur)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
  }

  return {
    handleKeyDown,
    handleKeyUp,
    step,
    clear,
    isNavigating: () => held.size > 0,
    dispose(): void {
      clear()
      if (bindWindow) {
        window.removeEventListener('keyup', onWindowKeyUp)
        window.removeEventListener('blur', onWindowBlur)
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange)
        }
      }
    }
  }
}
