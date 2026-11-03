import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { LayerManager } from '../engine/LayerManager'
import type { Viewport3DController } from '../engine/Viewport3DController'
import type { ViewMode } from '../engine/ViewportRenderer'
import { WallSegmentType, type WallSnapshot } from '../models/Wall'
import type { Opening } from '../models/Opening'
import { type SceneObjectKind, type SceneObjectSnapshot } from '../models/SceneObject'
import { createDefaultLevel, DEFAULT_LEVEL_ID, normalizeLevels, type Level } from '../models/Level'
import type { LineType } from '../models/Layer'
import type { RoofProps } from '../models/Roof'
import { databaseService, type SceneObject as PersistedObject, type SceneWall as PersistedWall } from './DatabaseService'
import { normalizeAnnotations, type AnnotationItem } from '../annotations/types'

/** Formato nativo serializado de un proyecto de ArqStudio 3D (`.arqproj` / `.json`). */
export interface SerializedProjectMetadata {
  id: string
  name: string
  updatedAt: string
  units: 'm' | 'cm' | 'mm'
  activeLevelId: string
  viewMode: ViewMode
}

export interface SerializedWall {
  id: string
  type: WallSegmentType
  start: { x: number; y: number; z: number }
  end: { x: number; y: number; z: number }
  thickness: number
  height: number
  color: number
  materialId: string | null
  aiControlled: boolean
  openings: Opening[]
  levelId: string
  visible: boolean
}

export interface SerializedSceneObject {
  id: string
  name: string
  kind: SceneObjectKind
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  rotationY: number
  size: { width: number; height: number; depth: number }
  color: number
  shapeId: string | null
  materialId: string | null
  levelId: string
  roofProps: RoofProps | null
  layer?: string
  includeInCosts: boolean
  openingVariant: string | null
  openingId: string | null
  openingAngle: number
  visible: boolean
}

export interface SerializedLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  color: number
  lineType: LineType
  material: string
  core: string
  zone: string
}

export interface SerializedCameraState {
  position: [number, number, number]
  target: [number, number, number]
  yaw: number
  pitch: number
  distance: number
  viewMode: ViewMode
}

export interface SerializedDimensionAnnotation {
  id: string
  start: [number, number, number]
  end: [number, number, number]
  label?: string
}

export interface SerializedProjectFile {
  format: 'arqstudio-project'
  version: 1
  metadata: SerializedProjectMetadata
  levels: Level[]
  walls: SerializedWall[]
  objects: SerializedSceneObject[]
  layers: SerializedLayer[]
  annotations: {
    dimensions: SerializedDimensionAnnotation[]
    notes: string[]
    items?: AnnotationItem[]
  }
  camera: SerializedCameraState
  animation?: unknown
}

const LOCAL_STATE_STORAGE_PREFIX = 'arqstudio.projectState.v1.'
const LOCAL_PROJECT_INDEX_KEY = 'arqstudio.localProjects.v1'

/** Genera el nombre por defecto `Proyecto_DD_MM_AAAA`. */
export function formatDefaultProjectName(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  return `Proyecto_${dd}_${mm}_${yyyy}`
}

/** Clave en la tabla `configuraciones` para el estado extendido del proyecto. */
export function projectStateSettingKey(projectId: string): string {
  return `arqstudio.state.${projectId}`
}

/** Clave en la tabla `configuraciones` para el documento de niveles del proyecto. */
export function projectLevelsSettingKey(projectId: string): string {
  return `arqstudio.levels.${projectId}`
}

/** Clave en la tabla `configuraciones` para la animación del proyecto. */
export function projectAnimationSettingKey(projectId: string): string {
  return `arqstudio.animation.${projectId}`
}

/** Clave en la tabla `configuraciones` para las anotaciones del proyecto. */
export function projectAnnotationsSettingKey(projectId: string): string {
  return `arqstudio.annotations.${projectId}`
}

/**
 * Serializa el estado completo del proyecto actual en un objeto JSON estructurado
 * listo tanto para persistir en SQLite como para exportar a `.arqproj` / `.json`.
 */
export function serializeProjectState(params: {
  projectId: string
  projectName: string
  scene: SceneManager
  layers?: LayerManager
  cameraController?: Viewport3DController
  viewMode?: ViewMode
  units?: 'm' | 'cm' | 'mm'
  notes?: string[]
  dimensions?: SerializedDimensionAnnotation[]
  annotationItems?: AnnotationItem[]
  animation?: unknown
}): SerializedProjectFile {
  const {
    projectId,
    projectName,
    scene,
    layers,
    cameraController,
    viewMode = '3d',
    units = 'm',
    notes = [],
    dimensions = [],
    annotationItems = [],
    animation
  } = params

  const nowIso = new Date().toISOString()

  const serializedWalls: SerializedWall[] = scene.getWalls().map((wall) => ({
    id: wall.id,
    type: wall.type,
    start: { x: wall.start.x, y: wall.start.y, z: wall.start.z },
    end: { x: wall.end.x, y: wall.end.y, z: wall.end.z },
    thickness: wall.thickness,
    height: wall.height,
    color: wall.color,
    materialId: wall.materialId,
    aiControlled: wall.aiControlled,
    openings: wall.openings.map((o) => ({ ...o })),
    levelId: wall.levelId || DEFAULT_LEVEL_ID,
    visible: wall.visible ?? true
  }))

  const serializedObjects: SerializedSceneObject[] = scene.getObjects().map((obj) => ({
    id: obj.id,
    name: obj.name,
    kind: obj.kind,
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [0, obj.rotationY, 0],
    scale: [obj.size.x, obj.size.y, obj.size.z],
    rotationY: obj.rotationY,
    size: { width: obj.size.x, height: obj.size.y, depth: obj.size.z },
    color: obj.color,
    shapeId: obj.shapeId,
    materialId: obj.materialId,
    levelId: obj.levelId || DEFAULT_LEVEL_ID,
    roofProps: obj.roofProps ? structuredClone(obj.roofProps) : null,
    layer: obj.layer,
    includeInCosts: obj.includeInCosts ?? true,
    openingVariant: obj.openingVariant ?? null,
    openingId: obj.openingId ?? null,
    openingAngle: obj.openingAngle ?? 0,
    visible: obj.visible ?? true
  }))

  const serializedLayers: SerializedLayer[] = layers
    ? layers.getLayers().map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        color: layer.color,
        lineType: layer.lineType,
        material: layer.material,
        core: layer.core,
        zone: layer.zone
      }))
    : []

  let camera: SerializedCameraState = {
    position: [12, 10, 12],
    target: [0, 0, 0],
    yaw: 45,
    pitch: 35,
    distance: 18,
    viewMode
  }

  if (cameraController) {
    const camPos = cameraController.state.computePosition()
    const target = cameraController.state.target
    camera = {
      position: [camPos.x, camPos.y, camPos.z],
      target: [target.x, target.y, target.z],
      yaw: cameraController.state.yaw,
      pitch: cameraController.state.pitch,
      distance: cameraController.state.distance,
      viewMode
    }
  }

  return {
    format: 'arqstudio-project',
    version: 1,
    metadata: {
      id: projectId,
      name: projectName || formatDefaultProjectName(),
      updatedAt: nowIso,
      units,
      activeLevelId: scene.getActiveLevelId(),
      viewMode
    },
    levels: scene.getLevels().map((lvl) => ({ ...lvl })),
    walls: serializedWalls,
    objects: serializedObjects,
    layers: serializedLayers,
    annotations: {
      dimensions,
      notes,
      items: annotationItems ? [...annotationItems] : []
    },
    camera,
    animation
  }
}

/** Convierte un `SerializedProjectFile` a cadena JSON formateada. */
export function exportProjectJson(state: SerializedProjectFile): string {
  return JSON.stringify(state, null, 2)
}

/**
 * Parsea y valida un archivo `.arqproj` / `.json` de proyecto nativo.
 * Admite tanto el esquema completo `arqstudio-project` como documentos JSON
 * simplificados con `{ walls, objects, levels }`.
 */
export function parseProjectJson(rawText: string): SerializedProjectFile {
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('El archivo JSON está vacío.')
  }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch (err) {
    throw new Error(
      `El archivo JSON está corrupto o mal formado: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El archivo JSON no contiene un objeto de proyecto válido.')
  }

  const doc = raw as Record<string, unknown>
  const hasWallsArray = Array.isArray(doc.walls)
  const hasObjectsArray = Array.isArray(doc.objects)
  const isNativeFormat = doc.format === 'arqstudio-project' || hasWallsArray || hasObjectsArray

  if (!isNativeFormat) {
    throw new Error(
      'El archivo JSON no corresponde a un proyecto de ArqStudio 3D (faltan muros u objetos).'
    )
  }

  const metaRaw = (doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {}) as Record<string, unknown>
  const levels = normalizeLevels(doc.levels) ?? [createDefaultLevel()]
  const activeLevelId =
    typeof metaRaw.activeLevelId === 'string' && levels.some((l) => l.id === metaRaw.activeLevelId)
      ? metaRaw.activeLevelId
      : levels[0].id

  const viewMode: ViewMode = metaRaw.viewMode === '2d' ? '2d' : '3d'

  const walls: SerializedWall[] = (Array.isArray(doc.walls) ? doc.walls : []).map((wRaw, idx) => {
    const w = (wRaw && typeof wRaw === 'object' ? wRaw : {}) as Record<string, unknown>
    const startRaw = (w.start && typeof w.start === 'object' ? w.start : {}) as Record<string, unknown>
    const endRaw = (w.end && typeof w.end === 'object' ? w.end : {}) as Record<string, unknown>
    const id = typeof w.id === 'string' && w.id ? w.id : `wall-json-${idx + 1}`
    const type =
      w.type === WallSegmentType.StructuralSegment || w.type === WallSegmentType.RoomWalls
        ? (w.type as WallSegmentType)
        : WallSegmentType.SimpleWall
    const openingsRaw = Array.isArray(w.openings) ? w.openings : []
    const openings: Opening[] = openingsRaw
      .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
      .map((o, oIdx) => ({
        id: typeof o.id === 'string' && o.id ? o.id : `opening-${id}-${oIdx + 1}`,
        wallId: id,
        type: o.type === 'window' ? 'window' : 'door',
        x: Number(o.x) || 0,
        width: Math.max(0.2, Number(o.width) || 0.9),
        height: Math.max(0.2, Number(o.height) || 2.1),
        sill: Math.max(0, Number(o.sill) || 0),
        materialId: typeof o.materialId === 'string' ? o.materialId : null
      }))

    return {
      id,
      type,
      start: {
        x: Number(startRaw.x) || 0,
        y: Number(startRaw.y) || 0,
        z: Number(startRaw.z) || 0
      },
      end: {
        x: Number(endRaw.x) || 0,
        y: Number(endRaw.y) || 0,
        z: Number(endRaw.z) || 0
      },
      thickness: Math.max(0.05, Number(w.thickness) || 0.2),
      height: Math.max(0.2, Number(w.height) || 2.5),
      color: typeof w.color === 'number' && Number.isFinite(w.color) ? w.color : 0xe0dace,
      materialId: typeof w.materialId === 'string' ? w.materialId : null,
      aiControlled: Boolean(w.aiControlled ?? true),
      openings,
      levelId: typeof w.levelId === 'string' && w.levelId ? w.levelId : DEFAULT_LEVEL_ID,
      visible: w.visible === undefined ? true : Boolean(w.visible)
    }
  })

  const objects: SerializedSceneObject[] = (Array.isArray(doc.objects) ? doc.objects : []).map((oRaw, idx) => {
    const o = (oRaw && typeof oRaw === 'object' ? oRaw : {}) as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id ? o.id : `obj-json-${idx + 1}`
    const kindRaw = typeof o.kind === 'string' ? o.kind : 'furniture'
    const kind: SceneObjectKind = ['furniture', 'shape', 'roof', 'material', 'modifier'].includes(kindRaw)
      ? (kindRaw as SceneObjectKind)
      : 'furniture'

    let px = 0
    let py = 0
    let pz = 0
    if (Array.isArray(o.position) && o.position.length >= 3) {
      px = Number(o.position[0]) || 0
      py = Number(o.position[1]) || 0
      pz = Number(o.position[2]) || 0
    } else if (o.position && typeof o.position === 'object') {
      const posObj = o.position as Record<string, unknown>
      px = Number(posObj.x) || 0
      py = Number(posObj.y) || 0
      pz = Number(posObj.z) || 0
    }

    let rotY = Number(o.rotationY) || 0
    if (Array.isArray(o.rotation) && o.rotation.length >= 2 && o.rotationY === undefined) {
      rotY = Number(o.rotation[1]) || 0
    }

    let width = 1
    let height = 1
    let depth = 1
    if (o.size && typeof o.size === 'object') {
      const sz = o.size as Record<string, unknown>
      width = Math.max(0.05, Number(sz.width ?? sz.x) || 1)
      height = Math.max(0.05, Number(sz.height ?? sz.y) || 1)
      depth = Math.max(0.05, Number(sz.depth ?? sz.z) || 1)
    } else if (Array.isArray(o.scale) && o.scale.length >= 3) {
      width = Math.max(0.05, Number(o.scale[0]) || 1)
      height = Math.max(0.05, Number(o.scale[1]) || 1)
      depth = Math.max(0.05, Number(o.scale[2]) || 1)
    }

    return {
      id,
      name: typeof o.name === 'string' && o.name ? o.name : `Elemento ${idx + 1}`,
      kind,
      position: [px, py, pz],
      rotation: [0, rotY, 0],
      scale: [width, height, depth],
      rotationY: rotY,
      size: { width, height, depth },
      color: typeof o.color === 'number' && Number.isFinite(o.color) ? o.color : 0x9aa4b2,
      shapeId: typeof o.shapeId === 'string' ? o.shapeId : null,
      materialId: typeof o.materialId === 'string' ? o.materialId : null,
      levelId: typeof o.levelId === 'string' && o.levelId ? o.levelId : DEFAULT_LEVEL_ID,
      roofProps: (o.roofProps && typeof o.roofProps === 'object' ? (o.roofProps as RoofProps) : null),
      layer: typeof o.layer === 'string' ? o.layer : undefined,
      includeInCosts: o.includeInCosts === undefined ? true : Boolean(o.includeInCosts),
      openingVariant: typeof o.openingVariant === 'string' ? o.openingVariant : null,
      openingId: typeof o.openingId === 'string' ? o.openingId : null,
      openingAngle: Number(o.openingAngle) || 0,
      visible: o.visible === undefined ? true : Boolean(o.visible)
    }
  })

  const layers: SerializedLayer[] = (Array.isArray(doc.layers) ? doc.layers : [])
    .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
    .map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? ''),
      visible: l.visible === undefined ? true : Boolean(l.visible),
      locked: Boolean(l.locked),
      color: typeof l.color === 'number' ? l.color : 0xe0dace,
      lineType: (l.lineType === 'Dashed' || l.lineType === 'Dotted' ? l.lineType : 'Continuous') as LineType,
      material: typeof l.material === 'string' ? l.material : '',
      core: typeof l.core === 'string' ? l.core : '',
      zone: typeof l.zone === 'string' ? l.zone : ''
    }))

  const camRaw = (doc.camera && typeof doc.camera === 'object' ? doc.camera : {}) as Record<string, unknown>
  const posArr = Array.isArray(camRaw.position) ? camRaw.position : [12, 10, 12]
  const tgtArr = Array.isArray(camRaw.target) ? camRaw.target : [0, 0, 0]

  const camera: SerializedCameraState = {
    position: [Number(posArr[0]) || 12, Number(posArr[1]) || 10, Number(posArr[2]) || 12],
    target: [Number(tgtArr[0]) || 0, Number(tgtArr[1]) || 0, Number(tgtArr[2]) || 0],
    yaw: Number.isFinite(Number(camRaw.yaw)) ? Number(camRaw.yaw) : 45,
    pitch: Number.isFinite(Number(camRaw.pitch)) ? Number(camRaw.pitch) : 35,
    distance: Math.max(1, Number(camRaw.distance) || 18),
    viewMode: camRaw.viewMode === '2d' ? '2d' : viewMode
  }

  const annotRaw = (doc.annotations && typeof doc.annotations === 'object' ? doc.annotations : {}) as Record<
    string,
    unknown
  >

  return {
    format: 'arqstudio-project',
    version: 1,
    metadata: {
      id: typeof metaRaw.id === 'string' && metaRaw.id ? metaRaw.id : `proj-${Date.now()}`,
      name:
        typeof metaRaw.name === 'string' && metaRaw.name.trim()
          ? metaRaw.name.trim()
          : formatDefaultProjectName(),
      updatedAt: typeof metaRaw.updatedAt === 'string' ? metaRaw.updatedAt : new Date().toISOString(),
      units: metaRaw.units === 'cm' || metaRaw.units === 'mm' ? metaRaw.units : 'm',
      activeLevelId,
      viewMode
    },
    levels,
    walls,
    objects,
    layers,
    annotations: {
      dimensions: Array.isArray(annotRaw.dimensions)
        ? (annotRaw.dimensions as SerializedDimensionAnnotation[])
        : [],
      notes: Array.isArray(annotRaw.notes) ? annotRaw.notes.map(String) : [],
      items: normalizeAnnotations(annotRaw.items)
    },
    camera,
    animation: doc.animation
  }
}

/**
 * Reconstruye la escena completa a partir de un `SerializedProjectFile`:
 * limpia el lienzo actual y restaura pisos, muros (con aberturas), objetos,
 * capas y estado de cámara.
 */
export function applySerializedProjectToWorkspace(
  state: SerializedProjectFile,
  targets: {
    scene: SceneManager
    layers?: LayerManager
    cameraController?: Viewport3DController
    setViewMode?: (mode: ViewMode) => void
    onRestoreAnimation?: (anim: unknown) => void
    onRestoreAnnotations?: (items: AnnotationItem[]) => void
  }
): void {
  const { scene, layers, cameraController, setViewMode, onRestoreAnimation, onRestoreAnnotations } = targets

  scene.clear()

  const validLevels = normalizeLevels(state.levels) ?? [createDefaultLevel()]
  scene.restoreLevels(validLevels)

  for (const w of state.walls) {
    const snap: WallSnapshot = {
      id: w.id,
      type: w.type,
      start: new THREE.Vector3(w.start.x, w.start.y, w.start.z),
      end: new THREE.Vector3(w.end.x, w.end.y, w.end.z),
      height: w.height,
      thickness: w.thickness,
      color: w.color,
      aiControlled: w.aiControlled,
      materialId: w.materialId,
      openings: (w.openings ?? []).map((o) => ({ ...o })),
      levelId: validLevels.some((l) => l.id === w.levelId) ? w.levelId : validLevels[0].id,
      visible: w.visible ?? true
    }
    scene.restoreWall(snap)
  }

  for (const o of state.objects) {
    const snap: SceneObjectSnapshot = {
      id: o.id,
      kind: o.kind,
      name: o.name,
      position: { x: o.position[0], y: o.position[1], z: o.position[2] },
      rotationY: o.rotationY,
      size: { width: o.size.width, height: o.size.height, depth: o.size.depth },
      color: o.color,
      shapeId: o.shapeId,
      materialId: o.materialId,
      levelId: validLevels.some((l) => l.id === o.levelId) ? o.levelId : validLevels[0].id,
      roofProps: o.roofProps,
      layer: o.layer,
      includeInCosts: o.includeInCosts,
      openingVariant: o.openingVariant,
      openingId: o.openingId,
      openingAngle: o.openingAngle,
      visible: o.visible ?? true
    }
    scene.restoreObject(snap)
  }

  if (state.metadata.activeLevelId && validLevels.some((l) => l.id === state.metadata.activeLevelId)) {
    scene.setActiveLevel(state.metadata.activeLevelId)
  }

  if (layers && state.layers.length > 0) {
    for (const savedLayer of state.layers) {
      const existing = layers.getLayer(savedLayer.id)
      if (!existing) continue
      layers.setVisible(savedLayer.id, savedLayer.visible)
      layers.setLocked(savedLayer.id, savedLayer.locked)
      layers.setColor(savedLayer.id, savedLayer.color)
      layers.setLineType(savedLayer.id, savedLayer.lineType)
      if (savedLayer.material) layers.setProperty(savedLayer.id, 'material', savedLayer.material)
      if (savedLayer.core) layers.setProperty(savedLayer.id, 'core', savedLayer.core)
      if (savedLayer.zone) layers.setProperty(savedLayer.id, 'zone', savedLayer.zone)
    }
  }

  if (cameraController && state.camera) {
    cameraController.state.yaw = state.camera.yaw
    cameraController.state.pitch = state.camera.pitch
    cameraController.state.distance = state.camera.distance
    cameraController.state.target.set(
      state.camera.target[0],
      state.camera.target[1],
      state.camera.target[2]
    )
  }

  if (setViewMode && state.camera?.viewMode) {
    setViewMode(state.camera.viewMode)
  }

  if (onRestoreAnimation && state.animation !== undefined) {
    onRestoreAnimation(state.animation)
  }

  if (onRestoreAnnotations && state.annotations?.items) {
    onRestoreAnnotations(state.annotations.items)
  }
}

/**
 * Persiste de forma atómica el proyecto completo en SQLite local (y en almacenamiento
 * persistente de respaldo del navegador si SQLite no está activo).
 */
export async function saveProjectToStorage(params: {
  projectId: string
  projectName: string
  userId: string
  scene: SceneManager
  layers?: LayerManager
  cameraController?: Viewport3DController
  viewMode?: ViewMode
  animation?: unknown
  annotationItems?: AnnotationItem[]
}): Promise<{
  ok: boolean
  state: SerializedProjectFile
  engineLabel: string
}> {
  const { projectId, projectName, userId, scene, layers, cameraController, viewMode = '3d', animation, annotationItems } = params

  const fullState = serializeProjectState({
    projectId,
    projectName,
    scene,
    layers,
    cameraController,
    viewMode,
    animation,
    annotationItems
  })

  const dbWalls: PersistedWall[] = fullState.walls.map((w) => ({
    id: w.id,
    type: w.type,
    start: w.start,
    end: w.end,
    height: w.height,
    thickness: w.thickness,
    color: w.color,
    aiControlled: w.aiControlled,
    materialId: w.materialId,
    openings: w.openings,
    levelId: w.levelId,
    visible: w.visible
  }))

  const dbObjects: PersistedObject[] = fullState.objects.map((o) => ({
    id: o.id,
    kind: o.kind,
    name: o.name,
    position: { x: o.position[0], y: o.position[1], z: o.position[2] },
    rotationY: o.rotationY,
    size: o.size,
    color: o.color,
    shapeId: o.shapeId,
    materialId: o.materialId,
    levelId: o.levelId,
    roofProps: o.roofProps,
    layer: o.layer,
    includeInCosts: o.includeInCosts,
    openingVariant: o.openingVariant,
    openingId: o.openingId,
    openingAngle: o.openingAngle,
    visible: o.visible
  }))

  const levelsDoc = JSON.stringify({
    version: 1,
    levels: fullState.levels,
    activeLevelId: fullState.metadata.activeLevelId,
    wallLevels: Object.fromEntries(fullState.walls.map((w) => [w.id, w.levelId])),
    objectLevels: Object.fromEntries(fullState.objects.map((o) => [o.id, o.levelId])),
    animation: fullState.animation
  })

  // Guardar siempre copia de respaldo local en localStorage para garantizar persistencia
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${LOCAL_STATE_STORAGE_PREFIX}${projectId}`, JSON.stringify(fullState))
      updateLocalProjectIndex({
        id: projectId,
        name: projectName,
        mode: viewMode === '2d' ? '2D' : '3D',
        updatedAt: Date.now(),
        userId
      })
    }
  } catch {
    // Ignorar cuota de localStorage si falla
  }

  let sqliteSaved = false
  if (databaseService.isAvailable()) {
    await databaseService.verify()
    // Asegurar que el proyecto exista en SQLite antes de guardar la escena
    sqliteSaved = await databaseService.saveScene(projectId, dbWalls, dbObjects, undefined, userId)
    if (!sqliteSaved) {
      // Si el proyecto fue creado solo en memoria/localStorage, registrarlo en SQLite
      const created = await databaseService.createProject({
        userId,
        name: projectName,
        mode: viewMode === '2d' ? '2D' : '3D'
      })
      if (created) {
        sqliteSaved = await databaseService.saveScene(created.id, dbWalls, dbObjects, undefined, userId)
      }
    } else {
      await databaseService.touchProject(projectId, userId)
    }

    await databaseService.setSetting(projectLevelsSettingKey(projectId), levelsDoc)
    await databaseService.setSetting(projectStateSettingKey(projectId), JSON.stringify(fullState))
    if (annotationItems !== undefined) {
      await databaseService.setSetting(projectAnnotationsSettingKey(projectId), JSON.stringify(annotationItems))
    }
    if (animation !== undefined) {
      await databaseService.setSetting(projectAnimationSettingKey(projectId), JSON.stringify(animation))
    }
  }

  const engineLabel = sqliteSaved ? 'SQLite local' : databaseService.describeMode()
  return {
    ok: sqliteSaved || typeof localStorage !== 'undefined',
    state: fullState,
    engineLabel
  }
}

/**
 * Carga el estado extendido guardado en `configuraciones` (`arqstudio.state.<id>`)
 * o desde el respaldo local si existe.
 */
export async function loadExtendedProjectState(projectId: string): Promise<SerializedProjectFile | null> {
  if (databaseService.isAvailable()) {
    const raw = await databaseService.getSetting(projectStateSettingKey(projectId))
    if (raw) {
      try {
        const parsed = parseProjectJson(raw)
        if (!parsed.annotations.items || parsed.annotations.items.length === 0) {
          const rawAnnots = await databaseService.getSetting(projectAnnotationsSettingKey(projectId))
          if (rawAnnots) {
            try {
              parsed.annotations.items = normalizeAnnotations(JSON.parse(rawAnnots))
            } catch {
              // Ignorar fallo de parseo
            }
          }
        }
        return parsed
      } catch {
        // continúa al respaldo local
      }
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const fallbackRaw = localStorage.getItem(`${LOCAL_STATE_STORAGE_PREFIX}${projectId}`)
      if (fallbackRaw) return parseProjectJson(fallbackRaw)
    }
  } catch {
    // ignorar
  }
  return null
}

function updateLocalProjectIndex(entry: {
  id: string
  name: string
  mode: '2D' | '3D'
  updatedAt: number
  userId: string
}): void {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECT_INDEX_KEY)
    const list: Array<{ id: string; name: string; mode: '2D' | '3D'; updatedAt: number; userId: string }> = raw
      ? JSON.parse(raw)
      : []
    const idx = list.findIndex((p) => p.id === entry.id)
    if (idx >= 0) {
      list[idx] = entry
    } else {
      list.unshift(entry)
    }
    localStorage.setItem(LOCAL_PROJECT_INDEX_KEY, JSON.stringify(list))
  } catch {
    // ignorar
  }
}
