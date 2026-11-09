import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { ViewportRenderer } from './ViewportRenderer'
import { GridNode } from '../models/GridNode'
import { SceneObject, SceneObjectKind } from '../models/SceneObject'
import { defaultColorForShape, naturalSizeForShape } from './ShapeMeshBuilder'
import { Wall, WallSegmentType } from '../models/Wall'
import {
  defaultStructuralParamsFor,
  isParametricStructuralShape,
  STRUCTURAL_MATERIAL_TO_CATALOG,
  type StructuralParams
} from '../models/StructuralTypes'
import { sampleAnyTerrainAt } from './TerrainBuilder'
import type { HistoryManager } from './HistoryManager'
import { detectSwingFromPointer } from './Opening2DSymbology'
import { openDoorPropertiesPanel } from '../ui/PropertiesPanel'
import { resolveObjectOpeningSpec } from './WallMeshBuilder'
import {
  buildWallTemplateSegments,
  getWallTemplateDef,
  snapPointToWallsAndGrid,
  type LProfileVariant,
  type WallTemplateId
} from './WallTemplates'

/** Formatea un número a 2 decimales (sin depender de ai/tools/validate). */
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/**
 * Herramienta activa del lienzo:
 *   - `select` .... clic para elegir muro/objeto, arrastre en cuerpo para moverlo o en extremo para estirarlo
 *   - `wall` ...... trazo de muros individuales (clic izquierdo dibuja, clic derecho sobre elemento lo mueve)
 *   - `template` .. colocación interactiva 2D/3D de plantillas de muros conectados (ghost wireframe + Click & Drag)
 *   - `place` ..... colocación de un elemento 3D del catálogo bajo el cursor
 *
 * Regla de interacción:
 *   - Clic izquierdo: dibuja o coloca según la herramienta activa (también selecciona y, arrastrando, mueve/estira).
 *   - Clic derecho sobre un elemento: lo mueve arrastrándolo a cualquier posición (con snap y deshacer).
 *   - Clic derecho sobre el fondo vacío: orbita la cámara 360° (lo gestiona el visor, no esta herramienta).
 *   - Botón central (rueda) + arrastrar: desplaza la vista (pan).
 *   - Rueda del ratón: zoom.
 */
export type ToolMode = 'select' | 'wall' | 'template' | 'place'

export interface PendingObjectSpec {
  name: string
  kind: SceneObjectKind
  color?: number
  shapeId?: string | null
  /** Material del catálogo (puertas/ventanas). */
  materialId?: string | null
  /** Dimensiones personalizadas en metros (ancho, alto, fondo). */
  size?: { width: number; height: number; depth: number } | null
  /** Rotación previa alrededor de Y en radianes (tecla [G] antes de colocar). */
  rotationY?: number
  /** Geometría 3D importada (GLB / glTF / OBJ) de un modelo personalizado. */
  importedGeometry?: THREE.BufferGeometry | null
  /** Material importado asociado al modelo personalizado. */
  importedMaterial?: THREE.Material | null
  /** Parámetros estructurales dinámicos cuando se inserta uno de los 13 sistemas estructurales o formas curvas. */
  structuralParams?: StructuralParams | null
}

export interface WallTemplateState {
  templateId: WallTemplateId
  width: number
  depth: number
  rotationDeg: number
  lVariant: LProfileVariant
  segmentsCount: number
  liveWidth: number
  liveDepth: number
  isDragging: boolean
}

export interface WallTemplateParamsPatch {
  width?: number
  depth?: number
  rotationDeg?: number
  lVariant?: LProfileVariant
  segmentsCount?: number
}

export interface CanvasToolOptions {
  canvas: HTMLCanvasElement
  viewport: ViewportRenderer
  scene: SceneManager
  history?: HistoryManager
  cellSize?: number
  snapEnabled: () => boolean
  orthoEnabled: () => boolean
  activeWallType: () => WallSegmentType
  activeLevelElevation: () => number
  onModeChange?: (mode: ToolMode) => void
  onTemplateStateChange?: (state: WallTemplateState | null) => void
  onMessage: (message: string) => void
  /** Callback para enfocar y re-centrar suavemente el pivote de cámara en el punto clickeado. */
  onFocusPoint?: (point: THREE.Vector3) => void
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
  setWallTemplate(templateId: WallTemplateId | null): void
  getWallTemplateState(): WallTemplateState | null
  updateWallTemplateParams(patch: WallTemplateParamsPatch): void
  /** Rota 90° la plantilla activa o el objeto pendiente antes de colocarlo. Devuelve `true` si aplicó. */
  rotatePending90(): boolean
  /** `true` si hay un trazo/arrastre en vuelo que puede cancelarse sin cambiar de herramienta. */
  hasActiveStroke(): boolean
  intercepts(e: PointerEvent): boolean
  cancel(): void
  pickAt(clientX: number, clientY: number): { type: 'wall' | 'object'; label: string } | null
  dispose(): void
}

const MIN_WALL_LENGTH = 0.05
const TEMPLATE_DRAG_THRESHOLD = 0.35
const ENDPOINT_GRIP_RADIUS = 0.44
const ENDPOINT_BODY_RADIUS = 0.34

export function mountCanvasTool(options: CanvasToolOptions): CanvasToolHandle {
  const { canvas, viewport, scene } = options
  const cellSize = options.cellSize ?? 1
  const cameraClaimsGesture = options.cameraClaimsGesture
  // Cuando otra herramienta (trazo de techo) controla el lienzo, esta se apaga.
  const externalActive = (): boolean => options.externalToolActive?.() ?? false

  let mode: ToolMode = 'select'
  let pending: PendingObjectSpec | null = null
  let templateState: WallTemplateState | null = null

  /** Última posición del puntero en coordenadas de cliente, para refrescar el ghost al pulsar [G] o editar HUD. */
  let lastPointerClient: { x: number; y: number } | null = null

  /** Trazo de muro simple en curso (botón izquierdo). */
  let drawing = false
  let drawStart: THREE.Vector3 | null = null

  /** Colocación / arrastre de esquina a esquina de una plantilla de muros 2D. */
  let placingTemplate = false
  let templateDragStart: THREE.Vector3 | null = null

  /** Arrastre de un elemento o estiramiento de extremo de muro. */
  let drag: {
    kind: 'wall' | 'wall-vertex' | 'object'
    id: string
    grab: THREE.Vector3
    origin: THREE.Vector3
    start?: THREE.Vector3
    end?: THREE.Vector3
    vertexEnd?: 'start' | 'end'
    nextVertexPos?: THREE.Vector3
    rotation?: number
    isRightClickDrag?: boolean
  } | null = null

  let dragDelta = new THREE.Vector3()
  let activePointer: number | null = null

  /* ---------- Utilidades de puntero e imán (Snap to Grid + Snap to Walls) ---------- */

  function groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    return viewport.pointerToGround(clientX, clientY)
  }

  function snapWithInfo(
    point: THREE.Vector3,
    excludeWallId?: string
  ): { point: THREE.Vector3; kind: 'wall-vertex' | 'wall-edge' | 'grid' | 'none' } {
    const walls = excludeWallId
      ? scene.getWalls().filter((w) => w.id !== excludeWallId)
      : scene.getWalls()
    const gridStep = Math.min(0.5, cellSize)
    const res = snapPointToWallsAndGrid(point, walls, scene.getActiveLevelId(), {
      snapEnabled: options.snapEnabled(),
      gridStep
    })
    return { point: res.point, kind: res.kind }
  }

  function snap(point: THREE.Vector3, excludeWallId?: string): THREE.Vector3 {
    return snapWithInfo(point, excludeWallId).point
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

  function notifyTemplateState(): void {
    options.onTemplateStateChange?.(templateState ? { ...templateState } : null)
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

  /* ---------- Modo `template`: plantillas interactivas de muros 2D ---------- */

  function computeTemplatePlacement(
    anchor: THREE.Vector3,
    current: THREE.Vector3 | null
  ): {
    centerX: number
    centerZ: number
    buildWidth: number
    buildDepth: number
    screenWidth: number
    screenDepth: number
    isDraggingSize: boolean
  } {
    const tpl = templateState!
    const rotNorm = (((tpl.rotationDeg % 360) + 360) % 360)
    const isRotated90 = rotNorm === 90 || rotNorm === 270

    if (current) {
      const spanX = Math.abs(current.x - anchor.x)
      const spanZ = Math.abs(current.z - anchor.z)
      if (spanX >= TEMPLATE_DRAG_THRESHOLD || spanZ >= TEMPLATE_DRAG_THRESHOLD) {
        const effSpanX = Math.max(1.0, Math.round(spanX * 100) / 100)
        const effSpanZ = Math.max(1.0, Math.round(spanZ * 100) / 100)
        const signX = current.x >= anchor.x ? 1 : -1
        const signZ = current.z >= anchor.z ? 1 : -1
        const centerX = anchor.x + (signX * effSpanX) / 2
        const centerZ = anchor.z + (signZ * effSpanZ) / 2
        return {
          centerX,
          centerZ,
          buildWidth: isRotated90 ? effSpanZ : effSpanX,
          buildDepth: isRotated90 ? effSpanX : effSpanZ,
          screenWidth: effSpanX,
          screenDepth: effSpanZ,
          isDraggingSize: true
        }
      }
    }

    const screenWidth = isRotated90 ? tpl.depth : tpl.width
    const screenDepth = isRotated90 ? tpl.width : tpl.depth
    return {
      centerX: anchor.x,
      centerZ: anchor.z,
      buildWidth: tpl.width,
      buildDepth: tpl.depth,
      screenWidth,
      screenDepth,
      isDraggingSize: false
    }
  }

  function refreshTemplatePreviewFromClient(clientX: number, clientY: number): void {
    if (mode !== 'template' || !templateState) return
    const raw = groundPoint(clientX, clientY)
    if (!raw) {
      viewport.clearToolPreview()
      return
    }
    const snapped = snapWithInfo(raw)
    const elev = options.activeLevelElevation()

    const anchor = placingTemplate && templateDragStart ? templateDragStart : snapped.point
    const cursor = placingTemplate && templateDragStart ? snapped.point : null
    const placement = computeTemplatePlacement(anchor, cursor)

    const prevLiveW = templateState.liveWidth
    const prevLiveD = templateState.liveDepth
    const prevDrag = templateState.isDragging
    templateState.liveWidth = placement.buildWidth
    templateState.liveDepth = placement.buildDepth
    templateState.isDragging = placement.isDraggingSize
    if (
      prevLiveW !== templateState.liveWidth ||
      prevLiveD !== templateState.liveDepth ||
      prevDrag !== templateState.isDragging
    ) {
      notifyTemplateState()
    }

    const segments = buildWallTemplateSegments({
      templateId: templateState.templateId,
      centerX: placement.centerX,
      centerZ: placement.centerZ,
      width: placement.buildWidth,
      depth: placement.buildDepth,
      rotationDeg: templateState.rotationDeg,
      elevation: elev,
      lVariant: templateState.lVariant,
      segmentsCount: templateState.segmentsCount
    })

    viewport.setWallTemplatePreview(segments, {
      thickness: 0.2,
      height: 2.5,
      snapPoint: new THREE.Vector3(snapped.point.x, elev, snapped.point.z),
      snapKind: snapped.kind
    })
  }

  function startTemplatePlacement(e: PointerEvent): void {
    if (!templateState) return
    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) return
    lastPointerClient = { x: e.clientX, y: e.clientY }
    placingTemplate = true
    templateDragStart = snap(raw)
    refreshTemplatePreviewFromClient(e.clientX, e.clientY)
  }

  function previewTemplateDrag(e: PointerEvent): void {
    lastPointerClient = { x: e.clientX, y: e.clientY }
    refreshTemplatePreviewFromClient(e.clientX, e.clientY)
  }

  function finishTemplatePlacement(e: PointerEvent): void {
    const start = templateDragStart
    const tpl = templateState
    placingTemplate = false
    templateDragStart = null
    if (!start || !tpl) {
      viewport.clearToolPreview()
      return
    }

    const raw = groundPoint(e.clientX, e.clientY)
    const endSnap = raw ? snap(raw) : start
    const placement = computeTemplatePlacement(start, endSnap)

    tpl.liveWidth = tpl.width
    tpl.liveDepth = tpl.depth
    tpl.isDragging = false
    notifyTemplateState()

    const segments = buildWallTemplateSegments({
      templateId: tpl.templateId,
      centerX: placement.centerX,
      centerZ: placement.centerZ,
      width: placement.buildWidth,
      depth: placement.buildDepth,
      rotationDeg: tpl.rotationDeg,
      elevation: 0,
      lVariant: tpl.lVariant,
      segmentsCount: tpl.segmentsCount
    })

    if (segments.length === 0) {
      viewport.clearToolPreview()
      return
    }

    const def = getWallTemplateDef(tpl.templateId)
    const createdWalls: Wall[] = []
    const wallType =
      options.activeWallType() === WallSegmentType.StructuralSegment
        ? WallSegmentType.StructuralSegment
        : WallSegmentType.SimpleWall

    const createAll = (): void => {
      for (const seg of segments) {
        if (seg.start.distanceTo(seg.end) < MIN_WALL_LENGTH) continue
        const w = scene.addWall(wallType, seg.start.clone(), seg.end.clone())
        createdWalls.push(w)
      }
    }

    if (options.history) {
      options.history.transaction(`Plantilla: ${def.shortLabel}`, createAll)
    } else {
      createAll()
    }

    if (createdWalls.length > 0) {
      scene.selectWalls(createdWalls)
    }

    // Actualiza la previsualización fantasma para poder seguir colocando o pulsar [S]/[Esc] para editar
    if (lastPointerClient) {
      refreshTemplatePreviewFromClient(lastPointerClient.x, lastPointerClient.y)
    }

    options.onMessage(
      `${def.shortLabel}: ${createdWalls.length} muros reales conectados (${fmt(placement.screenWidth)} × ${fmt(placement.screenDepth)} m). [G] rotar · [S]/[Esc] seleccionar lados individuales · Ctrl+Z deshacer.`
    )
  }

  /* ---------- Mover elementos o estirar extremos de muros ---------- */

  function detectSelectedWallEndpoint(raw: THREE.Vector3): { wall: Wall; end: 'start' | 'end' } | null {
    const selectedWall = scene.getSelected()
    if (!selectedWall || selectedWall.levelId !== scene.getActiveLevelId()) return null
    const dStart = Math.hypot(raw.x - selectedWall.start.x, raw.z - selectedWall.start.z)
    const dEnd = Math.hypot(raw.x - selectedWall.end.x, raw.z - selectedWall.end.z)
    if (dStart <= ENDPOINT_GRIP_RADIUS && dStart <= dEnd) {
      return { wall: selectedWall, end: 'start' }
    }
    if (dEnd <= ENDPOINT_GRIP_RADIUS) {
      return { wall: selectedWall, end: 'end' }
    }
    return null
  }

  function startMoveElement(e: PointerEvent, isRightClick: boolean): boolean {
    const raw = groundPoint(e.clientX, e.clientY)

    // 1. Si hay un muro individual seleccionado y el usuario pulsa sobre uno de sus nodos extremos, estirarlo
    if (!isRightClick && raw) {
      const gripHit = detectSelectedWallEndpoint(raw)
      if (gripHit) {
        activePointer = e.pointerId
        dragDelta.set(0, 0, 0)
        const movingPt = gripHit.end === 'start' ? gripHit.wall.start.clone() : gripHit.wall.end.clone()
        drag = {
          kind: 'wall-vertex',
          id: gripHit.wall.id,
          grab: raw,
          origin: movingPt.clone(),
          start: gripHit.wall.start.clone(),
          end: gripHit.wall.end.clone(),
          vertexEnd: gripHit.end,
          nextVertexPos: movingPt.clone(),
          isRightClickDrag: false
        }
        options.onMessage(
          `Estirando extremo de «${gripHit.wall.label}»: arrastra con imán a rejilla o muros · Suelta para fijar.`
        )
        return true
      }
    }

    const wall = viewport.pickWall(e.clientX, e.clientY)
    const object = wall ? null : viewport.pickObject(e.clientX, e.clientY)

    if (!wall && !object) {
      if (!isRightClick && mode === 'select') {
        scene.select(null)
        scene.selectObject(null)
      }
      return false
    }

    if (!raw) return false
    activePointer = e.pointerId
    dragDelta.set(0, 0, 0)

    if (wall) {
      scene.select(wall)

      // Si se pulsa directamente cerca del extremo de un muro suficientemente largo en modo selección, estirar extremo
      if (!isRightClick && wall.length >= 0.9) {
        const dStart = Math.hypot(raw.x - wall.start.x, raw.z - wall.start.z)
        const dEnd = Math.hypot(raw.x - wall.end.x, raw.z - wall.end.z)
        if (dStart <= ENDPOINT_BODY_RADIUS || dEnd <= ENDPOINT_BODY_RADIUS) {
          const endKey: 'start' | 'end' = dStart <= dEnd ? 'start' : 'end'
          const movingPt = endKey === 'start' ? wall.start.clone() : wall.end.clone()
          drag = {
            kind: 'wall-vertex',
            id: wall.id,
            grab: raw,
            origin: movingPt.clone(),
            start: wall.start.clone(),
            end: wall.end.clone(),
            vertexEnd: endKey,
            nextVertexPos: movingPt.clone(),
            isRightClickDrag: false
          }
          options.onMessage(
            `Estirando extremo de «${wall.label}»: arrastra para ajustar longitud o ángulo · Suelta para fijar.`
          )
          return true
        }
      }

      drag = {
        kind: 'wall',
        id: wall.id,
        grab: raw,
        origin: raw.clone(),
        start: wall.start.clone(),
        end: wall.end.clone(),
        isRightClickDrag: isRightClick
      }
      options.onMessage(
        `«${wall.label}» (${fmt(wall.length)} m): arrastra el cuerpo para mover o los nodos azules extremos para estirar.`
      )
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
    options.onMessage(`Moviendo «${object!.name}»: arrastra para reposicionar · [G] rotar 90° · Ctrl+Z deshace.`)
    return true
  }

  function updateDrag(e: PointerEvent): void {
    if (!drag) return
    const raw = groundPoint(e.clientX, e.clientY)
    if (!raw) return

    if (drag.kind === 'wall-vertex' && drag.start && drag.end && drag.vertexEnd) {
      const fixedPt = drag.vertexEnd === 'start' ? drag.end : drag.start
      const snapped = snapWithInfo(raw, drag.id)
      const targetPt = applyOrtho(fixedPt, snapped.point)
      const nextLen = Math.hypot(targetPt.x - fixedPt.x, targetPt.z - fixedPt.z)
      if (nextLen < MIN_WALL_LENGTH) return

      drag.nextVertexPos = targetPt.clone()
      dragDelta = targetPt.clone().sub(drag.origin)
      const nextStart = drag.vertexEnd === 'start' ? targetPt : drag.start
      const nextEnd = drag.vertexEnd === 'end' ? targetPt : drag.end
      scene.moveWall(drag.id, nextStart, nextEnd, true)
      viewport.setToolPreview(
        { start: elevated(nextStart), end: elevated(nextEnd) },
        elevated(targetPt)
      )
      return
    }

    const delta = raw.clone().sub(drag.grab)
    const snapStep = Math.min(0.5, cellSize)
    dragDelta = options.snapEnabled()
      ? GridNode.nearestTo(delta, snapStep).worldPosition.clone()
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
    viewport.clearToolPreview()
    if (!current) return
    if (dragDelta.lengthSq() < 1e-12) return

    if (current.kind === 'wall-vertex' && current.start && current.end && current.vertexEnd && current.nextVertexPos) {
      const nextStart = current.vertexEnd === 'start' ? current.nextVertexPos.clone() : current.start.clone()
      const nextEnd = current.vertexEnd === 'end' ? current.nextVertexPos.clone() : current.end.clone()
      const newLen = nextStart.distanceTo(nextEnd)
      scene.moveWall(current.id, nextStart, nextEnd, false)
      options.onMessage(`Muro ajustado a ${fmt(newLen)} m. Ctrl+Z para deshacer.`)
      return
    }

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
    const terrainHit = viewport.pickTerrain(e.clientX, e.clientY)
    const raw = terrainHit ? terrainHit.point : groundPoint(e.clientX, e.clientY)
    if (!raw) return

    // Si es una abertura (puerta/ventana), colocar sobre muro con perforación booleana real.
    const isOpening =
      Boolean(spec.shapeId && spec.shapeId.startsWith('opening.') && spec.shapeId !== 'opening.slab')
    if (isOpening) {
      placeOpening(e, spec, raw)
      return
    }

    const object = new SceneObject(spec.name, spec.kind)
    const snappedXZ = snap(raw)
    object.position.set(snappedXZ.x, options.activeLevelElevation(), snappedXZ.z)
    object.levelId = scene.getActiveLevelId()
    if (spec.rotationY !== undefined) {
      object.rotationY = spec.rotationY
    }

    // Si existe terreno topográfico bajo la coordenada XZ, apoyar la base de la estructura en su cota Z
    const sampledTerrain = sampleAnyTerrainAt(scene.getTerrains(), object.position.x, object.position.z)
    if (sampledTerrain) {
      object.position.y = Math.round(sampledTerrain.elevation * 100) / 100
    }

    if (spec.color !== undefined) object.color = spec.color
    if (spec.materialId !== undefined) object.materialId = spec.materialId
    if (spec.shapeId) {
      const natural = naturalSizeForShape(spec.shapeId)
      if (natural) object.size.copy(natural)
      object.shapeId = spec.shapeId ?? null
      object.color = spec.color ?? defaultColorForShape(spec.shapeId)
      if (isParametricStructuralShape(spec.shapeId)) {
        const def = defaultStructuralParamsFor(spec.shapeId)
        object.structuralParams = spec.structuralParams ? { ...def.params, ...spec.structuralParams } : { ...def.params }
        if (!object.materialId) {
          object.materialId = STRUCTURAL_MATERIAL_TO_CATALOG[object.structuralParams.materialType] ?? null
        }
      }
    }
    if (spec.structuralParams && !object.structuralParams) {
      object.structuralParams = { ...spec.structuralParams }
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
  function findNearestWallAtPoint(point: THREE.Vector3, maxDist = 0.5): Wall | null {
    const activeLevelId = scene.getActiveLevelId()
    let bestWall: Wall | null = null
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

    const swingInfo = detectSwingFromPointer(wall.start, wall.end, raw, t)

    const addOpeningAndObject = (): void => {
      // Hueco booleano real en el muro.
      const addedOpening = scene.addOpening(wall.id, {
        wallId: wall.id,
        x: t,
        width,
        height,
        sill,
        type,
        materialId: spec.materialId ?? null,
        style: isDoor ? (variant === 'doble' ? 'dobleHoja' : 'lisa') : (variant === 'pisoTecho' ? 'pisoTecho' : 'corrediza2'),
        swingHand: swingInfo.swingHand,
        swingDirection: swingInfo.swingDirection,
        openingAngle: 0
      })

      const levelElev = scene.getLevel(wall.levelId)?.elevation ?? options.activeLevelElevation()

      // Objeto 3D de carpintería (marco, hoja/perfilería, cristal PBR, manijas) alineado al vano.
      const object = new SceneObject(spec.name, spec.kind)
      object.levelId = wall.levelId
      object.position.set(wall.start.x + ux * t, levelElev + sill, wall.start.z + uz * t)
      object.rotationY = -Math.atan2(dz, dx)
      object.openingVariant = variant
      object.doorStyle = isDoor ? (variant === 'doble' ? 'dobleHoja' : 'lisa') : null
      object.windowStyle = !isDoor ? (variant === 'pisoTecho' ? 'pisoTecho' : 'corrediza2') : null
      object.swingHand = swingInfo.swingHand
      object.swingDirection = swingInfo.swingDirection
      object.openingAngle = 0
      object.openingId = addedOpening.id
      object.shapeId = shapeId
      object.materialId = spec.materialId ?? (isDoor ? 'mat.wood' : 'mat.glass')
      object.size.set(width, height, wall.thickness)

      scene.addObject(object)
      scene.selectObject(object)
      openDoorPropertiesPanel(object, scene)
    }

    if (options.history) {
      options.history.transaction(`Insertar ${spec.name}`, addOpeningAndObject)
    } else {
      addOpeningAndObject()
    }

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
    lastPointerClient = { x: e.clientX, y: e.clientY }
    // La herramienta externa (techo) pinta su propia previsualización.
    if (externalActive()) return
    if (activePointer !== null) return

    if (mode === 'template') {
      refreshTemplatePreviewFromClient(e.clientX, e.clientY)
      return
    }

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
    // Otra herramienta controla el lienzo (trazo de techo o topografía): no interferir.
    if (externalActive()) return
    // Si el usuario pulsa sobre las flechas/anillos del gizmo 3D (`TransformControls`), dejar que lo gestione.
    if (viewport.isTransformGizmoDragging() || viewport.isPointerOverTransformGizmo()) return

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

    // CLIC IZQUIERDO (botón 0)
    if (e.button === 0) {
      if (mode === 'wall') {
        activePointer = e.pointerId
        canvas.classList.add('is-interacting')
        startWall(e)
        return
      }
      if (mode === 'template') {
        activePointer = e.pointerId
        canvas.classList.add('is-interacting')
        startTemplatePlacement(e)
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
    else if (placingTemplate) previewTemplateDrag(e)
    else if (drag) updateDrag(e)
  }

  function onPointerUp(e: PointerEvent): void {
    if (activePointer === null || e.pointerId !== activePointer) return
    activePointer = null
    canvas.classList.remove('is-interacting')
    if (drawing) finishWall(e)
    else if (placingTemplate) finishTemplatePlacement(e)
    else if (drag) finishDrag()
  }

  function intercepts(e: PointerEvent): boolean {
    if (viewport.isTransformGizmoDragging() || viewport.isPointerOverTransformGizmo()) return true
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
      const raw = groundPoint(e.clientX, e.clientY)
      if (raw && detectSelectedWallEndpoint(raw) !== null) return true
      return (
        viewport.pickWall(e.clientX, e.clientY) !== null ||
        viewport.pickObject(e.clientX, e.clientY) !== null
      )
    }

    return false
  }

  function hasActiveStroke(): boolean {
    return drawing || placingTemplate || drag !== null
  }

  function cancel(): void {
    drawing = false
    placingTemplate = false
    drag = null
    drawStart = null
    templateDragStart = null
    dragDelta.set(0, 0, 0)
    activePointer = null
    canvas.classList.remove('is-interacting')
    if (templateState && templateState.isDragging) {
      templateState.isDragging = false
      templateState.liveWidth = templateState.width
      templateState.liveDepth = templateState.depth
      notifyTemplateState()
    }
    viewport.clearToolPreview()
  }

  function setMode(next: ToolMode): void {
    cancel()
    if (next !== 'place') pending = null
    if (next !== 'template' && templateState !== null) {
      templateState = null
      notifyTemplateState()
    }
    mode = next
    options.onModeChange?.(next)
  }

  function setPendingObject(spec: PendingObjectSpec | null): void {
    pending = spec
    templateState = null
    notifyTemplateState()
    cancel()
    mode = spec ? 'place' : 'select'
    options.onModeChange?.(mode)
  }

  function setWallTemplate(templateId: WallTemplateId | null): void {
    cancel()
    pending = null
    if (!templateId) {
      templateState = null
      notifyTemplateState()
      mode = 'select'
      options.onModeChange?.('select')
      return
    }
    const def = getWallTemplateDef(templateId)
    templateState = {
      templateId: def.id,
      width: def.defaultWidth,
      depth: def.defaultDepth,
      rotationDeg: 0,
      lVariant: 'room',
      segmentsCount: def.defaultSegments ?? 12,
      liveWidth: def.defaultWidth,
      liveDepth: def.defaultDepth,
      isDragging: false
    }
    mode = 'template'
    notifyTemplateState()
    options.onModeChange?.('template')
    if (lastPointerClient) {
      refreshTemplatePreviewFromClient(lastPointerClient.x, lastPointerClient.y)
    }
  }

  function updateWallTemplateParams(patch: WallTemplateParamsPatch): void {
    if (!templateState) return
    if (patch.width !== undefined && Number.isFinite(patch.width)) {
      templateState.width = Math.max(0.5, Math.min(60, Math.round(patch.width * 100) / 100))
      if (!templateState.isDragging) templateState.liveWidth = templateState.width
    }
    if (patch.depth !== undefined && Number.isFinite(patch.depth)) {
      templateState.depth = Math.max(0.5, Math.min(60, Math.round(patch.depth * 100) / 100))
      if (!templateState.isDragging) templateState.liveDepth = templateState.depth
    }
    if (patch.rotationDeg !== undefined && Number.isFinite(patch.rotationDeg)) {
      templateState.rotationDeg = (((Math.round(patch.rotationDeg) % 360) + 360) % 360)
    }
    if (patch.lVariant !== undefined) {
      templateState.lVariant = patch.lVariant
    }
    if (patch.segmentsCount !== undefined && Number.isFinite(patch.segmentsCount)) {
      templateState.segmentsCount = Math.max(3, Math.min(36, Math.round(patch.segmentsCount)))
    }
    notifyTemplateState()
    if (lastPointerClient && mode === 'template') {
      refreshTemplatePreviewFromClient(lastPointerClient.x, lastPointerClient.y)
    }
  }

  function rotatePending90(): boolean {
    if (mode === 'template' && templateState) {
      templateState.rotationDeg = (templateState.rotationDeg + 90) % 360
      notifyTemplateState()
      if (lastPointerClient) {
        refreshTemplatePreviewFromClient(lastPointerClient.x, lastPointerClient.y)
      }
      const def = getWallTemplateDef(templateState.templateId)
      options.onMessage(`${def.shortLabel} rotada a ${templateState.rotationDeg}° antes de colocar.`)
      return true
    }
    if (mode === 'place' && pending) {
      pending.rotationY = (pending.rotationY ?? 0) - Math.PI / 2
      const deg = Math.round((((-pending.rotationY * 180) / Math.PI) % 360 + 360) % 360)
      options.onMessage(`«${pending.name}» rotado a ${deg}° antes de colocar.`)
      return true
    }
    return false
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

  function onDblClick(e: MouseEvent): void {
    const obj = viewport.pickObject(e.clientX, e.clientY)
    if (obj && (obj.openingId || resolveObjectOpeningSpec(obj))) {
      const nextAngle = (obj.openingAngle ?? 0) > 0 ? 0 : 90
      scene.updateObject(obj.id, { openingAngle: nextAngle })
      options.onMessage(
        nextAngle > 0
          ? `«${obj.name}» abierta a 90° en 3D.`
          : `«${obj.name}» cerrada (0°).`
      )
      openDoorPropertiesPanel(obj, scene)
      return
    }

    // Raycast para enfocar y re-centrar suavemente el pivote de cámara en cualquier elemento 3D
    const surfaceHit = viewport.pickSurface(e.clientX, e.clientY)
    if (surfaceHit) {
      options.onFocusPoint?.(surfaceHit.point)
      return
    }

    const groundHit = viewport.pointerToPlane(e.clientX, e.clientY, 0)
    if (groundHit) {
      options.onFocusPoint?.(groundHit)
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', updateHover)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('dblclick', onDblClick)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  return {
    setMode,
    getMode: () => mode,
    setPendingObject,
    getPendingObject: () => pending,
    setWallTemplate,
    getWallTemplateState: () => (templateState ? { ...templateState } : null),
    updateWallTemplateParams,
    rotatePending90,
    hasActiveStroke,
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
      cancel()
    }
  }
}
