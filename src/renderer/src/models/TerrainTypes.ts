export interface TerrainSpotElevation {
  id: string
  /** Coordenada X en el espacio de trabajo (metros). */
  x: number
  /** Coordenada Z en el espacio de trabajo (metros; equivale a -Y en planta CAD). */
  z: number
  /** Cota / elevación topográfica en metros (eje vertical Y en Three.js). */
  elevation: number
}

export interface TerrainGradingPad {
  id: string
  /** Polígono o rectángulo en coordenadas locales XZ respecto al centro del terreno (metros). */
  points: Array<{ x: number; z: number }>
  /** Cota de nivel objetivo en metros (ej. 0.00 o +2.50). */
  targetElevation: number
  /** Ancho de talud perimetral de transición suave en metros. */
  transitionMargin: number
}

export interface TerrainData {
  /** Columnas de la retícula topográfica (eje X). */
  cols: number
  /** Filas de la retícula topográfica (eje Z). */
  rows: number
  /** Ancho base del mapa en metros (eje X). */
  width: number
  /** Profundidad base del mapa en metros (eje Z). */
  depth: number
  /** Elevaciones actuales de los vértices (`cols * rows`) en metros. */
  heights: number[]
  /** Elevaciones originales antes de explanaciones, usadas para calcular corte y relleno. */
  originalHeights: number[]
  /** Elevación mínima actual (m). */
  minElev: number
  /** Elevación máxima actual (m). */
  maxElev: number
  /** Equidistancia vertical entre curvas de nivel visibles (m). */
  contourInterval: number
  /** Formato del archivo importado (`DXF`, `CSV`, `TXT`, `GeoJSON`, `Demo`). */
  sourceFormat?: string
  /** Cantidad de puntos topográficos originales procesados. */
  pointCount?: number
  /** Plataformas / explanaciones aplicadas sobre el terreno. */
  gradingPads?: TerrainGradingPad[]
  /** Volumen acumulado aproximado de corte / excavación (m³). */
  cutVolumeM3?: number
  /** Volumen acumulado aproximado de relleno / terraplén (m³). */
  fillVolumeM3?: number
  /** Cotas puntuales colocadas con la herramienta "Sacar Niveles / Cotas". */
  spotElevations?: TerrainSpotElevation[]
}

export function cloneTerrainData(data: TerrainData | null | undefined): TerrainData | null {
  if (!data) return null
  return {
    cols: data.cols,
    rows: data.rows,
    width: data.width,
    depth: data.depth,
    heights: [...data.heights],
    originalHeights: [...data.originalHeights],
    minElev: data.minElev,
    maxElev: data.maxElev,
    contourInterval: data.contourInterval,
    sourceFormat: data.sourceFormat,
    pointCount: data.pointCount,
    gradingPads: data.gradingPads
      ? data.gradingPads.map((pad) => ({
          id: pad.id,
          points: pad.points.map((p) => ({ x: p.x, z: p.z })),
          targetElevation: pad.targetElevation,
          transitionMargin: pad.transitionMargin
        }))
      : [],
    cutVolumeM3: data.cutVolumeM3 ?? 0,
    fillVolumeM3: data.fillVolumeM3 ?? 0,
    spotElevations: data.spotElevations
      ? data.spotElevations.map((s) => ({ ...s }))
      : []
  }
}

