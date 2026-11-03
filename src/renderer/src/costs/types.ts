/** Módulo de costos / cotización (Fase 5). Cálculo puro, sin DOM, sin Three.js.
 *
 * Separación de responsabilidades:
 * - `takeoff.ts`   : lectura del modelo 3D -> cantidades físicas (m, m2, m3, unidades).
 * - `quote.ts`     : tarifas -> líneas de coste y total (fórmula cerrada, sin I/O).
 * - `Panel.ts`     : panel DOM + conexión con `SceneManager` (se actualiza en vivo).
 * - `ParamsEditor` : formulario de parámetros persistentes (localStorage / SQLite).
 */
export type CostMode = 'simple' | 'detailed'

export interface CostParams {
  wastagePct: number
  labourMultiplier: number
  contingencyPct: number
  taxPct: number
  currencySymbol: string
  roundTo: number
  units: string
}

export interface CostPrices {
  [category: string]: number
}

export interface CostLine {
  id: string
  category: string
  name: string
  qty: number
  unit: string
  unitPrice: number
  subtotal: number
  highlighted: boolean
}

export interface CostQuote {
  items: CostLine[]
  subtotal: number
  total: number
  base: number
  date: string
  params: CostParams
  prices: CostPrices
}

export interface CostGroup {
  category: string
  label: string
  qty: number
  unit: string
  subtotal: number
}

export interface CostSelection {
  lines: string[]
  walls?: string[]
}

export interface CostState {
  selection: CostSelection
}

/** Elemento individual que aparece en la vista detalle: un muro, una puerta,
 * una ventana o un mueble, con sus medidas y los ids que lo identifican para
 * resaltarlo en 3D. */
export interface CostDetailItem {
  id: string
  /** 'muro' | 'puerta' | 'ventana' | 'mueble' */
  kind: string
  label: string
  levelId: string
  levelName: string
  /** Medidas físicas (solo útiles para muros y objetos) */
  length?: number
  height?: number
  thickness?: number
  grossArea?: number
  netArea?: number
  volume?: number
  width?: number
  depth?: number
  material?: string
  /** Ids para resaltar en 3D (muro u objeto) */
  ids: string[]
  /** Estado de expansión para la vista detalle. */
  isOpen?: boolean
}

/** Totales siempre visibles, arriba del panel. */
export interface CostTotals {
  wallLinearLength: number
  builtArea: number
  doorCount: number
  windowCount: number
  furnitureCount: number
  total: number
}

export const SCALE_GRID_BOX_TO_METERS = 1

export type PhysicalUnit =
  | 'm'
  | 'm2'
  | 'm3'
  | 'unit'
  | 'lets'

export interface WallMeasurement {
  id: string
  levelId: string
  length: number
  height: number
  thickness: number
  grossArea: number
  netArea: number
  volume: number
  doorArea: number
  windowArea: number
}

export interface FloorQuantity {
  levelId: string
  name: string
  qty: number
  unit: string
}

export interface QuantityByKind {
  kind: string
  qty: number
}

export interface PhysicalQuantities {
  walls: WallMeasurement[]
  slabs: FloorQuantity[]
  roofs: FloorQuantity[]
  doors: QuantityByKind[]
  windows: QuantityByKind[]
  objects: QuantityByKind[]
}
