import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import { SceneObject } from '../models/SceneObject'
import { WallSegmentType } from '../models/Wall'
import { buildRows, finalize } from './rows'
import type { CostParams, CostPrices } from './types'

let failed = 0

function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name} ${extra ?? ''}`)
  }
}

const params: CostParams = {
  wastagePct: 0,
  labourMultiplier: 0,
  contingencyPct: 0,
  taxPct: 0,
  currencySymbol: '$',
  roundTo: 0,
  units: 'm2'
}

/** Escena con un muro 5×2.5×0.15 en «Piso 0» (sin aperturas). */
function sceneOneWall(): SceneManager {
  const scene = new SceneManager()
  const wall = scene.addWall(
    WallSegmentType.SimpleWall,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5, 0, 0)
  )
  wall.height = 2.5
  wall.thickness = 0.15
  return scene
}

// Muros: 12.5 m² × 50 = 625 (neto = bruto sin aperturas). Total sin % = 625.
{
  const scene = sceneOneWall()
  const prices: CostPrices = { muros: 50 }
  const r = buildRows(scene, prices, params)
  const wallRow = r.rows.find((row) => row.category === 'muros')
  check('muros qty 12.5', !!wallRow && Math.abs(wallRow.qty - 12.5) < 1e-9, String(wallRow?.qty))
  check('muros subtotal 625', !!wallRow && Math.abs(wallRow.subtotal - 625) < 1e-9, String(wallRow?.subtotal))
  check('muros trae wallIds', !!wallRow && wallRow.wallIds.length === 1)
  check('total 625 (sin %)', Math.abs(r.total - 625) < 1e-9, String(r.total))
}

// Cadena de %: subtotal 625, desperdicio 10% → 687.5, mano de obra 1 →
// imprevistos 5% → 721.875, impuestos 0, redondeo a 100 → 700.
{
  const scene = sceneOneWall()
  const prices: CostPrices = { muros: 50 }
  const p: CostParams = { ...params, wastagePct: 10, labourMultiplier: 1, contingencyPct: 5, roundTo: 100 }
  const r = buildRows(scene, prices, p)
  check('withLabour 687.5', Math.abs(r.withLabour - 687.5) < 1e-9, String(r.withLabour))
  check('beforeTax 721.875', Math.abs(r.beforeTax - 721.875) < 1e-9, String(r.beforeTax))
  check('total roundTo 100 → 700', r.total === 700, String(r.total))
}

// Puertas / ventanas / muebles por piso: 1 puerta, 1 ventana, 1 mueble.
{
  const scene = sceneOneWall()
  scene.addObject(new SceneObject('Puerta', 'furniture'))
  scene.addObject(new SceneObject('Ventana', 'furniture'))
  scene.addObject(new SceneObject('Silla', 'furniture'))
  const prices: CostPrices = { puertas: 100, ventanas: 80, muebles: 30 }
  const r = buildRows(scene, prices, params)
  const puertas = r.rows.find((row) => row.category === 'puertas')
  const ventanas = r.rows.find((row) => row.category === 'ventanas')
  const muebles = r.rows.find((row) => row.category === 'muebles')
  check('puertas qty 1', !!puertas && puertas.qty === 1, String(puertas?.qty))
  check('ventanas qty 1', !!ventanas && ventanas.qty === 1, String(ventanas?.qty))
  check('muebles qty 1', !!muebles && muebles.qty === 1, String(muebles?.qty))
  check('puertas subtotal 100', !!puertas && puertas.subtotal === 100, String(puertas?.subtotal))
  check('muebles trae objectIds', !!muebles && muebles.objectIds.length === 1)
}

// finalize() puro replica el encadenado de quote.ts.
{
  const rows = [
    { id: 'a', levelId: 'level-0', levelName: 'Piso 0', category: 'muros' as const, qty: 10, unit: 'm2', unitPrice: 50, subtotal: 500, wallIds: [], objectIds: [] }
  ]
  const r = finalize(rows, { ...params, wastagePct: 10, labourMultiplier: 1, contingencyPct: 5, roundTo: 100 })
  check('finalize total 600', r.total === 600, String(r.total))
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exitCode = 1
} else {
  console.log('All rows tests passed')
}
