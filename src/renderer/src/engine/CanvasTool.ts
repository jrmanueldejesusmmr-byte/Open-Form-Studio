import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { ViewportRenderer } from './ViewportRenderer'
import { GridNode } from '../models/GridNode'
import { SceneObject, SceneObjectKind } from '../models/SceneObject'
import { defaultColorForShape, naturalSizeForShape } from './ShapeMeshBuilder'
import { WallSegmentType } from '../models/Wall'

/** Formatea un número a 2 decimales (sin depender de ai/tools/validate). */
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/**
 * Herramienta activa del lienzo:
 *   - `select` .. clic para elegir muro/objeto, arrastre para moverlo
 *   - `wall` .... trazo de muros (clic izquierdo dibuja, clic derecho sobre elemento lo mueve)
 *   - `place` ... colocación de un elemento del catálogo bajo el cursor
 *
 * Regla de interacción:
 *   - Clic izquierdo: dibuja o coloca según la herramienta activa (también selecciona y, arrastrando, mueve).
 *   - Clic derecho sobre un elemento: lo mueve arrastrándolo a cualquier posición (con snap y deshacer).
 *   - Clic derecho sobre el fondo vacío: orbita la cámara 360° (lo gestiona el visor, no esta herramienta).
 *   - Botón central (rueda) + arrastrar: desplaza la vista (pan).
 *   - Rueda del ratón: zoom.
 */
export type ToolMode = 'select' | 'wall' | 'place'

export interface PendingObjectSpec {
  name: string
  kind: SceneObjectKind
  color?: number
  shapeId?: string | null
  /** Material del catálogo (puertas/ventanas). */
  materialId?: string | null
  /** Dimensiones personalizadas en metros (ancho, alto, fondo). */
  size?: { width: number; height: number; depth: number } | null
  /** Geometría 3D importada (GLB / glTF / OBJ) de un modelo personalizado. */
  importedGeometry?: THREE.BufferGeometry | null
  /** Material importado asociado al modelo personalizado. */
  importedMaterial?: THREE.Material | null
}

export interface CanvasToolOptions {
  canvas: HTMLCanvasElement
  viewport: ViewportRenderer
  scene: SceneManager
  cellSize?: number
  snapEnabled: () => boolean
  orthoEnabled: () => boolean
  activeWallType: () => WallSegmentType
  activeLevelElevation: () => number
  onModeChange?: (mode: ToolMode) => void
  onMessage: (message: string) => void
  /** Devuelve `true` cuando el visitante va a manejar el gesto de cámara (Alt+izq,
   *  o la herramienta «Orbitar» activa), de modo que `CanvasTool` se abstenga de
   *  dibujar/colocar y deje pasar el clic. */
  cameraClaimsGesture?: (e: PointerEvent) => boolean
  /** Devuelve `true` cuando otra herramienta externa (p. ej. el trazo de techo)
   *  controla por completo el lienzo: `CanvasTool` se abstiene de todo (puntero,
   *  hover y teclado) para no interferir con ella. */
  externalToolActive?: () => boolean
}

export interface CanvasToolHandle {
  setMode(mode: ToolMode): void
  getMode(): ToolMode
  setPendingObject(spec: PendingObjectSpec | null): void
  getPendingObject(): PendingObjectSpec | null
  intercepts(e: PointerEvent): boolean
  cancel(): void
  pickAt(clientX: number, clientY: number): { type: 'wall' | 'object'; label: string } | null
  dispose(): void
}

const MIN_WALL_LENGTH = 0.05

export function mountCanvasTool(options: CanvasToolOptions): CanvasToolHandle {
  const { canvas, viewport, scene } = options
  const cellSize = options.cellSize ?? 1
  const cameraClaimsGesture = options.cameraClaimsGesture
  // Cuando otra herramienta (trazo de techo) controla el lienzo, esta se apaga.
  const externalActive = (): boolean => options.externalToolActive?.() ?? false

  let mode: ToolMode = 'select'
  let pending: PendingObjectSpec | null = null

  /** Trazo de muro en curso (botón izquierdo). */
  let drawing = false
  let drawStart: THREE.Vector3 | null = null

  /** Arrastre de un elemento (botón izquierdo en select o botón derecho en cualquier modo). */
  let drag: {
    kind: 'wall' | 'object'
    id: string
    grab: THREE.Vector3
    origin: THREE.Vector3
    start?: THREE.Vector3
    end?: THREE.Vector3
    rotation?: number
    isRightClickDrag?: boolean
  } | null = null

  let dragDelta = new THREE.Vector3()
  let activePointer: number | null = null

  /* ---------- Utilidades de puntero ---------- */

  function groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    return viewport.pointerToGround(clientX, clientY)
  }

  function snap(point: THREE.Vector3): THREE.Vector3 {
    if (!options.snapEnabled()) return point
    return GridNode.nearestTo(point, cellSize).worldPosition.clone()
  }

  function elevated(point: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(point.x, options.activeLevelElevation(), point.z)
  }

  function applyOrtho(start: THREE.Vector3, point: THREE.Vector3): THREE.Vector3 {
    if (!options.orthoEnabled()) return point
    const dx = Math.abs(point.x - start.x)
    const dz = Math.abs(point.z - start.z)
    return dx >= dz ? new THREE.Vector3(point.x, 0, start.z) : new THREE.Vector3(start.x, 0, point.z)
  }

  function endPointOf(start: THREE.Vector3, clientX: number, clientY: number): THREE.Vector3 | null {
    const raw = groundPoint(clientX, clientY)
    if (!raw) return null
    return applyOrtho(start, snap(raw))
  }

  /* ---------- Modo `wall`: trazo con clic izquierdo ---------- */

  function startWall(e: PointerEvent): void {
    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) return
    drawing = true
    drawStart = snap(raw)
    previewWall(e)
  }

  function previewWall(e: PointerEvent): void {
    if (!drawStart) return
    const end = endPointOf(drawStart, e.clientX, e.clientY)
    if (!end) return
    viewport.setToolPreview({ start: elevated(drawStart), end: elevated(end) }, elevated(end))
  }

  function finishWall(e: PointerEvent): void {
    const start = drawStart
    drawing = false
    drawStart = null
    viewport.clearToolPreview()
    if (!start) return

    const end = endPointOf(start, e.clientX, e.clientY)
    if (!end) return
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    if (length < MIN_WALL_LENGTH) {
      options.onMessage('Trazo demasiado corto: mantén pulsado y arrastra hasta el punto final.')
      return
    }

    const wall = scene.addWall(options.activeWallType(), start.clone(), end.clone())
    options.onMessage(`«${wall.label}» trazado (${length.toFixed(2)} m). Ctrl+Z para deshacer.`)
  }

  /* ---------- Mover elementos (Clic derecho o arrastre en selección) ---------- */

  function startMoveElement(e: PointerEvent, isRightClick: boolean): boolean {
    const wall = viewport.pickWall(e.clientX, e.clientY)
    const object = wall ? null : viewport.pickObject(e.clientX, e.clientY)

    if (!wall && !object) {
      if (!isRightClick && mode === 'select') {
        scene.select(null)
        scene.selectObject(null)
      }
      return false
    }

    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) return false
    activePointer = e.pointerId
    dragDelta.set(0, 0, 0)

    if (wall) {
      scene.select(wall)
      drag = {
        kind: 'wall',
        id: wall.id,
        grab: raw,
        origin: raw.clone(),
        start: wall.start.clone(),
        end: wall.end.clone(),
        isRightClickDrag: isRightClick
      }
      options.onMessage(`Moviendo «${wall.label}»: arrastra para reposicionar · Suelta para fijar (Ctrl+Z deshace).`)
      return true
    }

    scene.selectObject(object!)
    drag = {
      kind: 'object',
      id: object!.id,
      grab: raw,
      origin: object!.position.clone(),
      rotation: object!.rotationY,
      isRightClickDrag: isRightClick
    }
    options.onMessage(`Moviendo «${object!.name}»: arrastra para reposicionar · Suelta para fijar (Ctrl+Z deshace).`)
    return true
  }

  function updateDrag(e: PointerEvent): void {
    if (!drag) return
    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) return

    const delta = raw.clone().sub(drag.grab)
    dragDelta = options.snapEnabled()
      ? GridNode.nearestTo(delta, cellSize).worldPosition.clone()
      : delta

    if (drag.kind === 'wall' && drag.start && drag.end) {
      scene.moveWall(drag.id, drag.start.clone().add(dragDelta), drag.end.clone().add(dragDelta), true)
    } else if (drag.kind === 'object') {
      scene.moveObject(drag.id, drag.origin.clone().add(dragDelta), drag.rotation ?? 0, true)
    }
  }

  function finishDrag(): void {
    const current = drag
    drag = null
    if (!current) return
    if (dragDelta.lengthSq() < 1e-12) return

    if (current.kind === 'wall' && current.start && current.end) {
      const start = current.start.clone().add(dragDelta)
      const end = current.end.clone().add(dragDelta)
      scene.moveWall(current.id, start, end, false)
      options.onMessage(`Muro movido a (${start.x.toFixed(1)}, ${start.z.toFixed(1)}). Ctrl+Z para deshacer.`)
      return
    }

    const position = current.origin.clone().add(dragDelta)
    scene.moveObject(current.id, position, current.rotation ?? 0, false)
    options.onMessage(`Objeto movido a (${position.x.toFixed(1)}, ${position.z.toFixed(1)}). Ctrl+Z para deshacer.`)
  }

  /* ---------- Modo `place`: colocación del catálogo ---------- */

  function placeObject(e: PointerEvent): void {
    const spec = pending
    if (!spec) {
      options.onMessage('Elige primero un elemento del catálogo para colocarlo.')
      return
    }
    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) return

    // Si es una abertura (puerta/ventana), colocar sobre muro con perforación booleana real.
    const isOpening =
      Boolean(spec.shapeId && spec.shapeId.startsWith('opening.') && spec.shapeId !== 'opening.slab')
    if (isOpening) {
      placeOpening(e, spec, raw)
      return
    }

    const object = new SceneObject(spec.name, spec.kind)
    object.position.copy(snap(raw))
    object.levelId = scene.getActiveLevelId()
    object.position.y = options.activeLevelElevation()
    if (spec.color !== undefined) object.color = spec.color
    if (spec.materialId !== undefined) object.materialId = spec.materialId
    if (spec.shapeId) {
      const natural = naturalSizeForShape(spec.shapeId)
      if (natural) object.size.copy(natural)
      object.shapeId = spec.shapeId ?? null
      object.color = spec.color ?? defaultColorForShape(spec.shapeId)
    }
    if (spec.size) {
      object.size.set(spec.size.width, spec.size.height, spec.size.depth)
    }
    if (spec.importedGeometry) {
      object.importedGeometry = spec.importedGeometry.clone()
      object.importedMaterial = spec.importedMaterial ? spec.importedMaterial.clone() : null
      object.layer = 'importado'
    }

    scene.addObject(object)
    scene.selectObject(object)
    options.onMessage(
      `«${spec.name}» colocado en (${object.position.x.toFixed(1)}, ${object.position.z.toFixed(1)}). Sigue haciendo clic para repetir.`
    )
  }

  /** Busca el muro más cercano al punto en planta dentro de un radio máximo. */
  function findNearestWallAtPoint(point: THREE.Vector3, maxDist = 0.5): import('../models/Wall').Wall | null {
    const activeLevelId = scene.getActiveLevelId()
    let bestWall: import('../models/Wall').Wall | null = null
    let bestDist = maxDist
    for (const candidate of scene.getWalls()) {
      if (candidate.levelId !== activeLevelId) continue
      const dx = candidate.end.x - candidate.start.x
      const dz = candidate.end.z - candidate.start.z
      const len = Math.hypot(dx, dz)
      if (len < 0.2) continue
      const ux = dx / len
      const uz = dz / len
      const proj = (point.x - candidate.start.x) * ux + (point.z - candidate.start.z) * uz
      if (proj < -0.1 || proj > len + 0.1) continue
      const perp = Math.abs((point.x - candidate.start.x) * -uz + (point.z - candidate.start.z) * ux)
      if (perp <= bestDist) {
        bestDist = perp
        bestWall = candidate
      }
    }
    return bestWall
  }

  /**
   * Coloca una puerta o ventana sobre el muro bajo el cursor, creando un
   * hueco booleano real en la geometría del muro (jambas, dintel y alféizar visibles)
   * y la malla 3D detallada con marco, cristal físico y manija metálica.
   */
  function placeOpening(e: PointerEvent, spec: PendingObjectSpec, raw: THREE.Vector3): void {
    const wall = viewport.pickWall(e.clientX, e.clientY) ?? findNearestWallAtPoint(raw, 0.55)
    if (!wall) {
      options.onMessage('Coloca la puerta o ventana haciendo clic directamente sobre un muro.')
      return
    }

    // Posición X sobre el muro (distancia desde el inicio, proyectada).
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const len = Math.hypot(dx, dz)
    if (len < 0.45) {
      options.onMessage('El muro es demasiado corto para alojar una abertura.')
      return
    }
    const ux = dx / len
    const uz = dz / len

    const shapeId = spec.shapeId ?? 'opening.door'
    const isDoor = shapeId.includes('door')
    const type: 'door' | 'window' = isDoor ? 'door' : 'window'
    const variant = inferOpeningVariant(shapeId)

    let defaultWidth = isDoor ? 0.9 : 1.2
    let defaultHeight = isDoor ? 2.1 : 1.2
    let sill = isDoor ? 0 : 0.9

    if (shapeId === 'opening.door.double') {
      defaultWidth = 1.6
      defaultHeight = 2.1
    } else if (shapeId === 'opening.door.garage') {
      defaultWidth = 2.4
      defaultHeight = 2.15
    } else if (shapeId === 'opening.door.patio') {
      defaultWidth = 1.5
      defaultHeight = 2.1
    } else if (shapeId === 'opening.window.panoramic') {
      defaultWidth = 2.0
      defaultHeight = 1.4
      sill = 0.75
    } else if (shapeId === 'opening.window.four') {
      defaultWidth = 1.8
      defaultHeight = 1.3
      sill = 0.85
    } else if (shapeId === 'opening.window.double') {
      defaultWidth = 1.4
      defaultHeight = 1.2
      sill = 0.9
    }

    const reqWidth = spec.size?.width ?? defaultWidth
    const reqHeight = spec.size?.height ?? defaultHeight
    const width = Math.min(reqWidth, Math.max(0.4, len - 0.12))
    const height = Math.min(reqHeight, Math.max(0.4, wall.height - sill - 0.05))

    const rawT = (raw.x - wall.start.x) * ux + (raw.z - wall.start.z) * uz
    const margin = Math.min(0.06, Math.max(0.01, (len - width) * 0.25))
    const t = Math.max(width / 2 + margin, Math.min(len - width / 2 - margin, rawT))

    // Validar que quepa y no se solape.
    try {
      scene.validateOpening(wall.id, t, width, height, sill)
    } catch (err) {
      options.onMessage(`No se puede colocar: ${(err as Error).message}`)
      return
    }

    // Hueco booleano real en el muro.
    const addedOpening = scene.addOpening(wall.id, {
      wallId: wall.id,
      x: t,
      width,
      height,
      sill,
      type,
      materialId: spec.materialId ?? null
    })

    const levelElev = scene.getLevel(wall.levelId)?.elevation ?? options.activeLevelElevation()

    // Objeto 3D de carpintería (marco, hoja/perfilería, cristal PBR, manijas) alineado al vano.
    const object = new SceneObject(spec.name, spec.kind)
    object.levelId = wall.levelId
    object.position.set(wall.start.x + ux * t, levelElev + sill, wall.start.z + uz * t)
    object.rotationY = -Math.atan2(dz, dx)
    object.openingVariant = variant
    object.openingAngle = 0
    object.openingId = addedOpening.id
    object.shapeId = shapeId
    object.materialId = spec.materialId ?? (isDoor ? 'mat.wood' : 'mat.glass')
    object.size.set(width, height, wall.thickness)

    scene.addObject(object)
    scene.selectObject(object)
    options.onMessage(
      `«${spec.name}» insertado con perforación de muro (${fmt(width)} × ${fmt(height)} m). Ctrl+Z para deshacer.`
    )
  }

  /** Infiere la variante de abertura a partir del id del catálogo. */
  function inferOpeningVariant(shapeId: string): string {
    const map: Record<string, string> = {
      'opening.door': 'simple',
      'opening.door.double': 'doble',
      'opening.door.sliding': 'corrediza',
      'opening.door.garage': 'garaje',
      'opening.door.patio': 'puerta-ventana',
      'opening.door.glass': 'vidrio',
      'opening.window': 'fija',
      'opening.window.sliding': 'corrediza',
      'opening.window.casement': 'abatible',
      'opening.window.double': 'dosHojas',
      'opening.window.four': 'cuatroHojas',
      'opening.window.panoramic': 'panoramica'
    }
    return map[shapeId] ?? (shapeId.includes('door') ? 'simple' : 'fija')
  }

  /* ---------- Previsualización en reposo (hover) ---------- */

  function updateHover(e: PointerEvent): void {
    // La herramienta externa (techo) pinta su propia previsualización.
    if (externalActive()) return
    if (activePointer !== null) return
    if (mode !== 'wall' && mode !== 'place') {
      viewport.clearToolPreview()
      return
    }
    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) {
      viewport.clearToolPreview()
      return
    }
    viewport.setToolPreview(null, elevated(snap(raw)))
  }

  /* ---------- Gestores de eventos ---------- */

  function onPointerDown(e: PointerEvent): void {
    if (activePointer !== null) return
    // Otra herramienta controla el lienzo (trazo de techo): no interferir.
    if (externalActive()) return

    // Si el visitante ya gestiona el gesto de cámara (Alt+izquierdo arrastrado
    // o herramienta «Orbitar» activa), CanvasTool no debe dibujar, colocar ni
    // mover el elemento: el gesto pertenece a la cámara.
    if (cameraClaimsGesture?.(e)) return

    // CLIC DERECHO (botón 2): Mover elemento bajo el cursor si existe
    if (e.button === 2) {
      const moved = startMoveElement(e, true)
      if (moved) {
        canvas.classList.add('is-interacting')
      }
      return
    }

    // CLIC IZQUIERO (botón 0)
    if (e.button === 0) {
      if (mode === 'wall') {
        activePointer = e.pointerId
        canvas.classList.add('is-interacting')
        startWall(e)
        return
      }
      if (mode === 'place') {
        activePointer = e.pointerId
        canvas.classList.add('is-interacting')
        placeObject(e)
        return
      }
      // Modo selección
      const selected = startMoveElement(e, false)
      if (selected) {
        canvas.classList.add('is-interacting')
      }
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (externalActive()) return
    if (activePointer === null || e.pointerId !== activePointer) return
    if (drawing) previewWall(e)
    else if (drag) updateDrag(e)
  }

  function onPointerUp(e: PointerEvent): void {
    if (activePointer === null || e.pointerId !== activePointer) return
    activePointer = null
    canvas.classList.remove('is-interacting')
    if (drawing) finishWall(e)
    else if (drag) finishDrag()
  }

  function onKeyDown(e: KeyboardEvent): void {
    // El teclado lo gestiona la herramienta externa mientras esté activa.
    if (externalActive()) return
    if (e.key !== 'Escape') return
    if (drawing || drag) {
      cancel()
      options.onMessage('Gesto cancelado.')
      return
    }
    if (mode !== 'select') setMode('select')
  }

  function intercepts(e: PointerEvent): boolean {
    // Botón central (1): NUNCA interceptado por herramientas (siempre órbita de cámara)
    if (e.button === 1) return false

    // Clic derecho (2): Interceptado SOLO si hay un elemento bajo el cursor para moverlo
    if (e.button === 2) {
      return (
        viewport.pickWall(e.clientX, e.clientY) !== null ||
        viewport.pickObject(e.clientX, e.clientY) !== null
      )
    }

    // Clic izquierdo (0):
    if (e.button === 0) {
      if (mode !== 'select') return true
      return (
        viewport.pickWall(e.clientX, e.clientY) !== null ||
        viewport.pickObject(e.clientX, e.clientY) !== null
      )
    }

    return false
  }

  function cancel(): void {
    drawing = false
    drag = null
    drawStart = null
    dragDelta.set(0, 0, 0)
    activePointer = null
    canvas.classList.remove('is-interacting')
    viewport.clearToolPreview()
  }

  function setMode(next: ToolMode): void {
    cancel()
    if (next !== 'place') pending = null
    mode = next
    options.onModeChange?.(next)
  }

  function setPendingObject(spec: PendingObjectSpec | null): void {
    pending = spec
    cancel()
    mode = spec ? 'place' : 'select'
    options.onModeChange?.(mode)
  }

  function pickAt(clientX: number, clientY: number): { type: 'wall' | 'object'; label: string } | null {
    const wall = viewport.pickWall(clientX, clientY)
    if (wall) return { type: 'wall', label: wall.label }
    const object = viewport.pickObject(clientX, clientY)
    return object ? { type: 'object', label: object.name } : null
  }

  function onPointerLeave(): void {
    if (activePointer === null) viewport.clearToolPreview()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', updateHover)
  canvas.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  document.addEventListener('keydown', onKeyDown)

  return {
    setMode,
    getMode: () => mode,
    setPendingObject,
    getPendingObject: () => pending,
    intercepts,
    cancel,
    pickAt,
    dispose(): void {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', updateHover)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('keydown', onKeyDown)
      cancel()
    }
  }
}
