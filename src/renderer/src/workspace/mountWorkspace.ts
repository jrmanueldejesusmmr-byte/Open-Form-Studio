import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import { HistoryManager } from '../engine/HistoryManager'
import { LayerManager } from '../engine/LayerManager'
import { Viewport3DController } from '../engine/Viewport3DController'
import { ViewportRenderer, ViewMode } from '../engine/ViewportRenderer'
import { mountCanvasTool, ToolMode, PendingObjectSpec } from '../engine/CanvasTool'
import { AIChatService } from '../services/AIChatService'

import {
  databaseService,
  SceneObject as PersistedObject,
  SceneWall as PersistedWall
} from '../services/DatabaseService'
import { Axis3D, CameraState } from '../models/CameraState'
import { WallSegmentType, WallSnapshot } from '../models/Wall'
import { SceneObjectKind, SceneObject, SceneObjectSnapshot } from '../models/SceneObject'
import { createDefaultLevel, DEFAULT_LEVEL_ID, normalizeLevels } from '../models/Level'
import { mountAIChatPanel } from '../ui/AIChatPanel'
import { BrainSession } from '../ai/brain/session'
import { mountCanvasHud } from '../ui/CanvasHud'
import { mountCommandPalette } from '../ui/CommandPalette'
import { mountKeyboardCameraNavigator } from '../ui/KeyboardCameraNavigator'
import { mountLayersPanel } from '../ui/LayersPanel'
import { mountMenuBar } from '../ui/MenuBar'
import { mountDebugPanel } from '../ui/DebugPanel'
import type { DebugPanelHandle } from '../ui/DebugPanel'
import { mountAIToolsDebug } from '../ai/AIToolsDebug'
import type { AIToolsDebugHandle } from '../ai/AIToolsDebug'
import { mountNavigationSphere, type NavigationSphereHandle } from '../ui/OrientationGizmo'
import { TimelinePanel } from '../animation/TimelinePanel'
import { AnimationEngine } from '../animation/AnimationEngine'
import {
  CanvasRecorder,
  formatRecordingDuration,
  useCanvasRecorder
} from '../animation/CanvasRecorder'
import { mountVideoPreviewModal } from '../ui/VideoPreviewModal'
import { mountProjectNavigator, NavigatorNode, LevelNodeAction } from '../ui/ProjectNavigator'
import {
  askLevelCopy,
  confirmLevelDelete,
  promptLevelHeight,
  promptLevelName
} from '../ui/LevelDialogs'
import { mountStatusBar } from '../ui/StatusBar'
import { mountTitleBar } from '../ui/TitleBar'
import { mountToolboxPanel, CatalogItem } from '../ui/ToolboxPanel'
import { mountMaterialPalette, MaterialPaletteHandle } from '../ui/MaterialPalette'
import { openDoorPropertiesPanel } from '../ui/PropertiesPanel'
import { resolveObjectOpeningSpec } from '../engine/WallMeshBuilder'
import { toggleSwingHand, toggleSwingDirection } from '../engine/Opening2DSymbology'
import { isMaterialId } from '../catalog/materials'
import { buildTestHouseScene } from '../engine/TestSceneBuilder'
import { promptAddElement } from '../ui/AddElementDialog'
import { mountExportDialog } from '../ui/ExportDialog'
import {
  mountImportDialog,
  createImportedTerrainObject,
  type ImportedFileResult,
  type ImportAppBridge
} from '../ui/ImportDialog'
import { createImportedObjects, type ImportModelOptions } from '../import/modelImport'
import { applyDxfImport } from '../export/dxfImport'
import { applySvgImport } from '../import/svgImport'
import { applyIfcImport } from '../import/ifcImport'
import { applyPdfImport } from '../import/pdfImport'
import { mountTopographyTool, type TopographyToolHandle } from '../engine/TopographyToolController'
import { ElectricalModel } from '../mep/ElectricalModel'
import { ElectricalRenderer3D } from '../mep/ElectricalRenderer3D'
import { ElectricalToolController } from '../mep/ElectricalToolController'
import { ElectricalDiagnosticModal } from '../mep/ElectricalDiagnosticModal'
import type { ElectricalDeviceType, CircuitType } from '../mep/electricalTypes'
import {
  mountSelectionTransformPanel,
  type SelectionTransformPanelHandle
} from '../ui/SelectionTransformPanel'
import { createDemoTerrainData } from '../engine/TerrainBuilder'
import {
  cloneStructuralParams,
  defaultStructuralParamsFor,
  isParametricStructuralShape,
  STRUCTURAL_MATERIAL_COLOR,
  STRUCTURAL_MATERIAL_TO_CATALOG,
  type StructuralParams
} from '../models/StructuralTypes'
import { cloneTerrainData, type TerrainData } from '../models/TerrainTypes'
import { openSaveAsDialog } from '../ui/SaveAsDialog'
import { showToast } from '../ui/Toast'
import {
  saveProjectToStorage,
  loadExtendedProjectState,
  exportProjectJson,
  formatDefaultProjectName,
  applySerializedProjectToWorkspace,
  type SerializedProjectFile
} from '../services/ProjectPersistence'
import { mountRoofDraft, type RoofDraftHandle, type RoofDraftProps } from '../engine/RoofTool'
import { mountAnnotations, type AnnotationsHandle } from '../annotations/useAnnotations'
import { ANNOTATION_ACTIONS } from '../annotations/types'
import { askRoofOptions } from '../ui/RoofDialogs'
import { DEFAULT_ROOF_OVERHANG, DEFAULT_ROOF_SLOPE, DEFAULT_ROOF_THICKNESS, roofTypeLabel, roofTypeOptions, type RoofProps, type RoofType } from '../models/Roof'
import { roofTotalArea } from '../engine/RoofBuilder'
import { mountViewportInteractions } from '../ui/ViewportInteractions'
import { getCatalogEntry, loadPersistedCustomCatalog } from '../catalog/catalog'

import { ActionRegistry, ACTION_CATALOG } from '../actions/ActionRegistry'
import { KeybindingManager, formatShortcut, shortcutFromEvent } from '../actions/KeybindingManager'
import {
  getWallTemplateDef,
  resolveWallTemplateId,
  type WallTemplateId
} from '../engine/WallTemplates'
import { mountWallTemplateHud } from '../ui/WallTemplateHud'
import { mountShortcutsModal } from '../ui/ShortcutsModal'
import { LayoutManager } from '../layout/LayoutManager'
import type { PanelId } from '../layout/types'
import { icon } from '../ui/icons'
import { t } from '../i18n/es'
import { mountCollaborationDrawer } from '../ui/CollaborationDrawer'
import {
  useCollaborationRoom,
  createCollaborationRoom,
  findRoomByProjectId,
  getRoomMembers,
  generateRoomCode,
  type CollaborationRoomHandle,
  type CollaboratorRole,
  type SceneSyncPayload
} from '../services/CollaborationService'

import { BimMasterTable } from '../bim/BimMasterTable'
import { mountBimMasterTableView, type BimMasterTableViewHandle } from '../bim/BimMasterTableView'
import { QuadViewBimManager } from '../bim/QuadViewBimManager'
import { mountWorkflowWizard, type WorkflowWizardHandle } from '../bim/WorkflowWizard'
import '../bim/BimMasterTable.css'
import '../bim/QuadViewBim.css'
import '../bim/WorkflowWizard.css'

import type { ProjectMode } from '../models/DashboardProject'

/**
 * Editor / workspace CAD (equivalente a MainWindow.xaml.cs): instancia el motor
 * (models/engine/services), monta cada panel de la interfaz y conecta las
 * acciones de la barra superior con la escena 3D.
 *
 * `main.ts` lo importa de forma perezosa: la pantalla inicial es el Dashboard y
 * el motor (contexto WebGL) solo se construye cuando el usuario ya autenticado
 * entra al editor. Por eso el módulo expone `openProject` (carga el proyecto
 * elegido) y `focus` (recalcula el tamaño del lienzo al mostrarse).
 */

/** Proyecto tal como lo necesita el editor (subconjunto de models/DashboardProject). */
export interface WorkspaceProject {
  id?: string
  name: string
  mode: ProjectMode
  collaborationEnabled?: boolean
  roomCode?: string | null
  role?: CollaboratorRole
}

export interface WorkspaceOptions {
  /** Volver a «Mis proyectos» (entrada «Ir a Mis proyectos» del menú Archivo). */
  onExit(): void
  auth?: import('../services/AuthService').AuthService
  onRequestAuth?: () => void
}

/** Instantánea de muro tal como la guarda `DatabaseService.saveScene`. */
function persistedWallToSnapshot(wall: PersistedWall): WallSnapshot {
  return {
    id: wall.id,
    type: wall.type as WallSegmentType,
    start: new THREE.Vector3(wall.start.x, wall.start.y, wall.start.z),
    end: new THREE.Vector3(wall.end.x, wall.end.y, wall.end.z),
    height: wall.height,
    thickness: wall.thickness,
    color: wall.color,
    aiControlled: wall.aiControlled,
    // `undefined` en filas anteriores a la Fase 2 → sin material.
    materialId: wall.materialId ?? null,
    openings: wall.openings ? wall.openings.map((o) => ({ ...o })) : undefined,
    levelId: wall.levelId,
    visible: wall.visible ?? true
  }
}

/** Instantánea de objeto tal como la guarda `DatabaseService.saveScene`. */
function persistedObjectToSnapshot(object: PersistedObject): SceneObjectSnapshot {
  return {
    id: object.id,
    kind: object.kind as SceneObjectKind,
    name: object.name,
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotationY: object.rotationY,
    size: { width: object.size.width, height: object.size.height, depth: object.size.depth },
    // `color` admite null en la tabla; se cae al gris por defecto del modelo.
    color: object.color ?? 0x9aa4b2,
    shapeId: object.shapeId ?? null,
    materialId: object.materialId ?? null,
    levelId: object.levelId ?? undefined,
    roofProps: object.roofProps as RoofProps | null,
    structuralParams: cloneStructuralParams(object.structuralParams as StructuralParams | null | undefined),
    terrainData: cloneTerrainData(object.terrainData as TerrainData | null | undefined),
    layer: object.layer,
    includeInCosts: object.includeInCosts ?? true,
    openingVariant: object.openingVariant ?? null,
    openingId: object.openingId ?? null,
    openingAngle: object.openingAngle ?? 0,
    visible: object.visible ?? true
  }
}

export interface WorkspaceHandle {
  /** Carga el proyecto indicado en la escena y ajusta la vista a su modo 2D/3D. */
  openProject(project: WorkspaceProject): void
  /** Recalcula el tamaño del lienzo y encuadra: obligatorio al mostrar el contenedor. */
  focus(): void
  /** Fase 1: vacía el editor (escena, id, texturas) al cerrar sesión o cambiar de cuenta. */
  closeProject(): void
  /** Abre directamente el modal de Importar archivo dentro del workspace. */
  openImportModal(): void
  /** Aplica un archivo importado a la escena activa y persiste el estado. */
  applyImportedFile?: (imported: ImportedFileResult) => Promise<void>
  /** Instancia activa del sistema de anotaciones del lienzo. */
  annotations?: AnnotationsHandle
}

export function mountWorkspace(options: WorkspaceOptions): WorkspaceHandle {
  /** El workspace tiene su propia pantalla: sus atajos solo aplican cuando está visible. */
  function isActive(): boolean {
    return !document.getElementById('screen-workspace')?.classList.contains('is-hidden')
  }


  /* ---------- Estado / motor ---------- */

  const scene = new SceneManager()
  const history = new HistoryManager(scene)
  const layers = new LayerManager()
  const cameraController = new Viewport3DController()
  const timelinePanel = new TimelinePanel()
  let canvasRecorder: CanvasRecorder | null = null
  const animationEngine = new AnimationEngine({
    scene,
    onUpdate: (engineState) => {
      timelinePanel.setState({
        currentTime: engineState.t,
        duration: engineState.duration
      })
      menuBar?.setPlaybackState(engineState.state)
    },
    onFinished: () => {
      if (canvasRecorder?.isRecording() && canvasRecorder.isSyncedWithAnimation()) {
        canvasRecorder.stop()
      }
      statusBar?.setMessage('Reproducción finalizada (pulsa Detener o Esc para restaurar la escena).')
    }
  })
  // Cerebro local (Fase 2): interpreta órdenes en español sin internet ni
  // Gemini. «Aplicar sin confirmar» (Ajustes) hace que ejecute directo.
  let aiAutoApply = false
  const aiBrain = new BrainSession({ scene, history, autoApply: () => aiAutoApply })

  // Los planos de ejemplo ya no se cargan en el lienzo: viven sólo como
  // miniaturas del Dashboard (`ui/PlanThumbnail`). Aquí el proyecto abre vacío.
  let currentProjectId: string | null = null
  /** Nombre del proyecto abierto (lo usa el diálogo de exportación como nombre sugerido). */
  let currentProjectName = ''

  /** Fase 1: id del usuario autenticado; la capa de datos exige dueño (fail-closed). */
  function ownerUserId(): string | null {
    return options.auth?.currentUser?.id ?? null
  }

  /** Notas del proyecto (antes "Instrucciones del Proyecto"); ahora en la tarjeta de bienvenida del chat. */
  const PROJECT_NOTES = [
    'Exploración de herramientas y familias AEC.',
    'Generación de bocetos, muros y materiales a partir de instrucciones.',
    'La IA mantiene dominio sobre los objetos que crea, salvo que marques lo contrario.'
  ]

  const TOOL_LABELS: Record<WallSegmentType, string> = {
    [WallSegmentType.SimpleWall]: 'Muro simple',
    [WallSegmentType.StructuralSegment]: 'Segmento estructural',
    [WallSegmentType.RoomWalls]: 'Muros de habitación'
  }

  let activeWallTool = WallSegmentType.SimpleWall
  let saved3dState: { yaw: number; pitch: number; distance: number; target: THREE.Vector3 } | null = null
  let gridVisible = true
  /** El enganche a rejilla arranca activo: es lo que hace «CAD» al lienzo. */
  let snapEnabled = true
  let orthoEnabled = false

  /* ---------- Lienzo 3D ---------- */

  const canvas = document.getElementById('viewport-canvas') as HTMLCanvasElement
  canvas.tabIndex = 0
  canvas.addEventListener('pointerdown', () => {
    canvas.focus({ preventScroll: true })
  })
  const viewport = new ViewportRenderer(canvas, scene, cameraController)

  /* ---------- Módulo MEP: Instalación Eléctrica ---------- */
  const electricalModel = new ElectricalModel()
  const electricalRenderer = new ElectricalRenderer3D(electricalModel, scene, viewport)
  viewport.onBeforeRender((dt) => {
    electricalRenderer.update(dt)
  })
  let electricalTool: ElectricalToolController | null = null
  const electricalDiagnosticModal = new ElectricalDiagnosticModal(electricalModel, scene)

  /* ---------- Smart Reactive BIM (Single Source of Truth) ---------- */
  const bimMasterTable = new BimMasterTable(scene, electricalModel)

  /* ---------- Barra superior y barra de estado ---------- */

  mountTitleBar(document.getElementById('title-bar')!, { title: 'Open Form Studio', subtitle: 'Herramientas AEC' })

  const statusBar = mountStatusBar(document.getElementById('status-bar')!, 'Open Form Studio · AEC')

  function startOrResumePlayback(): void {
    const timelineState = timelinePanel.getState()
    animationEngine.setTracks(timelineState.tracks)
    animationEngine.setDuration(timelineState.duration)
    history.setPaused(true)
    animationEngine.play()
    statusBar.setMessage('Reproduciendo animación… (Espacio = Pausar, Esc = Detener). Edición bloqueada.')
  }

  function pausePlayback(): void {
    animationEngine.pause()
    statusBar.setMessage(`Animación en pausa (${animationEngine.getState().t.toFixed(2)}s).`)
  }

  function stopPlayback(): void {
    const syncedRecording = canvasRecorder?.isRecording() && canvasRecorder.isSyncedWithAnimation()
    animationEngine.stop()
    history.syncKnownSnapshots()
    history.setPaused(false)
    if (syncedRecording) {
      canvasRecorder?.stop()
    }
    statusBar.setMessage('Animación detenida: escena restaurada a su estado original de edición.')
  }

  // Indicador sutil en esquina del visor 3D ("● REC 00:00")
  const viewportContainer = document.getElementById('viewport-container')
  const viewportRecBadge = document.createElement('div')
  viewportRecBadge.className = 'viewport-rec-badge is-hidden'
  viewportRecBadge.setAttribute('aria-live', 'polite')
  viewportRecBadge.innerHTML = `
    <span class="viewport-rec-dot-wrap" aria-hidden="true">
      <span class="viewport-rec-dot-ping"></span>
      <span class="viewport-rec-dot"></span>
    </span>
    <span class="viewport-rec-text">REC</span>
    <span class="viewport-rec-timer" data-viewport-rec-timer>00:00</span>
  `
  viewportContainer?.appendChild(viewportRecBadge)
  const viewportRecTimer = viewportRecBadge.querySelector<HTMLElement>('[data-viewport-rec-timer]')

  /* ---------- Módulos BIM: Vista Cuádruple, Tabla Maestra y Workflow Wizard ---------- */
  let quadViewBimManager: QuadViewBimManager | null = null
  let bimMasterTableView: BimMasterTableViewHandle | null = null
  let workflowWizard: WorkflowWizardHandle | null = null

  if (viewportContainer) {
    quadViewBimManager = new QuadViewBimManager(viewportContainer, scene, viewport, bimMasterTable)
    bimMasterTableView = mountBimMasterTableView(viewportContainer, { table: bimMasterTable, scene })
  }

  const topBars = document.getElementById('top-bars')
  if (topBars) {
    workflowWizard = mountWorkflowWizard(topBars, {
      scene,
      bimTable: bimMasterTable,
      quadView: quadViewBimManager ?? undefined,
      onSelectTool: (toolId) => applyAction(toolId),
      onOpenBimTable: () => bimMasterTableView?.open()
    })
  }

  function toggleCanvasRecording(): void {
    if (!canvasRecorder) return
    if (canvasRecorder.isRecording()) {
      const wasSynced = canvasRecorder.isSyncedWithAnimation()
      canvasRecorder.stop()
      if (wasSynced && animationEngine.getState().state === 'playing') {
        stopPlayback()
      }
      return
    }

    const timelineState = timelinePanel.getState()
    const isAnimMode = timelineState.isAnimating || timelinePanel.isVisible()
    const hasTracks = timelineState.tracks.length > 0 && timelineState.tracks.some((t) => t.keyframes.length > 0)
    const shouldSyncPlayback = isAnimMode || hasTracks

    if (shouldSyncPlayback) {
      // Si el cursor actual ya está al final o muy próximo, reiniciar desde el segundo 0
      const duration = timelineState.duration || animationEngine.getDuration() || 10
      if (timelineState.currentTime >= duration - 0.05) {
        timelinePanel.seek(0)
        animationEngine.seek(0)
      }
    }

    const started = canvasRecorder.start({ syncedWithAnimation: shouldSyncPlayback })
    if (!started) return

    if (shouldSyncPlayback) {
      startOrResumePlayback()
      statusBar.setMessage('● REC — Grabando animación 3D sincronizada (60 FPS · 8 Mbps)…')
    } else {
      statusBar.setMessage('● REC — Grabando recorrido virtual 3D (60 FPS · 8 Mbps)… Pulsa Detener para ver previsualización.')
    }
  }

  const menuBar = mountMenuBar(document.getElementById('menu-bar')!, {
    onAction: handleAction,
    onPlay: () => startOrResumePlayback(),
    onPause: () => pausePlayback(),
    onStop: () => stopPlayback(),
    onToggleRecord: () => toggleCanvasRecording(),
    onAnimar: () => {
      if (animationEngine.isEditingLocked()) {
        statusBar.setMessage('Detén la reproducción antes de cambiar el modo de edición de animación.')
        return
      }
      const nextAnimating = !timelinePanel.getState().isAnimating
      timelinePanel.setState({ isAnimating: nextAnimating })
      menuBar.setAnimarActive(nextAnimating)
      if (nextAnimating && !timelinePanel.isVisible()) {
        timelinePanel.show()
      }
      statusBar.setMessage(
        nextAnimating
          ? 'Modo Animar activado: selecciona un muro u objeto y pulsa K o activa Auto-key.'
          : 'Modo Animar desactivado.'
      )
    }
  })
  menuBar.setPlaybackState('stopped')
  menuBar.setRecordingState(false, '00:00')

  const videoPreviewModal = mountVideoPreviewModal(document.body)

  canvasRecorder = useCanvasRecorder(canvas, {
    fps: 60,
    videoBitsPerSecond: 8_000_000,
    autoDownload: false,
    onFrameRequest: () => {
      viewport.renderFrame()
    },
    onStateChange: (isRecording, formattedTime) => {
      menuBar.setRecordingState(isRecording, formattedTime)
      timelinePanel.setRecordingState(isRecording, formattedTime)
      viewportRecBadge.classList.toggle('is-hidden', !isRecording)
      if (viewportRecTimer) viewportRecTimer.textContent = formattedTime
    },
    onTick: (formattedTime) => {
      menuBar.setRecordingState(true, formattedTime)
      timelinePanel.setRecordingState(true, formattedTime)
      if (viewportRecTimer) viewportRecTimer.textContent = formattedTime
    },
    onRecorded: (recordedVideo) => {
      statusBar.setMessage(`Grabación finalizada (${formatRecordingDuration(recordedVideo.durationSeconds)}). Abriendo previsualización…`)
      videoPreviewModal.open({
        video: recordedVideo,
        onDownload: async () => {
          const res = await canvasRecorder?.exportRecording(recordedVideo)
          if (res?.saved) {
            statusBar.setMessage(`Video exportado con éxito: ${res.fileName}`)
          }
        },
        onDiscard: () => {
          canvasRecorder?.clearRecordedVideo()
          statusBar.setMessage('Clip de video descartado. Lienzo 3D listo para nueva captura.')
        },
        onClose: () => {
          statusBar.setMessage('Previsualización cerrada. El video permanece guardado temporalmente en memoria.')
        }
      })
    },
    onExported: (result) => {
      if (result.saved) {
        statusBar.setMessage(`Video exportado con éxito: ${result.fileName} (${result.durationSeconds.toFixed(1)}s)`)
      } else if (result.canceled) {
        statusBar.setMessage('Exportación de video cancelada por el usuario.')
      }
    },
    onError: (msg) => {
      statusBar.setMessage(msg)
    }
  })

  timelinePanel.connect({
    scene,
    history,
    engine: animationEngine,
    onStateChange: (st) => {
      menuBar.setAnimarActive(st.isAnimating)
    },
    onVisibilityChange: () => {
      viewport.resize()
      syncViewChecks()
    },
    onToggleRecord: () => toggleCanvasRecording()
  })

  /* ---------- Panel izquierdo: rail + acordeones ---------- */

  let topographyTool: TopographyToolHandle | null = null
  let selectionTransformPanel: SelectionTransformPanelHandle | null = null

  function createDemoTerrainInScene(): void {
    const terrainData = createDemoTerrainData(36, 36)
    const terrainObj = new SceneObject('Terreno Topográfico 3D', 'shape')
    terrainObj.shapeId = 'topo.terrain'
    terrainObj.materialId = null
    terrainObj.color = 0x5c8f4d
    terrainObj.layer = 'terrain'
    terrainObj.terrainData = terrainData
    const relief = Math.max(0.5, terrainData.maxElev - terrainData.minElev)
    terrainObj.size.set(terrainData.width, Math.round(relief * 100) / 100, terrainData.depth)
    terrainObj.position.set(0, 0, 0)
    history.transaction('Generar terreno topográfico 3D', () => {
      scene.addObject(terrainObj)
      scene.selectObject(terrainObj)
    })
    setViewMode('3d')
    frameScene()
    statusBar.setMessage(
      `Terreno 3D generado (${terrainData.width}×${terrainData.depth} m · cotas Z [${terrainData.minElev.toFixed(2)}m a ${terrainData.maxElev.toFixed(2)}m]). Usa «Sacar Niveles / Cotas» o «Aplanar Terreno».`
    )
    showToast({
      title: 'Terreno Topográfico 3D listo',
      subtitle: `Malla con curvas de nivel (${terrainData.width}×${terrainData.depth} m)`
    })
  }

  const toolbox = mountToolboxPanel(document.getElementById('toolbox-dock')!, {
    onSelectWallTool: (type) => {
      topographyTool?.setMode('none')
      setWallTool(type)
    },
    onSelectCatalogItem: (item) => {
      topographyTool?.setMode('none')
      selectCatalogItem(item)
    },
    // Modificadores, zoom y «Añadir elemento» entran por el registro central.
    onAction: (actionId) => handleAction(actionId),
    onTopographyAction: (act) => {
      if (act === 'import') {
        openImportModal('topo')
        return
      }
      if (act === 'demo') {
        createDemoTerrainInScene()
        return
      }
      if (act === 'clearSpots') {
        topographyTool?.clearSpotElevations()
        return
      }
      if (act === 'probe' || act === 'grade') {
        if (scene.getTerrains().length === 0) {
          createDemoTerrainInScene()
        }
        const current = topographyTool?.getMode() ?? 'none'
        const next = current === act ? 'none' : act
        if (next !== 'none') {
          tool.setMode('select')
          annotations?.setMode(null)
        }
        topographyTool?.setMode(next)
      }
    },
    onTopographyTargetElevationChange: (elev) => {
      topographyTool?.setTargetElevation(elev)
    },
    onTopographyShapeChange: (shape) => {
      topographyTool?.setGradingShape(shape)
    },
    onStructuralMaterialChange: (mat) => {
      const selObj = scene.getSelectedObject()
      if (selObj && isParametricStructuralShape(selObj.shapeId)) {
        const nextParams = {
          ...(selObj.structuralParams ?? defaultStructuralParamsFor(selObj.shapeId!).params),
          materialType: mat
        }
        history.transaction('Cambiar material estructural', () => {
          scene.updateObject(selObj.id, {
            structuralParams: nextParams,
            materialId: STRUCTURAL_MATERIAL_TO_CATALOG[mat],
            color: STRUCTURAL_MATERIAL_COLOR[mat]
          })
        })
        statusBar.setMessage(
          `Material estructural cambiado a ${mat === 'concrete' ? 'Hormigón' : mat === 'wood' ? 'Madera' : 'Acero'}.`
        )
      }
    },
    onSelectElectricalDevice: (type) => {
      topographyTool?.setMode('none')
      tool.setMode('select')
      annotations?.setMode(null)
      electricalTool?.setDevicePlacement(type)
    },
    onSelectElectricalCircuit: (circuit) => {
      electricalTool?.setCircuit(circuit)
    },
    onToggleWiringTool: (active) => {
      topographyTool?.setMode('none')
      tool.setMode('select')
      annotations?.setMode(null)
      electricalTool?.setWiringMode(active ?? !electricalTool.isWiringActive())
    },
    onElectricalAction: (act) => {
      if (act === 'xray') {
        const isXRay = electricalRenderer.toggleXRay()
        toolbox.setXRayActive(isXRay)
        statusBar.setMessage(`Vista Rayos X ${isXRay ? 'ACTIVADA (muros semitransparentes)' : 'DESACTIVADA'}.`)
      } else if (act === 'simulate') {
        const isSim = electricalRenderer.toggleSimulation()
        toolbox.setElectricalSimulating(isSim)
        statusBar.setMessage(
          isSim
            ? '⚡ Simulación de energía ACTIVADA: haz clic en los interruptores para encender o apagar luces en tiempo real.'
            : '⚡ Simulación de energía DESACTIVADA.'
        )
      } else if (act === 'diagnose') {
        electricalDiagnosticModal.open()
      } else if (act === 'clear') {
        electricalModel.clear()
        statusBar.setMessage('Instalación eléctrica vaciada.')
      }
    }
  })

  /* ---------- Paleta de materiales (Fase 1) ---------- */

  const materialsContainer = toolbox.getMaterialsContainer()
  let materialPalette: MaterialPaletteHandle | null = null
  if (materialsContainer) {
    materialPalette = mountMaterialPalette(materialsContainer, {
      onApply: (materialId, label) => {
        const wall = scene.getSelected()
        if (wall) {
          scene.setWallMaterial(wall.id, materialId)
          statusBar.setMessage(`Material «${label}» aplicado a ${wall.label} (Ctrl+Z para deshacer).`)
          return
        }
        const object = scene.getSelectedObject()
        if (object) {
          scene.setObjectMaterial(object.id, materialId)
          statusBar.setMessage(`Material «${label}» aplicado a «${object.name}» (Ctrl+Z para deshacer).`)
          return
        }
        statusBar.setMessage(`Material «${label}»: selecciona antes un muro u objeto del lienzo.`)
      },
      onQualityChange: () => syncViewport(),
      getProjectId: () => currentProjectId,
      // Fase 1: el dueño actual para las operaciones sobre texturas (SQLite).
      getOwnerId: () => ownerUserId(),
      onMessage: (message) => statusBar.setMessage(message),
      onOverrideChanged: () => syncViewport()
    })
  }

  /* ---------- Lienzo: HUD con coordenadas, zoom y vistas 2D/3D ---------- */

  const hud = mountCanvasHud(document.getElementById('canvas-hud')!, {
    onZoomFraction: (fraction) => {
      cameraController.setZoomFraction(fraction)
      viewport.syncCamera()
    },
    onViewMode: (mode) => {
      if (mode === 'quad') {
        quadViewBimManager?.toggle()
        statusBar.setMessage('Vista Cuádruple BIM (Planta / Corte / Fachada / 3D) activada.')
      } else {
        quadViewBimManager?.close()
        setViewMode(mode)
      }
    },
    onConvertToPlan: () => convertToPlan()
  })

  /* ---------- Sistema de Anotaciones y Revisión Técnica (Menú «Notas») ---------- */

  let annotations: AnnotationsHandle | null = null

  /* ---------- Herramienta activa del lienzo (trazo, selección, colocación) ---------- */

  const shortcutsModal = mountShortcutsModal(document.body)

  let wallTemplateHud: ReturnType<typeof mountWallTemplateHud> | null = null

  const tool = mountCanvasTool({
    canvas,
    viewport,
    scene,
    history,
    snapEnabled: () => snapEnabled,
    orthoEnabled: () => orthoEnabled,
    activeWallType: () => activeWallTool,
    // Dibujo a la cota del piso activo (muros y colocación del catálogo).
    activeLevelElevation: () => scene.getActiveLevel().elevation,
    // El modelo (cámara) consume el gesto cuando la herramienta «Orbitar» está
    // activa, o con Alt/Shift+Alt sobre clic izquierdo: CanvasTool se abstiene
    // de dibujar, colocar o mover en esos casos.
    cameraClaimsGesture: (e) => orbitToolActive || (e.altKey && (e.button === 0 || e.button === 2)),
    // Mientras se traza un techo por área, se reproduce la animación, hay una herramienta
    // de notas, topografía o instalación eléctrica activa, CanvasTool se abstiene por completo.
    externalToolActive: () =>
      (roofDraft?.isActive() ?? false) ||
      animationEngine.isEditingLocked() ||
      (annotations?.isActive() ?? false) ||
      (topographyTool?.isActive() ?? false) ||
      (electricalTool?.isActive() ?? false),
    onModeChange: (mode) => {
      // Salir de la colocación desmarca el elemento en el catálogo.
      if (mode !== 'place') toolbox.setActiveCatalogItem(null)
      if (mode !== 'template') toolbox.setActiveWallTemplate(null)
      if (mode !== 'wall') toolbox.setActiveWallTool(null)
      if (mode === 'select') toolbox.setActiveActionTool('tool.crosshair')
      describeToolMode(mode)
    },
    onTemplateStateChange: (state) => {
      wallTemplateHud?.update(state)
    },
    onMessage: (message) => statusBar.setMessage(message)
  })

  if (viewportContainer) {
    wallTemplateHud = mountWallTemplateHud(viewportContainer, {
      onSelectTemplate: (tplId) => activateWallTemplate(tplId),
      onUpdateParams: (patch) => tool.updateWallTemplateParams(patch),
      onRotate90: () => rotateSelectionOrPending90(),
      onExit: () => applyAction('tool.crosshair')
    })
  }

  annotations = mountAnnotations({
    canvas,
    container: document.getElementById('viewport-container')!,
    viewport,
    scene,
    snapEnabled: () => snapEnabled,
    activeLevelElevation: () => scene.getActiveLevel().elevation,
    onMessage: (message) => statusBar.setMessage(message),
    onModeChange: (mode) => {
      if (!mode) menuBar.setActiveTool('tool.crosshair')
    },
    projectName: () => currentProjectName,
    history
  })

  electricalTool = new ElectricalToolController({
    canvas,
    model: electricalModel,
    renderer: electricalRenderer,
    scene,
    viewport,
    onMessage: (msg) => statusBar.setMessage(msg),
    onToolChange: (toolName) => {
      if (toolName === 'wire') {
        toolbox.setWiringToolActive(true, electricalTool?.getCircuit())
      } else if (toolName && toolName.startsWith('place.')) {
        toolbox.setActiveElectricalDevice(toolName.replace('place.', '') as ElectricalDeviceType)
      } else {
        toolbox.setWiringToolActive(false)
        toolbox.setActiveElectricalDevice(null)
      }
    }
  })

  // Estado de la herramienta «Orbitar»: arrastre con clic izquierdo o Shift+Alt
  // puro gira la cámara 360° en 3D sin tocar la herramienta de dibujo.
  let orbitToolActive = false
  let orbitCallCount = 0
  let toolBeforeOrbit: ToolMode = 'select'
  let pendingBeforeOrbit: PendingObjectSpec | null = null

  // Borrador del techo por área (modo manual). `null` cuando no hay trazo.
  let roofDraft: RoofDraftHandle | null = null

  // Panel de depuración del estado de la vista (cámara, modos, contador de
  // órbitas). Se instancia bajo demanda con F9 la primera vez que se abre.
  let debugPanel: DebugPanelHandle | null = null

  // Panel de depuración de herramientas IA (solo desarrollo). Se instancia bajo
  // demanda con F10 la primera vez que se abre.
  let aiToolsDebug: AIToolsDebugHandle | null = null

  /** Alterna el panel de depuración de la cámara (tecla F9), montándolo si hace falta. */
  function toggleDebugPanel(): void {
    debugPanel ??= mountDebugPanel({
      container: document.getElementById('viewport-container')!,
      getOrbitCount: () => orbitCallCount
    })
    debugPanel.toggle()
  }

  /** Alterna el panel de depuración de herramientas IA (tecla F10), montándolo si hace falta. */
  function toggleAIToolsDebug(): void {
    aiToolsDebug ??= mountAIToolsDebug({
      container: document.getElementById('viewport-container')!,
      scene,
      history,
      onMessage: (message) => statusBar.setMessage(message)
    })
    aiToolsDebug.toggle()
  }

  /** Activa/desactiva la herramienta «Orbitar» (tecla O). */
  function toggleOrbitTool(): void {
    orbitToolActive = !orbitToolActive
    if (orbitToolActive) {
      toolBeforeOrbit = tool.getMode()
      pendingBeforeOrbit = tool.getPendingObject()
      tool.setMode('select')
      menuBar.setActiveTool(null)
      statusBar.setTool('Orbitar')
      statusBar.setMessage('Herramienta «Orbitar» activa: arrastra con clic izquierdo (oAlt) para girar la cámara.')
      syncViewport()
    } else {
      tool.setMode(toolBeforeOrbit)
      if (toolBeforeOrbit === 'place' && pendingBeforeOrbit) {
        tool.setPendingObject(pendingBeforeOrbit)
      }
      menuBar.setActiveTool('tool.crosshair')
      statusBar.setTool('Seleccionar')
      statusBar.setMessage('Herramienta «Orbitar» desactivada.')
      syncViewport()
    }
  }


  /** Texto de la barra de estado según lo que la herramienta puede hacer ahora. */
  function describeToolMode(mode: ToolMode): void {
    if (mode === 'wall') {
      statusBar.setMessage(
        `Trazo de «${TOOL_LABELS[activeWallTool]}»: clic/arrastre para el origen, suelta en el destino · [S / Esc] cancelar.`
      )
      return
    }
    if (mode === 'template') {
      const tpl = tool.getWallTemplateState()
      if (tpl) {
        const def = getWallTemplateDef(tpl.templateId)
        statusBar.setMessage(
          `Plantilla 2D «${def.label}» (${tpl.width} × ${tpl.depth} m): clic para colocar o arrastra esquina a esquina · [G] rotar 90° · [S / Esc] salir.`
        )
      }
      return
    }
    if (mode === 'place') {
      const spec = tool.getPendingObject()
      statusBar.setMessage(
        `Colocando «${spec?.name ?? 'elemento'}»: clic en el lienzo para situarlo · [G] rotar 90° · [S / Esc] salir.`
      )
      return
    }
    statusBar.setMessage(
      'Selección [S]: clic elige un muro u objeto · arrastra extremos azules para estirar · [G] rotar 90° · [Supr] borrar.'
    )
  }

  /** Activa una plantilla interactiva de muros 2D conectados (`rect`, `l`, `u`, `c`, `t`, `cross`, `ring`, `arc`). */
  function activateWallTemplate(templateId: WallTemplateId): void {
    orbitToolActive = false
    roofDraft?.dispose()
    roofDraft = null
    annotations?.setMode(null)
    topographyTool?.setMode('none')

    const def = getWallTemplateDef(templateId)
    tool.setWallTemplate(templateId)
    toolbox.setActiveWallTemplate(templateId)
    menuBar.setActiveTool(def.actionId)
    statusBar.setTool(def.shortLabel)
  }

  /**
   * Selecciona un elemento del catálogo. Los modificadores actúan sobre la
   * selección, los **materiales se aplican** al muro u objeto seleccionado,
   * las **formas predefinidas** se redirigen a plantillas de muros 2D conectados
   * y el resto se coloca con su geometría 3D.
   */
  function selectCatalogItem(item: CatalogItem): void {
    if (item.kind === 'modifier') {
      toolbox.setActiveCatalogItem(null)
      applyModifier(item)
      return
    }

    // Formas predefinidas (Perfil L, U, C, T, Cruz, Anillo, Arco) → generador de muros 2D reales
    const mappedTemplate = resolveWallTemplateId(item.id)
    if (mappedTemplate) {
      activateWallTemplate(mappedTemplate)
      return
    }

    const entry = getCatalogEntry(item.id)
    const shapeId = entry?.shapeId ?? (isParametricStructuralShape(item.id) ? item.id : null)
    let materialId = entry?.materialId ?? null
    let customColor: number | undefined
    let structuralParams: PendingObjectSpec['structuralParams'] = null
    let dimensions = entry?.dimensions ?? null

    if (shapeId && isParametricStructuralShape(shapeId)) {
      const defaults = defaultStructuralParamsFor(shapeId)
      const chosenMat = toolbox.getStructuralMaterial()
      // En sistemas tensados/neumáticos respetamos membrana por defecto salvo que sea entramada/adintelada/etc.
      const effectiveMat =
        shapeId === 'struct.tensada' || shapeId === 'struct.neumatica'
          ? defaults.params.materialType
          : chosenMat
      structuralParams = {
        ...defaults.params,
        materialType: effectiveMat
      }
      materialId = STRUCTURAL_MATERIAL_TO_CATALOG[effectiveMat]
      customColor = STRUCTURAL_MATERIAL_COLOR[effectiveMat]
      if (!dimensions) dimensions = defaults.size
    }

    const isOpening = Boolean(shapeId && shapeId.startsWith('opening.') && shapeId !== 'opening.slab')

    if (item.kind === 'material') {
      applyMaterial(item)
      return
    }

    toolbox.setActiveCatalogItem(item.id)
    tool.setPendingObject({
      name: entry?.label ?? item.label,
      kind: item.kind,
      color: customColor,
      shapeId,
      materialId,
      size: dimensions,
      importedGeometry: entry?.importedGeometry ?? null,
      importedMaterial: entry?.importedMaterial ?? null,
      structuralParams
    })
    const openingArt = isOpening
      ? ` (perforación real: haz clic sobre un muro)`
      : ''
    const family: Record<CatalogItem['kind'], string> = {
      roof: 'Cubierta',
      material: 'Material',
      shape: 'Elemento',
      furniture: 'Mobiliario',
      modifier: 'Modificador'
    }
    statusBar.setMessage(
      `${family[item.kind]} «${entry?.label ?? item.label}»: clic en el lienzo o terreno para colocarlo${openingArt} (Esc para salir).`
    )
  }

  /**
   * Aplica el material elegido a la selección actual (punto A). El cambio pasa
   * por `SceneManager`, que notifica al renderer (reconstruye la malla con la
   * textura) y al historial (paso deshacible).
   */
  function applyMaterial(item: CatalogItem): void {
    // Se sale de «colocar» antes de aplicar: así un clic posterior en el lienzo
    // no sigue colocando elementos del catálogo anterior.
    if (tool.getMode() !== 'select') tool.setMode('select')

    const wall = scene.getSelected()
    if (wall) {
      scene.setWallMaterial(wall.id, item.id)
      toolbox.setActiveCatalogItem(item.id)
      statusBar.setMessage(`Material «${item.label}» aplicado a ${wall.label} (Ctrl+Z para deshacer).`)
      return
    }

    const object = scene.getSelectedObject()
    if (object) {
      scene.setObjectMaterial(object.id, item.id)
      toolbox.setActiveCatalogItem(item.id)
      statusBar.setMessage(`Material «${item.label}» aplicado a «${object.name}» (Ctrl+Z para deshacer).`)
      return
    }

    toolbox.setActiveCatalogItem(null)
    statusBar.setMessage(`Material «${item.label}»: selecciona antes un muro u objeto del lienzo.`)
  }

  /** Acciones que trabajan sobre la selección actual en lugar de colocarse. */
  function applyModifier(item: CatalogItem): void {
    switch (item.id) {
      case 'modify.move':
        tool.setMode('select')
        statusBar.setMessage('Mover: selecciona un muro u objeto y arrástralo sobre la rejilla.')
        break
      case 'modify.erase':
        deleteSelection()
        break
      case 'modify.copy':
        duplicateSelection()
        break
      default:
        statusBar.setMessage('Recortar: pendiente de implementar.')
    }
  }

  /**
   * Rota 90° en sentido horario [G]:
   *  - Si hay una plantilla 2D u objeto pendiente de colocar, lo gira 90° antes de soltarlo.
   *  - Si hay muros u objetos seleccionados, rota todo el grupo conectado 90° alrededor de su centroide.
   */
  function rotateSelectionOrPending90(): void {
    if (tool.rotatePending90()) return

    const selectedWalls = scene.getWalls().filter((w) => w.isSelected)
    const selectedObjects = scene.getObjects().filter((o) => o.isSelected)
    if (selectedWalls.length === 0 && selectedObjects.length === 0) {
      statusBar.setMessage('Rotar 90° [G]: activa una plantilla de muros 2D o selecciona primero un muro u objeto.')
      return
    }

    let sumX = 0
    let sumZ = 0
    let count = 0
    for (const w of selectedWalls) {
      sumX += w.start.x + w.end.x
      sumZ += w.start.z + w.end.z
      count += 2
    }
    const standaloneObjects = selectedObjects.filter((o) => !o.openingId)
    for (const o of standaloneObjects) {
      sumX += o.position.x
      sumZ += o.position.z
      count += 1
    }
    if (count === 0 && selectedObjects.length > 0) {
      for (const o of selectedObjects) {
        sumX += o.position.x
        sumZ += o.position.z
        count += 1
      }
    }
    const cx = sumX / Math.max(1, count)
    const cz = sumZ / Math.max(1, count)

    const rotPt = (px: number, pz: number): { x: number; z: number } => {
      const dx = px - cx
      const dz = pz - cz
      return {
        x: Math.round((cx - dz) * 1000) / 1000,
        z: Math.round((cz + dx) * 1000) / 1000
      }
    }

    const objectsByOpeningId = new Map<string, SceneObject>()
    for (const obj of scene.getObjects()) {
      if (obj.openingId) objectsByOpeningId.set(obj.openingId, obj)
    }
    const handledObjectIds = new Set<string>()

    history.transaction('Rotar 90°', () => {
      for (const w of selectedWalls) {
        const ns = rotPt(w.start.x, w.start.z)
        const ne = rotPt(w.end.x, w.end.z)
        const nextStart = new THREE.Vector3(ns.x, w.start.y, ns.z)
        const nextEnd = new THREE.Vector3(ne.x, w.end.y, ne.z)
        scene.moveWall(w.id, nextStart, nextEnd, false)

        // Realinear puertas/ventanas alojadas en este muro
        const dx = nextEnd.x - nextStart.x
        const dz = nextEnd.z - nextStart.z
        const len = Math.hypot(dx, dz)
        if (len > 1e-4 && w.openings.length > 0) {
          const ux = dx / len
          const uz = dz / len
          const nextRotY = -Math.atan2(dz, dx)
          for (const op of w.openings) {
            const linkedObj = objectsByOpeningId.get(op.id)
            if (linkedObj) {
              handledObjectIds.add(linkedObj.id)
              const nextPos = new THREE.Vector3(
                nextStart.x + ux * op.x,
                linkedObj.position.y,
                nextStart.z + uz * op.x
              )
              scene.moveObject(linkedObj.id, nextPos, nextRotY, false)
            }
          }
        }
      }

      for (const o of selectedObjects) {
        if (handledObjectIds.has(o.id)) continue
        const np = rotPt(o.position.x, o.position.z)
        const nextPos = new THREE.Vector3(np.x, o.position.y, np.z)
        scene.moveObject(o.id, nextPos, o.rotationY - Math.PI / 2, false)
      }
    })

    const total = selectedWalls.length + selectedObjects.length
    statusBar.setMessage(
      `${total} elemento${total === 1 ? '' : 's'} rotado${total === 1 ? '' : 's'} 90° (Ctrl+Z para deshacer).`
    )
  }

  /** Confirmación rápida para vaciar escena [X] compatible con Electron (#dialog-overlay). */
  async function confirmAndClearScene(): Promise<void> {
    const wallCount = scene.getWalls().length
    const objCount = scene.getObjects().length
    if (wallCount === 0 && objCount === 0) {
      statusBar.setMessage('La escena ya está vacía.')
      return
    }

    const overlay = document.getElementById('dialog-overlay')
    let confirmed = false

    if (overlay) {
      confirmed = await new Promise<boolean>((resolve) => {
        let settled = false
        const done = (val: boolean): void => {
          if (settled) return
          settled = true
          overlay.classList.add('is-hidden')
          overlay.innerHTML = ''
          document.removeEventListener('keydown', onKey, true)
          resolve(val)
        }
        const onKey = (ev: KeyboardEvent): void => {
          if (ev.key === 'Escape') {
            ev.preventDefault()
            ev.stopPropagation()
            done(false)
          } else if (ev.key === 'Enter') {
            ev.preventDefault()
            ev.stopPropagation()
            done(true)
          }
        }
        document.addEventListener('keydown', onKey, true)
        overlay.classList.remove('is-hidden')
        overlay.innerHTML = `
          <div class="dialog">
            <div class="dialog__backdrop" data-clear-cancel></div>
            <div class="dialog__card" role="dialog" aria-modal="true" aria-label="Vaciar escena">
              <h2 class="dialog__title">¿Vaciar toda la escena?</h2>
              <p class="dialog__message">Se eliminarán ${wallCount} muro${wallCount === 1 ? '' : 's'} y ${objCount} objeto${objCount === 1 ? '' : 's'} del plano actual. Podrás recuperarlo con <strong>Ctrl + Z</strong>.</p>
              <div class="dialog__actions">
                <button class="dialog__button" type="button" data-clear-cancel>Cancelar [Esc]</button>
                <button class="dialog__button dialog__button--danger" type="button" data-clear-confirm>Vaciar escena [Enter]</button>
              </div>
            </div>
          </div>
        `
        overlay.querySelectorAll<HTMLElement>('[data-clear-cancel]').forEach((el) =>
          el.addEventListener('click', () => done(false))
        )
        const confirmBtn = overlay.querySelector<HTMLButtonElement>('[data-clear-confirm]')
        confirmBtn?.addEventListener('click', () => done(true))
        confirmBtn?.focus()
      })
    } else {
      confirmed = true
    }

    if (!confirmed) {
      statusBar.setMessage('Vaciar escena cancelado.')
      return
    }

    history.transaction('Vaciar escena', () => {
      scene.clear()
      annotations?.clear()
    })
    statusBar.setMessage('Escena vaciada (Ctrl+Z para deshacer).')
  }

  /** Ctrl+D / Ctrl+C con selección: duplica muros y objetos con +0,5 m en X/Z y selecciona la copia. */
  function duplicateSelection(): void {
    const walls = scene.getWalls().filter((wall) => wall.isSelected)
    const objects = scene.getObjects().filter((object) => object.isSelected)
    const total = walls.length + objects.length
    if (total === 0) {
      statusBar.setMessage('Duplicar [Ctrl+D]: selecciona primero un muro, habitación u objeto del lienzo.')
      return
    }
    const OFFSET = new THREE.Vector3(0.5, 0, 0.5)
    const createdWalls: ReturnType<typeof scene.addWall>[] = []
    const createdObjects: SceneObject[] = []
    history.transaction(`Duplicar ${total} elemento${total === 1 ? '' : 's'}`, () => {
      for (const wall of walls) {
        const copyWall = scene.addWall(
          wall.type,
          wall.start.clone().add(OFFSET),
          wall.end.clone().add(OFFSET),
          wall.aiControlled,
          wall.levelId
        )
        if (wall.materialId) scene.setWallMaterial(copyWall.id, wall.materialId)
        createdWalls.push(copyWall)
      }
      for (const object of objects) {
        if (object.openingId) continue
        const copy = scene.addObject(new SceneObject(object.name, object.kind))
        copy.position.copy(object.position).add(OFFSET)
        copy.rotationY = object.rotationY
        copy.size.copy(object.size)
        copy.color = object.color
        copy.shapeId = object.shapeId
        copy.materialId = object.materialId
        copy.structuralParams = cloneStructuralParams(object.structuralParams)
        copy.terrainData = cloneTerrainData(object.terrainData)
        // La copia se queda en el mismo piso que el original (y a su cota).
        copy.levelId = object.levelId
        if (!copy.terrainData) {
          copy.position.y = scene.getLevel(object.levelId)?.elevation ?? copy.position.y
        }
        scene.updateObject(copy.id, {})
        createdObjects.push(copy)
      }
    })
    if (createdWalls.length > 0 && createdObjects.length === 0) {
      scene.selectWalls(createdWalls)
    } else if (createdObjects.length === 1 && createdWalls.length === 0) {
      scene.selectObject(createdObjects[0])
    }
    statusBar.setMessage(`${total} elemento${total === 1 ? '' : 's'} duplicado${total === 1 ? '' : 's'} [Ctrl+D] (Ctrl+Z para deshacer).`)
  }

  /**
   * «Añadir elemento» (Fase 4 · `tool.add`): abre el diálogo del catálogo y
   * entra en modo colocación con la entrada elegida. La colocación usa el
   * mismo camino que el toolbox (historial + guardado incluidos).
   */
  async function openAddElementDialog(): Promise<void> {
    const overlay = document.getElementById('dialog-overlay')
    if (!overlay) {
      statusBar.setMessage('Añadir elemento: no se encontró el contenedor de diálogos.')
      return
    }
    await loadPersistedCustomCatalog()
    const entry = await promptAddElement(overlay)
    if (!entry) return
    selectCatalogItem({ id: entry.id, kind: entry.kind, label: entry.label })
  }

  /**
   * Elimina lo seleccionado; el historial lo registra como paso deshacible.
   * Con selección total (Ctrl+A) todos los elementos marcados se eliminan
   * agrupados en un único paso del historial.
   */
  function deleteSelection(): void {
    if (annotations?.getSelectedId()) {
      annotations.deleteItem(annotations.getSelectedId()!)
      return
    }

    const walls = scene.getWalls().filter((wall) => wall.isSelected)
    const objects = scene.getObjects().filter((object) => object.isSelected)
    const total = walls.length + objects.length

    if (total === 0) {
      statusBar.setMessage('Nada seleccionado: haz clic primero sobre un muro u objeto.')
      return
    }

    if (total === 1) {
      const [wall] = walls
      const [object] = objects
      if (wall) {
        history.transaction(`Eliminar ${wall.label}`, () => scene.removeWall(wall.id))
        statusBar.setMessage(`${wall.label} eliminado (Ctrl+Z para deshacer).`)
      } else if (object) {
        history.transaction(`Eliminar ${object.name}`, () => scene.removeObject(object.id))
        statusBar.setMessage(`Objeto «${object.name}» eliminado (Ctrl+Z para deshacer).`)
      }
      return
    }

    history.transaction(`Eliminar ${total} elementos`, () => {
      walls.forEach((wall) => scene.removeWall(wall.id))
      objects.forEach((object) => scene.removeObject(object.id))
    })
    statusBar.setMessage(
      `${walls.length} muros y ${objects.length} elementos eliminados (Ctrl+Z para deshacer).`
    )
  }

  /**
   * Ctrl+A (punto E): selección total de la escena. Marca todos los muros y
   * objetos del lienzo; `Supr` después los elimina en un solo paso deshacible.
   */
  function selectAllElements(): void {
    // Se sale de trazo/colocación para que el gesto siguiente siga siendo de selección.
    if (tool.getMode() !== 'select') tool.setMode('select')
    scene.selectAll()

    const { walls, objects } = scene.getSelectionCounts()
    if (walls + objects === 0) {
      statusBar.setMessage('Selección total: el lienzo está vacío.')
      return
    }
    statusBar.setMessage(
      `Selección total: ${walls} muros y ${objects} elementos (Supr para eliminarlos, Ctrl+Z para deshacer).`
    )
  }

  /* ---------- Columna de propiedades: Layers & Properties ---------- */

  const layersPanel = mountLayersPanel(document.getElementById('properties-panel')!, {
    layers: layers.getLayers(),
    onToggleVisible: (layerId) => layers.toggleVisible(layerId),
    onToggleLocked: (layerId) => layers.toggleLocked(layerId),
    onChangeLineType: (layerId, lineType) => layers.setLineType(layerId, lineType),
    onChangeColor: (layerId, color) => layers.setColor(layerId, color),
    onChangeProperty: (layerId, property, value) => layers.setProperty(layerId, property, value),
    onSetAllVisible: (visible) => layers.getLayers().forEach((layer) => layers.setVisible(layer.id, visible)),
    onSetAllLocked: (locked) => layers.getLayers().forEach((layer) => layers.setLocked(layer.id, locked))
  })

  /* ---------- Panel de propiedades del techo ---------- */

  const roofPropsPanel = document.getElementById('roof-properties-panel')

  function renderRoofPropsPanel(): void {
    if (!roofPropsPanel) return
    const roof = scene.getSelectedObject()
    if (!roof || roof.kind !== 'roof' || !roof.roofProps) {
      roofPropsPanel.innerHTML = ''
      roofPropsPanel.classList.add('is-hidden')
      return
    }
    const props = roof.roofProps
    const typesHtml = roofTypeOptions().map(
      (o) => `<option value=\"${o.value}\"${o.value === props.type ? ' selected' : ''}>${o.label}</option>`
    ).join('')
    roofPropsPanel.innerHTML = `
      <section class=\"acc is-open\">
        <button class=\"acc__head\">
          <span class=\"acc__chevron\">${icon('chevronDown', 14)}</span>
          <span class=\"acc__title\">${t('section.roofProps')}</span>
        </button>
        <div class=\"acc__body\">
          <div class=\"prop-row\">
            <span class=\"prop-row__label\">${t('roof.label.type')}</span>
            <select class=\"prop-select\" data-roof-prop=\"type\">${typesHtml}</select>
          </div>
          <div class=\"prop-row\">
            <span class=\"prop-row__label\">${t('roof.label.slope')}</span>
            <input class=\"prop-input\" type=\"number\" min=\"0\" max=\"60\" step=\"1\" value=\"${props.slope}\" data-roof-prop=\"slope\" />
          </div>
          <div class=\"prop-row\">
            <span class=\"prop-row__label\">${t('roof.label.overhang')}</span>
            <input class=\"prop-input\" type=\"number\" min=\"0\" max=\"2\" step=\"0.05\" value=\"${props.overhang}\" data-roof-prop=\"overhang\" />
          </div>
          <div class=\"prop-row\">
            <span class=\"prop-row__label\">${t('roof.label.ridgeDir')}</span>
            <select class=\"prop-select\" data-roof-prop=\"ridgeDir\">
              <option value=\"x\"${props.ridgeDir === 'x' ? ' selected' : ''}>${t('roof.label.ridgeDir.x')}</option>
              <option value=\"z\"${props.ridgeDir === 'z' ? ' selected' : ''}>${t('roof.label.ridgeDir.z')}</option>
            </select>
          </div>
          <div class=\"prop-row\" style=\"margin-top: 1rem\">
            <button class=\"prop-button\" data-roof-action=\"rebalance\">${t('roof.btn.rebalance')}</button>
          </div>
        </div>
      </section>`
    roofPropsPanel.classList.remove('is-hidden')

    const panel = roofPropsPanel
    panel.querySelectorAll<HTMLElement>('[data-roof-prop]').forEach((el) => {
      el.addEventListener('change', () => {
        const updates: Partial<RoofProps> = {} as Partial<RoofProps>
        const key = el.dataset.roofProp as keyof RoofProps
        const input = el as HTMLInputElement | HTMLSelectElement
        if (key === 'type') updates.type = input.value as RoofType
        else if (key === 'slope') updates.slope = Number(input.value)
        else if (key === 'overhang') updates.overhang = Number(input.value)
        else if (key === 'ridgeDir') updates.ridgeDir = input.value as 'x' | 'z'
        scene.updateRoofProps(roof.id, updates)
      })
    })
    panel.querySelector<HTMLElement>('[data-roof-action=\"rebalance\"]')?.addEventListener('click', () => {
      scene.rebalanceRoof(roof.id)
      renderRoofPropsPanel()
    })
  }

  scene.onSelectionChanged((wall) => {
    if (wall) {
      timelinePanel.setState({ selectedObjectId: wall.id })
    } else if (!scene.getSelectedObject()) {
      timelinePanel.setState({ selectedObjectId: null })
    }
  })

  scene.onObjectSelectionChanged((obj) => {
    renderRoofPropsPanel()
    if (obj) {
      timelinePanel.setState({ selectedObjectId: obj.id })
      if (obj.openingId || resolveObjectOpeningSpec(obj)) {
        openDoorPropertiesPanel(obj, scene)
      }
    } else if (!scene.getSelected()) {
      timelinePanel.setState({ selectedObjectId: null })
      const existingPanel = document.querySelector('.opening-cad-panel')
      existingPanel?.remove()
    }
  })

  scene.onWallChanged((wall) => {
    timelinePanel.handleSceneElementChanged(wall.id)
  })

  scene.onObjectChanged((obj) => {
    timelinePanel.handleSceneElementChanged(obj.id)
  })

  scene.onWallRemoved((wall) => {
    if (!history.isReplaying()) {
      timelinePanel.removeTracksForObject(wall.id)
    }
  })

  scene.onObjectRemoved((obj) => {
    if (!history.isReplaying()) {
      timelinePanel.removeTracksForObject(obj.id)
    }
  })

  /* ---------- Columna derecha: navegador del proyecto ---------- */

  /**
   * Árbol dinámico: la sección «Plantas» lista los pisos reales del proyecto
   * (nombre + cota, ojo de visibilidad y piso activo). Se repinta en cada
   * cambio de niveles mediante `refreshLevelsUi`.
   */
  function buildNavigatorTree(): NavigatorNode[] {
    const activeId = scene.getActiveLevelId()
    const levelNodes: NavigatorNode[] = scene.getLevels().map((level) => ({
      id: level.id,
      label: `${level.name} · ${level.elevation.toFixed(2)} m`,
      icon: 'stairs',
      kind: 'level',
      levelId: level.id,
      visible: scene.isLevelVisible(level.id),
      isActive: level.id === activeId
    }))
    return [
      {
        id: 'project',
        label: 'Proyecto Principal',
        icon: 'house',
        children: [
          { id: 'floors', label: 'Plantas', icon: 'layers', children: levelNodes },
          {
            id: 'sections',
            label: 'Secciones',
            icon: 'scissors',
            children: [
              { id: 'section-aa', label: 'Sección A-A', icon: 'plan2d' },
              { id: 'section-bb', label: 'Sección B-B', icon: 'plan2d' }
            ]
          },
          {
            id: 'facades',
            label: 'Fachadas',
            icon: 'window',
            children: [
              { id: 'facade-north', label: 'Fachada Norte', icon: 'plan2d' },
              { id: 'facade-south', label: 'Fachada Sur', icon: 'plan2d' }
            ]
          },
          { id: 'nav-3d', label: 'Navegación 3D', icon: 'cube', action: 'fit-3d' }
        ]
      }
    ]
  }

  const navigator = mountProjectNavigator(document.getElementById('navigator-panel')!, {
    tree: buildNavigatorTree(),
    onSelect: (node) => handleNavigatorSelection(node),
    onLevelAction: (action, levelId) => handleLevelAction(action, levelId)
  })

  /** Repinta Navegador + selector de la barra de estado tras un cambio de pisos. */
  function refreshLevelsUi(): void {
    navigator.setTree(buildNavigatorTree())
    navigator.select(scene.getActiveLevelId())
    statusBar.setLevels(
      scene.getLevels().map((level) => ({ id: level.id, name: level.name, elevation: level.elevation })),
      scene.getActiveLevelId(),
      (id) => selectLevel(id, true)
    )
  }

  // Estructura, piso activo o visibilidad → árbol y barra siempre al día.
  scene.onLevelsChanged(refreshLevelsUi)

  /* ---------- Divisor Navegador / Chat ---------- */
  // El divisor lo construye y gestiona el LayoutManager (grupos «rows» del
  // dock); el viejo `#navigator-resizer` está retirado del marcado.

  /* ---------- Chat de IA ---------- */

  const aiChatService = new AIChatService(scene, {
    history,
    electricalModel,
    electricalDiagnosticModal,
    electricalRenderer,
    bimTable: bimMasterTable,
    onFrameScene: () => frameScene()
  })

  mountAIChatPanel(document.getElementById('chat-panel')!, {
    service: aiChatService,
    session: aiBrain,
    welcome: PROJECT_NOTES,
    prompts: [
      { label: '¿Cuántos bloques y cemento?', command: '¿cuántos sacos de cemento y cuántos bloques necesito para esta casa?' },
      { label: 'Auditar choques (Zero-Trash)', command: '¿hay algún choque entre tuberías y vigas o muros encimados?' },
      { label: 'Muros Piso 0 a 3.00m', command: 'cambia en la tabla todos los muros del Piso 0 a 3.00 metros de altura y dime cuánto sube el material' },
      { label: 'Segunda planta a la construcción', command: 'agrega una segunda planta a la construcción' },
      { label: 'Cablear casa (MEP)', command: 'cablea toda la casa con focos, switches, tomas y tablero' },
      { label: 'Terreno + aplanado + cúpula', command: 'crea terreno topográfico, aplana a +2m y pon cúpula geodésica' }
    ],
    onApplied: () => { frameScene() }
  })

  /* ---------- Paneles acoplables (dock y barra de actividades) ---------- */

  /**
   * Sistema de barra de actividades y paneles laterales (estilo VS Code):
   * el LayoutManager gestiona la ActivityBar, SidePanelHost, AIToggleButton,
   * Cuentas y Ajustes, persiste el diseño en localStorage y expone los toggles.
   */
  let activeCollabRoom: CollaborationRoomHandle | null = null
  let isRestoringOrSyncingScene = false

  function currentCollaboratorName(): string {
    const user = options.auth?.currentUser
    if (!user) return 'Colaborador'
    return user.name || user.email.split('@')[0] || 'Colaborador'
  }

  function applyRemoteSceneSync(payload: SceneSyncPayload): void {
    isRestoringOrSyncingScene = true
    try {
      const { kind, data } = payload
      const elementId = String(data.elementId ?? '')
      const snapshot = data.snapshot
      if (kind === 'wall_added' || kind === 'wall_changed' || kind === 'wall_removed') {
        if (kind === 'wall_removed') {
          if (elementId) scene.removeWall(elementId)
        } else if (snapshot) {
          const w = snapshot as PersistedWall
          scene.restoreWall(persistedWallToSnapshot(w))
        }
      } else if (kind === 'object_added' || kind === 'object_changed' || kind === 'object_removed') {
        if (kind === 'object_removed') {
          if (elementId) scene.removeObject(elementId)
        } else if (snapshot) {
          const o = snapshot as PersistedObject
          scene.restoreObject(persistedObjectToSnapshot(o))
        }
      }
      syncViewport()
      refreshDataStatus()
    } finally {
      isRestoringOrSyncingScene = false
    }
  }

  function startCollaborationSession(params: {
    roomCode: string
    projectId: string
    projectName: string
    role: CollaboratorRole
  }): CollaborationRoomHandle {
    activeCollabRoom?.disconnect()
    const user = options.auth?.currentUser
    const userId = user?.id ?? effectiveUserId()
    const userEmail = user?.email ?? 'usuario@arqstudio.local'
    const userName = currentCollaboratorName()

    activeCollabRoom = useCollaborationRoom({
      roomCode: params.roomCode,
      projectId: params.projectId,
      projectName: params.projectName,
      currentUser: {
        id: userId,
        name: userName,
        email: userEmail
      },
      initialRole: params.role,
      onChatMessage: (msg) => {
        collaborationDrawer.notifyIncomingChat(msg)
      },
      onActivityLog: (entry) => {
        collaborationDrawer.notifyIncomingActivity(entry)
      },
      onMembersChange: () => {
        collaborationDrawer.refresh()
      },
      onJoinRequestsChange: () => {
        collaborationDrawer.refresh()
      },
      onSceneSync: (payload) => {
        applyRemoteSceneSync(payload)
      }
    })
    collaborationDrawer.setRoom(activeCollabRoom, params.projectName)
    statusBar.setMessage(
      `Sala colaborativa activa (${params.roomCode}) · Rol: ${
        params.role === 'owner' ? 'Creador' : params.role === 'editor' ? 'Editor' : 'Solo lectura'
      }.`
    )
    return activeCollabRoom
  }

  const collaborationDrawer = mountCollaborationDrawer(document.getElementById('workspace')!, {
    currentUserId: () => options.auth?.currentUser?.id ?? effectiveUserId(),
    currentUserName: () => currentCollaboratorName(),
    onEnableCollaboration: async () => {
      const projectId = currentProjectId ?? `local-${Date.now()}`
      if (!currentProjectId) currentProjectId = projectId
      const projectName = currentProjectName || 'Proyecto Colaborativo'
      const user = options.auth?.currentUser
      const userId = user?.id ?? effectiveUserId()
      const userEmail = user?.email ?? 'usuario@arqstudio.local'
      const userName = currentCollaboratorName()
      const roomCode = generateRoomCode()
      const mode: ProjectMode = viewport.getViewMode() === '2d' ? '2D' : '3D'

      await createCollaborationRoom({
        projectId,
        projectName,
        ownerId: userId,
        ownerName: userName,
        ownerEmail: userEmail,
        roomCode,
        mode
      })

      return startCollaborationSession({
        roomCode,
        projectId,
        projectName,
        role: 'owner'
      })
    },
    onOpenStateChange: (isOpen, unreadCount, pulsing) => {
      layout.setCollaborationState({
        active: isOpen,
        badgeCount: unreadCount,
        pulsing
      })
    }
  })

  const layout = new LayoutManager(document.getElementById('workspace')!, {
    auth: options.auth,
    onExitToDashboard: options.onExit,
    onRequestAuth: options.onRequestAuth,
    onCollaborationClick: () => {
      collaborationDrawer.toggle()
    },
    isGridVisible: () => gridVisible,
    onToggleGrid: () => layers.toggleVisible('grid'),
    isSnapEnabled: () => snapEnabled,
    onToggleSnap: () => {
      snapEnabled = !snapEnabled
      statusBar.setMessage(`Enganche a rejilla ${snapEnabled ? 'activado' : 'desactivado'}.`)
    },
    isOrthoEnabled: () => orthoEnabled,
    onToggleOrtho: () => {
      orthoEnabled = !orthoEnabled
      statusBar.setMessage(`Modo ortogonal ${orthoEnabled ? 'activado' : 'desactivado'}.`)
    },
    isAiAutoApplyEnabled: () => aiAutoApply,
    onToggleAiAutoApply: () => {
      aiAutoApply = !aiAutoApply
      statusBar.setMessage(`Cerebro local «Aplicar sin confirmar» ${aiAutoApply ? 'activado' : 'desactivado'}.`)
    },
    onToggleCosts: () => {
      bimMasterTableView?.toggle()
    },
    onChanged: () => {
      // El lienzo cambia de tamaño al abrir/cerrar o redimensionar paneles:
      // se recalcula el render y el menú «Ver» refleja la visibilidad real.
      viewport.resize()
      syncViewChecks()
    }
  })

  const PANEL_DESCRIPTORS: Array<{
    id: PanelId
    title: string
    icon: 'ruler' | 'layers' | 'folderOpen' | 'astro' | 'calculator'
    elementId: string
    header?: string
    hasOwnCollapse?: boolean
    toggleAction: string
  }> = [
    { id: 'toolbox', title: t('panel.toolbox'), icon: 'ruler', elementId: 'toolbox-dock', header: '.panel__head', toggleAction: 'view.toggleToolbox' },
    { id: 'navigator', title: 'Navegador del Proyecto', icon: 'folderOpen', elementId: 'navigator-panel', header: '.panel__head', toggleAction: 'view.toggleNavigator' },
    { id: 'layers', title: t('panel.layers'), icon: 'layers', elementId: 'properties-panel', header: '.panel__head', toggleAction: 'view.toggleLayers' },
    { id: 'chat', title: 'Chat de IA · Astro', icon: 'astro', elementId: 'chat-panel', header: '.panel__head', hasOwnCollapse: true, toggleAction: 'view.toggleChat' }
  ]

  for (const descriptor of PANEL_DESCRIPTORS) {
    const element = document.getElementById(descriptor.elementId)
    if (!element) continue
    layout.register({
      id: descriptor.id,
      title: descriptor.title,
      icon: descriptor.icon,
      element,
      header: descriptor.header,
      hasOwnCollapse: descriptor.hasOwnCollapse
    })
  }
  layout.start()

  /* Línea de tiempo (dock inferior, ocultable con atajo Ctrl+Shift+T) */
  const timelineDock = document.getElementById('timeline-dock')
  if (timelineDock) timelinePanel.mount(timelineDock)

  /** Palomitas del menú «Ver» alineadas con la visibilidad real. */
  function syncViewChecks(): void {
    menuBar.setChecks({
      'view.toggleToolbox': layout.isVisible('toolbox'),
      'view.toggleLayers': layout.isVisible('layers'),
      'view.toggleCosts': bimMasterTableView?.isOpen() ?? false,
      'view.toggleBimTable': bimMasterTableView?.isOpen() ?? false,
      'view.toggleNavigator': layout.isVisible('navigator'),
      'view.toggleChat': layout.isVisible('chat'),
      'view.toggleTimeline': timelinePanel.isVisible(),
      'view.focusMode': layout.isFocusMode()
    })
  }
  syncViewChecks()

  /** Muestra/oculta un panel con mensaje en la barra de estado. */
  function togglePanelVisibility(id: PanelId): void {
    const visible = layout.toggle(id)
    const title = PANEL_DESCRIPTORS.find((descriptor) => descriptor.id === id)?.title ?? id
    statusBar.setMessage(
      `${title}: ${visible ? 'visible' : 'oculto'} (menú «Ver» o su atajo para volver a mostrarlo).`
    )
  }

  /* ---------- Gizmos del lienzo ---------- */

  // Handle del bucle de animación de cámara: los saltos de vista (clic en un
  // extremo de eje) se interpolan 300 ms; un gesto posterior lo cancela.
  let cameraAnimHandle = 0

  function cancelCameraAnimation(): void {
    if (cameraAnimHandle !== 0) {
      window.cancelAnimationFrame(cameraAnimHandle)
      cameraAnimHandle = 0
    }
  }

  /**
   * Anima yaw/pitch hasta la vista indicada (300 ms, ease-in-out) tomando el
   * camino corto en el yaw. Repinta en cada fotograma con `syncViewport()`,
   * de modo que la esfera de ejes gira sincronizada durante el vuelo.
   */
  function animateCameraToView(yaw: number, pitch: number, durationMs = 300): void {
    cancelCameraAnimation()
    const startYaw = cameraController.state.yaw
    const startPitch = cameraController.state.pitch
    // Camino corto: delta de yaw normalizado a (−π, π] para no dar la vuelta.
    const rawDelta = yaw - startYaw
    const deltaYaw = ((((rawDelta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    const deltaPitch = pitch - startPitch
    const startedAt = performance.now()

    const frame = (now: number): void => {
      const t = Math.min((now - startedAt) / durationMs, 1)
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      cameraController.state.yaw = startYaw + deltaYaw * ease
      cameraController.state.pitch = startPitch + deltaPitch * ease
      syncViewport()
      debugPanel?.updateCamera(cameraController.state, viewport.getViewMode(), tool.getMode())
      if (t < 1) {
        cameraAnimHandle = window.requestAnimationFrame(frame)
      } else {
        cameraAnimHandle = 0
        // Ajuste exacto al ángulo objetivo (elimina el residuo del easing).
        cameraController.state.yaw = startYaw + deltaYaw
        cameraController.state.pitch = startPitch + deltaPitch
        syncViewport()
      }
    }
    cameraAnimHandle = window.requestAnimationFrame(frame)
  }

  /* ---------- Esfera de órbita e indicador de ejes (a prueba de fallos) ----------
     Se montan POR CÓDIGO dentro del contenedor real del canvas visible
     (`canvas.parentElement`), NO por ids del HTML. Así sobreviven a que el layout
     nuevo (LayoutManager / SidePanelHost / dock) mueva, duplique u oculte el
     contenedor, y si algo falla se pinta un aviso rojo dentro del visor en vez de
     dejar al usuario sin ninguna pista. */

  let navigationSphere: NavigationSphereHandle | null = null

  /** Inserta un aviso rojo, pequeño y legible dentro del visor (sin DevTools). */
  function showMountWarning(host: HTMLElement, message: string): void {
    try {
      const warn = document.createElement('div')
      warn.dataset.gizmoWarning = 'true'
      warn.textContent = message
      warn.style.cssText =
        'position:absolute;top:50%;left:14px;transform:translateY(-50%);' +
        'max-width:60%;padding:6px 10px;border:1px solid #f87171;border-radius:6px;' +
        'background:rgba(24,8,8,0.9);color:#fecaca;font:11px/1.35 system-ui,sans-serif;' +
        'z-index:120;pointer-events:none;'
      host.appendChild(warn)
    } catch {
      /* el aviso nunca debe tumbar el montaje */
    }
  }

  /**
   * Crea (o reutiliza) el overlay del visor: capa absoluta que cubre todo el
   * contenedor, no intercepta el mouse; los hijos reactivan sus propios eventos.
   * Estilos inline para no depender de que el CSS haya cargado.
   */
  function ensureViewportOverlay(host: HTMLElement): HTMLDivElement {
    let overlay = host.querySelector<HTMLDivElement>('#viewport-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'viewport-overlay'
      host.insertBefore(overlay, host.firstChild)
    }
    overlay.style.position = 'absolute'
    overlay.style.inset = '0'
    overlay.style.pointerEvents = 'none'
    overlay.style.zIndex = '100'
    return overlay
  }

  /** Prepara un control: absoluto en su esquina, con tamaño en px y eventos activos. */
  function positionControl(el: HTMLElement, corner: 'top-left' | 'top-right', size: number): void {
    el.style.position = 'absolute'
    el.style.top = '14px'
    if (corner === 'top-left') el.style.left = '14px'
    else el.style.right = '14px'
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.display = 'block'
    el.style.visibility = 'visible'
    el.style.opacity = '1'
    el.style.pointerEvents = 'auto'
    el.style.zIndex = '101'
  }


  /**
   * Monta esfera + indicador dentro del padre real del canvas. Si el padre mide
   * 0×0 (oculto o en transición) programa un reintento con ResizeObserver en
   * cuanto tenga tamaño, y avisa en pantalla si no aparece canvas/contenedor.
   */
  function mountViewportGizmos(): void {
    const canvasHost = canvas.parentElement
    if (!canvasHost) {
      showMountWarning(canvas, 'Esfera: no se pudo montar: el canvas no tiene contenedor padre.')
      return
    }
    // El ancla de posicionamiento absoluto DEBE ser el padre del canvas.
    if (getComputedStyle(canvasHost).position === 'static') canvasHost.style.position = 'relative'

    try {
      const overlay = ensureViewportOverlay(canvasHost)

      const sphereEl =
        document.getElementById('navigation-sphere') ?? document.createElement('div')
      if (!sphereEl.id) sphereEl.id = 'navigation-sphere'
      if (sphereEl.parentElement !== overlay) overlay.appendChild(sphereEl)
      positionControl(sphereEl, 'top-right', 118)

      // En planta 2D se ocultan; la clase vive en el contenedor padre del canvas.
      if (viewport.getViewMode() === '2d') canvasHost.classList.add('mode-2d')

      navigationSphere = mountNavigationSphere(sphereEl, {
        onSnapAxis: (axis, negative) => {
          const target = cameraController.viewAnglesForAxis(axis, negative)
          animateCameraToView(target.yaw, target.pitch)
          statusBar.setMessage(`Vista alineada al eje ${negative ? '−' : ''}${axis}.`)
        },
        onOrbit: (deltaX, deltaY) => {
          cancelCameraAnimation()
          cameraController.orbit(deltaX, deltaY)
          syncViewport()
          orbitCallCount += 1
          debugPanel?.updateCamera(cameraController.state, viewport.getViewMode(), tool.getMode())
        },
        onReset3D: () => {
          resetView()
        }
      })


      navigationSphere.update(cameraController.state)

      // Montar controlador de herramientas de Topografía (Elevation Probe y Grading Pad)
      if (!topographyTool) {
        topographyTool = mountTopographyTool({
          canvas,
          overlay,
          scene,
          viewport,
          cameraClaimsGesture: (e) => orbitToolActive || (e.altKey && (e.button === 0 || e.button === 2)),
          onMessage: (msg) => statusBar.setMessage(msg),
          onModeChange: (m) => {
            toolbox.setActiveTopographyMode(m)
            if (m === 'probe') statusBar.setTool('Sacar Niveles / Cotas')
            else if (m === 'grade') statusBar.setTool('Aplanar Terreno')
            else statusBar.setTool('Seleccionar')
          },
          onGradingResult: (stats) => {
            toolbox.setCutFillStats(stats.cutVolumeM3, stats.fillVolumeM3, stats.targetElevation)
            selectionTransformPanel?.refresh()
          }
        })
      }

      // Montar panel flotante de Transformación y Adaptación de Tamaño en Tiempo Real
      if (!selectionTransformPanel) {
        selectionTransformPanel = mountSelectionTransformPanel({
          overlay,
          scene,
          viewport,
          onMessage: (msg) => statusBar.setMessage(msg)
        })
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      showMountWarning(canvasHost, `Esfera: no se pudo montar: ${reason}`)
    }
  }

  mountViewportGizmos()

  scene.onObjectAdded(() => topographyTool?.refreshOverlay())
  scene.onObjectRemoved(() => topographyTool?.refreshOverlay())
  scene.onObjectChanged((obj) => {
    if (obj.terrainData) {
      topographyTool?.refreshOverlay()
      toolbox.setCutFillStats(obj.terrainData.cutVolumeM3 ?? 0, obj.terrainData.fillVolumeM3 ?? 0)
    }
  })

  /* ---------- Sincronización del estado de la vista ---------- */

  /** Repinta la cámara real y refleja el estado en el slider de zoom y la esfera de ejes. */
  function syncViewport(): void {
    viewport.syncCamera()
    hud.setZoomFraction(cameraController.getZoomFraction())
    navigationSphere?.update(cameraController.state)
    annotations?.update()
    topographyTool?.refreshOverlay()
  }

  function setWallTool(type: WallSegmentType): void {
    if (type === WallSegmentType.RoomWalls) {
      activateWallTemplate('rect')
      return
    }
    orbitToolActive = false
    roofDraft?.dispose()
    roofDraft = null
    annotations?.setMode(null)
    topographyTool?.setMode('none')
    activeWallTool = type
    tool.setMode('wall')
    toolbox.setActiveWallTool(type)
    menuBar.setActiveTool(`tool.${type}`)
    statusBar.setTool(TOOL_LABELS[type])
  }

  /**
   * Herramienta «Techo» (barra superior). Pide modo y propiedades, y actúa:
   *  - Manual: activa el trazo poligonal sobre la cuadrícula (snap a 0.5 m,
   *    cierre con doble clic/clic en el primer punto, Enter confirma y Esc
   *    cancela). El techo cubre el área que el usuario dibuja.
   *  - Automático: detecta el contorno exterior de los muros del piso activo
   *    y genera el techo sobre él.
   * La altura es la elevación del piso + su altura (la fija `createRoof`), y
   * la creación queda registrada en el historial (Ctrl+Z).
   */
  async function startRoofTool(): Promise<void> {
    const overlay = dialogOverlay()
    if (!overlay) {
      statusBar.setMessage('Techo: no se encontró el contenedor de diálogos.')
      return
    }
    const options = await askRoofOptions(overlay, {
      type: 'gable',
      slope: DEFAULT_ROOF_SLOPE,
      overhang: DEFAULT_ROOF_OVERHANG,
      thickness: DEFAULT_ROOF_THICKNESS,
      material: 'mat.terracotta'
    })
    if (!options) {
      statusBar.setMessage('Techo: cancelado.')
      return
    }

    const draftProps: RoofDraftProps = {
      type: options.type,
      slope: options.slope,
      overhang: options.overhang,
      thickness: options.thickness,
      ridgeDir: options.ridgeDir,
      material: options.material
    }

    if (options.mode === 'auto') {
      // Modo automático: usa el piso MÁS ALTO que tiene muros (no necesariamente el activo).
      const sourceLevel = scene.getHighestLevelWithWalls()
      if (!sourceLevel) {
        statusBar.setMessage('No hay muros definidos en ningún piso. Dibuja muros primero.')
        return
      }
      tool.setMode('select')
      roofDraft?.dispose()
      roofDraft = null
      viewport.clearToolPreview()
      const obj = scene.createRoof({
        auto: true,
        type: draftProps.type,
        slope: draftProps.slope,
        overhang: draftProps.overhang,
        thickness: draftProps.thickness,
        materialId: draftProps.material,
        levelId: sourceLevel.id,
        ridgeDir: draftProps.ridgeDir
      })
      if (!obj) {
        statusBar.setMessage(
          `${t('roof.msg.openFootprint')} en «${sourceLevel.name}»`
        )
        return
      }
      const area = takeoffRoofArea(obj)
      statusBar.setMessage(
        `Techo ${roofTypeLabel(draftProps.type)} creado sobre «${scene.getLevel(obj.levelId)?.name ?? ''}»${
          area > 0 ? ` · ${area.toFixed(2)} m²` : ''
        } (Ctrl+Z para deshacer).`
      )
      return
    }

    // Modo manual: guarda la herramienta anterior, pone el lienzo en modo
    // trazo y arranca el borrador con estos parámetros. Se restaura al salir.
    const toolBeforeRoof = tool.getMode()
    tool.setMode('wall')
    roofDraft?.dispose()
    roofDraft = mountRoofDraft(
      {
        canvas,
        viewport,
        scene,
        snapEnabled: () => snapEnabled,
        onMessage: (msg) => statusBar.setMessage(msg),
        onDone: () => {
          roofDraft = null
          tool.setMode(toolBeforeRoof)
        }
      },
      draftProps
    )
    statusBar.setMessage('Techo: marca los puntos del contorno. Enter crea, Esc cancela.')
  }

  /** Área inclinada (planta / cos pendiente + alero) de un techo ya creado. */
  function takeoffRoofArea(obj: SceneObject): number {
    const footprint = obj.roofProps?.footprint ?? []
    if (footprint.length < 3) return 0
    return roofTotalArea(footprint, obj.roofProps?.slope ?? DEFAULT_ROOF_SLOPE, obj.roofProps?.overhang ?? DEFAULT_ROOF_OVERHANG)
  }

  /** Encuadra la cámara al contenido del modelo (ajustando al aspecto del lienzo). */
  function frameScene(): void {
    cancelCameraAnimation()
    cameraController.frameBounds(scene.getSceneBounds(), viewport.getAspect(), viewport.getVerticalFov())
    syncViewport()
  }

  function stepZoom(factor: number): void {
    cameraController.zoomByFactor(factor)
    syncViewport()
    statusBar.setMessage(factor < 1 ? 'Zoom acercado.' : 'Zoom alejado.')
  }

  /**
   * Cambia entre la vista 3D orbital y la planta 2D. En 2D se bloquea la órbita
   * (el arrastre pasa a ser pan), se guarda la vista 3D previa para restaurarla
   * y el zoom se convierte en un dolly centrado.
   */
  function setViewMode(mode: ViewMode): void {
    cancelCameraAnimation()
    if (mode === '2d' && viewport.getViewMode() !== '2d') {
      saved3dState = {
        yaw: cameraController.state.yaw,
        pitch: cameraController.state.pitch,
        distance: cameraController.state.distance,
        target: cameraController.state.target.clone()
      }
      cameraController.snapToAxis(Axis3D.Y)
    } else if (mode === '3d' && saved3dState) {
      cameraController.state.yaw = saved3dState.yaw
      cameraController.state.pitch = saved3dState.pitch
      cameraController.state.distance = saved3dState.distance
      cameraController.state.target.copy(saved3dState.target)
      saved3dState = null
    }

    viewport.setViewMode(mode)
    hud.setViewMode(mode)
    statusBar.setViewMode(mode)
    // Solo en 3D: la esfera de órbita y el gizmo de ejes se ocultan en planta.
    document.getElementById('viewport-container')?.classList.toggle('mode-2d', mode === '2d')
    syncViewport()
    // El HUD de la barra de estado puede refluir al cambiar de modo; tras el
    // pintado se reorienta la esfera con las medidas finales ya aplicadas.
    window.requestAnimationFrame(() => {
      navigationSphere?.update(cameraController.state)
    })
    statusBar.setMessage(
      mode === '2d'
        ? 'Vista 2D (planta ortográfica): el arrastre desplaza y la rueda hace zoom.'
        : 'Vista 3D orbital: clic izquierdo para orbitar, rueda para acercar.'
    )
  }

  function convertToPlan(): void {
    setViewMode('2d')
    frameScene()
    statusBar.setMessage('Plano generado a partir del modelo 3D: vista de planta encuadrada al contenido.')
  }

  function resetView(): void {
    cancelCameraAnimation()
    saved3dState = null
    cameraController.state = new CameraState()
    viewport.setViewMode('3d')
    hud.setViewMode('3d')
    statusBar.setViewMode('3d')
    document.getElementById('viewport-container')?.classList.remove('mode-2d')
    syncViewport()
    statusBar.setMessage('Vista restablecida (perspectiva orbital inicial).')
  }

  /* ---------- Historial (Undo / Redo de la barra superior) ---------- */

  function applyHistoryState(): void {
    menuBar.setHistoryState(history.canUndo(), history.canRedo())
  }

  function undo(): void {
    const label = history.peekUndoLabel()
    if (!history.undo()) {
      statusBar.setMessage('No hay nada que deshacer.')
      return
    }
    syncViewport()
    statusBar.setMessage(`Deshecho: ${label ?? 'operación'}.`)
  }

  function redo(): void {
    const label = history.peekRedoLabel()
    if (!history.redo()) {
      statusBar.setMessage('No hay nada que rehacer.')
      return
    }
    syncViewport()
    statusBar.setMessage(`Rehecho: ${label ?? 'operación'}.`)
  }

  history.onChange(applyHistoryState)

  /* ---------- Capas: del modelo al render real ---------- */

  // El panel se repinta una sola vez por tanda de cambios: acciones como
  // «mostrar todas las capas» emiten 7 notificaciones seguidas y, sin esto,
  // cada una recargaría el panel completo (7 repintados en cascada).
  let layersPanelRefreshQueued = false
  const scheduleLayersPanelRefresh = (): void => {
    if (layersPanelRefreshQueued) return
    layersPanelRefreshQueued = true
    queueMicrotask(() => {
      layersPanelRefreshQueued = false
      layersPanel.refresh()
    })
  }

  layers.onLayerChanged((layer) => {
    viewport.applyLayer(layer)
    if (layer.id === 'grid') {
      gridVisible = layer.visible
      viewport.setGridVisible(gridVisible)
    }
    scheduleLayersPanelRefresh()
    statusBar.setMessage(
      `Capa «${layer.name}»: ${layer.visible ? 'visible' : 'oculta'} · ${layer.lineType}${layer.locked ? ' · bloqueada' : ''}.`
    )
  })

  /* ---------- Niveles (pisos): selección, encuadre y acciones ---------- */

  function handleNavigatorSelection(node: NavigatorNode): void {
    if (node.kind === 'level' && node.levelId) {
      selectLevel(node.levelId, true)
      return
    }
    if (node.action === 'fit-3d') {
      setViewMode('3d')
      frameScene()
      statusBar.setMessage('Navegación 3D: vista encuadrada al modelo.')
      return
    }
    if (node.children?.length) return
    statusBar.setMessage(`«${node.label}»: vista aún no disponible.`)
  }

  /** Enfoca la cámara en la envolvente de un piso (o en su cota si está vacío). */
  function frameLevel(levelId: string): void {
    const level = scene.getLevel(levelId)
    const elevation = level?.elevation ?? 0
    const walls = scene.getWalls().filter((wall) => wall.levelId === levelId)
    const objects = scene.getObjects().filter((object) => object.levelId === levelId)

    const box = new THREE.Box3()
    if (walls.length === 0 && objects.length === 0) {
      box.set(
        new THREE.Vector3(-5, elevation, -5),
        new THREE.Vector3(5, elevation + (level?.height ?? 2.8), 5)
      )
    } else {
      for (const wall of walls) {
        box.expandByPoint(wall.start)
        box.expandByPoint(wall.end)
        box.expandByPoint(new THREE.Vector3(wall.start.x, wall.start.y + wall.height, wall.start.z))
        box.expandByPoint(new THREE.Vector3(wall.end.x, wall.end.y + wall.height, wall.end.z))
      }
      for (const object of objects) {
        box.expandByPoint(object.position)
        box.expandByPoint(
          new THREE.Vector3(object.position.x, object.position.y + object.size.y, object.position.z)
        )
      }
    }
    cameraController.frameBounds(box, viewport.getAspect(), viewport.getVerticalFov())
    syncViewport()
  }

  /** Activa un piso (atenuación del visor + barra de estado) y, opcionalmente, encuadra. */
  function selectLevel(levelId: string, frame: boolean): void {
    const changed = scene.setActiveLevel(levelId)
    if (frame) frameLevel(levelId)
    if (!changed) return
    const level = scene.getLevel(levelId)
    if (level) statusBar.setMessage(`${level.name} activo · Elev. ${level.elevation.toFixed(2)} m.`)
  }

  /** Botón «Subir al siguiente piso»: activa el piso superior y encuadra. */
  function goNextLevel(): void {
    const levels = scene.getLevels()
    const index = levels.findIndex((level) => level.id === scene.getActiveLevelId())
    if (index === -1 || index >= levels.length - 1) {
      statusBar.setMessage('Ya estás en el piso superior: usa «Añadir piso» para crear uno nuevo.')
      return
    }
    const next = levels[index + 1]
    selectLevel(next.id, true)
    statusBar.setMessage(`Subido a ${next.name} · Elev. ${next.elevation.toFixed(2)} m.`)
  }

  /** Contenedor de diálogos de la app (`#dialog-overlay`). */
  function dialogOverlay(): HTMLElement | null {
    return document.getElementById('dialog-overlay')
  }

  /**
   * «Añadir piso» (Navegador y menú Dibujo): pregunta si se copia la planta
   * del piso inferior como base, crea el nivel (elevación = suma de las
   * alturas de los anteriores, queda activo) y encuadra la cámara.
   */
  async function promptAddLevelFlow(): Promise<void> {
    const overlay = dialogOverlay()
    if (!overlay) {
      statusBar.setMessage('Añadir piso: no se encontró el contenedor de diálogos.')
      return
    }
    const levels = scene.getLevels()
    const below = levels[levels.length - 1]
    const choice = await askLevelCopy(overlay, below.name)
    if (!choice) {
      statusBar.setMessage('Añadir piso: cancelado.')
      return
    }

    history.transaction('Añadir piso', () => {
      const created = scene.addLevel()
      if (choice !== 'copy') return
      // Copia de la planta inferior; `addWall` re-cota cada muro a la
      // elevación del piso nuevo y lo asigna a ese nivel.
      for (const wall of scene.getWalls().filter((candidate) => candidate.levelId === below.id)) {
        scene.addWall(wall.type, wall.start.clone(), wall.end.clone(), wall.aiControlled, created.id)
      }
      for (const object of scene.getObjects().filter((candidate) => candidate.levelId === below.id)) {
        const copy = scene.addObject(new SceneObject(object.name, object.kind))
        copy.position.copy(object.position)
        copy.position.y = created.elevation
        copy.rotationY = object.rotationY
        copy.size.copy(object.size)
        copy.color = object.color
        copy.shapeId = object.shapeId
        copy.materialId = object.materialId
        copy.levelId = created.id
        // Los techos pertenecen a un piso: la copia arrastra su contorno, apunta
        // al piso nuevo y se coloca a su cota (elevación + altura), nunca a la
        // del origen (era el bug del techo que se quedaba atrás al copiar pisos).
        if (object.roofProps) {
          copy.roofProps = {
            ...object.roofProps,
            footprint: object.roofProps.footprint.map((p) => ({ x: p.x, z: p.z })),
            sourceLevelId: created.id
          }
          copy.position.y = created.elevation + created.height
        }
      }
    })

    // El piso nuevo siempre queda el último de la lista.
    const created = scene.getLevels()[scene.getLevels().length - 1]
    frameLevel(created.id)
    statusBar.setMessage(
      choice === 'copy'
        ? `${created.name} creado copiando la planta de «${below.name}» · Elev. ${created.elevation.toFixed(2)} m (Ctrl+Z para deshacer).`
        : `${created.name} creado vacío · Elev. ${created.elevation.toFixed(2)} m (Ctrl+Z para deshacer).`
    )
  }

  /** Botones de piso del Navegador (ojo, solo, renombrar, altura, borrar…). */
  function handleLevelAction(action: LevelNodeAction, levelId?: string): void {
    switch (action) {
      case 'add':
        void promptAddLevelFlow()
        break
      case 'next':
        goNextLevel()
        break
      case 'toggle-visible': {
        if (!levelId) return
        scene.setLevelVisible(levelId, !scene.isLevelVisible(levelId))
        const level = scene.getLevel(levelId)
        if (level) {
          statusBar.setMessage(
            `Piso «${level.name}»: ${scene.isLevelVisible(levelId) ? 'visible' : 'oculto'}.`
          )
        }
        break
      }
      case 'solo': {
        if (!levelId) return
        const levels = scene.getLevels()
        const showingOnly =
          scene.isLevelVisible(levelId) &&
          levels.every((level) => level.id === levelId || !scene.isLevelVisible(level.id))
        if (showingOnly) {
          scene.showAllLevels()
          statusBar.setMessage('Mostrando todos los pisos.')
        } else {
          scene.showOnlyLevel(levelId)
          statusBar.setMessage(
            `Mostrando solo «${scene.getLevel(levelId)?.name ?? ''}» (vuelve a pulsar para ver todos).`
          )
        }
        break
      }
      case 'rename': {
        if (!levelId) return
        const level = scene.getLevel(levelId)
        const overlay = dialogOverlay()
        if (!level || !overlay) return
        void promptLevelName(overlay, level.name).then((name) => {
          if (!name || !scene.updateLevel(levelId, { name })) return
          statusBar.setMessage(`Piso renombrado a «${name}» (Ctrl+Z para deshacer).`)
        })
        break
      }
      case 'height': {
        if (!levelId) return
        const level = scene.getLevel(levelId)
        const overlay = dialogOverlay()
        if (!level || !overlay) return
        void promptLevelHeight(overlay, level.height).then((height) => {
          if (height === null) return
          if (!scene.updateLevel(levelId, { height })) return
          statusBar.setMessage(
            `Altura de «${level.name}» = ${height.toFixed(2)} m; elevaciones recalculadas (Ctrl+Z para deshacer).`
          )
        })
        break
      }
      case 'delete': {
        if (!levelId) return
        if (scene.getLevels().length <= 1) {
          statusBar.setMessage('No se puede eliminar el único piso del proyecto.')
          return
        }
        const level = scene.getLevel(levelId)
        const overlay = dialogOverlay()
        if (!level || !overlay) return
        void confirmLevelDelete(overlay, level.name).then((confirmed) => {
          if (!confirmed) return
          history.transaction(`Eliminar ${level.name}`, () => scene.removeLevel(levelId))
          statusBar.setMessage(`Piso «${level.name}» eliminado (Ctrl+Z para deshacer).`)
        })
        break
      }
    }
  }

  /* ---------- Acciones de la barra superior y atajos ---------- */

  const ACTION_LABELS: Record<string, string> = {
    'tool.pencil': 'Lápiz',
    'tool.highlighter': 'Resaltador',
    'tool.pen': 'Pluma / contorno',
    'tool.eraser': 'Borrador',
    'tool.ruler': 'Regla / cota',
    'tool.hand': 'Encuadrar (pan)',
    'tool.crosshair': 'Seleccionar',
    'tool.roof': 'Cubierta',
    'tool.slab': 'Losa / forjado',
    'tool.door': 'Puerta',
    'tool.window': 'Ventana',
    'tool.stairs': 'Escalera'
  }

  /** Traduce el identificador de acción en la operación real del motor/UI. */
  function applyAction(actionId: string): void {
    switch (actionId) {
      /* Archivo */
      case 'file.dashboard':
        // Vuelve a la pantalla inicial («Mis proyectos»).
        options.onExit()
        break
      case 'file.new':
        history.transaction('Nuevo proyecto', () => {
          scene.clear()
          annotations?.clear()
          electricalModel.clear(false)
          // Los pisos vuelven a un único «Piso 0» (paso deshacible también).
          scene.resetLevels()
        })
        statusBar.setMessage('Proyecto nuevo: la escena quedó vacía (Ctrl+Z para recuperar el contenido).')
        break
      case 'file.open':
      case 'file.import': {
        openImportModal()
        break
      }
      case 'file.save':
        void saveScene()
        break
      case 'file.print':
        statusBar.setMessage('Imprimir: pendiente de implementar.')
        break
      case 'file.export': {
        const overlay = document.getElementById('dialog-overlay')
        const bridge = (window as unknown as { arqStudio?: { app?: Parameters<typeof mountExportDialog>[1]['app'] } })
          .arqStudio?.app
        if (!overlay) {
          statusBar.setMessage('Exportar: el diálogo no está disponible en esta vista.')
          break
        }
        mountExportDialog(overlay, {
          scene,
          app: bridge,
          statusBar,
          projectName: currentProjectName || 'proyecto',
          viewport
        }).open()
        break
      }
      case 'file.clear':
        void confirmAndClearScene()
        break
      /* Animación */
      // case 'animar': {} placeholder
      case 'file.exit':
        ;(window as unknown as { arqStudio?: { window?: { close(): void } } }).arqStudio?.window?.close()
        break

      /* Edición */
      case 'edit.undo':
        undo()
        break
      case 'edit.redo':
        redo()
        break
      case 'edit.delete':
        deleteSelection()
        break
      case 'edit.duplicate':
      case 'edit.copy':
        duplicateSelection()
        break
      case 'edit.selectAll':
        selectAllElements()
        break
      case 'edit.cut':
        statusBar.setMessage('Cortar: disponible cuando exista selección de objetos.')
        break

      /* Dibujo: muros simples y plantillas rápidas 2D de muros conectados */
      case 'tool.SimpleWall':
      case 'tool.StructuralSegment':
        setWallTool(actionId.replace('tool.', '') as WallSegmentType)
        break
      case 'tool.RoomWalls':
      case 'template.rect':
        activateWallTemplate('rect')
        break
      case 'template.l':
      case 'template.u':
      case 'template.c':
      case 'template.t':
      case 'template.cross':
      case 'template.ring':
      case 'template.arc': {
        const tplId = resolveWallTemplateId(actionId)
        if (tplId) activateWallTemplate(tplId)
        break
      }
      case 'tool.add':
        void openAddElementDialog()
        break
      /* Niveles (multiplanta) */
      case 'level.add':
        void promptAddLevelFlow()
        break
      case 'level.next':
        goNextLevel()
        break
      /* Techo por área: manual (clics) o automático (muros del piso) */
      case 'tool.roof':
        void startRoofTool()
        break
      /* Puerta / ventana / losa: entran en colocación vía catálogo */
      case 'tool.slab':
      case 'tool.door':
      case 'tool.window':
      case 'tool.stairs': {
        const catalogId =
          actionId === 'tool.slab' ? 'opening.slab'
          : actionId === 'tool.door' ? 'opening.door'
          : actionId === 'tool.window' ? 'opening.window'
          : 'shape.stairs'
        const entry = getCatalogEntry(catalogId)
        if (entry) selectCatalogItem({ id: entry.id, kind: entry.kind, label: entry.label })
        else statusBar.setMessage(`«${actionId}»: elemento no encontrado en el catálogo.`)
        break
      }

      /* Modificadores del toolbox: misma acción que cualquier otro punto de entrada */
      case 'modify.move':
        orbitToolActive = false
        roofDraft?.dispose()
        roofDraft = null
        annotations?.setMode(null)
        topographyTool?.setMode('none')
        tool.setMode('select')
        toolbox.setActiveActionTool('modify.move')
        menuBar.setActiveTool(null)
        statusBar.setTool('Mover')
        statusBar.setMessage(
          'Mover [V]: arrastra un muro u objeto sobre la cuadrícula · arrastra los extremos azules de un muro para estirarlo.'
        )
        break
      case 'modify.rotate90':
        rotateSelectionOrPending90()
        break
      case 'modify.copy':
        duplicateSelection()
        break
      case 'modify.trim':
        statusBar.setMessage('Recortar: pendiente de implementar.')
        break
      case 'modify.erase':
        deleteSelection()
        break

      /* Seleccionar / Cancelar trazo actual [S / Esc] sin borrar lo ya dibujado */
      case 'tool.crosshair': {
        const hadStroke =
          tool.hasActiveStroke() ||
          Boolean(roofDraft?.isActive()) ||
          Boolean(annotations?.isActive()) ||
          Boolean(topographyTool?.isActive()) ||
          Boolean(electricalTool?.isActive()) ||
          orbitToolActive
        orbitToolActive = false
        roofDraft?.dispose()
        roofDraft = null
        annotations?.setMode(null)
        topographyTool?.setMode('none')
        electricalTool?.cancel()
        toolbox.setActiveElectricalDevice(null)
        toolbox.setWiringToolActive(false)
        tool.cancel()
        tool.setMode('select')
        toolbox.setActiveActionTool('tool.crosshair')
        menuBar.setActiveTool('tool.crosshair')
        statusBar.setTool('Seleccionar')
        if (hadStroke) {
          statusBar.setMessage('Trazo cancelado (lo ya dibujado se conserva). Modo Seleccionar [S] activo.')
        }
        break
      }

      /* Vistas */
      case 'view.toggle2d3d':
        setViewMode(viewport.getViewMode() === '2d' ? '3d' : '2d')
        break
      case 'aux.2d':
        setViewMode('2d')
        break
      case 'aux.3d':
        setViewMode('3d')
        break
      case 'aux.fit':
        frameScene()
        statusBar.setMessage('Vista centrada y encuadrada a toda la estructura [C / Home].')
        break
      case 'aux.reset':
        resetView()
        break
      case 'aux.top':
        cameraController.snapToAxis(Axis3D.Y)
        syncViewport()
        statusBar.setMessage('Vista superior (planta).')
        break
      case 'aux.front':
        cameraController.snapToAxis(Axis3D.Z)
        syncViewport()
        statusBar.setMessage('Vista frontal (eje Z).')
        break
      case 'aux.right': {
        cameraController.snapToAxis(Axis3D.X)
        syncViewport()
        statusBar.setMessage('Vista lateral (eje X).')
        break
      }
      // «O» (atajo del catálogo: view.orbit) y el alias de menú aux.orbit
      // activan/desactivan la herramienta «Orbitar».
      case 'view.orbit':
      case 'aux.orbit': {
        toggleOrbitTool()
        break
      }
      case 'aux.zoomIn':
        stepZoom(0.8)
        break
      case 'aux.zoomOut': {
        stepZoom(1.25)
        break
      }
      case 'aux.nav.up': {
        cameraController.pan(0, -cameraController.state.distance * cameraController.panSensitivity)
        syncViewport()
        statusBar.setMessage('Desplazamiento hacia arriba.')
        break
      }
      case 'aux.nav.down': {
        cameraController.pan(0, cameraController.state.distance * cameraController.panSensitivity)
        syncViewport()
        statusBar.setMessage('Desplazamiento hacia abajo.')
        break
      }
      case 'aux.nav.left': {
        cameraController.pan(cameraController.state.distance * cameraController.panSensitivity, 0)
        syncViewport()
        statusBar.setMessage('Desplazamiento a la izquierda.')
        break
      }
      case 'aux.nav.right': {
        cameraController.pan(-cameraController.state.distance * cameraController.panSensitivity, 0)
        syncViewport()
        statusBar.setMessage('Desplazamiento a la derecha.')
        break
      }

      /* Paneles acoplables (menú «Ver» + atajos) */
      case 'view.toggleToolbox':
        togglePanelVisibility('toolbox')
        break
      case 'view.toggleLayers':
      case 'aids.layers':
        togglePanelVisibility('layers')
        break
      case 'view.toggleNavigator':
        togglePanelVisibility('navigator')
        break
      case 'view.toggleCosts':
      case 'view.toggleBimTable':
        bimMasterTableView?.toggle()
        statusBar.setMessage(
          `Tabla Maestra BIM, Cuantificación y Costos ${bimMasterTableView?.isOpen() ? 'visible' : 'oculta'}.`
        )
        syncViewChecks()
        break
      case 'view.toggleChat':
        togglePanelVisibility('chat')
        break
      case 'view.toggleTimeline':
        timelinePanel.toggleVisible()
        break
      case 'view.focusMode': {
        const focusOn = layout.toggleFocusMode()
        statusBar.setMessage(
          focusOn
            ? 'Modo concentración: solo el lienzo (Ctrl+K Z para restaurar los paneles).'
            : 'Paneles restaurados.'
        )
        break
      }
      case 'view.resetLayout':
        layout.reset()
        statusBar.setMessage('Diseño restablecido a la disposición por defecto.')
        break

      /* Paleta de comandos (punto F) */
      case 'view.commandPalette':
        commandPalette?.toggle()
        break

      /* Módulos BIM: Vista Cuádruple */
      case 'view.quadView':
        quadViewBimManager?.toggle()
        statusBar.setMessage('Vista Cuádruple BIM (Planta / Corte / Fachada / 3D) alternada.')
        break

      /* Ayudas de dibujo */
      case 'aids.grid':
        layers.toggleVisible('grid')
        break
      case 'aids.snap':
        snapEnabled = !snapEnabled
        statusBar.setMessage(`Enganche a rejilla ${snapEnabled ? 'activado' : 'desactivado'}.`)
        break
      case 'aids.ortho':
        orthoEnabled = !orthoEnabled
        statusBar.setMessage(`Modo ortogonal ${orthoEnabled ? 'activado' : 'desactivado'}.`)
        break
      case 'aids.polar':
        statusBar.setMessage('Seguimiento polar: pendiente de implementar.')
        break
      case 'help.shortcuts':
        shortcutsModal.toggle()
        break

      /* Herramientas AEC: Muestra de verificación (Requisito A4) */
      case 'aec.testHouse': {
        buildTestHouseScene(scene)
        setViewMode('3d')
        cameraController.orbit(0.72, 0.42)
        frameScene()
        syncViewport()
        toolbox.setActiveTab('materials')
        materialPalette?.refresh()
        statusBar.setMessage('«Casa de prueba» cargada: muros de ladrillo y estuco, piso de madera, techo de teja, aberturas, muebles y cerca.')
        break
      }

      /* Menú «Notas»: Anotaciones y revisión técnica */
      case 'notas.note':
      case 'notas.leader':
      case 'notas.revision':
      case 'notas.table':
      case 'annot.text':
      case 'annot.dimension':
      case 'annot.tag':
      case 'annot.highlight': {
        const annotMode = ANNOTATION_ACTIONS[actionId]
        if (annotMode && annotations) {
          tool.setMode('select')
          menuBar.setActiveTool(actionId)
          annotations.setMode(annotMode)
        }
        break
      }

      default:
        if (ACTION_LABELS[actionId]) {
          menuBar.setActiveTool(actionId)
          // «Seleccionar» devuelve el lienzo al modo normal de interacción.
          if (actionId === 'tool.crosshair') {
            tool.setMode('select')
            annotations?.setMode(null)
          }
          statusBar.setMessage(`Herramienta «${ACTION_LABELS[actionId]}» activada.`)
          break
        }
        statusBar.setMessage(`«${actionId}»: función pendiente de implementar.`)
    }
  }

  /* ---------- Registro central de acciones ---------- */

  /** Handlers del catálogo: cada acción reutiliza la MISMA implementación del switch. */
  const actionHandlers: Record<string, () => void> = Object.fromEntries(
    ACTION_CATALOG.map((meta) => [meta.id, () => applyAction(meta.id)] as const)
  )

  /**
   * Registro central: única fuente de verdad de las acciones del editor. Los
   * menús, la barra de iconos, el toolbox y los atajos de teclado despachan por
   * aquí; Deshacer y Rehacer exponen su disponibilidad mediante `enabled()`.
   * (La paleta de comandos de la Fase 4 reutilizará este mismo registro.)
   */
  const actions = new ActionRegistry(ACTION_CATALOG, actionHandlers, {
    'edit.undo': () => history.canUndo(),
    'edit.redo': () => history.canRedo()
  })

  /** Despachador único de la aplicación. */
  function handleAction(actionId: string): void {
    // Mientras la animación se reproduce o está en pausa, las acciones de edición quedan bloqueadas.
    if (
      animationEngine.isEditingLocked() &&
      (actionId.startsWith('edit.') ||
        actionId.startsWith('tool.') ||
        actionId.startsWith('template.') ||
        actionId.startsWith('modify.') ||
        actionId.startsWith('level.') ||
        actionId.startsWith('aec.') ||
        actionId === 'file.clear' ||
        actionId === 'file.new')
    ) {
      if (actionId === 'tool.crosshair') {
        stopPlayback()
        return
      }
      statusBar.setMessage('Edición bloqueada durante la reproducción (pulsa Detener o Esc para editar).')
      return
    }
    if (!actions.run(actionId)) {
      statusBar.setMessage(`La acción «${actionId}» no está disponible ahora mismo.`)
    }
  }

  /* ---------- Interacción del lienzo ---------- */

  // Lectura de coordenadas sobre el plano de trabajo (y = 0) + elemento bajo el cursor.
  let lastHoverLabel = ''
  canvas.addEventListener('pointermove', (event) => {
    const hit = viewport.pointerToGround(event.clientX, event.clientY)
    if (hit) hud.setStatusCoordinates(hit.x, hit.z)

    if (tool.getMode() !== 'select') return
    const picked = tool.pickAt(event.clientX, event.clientY)
    if (!picked) {
      if (lastHoverLabel) lastHoverLabel = ''
      return
    }
    const label = picked.type === 'wall' ? `Muro: ${picked.label}` : `Objeto: ${picked.label}`
    if (label !== lastHoverLabel) {
      lastHoverLabel = label
      statusBar.setMessage(`${label} · clic para seleccionar.`)
    }
  })

  canvas.addEventListener('pointerleave', () => {
    lastHoverLabel = ''
    hud.setStatusCoordinates(cameraController.state.target.x, cameraController.state.target.z)
  })

  /* Arrastrar y soltar materiales directamente sobre muros y objetos */
  canvas.addEventListener('dragover', (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })

  canvas.addEventListener('drop', (event) => {
    event.preventDefault()
    const materialId =
      event.dataTransfer?.getData('application/x-arq-material') ||
      event.dataTransfer?.getData('text/plain')
    if (!materialId || !isMaterialId(materialId)) return

    const pickedWall = viewport.pickWall(event.clientX, event.clientY)
    if (pickedWall) {
      scene.setWallMaterial(pickedWall.id, materialId)
      statusBar.setMessage(`Material aplicado a muro ${pickedWall.label} (Ctrl+Z para deshacer).`)
      return
    }
    const pickedObj = viewport.pickObject(event.clientX, event.clientY)
    if (pickedObj) {
      scene.setObjectMaterial(pickedObj.id, materialId)
      statusBar.setMessage(`Material aplicado a «${pickedObj.name}» (Ctrl+Z para deshacer).`)
    }
  })

  mountViewportInteractions({
    canvas,
    controller: cameraController,
    // En modo planta (2D) la órbita se bloquea: arrastrar desplaza la vista.
    isOrbitEnabled: () => viewport.getViewMode() === '3d',
    // Cuando la herramienta reclama el gesto (trazar, colocar, arrastrar, gizmo 3D o topografía), la
    // cámara se queda quieta y el movimiento lo gestiona el lienzo.
    interceptsGesture: (event) =>
      viewport.isTransformGizmoDragging() ||
      (event.button === 0 && !orbitToolActive && !event.altKey && (topographyTool?.isActive() ?? false)) ||
      tool.intercepts(event),
    // La herramienta «Orbitar» (tecla O) hace orbitar con el clic izquierdo.
    isOrbitToolActive: () => orbitToolActive,
    // Depuración (F9): cada gesto y cada paso de órbita se reflejan en el panel.
    debugGesture: (accepted, reason) => debugPanel?.logGesture(accepted, reason),
    onOrbitStep: () => {
      orbitCallCount += 1
      debugPanel?.updateCamera(cameraController.state, viewport.getViewMode(), tool.getMode())
    },
    // El zoom hacia el cursor necesita una cámara en perspectiva; en planta el zoom es centrado.
    pointerRayDirection: (clientX, clientY) =>
      viewport.getViewMode() === '3d' ? viewport.pointerRayDirection(clientX, clientY) : null,
    // Cualquier gesto del lienzo cancela el vuelo de cámara en curso (si lo hay).
    onChange: () => {
      cancelCameraAnimation()
      syncViewport()
    }
  })

  /* ---------- Atajos de teclado ---------- */

  /**
   * Atajos declarativos (punto F): cada acción declara su `defaultShortcut` en
   * `ACTION_CATALOG` y este gestor traduce la pulsación a `run(id)`. Ya no hay
   * un `switch` que obliga a mantener la lista de atajos al día a mano: añadir
   * uno es añadirlo al catálogo, y aparece solo en la paleta y en los menús.
   *
   * La paleta vive en una variable declarada antes para que el bloqueo (que se
   * evalúa en cada tecla, al pulsar) pueda consultarla sin zona muerta temporal.
   */
  const isEditableElement = (el: Element | null): boolean => {
    if (!el) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true
    const htmlEl = el as HTMLElement
    if (htmlEl.isContentEditable) return true
    return Boolean(htmlEl.closest?.('[contenteditable="true"]'))
  }

  const hasOpenModalDialog = (): boolean => {
    const dialogOverlayEl = document.getElementById('dialog-overlay')
    if (dialogOverlayEl && !dialogOverlayEl.classList.contains('is-hidden')) return true
    if (shortcutsModal.isOpen()) return true
    const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]:not([hidden])')
    for (const m of modals) {
      if (!m.classList.contains('is-hidden') && m.offsetParent !== null) return true
    }
    return false
  }

  let commandPalette: { isOpen(): boolean; toggle(): void } | null = null
  let keybindings!: KeybindingManager
  keybindings = new KeybindingManager(actions, {
    isBlocked: (event): boolean => {
      // Los atajos del editor no deben dispararse desde el Dashboard ni el login…
      if (!isActive()) return true
      // Si hay un diálogo modal abierto (#dialog-overlay, Preferencias, Atajos…), pausar atajos del editor.
      if (hasOpenModalDialog()) return true
      // …ni mientras se escribe en un <input>, <textarea>, <select> o chat de IA,
      // salvo la propia tecla de la paleta (Ctrl+K) y Ctrl+S para guardado rápido.
      const target = document.activeElement
      const resolved = keybindings.resolve(shortcutFromEvent(event))
      const isPaletteToggle: boolean = resolved === keybindings.shortcutFor('view.commandPalette')
      const isQuickSave: boolean = resolved === keybindings.shortcutFor('file.save')
      if (isEditableElement(target) && !isPaletteToggle && !isQuickSave) {
        return true
      }
      // Con la paleta abierta sus propias teclas se gestionan en el componente,
      // salvo la tecla que la cierra de nuevo.
      return (commandPalette?.isOpen() ?? false) && !isPaletteToggle
    }
  })

  /* ---------- Paleta de comandos (punto F) ---------- */

  // Comparte el registro central y el gestor de atajos: la paleta no declara
  // acciones propias, solo las lista y las ejecuta por el mismo camino que los
  // menús o el teclado.
  document.getElementById('command-palette-icon')!.innerHTML = icon('search', 16)
  document.getElementById('command-palette-hint')!.textContent = t('palette.hint')

  const paletteHandle = mountCommandPalette(document.getElementById('command-palette')!, {
    actions,
    keybindings
  })
  commandPalette = paletteHandle

  // Navegador fluido de cámara por teclado (`requestAnimationFrame` mientras la tecla está presionada):
  // - 3D: Flechas orbitan/inclinan perspectiva · Shift+Flechas desplazan cámara · [+]/[-]/RePág/AvPág zoom suave.
  // - 2D: Flechas desplazan suavemente la planta 2D evitando scroll accidental.
  const cameraNavigator = mountKeyboardCameraNavigator({
    controller: cameraController,
    getViewMode: () => viewport.getViewMode(),
    isBlocked: () =>
      !isActive() ||
      hasOpenModalDialog() ||
      isEditableElement(document.activeElement) ||
      (commandPalette?.isOpen() ?? false) ||
      animationEngine.getState().state === 'playing',
    onFrame: () => {
      cancelCameraAnimation()
      syncViewport()
    }
  })

  // Tooltips de las pestañas del dock con el atajo real (fuente única: catálogo).
  layout.setShortcuts({
    toolbox: formatShortcut(keybindings.shortcutFor('view.toggleToolbox') ?? ''),
    layers: formatShortcut(keybindings.shortcutFor('view.toggleLayers') ?? ''),
    navigator: formatShortcut(keybindings.shortcutFor('view.toggleNavigator') ?? ''),
    costs: formatShortcut(keybindings.shortcutFor('view.toggleCosts') ?? ''),
    chat: formatShortcut(keybindings.shortcutFor('view.toggleChat') ?? '')
  })

  document.addEventListener('keydown', (event) => {
    if (!isActive()) return
    const activeEl = document.activeElement as HTMLElement | null
    const inTextField = isEditableElement(activeEl)

    // Esc = Cancelar herramienta activa de anotaciones
    if (event.key === 'Escape' && !hasOpenModalDialog() && annotations?.isActive()) {
      event.preventDefault()
      annotations.cancel()
      menuBar.setActiveTool('tool.crosshair')
      return
    }

    // Esc = Detener reproducción (si no está detenido) y restaurar la escena.
    if (event.key === 'Escape' && !hasOpenModalDialog() && animationEngine.getState().state !== 'stopped') {
      event.preventDefault()
      stopPlayback()
      return
    }

    // Espacio = Play/Pausa ÚNICAMENTE cuando el modo Animar o una reproducción ya está en curso;
    // en modo normal de diseño CAD, [Espacio] alterna instantáneamente entre Vista 2D y Vista 3D.
    const isAnimationActive =
      animationEngine.getState().state !== 'stopped' || timelinePanel.getState().isAnimating
    if (
      isAnimationActive &&
      (event.code === 'Space' || event.key === ' ') &&
      !inTextField &&
      !hasOpenModalDialog() &&
      !(commandPalette?.isOpen() ?? false)
    ) {
      const viewportContainerEl = document.getElementById('viewport-container')
      const focusInViewport =
        activeEl === canvas ||
        activeEl === document.body ||
        Boolean(activeEl && viewportContainerEl?.contains(activeEl))
      if (focusInViewport) {
        event.preventDefault()
        if (animationEngine.getState().state === 'playing') {
          pausePlayback()
        } else {
          startOrResumePlayback()
        }
        return
      }
    }

    // Navegación fluida de cámara con bucle `requestAnimationFrame` (Flechas, Shift+Flechas,
    // [+]/[-] y RePág/AvPág sin Ctrl/Alt/Meta). Se procesa antes de atajos discretos para
    // evitar saltos de auto-repetición del sistema operativo y prevenir scroll accidental.
    if (cameraNavigator.handleKeyDown(event)) {
      return
    }

    // Los acordes (Ctrl+K …) y los atajos declarativos tienen prioridad: se
    // consultan primero para que la continuación de un acorde nunca la coma
    // el caso especial de borrado.
    if (keybindings.handle(event)) {
      event.preventDefault()
      return
    }

    // Navegación auxiliar de depuración desde el teclado (F9 / F10).
    if (inTextField || hasOpenModalDialog()) return
    switch (event.key) {
      case 'F9': {
        if (!isActive()) return
        toggleDebugPanel()
        event.preventDefault()
        break
      }
      case 'F10': {
        if (!isActive()) return
        toggleAIToolsDebug()
        event.preventDefault()
        break
      }
    }
    // Atajo [F] / [Shift+F] / [Tab] para invertir mano/apertura de puertas y ventanas seleccionadas
    if ((event.key === 'f' || event.key === 'F' || event.key === 'Tab') && !inTextField && !hasOpenModalDialog()) {
      const selectedObj = scene.getSelectedObject()
      if (selectedObj && (selectedObj.openingId || resolveObjectOpeningSpec(selectedObj))) {
        event.preventDefault()
        if (event.shiftKey || event.key === 'Tab') {
          const nextDir = toggleSwingDirection(selectedObj.swingDirection)
          scene.updateObject(selectedObj.id, { swingDirection: nextDir })
          statusBar.setMessage(`Apertura invertida: ${nextDir === 'in' ? 'Interior' : 'Exterior'}`)
        } else {
          const nextHand = toggleSwingHand(selectedObj.swingHand)
          scene.updateObject(selectedObj.id, { swingHand: nextHand })
          statusBar.setMessage(`Mano invertida: ${nextHand === 'left' ? 'Izquierda' : 'Derecha'}`)
        }
        openDoorPropertiesPanel(selectedObj, scene)
        return
      }
    }

    // `Supr` / `Retroceso` borran la selección: no llevan modificador y el
    // navegador los usa para editar, así que se atienden después del gestor…
    // …pero nunca mientras se escribe en un campo (ahí borran texto).
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      event.preventDefault()
      deleteSelection()
    }
  })

  /* ---------- Persistencia de la escena (Guardar / Abrir) ---------- */

  /**
   * Documento de pisos guardado en la tabla `configuraciones` (clave/valor),
   * con una clave por proyecto. Incluye la lista de niveles y la asignación
   * `levelId` de cada muro y objeto (sus tablas no tienen columna propia).
   */
  function levelsSettingKey(): string | null {
    return currentProjectId ? `arqstudio.levels.${currentProjectId}` : null
  }

  function animationSettingKey(): string | null {
    return currentProjectId ? `arqstudio.animation.${currentProjectId}` : null
  }

  function serializeLevelsDoc(): string {
    return JSON.stringify({
      version: 1,
      levels: scene.getLevels(),
      activeLevelId: scene.getActiveLevelId(),
      wallLevels: Object.fromEntries(scene.getWalls().map((wall) => [wall.id, wall.levelId])),
      objectLevels: Object.fromEntries(scene.getObjects().map((object) => [object.id, object.levelId])),
      animation: timelinePanel.toJSON()
    })
  }

  /**
   * Aplica el documento de pisos a la escena ya restaurada. Sin documento
   * (proyectos guardados antes de la multiplanta) todo queda en «Piso 0».
   */
  function applyLevelsDoc(raw: string | null): void {
    interface LevelsDoc {
      levels?: unknown
      activeLevelId?: string
      wallLevels?: Record<string, string>
      objectLevels?: Record<string, string>
      animation?: unknown
    }
    let doc: LevelsDoc | null = null
    if (raw) {
      try {
        doc = JSON.parse(raw) as LevelsDoc
      } catch {
        doc = null
      }
    }
    const levels = doc ? normalizeLevels(doc.levels) : null
    if (!levels) {
      scene.restoreLevels([createDefaultLevel()])
      return
    }
    for (const wall of scene.getWalls()) {
      const levelId = doc?.wallLevels?.[wall.id]
      wall.levelId = levelId && levels.some((level) => level.id === levelId) ? levelId : DEFAULT_LEVEL_ID
    }
    for (const object of scene.getObjects()) {
      const levelId = doc?.objectLevels?.[object.id]
      object.levelId = levelId && levels.some((level) => level.id === levelId) ? levelId : DEFAULT_LEVEL_ID
    }
    scene.restoreLevels(levels)
    if (doc?.activeLevelId) scene.setActiveLevel(doc.activeLevelId)
  }

  function toPersistedWalls(): PersistedWall[] {
    return scene.getWalls().map((wall) => ({
      id: wall.id,
      type: wall.type,
      start: { x: wall.start.x, y: wall.start.y, z: wall.start.z },
      end: { x: wall.end.x, y: wall.end.y, z: wall.end.z },
      height: wall.height,
      thickness: wall.thickness,
      color: wall.color,
      aiControlled: wall.aiControlled,
      materialId: wall.materialId
    }))
  }

  function toPersistedObjects(): PersistedObject[] {
    return scene.getObjects().map((object) => ({
      id: object.id,
      kind: object.kind,
      name: object.name,
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotationY: object.rotationY,
      size: { width: object.size.x, height: object.size.y, depth: object.size.z },
      color: object.color,
      shapeId: object.shapeId,
      materialId: object.materialId,
      levelId: object.levelId,
      roofProps: object.roofProps,
      structuralParams: cloneStructuralParams(object.structuralParams),
      terrainData: cloneTerrainData(object.terrainData)
    }))
  }

  function restorePersistedScene(data: { walls: PersistedWall[]; objects: PersistedObject[] }): void {
    data.walls.forEach((wall) => scene.restoreWall(persistedWallToSnapshot(wall)))
    data.objects.forEach((object) => scene.restoreObject(persistedObjectToSnapshot(object)))
  }

  /** Marca temporal del último guardado para la barra de estado inferior. */
  let lastSavedTimeLabel: string | null = null

  function effectiveUserId(): string {
    return ownerUserId() ?? 'local-default-user'
  }

  /** Abre el modal moderno de Importación de archivos. */
  function openImportModal(initialCategory?: '3d' | '2d' | 'topo' | 'bim' | 'ref'): void {
    const overlay = document.getElementById('dialog-overlay')
    const bridge = (window as unknown as { arqStudio?: { app?: ImportAppBridge } })
      .arqStudio?.app
    if (!overlay) {
      statusBar.setMessage('Importar: el diálogo no está disponible en esta vista.')
      return
    }
    mountImportDialog(overlay, {
      scene,
      history,
      app: bridge,
      statusBar,
      layers,
      cameraController,
      setViewMode,
      onRestoreAnimation: (anim) => timelinePanel.fromJSON(anim),
      onImportSuccess: (importedName: string, importedProject?: SerializedProjectFile) => {
        if (importedProject?.annotations?.items) {
          annotations?.setItems(importedProject.annotations.items)
        }
        refreshLevelsUi()
        refreshDataStatus()
        syncViewport()
        if (!importedProject) {
          frameScene()
        }
        if (importedProject) {
          currentProjectName = importedProject.metadata.name || importedName
        } else if (!currentProjectName) {
          currentProjectName = importedName
        }
      }
    }).open(initialCategory)
  }

  /**
   * Controlador de persistencia real («Guardar» / Ctrl+S):
   * - Si es un proyecto nuevo sin ID, abre el modal con nombre sugerido
   *   (`Proyecto_DD_MM_AAAA`) y crea el registro en SQLite local / Supabase.
   * - Serializa metadatos, muros (con aberturas), objetos, pisos, capas,
   *   cámara (posición, target, 2D/3D) y animación.
   * - Actualiza la barra de estado inferior y emite notificación Toast.
   */
  async function saveScene(): Promise<void> {
    const userId = effectiveUserId()
    let exportJsonCopy = false

    if (!currentProjectId) {
      const overlay = document.getElementById('dialog-overlay')
      if (overlay) {
        const dialogResult = await openSaveAsDialog(overlay, {
          currentName: currentProjectName || formatDefaultProjectName(),
          hasExistingId: false,
          isSaveAs: false
        })
        if (!dialogResult) {
          statusBar.setMessage('Guardado cancelado.')
          return
        }
        currentProjectName = dialogResult.name
        exportJsonCopy = dialogResult.exportJsonFile

        const modeLabel = viewport.getViewMode() === '2d' ? '2D' : '3D'
        await databaseService.verify()
        const created = await databaseService.createProject({
          userId,
          name: currentProjectName,
          mode: modeLabel
        })
        currentProjectId = created?.id ?? `local-${Date.now()}`
      } else {
        if (!currentProjectName) currentProjectName = formatDefaultProjectName()
        const created = await databaseService.createProject({
          userId,
          name: currentProjectName,
          mode: viewport.getViewMode() === '2d' ? '2D' : '3D'
        })
        currentProjectId = created?.id ?? `local-${Date.now()}`
      }
    }

    if (!currentProjectName) {
      currentProjectName = formatDefaultProjectName()
    }

    statusBar.setMessage('Guardando proyecto en base de datos local…')

    const result = await saveProjectToStorage({
      projectId: currentProjectId!,
      projectName: currentProjectName,
      userId,
      scene,
      layers,
      cameraController,
      viewMode: viewport.getViewMode(),
      animation: timelinePanel.toJSON(),
      annotationItems: annotations ? annotations.getItems() : []
    })

    if (currentProjectId) {
      await databaseService.setSetting(
        `arqstudio.mep.${currentProjectId}`,
        JSON.stringify(electricalModel.toJSON())
      )
    }

    if (exportJsonCopy) {
      const appBridge = (
        window as unknown as {
          arqStudio?: {
            app?: {
              saveDialog(opts: unknown): Promise<{ canceled?: boolean; filePath?: string }>
              saveFile(payload: { filePath: string; data: string; encoding?: 'utf8' | 'base64' }): Promise<unknown>
            }
          }
        }
      ).arqStudio?.app

      const jsonText = exportProjectJson(result.state)
      const safeFile = currentProjectName.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'proyecto'
      if (appBridge?.saveDialog && appBridge?.saveFile) {
        const picked = await appBridge.saveDialog({
          title: 'Guardar archivo de proyecto (.arqproj / .json)',
          defaultPath: `${safeFile}.arqproj`,
          filters: [
            { name: 'Proyecto ArqStudio (.arqproj)', extensions: ['arqproj'] },
            { name: 'JSON de proyecto (.json)', extensions: ['json'] }
          ]
        })
        if (!picked.canceled && picked.filePath) {
          await appBridge.saveFile({ filePath: picked.filePath, data: jsonText, encoding: 'utf8' })
        }
      } else if (typeof document !== 'undefined') {
        const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${safeFile}.arqproj`
        a.click()
        URL.revokeObjectURL(url)
      }
    }

    const now = new Date()
    lastSavedTimeLabel = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    refreshDataStatus()

    const wallCount = scene.getWalls().length
    const objCount = scene.getObjects().length
    const levelCount = scene.getLevels().length
    const counts = `${wallCount} muros, ${objCount} elementos, ${levelCount} piso${levelCount === 1 ? '' : 's'}`

    if (result.ok) {
      statusBar.setMessage(
        `Proyecto «${currentProjectName}» guardado correctamente: ${counts} (${result.engineLabel} · ${lastSavedTimeLabel}).`
      )
      showToast({
        title: 'Proyecto guardado correctamente',
        subtitle: `«${currentProjectName}» · ${counts} · ${result.engineLabel} (${lastSavedTimeLabel})`,
        type: 'success'
      })
    } else {
      statusBar.setMessage(`Error al guardar «${currentProjectName}» en almacenamiento local.`)
      showToast({
        title: 'No se pudo guardar el proyecto',
        subtitle: 'Comprueba los permisos del almacenamiento local.',
        type: 'error'
      })
    }
  }

  /** Carga la escena persistida del proyecto (o lo deja vacío si aún no hay datos). */
  async function restoreProjectScene(project: WorkspaceProject): Promise<void> {
    const userId = effectiveUserId()
    const data = currentProjectId ? await databaseService.loadScene(currentProjectId, userId) : null
    const extendedState = currentProjectId ? await loadExtendedProjectState(currentProjectId) : null
    const key = levelsSettingKey()
    const levelsRaw = key ? await databaseService.getSetting(key) : null
    const animKey = animationSettingKey()
    const animRaw = animKey ? await databaseService.getSetting(animKey) : null

    isRestoringOrSyncingScene = true
    try {
      history.transaction(`Abrir ${project.name}`, () => {
        if (extendedState && (extendedState.walls.length > 0 || extendedState.objects.length > 0 || (!data?.walls.length && !data?.objects.length))) {
          applySerializedProjectToWorkspace(extendedState, {
            scene,
            layers,
            cameraController,
            setViewMode,
            onRestoreAnnotations: (items) => annotations?.setItems(items)
          })
        } else {
          scene.clear()
          annotations?.clear()
          if (data) restorePersistedScene(data)
          applyLevelsDoc(levelsRaw)
        }
      })
    } finally {
      isRestoringOrSyncingScene = false
    }

    if (extendedState?.annotations?.items) {
      annotations?.setItems(extendedState.annotations.items)
    }

    // Restaurar la animación del proyecto (proyectos sin animación abren con DEFAULT_ANIMATION).
    if (animRaw) {
      timelinePanel.fromJSON(animRaw)
    } else if (extendedState?.animation !== undefined) {
      timelinePanel.fromJSON(extendedState.animation)
    } else if (levelsRaw) {
      try {
        const parsed = JSON.parse(levelsRaw) as { animation?: unknown }
        timelinePanel.fromJSON(parsed.animation ?? null)
      } catch {
        timelinePanel.fromJSON(null)
      }
    } else {
      timelinePanel.fromJSON(null)
    }

    // Texturas importadas y ajustes/overrides de materiales persistidos del proyecto
    if (currentProjectId && materialPalette) {
      void databaseService.listTextures(currentProjectId, userId).then((textures) => {
        if (textures) materialPalette?.setTextures(textures)
      })
      void materialPalette.loadProjectSettings()
    }

    // Instalación MEP Eléctrica persistida del proyecto
    if (currentProjectId) {
      void databaseService.getSetting(`arqstudio.mep.${currentProjectId}`).then((mepRaw) => {
        if (mepRaw) {
          try {
            electricalModel.load(JSON.parse(mepRaw))
          } catch {
            electricalModel.clear(false)
          }
        } else {
          electricalModel.clear(false)
        }
      })
    } else {
      electricalModel.clear(false)
    }

    // El historial arranca limpio: el estado inicial es el proyecto abierto.
    history.clear()
    applyHistoryState()
    refreshLevelsUi()

    const totalWalls = scene.getWalls().length
    const totalObjects = scene.getObjects().length
    if (totalWalls > 0 || totalObjects > 0) {
      if (!extendedState?.camera) {
        frameScene()
      } else {
        syncViewport()
      }
      statusBar.setMessage(
        `Proyecto «${project.name}» restaurado: ${totalWalls} muros y ${totalObjects} elementos.`
      )
      return
    }
    statusBar.setMessage(`Proyecto «${project.name}» listo: lienzo vacío para empezar a dibujar.`)
  }

  /* ---------- Arranque ---------- */

  // Estado inicial del editor: lienzo vacío (el contenido sólo llega al abrir
  // un proyecto guardado o a que el usuario lo dibuje).
  history.clear()

  refreshLevelsUi()
  setWallTool(WallSegmentType.SimpleWall)
  // Los paneles ya están montados: el layout tiene sus medidas reales, así que
  // se recalcula el aspecto antes de encuadrar (si no, se usaría el 1.0 inicial).
  viewport.resize()
  frameScene()
  applyHistoryState()
  hud.setStatusCoordinates(cameraController.state.target.x, cameraController.state.target.z)

  /* ---------- Datos en vivo en la barra de estado (punto D) ---------- */

  /**
   * Refleja en «Datos:» el motor activo (Nube · Supabase / Local · SQLite /
   * Navegador), el timestamp de guardado y el recuento real de la escena.
   */
  function refreshDataStatus(): void {
    const walls = scene.getWalls().length
    const objects = scene.getObjects().length
    const levels = scene.getLevels().length
    const savedBadge = lastSavedTimeLabel ? ` · Guardado ${lastSavedTimeLabel}` : ''
    statusBar.setDatabase(
      `${databaseService.describeMode()}${savedBadge} · ${walls} muros · ${objects} elementos · ${levels} piso${levels === 1 ? '' : 's'}`
    )
  }

  scene.onWallAdded(refreshDataStatus)
  scene.onWallRemoved(refreshDataStatus)
  scene.onObjectAdded(refreshDataStatus)
  scene.onObjectRemoved(refreshDataStatus)
  scene.onLevelsChanged(refreshDataStatus)

  /* ---------- Registro de Cambios en Vivo y Sincronización Colaborativa (Fases 4 y 5) ---------- */

  function wallToSyncSnapshot(wall: import('../models/Wall').Wall): PersistedWall {
    return {
      id: wall.id,
      type: wall.type,
      start: { x: wall.start.x, y: wall.start.y, z: wall.start.z },
      end: { x: wall.end.x, y: wall.end.y, z: wall.end.z },
      height: wall.height,
      thickness: wall.thickness,
      color: wall.color,
      aiControlled: wall.aiControlled,
      materialId: wall.materialId,
      openings: wall.openings ? wall.openings.map((o) => ({ ...o })) : undefined,
      levelId: wall.levelId,
      visible: wall.visible
    }
  }

  function objectToSyncSnapshot(obj: SceneObject): PersistedObject {
    return {
      id: obj.id,
      kind: obj.kind,
      name: obj.name,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotationY: obj.rotationY,
      size: { width: obj.size.x, height: obj.size.y, depth: obj.size.z },
      color: obj.color,
      shapeId: obj.shapeId,
      materialId: obj.materialId,
      levelId: obj.levelId,
      roofProps: obj.roofProps,
      structuralParams: cloneStructuralParams(obj.structuralParams),
      terrainData: cloneTerrainData(obj.terrainData),
      layer: obj.layer,
      includeInCosts: obj.includeInCosts,
      openingVariant: obj.openingVariant,
      openingId: obj.openingId,
      openingAngle: obj.openingAngle,
      visible: obj.visible
    }
  }

  scene.onWallAdded((wall) => {
    if (isRestoringOrSyncingScene || !activeCollabRoom) return
    if (!activeCollabRoom.canCurrentUserEdit()) {
      statusBar.setMessage('Modo Solo lectura: los cambios no se sincronizan hasta que el anfitrión apruebe permisos de edición.')
      return
    }
    const actor = currentCollaboratorName()
    const label = TOOL_LABELS[wall.type]?.toLowerCase() ?? 'muro simple'
    activeCollabRoom.recordSceneAction(
      `${actor} agregó un ${label}`,
      'wall_add',
      {
        kind: 'wall_added',
        data: {
          elementId: wall.id,
          snapshot: wallToSyncSnapshot(wall)
        }
      }
    )
  })

  scene.onWallChanged((wall) => {
    if (isRestoringOrSyncingScene || !activeCollabRoom) return
    if (!activeCollabRoom.canCurrentUserEdit()) return
    const actor = currentCollaboratorName()
    const label = TOOL_LABELS[wall.type]?.toLowerCase() ?? 'muro simple'
    activeCollabRoom.recordSceneAction(
      `${actor} modificó las dimensiones de ${label}`,
      'wall_modify',
      {
        kind: 'wall_changed',
        data: {
          elementId: wall.id,
          snapshot: wallToSyncSnapshot(wall)
        }
      }
    )
  })

  scene.onWallRemoved((wall) => {
    if (isRestoringOrSyncingScene || !activeCollabRoom) return
    if (!activeCollabRoom.canCurrentUserEdit()) return
    const actor = currentCollaboratorName()
    const label = TOOL_LABELS[wall.type]?.toLowerCase() ?? 'muro simple'
    activeCollabRoom.recordSceneAction(
      `${actor} eliminó un ${label}`,
      'wall_remove',
      {
        kind: 'wall_removed',
        data: {
          elementId: wall.id
        }
      }
    )
  })

  scene.onObjectAdded((obj) => {
    if (isRestoringOrSyncingScene || !activeCollabRoom) return
    if (!activeCollabRoom.canCurrentUserEdit()) {
      statusBar.setMessage('Modo Solo lectura: los cambios no se sincronizan hasta que el anfitrión apruebe permisos de edición.')
      return
    }
    const actor = currentCollaboratorName()
    const nameLower = obj.name.toLowerCase()
    activeCollabRoom.recordSceneAction(
      `${actor} agregó ${nameLower}`,
      'object_add',
      {
        kind: 'object_added',
        data: {
          elementId: obj.id,
          snapshot: objectToSyncSnapshot(obj)
        }
      }
    )
  })

  scene.onObjectChanged((obj) => {
    if (isRestoringOrSyncingScene || !activeCollabRoom) return
    if (!activeCollabRoom.canCurrentUserEdit()) return
    const actor = currentCollaboratorName()
    const nameLower = obj.name.toLowerCase()
    const targetDesc = nameLower.includes('losa') ? 'la losa' : nameLower
    activeCollabRoom.recordSceneAction(
      `${actor} modificó las dimensiones de ${targetDesc}`,
      'object_modify',
      {
        kind: 'object_changed',
        data: {
          elementId: obj.id,
          snapshot: objectToSyncSnapshot(obj)
        }
      }
    )
  })

  scene.onObjectRemoved((obj) => {
    if (isRestoringOrSyncingScene || !activeCollabRoom) return
    if (!activeCollabRoom.canCurrentUserEdit()) return
    const actor = currentCollaboratorName()
    const categoryDesc = obj.kind === 'furniture' ? 'un elemento de mobiliario' : obj.name.toLowerCase()
    activeCollabRoom.recordSceneAction(
      `${actor} eliminó ${categoryDesc}`,
      'object_remove',
      {
        kind: 'object_removed',
        data: {
          elementId: obj.id
        }
      }
    )
  })

  // Verificación del esquema: al resolver puede cambiar el modo real
  // (p. ej. navegador → SQLite local), así que se refresca de nuevo.
  refreshDataStatus()
  void databaseService.verify().then((health) => {
    refreshDataStatus()
    if (health?.error) statusBar.setMessage(`Motor de datos: ${health.error}`)
  })

  /* ---------- API pública del workspace ---------- */

  /** Carga un proyecto de «Mis proyectos» en la escena y ajusta la vista a su modo. */
  function openProject(project: WorkspaceProject): void {
    currentProjectId = project.id ?? null
    currentProjectName = project.name
    lastSavedTimeLabel = null

    // Gestionar conexión a sala de colaboración si el proyecto tiene colaboración activa
    activeCollabRoom?.disconnect()
    activeCollabRoom = null
    collaborationDrawer.setRoom(null, project.name)

    const existingRoom = project.id ? findRoomByProjectId(project.id) : null
    const roomCode = project.roomCode ?? existingRoom?.roomCode ?? null
    const collabEnabled = Boolean(project.collaborationEnabled || roomCode)

    if (collabEnabled && roomCode && currentProjectId) {
      const currentUserId = options.auth?.currentUser?.id ?? effectiveUserId()
      const roomMembers = getRoomMembers(roomCode)
      const resolvedRole: CollaboratorRole =
        project.role ??
        (existingRoom?.ownerId === currentUserId
          ? 'owner'
          : roomMembers.find((m) => m.userId === currentUserId)?.role ?? 'editor')

      startCollaborationSession({
        roomCode,
        projectId: currentProjectId,
        projectName: project.name,
        role: resolvedRole
      })
    }

    // Asíncrono a propósito: hasta que llegue la respuesta se muestra el lienzo
    // en blanco y la barra de estado con el mensaje de apertura.
    void restoreProjectScene(project)

    setViewMode(project.mode === '2D' ? '2d' : '3d')
    focus()
  }

  /**
   * Fase 1: vacía por completo el editor —escena, proyecto abierto, texturas
   * y historial— al cerrar sesión o cambiar de cuenta, para que no quede
   * NADA de la cuenta anterior en memoria.
   */
  function closeProject(): void {
    activeCollabRoom?.disconnect()
    activeCollabRoom = null
    collaborationDrawer.setRoom(null)
    collaborationDrawer.close()
    currentProjectId = null
    currentProjectName = ''
    lastSavedTimeLabel = null
    isRestoringOrSyncingScene = true
    try {
      scene.clear()
      annotations?.clear()
      electricalModel.clear(false)
    } finally {
      isRestoringOrSyncingScene = false
    }
    timelinePanel.fromJSON(null)
    history.clear()
    applyHistoryState()
    void materialPalette?.setTextures([])
    refreshDataStatus()
    statusBar.setMessage('Sesión cerrada: editor vacío.')
  }

  /**
   * Recalcula el tamaño del lienzo y vuelve a encuadrar la escena. Hay que
   * llamarlo cada vez que el contenedor pasa de oculto a visible, porque el
   * canvas mide 0 × 0 mientras está en `display: none`.
   */
  function focus(): void {
    viewport.resize()
    frameScene()
    // Tras el primer pintado visible el contenedor ya tiene tamaño real: la
    // esfera y el gizmo se reposicionan y reorientan con las medidas correctas.
    window.requestAnimationFrame(() => {
      navigationSphere?.update(cameraController.state)
    })
  }

  // `activeWallTool` ya alimenta el trazo real: `CanvasTool` lo lee en cada gesto.

  async function applyImportedFile(imported: ImportedFileResult): Promise<void> {
    const params = imported.transformParams

    if (imported.parsedTopography) {
      const terrainObj = createImportedTerrainObject(
        imported.parsedTopography,
        imported.fileName,
        params
      )
      history.transaction(`Importar Topografía ${imported.parsedTopography.format}`, () => {
        scene.addObject(terrainObj)
        scene.selectObject(terrainObj)
      })
      const msg = `Terreno 3D generado (${imported.parsedTopography.points.length} puntos · ${terrainObj.size.x.toFixed(1)}×${terrainObj.size.z.toFixed(1)} m).`
      statusBar.setMessage(msg)
      showToast({ title: 'Terreno topográfico 3D generado', subtitle: msg })
      frameScene()
      await saveScene()
      return
    }

    if (imported.parsedModel) {
      const cleanObjName = imported.fileName.replace(/\.(glb|gltf|obj|stl)$/i, '') || 'Modelo 3D'
      const modelOpts: ImportModelOptions = {
        scale: new THREE.Vector3(params.scale, params.scale, params.scale),
        position: new THREE.Vector3(params.x, params.y, params.z),
        rotationY: params.rotYRad,
        centerAtOrigin: params.centerAtOrigin,
        includeInCosts: params.includeInCosts,
        objectName: cleanObjName
      }
      const created = createImportedObjects(imported.parsedModel, modelOpts)
      history.transaction(`Importar ${imported.parsedModel.format.toUpperCase()}`, () => {
        for (const obj of created) {
          scene.addObject(obj)
        }
      })
      const msg = `Importar ${imported.parsedModel.format.toUpperCase()}: ${created.length} ${created.length === 1 ? 'malla añadida' : 'mallas añadidas'} a la escena.`
      statusBar.setMessage(msg)
      showToast({ title: 'Modelo 3D importado correctamente', subtitle: `${cleanObjName} (${created.length} mallas)` })
      frameScene()
      await saveScene()
      return
    }

    if (imported.parsedDxf) {
      let result = { ok: false, walls: 0, skipped: 0, message: '' }
      history.transaction('Importar DXF', () => {
        result = applyDxfImport(scene, imported.parsedDxf!.text, {
          scale: params.scale,
          position: { x: params.x, y: params.y, z: params.z },
          rotationY: params.rotYRad,
          centerAtOrigin: params.centerAtOrigin
        })
      })
      if (result.ok) {
        statusBar.setMessage(result.message)
        showToast({ title: 'Plano DXF importado correctamente', subtitle: result.message })
        frameScene()
        await saveScene()
      }
      return
    }

    if (imported.parsedSvg) {
      let result = { ok: false, walls: 0, skipped: 0, message: '' }
      history.transaction('Importar SVG', () => {
        result = applySvgImport(scene, imported.parsedSvg!.text, {
          scale: params.scale,
          position: { x: params.x, y: params.y, z: params.z },
          rotationY: params.rotYRad,
          centerAtOrigin: params.centerAtOrigin
        })
      })
      if (result.ok) {
        statusBar.setMessage(result.message)
        showToast({ title: 'Plano SVG importado correctamente', subtitle: result.message })
        frameScene()
        await saveScene()
      }
      return
    }

    if (imported.parsedIfcPlan) {
      let result = { ok: false, walls: 0, openings: 0, slabs: 0, columns: 0, objects: 0, message: '' }
      history.transaction('Importar IFC', () => {
        result = applyIfcImport(scene, imported.parsedIfcPlan!, {
          scale: params.scale,
          position: { x: params.x, y: params.y, z: params.z },
          rotationY: params.rotYRad,
          centerAtOrigin: params.centerAtOrigin,
          includeInCosts: params.includeInCosts
        })
      })
      if (result.ok) {
        statusBar.setMessage(result.message)
        showToast({ title: 'Modelo BIM IFC importado', subtitle: result.message })
        frameScene()
        await saveScene()
      }
      return
    }

    if (imported.parsedPdfPlan) {
      let result = { ok: false, walls: 0, skipped: 0, message: '' }
      history.transaction('Importar PDF', () => {
        result = applyPdfImport(scene, imported.parsedPdfPlan!, {
          scale: params.scale,
          position: { x: params.x, y: params.y, z: params.z },
          rotationY: params.rotYRad,
          centerAtOrigin: params.centerAtOrigin
        })
      })
      if (result.ok) {
        statusBar.setMessage(result.message)
        showToast({ title: 'Plano PDF importado correctamente', subtitle: result.message })
        frameScene()
        await saveScene()
      }
      return
    }

    if (imported.parsedJsonProject) {
      const projectToLoad = imported.parsedJsonProject
      history.transaction(`Cargar proyecto ${projectToLoad.metadata.name}`, () => {
        applySerializedProjectToWorkspace(projectToLoad, {
          scene,
          layers,
          cameraController,
          setViewMode,
          onRestoreAnimation: (anim) => timelinePanel.fromJSON(anim),
          onRestoreAnnotations: (items) => annotations?.setItems(items)
        })
      })
      const msg = `Proyecto «${projectToLoad.metadata.name}» reconstruido (${projectToLoad.walls.length} muros, ${projectToLoad.objects.length} objetos).`
      statusBar.setMessage(msg)
      showToast({ title: 'Proyecto cargado correctamente', subtitle: msg })
      frameScene()
      await saveScene()
      return
    }
  }

  return {
    openProject,
    focus,
    closeProject,
    openImportModal,
    applyImportedFile,
    get annotations() {
      return annotations ?? undefined
    }
  }
}
