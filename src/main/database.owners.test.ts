/**
 * Tests Fase 1 — aislamiento por usuario en la capa de datos local (SQLite).
 *
 * Ejecución: `node scripts/_run-projects-tests.mjs` (esbuild + node puro,
 * igual que los runners de costos/cerebro).
 *
 * Cubre las pruebas exigidas:
 *   - usuario A crea 2 proyectos → B nuevo ve 0
 *   - B no puede leer ni abrir los de A (ni por id directo)
 *   - sin sesión se ven 0
 *   - proyectos legado sin dueño → en cuarentena (no se ven a nadie)
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseManager } from './database'

const wasmBinary = readFileSync(join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))

function ok(message: string): void {
  console.log(`ok - ${message}`)
}

async function main(): Promise<void> {
  const manager = new DatabaseManager()
  const health = await manager.init({ baseDir: mkdtempSync(join(tmpdir(), 'arq-db-')), wasmBinary })
  assert.equal(health.ok, true, 'el esquema se crea completo: ' + JSON.stringify(health))
  ok('esquema local creado (schema v' + health.schemaVersion + ')')

  // 1) Sin sesión → 0 proyectos (la lista exige userId).
  assert.deepEqual(manager.listProjects(null), [], 'sin sesión → 0 proyectos')
  ok('sin sesión la lista está vacía')

  // 2) El usuario A crea 2 proyectos.
  const a1 = manager.createProject({ userId: 'user-a', name: 'Primera casa de A', mode: '3D' })
  manager.createProject({ userId: 'user-a', name: 'Segundo proyecto de A', mode: '2D' })
  const listA = manager.listProjects('user-a')
  assert.equal(listA.length, 2, 'A ve exactamente sus 2 proyectos')
  ok('usuario A crea 2 proyectos y los ve')

  // 3) Usuario B nuevo → 0 (nada de semillas, nada de los otros).
  assert.equal(manager.listProjects('user-b').length, 0, 'B nuevo ve 0')
  ok('usuario B nuevo ve 0 proyectos')

  // 4) B no puede tocar los proyectos de A ni por id directo.
  assert.equal(manager.renameProject(a1.id, 'hackeado', 'user-b'), null, 'rename ajeno → null')
  assert.equal(manager.removeProject(a1.id, 'user-b'), false, 'borrado ajeno → false')
  assert.equal(manager.touchProject(a1.id, 'user-b'), false, 'touch ajeno → false')
  assert.equal(
    manager.listProjects('user-a').find((project) => project.id === a1.id)?.name,
    'Primera casa de A',
    'el nombre de A sigue intacto tras el intento de B'
  )
  ok('B no puede renombrar/borrar/tocar proyectos de A')

  // 5) B no puede LEER ni ABRIR la escena de A (ni pasando el id a mano).
  assert.throws(() => manager.loadScene(a1.id, 'user-b'), /permiso/, 'loadScene ajeno → rechazado')
  assert.throws(() => manager.loadScene(a1.id, null), /permiso/, 'loadScene sin sesión → rechazado')
  assert.throws(
    () => manager.saveScene(a1.id, [], [], undefined, 'user-b'),
    /permiso/,
    'saveScene ajeno → rechazado'
  )
  assert.equal(manager.listTextures(a1.id, 'user-b').length, 0, 'texturas ajenas → 0')
  ok('B no puede abrir la escena de A ni por id directo')

  // 6) A sí puede guardar y leer su propia escena.
  manager.saveScene(
    a1.id,
    [
      {
        id: 'wall-1',
        type: 'SimpleWall',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 4, y: 0, z: 0 },
        height: 2.7,
        thickness: 0.2,
        color: 0xe6e4e0,
        aiControlled: false
      }
    ],
    [],
    undefined,
    'user-a'
  )
  const sceneA = manager.loadScene(a1.id, 'user-a')
  assert.equal(sceneA.walls.length, 1, 'A lee su escena')
  ok('A guarda y lee su propia escena')

  // 7) Proyecto legado sin dueño → cuarentena: nadie lo ve.
  manager.importLegacy({
    projects: [{ id: 'legacy-1', name: 'primera casa', mode: '3D', designIndex: 0, updatedAt: Date.now() }]
  })
  assert.equal(
    manager.listProjects('user-a').filter((project) => project.id === 'legacy-1').length,
    0,
    'A no ve el legado sin dueño'
  )
  assert.equal(
    manager.listProjects('user-b').filter((project) => project.id === 'legacy-1').length,
    0,
    'B no ve el legado sin dueño'
  )
  assert.equal(manager.listProjects(null).length, 0, 'sin sesión tampoco se ve el legado')
  ok('proyecto legado sin dueño queda en cuarentena')

  // 8) Sin usuario autenticado no se puede crear (todo proyecto tiene owner).
  assert.throws(() => manager.createProject({ userId: null, name: 'sin dueño', mode: '3D' }), /autenticado/)
  ok('crear sin sesión → rechazado')

  // 9) Tras "cerrar sesión" y entrar con B, no queda rastro de A.
  assert.equal(manager.listProjects('user-b').length, 0, 'B sigue viendo 0 tras todo el recorrido')
  assert.equal(manager.listProjects('user-a').length, 2, 'A mantiene exactamente sus 2')
  ok('cambio de cuenta sin rastros cruzados')

  console.log('\nDatabaseManager (Fase 1): TODOS LOS TESTS OK')
}

export const testsDone = main().catch((error) => {
  console.error('\nFALLO en DatabaseManager (Fase 1):', error)
  process.exitCode = 1
})
