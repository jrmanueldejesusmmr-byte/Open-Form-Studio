import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { WallSnapshot, wallToSnapshot } from '../models/Wall'
import { SceneObjectSnapshot, objectToSnapshot } from '../models/SceneObject'
import type { Level } from '../models/Level'
import { Animation, cloneAnimation } from '../animation/model'

/**
 * Historial de operaciones del lienzo (Archivo/Guardar/Undo/Redo de la barra
 * superior). Se suscribe a los eventos del SceneManager, así que registra por
 * igual las operaciones manuales y las que ordena la IA: "Deshacer" siempre
 * revierte lo último que pasó en la escena.
 *
 * Las operaciones se aplican de forma inversa (replaying) sin volver a
 * registrarse, y `transaction()` agrupa varias en un solo paso de historial
 * (cargar un diseño completo o un comando de IA con varias paredes).
 */
type HistoryCommand =
  | { kind: 'add'; label: string; wall: WallSnapshot }
  | { kind: 'remove'; label: string; wall: WallSnapshot }
  | { kind: 'move'; label: string; id: string; before: WallSnapshot; after: WallSnapshot }
  | { kind: 'add_object'; label: string; object: SceneObjectSnapshot }
  | { kind: 'remove_object'; label: string; object: SceneObjectSnapshot }
  | { kind: 'move_object'; label: string; id: string; before: SceneObjectSnapshot; after: SceneObjectSnapshot }
  | { kind: 'levels'; label: string; before: Level[]; after: Level[] }
  | { kind: 'animation'; label: string; before: Animation; after: Animation; apply: (animation: Animation) => void }
  | { kind: 'group'; label: string; commands: HistoryCommand[] }

export class HistoryManager {
  private readonly undoStack: HistoryCommand[] = []
  private readonly redoStack: HistoryCommand[] = []
  private readonly known = new Map<string, WallSnapshot>()
  private readonly knownObjects = new Map<string, SceneObjectSnapshot>()
  private readonly listeners: Array<() => void> = []
  private group: { label: string; commands: HistoryCommand[] } | null = null
  private replaying = false
  private paused = false

  /** Tope de anidamiento al aplicar grupos; corta cualquier recursión desbocada. */
  private static readonly MAX_GROUP_DEPTH = 50

  /** Tope de pasos del historial, saneado a un entero >= 0 (ver constructor). */
  private readonly limit: number

  constructor(
    private readonly scene: SceneManager,
    limit = 200
  ) {
    // Saneado defensivo del tope: `trim()` vacía la pila con `shift()` mientras
    // su longitud lo supere, y `shift()` sobre un array ya vacío no reduce
    // `length`. Con un límite NaN o negativo esa condición no se cumpliría
    // nunca y el bucle `while` de `trim()` no terminaría jamás.
    if (Number.isFinite(limit)) {
      this.limit = Math.max(0, Math.floor(limit))
    } else {
      // `Infinity` se interpreta como «sin tope»; cualquier otro valor no finito
      // (NaN) se anula para no dejar el historial en un estado indefinido.
      this.limit = limit === Infinity ? Infinity : 0
    }

    scene.onWallAdded((wall) => {
      const snapshot = wallToSnapshot(wall)
      this.known.set(wall.id, snapshot)
      this.push({ kind: 'add', label: 'Añadir muro', wall: snapshot })
    })

    scene.onWallRemoved((wall) => {
      const snapshot = this.known.get(wall.id) ?? wallToSnapshot(wall)
      this.known.delete(wall.id)
      this.push({ kind: 'remove', label: 'Eliminar muro', wall: snapshot })
    })

    scene.onWallChanged((wall) => {
      const after = wallToSnapshot(wall)
      const before = this.known.get(wall.id)
      this.known.set(wall.id, after)
      if (!before) return
      // Cambiar sólo el material no debe etiquetarse como «Mover muro».
      const moved = !before.start.equals(after.start) || !before.end.equals(after.end)
      this.push({ kind: 'move', label: moved ? 'Mover muro' : 'Cambiar material', id: wall.id, before, after })
    })

    scene.onObjectAdded((object) => {
      const snapshot = objectToSnapshot(object)
      this.knownObjects.set(object.id, snapshot)
      this.push({ kind: 'add_object', label: 'Añadir objeto', object: snapshot })
    })

    scene.onObjectRemoved((object) => {
      const snapshot = this.knownObjects.get(object.id) ?? objectToSnapshot(object)
      this.knownObjects.delete(object.id)
      this.push({ kind: 'remove_object', label: 'Eliminar objeto', object: snapshot })
    })

    scene.onObjectChanged((object) => {
      const after = objectToSnapshot(object)
      const before = this.knownObjects.get(object.id)
      this.knownObjects.set(object.id, after)
      if (!before) return
      const moved = before.position.x !== after.position.x || before.position.y !== after.position.y ||
        before.position.z !== after.position.z || before.rotationY !== after.rotationY
      this.push({ kind: 'move_object', label: moved ? 'Mover objeto' : 'Cambiar material', id: object.id, before, after })
    })

    // Altas/bajas/cambios de pisos: un único paso con las copias before/after.
    scene.onLevelsStructureChanged((event) => {
      this.push({ kind: 'levels', label: event.label, before: event.before, after: event.after })
    })
  }

  /** Registra un cambio de animación (insertar, mover, borrar fotograma o cambiar interpolación). */
  recordAnimation(
    label: string,
    before: Animation,
    after: Animation,
    apply: (animation: Animation) => void
  ): void {
    this.push({
      kind: 'animation',
      label,
      before: cloneAnimation(before),
      after: cloneAnimation(after),
      apply
    })
  }

  /** Pausa el registro del historial (p. ej. mientras se reproduce o restaura la animación). */
  setPaused(paused: boolean): void {
    this.paused = paused
  }

  isPaused(): boolean {
    return this.paused
  }

  isReplaying(): boolean {
    return this.replaying
  }

  /** Resincroniza las copias conocidas de muros y objetos sin añadir comandos al historial. */
  syncKnownSnapshots(): void {
    this.known.clear()
    this.knownObjects.clear()
    for (const wall of this.scene.getWalls()) {
      this.known.set(wall.id, wallToSnapshot(wall))
    }
    for (const obj of this.scene.getObjects()) {
      this.knownObjects.set(obj.id, objectToSnapshot(obj))
    }
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn)
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  peekUndoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null
  }

  peekRedoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null
  }

  undo(): boolean {
    const command = this.undoStack.pop()
    if (!command) return false
    this.replay(() => this.apply(command, 'undo'))
    this.redoStack.push(command)
    this.notify()
    return true
  }

  redo(): boolean {
    const command = this.redoStack.pop()
    if (!command) return false
    this.replay(() => this.apply(command, 'redo'))
    this.undoStack.push(command)
    this.notify()
    return true
  }

  /** Ejecuta varias operaciones (altas/borrados/movimientos) como un único paso de historial. */
  transaction(label: string, fn: () => void): void {
    const parent = this.group
    const group = { label, commands: [] as HistoryCommand[] }
    this.group = group
    try {
      fn()
    } finally {
      this.group = parent
    }
    if (group.commands.length === 0) return

    if (parent) {
      parent.commands.push({ kind: 'group', label, commands: group.commands })
      return
    }
    this.undoStack.push({ kind: 'group', label, commands: group.commands })
    this.redoStack.length = 0
    this.trim()
    this.notify()
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.syncKnownSnapshots()
    this.notify()
  }

  /**
   * Vacía sólo la pila de «rehacer». Lo usa el ejecutor de IA para descartar la
   * entrada de redo que deja el rollback de una orden fallida (nunca debe poder
   * re-aplicarse una orden que no se completó).
   */
  clearRedo(): void {
    this.redoStack.length = 0
  }

  private replay(action: () => void): void {
    this.replaying = true
    try {
      action()
    } finally {
      this.replaying = false
    }
  }

  private apply(command: HistoryCommand, direction: 'undo' | 'redo', depth = 0): void {
    // `depth` es la condición de parada de la recursión de grupos: aunque los
    // datos llegaran anidados a propósito, el recorrido siempre termina.
    if (depth > HistoryManager.MAX_GROUP_DEPTH) return

    switch (command.kind) {
      case 'group': {
        const commands = direction === 'undo' ? [...command.commands].reverse() : command.commands
        commands.forEach((child) => this.apply(child, direction, depth + 1))
        return
      }
      case 'add':
        if (direction === 'undo') this.scene.removeWall(command.wall.id)
        else this.scene.restoreWall(command.wall)
        return
      case 'remove':
        if (direction === 'undo') this.scene.restoreWall(command.wall)
        else this.scene.removeWall(command.wall.id)
        return
      case 'move': {
        const snapshot = direction === 'undo' ? command.before : command.after
        // El snapshot también lleva `materialId`: se restaura el material antes
        // de reposicionar, de modo que el rebuild del renderer ya lo pinte bien.
        this.scene.setWallMaterial(command.id, snapshot.materialId ?? null)
        const wall = this.scene.getWall(command.id)
        if (wall) {
          wall.height = snapshot.height
          wall.thickness = snapshot.thickness
          wall.color = snapshot.color
          wall.visible = snapshot.visible ?? true
        }
        this.scene.moveWall(command.id, snapshot.start.clone(), snapshot.end.clone())
        // Restaura las aberturas del muro (huecos reales) para que el deshacer
        // y el rehacer vuelvan a la geometría exacta anterior.
        this.scene.replaceWallOpenings(command.id, snapshot.openings ?? [])
        return
      }
      case 'add_object':
        if (direction === 'undo') this.scene.removeObject(command.object.id)
        else this.scene.restoreObject(command.object)
        return
      case 'remove_object':
        if (direction === 'undo') this.scene.restoreObject(command.object)
        else this.scene.removeObject(command.object.id)
        return
      case 'move_object': {
        const snapshot = direction === 'undo' ? command.before : command.after
        // Restaura también el material antes de reconstruir la malla.
        this.scene.setObjectMaterial(command.id, snapshot.materialId ?? null)
        const obj = this.scene.getObject(command.id)
        if (obj) {
          obj.name = snapshot.name
          obj.size.set(snapshot.size.width, snapshot.size.height, snapshot.size.depth)
          obj.color = snapshot.color
          obj.openingAngle = snapshot.openingAngle ?? 0
          obj.visible = snapshot.visible ?? true
          obj.structuralParams = snapshot.structuralParams ? { ...snapshot.structuralParams } : null
          obj.terrainData = snapshot.terrainData
            ? {
                ...snapshot.terrainData,
                heights: [...snapshot.terrainData.heights],
                originalHeights: [...snapshot.terrainData.originalHeights],
                gradingPads: snapshot.terrainData.gradingPads
                  ? snapshot.terrainData.gradingPads.map((p) => ({
                      ...p,
                      points: p.points.map((pt) => ({ ...pt }))
                    }))
                  : [],
                spotElevations: snapshot.terrainData.spotElevations
                  ? snapshot.terrainData.spotElevations.map((s) => ({ ...s }))
                  : []
              }
            : null
        }
        this.scene.moveObject(
          command.id,
          new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z),
          snapshot.rotationY
        )
        return
      }
      case 'levels':
        // Restaura la lista completa de pisos (elevaciones incluidas).
        this.scene.restoreLevels(direction === 'undo' ? command.before : command.after)
        return
      case 'animation':
        command.apply(cloneAnimation(direction === 'undo' ? command.before : command.after))
        return
    }
  }

  private push(command: HistoryCommand): void {
    if (this.replaying || this.paused) return
    if (this.group) {
      this.group.commands.push(command)
      return
    }
    this.undoStack.push(command)
    this.redoStack.length = 0
    this.trim()
    this.notify()
  }

  private trim(): void {
    // `this.limit` ya está saneado a un entero >= 0 en el constructor, así que
    // `shift()` siempre reduce `length` y la condición de salida es alcanzable.
    while (this.undoStack.length > this.limit) this.undoStack.shift()
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }
}
