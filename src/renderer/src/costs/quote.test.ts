import { buildQuote, roundTo, applyPct } from './quote'
import type { PhysicalQuantities, CostParams, CostPrices } from './types'

let failed = 0

function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name} ${extra ?? ''}`)
  }
}

const makeTakeoff = (netArea: number): PhysicalQuantities => ({
  walls: [{
    id: 'w-1',
    levelId: 'level-0',
    length: 5,
    height: 2.5,
    thickness: 0.15,
    grossArea: 12.5,
    netArea,
    volume: 1.875,
    doorArea: 1.89,
    windowArea: 0
  }],
  slabs: [],
  roofs: [],
  doors: [],
  windows: [],
  objects: []
})

const params: CostParams = {
  wastagePct: 10,
  labourMultiplier: 1,
  contingencyPct: 5,
  taxPct: 0,
  currencySymbol: '$',
  roundTo: 100,
  units: 'm2'
}

const prices: CostPrices = { muros: 50 }

// Cotización única: 10 m² * 50 = 500; desperdicio 10, mano 1, imprevistos 5 => 577.5; impuestos 0; redondeo 100 => 600.
{
  const q = buildQuote(makeTakeoff(10), prices, params)
  check('subtotal', q.subtotal === 500, String(q.subtotal))
  check('total roundTo 100 (600)', q.total === 600, String(q.total))
}

// Sin desperdicio, impuestos ni redondeo (sin parámetros): subtotal = precio*área.
{
  const p: CostParams = {
    wastagePct: 0,
    labourMultiplier: 0,
    contingencyPct: 0,
    taxPct: 0,
    currencySymbol: '$',
    roundTo: 0,
    units: 'm2'
  }
  const q = buildQuote(makeTakeoff(10), prices, p)
  check('subtotal sin porcentajes', q.subtotal === 500)
  check('total sin porcentajes', q.total === 500)
}

// roundTo: 577.5 -> 580 (10), 577.5 -> 578 (1).
{
  check('roundTo 10', roundTo(577.5, 10) === 580)
  check('roundTo 1', roundTo(577.5, 1) === 578)
  check('roundTo 0 disables', roundTo(577.5, 0) === 578)
}

{
  check('roundPowMath', roundTo(577.5, 100) === 600)
}

// Desperdicio + redondeo combinados: subtotal 500, desperdicio 15% -> 575,
// imprevistos 5% -> 603.75, impuestos 0, redondeo a 10 -> 600.
{
  const p: CostParams = {
    wastagePct: 15,
    labourMultiplier: 1,
    contingencyPct: 5,
    taxPct: 0,
    currencySymbol: '$',
    roundTo: 10,
    units: 'm2'
  }
  const q = buildQuote(makeTakeoff(10), prices, p)
  check('desperdicio+redondeo total (600)', q.total === 600, String(q.total))
  check('base previo a impuestos (603.75)', Math.abs(q.base - 603.75) < 1e-9, String(q.base))
}

// applyPct: 8% -> 1.08; encadenamiento desperdicio -> imprevistos.
{
  check('applyPct 8%', Math.abs(applyPct(100, 8) - 108) < 1e-9)
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exitCode = 1
} else {
  console.log('All quote tests passed')
}
