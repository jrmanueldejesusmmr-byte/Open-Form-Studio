import * as THREE from 'three'
import { Wall, WallSegmentType, WallSnapshot, wallFromSnapshot } from '../models/Wall'
import { SceneObject, SceneObjectKind, SceneObjectSnapshot, objectFromSnapshot } from '../models/SceneObject'
import type { Opening } from '../models/Opening'
import type { RoofProps } from '../models/Roof'
import { ProjectDesign } from '../models/ProjectDesign'
import { resolveObjectOpeningSpec } from './WallMeshBuilder'
import {
  DEFAULT_ROOF_OVERHANG,
  DEFAULT_ROOF_SLOPE,
  DEFAULT_ROOF_THICKNESS,
  RoofType,
  roofShapeId,
  roofTypeLabel
} from '../models/Roof'
import { buildFittedRoofGeometry, eaveElevation, traceFootprint, type FootprintSegment } from '../engine/RoofBuilder'
import {
  createDefaultLevel,
  createLevelId,
  DEFAULT_LEVEL_ID,
  DEFAULT_LEVEL_HEIGHT,
  Level,
  nextLevelName,
  withRecomputedElevations
} from '../models/Level'

type WallListener = (wall: Wall) => void
type SelectionListener = (wall: Wall | null) => void
type ObjectListener = (object: SceneObject) => void
type ObjectSelectionListener = (object: SceneObject | null) => void

/**
 * Cambio estructural de la lista de pisos (añadir, renombrar, cambiar altura,
 * eliminar). El historial lo guarda como un comando único con las copias
 * `before`/`after`; la visibilidad y el piso activo NO generan este evento
 * (son estado de vista, no datos del proyecto).
 */
export interface LevelStructureEvent {
  before: Level[]
  after: Level[]
  /** Etiqueta del paso de historial (Ctrl+Z / Ctrl+Y). */
  label: string
}

/**
 * Fuente única de verdad para los objetos del lienzo. La capa de render
 * (viewport/ViewportRenderer.ts) se suscribe a onWallAdded/Removed/Changed
 * para regenerar solo la geometría afectada. Equivalente a
 * Engine/SceneManager.cs de la versión WPF.
 *
 * Es también el punto de entrada que usa AIChatService para aplicar los
 * comandos JSON que llegan del "Chat IA": todo objeto creado por la IA
 * pasa por aquí, igual que los creados manualmente por el usuario.
 */
export class SceneManager {
  private walls: Wall[] = []
  private objects: SceneObject[] = []
  private nextOpeningId = 1
  private selected: Wall | null = null
  private selectedObject: SceneObject | null = null

  private addedListeners: WallListener[] = []
  private removedListeners: WallListener[] = []
  private changedListeners: WallListener[] = []
  /** Se disparan en cada `moveWall` (también durante los arrastres silenciosos). */
  private wallMovedListeners: WallListener[] = []
  private selectionListeners: SelectionListener[] = []
  private objectAddedListeners: ObjectListener[] = []
  private objectRemovedListeners: ObjectListener[] = []
  private objectChangedListeners: ObjectListener[] = []
  /** Se disparan en cada `moveObject` (también durante los arrastres silenciosos). */
  private objectMovedListeners: ObjectListener[] = []
  private objectSelectionListeners: ObjectSelectionListener[] = []

  /* ---------- Estado de niveles (pisos) ---------- */

  /** Pisos del proyecto (siempre hay al menos «Piso 0»); orden = de abajo arriba. */
  private levels: Level[] = [createDefaultLevel()]
  /** Piso activo: las herramientas de dibujo trazan sobre su elevación. */
  private activeLevelId: string = DEFAULT_LEVEL_ID
  /** Visibilidad por piso (ojo del Navegador); una clave ausente = visible. */
  private levelVisibility = new Map<string, boolean>()

  private levelStructureListeners: Array<(event: LevelStructureEvent) => void> = []
  private levelsChangeListeners: Array<() => void> = []

  onWallAdded(fn: WallListener): void {
    this.addedListeners.push(fn)
  }
  onWallRemoved(fn: WallListener): void {
    this.removedListeners.push(fn)
  }
  onWallChanged(fn: WallListener): void {
    this.changedListeners.push(fn)
  }
  /** Notificación garantizada de cada movimiento; la usa el renderer para repintar. */
  onWallMoved(fn: WallListener): void {
    this.wallMovedListeners.push(fn)
  }
  onSelectionChanged(fn: SelectionListener): void {
    this.selectionListeners.push(fn)
  }
  onObjectAdded(fn: ObjectListener): void {
    this.objectAddedListeners.push(fn)
  }
  onObjectRemoved(fn: ObjectListener): void {
    this.objectRemovedListeners.push(fn)
  }
  onObjectChanged(fn: ObjectListener): void {
    this.objectChangedListeners.push(fn)
  }
  /** Notificación garantizada de cada movimiento; la usa el renderer para repintar. */
  onObjectMoved(fn: ObjectListener): void {
    this.objectMovedListeners.push(fn)
  }
  onObjectSelectionChanged(fn: ObjectSelectionListener): void {
    this.objectSelectionListeners.push(fn)
  }
  /** Cambios estructurales de pisos (los registra el `HistoryManager`). */
  onLevelsStructureChanged(fn: (event: LevelStructureEvent) => void): void {
    this.levelStructureListeners.push(fn)
  }
  /** Cualquier cambio de pisos: estructura, piso activo o visibilidad. */
  onLevelsChanged(fn: () => void): void {
    this.levelsChangeListeners.push(fn)
  }

  getWalls(): readonly Wall[] {
    return this.walls
  }

  getObjects(): readonly SceneObject[] {
    return this.objects
  }

  /**
   * Crea un muro. `levelId` opcional: si no se indica, el muro nace en el piso
   * activo. En cualquier caso su geometría se normaliza a la elevación del piso
   * de destino, de modo que el trazo (y los comandos de la IA) quedan a cota.
   */
  addWall(
    type: WallSegmentType,
    start: THREE.Vector3,
    end: THREE.Vector3,
    aiControlled = false,
    levelId?: string
  ): Wall {
    const wall = new Wall(start, end, type)
    wall.aiControlled = aiControlled
    wall.levelId = levelId && this.getLevel(levelId) ? levelId : this.activeLevelId
    const elevation = this.getLevel(wall.levelId)?.elevation ?? 0
    wall.start.y = elevation
    wall.end.y = elevation
    this.walls.push(wall)
    this.addedListeners.forEach((fn) => fn(wall))
    return wall
  }

  removeWall(id: string): boolean {
    const idx = this.walls.findIndex((w) => w.id === id)
    if (idx === -1) return false

    const [wall] = this.walls.splice(idx, 1)
    this.removedListeners.forEach((fn) => fn(wall))
    if (this.selected === wall) this.select(null)
    return true
  }

  /**
   * Reposiciona una pared existente (arrastre manual o comando de la IA).
   * Con `silent: true` no notifica (se usa durante el arrastre para no llenar el
   * historial de pasos intermedios; al soltar se hace un único movimiento real).
   */
  moveWall(id: string, newStart: THREE.Vector3, newEnd: THREE.Vector3, silent = false): void {
    const wall = this.walls.find((w) => w.id === id)
    if (!wall) return

    wall.start = newStart
    wall.end = newEnd
    this.wallMovedListeners.forEach((fn) => fn(wall))
    if (!silent) this.changedListeners.forEach((fn) => fn(wall))
  }

  getWall(id: string): Wall | undefined {
    return this.walls.find((w) => w.id === id)
  }

  /* ---------- Abiertas (puertas/ventanas) sobre muros ---------- */

  /** Valida que un hueco quepa en el muro sin solaparse con otro (solo lectura). */
  validateOpening(
    wallId: string,
    x: number,
    width: number,
    height: number,
    sill: number
  ): void {
    const wall = this.walls.find((w) => w.id === wallId)
    if (!wall) throw new Error(`El muro «${wallId}» no existe.`)
    const x0 = x - width / 2
    const x1 = x + width / 2
    if (x0 < -1e-9 || x1 > wall.length + 1e-9) {
      throw new Error(`El hueco se sale del muro (${wall.length.toFixed(2)} m).`)
    }
    if (sill < 0 || sill + height > wall.height + 1e-9) {
      throw new Error(`El hueco excede la altura del muro (${wall.height.toFixed(2)} m).`)
    }
    for (const other of wall.openings) {
      const o0 = other.x - other.width / 2
      const o1 = other.x + other.width / 2
      if (x1 > o0 + 1e-9 && x0 < o1 - 1e-9) {
        throw new Error('El hueco se solapa con otra abertura en el muro.')
      }
    }
  }

  /** Añade una abertura al muro, la valida y notifica para reconstruir la malla. */
  addOpening(wallId: string, opening: Omit<Opening, 'id'>): Opening {
    this.validateOpening(wallId, opening.x, opening.width, opening.height, opening.sill)
    const wall = this.walls.find((w) => w.id === wallId)
    if (!wall) throw new Error(`El muro «${wallId}» no existe.`)
    const o: Opening = { ...opening, id: `opening-${this.nextOpeningId++}` }
    wall.openings.push(o)
    this.changedListeners.forEach((fn) => fn(wall))
    return o
  }

  /** Actualiza paramétricamente una abertura en el muro y su SceneObject vinculado. */
  updateOpening(wallId: string, openingId: string, patch: Partial<Opening>): Opening | null {
    const wall = this.walls.find((w) => w.id === wallId)
    if (!wall) return null
    const opening = wall.openings.find((o) => o.id === openingId)
    if (!opening) return null

    if (patch.width !== undefined && patch.width > 0) opening.width = patch.width
    if (patch.height !== undefined && patch.height > 0) opening.height = patch.height
    if (patch.sill !== undefined && patch.sill >= 0) opening.sill = patch.sill
    if (patch.x !== undefined && patch.x > 0) opening.x = patch.x
    if (patch.style !== undefined) opening.style = patch.style
    if (patch.swingHand !== undefined) opening.swingHand = patch.swingHand
    if (patch.swingDirection !== undefined) opening.swingDirection = patch.swingDirection
    if (patch.openingAngle !== undefined) opening.openingAngle = patch.openingAngle
    if (patch.materialId !== undefined) opening.materialId = patch.materialId

    this.changedListeners.forEach((fn) => fn(wall))
    this.wallMovedListeners.forEach((fn) => fn(wall))

    // Sincronizar el SceneObject vinculado si existe
    const linkedObj = this.objects.find((o) => o.openingId === openingId)
    if (linkedObj) {
      linkedObj.size.set(opening.width, opening.height, wall.thickness)
      if (patch.style !== undefined) {
        if (opening.type === 'door') linkedObj.doorStyle = patch.style as any
        else linkedObj.windowStyle = patch.style as any
      }
      if (patch.swingHand !== undefined) linkedObj.swingHand = patch.swingHand
      if (patch.swingDirection !== undefined) linkedObj.swingDirection = patch.swingDirection
      if (patch.openingAngle !== undefined) linkedObj.openingAngle = patch.openingAngle
      this.syncObjectWallOpening(linkedObj, false)
      this.objectMovedListeners.forEach((fn) => fn(linkedObj))
    }

    return opening
  }

  /** Elimina una abertura del muro y notifica para reconstruir la malla. */
  removeOpening(wallId: string, openingId: string): boolean {
    const wall = this.walls.find((w) => w.id === wallId)
    if (!wall) return false
    const idx = wall.openings.findIndex((o) => o.id === openingId)
    if (idx === -1) return false
    wall.openings.splice(idx, 1)
    this.changedListeners.forEach((fn) => fn(wall))
    return true
  }

  /** Reemplaza las aberturas de un muro (usa el historial al deshacer/rehacer). */
  replaceWallOpenings(wallId: string, openings: ReadonlyArray<Opening>): void {
    const wall = this.walls.find((w) => w.id === wallId)
    if (!wall) return
    wall.openings = openings.map((o) => ({ ...o }))
    this.changedListeners.forEach((fn) => fn(wall))
  }

  /** Lista las aberturas de un muro. */
  getOpenings(wallId: string): readonly Opening[] {
    const wall = this.walls.find((w) => w.id === wallId)
    return wall ? wall.openings : []
  }

  /**
   * Reinserta una pared a partir de una instantánea conservando su id. Lo usa
   * el historial al deshacer un borrado (y al rehacer un alta).
   */
  restoreWall(snapshot: WallSnapshot): Wall {
    const wall = wallFromSnapshot(snapshot)
    this.walls.push(wall)
    this.addedListeners.forEach((fn) => fn(wall))
    return wall
  }

  /**
   * Selecciona una pared (deselecciona cualquier objeto y el resto de muros).
   *
   * La selección total (Ctrl+A) marca varios elementos a la vez, así que aquí
   * se desmarca todo lo demás: elegir un elemento siempre deja una única
   * selección activa y el renderer repinta el resto con su material normal.
   */
  select(wall: Wall | null): void {
    for (const candidate of this.walls) candidate.isSelected = false
    for (const object of this.objects) object.isSelected = false
    if (this.selectedObject) {
      this.selectedObject = null
      this.objectSelectionListeners.forEach((fn) => fn(null))
    }
    this.selected = wall
    if (wall) wall.isSelected = true
    this.selectionListeners.forEach((fn) => fn(wall))
  }

  /**
   * Selecciona un conjunto de muros simultáneamente (p. ej. recién generados por
   * una plantilla 2D o duplicados con Ctrl+D). Si el grupo tiene un único muro,
   * equivale a `select(walls[0])`; si tiene varios, marca `isSelected = true` en
   * cada uno manteniendo `selected = null` para que acciones grupales (Rotar 90°,
   * Duplicar, Borrar) operen sobre el conjunto y un clic posterior elija un lado
   * individual.
   */
  selectWalls(walls: readonly Wall[]): void {
    const ids = new Set(walls.map((w) => w.id))
    for (const candidate of this.walls) {
      candidate.isSelected = ids.has(candidate.id)
    }
    for (const candidate of this.objects) {
      candidate.isSelected = false
    }
    if (this.selectedObject) {
      this.selectedObject = null
      this.objectSelectionListeners.forEach((fn) => fn(null))
    }
    const matched = this.walls.filter((w) => ids.has(w.id))
    this.selected = matched.length === 1 ? matched[0] : null
    this.selectionListeners.forEach((fn) => fn(this.selected))
  }

  /**
   * Selecciona un objeto colocado en el lienzo (deselecciona cualquier pared
   * y el resto de objetos; véase `select`).
   */
  selectObject(object: SceneObject | null): void {
    for (const candidate of this.walls) candidate.isSelected = false
    for (const candidate of this.objects) candidate.isSelected = false
    if (this.selected) {
      this.selected = null
      this.selectionListeners.forEach((fn) => fn(null))
    }
    this.selectedObject = object
    if (object) object.isSelected = true
    this.objectSelectionListeners.forEach((fn) => fn(object))
  }

  /**
   * Marca todos los muros y objetos del lienzo como seleccionados (Ctrl+A,
   * punto E). Notifica a los suscriptores de selección para que el renderer
   * repinte el realce de todos los elementos de una vez.
   */
  selectAll(): void {
    for (const wall of this.walls) wall.isSelected = true
    for (const object of this.objects) object.isSelected = true
    this.selectionListeners.forEach((fn) => fn(this.selected))
    this.objectSelectionListeners.forEach((fn) => fn(this.selectedObject))
  }

  /** Recuento de muros y objetos marcados (selección simple o total). */
  getSelectionCounts(): { walls: number; objects: number } {
    let walls = 0
    let objects = 0
    for (const wall of this.walls) if (wall.isSelected) walls++
    for (const object of this.objects) if (object.isSelected) objects++
    return { walls, objects }
  }

  /**
   * Notifica a los suscriptores de selección sin cambiar el estado, para que
   * el renderer repinte el realce. Lo usan paneles externos (p. ej. Costos)
   * que marcan `isSelected` directamente en varios elementos a la vez.
   */
  notifySelectionChanged(): void {
    this.selectionListeners.forEach((fn) => fn(this.selected))
    this.objectSelectionListeners.forEach((fn) => fn(this.selectedObject))
  }

  getSelected(): Wall | null {
    return this.selected
  }

  getSelectedObject(): SceneObject | null {
    return this.selectedObject
  }

  /* ---------- Niveles (pisos): consulta y mutaciones ---------- */

  /** Lista de pisos en orden (índice 0 = planta baja). */
  getLevels(): readonly Level[] {
    return this.levels
  }

  getLevel(id: string): Level | undefined {
    return this.levels.find((level) => level.id === id)
  }

  getActiveLevelId(): string {
    return this.activeLevelId
  }

  /** Piso activo; nunca `null` porque siempre existe al menos «Piso 0». */
  getActiveLevel(): Level {
    return this.getLevel(this.activeLevelId) ?? this.levels[this.levels.length - 1]
  }

  /** Cambia el piso activo (el dibujo pasará a trazar a su elevación). */
  setActiveLevel(id: string): boolean {
    if (!this.getLevel(id) || this.activeLevelId === id) return false
    this.activeLevelId = id
    this.emitLevelsChanged()
    return true
  }

  /** ¿Visible el piso? (ojo del Navegador; una clave ausente = visible). */
  isLevelVisible(id: string): boolean {
    return this.levelVisibility.get(id) ?? true
  }

  setLevelVisible(id: string, visible: boolean): void {
    if (!this.getLevel(id) || this.isLevelVisible(id) === visible) return
    this.levelVisibility.set(id, visible)
    this.emitLevelsChanged()
  }

  /** «Mostrar solo este piso»: oculta todos salvo el indicado. */
  showOnlyLevel(id: string): void {
    if (!this.getLevel(id)) return
    for (const level of this.levels) this.levelVisibility.set(level.id, level.id === id)
    this.emitLevelsChanged()
  }

  /** Muestra todos los pisos (cancela «mostrar solo este piso»). */
  showAllLevels(): void {
    if (this.levelVisibility.size === 0) return
    this.levelVisibility.clear()
    this.emitLevelsChanged()
  }

  /**
   * Crea el piso superior: elevación = suma de las alturas de los anteriores,
   * nombre «Piso N» y queda como piso activo. El llamador decide si copiar la
   * planta del piso inferior (normalmente dentro de un `transaction`).
   */
  addLevel(): Level {
    const before = this.snapshotLevels()
    const candidate: Level = {
      id: createLevelId(),
      name: nextLevelName(before),
      elevation: 0,
      initialElevation: before.length > 0 ? before[before.length - 1].elevation + before[before.length - 1].height : 0,
      height: DEFAULT_LEVEL_HEIGHT
    }
    const after = withRecomputedElevations([...before, candidate])
    this.levels = after
    this.activeLevelId = candidate.id
    this.emitLevelsStructure({ before, after: [...after], label: 'Añadir piso' })
    return after[after.length - 1]
  }

  /** Renombra un piso y/o cambia su altura; recalcula las elevaciones. */
  updateLevel(id: string, patch: { name?: string; height?: number }): boolean {
    const before = this.snapshotLevels()
    const index = before.findIndex((level) => level.id === id)
    if (index === -1) return false

    const name = patch.name !== undefined ? patch.name.trim() : undefined
    const height =
      patch.height !== undefined && Number.isFinite(patch.height) && patch.height > 0
        ? patch.height
        : undefined
    const after = before.map((level, i) =>
      i === index
        ? { ...level, name: name && name.length > 0 ? name : level.name, height: height ?? level.height }
        : { ...level }
    )
    const normalized = withRecomputedElevations(after)
    const changed = normalized.some(
      (level, i) =>
        level.name !== before[i].name ||
        level.height !== before[i].height ||
        level.elevation !== before[i].elevation
    )
    if (!changed) return false

    this.levels = normalized
    this.emitLevelsStructure({
      before,
      after: [...normalized],
      label: patch.name !== undefined ? 'Renombrar piso' : 'Cambiar altura de piso'
    })
    this.syncRoofElevations()
    return true
  }

  /**
   * Elimina un piso y todo lo que haya en él. Los elementos se quitan ANTES
   * que el nivel: al deshacer se restaura primero el piso y después sus
   * muros/objetos (los snapshots conservan su `levelId`). El último piso
   * restante no se puede eliminar. Los techos pertenecen a un piso
   * (`levelId` + `sourceLevelId`): si se borra el piso, se borran con él.
   */
  removeLevel(id: string): boolean {
    if (this.levels.length <= 1) return false
    const index = this.levels.findIndex((level) => level.id === id)
    if (index === -1) return false
    const before = this.snapshotLevels()

    for (const wall of [...this.walls].filter((wall) => wall.levelId === id)) this.removeWall(wall.id)
    for (const object of [...this.objects].filter((object) => object.levelId === id || object.roofProps?.sourceLevelId === id)) {
      this.removeObject(object.id)
    }

    const after = withRecomputedElevations(before.filter((level) => level.id !== id))
    this.levels = after
    this.levelVisibility.delete(id)
    if (this.activeLevelId === id) {
      this.activeLevelId = after[Math.min(index, after.length - 1)].id
    }
    this.emitLevelsStructure({ before, after: [...after], label: `Eliminar «${before[index].name}»` })
    this.syncRoofElevations()
    return true
  }

  /**
   * Restaura una lista completa de pisos (deshacer/rehacer y carga de
   * proyecto). Sólo notifica `levelsChanged`: la estructura ya estaba registrada.
   */
  restoreLevels(levels: readonly Level[]): void {
    const normalized =
      levels.length > 0
        ? withRecomputedElevations(levels.map((level) => ({ ...level })))
        : [createDefaultLevel()]
    this.levels = normalized
    if (!this.getLevel(this.activeLevelId)) {
      this.activeLevelId = normalized[normalized.length - 1].id
    }
    for (const key of [...this.levelVisibility.keys()]) {
      if (!this.getLevel(key)) this.levelVisibility.delete(key)
    }
    this.syncRoofElevations()
    this.emitLevelsChanged()
  }

  /** Vuelve a un único «Piso 0» (proyecto nuevo); sí genera paso de historial. */
  resetLevels(): void {
    const before = this.snapshotLevels()
    const after = [createDefaultLevel()]
    this.levels = after
    this.activeLevelId = after[0].id
    this.levelVisibility.clear()
    this.emitLevelsStructure({ before, after: [...after], label: 'Restablecer pisos' })
  }

  /**
   * Recoloca la cota de cada techo por área sobre su piso origen
   * (elevación + altura). Se llama tras mover/renombrar/borrar pisos para que
   * el techo nunca se quede atrás: pertenece a su piso.
   */
  syncRoofElevations(): void {
    let touched = false
    for (const object of this.objects) {
      if (object.kind !== 'roof' || !object.roofProps) continue
      const source = this.getLevel(object.roofProps.sourceLevelId) ?? this.getLevel(object.levelId)
      if (!source) continue
      const y = eaveElevation(source.elevation, source.height)
      if (Math.abs(object.position.y - y) > 1e-9) {
        object.position.y = y
        touched = true
        this.objectMovedListeners.forEach((fn) => fn(object))
      }
    }
    if (touched) this.emitLevelsChanged()
  }

  private snapshotLevels(): Level[] {
    return this.levels.map((level) => ({ ...level }))
  }

  private emitLevelsStructure(event: LevelStructureEvent): void {
    this.levelStructureListeners.forEach((fn) => fn(event))
    this.emitLevelsChanged()
  }

  private emitLevelsChanged(): void {
    this.levelsChangeListeners.forEach((fn) => fn())
  }

  /* ---------- Objetos del lienzo (mobiliario, formas, cubiertas) ---------- */

  /** Crea y añade un objeto en la posición indicada. */
  createObject(name: string, kind: SceneObjectKind, position: THREE.Vector3, rotationY = 0, levelId?: string): SceneObject {
    const object = new SceneObject(name, kind)
    object.position.copy(position)
    object.rotationY = rotationY
    // Nace en el piso indicado (o el activo). Si position.y no venía definida (era 0), se apoya sobre su elevación.
    object.levelId = levelId && this.getLevel(levelId) ? levelId : this.activeLevelId
    if (position.y === 0) {
      object.position.y = this.getLevel(object.levelId)?.elevation ?? this.getActiveLevel().elevation
    }
    return this.addObject(object)
  }

  addObject(object: SceneObject): SceneObject {
    this.syncObjectWallOpening(object, false)
    this.objects.push(object)
    this.objectAddedListeners.forEach((fn) => fn(object))
    return object
  }

  /**
   * Sincroniza automáticamente la perforación booleana del muro anfitrión
   * cuando un `SceneObject` es puerta o ventana (`resolveObjectOpeningSpec`).
   * Así cualquier puerta/ventana colocada por el usuario, IA, escena de prueba
   * o arrastrada sobre un muro genera su hueco real de lado a lado.
   */
  private syncObjectWallOpening(object: SceneObject, silent = false): void {
    const spec = resolveObjectOpeningSpec(object)
    if (!spec) return

    // Si ya tiene un openingId válido sobre un muro y sigue en esa posición, solo alinear rotación/grosor
    if (object.openingId) {
      const currentWall = this.walls.find((w) => w.openings.some((o) => o.id === object.openingId))
      if (currentWall) {
        const dx = currentWall.end.x - currentWall.start.x
        const dz = currentWall.end.z - currentWall.start.z
        const len = Math.hypot(dx, dz)
        if (len > 0.2) {
          const ux = dx / len
          const uz = dz / len
          const proj = (object.position.x - currentWall.start.x) * ux + (object.position.z - currentWall.start.z) * uz
          const perp = Math.abs((object.position.x - currentWall.start.x) * -uz + (object.position.z - currentWall.start.z) * ux)
          const existingOpening = currentWall.openings.find((o) => o.id === object.openingId)!
          if (perp <= Math.max(0.4, currentWall.thickness * 1.6) && proj >= -0.05 && proj <= len + 0.05) {
            const width = existingOpening.width
            const margin = Math.min(0.05, Math.max(0.01, (len - width) * 0.2))
            const clampedX = Math.max(width / 2 + margin, Math.min(len - width / 2 - margin, proj))
            const levelElev = this.getLevel(currentWall.levelId)?.elevation ?? 0
            object.position.set(
              currentWall.start.x + ux * clampedX,
              levelElev + existingOpening.sill,
              currentWall.start.z + uz * clampedX
            )
            object.rotationY = -Math.atan2(dz, dx)
            object.size.set(existingOpening.width, existingOpening.height, currentWall.thickness)
            if (!object.openingVariant) object.openingVariant = spec.variant
            if (Math.abs(existingOpening.x - clampedX) > 1e-4) {
              existingOpening.x = clampedX
              this.wallMovedListeners.forEach((fn) => fn(currentWall))
              if (!silent) this.changedListeners.forEach((fn) => fn(currentWall))
            }
            return
          }
        }
        // Se movió fuera de su muro original: eliminar la perforación anterior
        const idx = currentWall.openings.findIndex((o) => o.id === object.openingId)
        if (idx !== -1) {
          currentWall.openings.splice(idx, 1)
          this.wallMovedListeners.forEach((fn) => fn(currentWall))
          if (!silent) this.changedListeners.forEach((fn) => fn(currentWall))
        }
        object.openingId = null
      }
    }

    // Buscar un muro anfitrión bajo la posición de la puerta/ventana
    let hostWall: Wall | null = null
    let hostT = 0
    let bestPerp = 0.45

    for (const candidate of this.walls) {
      if (candidate.levelId !== object.levelId) continue
      const dx = candidate.end.x - candidate.start.x
      const dz = candidate.end.z - candidate.start.z
      const len = Math.hypot(dx, dz)
      if (len < 0.4) continue
      const ux = dx / len
      const uz = dz / len
      const proj = (object.position.x - candidate.start.x) * ux + (object.position.z - candidate.start.z) * uz
      if (proj < -0.05 || proj > len + 0.05) continue
      const perp = Math.abs((object.position.x - candidate.start.x) * -uz + (object.position.z - candidate.start.z) * ux)
      if (perp <= bestPerp) {
        bestPerp = perp
        hostWall = candidate
        hostT = proj
      }
    }

    if (!hostWall) return

    const dx = hostWall.end.x - hostWall.start.x
    const dz = hostWall.end.z - hostWall.start.z
    const len = Math.hypot(dx, dz)
    const ux = dx / len
    const uz = dz / len

    const rawW = object.size.x > 0.2 ? object.size.x : spec.type === 'door' ? 0.9 : 1.2
    const rawH = object.size.y > 0.2 ? object.size.y : spec.type === 'door' ? 2.1 : 1.2
    const width = Math.min(rawW, Math.max(0.4, len - 0.1))
    const height = Math.min(rawH, Math.max(0.4, hostWall.height - 0.05))
    const levelElev = this.getLevel(hostWall.levelId)?.elevation ?? 0
    const relY = object.position.y - levelElev
    const sill =
      spec.type === 'door'
        ? 0
        : Math.max(0.1, Math.min(hostWall.height - height - 0.02, relY > 0.05 && relY < hostWall.height - 0.2 ? relY : 0.9))

    const margin = Math.min(0.05, Math.max(0.01, (len - width) * 0.2))
    const clampedT = Math.max(width / 2 + margin, Math.min(len - width / 2 - margin, hostT))

    // Evitar duplicar si ya hay un hueco en la misma coordenada
    const existing = hostWall.openings.find((o) => Math.abs(o.x - clampedT) < width * 0.45)
    if (existing) {
      object.openingId = existing.id
    } else {
      const newOpening: Opening = {
        id: `opening-${this.nextOpeningId++}`,
        wallId: hostWall.id,
        x: clampedT,
        width,
        height,
        sill,
        type: spec.type,
        materialId: object.materialId
      }
      hostWall.openings.push(newOpening)
      object.openingId = newOpening.id
      this.wallMovedListeners.forEach((fn) => fn(hostWall))
      if (!silent) this.changedListeners.forEach((fn) => fn(hostWall))
    }

    object.openingVariant = object.openingVariant ?? spec.variant
    if (!object.shapeId || !object.shapeId.startsWith('opening.')) {
      object.shapeId = spec.type === 'door' ? 'opening.door' : 'opening.window'
    }
    object.position.set(hostWall.start.x + ux * clampedT, levelElev + sill, hostWall.start.z + uz * clampedT)
    object.rotationY = -Math.atan2(dz, dx)
    object.size.set(width, height, hostWall.thickness)
  }

  /**
   * Contorno exterior de los muros de un piso (mundo XZ, sin voladizo).
   * `null` si los muros no forman un contorno cerrado.
   */
  levelFootprint(levelId: string): Array<{ x: number; z: number }> | null {
    const segments: FootprintSegment[] = this.walls
      .filter((w) => w.levelId === levelId)
      .map((w) => ({ a: { x: w.start.x, z: w.start.z }, b: { x: w.end.x, z: w.end.z } }))
    const trace = traceFootprint(segments)
    return trace.polygon
  }

  /** Opciones para crear un techo por área (manual o automático). */
  /** Crea un techo por área sobre un contorno dado o sobre los muros de un piso. */
  createRoof(options: {
    footprint?: Array<{ x: number; z: number }>
    auto?: boolean
    type?: RoofType
    slope?: number
    overhang?: number
    thickness?: number
    materialId?: string | null
    levelId?: string
    ridgeDir?: 'x' | 'z'
  }): SceneObject | null {
    const levelId = options.levelId && this.getLevel(options.levelId) ? options.levelId : this.activeLevelId
    const level = this.getLevel(levelId) ?? this.getActiveLevel()
    let footprint = options.footprint ?? null
    if ((!footprint || footprint.length < 3) && (options.auto ?? true)) {
      footprint = this.levelFootprint(level.id)
    }
    if (!footprint || footprint.length < 3) return null
    const type: RoofType = options.type === 'flat' || options.type === 'hip' || options.type === 'gable'
      ? options.type
      : 'gable'
    const slope = Number.isFinite(options.slope) ? Math.max(0, Math.min(60, options.slope as number)) : DEFAULT_ROOF_SLOPE
    const overhang = Number.isFinite(options.overhang) ? Math.max(0, Math.min(2, options.overhang as number)) : DEFAULT_ROOF_OVERHANG
    const thickness = Number.isFinite(options.thickness)
      ? Math.max(0.02, Math.min(1, options.thickness as number))
      : DEFAULT_ROOF_THICKNESS
    const ridgeDir = options.ridgeDir === 'z' ? 'z' : 'x'
    const fitted = buildFittedRoofGeometry({ footprint, type, slope, overhang, thickness, ridgeDir })
    if (!fitted) return null
    const object = new SceneObject(`Techo ${roofTypeLabel(type)}`, 'roof')
    object.shapeId = roofShapeId(type)
    object.materialId = options.materialId ?? 'mat.terracotta'
    object.levelId = level.id
    object.roofProps = { type, slope, overhang, thickness, ridgeDir, footprint: footprint.map((p) => ({ x: p.x, z: p.z })), sourceLevelId: level.id }
    // Posición = ancla XZ + cota del alero (elevación + altura del piso origen).
    object.position.set(fitted.anchor.x, eaveElevation(level.elevation, level.height), fitted.anchor.z)
    object.rotationY = 0
    return this.addObject(object)
  }

  removeObject(id: string): boolean {
    const idx = this.objects.findIndex((candidate) => candidate.id === id)
    if (idx === -1) return false

    const [object] = this.objects.splice(idx, 1)
    this.objectRemovedListeners.forEach((fn) => fn(object))
    if (this.selectedObject === object) this.selectObject(null)

    // Si es una puerta o ventana, también removemos la abertura del muro para cerrar el hueco.
    if (object.openingId) {
      const wall = this.walls.find((w) => w.openings.some((o) => o.id === object.openingId))
      if (wall) {
        this.removeOpening(wall.id, object.openingId)
      }
    }

    return true
  }

  /** Reposiciona/rota un objeto. `silent` funciona igual que en `moveWall`. */
  moveObject(id: string, position: THREE.Vector3, rotationY: number, silent = false): void {
    const object = this.objects.find((candidate) => candidate.id === id)
    if (!object) return

    object.position.copy(position)
    object.rotationY = rotationY
    this.syncObjectWallOpening(object, silent)
    this.objectMovedListeners.forEach((fn) => fn(object))
    if (!silent) this.objectChangedListeners.forEach((fn) => fn(object))
  }

  /**
   * Aplica un material del catálogo a un muro (Fase 2 · punto A).
   *
   * Notifica a los dos suscriptores clave: `wallMoved` (el renderer reconstruye
   * la malla con la nueva textura) y `wallChanged` (el historial registra el
   * cambio como paso deshacible: los snapshots ya incluyen `materialId`).
   */
  setWallMaterial(id: string, materialId: string | null): void {
    const wall = this.walls.find((candidate) => candidate.id === id)
    if (!wall || wall.materialId === materialId) return

    wall.materialId = materialId
    this.wallMovedListeners.forEach((fn) => fn(wall))
    this.changedListeners.forEach((fn) => fn(wall))
  }

  /** Aplica un material del catálogo a un objeto colocado (mismo contrato). */
  setObjectMaterial(id: string, materialId: string | null): void {
    const object = this.objects.find((candidate) => candidate.id === id)
    if (!object || object.materialId === materialId) return

    object.materialId = materialId
    this.objectMovedListeners.forEach((fn) => fn(object))
    this.objectChangedListeners.forEach((fn) => fn(object))
  }

  /**
   * Actualiza dimensiones, posición, rotación, parámetros estructurales o datos
   * de terreno de un `SceneObject`, regenerando su malla en el visor (`objectMoved`)
   * y registrando el paso en el historial salvo que `silent` sea `true`.
   */
  updateObject(
    id: string,
    patch: {
      name?: string
      position?: THREE.Vector3
      rotationY?: number
      size?: THREE.Vector3
      color?: number
      materialId?: string | null
      structuralParams?: import('../models/StructuralTypes').StructuralParams | null
      terrainData?: import('../models/TerrainTypes').TerrainData | null
      openingVariant?: string | null
      openingAngle?: number
      doorStyle?: import('../models/Opening').DoorStyle | null
      windowStyle?: import('../models/Opening').WindowStyle | null
      swingHand?: import('../models/Opening').SwingHand
      swingDirection?: import('../models/Opening').SwingDirection
      leafMaterialId?: string | null
      frameMaterialId?: string | null
      handleVisible?: boolean
    },
    silent = false
  ): SceneObject | null {
    const object = this.objects.find((candidate) => candidate.id === id)
    if (!object) return null

    if (patch.name !== undefined && patch.name.trim()) object.name = patch.name.trim()
    if (patch.position) object.position.copy(patch.position)
    if (patch.rotationY !== undefined && Number.isFinite(patch.rotationY)) object.rotationY = patch.rotationY
    if (patch.size) {
      object.size.set(
        Math.max(0.05, patch.size.x),
        Math.max(0.05, patch.size.y),
        Math.max(0.05, patch.size.z)
      )
    }
    if (patch.color !== undefined && Number.isFinite(patch.color)) object.color = patch.color
    if (patch.materialId !== undefined) object.materialId = patch.materialId
    if (patch.structuralParams !== undefined) {
      object.structuralParams = patch.structuralParams ? { ...patch.structuralParams } : null
    }
    if (patch.terrainData !== undefined) {
      object.terrainData = patch.terrainData
    }
    if (patch.openingVariant !== undefined) object.openingVariant = patch.openingVariant
    if (patch.openingAngle !== undefined && Number.isFinite(patch.openingAngle)) object.openingAngle = patch.openingAngle
    if (patch.doorStyle !== undefined) object.doorStyle = patch.doorStyle
    if (patch.windowStyle !== undefined) object.windowStyle = patch.windowStyle
    if (patch.swingHand !== undefined) object.swingHand = patch.swingHand
    if (patch.swingDirection !== undefined) object.swingDirection = patch.swingDirection
    if (patch.leafMaterialId !== undefined) object.leafMaterialId = patch.leafMaterialId
    if (patch.frameMaterialId !== undefined) object.frameMaterialId = patch.frameMaterialId
    if (patch.handleVisible !== undefined) object.handleVisible = patch.handleVisible

    // Si tiene un opening asociado en un muro, sincronizarlo
    if (object.openingId) {
      const hostWall = this.walls.find((w) => w.openings.some((o) => o.id === object.openingId))
      const op = hostWall?.openings.find((o) => o.id === object.openingId)
      if (hostWall && op) {
        if (patch.size) {
          op.width = object.size.x
          op.height = object.size.y
        }
        if (patch.doorStyle) op.style = patch.doorStyle
        if (patch.windowStyle) op.style = patch.windowStyle
        if (patch.swingHand) op.swingHand = patch.swingHand
        if (patch.swingDirection) op.swingDirection = patch.swingDirection
        if (patch.openingAngle !== undefined) op.openingAngle = patch.openingAngle
        this.wallMovedListeners.forEach((fn) => fn(hostWall))
        if (!silent) this.changedListeners.forEach((fn) => fn(hostWall))
      }
    }

    this.syncObjectWallOpening(object, silent)
    this.objectMovedListeners.forEach((fn) => fn(object))
    if (!silent) this.objectChangedListeners.forEach((fn) => fn(object))
    return object
  }

  /** Devuelve todos los terrenos topográficos (`topo.terrain`) cargados en la escena. */
  getTerrains(): SceneObject[] {
    return this.objects.filter((obj) => obj.shapeId === 'topo.terrain' || obj.terrainData !== null)
  }

  getObject(id: string): SceneObject | undefined {
    return this.objects.find((candidate) => candidate.id === id)
  }

  /** Pisos que tienen al menos un muro, ordenados de abajo hacia arriba. */
  getLevelsWithWalls(): Level[] {
    const wallLevels = new Set<string>()
    for (const wall of this.walls) wallLevels.add(wall.levelId)
    return this.levels.filter((level) => wallLevels.has(level.id))
  }

  /** Piso más alto que tiene muros, o `null` si no hay muros en el proyecto. */
  getHighestLevelWithWalls(): Level | null {
    const levelsWithWalls = this.getLevelsWithWalls()
    return levelsWithWalls.length > 0 ? levelsWithWalls[levelsWithWalls.length - 1] : null
  }

  /** Todos los techos de la escena. */
  getRoofs(): SceneObject[] {
    return this.objects.filter((object) => object.kind === 'roof')
  }

  /**
   * Reajusta un techo existente a partir de su huella actual: reconstruye la
   * geometría y reposiciona el objeto en la cota del alero del piso origen.
   * Usado por el botón «Reajustar techo» del panel de propiedades.
   */
  rebalanceRoof(id: string): SceneObject | null {
    const object = this.objects.find((candidate) => candidate.id === id)
    if (!object || !object.roofProps) return null
    const props = object.roofProps
    const fitted = buildFittedRoofGeometry({
      footprint: props.footprint,
      type: props.type,
      slope: props.slope,
      overhang: props.overhang,
      thickness: props.thickness,
      ridgeDir: props.ridgeDir
    })
    if (!fitted) return null
    const level = this.getLevel(props.sourceLevelId) ?? this.getActiveLevel()
    object.position.set(fitted.anchor.x, eaveElevation(level.elevation, level.height), fitted.anchor.z)
    this.objectMovedListeners.forEach((fn) => fn(object))
    this.objectChangedListeners.forEach((fn) => fn(object))
    return object
  }

  /**
   * Actualiza las propiedades de un techo y reconstruye su geometría.
   * Notifica a `objectMoved` y `objectChanged` para que el renderer
   * reconstruya la malla y el historial registre el paso.
   */
  updateRoofProps(id: string, props: Partial<RoofProps>): boolean {
    const object = this.objects.find((candidate) => candidate.id === id)
    if (!object || !object.roofProps) return false
    const next: RoofProps = { ...object.roofProps, ...props }
    object.roofProps = next
    object.shapeId = roofShapeId(next.type)
    const level = this.getLevel(next.sourceLevelId) ?? this.getActiveLevel()
    const fitted = buildFittedRoofGeometry({
      footprint: next.footprint,
      type: next.type,
      slope: next.slope,
      overhang: next.overhang,
      thickness: next.thickness,
      ridgeDir: next.ridgeDir
    })
    if (fitted) {
      object.position.set(fitted.anchor.x, eaveElevation(level.elevation, level.height), fitted.anchor.z)
    }
    this.objectMovedListeners.forEach((fn) => fn(object))
    this.objectChangedListeners.forEach((fn) => fn(object))
    return true
  }

  /** Reinserta un objeto desde una instantánea (deshacer un borrado / rehacer un alta). */
  restoreObject(snapshot: SceneObjectSnapshot): SceneObject {
    return this.addObject(objectFromSnapshot(snapshot))
  }

  clear(): void {
    const wallsToRemove = [...this.walls]
    const objectsToRemove = [...this.objects]
    this.walls = []
    this.objects = []
    wallsToRemove.forEach((wall) => this.removedListeners.forEach((fn) => fn(wall)))
    objectsToRemove.forEach((object) => this.objectRemovedListeners.forEach((fn) => fn(object)))
    this.select(null)
    this.selectObject(null)
  }

  /** Carga un diseño predeterminado de la galería inferior, trasladado al origen indicado. */
  loadDesign(design: ProjectDesign, origin: THREE.Vector3): void {
    for (const templateWall of design.walls) {
      this.addWall(
        templateWall.type,
        new THREE.Vector3().addVectors(templateWall.start, origin),
        new THREE.Vector3().addVectors(templateWall.end, origin),
        false
      )
    }
  }

  /** Envolvente de todo lo dibujado (paredes + objetos); por defecto, un lienzo de 10×10. */
  getSceneBounds(): THREE.Box3 {
    if (this.walls.length === 0 && this.objects.length === 0) {
      return new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5))
    }
    const box = new THREE.Box3()
    for (const wall of this.walls) {
      box.expandByPoint(wall.start)
      box.expandByPoint(wall.end)
    }
    for (const object of this.objects) {
      const halfX = Math.max(0.25, object.size.x / 2)
      const halfZ = Math.max(0.25, object.size.z / 2)
      box.expandByPoint(new THREE.Vector3(object.position.x - halfX, object.position.y, object.position.z - halfZ))
      box.expandByPoint(
        new THREE.Vector3(object.position.x + halfX, object.position.y + object.size.y, object.position.z + halfZ)
      )
    }
    return box
  }
}
