import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { ViewportRenderer } from './ViewportRenderer'
import { RoofType, ROOF_SNAP_STEP } from '../models/Roof'

/** Opciones de dibujo manual del techo por área. */
export interface RoofDraftOptions {
  canvas: HTMLCanvasElement
  viewport: ViewportRenderer
  scene: SceneManager
  snapEnabled: () => boolean
  onMessage: (message: string) => void
  onDone: () => void
}

export interface RoofDraftHandle {
  cancel(): void
  dispose(): void
  /** ¿Hay un borrador en curso? (para Enter = confirmar, Esc = cancelar). */
  isActive(): boolean
  confirm(): void
}

/** Propiedades vivas del borrador (las edita el panel de propiedades). */
export interface RoofDraftProps {
  type: RoofType
  slope: number
  overhang: number
  thickness: number
  ridgeDir: 'x' | 'z'
  material: string
}

/**
 * Borrador manual del techo: clics sobre la cuadrícula con snap a 0.5 m,
 * cierre con doble clic o clic en el primer punto; Enter confirma, Esc
 * cancela. Crea el techo con `scene.createRoof` (un paso de historial).
 */
export function mountRoofDraft(options: RoofDraftOptions, props: RoofDraftProps): RoofDraftHandle {
  const { canvas, viewport, scene } = options
  let points: THREE.Vector3[] = []
  let active = true

  function snap(point: THREE.Vector3): THREE.Vector3 {
    if (!options.snapEnabled()) return point.clone()
    const s = ROOF_SNAP_STEP
    return new THREE.Vector3(Math.round(point.x / s) * s, point.y, Math.round(point.z / s) * s)
  }

  function refreshPreview(): void {
    if (points.length === 0) {
      viewport.clearToolPreview()
      return
    }
    // Polígono en trazo: une los puntos en orden (cierra con 3+). Con un solo
    // punto basta el marcador; el resto se dibuja como contorno.
    viewport.setPolygonPreview(points, points.length >= 3)
    viewport.setToolPreview(
      points.length >= 2
        ? { start: points[points.length - 2], end: points[points.length - 1] }
        : null,
      points[points.length - 1]
    )
  }

  function confirm(): void {
    if (!active || points.length < 3) {
      options.onMessage('El techo necesita al menos 3 puntos.')
      return
    }
    const footprint = points.map((p) => ({ x: p.x, z: p.z }))
    const obj = scene.createRoof({
      footprint,
      auto: false,
      type: props.type,
      slope: props.slope,
      overhang: props.overhang,
      thickness: props.thickness,
      materialId: props.material
    })
    if (!obj) {
      options.onMessage('No se pudo crear el techo con ese contorno.')
      return
    }
    active = false
    viewport.clearToolPreview()
    options.onMessage(`Techo creado sobre ${footprint.length} puntos (Ctrl+Z para deshacer).`)
    options.onDone()
  }

  function cancel(): void {
    points = []
    viewport.clearToolPreview()
  }

  function dispose(): void {
    active = false
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('dblclick', onDoubleClick)
    document.removeEventListener('keydown', onKeyDown)
    viewport.clearToolPreview()
  }

  function onPointerDown(e: PointerEvent): void {
    if (!active || e.button !== 0) return
    const ground = viewport.pointerToGround(e.clientX, e.clientY)
    if (!ground) return
    const p = snap(ground)
    // Clic en el primer punto (≤0.25 m) cierra el contorno.
    if (points.length >= 3) {
      const first = points[0]
      if (Math.hypot(p.x - first.x, p.z - first.z) <= 0.25) {
        confirm()
        return
      }
    }
    points.push(new THREE.Vector3(p.x, 0, p.z))
    refreshPreview()
    options.onMessage(`Punto ${points.length}: doble clic o clic en el primero para cerrar, Enter para confirmar.`)
  }

  function onDoubleClick(e: MouseEvent): void {
    if (!active) return
    e.preventDefault()
    // El doble clic deja dos puntos casi idénticos: quita el último.
    if (points.length >= 2) {
      const a = points[points.length - 1]
      const b = points[points.length - 2]
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-6) points.pop()
    }
    confirm()
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!active) return
    if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      options.onMessage('Techo cancelado.')
      options.onDone()
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('dblclick', onDoubleClick)
  document.addEventListener('keydown', onKeyDown)
  options.onMessage('Techo manual: haz clic en los puntos del contorno (snap 0.5 m). Doble clic para cerrar.')

  return {
    cancel,
    dispose,
    isActive: () => active,
    confirm
  }
}
