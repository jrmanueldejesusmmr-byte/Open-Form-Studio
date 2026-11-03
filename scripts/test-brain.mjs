// Runner del cerebro local (Fase 2) desde la consola.
// Ejecuta las 30 frases de prueba contra escenas reales de SceneManager.

import { runBrainTests, formatReport } from '../src/renderer/src/ai/brain/tests'

const report = runBrainTests()
console.log(formatReport(report))
process.exit(report.fallaron > 0 ? 1 : 0)
