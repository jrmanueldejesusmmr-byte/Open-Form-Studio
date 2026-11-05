// Verificación de la FASE 2 (exportar): genera un archivo real de cada
// formato y lo vuelve a LEER con el lector correspondiente, comprobando que
// la geometría conserva las medidas en metros.
//
// Uso: node scripts/_verify-export.mjs
// Salida: los archivos quedan en scripts/captures/export/ para inspección.

import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis
}

const OUT_DIR = path.join(process.cwd(), 'scripts', 'captures', 'export')

// El bundle se genera DENTRO del proyecto: si viviera en /tmp, Node no
// encontraría el paquete `three` (las dependencias están en ./node_modules).
const BUILD_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'arqstudio')
await mkdir(BUILD_DIR, { recursive: true })
const out = path.join(BUILD_DIR, 'verify-export.mjs')

await build({
  entryPoints: [path.join(process.cwd(), 'scripts', '_verify-export-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  external: ['three', 'three/examples/jsm/*', '@napi-rs/canvas'],
  logLevel: 'error'
})

await mkdir(OUT_DIR, { recursive: true })

const { run } = await import(pathToFileURL(out).href)
await run(OUT_DIR)
