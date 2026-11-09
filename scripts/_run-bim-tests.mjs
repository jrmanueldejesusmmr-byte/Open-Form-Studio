import { build } from 'esbuild'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(path.join(tmpdir(), 'bim-tests-'))
const entries = [
  'src/renderer/src/bim/bim.test.ts',
  'src/renderer/src/catalog/cadBlocks.test.ts',
  'src/renderer/src/engine/cameraNavigation.test.ts'
]

for (const entry of entries) {
  const out = path.join(dir, path.basename(entry, '.ts') + '.mjs')
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'warning'
  })

  console.log(`\n=== ${entry} ===`)
  await import(pathToFileURL(out).href)
}

