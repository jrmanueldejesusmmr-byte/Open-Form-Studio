// Temp runner: imports and executes the brain tests, printing the report.
import { runBrainTests, formatReport } from '/home/jrmanueldejesusmmr/arqstudio3d-electron/src/renderer/src/ai/brain/tests.ts'

const report = runBrainTests()
console.log(formatReport(report))
process.exit(report.fallaron > 0 ? 1 : 0)
