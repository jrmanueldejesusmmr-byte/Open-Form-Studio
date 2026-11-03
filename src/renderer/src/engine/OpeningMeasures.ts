import type { Opening } from '../models/Opening'

export interface OpeningMeasures {
  grossArea: number
  openingsArea: number
  netArea: number
  volume: number
  doorArea: number
  windowArea: number
}

/**
 * Cálculo puro de áreas y volumen neto de un muro con aberturas.
 * Sin DOM ni Three.js (cero imports en runtime): solo aritmética, para probar en Node.
 *
 * - `grossArea`  = largo × alto (área bruta del muro).
 * - `openingsArea` = suma de ancho × alto de cada abertura.
 * - `netArea`    = grossArea − openingsArea (acotada a 0).
 * - `volume`     = netArea × grosor (se descuenta el prisma de cada hueco).
 * - `doorArea` / `windowArea`: desglose por tipo.
 */
export function wallOpeningMeasures(
  length: number,
  height: number,
  thickness: number,
  openings: ReadonlyArray<Pick<Opening, 'width' | 'height' | 'type'>>
): OpeningMeasures {
  const grossArea = length * height
  let doorArea = 0
  let windowArea = 0
  for (const o of openings) {
    const area = o.width * o.height
    if (o.type === 'door') doorArea += area
    else windowArea += area
  }
  const openingsArea = doorArea + windowArea
  const netArea = Math.max(0, grossArea - openingsArea)
  const volume = Math.max(0, netArea * thickness)
  return { grossArea, openingsArea, netArea, volume, doorArea, windowArea }
}
