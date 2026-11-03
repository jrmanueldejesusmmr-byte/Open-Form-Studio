import * as THREE from 'three'
import {
  type AnnotationItem,
  type AnnotationMode,
  type AnnotationPoint,
  type DimensionAnnotation,
  type HighlightAnnotation,
  type HighlightColor,
  type LeaderAnnotation,
  type NoteAnnotation,
  type RevisionAnnotation,
  type TableAnnotation,
  type TagAnnotation,
  type TextAnnotation,
  ANNOTATION_ACTIONS,
  ANNOTATION_MODE_LABELS,
  createAnnotationId,
  editableField,
  translateAnnotation
} from './types'
import {
  type AnnotationDraft,
  type AnnotationRenderContext,
  type ScreenPoint,
  type TableData,
  renderAnnotations,
  renderDraft
} from './AnnotationRenderer'
import type { SceneManager } from '../engine/SceneManager'
import type { ViewportRenderer } from '../engine/ViewportRenderer'
import { MATERIAL_DEFS } from '../engine/MaterialSystem'

export interface UseAnnotationsOptions {
  canvas: HTMLCanvasElement
  container: HTMLElement
  viewport: ViewportRenderer
  scene: SceneManager
  snapEnabled: () => boolean
  activeLevelElevation: () => number
  onMessage?: (msg: string) => void
  onModeChange?: (mode: AnnotationMode | null) => void
  projectName?: () => string
  history?: { transaction(name: string, fn: () => void): void }
}

export interface AnnotationsHandle {
  setMode(mode: AnnotationMode | null): void
  getMode(): AnnotationMode | null
  isActive(): boolean
  getItems(): AnnotationItem[]
  setItems(items: AnnotationItem[]): void
  addItem(item: AnnotationItem): void
  deleteItem(id: string): void
  clear(): void
  selectItem(id: string | null): void
  getSelectedId(): string | null
  update(): void
  cancel(): void
  dispose(): void
  tableData(): TableData
  setHighlightColor(color: HighlightColor): void
  getHighlightColor(): HighlightColor
  setHighlightShape(shape: 'freehand' | 'rect'): void
  getHighlightShape(): 'freehand' | 'rect'
  rotateSelectedText(): void
}

/** Snap a vértices de muros, extremos de aberturas (puertas/ventanas) o nodos de rejilla. */
function snapVertex(
  raw: THREE.Vector3,
  scene: SceneManager,
  snapEnabled: boolean,
  threshold = 0.4
): THREE.Vector3 {
  if (!snapEnabled) return raw.clone()

  let bestPoint: THREE.Vector3 | null = null
  let bestDist = threshold

  // 1. Muros y aberturas
  for (const wall of scene.getWalls()) {
    if (wall.visible === false) continue
    const candidates: THREE.Vector3[] = [wall.start, wall.end]
    const dir = new THREE.Vector3().subVectors(wall.end, wall.start)
    const len = dir.length()
    if (len > 1e-4) {
      dir.normalize()
      for (const op of wall.openings) {
        candidates.push(
          wall.start.clone().addScaledVector(dir, op.x),
          wall.start.clone().addScaledVector(dir, op.x + op.width)
        )
      }
    }
    for (const pt of candidates) {
      const d = Math.hypot(pt.x - raw.x, pt.z - raw.z)
      if (d < bestDist) {
        bestDist = d
        bestPoint = new THREE.Vector3(pt.x, raw.y, pt.z)
      }
    }
  }

  // 2. Objetos
  for (const obj of scene.getObjects()) {
    if (obj.visible === false) continue
    const p = new THREE.Vector3(obj.position.x, raw.y, obj.position.z)
    const d = Math.hypot(p.x - raw.x, p.z - raw.z)
    if (d < bestDist) {
      bestDist = d
      bestPoint = p
    }
  }

  // 3. Rejilla (paso 0.5 m)
  if (!bestPoint) {
    const s = 0.5
    return new THREE.Vector3(Math.round(raw.x / s) * s, raw.y, Math.round(raw.z / s) * s)
  }

  return bestPoint
}

/** Detecta el nombre legible del material del elemento tocado por el raycaster. */
function detectMaterialName(hit: { kind: 'wall' | 'object'; id: string }, scene: SceneManager): string {
  if (hit.kind === 'wall') {
    const wall = scene.getWall(hit.id)
    if (wall?.materialId && MATERIAL_DEFS[wall.materialId]?.label) {
      return MATERIAL_DEFS[wall.materialId].label
    }
    return 'Ladrillo estándar'
  } else {
    const obj = scene.getObject(hit.id)
    if (obj) {
      if (obj.materialId && MATERIAL_DEFS[obj.materialId]?.label) {
        return MATERIAL_DEFS[obj.materialId].label
      }
      if (obj.name) return obj.name
    }
    return 'Concreto estructural'
  }
}

/** Calcula los datos paramétricos en tiempo real para el cuadro de rotulación. */
function computeTableData(
  scene: SceneManager,
  projectName: string,
  viewMode: '2d' | '3d'
): TableData {
  const walls = scene.getWalls()
  const wallCount = walls.length

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x)
    maxX = Math.max(maxX, w.start.x, w.end.x)
    minZ = Math.min(minZ, w.start.z, w.end.z)
    maxZ = Math.max(maxZ, w.start.z, w.end.z)
  }

  let areaStr = '0.00 m²'
  if (wallCount > 0 && Number.isFinite(minX) && maxX > minX && maxZ > minZ) {
    const footprint = (maxX - minX) * (maxZ - minZ)
    const estimated = footprint * 0.75
    areaStr = `${estimated.toFixed(1)} m²`
  }

  const activeLevel = scene.getActiveLevel()
  const levelName = activeLevel?.name ?? 'Piso 0'

  return {
    projectName: projectName || 'Proyecto ArqStudio',
    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    scale: viewMode === '2d' ? '1:50' : 'Perspectiva',
    wallCount,
    area: areaStr,
    level: levelName
  }
}

/**
 * Controlador principal de las 8 herramientas del menú «Notas».
 *
 * Mantiene la máquina de estados interactiva para cada herramienta, renderiza la
 * capa SVG/HTML superpuesta en el viewport y sincroniza el almacenamiento.
 */
export function mountAnnotations(options: UseAnnotationsOptions): AnnotationsHandle {
  const { canvas, container, viewport, scene } = options

  let mode: AnnotationMode | null = null
  let items: AnnotationItem[] = []
  let selectedId: string | null = null
  let editingId: string | null = null

  let highlightColor: HighlightColor = 'yellow'
  let highlightShape: 'freehand' | 'rect' = 'freehand'

  // Estados de borrador
  let leaderDraft: { tip: AnnotationPoint; elbow?: AnnotationPoint; current: AnnotationPoint } | null = null
  let dimensionDraft: { start: AnnotationPoint; end?: AnnotationPoint; current: AnnotationPoint; offset?: number } | null = null
  let revisionDraft: { points: AnnotationPoint[]; current?: AnnotationPoint } | null = null
  let highlightDraft: { points: AnnotationPoint[]; shape: 'freehand' | 'rect'; color: HighlightColor; width: number } | null = null
  let isPointerDown = false
  let pointerDownPos: { clientX: number; clientY: number } | null = null

  // Estado de arrastre de una anotación seleccionada
  let dragMoveState: {
    item: AnnotationItem
    startGround: THREE.Vector3
    lastGround: THREE.Vector3
  } | null = null

  // --- Capa DOM Overlay ---
  const overlay = document.createElement('div')
  overlay.className = 'annotations-overlay'
  overlay.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;'

  const svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgLayer.setAttribute('class', 'annotations-svg')
  svgLayer.style.cssText =
    'width:100%;height:100%;position:absolute;inset:0;pointer-events:none;overflow:visible;'
  overlay.appendChild(svgLayer)

  const htmlLayer = document.createElement('div')
  htmlLayer.className = 'annotations-html'
  htmlLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  overlay.appendChild(htmlLayer)

  const draftSvgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  draftSvgLayer.setAttribute('class', 'annotations-draft-svg')
  draftSvgLayer.style.cssText =
    'width:100%;height:100%;position:absolute;inset:0;pointer-events:none;overflow:visible;'
  overlay.appendChild(draftSvgLayer)

  const draftHtmlLayer = document.createElement('div')
  draftHtmlLayer.className = 'annotations-draft-html'
  draftHtmlLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  overlay.appendChild(draftHtmlLayer)

  // Editor en línea flotante
  const inlineEditor = document.createElement('textarea')
  inlineEditor.className = 'annot-inline-editor'
  inlineEditor.style.cssText = 'display:none;position:absolute;z-index:30;'
  overlay.appendChild(inlineEditor)

  container.appendChild(overlay)

  function message(msg: string): void {
    options.onMessage?.(msg)
  }

  function getGroundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const elev = options.activeLevelElevation()
    return viewport.pointerToPlane(clientX, clientY, elev) ?? viewport.pointerToGround(clientX, clientY)
  }

  function createRenderContext(): AnnotationRenderContext {
    return {
      project: (p: AnnotationPoint): ScreenPoint | null => {
        const proj = viewport.projectPoint(new THREE.Vector3(p.x, p.y, p.z))
        if (!proj || proj.behind) return null
        return { x: proj.x, y: proj.y }
      },
      pixelsPerMeter: (p: AnnotationPoint): number => {
        const p0 = viewport.projectPoint(new THREE.Vector3(p.x, p.y, p.z))
        const p1 = viewport.projectPoint(new THREE.Vector3(p.x + 1, p.y, p.z))
        if (!p0 || !p1) return 50
        return Math.max(10, Math.hypot(p1.x - p0.x, p1.y - p0.y))
      },
      selectedId,
      editingId,
      tableData: () => computeTableData(scene, options.projectName?.() ?? '', viewport.getViewMode()),
      tagLabel: (item: TagAnnotation): string => {
        if (item.targetKind === 'wall') {
          const w = scene.getWall(item.targetId)
          if (w?.materialId && MATERIAL_DEFS[w.materialId]?.label) return MATERIAL_DEFS[w.materialId].label
        } else if (item.targetKind === 'object') {
          const o = scene.getObject(item.targetId)
          if (o?.materialId && MATERIAL_DEFS[o.materialId]?.label) return MATERIAL_DEFS[o.materialId].label
        }
        return item.label || 'Material'
      }
    }
  }

  function render(): void {
    const ctx = createRenderContext()
    const activeLevelId = scene.getActiveLevelId()
    const visibleItems = items.filter((it) => it.levelId === activeLevelId)

    const rendered = renderAnnotations(visibleItems, ctx)
    svgLayer.innerHTML = rendered.svg
    htmlLayer.innerHTML = rendered.html

    // Previsualización de borrador
    const currentDraft = getCurrentDraft()
    if (currentDraft) {
      const draftRendered = renderDraft(currentDraft, ctx)
      draftSvgLayer.innerHTML = draftRendered.svg
      draftHtmlLayer.innerHTML = draftRendered.html
    } else {
      draftSvgLayer.innerHTML = ''
      draftHtmlLayer.innerHTML = ''
    }
  }

  function getCurrentDraft(): AnnotationDraft | null {
    if (leaderDraft) return { type: 'leader', ...leaderDraft }
    if (dimensionDraft) return { type: 'dimension', ...dimensionDraft }
    if (revisionDraft) return { type: 'revision', ...revisionDraft }
    if (highlightDraft) return { type: 'highlight', ...highlightDraft }
    return null
  }

  function updateCursor(): void {
    if (mode) {
      canvas.style.cursor = 'crosshair'
    } else {
      canvas.style.cursor = ''
    }
  }

  function setMode(newMode: AnnotationMode | null): void {
    cancelDraft()
    mode = newMode
    updateCursor()
    options.onModeChange?.(mode)
    if (mode) {
      message(`Herramienta «${ANNOTATION_MODE_LABELS[mode]}» activada. Esc para cancelar.`)
    } else {
      message('Modo selección de anotaciones activado.')
    }
    render()
  }

  function cancelDraft(): void {
    leaderDraft = null
    dimensionDraft = null
    revisionDraft = null
    highlightDraft = null
    isPointerDown = false
    pointerDownPos = null
    dragMoveState = null
    closeInlineEditor(false)
    render()
  }

  function cancel(): void {
    if (editingId) {
      closeInlineEditor(false)
      return
    }
    if (getCurrentDraft()) {
      cancelDraft()
      message('Trazo cancelado.')
      return
    }
    if (mode) {
      setMode(null)
      return
    }
    if (selectedId) {
      selectedId = null
      render()
    }
  }

  function showInlineEditor(
    item: AnnotationItem,
    screenPos: ScreenPoint,
    field: 'text' | 'badge'
  ): void {
    editingId = item.id
    render()

    const currentVal =
      field === 'badge' && item.type === 'revision'
        ? item.badge
        : 'text' in item
          ? (item as { text: string }).text
          : ''

    inlineEditor.value = currentVal
    inlineEditor.style.display = 'block'
    inlineEditor.style.left = `${screenPos.x}px`
    inlineEditor.style.top = `${screenPos.y}px`
    inlineEditor.focus()
    inlineEditor.select()

    const onBlur = (): void => {
      closeInlineEditor(true)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        closeInlineEditor(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeInlineEditor(false)
      }
    }

    inlineEditor.onblur = onBlur
    inlineEditor.onkeydown = onKeyDown
  }

  function closeInlineEditor(commit: boolean): void {
    if (!editingId) return
    const id = editingId
    editingId = null
    inlineEditor.style.display = 'none'
    inlineEditor.onblur = null
    inlineEditor.onkeydown = null

    if (commit) {
      const val = inlineEditor.value.trim()
      const item = items.find((i) => i.id === id)
      if (item) {
        options.history?.transaction('Editar anotación', () => {
          if (item.type === 'revision') {
            item.badge = val || 'Rev. 1'
          } else if ('text' in item) {
            ;(item as { text: string }).text = val || (item.type === 'note' ? 'Nota' : 'Texto')
          }
        })
      }
    }
    render()
  }

  function deleteSelectedItem(): void {
    if (!selectedId) return
    const id = selectedId
    const idx = items.findIndex((i) => i.id === id)
    if (idx !== -1) {
      options.history?.transaction('Eliminar anotación', () => {
        items.splice(idx, 1)
      })
      selectedId = null
      message('Anotación eliminada.')
      render()
    }
  }

  // --- Manejo de Eventos en el Lienzo ---

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return // Solo botón izquierdo
    isPointerDown = true
    pointerDownPos = { clientX: e.clientX, clientY: e.clientY }

    const raw = getGroundPoint(e.clientX, e.clientY)
    if (!raw) return

    if (!mode) {
      // Modo selección: comprobar si se pulsó sobre una anotación
      const target = (e.target as HTMLElement)?.closest('[data-annot-id]') as HTMLElement | null
      const annotId = target?.getAttribute('data-annot-id')
      if (annotId) {
        const item = items.find((i) => i.id === annotId)
        if (item) {
          selectedId = item.id
          dragMoveState = {
            item,
            startGround: raw.clone(),
            lastGround: raw.clone()
          }
          render()
          return
        }
      } else if (!target) {
        if (selectedId) {
          selectedId = null
          render()
        }
      }
      return
    }

    // Modo activo
    const snapped = snapVertex(raw, scene, options.snapEnabled())
    const activeLevelId = scene.getActiveLevelId()

    switch (mode) {
      case 'note': {
        const note: NoteAnnotation = {
          id: createAnnotationId(),
          levelId: activeLevelId,
          createdAt: Date.now(),
          type: 'note',
          position: { x: snapped.x, y: snapped.y, z: snapped.z },
          text: ''
        }
        options.history?.transaction('Añadir nota', () => items.push(note))
        selectedId = note.id
        setMode(null)
        const proj = viewport.projectPoint(snapped)
        if (proj) showInlineEditor(note, { x: proj.x + 8, y: proj.y + 8 }, 'text')
        break
      }

      case 'leader': {
        if (!leaderDraft) {
          leaderDraft = {
            tip: { x: snapped.x, y: snapped.y, z: snapped.z },
            current: { x: snapped.x, y: snapped.y, z: snapped.z }
          }
          message('Directriz: 2/3 · Clic para fijar el codo (punto de quiebre).')
          render()
        } else if (!leaderDraft.elbow) {
          leaderDraft.elbow = { x: raw.x, y: raw.y, z: raw.z }
          message('Directriz: 3/3 · Clic para fijar el asiento y añadir texto.')
          render()
        } else {
          const end = { x: raw.x, y: raw.y, z: raw.z }
          const leader: LeaderAnnotation = {
            id: createAnnotationId(),
            levelId: activeLevelId,
            createdAt: Date.now(),
            type: 'leader',
            points: [leaderDraft.tip, leaderDraft.elbow, end],
            text: ''
          }
          options.history?.transaction('Añadir directriz', () => items.push(leader))
          selectedId = leader.id
          const tipProj = viewport.projectPoint(new THREE.Vector3(leaderDraft.tip.x, leaderDraft.tip.y, leaderDraft.tip.z))
          const elbowProj = viewport.projectPoint(new THREE.Vector3(leaderDraft.elbow.x, leaderDraft.elbow.y, leaderDraft.elbow.z))
          const endProj = viewport.projectPoint(new THREE.Vector3(end.x, end.y, end.z))
          cancelDraft()
          setMode(null)
          if (endProj && elbowProj) {
            const landingX = endProj.x >= elbowProj.x ? endProj.x : endProj.x - 72
            showInlineEditor(leader, { x: landingX, y: endProj.y - 20 }, 'text')
          }
        }
        break
      }

      case 'revision': {
        if (!revisionDraft) {
          revisionDraft = {
            points: [{ x: raw.x, y: raw.y, z: raw.z }],
            current: { x: raw.x, y: raw.y, z: raw.z }
          }
          message('Nube de revisión: Clic para añadir vértices o doble clic para cerrar.')
          render()
        } else {
          const first = revisionDraft.points[0]
          const distToFirst = Math.hypot(raw.x - first.x, raw.z - first.z)
          if (revisionDraft.points.length >= 3 && distToFirst < 0.6) {
            // Cierre del polígono
            const rev: RevisionAnnotation = {
              id: createAnnotationId(),
              levelId: activeLevelId,
              createdAt: Date.now(),
              type: 'revision',
              points: [...revisionDraft.points],
              badge: 'Rev. 1'
            }
            options.history?.transaction('Añadir nube de revisión', () => items.push(rev))
            selectedId = rev.id
            cancelDraft()
            setMode(null)
          } else {
            revisionDraft.points.push({ x: raw.x, y: raw.y, z: raw.z })
            render()
          }
        }
        break
      }

      case 'table': {
        const table: TableAnnotation = {
          id: createAnnotationId(),
          levelId: activeLevelId,
          createdAt: Date.now(),
          type: 'table',
          position: { x: snapped.x, y: snapped.y, z: snapped.z }
        }
        options.history?.transaction('Añadir tabla de planos', () => items.push(table))
        selectedId = table.id
        setMode(null)
        message('Tabla de planos colocada con datos en tiempo real.')
        break
      }

      case 'text': {
        const textItem: TextAnnotation = {
          id: createAnnotationId(),
          levelId: activeLevelId,
          createdAt: Date.now(),
          type: 'text',
          position: { x: snapped.x, y: snapped.y, z: snapped.z },
          text: 'SALA',
          fontSize: 0.35,
          rotation: 0
        }
        options.history?.transaction('Añadir texto libre', () => items.push(textItem))
        selectedId = textItem.id
        setMode(null)
        const proj = viewport.projectPoint(snapped)
        if (proj) showInlineEditor(textItem, { x: proj.x - 30, y: proj.y - 12 }, 'text')
        break
      }

      case 'dimension': {
        if (!dimensionDraft) {
          dimensionDraft = {
            start: { x: snapped.x, y: snapped.y, z: snapped.z },
            current: { x: snapped.x, y: snapped.y, z: snapped.z }
          }
          message('Cota lineal: 2/3 · Clic en el punto final (con snap).')
          render()
        } else if (!dimensionDraft.end) {
          dimensionDraft.end = { x: snapped.x, y: snapped.y, z: snapped.z }
          message('Cota lineal: 3/3 · Separa la línea de cota y haz clic.')
          render()
        } else {
          const offset = dimensionDraft.offset ?? 0.5
          const dim: DimensionAnnotation = {
            id: createAnnotationId(),
            levelId: activeLevelId,
            createdAt: Date.now(),
            type: 'dimension',
            start: dimensionDraft.start,
            end: dimensionDraft.end,
            offset
          }
          options.history?.transaction('Añadir cota lineal', () => items.push(dim))
          selectedId = dim.id
          cancelDraft()
          setMode(null)
          message('Cota lineal creada.')
        }
        break
      }

      case 'tag': {
        const picked = viewport.pickSurface(e.clientX, e.clientY)
        if (picked) {
          const matLabel = detectMaterialName(picked, scene)
          const tagItem: TagAnnotation = {
            id: createAnnotationId(),
            levelId: activeLevelId,
            createdAt: Date.now(),
            type: 'tag',
            anchor: { x: picked.point.x, y: picked.point.y, z: picked.point.z },
            targetKind: picked.kind,
            targetId: picked.id,
            label: matLabel,
            labelOffset: { dx: 60, dy: -45 }
          }
          options.history?.transaction('Añadir etiqueta de material', () => items.push(tagItem))
          selectedId = tagItem.id
          setMode(null)
          message(`Etiqueta colocada: ${matLabel}`)
        } else {
          message('Haz clic sobre un muro, piso o techo para etiquetar su material.')
        }
        break
      }

      case 'highlight': {
        highlightDraft = {
          points: [{ x: raw.x, y: raw.y, z: raw.z }],
          shape: highlightShape,
          color: highlightColor,
          width: 0.35
        }
        render()
        break
      }
    }
  }

  function onPointerMove(e: PointerEvent): void {
    const raw = getGroundPoint(e.clientX, e.clientY)
    if (!raw) return

    // Arrastre para mover elemento seleccionado
    if (dragMoveState && isPointerDown) {
      const dx = raw.x - dragMoveState.lastGround.x
      const dz = raw.z - dragMoveState.lastGround.z
      if (Math.hypot(dx, dz) > 1e-4) {
        translateAnnotation(dragMoveState.item, dx, dz)
        dragMoveState.lastGround.copy(raw)
        render()
      }
      return
    }

    if (!mode) return

    const snapped = snapVertex(raw, scene, options.snapEnabled())

    if (leaderDraft) {
      leaderDraft.current = { x: raw.x, y: raw.y, z: raw.z }
      render()
    } else if (dimensionDraft) {
      if (!dimensionDraft.end) {
        dimensionDraft.current = { x: snapped.x, y: snapped.y, z: snapped.z }
      } else {
        // Cálculo de separación perpendicular
        const dx = dimensionDraft.end.x - dimensionDraft.start.x
        const dz = dimensionDraft.end.z - dimensionDraft.start.z
        const len = Math.hypot(dx, dz)
        if (len > 1e-4) {
          const nx = -dz / len
          const nz = dx / len
          const vx = raw.x - dimensionDraft.start.x
          const vz = raw.z - dimensionDraft.start.z
          dimensionDraft.offset = vx * nx + vz * nz
        }
      }
      render()
    } else if (revisionDraft) {
      revisionDraft.current = { x: raw.x, y: raw.y, z: raw.z }
      render()
    } else if (highlightDraft && isPointerDown) {
      if (highlightDraft.shape === 'rect') {
        highlightDraft.points[1] = { x: raw.x, y: raw.y, z: raw.z }
      } else {
        const last = highlightDraft.points[highlightDraft.points.length - 1]
        if (Math.hypot(raw.x - last.x, raw.z - last.z) > 0.08) {
          highlightDraft.points.push({ x: raw.x, y: raw.y, z: raw.z })
        }
      }
      render()
    }
  }

  function onPointerUp(e: PointerEvent): void {
    isPointerDown = false
    if (dragMoveState) {
      const totalMoved = Math.hypot(
        dragMoveState.lastGround.x - dragMoveState.startGround.x,
        dragMoveState.lastGround.z - dragMoveState.startGround.z
      )
      if (totalMoved > 0.01) {
        options.history?.transaction('Mover anotación', () => {})
      }
      dragMoveState = null
      return
    }

    if (mode === 'highlight' && highlightDraft) {
      if (highlightDraft.points.length >= 2) {
        const activeLevelId = scene.getActiveLevelId()
        const high: HighlightAnnotation = {
          id: createAnnotationId(),
          levelId: activeLevelId,
          createdAt: Date.now(),
          type: 'highlight',
          shape: highlightDraft.shape,
          points: [...highlightDraft.points],
          color: highlightDraft.color,
          width: highlightDraft.width
        }
        options.history?.transaction('Añadir resaltador', () => items.push(high))
        selectedId = high.id
      }
      highlightDraft = null
      render()
    }
  }

  function onDblClick(e: MouseEvent): void {
    if (mode === 'revision' && revisionDraft && revisionDraft.points.length >= 3) {
      const activeLevelId = scene.getActiveLevelId()
      const rev: RevisionAnnotation = {
        id: createAnnotationId(),
        levelId: activeLevelId,
        createdAt: Date.now(),
        type: 'revision',
        points: [...revisionDraft.points],
        badge: 'Rev. 1'
      }
      options.history?.transaction('Añadir nube de revisión', () => items.push(rev))
      selectedId = rev.id
      cancelDraft()
      setMode(null)
      return
    }

    // Doble clic sobre elemento para editarlo
    const target = (e.target as HTMLElement)?.closest('[data-annot-id]') as HTMLElement | null
    const annotId = target?.getAttribute('data-annot-id')
    if (annotId) {
      const item = items.find((i) => i.id === annotId)
      if (item && editableField(item)) {
        selectedId = item.id
        const screenPos = { x: e.clientX, y: e.clientY }
        showInlineEditor(item, screenPos, editableField(item)!)
      }
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.target === inlineEditor) return

    if (e.key === 'Escape') {
      cancel()
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      deleteSelectedItem()
      return
    }

    if ((e.key === 'r' || e.key === 'R') && selectedId) {
      rotateSelectedText()
      return
    }
  }

  function rotateSelectedText(): void {
    if (!selectedId) return
    const item = items.find((i) => i.id === selectedId)
    if (item && item.type === 'text') {
      options.history?.transaction('Rotar texto', () => {
        const nextRot = (item.rotation + 90) % 360
        item.rotation = nextRot as TextAnnotation['rotation']
      })
      render()
      message(`Texto rotado a ${item.rotation}°.`)
    }
  }

  // Escucha de eventos
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('dblclick', onDblClick)
  overlay.addEventListener('dblclick', onDblClick)
  window.addEventListener('keydown', onKeyDown)

  render()

  return {
    setMode,
    getMode: () => mode,
    isActive: () => mode !== null || getCurrentDraft() !== null || editingId !== null,
    getItems: () => [...items],
    setItems: (newItems: AnnotationItem[]) => {
      items = [...newItems]
      selectedId = null
      render()
    },
    addItem: (item: AnnotationItem) => {
      items.push(item)
      render()
    },
    deleteItem: (id: string) => {
      const idx = items.findIndex((i) => i.id === id)
      if (idx !== -1) {
        items.splice(idx, 1)
        if (selectedId === id) selectedId = null
        render()
      }
    },
    clear: () => {
      items = []
      selectedId = null
      cancelDraft()
      render()
    },
    selectItem: (id: string | null) => {
      selectedId = id
      render()
    },
    getSelectedId: () => selectedId,
    update: () => render(),
    cancel,
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('dblclick', onDblClick)
      overlay.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('keydown', onKeyDown)
      overlay.remove()
    },
    tableData: () => computeTableData(scene, options.projectName?.() ?? '', viewport.getViewMode()),
    setHighlightColor: (c: HighlightColor) => {
      highlightColor = c
      render()
    },
    getHighlightColor: () => highlightColor,
    setHighlightShape: (s: 'freehand' | 'rect') => {
      highlightShape = s
      render()
    },
    getHighlightShape: () => highlightShape,
    rotateSelectedText
  }
}

/**
 * Hook / Controlador React-compatible para uso en interfaces declarativas.
 */
export function useAnnotations(options: UseAnnotationsOptions): AnnotationsHandle {
  return mountAnnotations(options)
}
