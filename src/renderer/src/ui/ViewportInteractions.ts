import * as THREE from 'three'
import { Viewport3DController } from '../engine/Viewport3DController'

/**
 * Controles de navegación 360° del canvas 3D:
 *
 * Mapeo de controles (definitivo):
 *   - Clic izquierdo ....................................... Lo gestiona la herramienta (dibujar, colocar, seleccionar/mover)
 *   - Alt + clic izquierdo arrastrado ...................... Órbita 360° (en cualquier herramienta)
 *   - Shift + Alt + clic izquierdo arrastrado .............. Pan (desplazamiento)
 *   - Herramienta «Orbitar» activa + clic izquierdo ......... Órbita 360° (atajo O)
 *   - Clic derecho sobre un elemento ....................... Mueve el elemento (lo reclama `CanvasTool`)
 *   - Clic derecho sobre el área vacía ..................... Órbita 360° (en 2D desplaza la vista)
 *   - Botón central (rueda) + arrastrar .................... Pan (desplazamiento)
 *   - Rueda del ratón ...................................... Zoom continuo hacia el cursor
 *   - Táctil 1 dedo (con «Orbitar» activo) ................. Órbita
 *   - Táctil 2 dedos ........................................ Pellizco (zoom) + Arrastre (pan)
 */

export const DEFAULT_WHEEL_DIRECTION = 1

export interface ViewportInteractionsOptions {
  canvas: HTMLCanvasElement
  controller: Viewport3DController
  pointerRayDirection?: (clientX: number, clientY: number) => THREE.Vector3 | null
  onChange?: () => void
  wheelDirection?: number
  isOrbitEnabled?: () => boolean
  /** La herramienta reclama el gesto (mover/arrastrar): la cámara se aparta. */
  interceptsGesture?: (e: PointerEvent) => boolean
  /** `true` cuando la herramienta «Orbitar» está activa (clic izquierdo orbita). */
  isOrbitToolActive?: () => boolean
  /** Notificación de depuración: ¿se aceptó el gesto y por qué? */
  debugGesture?: (accepted: boolean, reason: string) => void
  /** Se llama en cada paso real de órbita (para el contador de depuración). */
  onOrbitStep?: () => void
}

export interface ViewportInteractionsHandle {
  dispose(): void
}

type DragMode = 'none' | 'orbit' | 'pan' | 'pinch'
type PointerSample = { x: number; y: number }

export function mountViewportInteractions(
  options: ViewportInteractionsOptions
): ViewportInteractionsHandle {
  const { canvas, controller, pointerRayDirection, onChange, isOrbitEnabled, interceptsGesture } = options
  const wheelDirection = options.wheelDirection ?? DEFAULT_WHEEL_DIRECTION
  const isOrbitToolActive = options.isOrbitToolActive
  const debugGesture = options.debugGesture
  const onOrbitStep = options.onOrbitStep

  const pointers = new Map<number, PointerSample>()
  let mode: DragMode = 'none'
  let lastX = 0
  let lastY = 0
  let pinchSpread = 0
  let pinchCentroid: PointerSample = { x: 0, y: 0 }

  const notify = (): void => onChange?.()

  function pinchMetrics(): { spread: number; centroid: PointerSample } | null {
    const samples = [...pointers.values()]
    if (samples.length < 2) return null
    const [a, b] = samples
    return {
      spread: Math.hypot(a.x - b.x, a.y - b.y),
      centroid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
  }

  function beginPinch(): void {
    const metrics = pinchMetrics()
    if (!metrics) return
    mode = 'pinch'
    pinchSpread = metrics.spread
    pinchCentroid = metrics.centroid
  }

  function beginSinglePointer(e: PointerEvent): void {
    lastX = e.clientX
    lastY = e.clientY

    const orbitAllowed = isOrbitEnabled?.() ?? true

    if (e.button === 1) {
      // Botón central: Pan (desplazamiento).
      mode = 'pan'
    } else if (e.button === 2) {
      // Clic derecho en área vacía: órbita 360° en 3D; en 2D la órbita está bloqueada.
      mode = orbitAllowed ? 'orbit' : 'pan'
    } else if (e.button === 0) {
      // Clic izquierdo: solo inicia un gesto de cámara si el usuario lo fuerza
      // con Alt (órbita; Shift+Alt = pan) o con la herramienta «Orbitar» activa.
      if (e.altKey) {
        mode = e.shiftKey || !orbitAllowed ? 'pan' : 'orbit'
      } else if (isOrbitToolActive?.() && orbitAllowed) {
        mode = 'orbit'
      } else {
        mode = 'none'
      }
    } else {
      mode = 'none'
    }
  }

  function capturePointer(pointerId: number): void {
    try {
      canvas.setPointerCapture(pointerId)
    } catch {
      // Ignorar si no se puede capturar en este contexto
    }
  }

  function releasePointer(pointerId: number): void {
    try {
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    } catch {
      // Ignorar
    }
  }

  function endGesture(): void {
    pointers.clear()
    mode = 'none'
    canvas.classList.remove('is-interacting')
  }

  const onPointerDown = (e: PointerEvent): void => {
    // Gestos de cámara: botón central (pan), botón derecho (órbita en vacío) y
    // clic izquierdo SOLO cuando el usuario lo fuerza (Alt, o la herramienta
    // «Orbitar» activa). El clic izquierdo normal queda para la herramienta.
    const orbitToolActive = isOrbitToolActive?.() ?? false
    const isCameraButton = e.button === 1 || e.button === 2
    const forcedLeftOrbit = e.button === 0 && (e.altKey || orbitToolActive)
    if (!isCameraButton && !forcedLeftOrbit) {
      debugGesture?.(false, `clic izquierdo → herramienta (button=${e.button})`)
      return
    }

    e.preventDefault()

    // Si una herramienta de dibujo o movimiento reclama este evento, la cámara
    // se aparta… salvo que el usuario fuerce la cámara con Alt o «Orbitar».
    const toolClaims = interceptsGesture?.(e) ?? false
    if (toolClaims && !forcedLeftOrbit) {
      debugGesture?.(false, 'la herramienta reclama el gesto (intercepts=true)')
      return
    }

    debugGesture?.(true, `aceptado (button=${e.button}, alt=${e.altKey}, orbitTool=${orbitToolActive})`)

    capturePointer(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.classList.add('is-interacting')

    if (pointers.size >= 2) {
      beginPinch()
    } else {
      beginSinglePointer(e)
    }
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.preventDefault()

    if (mode === 'pinch') {
      const metrics = pinchMetrics()
      if (!metrics) return

      if (pinchSpread > 0 && metrics.spread > 0) {
        controller.zoomByFactor(pinchSpread / metrics.spread)
      }
      controller.pan(metrics.centroid.x - pinchCentroid.x, metrics.centroid.y - pinchCentroid.y)

      pinchSpread = metrics.spread
      pinchCentroid = metrics.centroid
      notify()
      return
    }

    const deltaX = e.clientX - lastX
    const deltaY = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    if (deltaX === 0 && deltaY === 0) return

    if (mode === 'pan') {
      controller.pan(deltaX, deltaY)
    } else if (mode === 'orbit') {
      controller.orbit(deltaX, deltaY)
      onOrbitStep?.()
    } else {
      return
    }

    notify()
  }

  const onPointerUp = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    releasePointer(e.pointerId)

    if (pointers.size === 0) {
      endGesture()
      return
    }

    const [remaining] = [...pointers.values()]
    lastX = remaining.x
    lastY = remaining.y
    if (pointers.size >= 2) beginPinch()
    else mode = (isOrbitEnabled?.() ?? true) ? 'orbit' : 'pan'
  }

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const focus = pointerRayDirection?.(e.clientX, e.clientY) ?? null
    controller.zoom(e.deltaY * wheelDirection, focus)
    notify()
  }

  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
  }

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) e.preventDefault()
  }

  const onWindowBlur = (): void => {
    if (mode !== 'none') endGesture()
  }

  // Cuando el sistema marcará el puntero como «capturado» y se pierde por
  // fuera del canvas (por ejemplo, al pasar a otro ventana o a un <input
  // contenteditable>), geolocarlo como un gesture terminado o abandonar el
  // estado «interactuando», evitando quedarnos colgados.
  const onPointerCaptureLost = (e: PointerEvent): void => {
    // El puntero perdió la captura; si aún está en el mapa, cerramos el
    // gesture actual (evita quedarnos colgados tras salir del canvas).
    const sample = pointers.get(e.pointerId)
    if (sample !== undefined) {
      endGesture()
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('lostpointercapture', onPointerCaptureLost, true)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('blur', onWindowBlur)

  return {
    dispose(): void {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('lostpointercapture', onPointerCaptureLost, true)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('blur', onWindowBlur)
      endGesture()
    }
  }
}
