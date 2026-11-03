import { it, expect } from 'vitest'
import { runBrainTests, formatReport } from './tests'

it('ejecuta las frases de prueba del cerebro local', () => {
  const report = runBrainTests()
  console.log(formatReport(report))
  expect(report.fallaron).toBe(0)
})
