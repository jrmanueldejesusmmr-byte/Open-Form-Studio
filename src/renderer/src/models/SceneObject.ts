import * as THREE from 'three'
import { DEFAULT_LEVEL_ID } from './Level'
import type { DoorStyle, WindowStyle, SwingHand, SwingDirection } from './Opening'
import type { RoofProps } from './Roof'
import type { StructuralParams } from './StructuralTypes'
import { cloneTerrainData, type TerrainData } from './TerrainTypes'

export type { StructuralParams, StructuralMaterialType } from './StructuralTypes'
export type { TerrainData, TerrainGradingPad, TerrainSpotElevation } from './TerrainTypes'

let nextObjectId = 1

/** Familia del objeto; coincide con `CatalogItem['kind']` del panel de herramientas. */
export type SceneObjectKind = 'furniture' | 'shape' | 'roof' | 'material' | 'modifier'

/** Tamaño por defecto (ancho × alto × fondo, en metros) según la familia. */
export function defaultSizeFor(kind: SceneObjectKind): THREE.Vector3 {
  switch (kind) {
    case 'roof':
      return new THREE.Vector3(2, 0.4, 2)
    case 'shape':
      return new THREE.Vector3(1.2, 1.2, 0.2)
    case 'material':
      return new THREE.Vector3(0.6, 0.6, 0.6)
    default:
      return new THREE.Vector3(1, 1, 1)
  }
}

/**
 * Elemento colocado sobre el lienzo (mobiliario, forma, cubierta…). Es un objeto
 * de datos puro, igual que `Wall`: el motor lo traduce a una caja orientada
 * (`engine/WallMeshBuilder`) y el `SceneManager` es su fuente única de verdad.
 */
export class SceneObject {
  readonly id: string = `obj-${nextObjectId++}`

  position = new THREE.Vector3(0, 0, 0)
  rotationY = 0
  /** Dimensiones de la caja: x = ancho, y = alto, z = fondo. */
  size: THREE.Vector3
  color = 0x9aa4b2
  /**
   * Id del catálogo que dio forma a este objeto (`shape.l`, `furn.chair`,
   * `roof.gable`…). `null` en los proyectos guardados antes de la Fase 2: el
   * motor entonces dibuja la caja histórica, así que la compatibilidad con
   * escenas existentes no se rompe.
   */
  shapeId: string | null = null
  /** Id de material del catálogo (`mat.brick`, `mat.wood`…). Opcional. */
  materialId: string | null = null
  /**
   * Piso (nivel) al que pertenece el objeto. «Piso 0» (`level-0`) por defecto:
   * los proyectos guardados antes de la multiplanta migran aquí.
   */
  levelId: string = DEFAULT_LEVEL_ID
  /**
   * Props del techo ajustado a la vivienda (huella + pendiente + voladizo).
   * `null` en los techos antiguos de tamaño fijo: entonces la malla sale del
   * `shapeId` de siempre (compatibilidad con proyectos existentes).
   */
  roofProps: RoofProps | null = null
  /**
   * Capa del dibujo (p. ej. «importado» para modelos GLB/OBJ traídos de
   * fuera). `undefined` = capa por defecto del objeto. Se usa para excluir
   * objetos del panel de Costos.
   */
  layer: string | undefined
  /**
   * Si el objeto cuenta en el panel de Costos. Los modelos importados entran
   * con `false` salvo que el usuario lo marque al importar.
   */
  includeInCosts = true
  /**
   * Geometría real importada (GLB/OBJ). Cuando está presente, el render la
   * usa en lugar de la caja por defecto. No viaja en el snapshot (no es
   * serializable); tras un deshacer/rehacer el objeto se reconstruye como caja.
   */
  importedGeometry: THREE.BufferGeometry | null = null
  /**
   * Material importado del modelo 3D (GLB/glTF u OBJ+MTL). Cuando está
   * presente y no hay `materialId` de catálogo asignado, se emplea al renderizar.
   */
  importedMaterial: THREE.Material | null = null
  /**
   * Variante de abertura (`simple`, `doble`, `corrediza`, `vidrio`…). `null` si el objeto no es una abertura.
   */
  openingVariant: string | null = null
  /** Id de la abertura en el muro a la que pertenece este objeto (null si no aplica). */
  openingId: string | null = null
  /**
   * Ángulo de apertura de la hoja en grados (0 = cerrada, 90 = abierta).
   */
  openingAngle: number = 0
  /** Estilo de diseño arquitectónico 3D para puertas ('lisa', '6paneles', 'conVisor'...). */
  doorStyle: DoorStyle | null = null
  /** Estilo de diseño arquitectónico 3D para ventanas ('corrediza2', 'pisoTecho', 'colonial'...). */
  windowStyle: WindowStyle | null = null
  /** Mano de la bisagra (izquierda / derecha). */
  swingHand: SwingHand = 'left'
  /** Sentido de apertura (interior / exterior). */
  swingDirection: SwingDirection = 'in'
  /** Material del catálogo para la hoja de la puerta (mat.wood, mat.glass...). */
  leafMaterialId: string | null = null
  /** Material del catálogo para el marco de la puerta. */
  frameMaterialId: string | null = null
  /** Si la manilla debe mostrarse en la UI/inspector. */
  handleVisible: boolean = false
  /** Visibilidad individual del objeto (animable desde la línea de tiempo). */
  visible: boolean = true
  /** Parámetros dinámicos de sistemas estructurales y formas 3D (`struct.*` / `geo.*`). */
  structuralParams: StructuralParams | null = null
  /** Datos topográficos 3D cuando el objeto representa un terreno (`topo.terrain`). */
  terrainData: TerrainData | null = null
  isSelected = false

  constructor(
    public name: string,
    public kind: SceneObjectKind = 'furniture',
    id?: string
  ) {
    if (id) this.id = id
    this.size = defaultSizeFor(kind)
  }
}

/** Instantánea inmutable de un objeto (historial y persistencia). */
export interface SceneObjectSnapshot {
  id: string
  kind: SceneObjectKind
  name: string
  position: { x: number; y: number; z: number }
  rotationY: number
  size: { width: number; height: number; depth: number }
  color: number
  /** Id del catálogo (`shape.l`, `furn.chair`…); opcional para proyectos antiguos. */
  shapeId?: string | null
  /** Id de material del catálogo (`mat.brick`…); opcional. */
  materialId?: string | null
  /** Piso al que pertenece (opcional en snapshots antiguos → «Piso 0»). */
  levelId?: string
  /** Props del techo ajustado (opcional; ausente en snapshots antiguos). */
  roofProps?: RoofProps | null
  /** Capa del dibujo (p. ej. «importado»); opcional. */
  layer?: string
  /** Si el objeto cuenta en el panel de Costos (por defecto true). */
  includeInCosts?: boolean
  /** Variante de abertura (opcional). */
  openingVariant?: string | null
  /** Id de la abertura en el muro (opcional). */
  openingId?: string | null
  /** Ángulo de apertura de la hoja en grados (opcional). */
  openingAngle?: number
  /** Estilo de puerta arquitectónica (opcional). */
  doorStyle?: DoorStyle | null
  /** Estilo de ventana arquitectónica (opcional). */
  windowStyle?: WindowStyle | null
  /** Mano de bisagra (opcional). */
  swingHand?: SwingHand
  /** Sentido de apertura (opcional). */
  swingDirection?: SwingDirection
  /** Material de hoja (opcional). */
  leafMaterialId?: string | null
  /** Material de marco (opcional). */
  frameMaterialId?: string | null
  /** Visibilidad de manilla (opcional). */
  handleVisible?: boolean
  /** Visibilidad individual (opcional; true por defecto). */
  visible?: boolean
  /** Parámetros estructurales paramétricos (opcional). */
  structuralParams?: StructuralParams | null
  /** Malla y metadatos de terreno topográfico (opcional). */
  terrainData?: TerrainData | null
}

export function objectToSnapshot(object: SceneObject): SceneObjectSnapshot {
  return {
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
    layer: object.layer,
    includeInCosts: object.includeInCosts,
    openingVariant: object.openingVariant,
    openingId: object.openingId,
    openingAngle: object.openingAngle,
    doorStyle: object.doorStyle,
    windowStyle: object.windowStyle,
    swingHand: object.swingHand,
    swingDirection: object.swingDirection,
    leafMaterialId: object.leafMaterialId,
    frameMaterialId: object.frameMaterialId,
    handleVisible: object.handleVisible,
    visible: object.visible,
    structuralParams: object.structuralParams ? { ...object.structuralParams } : null,
    terrainData: cloneTerrainData(object.terrainData)
  }
}

export function objectFromSnapshot(snapshot: SceneObjectSnapshot): SceneObject {
  const object = new SceneObject(snapshot.name, snapshot.kind, snapshot.id)
  object.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z)
  object.rotationY = snapshot.rotationY
  object.size.set(snapshot.size.width, snapshot.size.height, snapshot.size.depth)
  object.color = snapshot.color
  // Proyectos guardados antes de la Fase 2: sin shapeId → caja histórica.
  object.shapeId = snapshot.shapeId ?? null
  object.materialId = snapshot.materialId ?? null
  // Snapshots antiguos (proyectos pre-multiplanta) → «Piso 0».
  object.levelId = snapshot.levelId ?? DEFAULT_LEVEL_ID
  object.roofProps = snapshot.roofProps ?? null
  object.layer = snapshot.layer
  object.includeInCosts = snapshot.includeInCosts ?? true
  object.openingVariant = snapshot.openingVariant ?? null
  object.openingId = snapshot.openingId ?? null
  object.openingAngle = snapshot.openingAngle ?? 0
  object.doorStyle = snapshot.doorStyle ?? null
  object.windowStyle = snapshot.windowStyle ?? null
  object.swingHand = snapshot.swingHand ?? 'left'
  object.swingDirection = snapshot.swingDirection ?? 'in'
  object.leafMaterialId = snapshot.leafMaterialId ?? null
  object.frameMaterialId = snapshot.frameMaterialId ?? null
  object.handleVisible = snapshot.handleVisible ?? false
  object.visible = snapshot.visible ?? true
  object.structuralParams = snapshot.structuralParams ? { ...snapshot.structuralParams } : null
  object.terrainData = cloneTerrainData(snapshot.terrainData)
  return object
}