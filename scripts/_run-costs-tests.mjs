// Ejecuta los tests del módulo de costos empaquetando con esbuild (igual que
// el runner del cerebro). Uso:  node scripts/_run-costs-tests.mjs
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TESTS = [
  'src/renderer/src/costs/takeoff.test.ts',
  'src/renderer/src/costs/quote.test.ts',
  'src/renderer/src/costs/rows.test.ts',
  'src/renderer/src/engine/RoofTool.test.ts'
]

const dir = await mkdtemp(path.join(tmpdir(), 'costs-tests-'))
let anyFailed = false

for (const entry of TESTS) {
  const out = path.join(dir, path.basename(entry).replace(/\.ts$/, '.mjs'))
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'warning'
  })
  console.log(`\n=== ${entry} ===`)
  try {
    await import(pathToFileURL(out).href)
    if (process.exitCode === 1) anyFailed = true
  } catch (err) {
    anyFailed = true
    console.error(`ERROR en ${entry}:`, err)
    process.exitCode = 1
  }
}

process.exit(anyFailed ? 1 : 0)
