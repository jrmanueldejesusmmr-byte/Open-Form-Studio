import type { WindowVariant } from '../engine/OpeningMeshBuilder'

/** Modelo de datos de una abertura (puerta o ventana) sobre un muro. */
export type OpeningType = 'door' | 'window'

export type SwingHand = 'left' | 'right'
export type SwingDirection = 'in' | 'out'

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
  /** Estilo arquitectónico (ej. 'lisa', '6paneles', 'corrediza2'...). */
  style?: string | null
  /** Mano de la bisagra (izquierda / derecha). */
  swingHand?: SwingHand
  /** Dirección del giro (interior / exterior). */
  swingDirection?: SwingDirection
  /** Ángulo de apertura en grados (0 cerrado, 90 abierto). */
  openingAngle?: number
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

/** Estilos arquitectónicos de diseño para puertas 3D y alzados. */
export type DoorStyle =
  | 'lisa'
  | '6paneles'
  | 'conVisor'
  | 'francesa'
  | 'dobleHoja'
  | 'celosia'

export const DOOR_STYLES: { id: DoorStyle; label: string; description: string }[] = [
  { id: 'lisa', label: 'Lisa Moderna', description: 'Hoja lisa minimalista con tirador contemporáneo' },
  { id: '6paneles', label: '6 Paneles Clásica', description: 'Diseño tradicional con plafones y molduras' },
  { id: 'conVisor', label: 'Con Visor / Mirilla', description: 'Visor vertical de cristal templado' },
  { id: 'francesa', label: 'Cuadrícula Vidrio (Francesa)', description: 'Muntins decorativos y paneles de vidrio' },
  { id: 'dobleHoja', label: 'Doble Hoja Principal', description: 'Dos hojas simétricas para acceso de gala' },
  { id: 'celosia', label: 'Reja / Celosía en X', description: 'Seguridad y ventilación con celosía cruzada' }
]

/** Estilos arquitectónicos de diseño para ventanas 3D y alzados. */
export type WindowStyle =
  | 'corrediza2'
  | 'pisoTecho'
  | 'colonial'
  | 'abatibleDoble'
  | 'altaBano'

export const WINDOW_STYLES: { id: WindowStyle; label: string; description: string }[] = [
  { id: 'corrediza2', label: 'Corrediza 2 Hojas Aluminio', description: 'Dos hojas corredizas con perfil de aluminio' },
  { id: 'pisoTecho', label: 'Ventanal de Piso a Techo', description: 'Gran paño acristalado de suelo a forjado' },
  { id: 'colonial', label: 'Cuadrícula Colonial', description: 'Cuadrícula tradicional con vidrios repartidos' },
  { id: 'abatibleDoble', label: 'Abatible Doble', description: 'Doble hoja con apertura batiente' },
  { id: 'altaBano', label: 'Ventana Alta de Baño', description: 'Ventana superior para privacidad y ventilación (antepecho 1.60m)' }
]

export interface StandardDimensionPreset {
  id: string
  label: string
  category: 'door-simple' | 'door-double' | 'window'
  width: number
  height: number
  sill: number
  description: string
}

/** Medidas estándar arquitectónicas para puertas (módulos normalizados). */
export const ARCHITECTURAL_DOOR_PRESETS: StandardDimensionPreset[] = [
  { id: 'door-0.65', label: '0.65m Baño', category: 'door-simple', width: 0.65, height: 2.10, sill: 0, description: 'Baño / Medio baño' },
  { id: 'door-0.75', label: '0.75m Cocina', category: 'door-simple', width: 0.75, height: 2.10, sill: 0, description: 'Recámara secundaria / Cocina' },
  { id: 'door-0.85', label: '0.85m Recámara', category: 'door-simple', width: 0.85, height: 2.10, sill: 0, description: 'Recámara principal' },
  { id: 'door-0.90', label: '0.90m Accesible', category: 'door-simple', width: 0.90, height: 2.10, sill: 0, description: 'Acceso / Puerta estándar accesible' },
  { id: 'door-1.00', label: '1.00m Principal', category: 'door-simple', width: 1.00, height: 2.10, sill: 0, description: 'Entrada principal amplia' },
  { id: 'door-1.20', label: '1.20m Pivote', category: 'door-simple', width: 1.20, height: 2.40, sill: 0, description: 'Puerta de pivote / Gran formato' },
  { id: 'door-double-1.40', label: '1.40m Doble', category: 'door-double', width: 1.40, height: 2.10, sill: 0, description: 'Puerta doble compacta' },
  { id: 'door-double-1.60', label: '1.60m Doble', category: 'door-double', width: 1.60, height: 2.10, sill: 0, description: 'Puerta doble estándar' },
  { id: 'door-double-1.80', label: '1.80m Doble', category: 'door-double', width: 1.80, height: 2.10, sill: 0, description: 'Puerta doble amplia' },
  { id: 'door-double-2.00', label: '2.00m Doble', category: 'door-double', width: 2.00, height: 2.20, sill: 0, description: 'Puerta doble señorial' },
  { id: 'door-double-2.40', label: '2.40m Doble', category: 'door-double', width: 2.40, height: 2.40, sill: 0, description: 'Puerta doble monumental' }
]

/** Medidas estándar arquitectónicas para ventanas. */
export const ARCHITECTURAL_WINDOW_PRESETS: StandardDimensionPreset[] = [
  { id: 'win-0.60', label: '0.60m Estrecha', category: 'window', width: 0.60, height: 1.20, sill: 0.90, description: 'Ventana estrecha / Baño' },
  { id: 'win-1.00', label: '1.00m Media', category: 'window', width: 1.00, height: 1.20, sill: 0.90, description: 'Ventana mediana 1.00m' },
  { id: 'win-1.20', label: '1.20m Estándar', category: 'window', width: 1.20, height: 1.20, sill: 0.90, description: 'Ventana estándar de recámara' },
  { id: 'win-1.50', label: '1.50m Amplia', category: 'window', width: 1.50, height: 1.20, sill: 0.90, description: 'Ventana amplia sala / comedor' },
  { id: 'win-2.00', label: '2.00m Ventanal', category: 'window', width: 2.00, height: 1.20, sill: 0.90, description: 'Ventanal horizontal 2.00m' },
  { id: 'win-bano-1.60', label: 'Baño (Antep. 1.60m)', category: 'window', width: 0.80, height: 0.50, sill: 1.60, description: 'Ventana alta de baño (antep. 1.60m)' },
  { id: 'win-balcon-0.00', label: 'Piso a Techo (0.00m)', category: 'window', width: 1.80, height: 2.40, sill: 0.00, description: 'Ventanal de piso a techo / balcón' }
]

export const SILL_PRESETS = [
  { label: '0.90m (Normal)', value: 0.90 },
  { label: '1.60m (Baño)', value: 1.60 },
  { label: '0.00m (Balcón / Piso a Techo)', value: 0.00 }
]
