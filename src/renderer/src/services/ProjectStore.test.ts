/**
 * Tests Fase 1 — aislamiento por usuario en `ProjectStore` (con la base local
 * REAL de `src/main/database.ts` detrás, sin Electron: el puente IPC se simula
 * con un shim sobre `DatabaseManager`).
 *
 * Ejecución: `node scripts/_run-projects-tests.mjs`
 *
 * Escenario exigido:
 *   - cuenta nueva → lista vacía (y SIN proyectos de ejemplo/semilla)
 *   - A crea 2; B nuevo ve 0; B no toca los de A
 *   - sin sesión → 0
 *   - cerrar sesión de A y entrar B → sin rastro de A (y al volver, los suyos)
 *   - proyecto legado sin dueño → cuarentena
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseManager } from '../../../main/database'
import type { AuthService, AuthUser } from './AuthService'
import { ProjectStore } from './ProjectStore'

function ok(message: string): void {
  console.log(`ok - ${message}`)
}

/** localStorage en memoria para el entorno node. */
function memoryLocalStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value))
  }
}

type Ipc<T> = { ok: boolean; data?: T; error?: string }

async function main(): Promise<void> {
  const manager = new DatabaseManager()
  await manager.init({
    baseDir: mkdtempSync(join(tmpdir(), 'arq-store-')),
    wasmBinary: readFileSync(join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
  })

  /** Simula `window.arqStudio.db` con el DatabaseManager real. */
  const wrap = <T>(run: () => T): Promise<Ipc<T>> => {
    try {
      return Promise.resolve({ ok: true, data: run() })
    } catch (error) {
      return Promise.resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  const dbBridge = {
    health: () => wrap(() => manager.health()),
    ensureSchema: () => wrap(() => manager.ensureSchema()),
    listProjects: (payload: { userId: string | null }) => wrap(() => manager.listProjects(payload.userId)),
    createProject: (payload: { userId: string | null; name: string; mode: string; designIndex?: number }) =>
      wrap(() =>
        manager.createProject({
          userId: payload.userId,
          name: payload.name,
          mode: payload.mode === '2D' ? '2D' : '3D',
          designIndex: payload.designIndex
        })
      ),
    renameProject: (payload: { id: string; name: string; userId: string | null }) =>
      wrap(() => manager.renameProject(payload.id, payload.name, payload.userId)),
    removeProject: (payload: { id: string; userId: string | null }) =>
      wrap(() => manager.removeProject(payload.id, payload.userId)),
    touchProject: (payload: { id: string; userId: string | null }) =>
      wrap(() => manager.touchProject(payload.id, payload.userId)),
    getSetting: (payload: { clave: string }) => wrap(() => manager.getSetting(payload.clave)),
    setSetting: (payload: { clave: string; valor: string }) =>
      wrap(() => {
        manager.setSetting(payload.clave, payload.valor)
        return true
      }),
    importLegacy: (payload: {
      users?: Array<{ id?: string; email: string; name: string; password: string }>
      projects?: Array<{ id: string; name: string; mode: '2D' | '3D'; designIndex: number; updatedAt: number }>
    }) => wrap(() => manager.importLegacy(payload)),
    loadScene: (payload: { projectId: string; userId: string | null }) =>
      wrap(() => manager.loadScene(payload.projectId, payload.userId)),
    listTextures: (payload: { projectId: string; userId: string | null }) =>
      wrap(() => manager.listTextures(payload.projectId, payload.userId))
  }

  const localStorage = memoryLocalStorage()
  // Proyecto legado en localStorage de versiones antiguas (sin dueño):
  // debe importarse a la base y quedar en cuarentena (invisible para todos).
  localStorage.setItem(
    'arqstudio.projects.v1',
    JSON.stringify([
      {
        id: 'legacy-1',
        name: 'primera casa',
        mode: '3D',
        designIndex: 0,
        updatedAt: Date.now() - 1000,
        ownerId: null,
        source: 'local'
      }
    ])
  )
  ;(globalThis as unknown as { window: unknown }).window = { localStorage, arqStudio: { db: dbBridge } }

  // Sesión de prueba controlada por el propio test.
  let currentUser: AuthUser | null = null
  const auth = {
    get currentUser() {
      return currentUser
    },
    isAuthenticated: () => currentUser !== null,
    whenReady: () => Promise.resolve(),
    onChange: () => () => undefined
  } as unknown as AuthService

  const store = new ProjectStore(auth)
  const userA: AuthUser = { id: 'user-a', email: 'a@x.test', name: 'Ana', local: true }
  const userB: AuthUser = { id: 'user-b', email: 'b@x.test', name: 'Beto', local: true }

  // 1) Cuenta nueva (A): lista vacía — sin semillas y con el legado en cuarentena.
  currentUser = userA
  let list = await store.list()
  assert.equal(list.length, 0, 'cuenta nueva → lista vacía (sin siembra ni legado)')
  ok('cuenta nueva ve 0 proyectos (sin semillas; legado en cuarentena)')

  // 2) A crea 2 proyectos.
  const first = await store.create({ name: 'Proyecto de A', mode: '3D' })
  const second = await store.create({ name: 'Segundo de A', mode: '2D' })
  assert.equal(first.ok && second.ok, true, 'A crea sus dos proyectos')
  list = await store.list()
  assert.equal(list.length, 2, 'A ve exactamente 2')
  const aId = list.find((project) => project.name === 'Proyecto de A')?.id as string
  assert.ok(aId, 'el proyecto de A tiene id')
  ok('A crea 2 proyectos y los ve')

  // 3) B nuevo (mismo equipo): ve 0.
  currentUser = userB
  store.reset()
  assert.equal((await store.list()).length, 0, 'B nuevo → 0')
  ok('B nuevo ve 0 proyectos')

  // 4) B no puede manipular ni abrir los de A (ni por id directo).
  assert.equal(await store.remove(aId), false, 'borrar de A desde B → false')
  const renamed = await store.rename(aId, 'hackeado')
  assert.equal(renamed.ok, false, 'renombrar de A desde B → rechazado')
  const bridge = (window as unknown as {
    arqStudio: { db: { loadScene(p: { projectId: string; userId: string | null }): Promise<Ipc<unknown>> } }
  }).arqStudio
  const sceneViaB = await bridge.db.loadScene({ projectId: aId, userId: userB.id })
  assert.equal(sceneViaB.ok, false, 'abrir escena de A desde B → rechazado')
  ok('B no puede borrar/renombrar/abrir proyectos de A')

  // 5) Sin sesión → 0 y sin escrituras.
  currentUser = null
  store.reset()
  assert.deepEqual(await store.list(), [], 'sin sesión → 0')
  const denied = await store.create({ name: 'x', mode: '3D' })
  assert.equal(denied.ok, false, 'crear sin sesión → rechazado')
  ok('sin sesión: lista vacía y creación rechazada')

  // 6) Cerrar sesión de A y entrar B: sin rastro de A; volver a A: los suyos.
  currentUser = userA
  store.reset()
  list = await store.list()
  assert.equal(list.length, 2, 'al volver A ve sus 2')
  assert.equal(list.find((project) => project.id === aId)?.name, 'Proyecto de A', 'nombre intacto')
  currentUser = userB
  store.reset()
  assert.equal((await store.list()).length, 0, 'B tras A → 0, sin rastro')
  ok('sin rastro entre cuentas al alternar sesiones')

  // 7) El legado importado sigue en cuarentena (fila sin dueño, invisible).
  assert.equal(manager.listProjects(null).length, 0, 'ninguna consulta sin sesión ve el legado')
  ok('legado sin dueño sigue en cuarentena')

  console.log('\nProjectStore (Fase 1): TODOS LOS TESTS OK')
}

export const testsDone = main().catch((error) => {
  console.error('\nFALLO en ProjectStore (Fase 1):', error)
  process.exitCode = 1
})
