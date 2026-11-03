import * as assert from 'node:assert'
import { wallOpeningMeasures, type OpeningMeasures } from './OpeningMeasures'
import type { Opening } from '../models/Opening'

const approx = (a: number, b: number, tol = 1e-9): void => {
  assert.ok(Math.abs(a - b) <= tol, `esperado ≈ ${b}, obtuvo ${a}`)
}

const puerta: Opening = { id: 'o1', wallId: 'w1', x: 2.5, width: 0.9, height: 2.1, sill: 0, type: 'door', materialId: 'mat.wood' }
const ventana: Opening = { id: 'o2', wallId: 'w1', x: 3.0, width: 1.2, height: 1.0, sill: 0.9, type: 'window', materialId: 'mat.glass' }

function checkCase(label: string, length: number, height: number, thickness: number, openings: ReadonlyArray<Opening>, expected: Partial<OpeningMeasures>): void {
  const m = wallOpeningMeasures(length, height, thickness, openings)
  if (expected.grossArea !== undefined) approx(m.grossArea, expected.grossArea)
  if (expected.doorArea !== undefined) approx(m.doorArea, expected.doorArea)
  if (expected.windowArea !== undefined) approx(m.windowArea, expected.windowArea)
  if (expected.openingsArea !== undefined) approx(m.openingsArea, expected.openingsArea)
  if (expected.netArea !== undefined) approx(m.netArea, expected.netArea)
  if (expected.volume !== undefined) approx(m.volume, expected.volume)
  console.log(`OK ${label}: gross=${m.grossArea} net=${m.netArea} vol=${m.volume} door=${m.doorArea} window=${m.windowArea}`)
}

// Muro 5 × 2.5 × 0.15 con una puerta 0.9 × 2.1.
// Bruta = 12.5 m²; puerta = 1.89 m²; neta = 10.61 m²; volumen = 10.61 × 0.15 = 1.5915 m³.
checkCase('muro 5x2.5x0.15 + puerta 0.9x2.1', 5, 2.5, 0.15, [puerta], {
  grossArea: 12.5,
  doorArea: 1.89,
  windowArea: 0,
  openingsArea: 1.89,
  netArea: 10.61,
  volume: 1.5915
})

// Muro 5 × 2.5 × 0.15 con puerta 0.9×2.1 + ventana 1.2×1.0.
// Neta = 12.5 − 1.89 − 1.20 = 9.41 m²; volumen = 9.41 × 0.15 = 1.4115 m³.
checkCase('muro 5x2.5x0.15 + puerta + ventana 1.2x1.0', 5, 2.5, 0.15, [puerta, ventana], {
  grossArea: 12.5,
  doorArea: 1.89,
  windowArea: 1.2,
  openingsArea: 3.09,
  netArea: 9.41,
  volume: 1.4115
})

// Sin aberturas: neta = bruta, volumen = bruto.
checkCase('muro 5x2.5x0.15 sin aberturas', 5, 2.5, 0.15, [], {
  grossArea: 12.5,
  openingsArea: 0,
  netArea: 12.5,
  volume: 1.875
})

// Hueco mayor que el muro: neta y volumen acotados a 0.
checkCase('hueco mayor que el muro (acotado a 0)', 2, 2, 0.2, [{ id: 'o', wallId: 'w', x: 1, width: 3, height: 3, sill: 0, type: 'door', materialId: null }], {
  grossArea: 4,
  openingsArea: 9,
  netArea: 0,
  volume: 0
})

console.log('TODAS LAS PRUEBAS PURAS PASARON')
