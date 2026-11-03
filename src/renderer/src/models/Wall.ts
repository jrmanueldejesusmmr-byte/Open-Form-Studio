import * as THREE from 'three'
import { DEFAULT_LEVEL_ID } from './Level'
import type { Opening } from './Opening'

/**
 * Tipo de segmento de pared, correspondiente a las tres herramientas del
 * panel izquierdo: "Walls", "Structural Wall Segments" y "Room Walls".
 */
export enum WallSegmentType {
  SimpleWall = 'SimpleWall',
  StructuralSegment = 'StructuralSegment',
  RoomWalls = 'RoomWalls'
}

/** Nombre legible de un tipo de segmento, para mensajes de la interfaz. */
export function wallTypeName(type: WallSegmentType): string {
  switch (type) {
    case WallSegmentType.StructuralSegment:
      return 'Segmento estructural'
    case WallSegmentType.RoomWalls:
      return 'Muros de habitación'
    default:
      return 'Muro simple'
  }
}

let nextId = 1

/**
 * Representa una pared u objeto arquitectónico colocado sobre la
 * cuadrícula 3D. Es un objeto de datos puro (sin lógica de render): el
 * motor (engine/WallMeshBuilder) lo traduce a geometría de Three.js.
 */
export class Wall {
  readonly id: string = `wall-${nextId++}`

  type: WallSegmentType = WallSegmentType.SimpleWall
  start: THREE.Vector3
  end: THREE.Vector3
  height = 2.5
  thickness = 0.2
  color = 0xe0dace
  /**
   * Material del catálogo aplicado a este muro (`mat.brick`…). Opcional: los
   * muros de los proyectos guardados antes de la Fase 2 no lo traen y se
   * pintan con su color habitual.
   */
  materialId: string | null = null
  /**
   * Abiertas (puertas/ventanas) cortadas sobre este muro, definidas en metros
   * desde el inicio del segmento. El motor (engine/WallMeshBuilder) las
   * traduce a huecos reales en la geometría extruida del muro.
   */
  openings: Opening[] = []
  /**
   * Piso (nivel) al que pertenece el muro. «Piso 0» (`level-0`) por defecto:
   * los proyectos guardados antes de la multiplanta migran aquí.
   */
  levelId: string = DEFAULT_LEVEL_ID

  /**
   * Si es true, la IA tiene permiso para modificar/mover/borrar este
   * objeto automáticamente (ver instrucciones del proyecto: "La IA tendrá
   * dominio sobre objeto creado"). Los bocetos manuales del usuario deben
   * marcarse en false para protegerlos.
   */
  aiControlled = true

  isSelected = false

  /** Visibilidad individual del muro (animable desde la línea de tiempo). */
  visible = true

  /**
   * `id` solo se usa al **restaurar** una pared (p. ej. al deshacer un
   * borrado o al deshacer un comando de la IA); en el uso normal se deja
   * undefined para que el contador global asigne uno nuevo.
   */
  constructor(
    start: THREE.Vector3,
    end: THREE.Vector3,
    type: WallSegmentType = WallSegmentType.SimpleWall,
    id?: string
  ) {
    if (id) this.id = id
    this.start = start
    this.end = end
    this.type = type
  }

  get length(): number {
    return this.start.distanceTo(this.end)
  }

  /** Nombre legible (barra de estado, historial, mensajes de la IA). */
  get label(): string {
    return wallTypeName(this.type)
  }
}

/**
 * Instantánea inmutable de una pared. La usa el historial (undo/redo) y el
 * propio SceneManager para recrear objetos sin perder su identidad.
 */
export interface WallSnapshot {
  id: string
  type: WallSegmentType
  start: THREE.Vector3
  end: THREE.Vector3
  height: number
  thickness: number
  color: number
  aiControlled: boolean
  /** Material del catálogo (opcional; ausente en snapshots antiguos). */
  materialId?: string | null
  /** Aberturas del muro (opcional en snapshots antiguos). */
  openings?: Opening[]
  /** Piso al que pertenece (opcional en snapshots antiguos → «Piso 0»). */
  levelId?: string
  /** Visibilidad individual (opcional; true por defecto). */
  visible?: boolean
}

export function wallToSnapshot(wall: Wall): WallSnapshot {
  return {
    id: wall.id,
    type: wall.type,
    start: wall.start.clone(),
    end: wall.end.clone(),
    height: wall.height,
    thickness: wall.thickness,
    color: wall.color,
    aiControlled: wall.aiControlled,
    materialId: wall.materialId,
    openings: wall.openings.map((o) => ({ ...o })),
    levelId: wall.levelId,
    visible: wall.visible
  }
}

export function wallFromSnapshot(snapshot: WallSnapshot): Wall {
  const wall = new Wall(snapshot.start.clone(), snapshot.end.clone(), snapshot.type, snapshot.id)
  wall.height = snapshot.height
  wall.thickness = snapshot.thickness
  wall.color = snapshot.color
  wall.aiControlled = snapshot.aiControlled
  wall.materialId = snapshot.materialId ?? null
  wall.openings = (snapshot.openings ?? []).map((o) => ({ ...o }))
  // Snapshots antiguos (proyectos pre-multiplanta) → «Piso 0».
  wall.levelId = snapshot.levelId ?? DEFAULT_LEVEL_ID
  wall.visible = snapshot.visible ?? true
  return wall
}
