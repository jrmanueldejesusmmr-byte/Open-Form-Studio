/** Pruebas con MOCKS de la Fase 3 (sin internet): verifican el function calling
 *  de Gemini con respuestas simuladas. Se ejecuta con: npx tsx <este archivo>. */
import { GeminiService } from '../src/main/gemini'
import { BrainSession } from '../src/renderer/src/ai/brain/session'
import { aiSettings } from '../src/renderer/src/ai/settings'
import { SceneManager } from '../src/renderer/src/engine/SceneManager'
import { HistoryManager } from '../src/renderer/src/engine/HistoryManager'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++
    console.log('  OK  ' + name + (detail ? ' — ' + detail : ''))
  } else {
    fail++
    console.log('  FALLO ' + name + (detail ? ' — ' + detail : ''))
  }
}

const TOOLS = [
  {
    name: 'crear_habitacion',
    description: 'Crea una habitacion rectangular',
    parameters: {
      type: 'object',
      properties: { x: { type: 'number' }, z: { type: 'number' }, ancho: { type: 'number' }, largo: { type: 'number' } },
      required: ['x', 'z', 'ancho', 'largo']
    }
  },
  { name: 'crear_muro', description: 'Crea un muro', parameters: { type: 'object', properties: {}, required: [] } }
]

async function parteA(): Promise<void> {
  console.log('\n[A] GeminiService.plan — respuesta simulada de Gemini (sin red)')
  const origFetch = globalThis.fetch

  // Respuesta simulada con DOS functionCall (habitacion + muro).
  const captured: Array<{ url: string; body: Record<string, unknown> }> = []
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    captured.push({ url: String(url), body: JSON.parse(init.body) })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [
          { functionCall: { name: 'crear_habitacion', args: { x: 0, z: 0, ancho: 4, largo: 3 } } },
          { functionCall: { name: 'crear_muro', args: { inicio: { x: 0, z: 0 }, fin: { x: 4, z: 0 } } } }
        ] } }]
      }),
      text: async () => ''
    }
  }) as unknown as typeof fetch

  const svc = new GeminiService(process.cwd())
  const res = await svc.plan('haz una habitacion de 4 por 3', TOOLS)
  check('plan() devuelve ok', res.ok === true)
  check('parsea 2 functionCall', res.steps?.length === 2, 'steps=' + res.steps?.length)
  check('paso 0 = crear_habitacion', res.steps?.[0]?.herramienta === 'crear_habitacion')
  check('paso 1 = crear_muro', res.steps?.[1]?.herramienta === 'crear_muro')
  check('args mapeados a parametros', res.steps?.[0]?.parametros?.ancho === 4)

  const body = captured[0]?.body as { tools?: Array<{ functionDeclarations?: unknown[] }> } | undefined
  const decls = body?.tools?.[0]?.functionDeclarations
  check('request lleva functionDeclarations', Array.isArray(decls))
  check('request ofrece las 2 tools', Array.isArray(decls) && decls.length === 2, 'n=' + (Array.isArray(decls) ? decls.length : 0))

  // Sin clave → ok:false (fallback), sin lanzar.
  const noKey = new GeminiService('/no/existe/dir')
  const r2 = await noKey.plan('hola', TOOLS)
  check('sin clave → ok:false (fallback)', r2.ok === false)

  // Respuesta SIN functionCall (solo texto) → ok:false (fallback).
  globalThis.fetch = (async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'hola' }] } }] }),
    text: async () => ''
  })) as unknown as typeof fetch
  const svc2 = new GeminiService(process.cwd())
  const r3 = await svc2.plan('haz algo', TOOLS)

  // Error HTTP (403) → ok:false con status.
  globalThis.fetch = (async () => ({
    ok: false, status: 403,
    json: async () => ({}),
    text: async () => '{"error":{"status":"PERMISSION_DENIED"}}'
  })) as unknown as typeof fetch
  const svc3 = new GeminiService(process.cwd())
  const r4 = await svc3.plan('haz algo', TOOLS)
  globalThis.fetch = origFetch
  check('sin functionCall → ok:false (fallback)', r3.ok === false)
  check('HTTP 403 → ok:false con status', r4.ok === false && r4.status === 403, 'status=' + r4.status)
}

await parteA()
console.log('\nResultado parcial: ' + pass + ' OK, ' + fail + ' FALLO')

async function parteB(): Promise<void> {
  console.log('\n[B] submitSmart — Gemini propone, cerebro local valida, preview, apply, UN solo undo')

  // B1: activo + plan válido
  {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const mockSteps = [{ herramienta: 'crear_habitacion', parametros: { x: 0, z: 0, ancho: 4, largo: 3 } }]
    const session = new BrainSession({ scene, history, autoApply: false, geminiPlan: async () => mockSteps })
    aiSettings.geminiEnabled = true
    const reply = await session.submitSmart('haz una habitacion de 4 por 3')
    check('devuelve preview', reply.kind === 'preview')
    if (reply.kind === 'preview') {
      check('titulo = Plan de Gemini', reply.preview.titulo === 'Plan propuesto por Gemini', 'titulo=' + reply.preview.titulo)
      check('1 paso', reply.preview.pasos.length === 1)
      check('paso valido (dry-run local)', reply.preview.valido === true)
      check('escena intacta antes de Aplicar', scene.getWalls().length === 0, 'walls=' + scene.getWalls().length)
      session.apply()
      check('apply crea muros', scene.getWalls().length > 0, 'walls=' + scene.getWalls().length)
      history.undo()
      check('UN SOLO Ctrl+Z revierte todo', scene.getWalls().length === 0, 'walls tras undo=' + scene.getWalls().length)
    }
  }

  // B2: activo + proveedor lanza (timeout) → fallback local silencioso
  {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const s = new BrainSession({ scene, history, autoApply: false, geminiPlan: async () => { throw new Error('Tiempo de espera agotado (15 s)') } })
    aiSettings.geminiEnabled = true
    const r = await s.submitSmart('haz una habitacion de 4 por 3')
    check('fallback sigue siendo preview (sin error feo)', r.kind === 'preview')
    if (r.kind === 'preview') check('usa titulo LOCAL (no Gemini)', r.preview.titulo !== 'Plan propuesto por Gemini', 'titulo=' + r.preview.titulo)
  }

  // B3: desactivado → proveedor NO se llama
  {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    let called = false
    const mockSteps = [{ herramienta: 'crear_habitacion', parametros: { x: 0, z: 0, ancho: 4, largo: 3 } }]
    const s = new BrainSession({ scene, history, autoApply: false, geminiPlan: async () => { called = true; return mockSteps } })
    aiSettings.geminiEnabled = false
    const r = await s.submitSmart('haz una habitacion de 4 por 3')
    check('desactivado: proveedor NO llamado', called === false)
    check('desactivado: respuesta local', r.kind === 'preview' && r.preview.titulo !== 'Plan propuesto por Gemini')
  }

  // B4: activo + plan INVALIDO (dry-run falla) → fallback local
  {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const badSteps = [{ herramienta: 'crear_muro', parametros: { inicio: { x: 9999, z: 0 }, fin: { x: 9999, z: 5 } } }]
    const s = new BrainSession({ scene, history, autoApply: false, geminiPlan: async () => badSteps })
    aiSettings.geminiEnabled = true
    const r = await s.submitSmart('haz una habitacion de 4 por 3')
    const titulo = r.kind === 'preview' ? r.preview.titulo : '(no preview)'
    check('plan invalido → fallback local', r.kind === 'preview' && titulo !== 'Plan propuesto por Gemini', 'titulo=' + titulo)
  }
}

await parteB()
console.log('\n========================================')
console.log('Resultado mocks Gemini: ' + pass + ' OK, ' + fail + ' FALLO')
process.exit(fail > 0 ? 1 : 0)
