// Runner de tests para Modo Amoroso y Tono (Fase 1)
// Se ejecuta directamente con Node.js sin depender de Vitest ni bundler externo.

import assert from 'node:assert/strict'
import {
  detectTone,
  analizarModoAmoroso,
  detectarDeclaracion,
  frase,
  formatearErrorHonesto,
  envuelveConTono,
  resumenConTono,
  modoAmorosoActivo,
  setModoAmoroso
} from '../src/renderer/src/ai/brain/tone.ts'

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

console.log('🧪 Iniciando pruebas de Fase 1 (Modo Amoroso y Tono)...\n')

// 1. Detección de tono y limpieza del prefijo "/"
console.log('--- 1. Detección y limpieza del prefijo "/" ---')

test('detectTone: "/crea una casa" activa tono amoroso y limpia la orden', () => {
  const res = detectTone('/crea una casa')
  assert.equal(res.tone, 'amoroso')
  assert.equal(res.cleaned, 'crea una casa')
})

test('detectTone: "crea una casa" sin barra activa tono profesional', () => {
  const res = detectTone('crea una casa')
  assert.equal(res.tone, 'profesional')
  assert.equal(res.cleaned, 'crea una casa')
})

test('detectTone: espacios al inicio antes de la barra "  / haz un cuarto"', () => {
  const res = detectTone('   / haz un cuarto')
  assert.equal(res.tone, 'amoroso')
  assert.equal(res.cleaned, 'haz un cuarto')
})

test('detectTone: solo "/" devuelve cleaned vacío sin romper', () => {
  const res = detectTone('/')
  assert.equal(res.tone, 'amoroso')
  assert.equal(res.cleaned, '')
})

test('detectTone: "/ " con espacios devuelve cleaned vacío', () => {
  const res = detectTone('/    ')
  assert.equal(res.tone, 'amoroso')
  assert.equal(res.cleaned, '')
})

test('detectTone: "//" no rompe y deja cleaned "/"', () => {
  const res = detectTone('//')
  assert.equal(res.tone, 'amoroso')
  assert.equal(res.cleaned, '/')
})

test('detectTone: ruta tipo "/casa" devuelve cleaned "casa"', () => {
  const res = detectTone('/casa')
  assert.equal(res.tone, 'amoroso')
  assert.equal(res.cleaned, 'casa')
})

test('analizarModoAmoroso: comando persistente /modo amoroso', () => {
  const res = analizarModoAmoroso('/modo amoroso')
  assert.equal(res.comando, 'activar')
  assert.equal(res.textoLimpio, '')
})

test('analizarModoAmoroso: comando persistente /modo normal', () => {
  const res = analizarModoAmoroso('/modo normal')
  assert.equal(res.comando, 'desactivar')
  assert.equal(res.textoLimpio, '')
})

// 2. Declaraciones de afecto
console.log('\n--- 2. Declaraciones de afecto ---')

test('/te amo responde exactamente "Yo te amo aún más, mi vida."', () => {
  const res = detectarDeclaracion('/te amo')
  assert.equal(res.esDeclaracion, true)
  assert.equal(res.respuesta, 'Yo te amo aún más, mi vida.')
})

test('variantes de /te amo (sin tildes, con emojis, mayúsculas)', () => {
  assert.equal(detectarDeclaracion('TE AMO').esDeclaracion, true)
  assert.equal(detectarDeclaracion('/te amoo').esDeclaracion, true)
  assert.equal(detectarDeclaracion('ti amo').esDeclaracion, true)
  assert.equal(detectarDeclaracion('/te amo ❤️').esDeclaracion, true)
  assert.equal(detectarDeclaracion('/te amo').respuesta, 'Yo te amo aún más, mi vida.')
})

test('/te quiero responde con afecto', () => {
  const res = detectarDeclaracion('/te quiero')
  assert.equal(res.esDeclaracion, true)
  assert.match(res.respuesta, /Yo te amo aún más, mi vida/)
})

test('/eres lo mejor responde con afecto', () => {
  const res = detectarDeclaracion('/eres lo mejor')
  assert.equal(res.esDeclaracion, true)
  assert.match(res.respuesta, /Yo te amo aún más, mi vida/)
})

test('frases que son órdenes no se confunden con declaraciones', () => {
  assert.equal(detectarDeclaracion('crea una casa').esDeclaracion, false)
  assert.equal(detectarDeclaracion('/haz una habitación').esDeclaracion, false)
})

// 3. Frases por tipo y no repetición consecutiva
console.log('\n--- 3. Banco de frases y no repetición ---')

const categorias = ['saludo', 'confirmacion', 'error', 'aclaracion', 'deshacer', 'despedida', 'exito', 'animo']

for (const cat of categorias) {
  test(`categoría "${cat}" devuelve frases válidas tanto en amoroso como profesional`, () => {
    const fAmoroso = frase(cat, 'amoroso')
    const fProf = frase(cat, 'profesional')
    assert.ok(fAmoroso.length > 0, `Amoroso vacío para ${cat}`)
    assert.ok(fProf.length > 0, `Profesional vacío para ${cat}`)
  })
}

test('no repite la misma frase consecutivamente en la misma categoría', () => {
  const coleccion = new Set()
  let previa = ''
  for (let i = 0; i < 20; i++) {
    const f = frase('confirmacion', 'amoroso')
    assert.notEqual(f, previa, `Frase repetida consecutivamente: "${f}"`)
    previa = f
    coleccion.add(f)
  }
  assert.ok(coleccion.size > 1, 'Debe haber variedad en las frases')
})

// 4. Caso de fallo honesto (jamás dice "terminado" si falló)
console.log('\n--- 4. Honestidad ante errores (Regla Maestra) ---')

test('formatearErrorHonesto con tono amoroso dice la verdad con cariño y NUNCA "Terminado"', () => {
  const err = formatearErrorHonesto('el muro excede los límites', 'amoroso')
  assert.ok(!err.toLowerCase().includes('terminado'), 'Jamás debe decir terminado ante un error')
  assert.ok(!err.toLowerCase().includes('listo'), 'Jamás debe decir listo ante un error')
  assert.ok(err.includes('el muro excede los límites'), 'Debe incluir el motivo del error')
  assert.match(err, /mi vida|cariño|mi amor/i)
})

test('formatearErrorHonesto con tono profesional es sobrio y técnico', () => {
  const err = formatearErrorHonesto('coordenada fuera de rango', 'profesional')
  assert.ok(err.includes('coordenada fuera de rango'))
  assert.ok(!/mi vida|cariño|mi amor/i.test(err))
})

test('envuelveConTono conserva intactos los datos de la orden', () => {
  const resumen = 'Casa de 45 × 30 m con 10 habitaciones y 10 ventanas'
  const outAmoroso = envuelveConTono(resumen, [], 'amoroso')
  assert.ok(outAmoroso.includes('45 × 30 m'))
  assert.ok(outAmoroso.includes('10 habitaciones'))
  assert.ok(outAmoroso.includes('10 ventanas'))
})

console.log(`\n========================================`)
console.log(`Resultado: ${pasaron}/${total} pruebas superadas.`)
if (fallos.length > 0) {
  console.log(`❌ Fallaron ${fallos.length} pruebas.`)
  process.exit(1)
} else {
  console.log(`✨ ¡Todas las pruebas de Fase 1 pasaron con éxito!`)
  process.exit(0)
}
