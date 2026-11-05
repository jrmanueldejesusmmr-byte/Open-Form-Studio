import type * as THREE from 'three'

export type BimDiscipline = 'Arquitectura' | 'Estructura' | 'Eléctrica' | 'Topografía' | 'Entorno'

export type BimElementType =
  | 'Muro'
  | 'Losa'
  | 'Columna'
  | 'Viga'
  | 'Techo'
  | 'Terreno'
  | 'Tubería'
  | 'Circuito'
  | 'Dispositivo'
  | 'Abertura'
  | 'Puerta'
  | 'Ventana'
  | 'Mobiliario'
  | 'Sanitario'
  | 'Cocina'
  | 'Oficina'
  | 'Vehículo'
  | 'Vegetación'
  | 'Escala Humana'

export interface MaterialQuantityItem {
  label: string
  amount: number
  unit: string
}

export interface BimMaterialBreakdown {
  primary: string
  items: MaterialQuantityItem[]
}

export interface BimRow {
  id: string
  discipline: BimDiscipline
  category: BimElementType
  name: string
  material: string
  height: number // m
  thickness: number // m
  length: number // m
  baseLevel: string
  levelId: string
  x: number // m
  y: number // elevation m (N.B.T)
  z: number // m
  netArea: number // m²
  netVolume: number // m³
  materialCountSummary: string
  materialBreakdown: BimMaterialBreakdown
  rawType: 'wall' | 'object' | 'wire' | 'device' | 'opening'
  rawId: string
  clippedVolume: number // Deducted volume from overlapping slabs/beams (Zero-Trash)
  warnings: string[]

  // Campos Financieros y Cuantificación de Obra
  unit: string // 'm²', 'm³', 'm', 'pza'
  billableQty: number // Cantidad base para cálculo (ej. m² muros, m³ concreto, m cable, pza aberturas/muebles)
  unitPrice: number // Precio unitario ($ USD) editable en vivo
  subtotalCost: number // billableQty * unitPrice ($ USD)
}

export interface BimTotals {
  elementCount: number
  wallCount: number
  wallLengthTotal: number
  wallLinearLength: number // Alias para compatibilidad
  wallNetAreaTotal: number
  wallNetVolumeTotal: number
  builtAreaTotal: number // Área construida neta estimada (m²)
  doorCountTotal: number
  windowCountTotal: number
  openingsCountTotal: number // Puertas + Ventanas
  furnitureCountTotal: number // Muebles + Sanitarios + Equipos
  // Presupuesto financiero total ($ USD)
  totalBudgetCost: number
  // Brick / Block
  blocksCountTotal: number
  mortarVolumeTotal: number
  wallCementSacksTotal: number
  // Concrete Structure
  concreteVolumeTotal: number
  concreteCementSacksTotal: number
  sandVolumeTotal: number
  gravelVolumeTotal: number
  waterLitersTotal: number
  rebarSteelKgTotal: number
  // MEP
  conduitMetersTotal: number
  wireConductorMetersTotal: number
  devicesCountTotal: number
  // Sanitization
  clippedOverlapsCount: number
  clashesCount: number
  trashLinesPurged: number
}

export interface ClashReport {
  id: string
  wireId: string
  structuralId: string
  wireLabel: string
  structuralLabel: string
  clashPoint: { x: number; y: number; z: number }
  description: string
  severity: 'critical' | 'warning'
}

export interface SanitizationResult {
  purgedDegenerateWalls: number
  mergedDuplicateWalls: number
  clippedIntersections: number
  activeClashes: ClashReport[]
  messages: string[]
}
