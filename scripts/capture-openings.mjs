/** capture-openings.mjs — verifica (sin DOM) las medidas puras del muro con huecos reales.
 *  Ejecutar:  node --experimental-strip-types scripts/capture-openings.mjs
 */
import { assert } from 'node:console'
import { wallOpeningMeasures } from '../src/renderer/src/engine/OpeningMeasures.ts'

const approx = (a, b, tol = 1e-9) => {
  if (Math.abs(a - b) > tol) throw new Error(`esperado ≈ ${b}, obtuvo ${a}`)
  console.log(`OK  valor ${a} ≈ esperado ${b}`)
}

const puerta = { width: 0.9, height: 2.1, type: 'door' }
const ventana = { width: 1.2, height: 1.0, type: 'window' }

// Muro 5 × 2.5 × 0.15 con una puerta 0.9 × 2.1.
// Bruta = 12.5 m²; neta = 10.61 m²; volumen = 1.5915 m³ (~1.59 m³).
const m1 = wallOpeningMeasures(5, 2.5, 0.15, [puerta])
console.log('Caso 1 (muro 5x2.5x0.15 + puerta 0.9x2.1):')
console.log(`  bruta   = ${m1.grossArea} m² (esperada 12.5)`)
console.log(`  neta    = ${m1.netArea} m² (esperada 10.61)`)
console.log(`  volumen = ${m1.volume} m³ (esperado ~1.59)`)
approx(m1.grossArea, 12.5)
approx(m1.netArea, 10.61)
approx(m1.volume, 1.5915)

// Con puerta + ventana 1.2 × 1.0.
// Neta = 12.5 − 1.89 − 1.20 = 9.41 m²; volumen = 9.41 × 0.15 = 1.4115 m³.
const m2 = wallOpeningMeasures(5, 2.5, 0.15, [puerta, ventana])
console.log('Caso 2 (muro 5x2.5x0.15 + puerta + ventana 1.2x1.0):')
console.log(`  bruta   = ${m2.grossArea} m² (esperada 12.5)`)
console.log(`  neta    = ${m2.netArea} m² (esperada 9.41)`)
console.log(`  volumen = ${m2.volume} m³ (esperado 1.4115)`)
approx(m2.grossArea, 12.5)
approx(m2.netArea, 9.41)
approx(m2.volume, 1.4115)

console.log('CAPTURA DE ABERTURAS: valores verificados contra el cálculo a mano.')
