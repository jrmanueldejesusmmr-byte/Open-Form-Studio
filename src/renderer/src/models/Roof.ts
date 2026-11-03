/**
 * Modelo del techo ajustado a la vivienda («el techo se adapta a la casa»).
 *
 * Al elegir un tipo de techo se traza el contorno de los muros del piso
 * superiores y se genera una geometría a medida con voladizo y pendiente
 * configurables. `RoofProps` vive en el `SceneObject` (junto a `shapeId`,
 * que conserva el tipo para los techos antiguos de tamaño fijo).
 */

/** Tipo de techo del catálogo existente. */
export type RoofType = 'gable' | 'hip' | 'shed' | 'flat' | 'mansard' | 'sawtooth'

/** Voladizo por defecto (m) más allá del filo de muro. */
export const DEFAULT_ROOF_OVERHANG = 0.3

/** Pendiente por defecto (grados desde la horizontal). */
export const DEFAULT_ROOF_SLOPE = 30

/** Espesor por defecto de la losa de cubierta (m). */
export const DEFAULT_ROOF_THICKNESS = 0.15

/** Snap de dibujo manual del techo (m). */
export const ROOF_SNAP_STEP = 0.5

/**
 * Propiedades del techo ajustado. `footprint` guarda el contorno **de muros**
 * (sin voladizo) en coordenadas mundo XZ: el voladizo se recalcula al
 * reconstruir la geometría, de modo que cambiarlo no deforma la huella.
 */
export interface RoofProps {
  type: RoofType
  /** Pendiente de la vertiente, en grados. */
  slope: number
  /** Voladizo (m) fuera del filo de muro. */
  overhang: number
  /** Espesor de la losa de cubierta (m). */
  thickness: number
  /** Dirección de la caballete: 'x' = este–oeste, 'z' = norte–sur. */
  ridgeDir: 'x' | 'z'
  /** Contorno cerrado de los muros del piso superior (mundo XZ). */
  footprint: Array<{ x: number; z: number }>
  /** Piso cuyos muros formaron la huella (de él sale la cota del alero). */
  sourceLevelId: string
}

const SHAPE_TO_TYPE: Readonly<Record<string, RoofType>> = {
  'roof.gable': 'gable',
  'roof.hip': 'hip',
  'roof.shed': 'shed',
  'roof.flat': 'flat',
  'roof.mansard': 'mansard',
  'roof.sawtooth': 'sawtooth'
}

const TYPE_TO_SHAPE: Readonly<Record<RoofType, string>> = {
  gable: 'roof.gable',
  hip: 'roof.hip',
  shed: 'roof.shed',
  flat: 'roof.flat',
  mansard: 'roof.mansard',
  sawtooth: 'roof.sawtooth'
}

const TYPE_LABELS: Readonly<Record<RoofType, string>> = {
  gable: 'A dos aguas',
  hip: 'A cuatro aguas',
  shed: 'A un agua',
  flat: 'Plana / terraza',
  mansard: 'Mansarda',
  sawtooth: 'Diente de sierra'
}

/** Tipos del catálogo (`roof.*`) → tipo interno, o `null` si no es un techo. */
export function roofTypeFromShapeId(shapeId: string | null | undefined): RoofType | null {
  if (!shapeId) return null
  return SHAPE_TO_TYPE[shapeId] ?? null
}

/** `shapeId` del catálogo para un tipo (mantiene la compatibilidad antigua). */
export function roofShapeId(type: RoofType): string {
  return TYPE_TO_SHAPE[type]
}

export function roofTypeLabel(type: RoofType): string {
  return TYPE_LABELS[type]
}

/** Opciones para el selector «Tipo» del panel de propiedades. */
export function roofTypeOptions(): ReadonlyArray<{ value: RoofType; label: string }> {
  return (Object.keys(TYPE_LABELS) as RoofType[]).map((value) => ({ value, label: TYPE_LABELS[value] }))
}

/**
 * Normaliza props leídas de disco tolerando datos corruptos o de otras
 * versiones. Devuelve `null` si no hay nada aprovechable.
 */
export function normalizeRoofProps(data: unknown): RoofProps | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Partial<RoofProps>
  const type = raw.type && raw.type in TYPE_TO_SHAPE ? raw.type : null
  if (!type) return null
  if (!Array.isArray(raw.footprint) || raw.footprint.length < 3) return null

  const footprint: Array<{ x: number; z: number }> = []
  for (const point of raw.footprint) {
    if (!point || typeof point !== 'object') return null
    const p = point as { x?: unknown; z?: unknown }
    const x = Number(p.x)
    const z = Number(p.z)
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null
    footprint.push({ x, z })
  }

  const slope = Number(raw.slope)
  const overhang = Number(raw.overhang)
  const thickness = Number(raw.thickness)
  return {
    type,
    slope: Number.isFinite(slope) && slope > 0 && slope < 90 ? slope : DEFAULT_ROOF_SLOPE,
    overhang: Number.isFinite(overhang) && overhang >= 0 && overhang < 10 ? overhang : DEFAULT_ROOF_OVERHANG,
    thickness: Number.isFinite(thickness) && thickness > 0 && thickness <= 1 ? thickness : DEFAULT_ROOF_THICKNESS,
    ridgeDir: raw.ridgeDir === 'z' ? 'z' : 'x',
    footprint,
    sourceLevelId: typeof raw.sourceLevelId === 'string' && raw.sourceLevelId ? raw.sourceLevelId : 'level-0'
  }
}
