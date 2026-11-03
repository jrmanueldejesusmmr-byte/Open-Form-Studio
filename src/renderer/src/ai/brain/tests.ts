/**
 * Runner de las frases de prueba (Fase 2, `TEST_CASES`).
 *
 * Ejecuta cada frase contra un `SceneManager` real (sin DOM) y comprueba el
 * efecto sobre la escena. Lo usan el botón del panel de depuración (F10) y el
 * script `scripts/test-brain.mjs`. Devuelve un resumen legible.
 */

import { SceneManager } from '../../engine/SceneManager'
import { HistoryManager } from '../../engine/HistoryManager'
import { BrainSession } from './session'
import { TEST_CASES } from './phrases'

export interface CaseResult {
  frase: string
  esperado: string
  paso: boolean
  /** Resultado que devolvió el cerebro (preview/clarify/chat). */
  tipo: string
  detalle: string
}

export interface TestReport {
  total: number
  pasaron: number
  fallaron: number
  casos: CaseResult[]
}

/** Prepara una escena limpia antes de cada caso. */
function freshScene(): { scene: SceneManager; history: HistoryManager } {
  const scene = new SceneManager()
  const history = new HistoryManager(scene)
  return { scene, history }
}

/**
 * Ejecuta todas las frases de prueba. Cada caso usa una escena limpia (salvo
 * que la frase dependa de contexto previo, que se indica aplicando la orden
 * previa primero). `autoApply = true` para que el runner ejecute sin UI.
 */
export function runBrainTests(): TestReport {
  const casos: CaseResult[] = []
  let pasaron = 0

  for (const tc of TEST_CASES) {
    const { scene, history } = freshScene()
    // Un cerebro por caso, con auto-aplicar para no depender de la UI.
    const brain = new BrainSession({ scene, history, autoApply: true })

    // Casos con memoria: si la frase depende de algo creado antes, lo creamos.
    if (/ese muro|eso|la habitacion|aplica madera/i.test(tc.frase) && nWalls(scene) === 0) {
      brain.submit('haz una habitación de 4 por 3')
    }

    // Recintos previos para «borra/une la habitación N» (historial por orden).
    if (/habitaci[óo]n\s+\d/i.test(tc.frase) && nWalls(scene) === 0) {
      brain.submit('haz una habitación de 4 por 3')
      brain.submit('haz una habitación de 4 por 3')
    }

    const reply = brain.submit(tc.frase)
    const ok = tc.check(scene)
    if (ok) pasaron++
    casos.push({
      frase: tc.frase,
      esperado: tc.esperado,
      paso: ok,
      tipo: reply.kind,
      detalle: detalleDe(reply)
    })
  }

  return { total: TEST_CASES.length, pasaron, fallaron: TEST_CASES.length - pasaron, casos }
}

function nWalls(scene: SceneManager): number {
  return scene.getWalls().length
}

function detalleDe(reply: { kind: string } & Record<string, unknown>): string {
  if (reply.kind === 'preview') {
    const p = reply['preview'] as { resumen: string; valido: boolean }
    return p.valido ? p.resumen : `inválido: ${p.resumen}`
  }
  if (reply.kind === 'clarify') return `pregunta: ${(reply['clarify'] as { pregunta: string }).pregunta}`
  return (reply['mensaje'] as string) ?? ''
}

/** Texto legible del reporte (para consola/barra de estado). */
export function formatReport(report: TestReport): string {
  const lines = report.casos.map((c, i) => `${c.paso ? '✅' : '❌'} ${i + 1}. «${c.frase}» → ${c.detalle}`)
  return [`Cerebro local: ${report.pasaron}/${report.total} frases correctas (${report.fallaron} fallan).`, ...lines].join('\n')
}
