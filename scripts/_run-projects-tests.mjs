// Ejecuta los tests de la Fase 1 (aislamiento por usuario) empaquetando con
// esbuild e importándolos en node puro (mismo patrón que los runners de
// costos y cerebro). Uso:  node scripts/_run-projects-tests.mjs
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TESTS = [
  'src/main/database.owners.test.ts',
  'src/renderer/src/services/ProjectStore.test.ts',
  'src/renderer/src/services/AuthService.test.ts'
]

const dir = await mkdtemp(path.join(tmpdir(), 'projects-tests-'))

// Stub de `electron` para correr `src/main/database.ts` en node puro: los
// tests no registran IPC, solo usan DatabaseManager (la exportación real).
const electronStub = path.join(dir, 'electron-stub.mjs')
await writeFile(electronStub, 'export const ipcMain = { handle() {}, on() {} }\n')

let anyFailed = false

for (const entry of TESTS) {
  const out = path.join(dir, path.basename(entry).replace(/\.ts$/, '.mjs'))
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    alias: { electron: electronStub },
    // En formato ESM, los require() dinámicos de los builtins (sql.js sobre
    // node:fs) y los __dirname de los paquetes CJS necesitan equivalentes reales.
    banner: {
      js: [
        "import { createRequire as __createRequire } from 'node:module'",
        "import { fileURLToPath as __fileURLToPath } from 'node:url'",
        "import { dirname as __pathDirname } from 'node:path'",
        'const require = __createRequire(import.meta.url)',
        'const __filename = __fileURLToPath(import.meta.url)',
        'const __dirname = __pathDirname(__filename)'
      ].join(';')
    },
    define: {
      // supabaseClient.ts lee import.meta.env en el renderer.
      'import.meta.env.DEV': 'false',
      'import.meta.env.MODE': '"test"',
      'import.meta.env.VITE_SUPABASE_URL': '""',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '""'
    },
    logLevel: 'warning'
  })
  console.log(`\n=== ${entry} ===`)
  try {
    const mod = await import(pathToFileURL(out).href)
    // Los tests son async: hay que esperar a que terminen antes del siguiente.
    if (mod.testsDone) await mod.testsDone
    if (process.exitCode === 1) anyFailed = true
  } catch (err) {
    anyFailed = true
    console.error(`ERROR en ${entry}:`, err)
    process.exitCode = 1
  }
}

process.exit(anyFailed ? 1 : 0)
