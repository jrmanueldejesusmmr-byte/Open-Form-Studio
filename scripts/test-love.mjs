// Ejecuta los tests del Modo Amoroso (emojis, stickers, lluvia y honestidad).
// Vitest no arranca en este repo (vitest 5 + vite 5 incompatibles), así que el
// test se empaqueta con esbuild y se corre con Node (patrón de los tests de
// costos). Uso:  node scripts/test-love.mjs
import { build } from 'esbuild'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ENTRY = 'src/renderer/src/ai/brain/love.test.ts'

const dir = await mkdtemp(path.join(tmpdir(), 'love-tests-'))
const out = path.join(dir, 'love.test.mjs')

await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'warning'
})

try {
  await import(pathToFileURL(out).href)
} catch (err) {
  console.error('ERROR en love.test.ts:', err)
  process.exitCode = 1
}
