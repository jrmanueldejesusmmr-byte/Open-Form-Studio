import type { WindowVariant } from '../engine/OpeningMeshBuilder'

/** Modelo de datos de una abertura (puerta o ventana) sobre un muro. */
export type OpeningType = 'door' | 'window'

export interface Opening {
  id: string
  wallId: string
  /** Metros desde el inicio del muro hasta el centro del hueco. */
  x: number
  /** Ancho del hueco en metros. */
  width: number
  /** Alto del hueco en metros. */
  height: number
  /** Antepecho: metros desde el suelo hasta el borde inferior del hueco. */
  sill: number
  type: OpeningType
  /** Material del catálogo aplicado a la hoja (mat.wood, mat.glass…). */
  materialId: string | null
}

/** Rol de parte por el que se asigna material después de construir el mesh. */
export type OpeningPartRole = 'frame' | 'leaf' | 'glass' | 'handle' | 'sill' | 'muntin'

/** Configuración de partes por variante de puerta. */
export interface DoorPartConfig {
  frameThickness: number
  leafThickness: number
  hasGlass: boolean
  hasHandle: boolean
  hasHinges: boolean
  sillRequired: boolean
}

/** Configuración de partes por variante de ventana. */
export interface WindowPartConfig {
  frameThickness: number
  glassThickness: number
  hasSill: boolean
  hasMuntins: boolean
  variant: WindowVariant
}

export type DoorSwing = 'left-in' | 'right-in' | 'left-out' | 'right-out'

export interface DoorVariantInfo {
  /** Nombre de la variante de puerta. */
  id: DoorVariant
  /** Ancho × alto por defecto. */
  defaultSize: [number, number]
  /** Label legible. */
  label: string
}

/** Variante de puerta (simple, doble, corrediza, garaje, vidrio, puerta-ventana). */
export type DoorVariant =
  | 'simple' | 'doble' | 'corrediza' | 'garaje' | 'vidrio' | 'puerta-ventana'

/** Variante completa de puerta con swinging. */
export interface DoorOpening extends Opening {
  /** Variante de puerta. */
  variant: DoorVariant
  /** Sentido de apertura (left-in, right-in, left-out, right-out). */
  swing: DoorSwing
  /** ID del material del marco (hoja vs estructura). */
  frameMaterialId: string | null
  /** Si la manilla debe mostrarse en la UI/inspector. */
  handleVisible: boolean
  /** Id material hoja (para puertas con marco separado). */
  leafMaterialId: string | null
  /** Rol de parte para asignación de material del marco. */
  framePartRole: OpeningPartRole
  /** Rol de parte para asignación de material de la hoja. */
  leafPartRole: OpeningPartRole
  /** Configuración de partes para esta variante. */
  partConfig: DoorPartConfig
}

export interface WindowOpening extends Opening {
  /** Rol de parte para asignación de material del marco. */
  framePartRole: OpeningPartRole
  /** Rol de parte para asignación de material del vidrio. */
  glassPartRole: OpeningPartRole
  /** Rol de parte para asignación de material del alféizar. */
  sillPartRole: OpeningPartRole
  /** Rol de parte para asignación de material de los travesaños. */
  muntinPartRole: OpeningPartRole
  /** Configuración de partes para esta variante. */
  partConfig: WindowPartConfig
}

/** Un Opening puede ser una puerta o una ventana. Usa discriminación por `variant`. */
export type DoorOrWindow = DoorOpening | WindowOpening

/** Información por defecto de cada variante de puerta. */
export const DOOR_VARIANTS: Record<DoorVariant, DoorVariantInfo> = {
  simple:   { id: 'simple',   defaultSize: [0.90, 2.10], label: 'Puerta simple' },
  doble:    { id: 'doble',    defaultSize: [1.80, 2.10], label: 'Puerta doble' },
  corrediza:{ id: 'corrediza',defaultSize: [0.90, 2.10], label: 'Puerta corrediza' },
  garaje:   { id: 'garaje',   defaultSize: [2.50, 2.20], label: 'Puerta de garaje' },
  vidrio:   { id: 'vidrio',   defaultSize: [0.90, 2.10], label: 'Puerta de vidrio' },
  'puerta-ventana': { id: 'puerta-ventana', defaultSize: [0.80, 2.10], label: 'Puerta-ventana' }
} as const
