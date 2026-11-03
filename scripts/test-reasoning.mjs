// Runner de tests para Razonamiento Avanzado de Astro (Fase 2)
// Verifica DesignSpec, layout BSP con pasillo, conteos exactos,
// caso complejo de 45x30m, límites hasta 200m y herramientas de edición.

import assert from 'node:assert/strict'
import * as THREE from 'three'
import { SceneManager } from '../src/renderer/src/engine/SceneManager.ts'
import { HistoryManager } from '../src/renderer/src/engine/HistoryManager.ts'
import { BrainSession } from '../src/renderer/src/ai/brain/session.ts'
import { parseDesignSpec, leerNumero, leerMedidas, leerConteo } from '../src/renderer/src/ai/brain/spec.ts'
import { blueprintFromSpec } from '../src/renderer/src/ai/brain/layout.ts'
import { validarDesignSpec, validarEscenaContraSpec, ARCH_LIMITS } from '../src/renderer/src/ai/brain/validators.ts'
import { runOrder } from '../src/renderer/src/ai/tools/executor.ts'
import { getTool } from '../src/renderer/src/ai/tools/registry.ts'

let total = 0
let pasaron = 0
const fallos = []

function test(nombre, fn) {
  total++
  try {
    fn()
    pasaron++
    console.log(`  ✅ ${nombre}`)
  } catch (err) {
    fallos.push({ nombre, err })
    console.log(`  ❌ ${nombre}: ${err.message}`)
  }
}

console.log('🧪 Iniciando pruebas de Fase 2 (Razonamiento de Astro y Layout)...\n')

// 1. Parsing del caso complejo maestro
console.log('--- 1. Caso Complejo Maestro (45 × 30 m) ---')

const fraseCompleja =
  'casa de 45 × 30 m, 10 habitaciones, 10 ventanas, una puerta por habitación, tabla roca, techo adaptado, césped afuera, arco estilo hotel en la entrada'

test('DesignSpec parsea correctamente la orden compleja maestra', () => {
  const { spec, supuestos, faltantes } = parseDesignSpec(fraseCompleja)

  assert.equal(spec.ancho, 45, 'Ancho debe ser 45')
  assert.equal(spec.largo, 30, 'Largo debe ser 30')
  assert.equal(spec.habitaciones?.cantidad, 10, 'Deben ser 10 habitaciones')
  assert.equal(spec.ventanas?.total, 10, 'Deben ser 10 ventanas')
  assert.equal(spec.puertasPorHabitacion, 1, 'Debe ser 1 puerta por habitación')
  assert.equal(spec.material?.muros, 'mat.plaster', 'Tabla roca mapea a mat.plaster')
  assert.equal(spec.techo?.tipo, 'auto', 'Techo adaptado')
  assert.equal(spec.exterior?.cesped, true, 'Césped exterior')
  assert.equal(spec.exterior?.arco?.estilo, 'hotel', 'Arco estilo hotel')
  assert.equal(faltantes.length, 0, 'No debe faltar ningún parámetro esencial')
})

test('validarDesignSpec acepta 45x30 m sin rechazar por límite de 30m', () => {
  const { spec } = parseDesignSpec(fraseCompleja)
  const val = validarDesignSpec(spec)
  assert.equal(val.ok, true, `La validación no debe fallar: ${JSON.stringify(val.dimensiones)}`)
})

test('ARCH_LIMITS permite dimensiones hasta 200 m', () => {
  assert.equal(ARCH_LIMITS.MAX, 200)
  const val = validarDesignSpec({ ancho: 180, largo: 150 })
  assert.equal(val.ok, true)
})

// 2. Blueprint y conteos exactos
console.log('\n--- 2. Layout BSP / Treemap con Conteos Exactos ---')

test('blueprintFromSpec genera exactamente 10 habitaciones, 10 ventanas y 10 puertas', () => {
  const { spec } = parseDesignSpec(fraseCompleja)
  const bp = blueprintFromSpec(spec)

  assert.equal(bp.habitaciones.length, 10, 'Debe tener exactamente 10 habitaciones')
  assert.equal(bp.totalVentanas, 10, 'Debe tener exactamente 10 ventanas')
  assert.equal(bp.totalPuertas, 10, 'Debe tener exactamente 10 puertas')
  assert.ok(bp.steps.length > 25, 'Debe generar los pasos para habitaciones, aberturas, techo, césped y arco')

  // Comprobar presencia de pasos de césped y arco
  const tieneCesped = bp.steps.some(s => s.herramienta === 'crear_losa' && s.parametros.material === 'mat.grass')
  assert.ok(tieneCesped, 'Debe generar paso de losa para césped')

  const tieneArco = bp.steps.some(s => s.herramienta === 'crear_columna')
  assert.ok(tieneArco, 'Debe generar columnas para el arco de hotel')
})

// 3. Ejecución real en SceneManager y validación post-generación
console.log('\n--- 3. Ejecución en Escena Real y Validador Post-Escena ---')

test('runOrder genera la casa compleja y validarEscenaContraSpec confirma los conteos', () => {
  const scene = new SceneManager()
  const history = new HistoryManager(scene)

  const { spec } = parseDesignSpec(fraseCompleja)
  const bp = blueprintFromSpec(spec)

  const res = runOrder(scene, history, 'Casa 45x30', bp.steps)
  assert.equal(res.ok, true, `runOrder falló: ${res.mensaje}`)

  const check = validarEscenaContraSpec(spec, scene)
  assert.equal(check.ok, true, `Discrepancias: ${check.discrepancias.join(', ')}`)
  assert.equal(check.conteos.puertas, 10, 'Deben existir 10 puertas en la escena')
  assert.equal(check.conteos.ventanas, 10, 'Deben existir 10 ventanas en la escena')
  assert.ok(check.conteos.muros >= 40, 'Muros perimetrales y divisiones creados')
})

test('Un solo Ctrl+Z (history.undo) revierte la casa completa', () => {
  const scene = new SceneManager()
  const history = new HistoryManager(scene)

  const { spec } = parseDesignSpec(fraseCompleja)
  const bp = blueprintFromSpec(spec)

  runOrder(scene, history, 'Casa Compleja', bp.steps)
  assert.ok(scene.getWalls().length > 0)

  // Deshacer único
  history.undo()
  assert.equal(scene.getWalls().length, 0, 'La escena debe quedar limpia tras un solo undo')
  assert.equal(scene.getObjects().length, 0, 'No deben quedar objetos huérfanos')
})

// 4. BrainSession planificación en 2 pasos
console.log('\n--- 4. Planificación en 2 pasos (Preview + Apply) ---')

test('BrainSession.submit genera preview con Aplicar/Cancelar y conteos correctos', () => {
  const scene = new SceneManager()
  const history = new HistoryManager(scene)
  const session = new BrainSession({ scene, history, autoApply: false })

  const reply = session.submit(`/${fraseCompleja}`)
  assert.equal(reply.kind, 'preview')
  assert.equal(reply.preview.valido, true)
  assert.ok(reply.preview.resumen.includes('10 habitaciones'))
  assert.ok(reply.preview.resumen.includes('10 ventanas'))
  assert.ok(reply.preview.resumen.includes('10 puertas'))

  // Antes de aplicar la escena debe estar vacía
  assert.equal(scene.getWalls().length, 0)

  // Aplicar
  const appRes = session.apply()
  assert.equal(appRes.ok, true)
  assert.ok(scene.getWalls().length > 0)
})

// 5. Casos límite (números en palabras, unidades, 0, negativos)
console.log('\n--- 5. Casos Límite y Robustez ---')

test('leerNumero lee números en palabras ("diez", "cuarenta y cinco")', () => {
  assert.equal(leerNumero('diez'), 10)
  assert.equal(leerNumero('cuarenta y cinco'), 45)
  assert.equal(leerNumero('una'), 1)
  assert.equal(leerNumero('veinte'), 20)
})

test('leerMedidas soporta "m", "metros", "×", "x", "por"', () => {
  const m1 = leerMedidas('15m por 12 metros')
  assert.equal(m1.ancho, 15)
  assert.equal(m1.largo, 12)

  const m2 = leerMedidas('12,5 × 8,5 m')
  assert.equal(m2.ancho, 12.5)
  assert.equal(m2.largo, 8.5)
})

test('Valores negativos o faltantes no provocan excepciones y reportan faltantes', () => {
  const r = parseDesignSpec('casa de -5 por 10')
  assert.ok(r.spec !== null)
  const rVacio = parseDesignSpec('casa')
  assert.ok(rVacio.faltantes.includes('medidas (ancho y largo en metros)'))
})

// 6. Colocación relativa
console.log('\n--- 6. Colocación Relativa con Bounding Boxes ---')

test('Colocación relativa parsea "a la derecha de la casa A" y "en medio de dos casas"', () => {
  const r1 = parseDesignSpec('crea una casa de 10 por 8 a la derecha de casa1')
  assert.equal(r1.spec.colocacion?.relativa, 'derecha')

  const r2 = parseDesignSpec('crea una casa de 10 por 8 en medio de dos casas')
  assert.equal(r2.spec.colocacion?.relativa, 'entre')
})

// 7. Herramientas de edición (borrar_habitacion, unir_habitaciones, agregar_habitaciones)
console.log('\n--- 7. Herramientas de Edición de Recintos ---')

test('Las herramientas borrar_habitacion, unir_habitaciones y agregar_habitaciones están registradas', () => {
  assert.ok(getTool('borrar_habitacion') !== undefined)
  assert.ok(getTool('unir_habitaciones') !== undefined)
  assert.ok(getTool('agregar_habitaciones') !== undefined)
  assert.ok(getTool('redimensionar_habitacion') !== undefined)
})

test('agregar_habitaciones crea módulos y se revierte en 1 Ctrl+Z', () => {
  const scene = new SceneManager()
  const history = new HistoryManager(scene)

  const tool = getTool('agregar_habitaciones')
  const res = tool.run({ x: 0, z: 0, ancho: 4, largo: 3, cantidad: 2 }, { scene, history })
  assert.equal(res.ok, true)
  assert.equal(scene.getWalls().length, 8)
})

console.log(`\n========================================`)
console.log(`Resultado: ${pasaron}/${total} pruebas de razonamiento superadas.`)
if (fallos.length > 0) {
  console.log(`❌ Fallaron ${fallos.length} pruebas.`)
  process.exit(1)
} else {
  console.log(`✨ ¡Todas las pruebas de Fase 2 pasaron con éxito!`)
  process.exit(0)
}
