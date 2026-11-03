/**
 * Capa de persistencia local de ArqStudio 3D.
 *
 * Motor: **SQLite vía `sql.js` (WebAssembly)**. Se eligió a propósito frente a
 * un binding nativo porque no exige compilación nativa ni rebuild del ABI de
 * Electron: el `.wasm` se empaqueta tal cual y funciona en cualquier plataforma.
 *
 * Vive en el **proceso main** (tiene `fs` y no sufre las restricciones del
 * renderer) y se expone al renderer por IPC (`registerDatabaseIpc`).
 *
 * Responsabilidades:
 *   - Abrir/crear `arqstudio.db` en el directorio de datos del usuario.
 *   - Migración automática idempotente al arrancar (`CREATE TABLE IF NOT EXISTS`).
 *   - Autocuración: si falta una tabla, se vuelve a crear; se reporta el estado.
 *   - Patrón repositorio: usuarios, proyectos, planos, paredes, objetos y
 *     configuraciones.
 *
 * No crea archivos de respaldo ni copias: el archivo de base de datos es único
 * y se reescribe en cada mutación.
 */
import { ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import initSqlJs from 'sql.js'
import type { Database, ParamsObject, SqlJsStatic, SqlValue } from 'sql.js'

/** Nombre del archivo de base de datos dentro del directorio de datos. */
export const DATABASE_FILENAME = 'arqstudio.db'

/** Versión del esquema. Se registra en `schema_migrations` para poder evolucionar. */
export const SCHEMA_VERSION = 4

/* -------------------------------------------------------------------------- */
/* Esquema                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Sentencias `CREATE TABLE IF NOT EXISTS` indexadas por nombre de tabla. Se
 * guardan por separado (y no en un único blob) para que la autocuración pueda
 * recrear exactamente la tabla que falte.
 */
const CREATE_TABLES: Record<string, string> = {
  usuarios: `CREATE TABLE IF NOT EXISTS usuarios (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,

  proyectos: `CREATE TABLE IF NOT EXISTS proyectos (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    nombre       TEXT NOT NULL,
    modo         TEXT NOT NULL DEFAULT '3D' CHECK (modo IN ('2D', '3D')),
    diseno_index INTEGER NOT NULL DEFAULT 0,
    origen       TEXT NOT NULL DEFAULT 'local',
    cloud_id     TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  )`,

  planos: `CREATE TABLE IF NOT EXISTS planos (
    id          TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    modo        TEXT NOT NULL DEFAULT '3D',
    orden       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,

  paredes: `CREATE TABLE IF NOT EXISTS paredes (
    id            TEXT PRIMARY KEY,
    plano_id      TEXT NOT NULL REFERENCES planos (id) ON DELETE CASCADE,
    tipo          TEXT NOT NULL DEFAULT 'SimpleWall',
    sx REAL NOT NULL DEFAULT 0,
    sy REAL NOT NULL DEFAULT 0,
    sz REAL NOT NULL DEFAULT 0,
    ex REAL NOT NULL DEFAULT 0,
    ey REAL NOT NULL DEFAULT 0,
    ez REAL NOT NULL DEFAULT 0,
    altura        REAL NOT NULL DEFAULT 2.5,
    grosor        REAL NOT NULL DEFAULT 0.2,
    color         INTEGER NOT NULL DEFAULT 14723038,
    ai_controlled INTEGER NOT NULL DEFAULT 0,
    material_id   TEXT
  )`,

  objetos: `CREATE TABLE IF NOT EXISTS objetos (
    id       TEXT PRIMARY KEY,
    plano_id TEXT NOT NULL REFERENCES planos (id) ON DELETE CASCADE,
    kind     TEXT NOT NULL DEFAULT 'furniture',
    nombre   TEXT NOT NULL,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    z REAL NOT NULL DEFAULT 0,
    rot_y    REAL NOT NULL DEFAULT 0,
    ancho    REAL NOT NULL DEFAULT 1,
    alto     REAL NOT NULL DEFAULT 1,
    fondo    REAL NOT NULL DEFAULT 1,
    color    INTEGER,
    props    TEXT,
    shape_id TEXT
  )`,

  configuraciones: `CREATE TABLE IF NOT EXISTS configuraciones (
    clave      TEXT PRIMARY KEY,
    valor      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  texturas: `CREATE TABLE IF NOT EXISTS texturas (
    id          TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    mime        TEXT NOT NULL DEFAULT 'image/png',
    ancho       INTEGER NOT NULL DEFAULT 0,
    alto        INTEGER NOT NULL DEFAULT 0,
    datos       TEXT NOT NULL,
    created_at  TEXT NOT NULL
  )`,

  schema_migrations: `CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`
}

/** Índices de apoyo (también idempotentes). */
const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS proyectos_user_updated_idx ON proyectos (user_id, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS planos_proyecto_idx ON planos (proyecto_id, orden)',
  'CREATE INDEX IF NOT EXISTS paredes_plano_idx ON paredes (plano_id)',
  'CREATE INDEX IF NOT EXISTS objetos_plano_idx ON objetos (plano_id)',
  'CREATE INDEX IF NOT EXISTS texturas_proyecto_idx ON texturas (proyecto_id)'
]

/** Todas las tablas que deben existir: la lista que verifica la autocuración. */
export const REQUIRED_TABLES: readonly string[] = Object.keys(CREATE_TABLES)

/** Script completo de creación; se ejecuta con `exec` (varias sentencias). */
const SCHEMA_SQL = [...Object.values(CREATE_TABLES), ...CREATE_INDEXES, 'PRAGMA foreign_keys = ON;'].join(';\n')

/* -------------------------------------------------------------------------- */
/* Tipos compartidos (espejo de los modelos del renderer)                      */
/* -------------------------------------------------------------------------- */

export interface HealthReport {
  ok: boolean
  engine: string
  databasePath: string
  schemaVersion: number
  tables: string[]
  missingTables: string[]
  /** true si la autocuración tuvo que recrear tablas que faltaban. */
  repaired: boolean
  integrity: string
  error: string | null
}

/** Espejo de `DashboardProject` (renderer) con los nombres de columna locales. */
export interface DbProject {
  id: string
  name: string
  mode: '2D' | '3D'
  designIndex: number
  updatedAt: number
  ownerId: string | null
  source: 'local' | 'cloud'
}

export interface DbWall {
  id: string
  type: string
  start: { x: number; y: number; z: number }
  end: { x: number; y: number; z: number }
  height: number
  thickness: number
  color: number
  aiControlled: boolean
  /** Material del catálogo (Fase 2); null en proyectos anteriores. */
  materialId?: string | null
}

export interface DbObject {
  id: string
  kind: string
  name: string
  position: { x: number; y: number; z: number }
  rotationY: number
  size: { width: number; height: number; depth: number }
  color: number | null
  /** Forma del catálogo (Fase 2); null = caja histórica. */
  shapeId?: string | null
  /** Material del catálogo (Fase 2). */
  materialId?: string | null
  /** Piso al que pertenece (opcional). */
  levelId?: string | null
  /** Props del techo ajustado (opcional). */
  roofProps?: unknown
  /** Capa del dibujo (opcional). */
  layer?: string
  /** Si cuenta en costos (por defecto true). */
  includeInCosts?: boolean
  /** Variante de abertura (opcional). */
  openingVariant?: string | null
  /** Id de la abertura en el muro (opcional). */
  openingId?: string | null
  /** Ángulo de apertura en grados (opcional). */
  openingAngle?: number
  /** Visibilidad individual (opcional). */
  visible?: boolean
}

export interface DbScene {
  planoId: string | null
  walls: DbWall[]
  objects: DbObject[]
  /** Texturas importadas por el proyecto (vacío en proyectos anteriores). */
  textures?: DbTexture[]
}

/** Textura importada por el usuario, almacenada como data-URL en SQLite. */
export interface DbTexture {
  id: string
  projectId: string
  name: string
  mime: string
  width: number
  height: number
  /** Data-URL (`data:image/png;base64,…`) lista para `TextureLoader`. */
  data: string
  createdAt: string
}

export interface DbAuthUser {
  id: string
  email: string
  name: string
  local: true
}

export interface LegacyImportPayload {
  users?: Array<{ id?: string; email: string; name: string; password: string }>
  projects?: Array<{
    id: string
    name: string
    mode: '2D' | '3D'
    designIndex: number
    updatedAt: number
  }>
}

export interface LegacyImportResult {
  users: number
  projects: number
}

/* -------------------------------------------------------------------------- */
/* Proyección de filas                                                        */
/* -------------------------------------------------------------------------- */

/** Fila cruda de `proyectos` tal como la devuelve el driver. */
interface ProjectRow {
  id: string
  user_id: string | null
  nombre: string
  modo: string
  diseno_index: number
  origen: string
  updated_at: string
}

function rowToProject(row: ProjectRow): DbProject {
  return {
    id: String(row.id),
    name: String(row.nombre),
    mode: row.modo === '2D' ? '2D' : '3D',
    designIndex: Number(row.diseno_index ?? 0),
    updatedAt: new Date(String(row.updated_at)).getTime(),
    ownerId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    source: 'local'
  }
}

/** Fila cruda de `paredes`. */
interface WallRow {
  id: string
  tipo: string
  sx: number
  sy: number
  sz: number
  ex: number
  ey: number
  ez: number
  altura: number
  grosor: number
  color: number
  ai_controlled: number
  /** Columna añadida en el esquema v2 (Fase 2). */
  material_id?: string | null
}

/** Fila cruda de `objetos`. */
interface ObjectRow {
  id: string
  kind: string
  nombre: string
  x: number
  y: number
  z: number
  rot_y: number
  ancho: number
  alto: number
  fondo: number
  color: number | null
  props: string | null
  /** Columna añadida en el esquema v2 (Fase 2). */
  shape_id?: string | null
}

/** Fila cruda de `texturas` (esquema v3 · Fase 1 de materiales). */
interface TextureRow {
  id: string
  proyecto_id: string
  nombre: string
  mime: string
  ancho: number
  alto: number
  datos: string
  created_at: string
}

function rowToTexture(row: TextureRow): DbTexture {
  return {
    id: String(row.id),
    projectId: String(row.proyecto_id),
    name: String(row.nombre),
    mime: String(row.mime ?? 'image/png'),
    width: Number(row.ancho ?? 0),
    height: Number(row.alto ?? 0),
    data: String(row.datos),
    createdAt: String(row.created_at)
  }
}

/* -------------------------------------------------------------------------- */
/* DatabaseManager                                                            */
/* -------------------------------------------------------------------------- */

export class DatabaseManager {
  private db: Database | null = null
  private databasePath = ''
  private lastHealth: HealthReport | null = null

  /** Estado de la última verificación, para el diagnóstico del Dashboard. */
  health(): HealthReport {
    return (
      this.lastHealth ?? {
        ok: false,
        engine: 'sql.js (WebAssembly)',
        databasePath: this.databasePath,
        schemaVersion: SCHEMA_VERSION,
        tables: [],
        missingTables: [...REQUIRED_TABLES],
        repaired: false,
        integrity: 'unknown',
        error: 'La base de datos local todavía no se ha inicializado.'
      }
    )
  }

  isReady(): boolean {
    return this.db !== null
  }

  /**
   * Abre (o crea) la base de datos y aplica la migración automática.
   * Nunca lanza: si algo falla devuelve un `HealthReport` con `ok: false` para
   * que la aplicación pueda seguir funcionando con el almacén del navegador.
   */
  async init(options: { baseDir: string; wasmBinary: Uint8Array | null }): Promise<HealthReport> {
    try {
      mkdirSync(options.baseDir, { recursive: true })
      this.databasePath = join(options.baseDir, DATABASE_FILENAME)

      const SQL: SqlJsStatic = await initSqlJs(
        options.wasmBinary ? { wasmBinary: options.wasmBinary } : undefined
      )

      const existing = existsSync(this.databasePath) ? readFileSync(this.databasePath) : null
      // Si el archivo existe pero está corrupto se arranca con una base nueva:
      // la aplicación no debe caerse por un archivo de datos dañado.
      let opened: Database
      try {
        opened = existing && existing.length > 0 ? new SQL.Database(existing) : new SQL.Database()
      } catch {
        opened = new SQL.Database()
      }
      this.db = opened

      this.lastHealth = this.ensureSchema()
      this.persist()
      this.seedDefaults()
      return this.lastHealth
    } catch (error) {
      this.db = null
      this.lastHealth = {
        ok: false,
        engine: 'sql.js (WebAssembly)',
        databasePath: this.databasePath,
        schemaVersion: SCHEMA_VERSION,
        tables: [],
        missingTables: [...REQUIRED_TABLES],
        repaired: false,
        integrity: 'unknown',
        error: error instanceof Error ? error.message : String(error)
      }
      return this.lastHealth
    }
  }

  /**
   * Migración automática + autocuración.
   *
   *   1. Ejecuta el script idempotente (`CREATE TABLE IF NOT EXISTS`).
   *   2. Registra las versiones de esquema pendientes.
   *   3. **Verifica** que estén TODAS las tablas requeridas; si falta alguna,
   *      la recrea una a una (autocuración de segundo nivel).
   *   4. Comprueba la integridad del archivo (`PRAGMA integrity_check`).
   */
  ensureSchema(): HealthReport {
    const db = this.require()

    db.exec(SCHEMA_SQL)
    this.applyMigrations()

    const before = this.listTables()
    const missingBefore = REQUIRED_TABLES.filter((table) => !before.includes(table))

    // Autocuración: recrear explícitamente la tabla que falte.
    for (const table of missingBefore) {
      const statement = CREATE_TABLES[table]
      if (statement) db.exec(statement)
    }
    for (const index of CREATE_INDEXES) db.exec(index)

    const tables = this.listTables()
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table))
    const integrity = this.integrityCheck()

    this.lastHealth = {
      ok: missingTables.length === 0 && integrity === 'ok',
      engine: 'sql.js (WebAssembly)',
      databasePath: this.databasePath,
      schemaVersion: this.currentSchemaVersion(),
      tables,
      missingTables,
      repaired: missingBefore.length > 0 && missingTables.length === 0,
      integrity,
      error: missingTables.length > 0 ? `Faltan tablas: ${missingTables.join(', ')}` : null
    }
    return this.lastHealth
  }

  /** Cierra el archivo de base de datos (se llama al salir de la aplicación). */
  close(): void {
    if (!this.db) return
    try {
      this.persist()
      this.db.close()
    } catch {
      /* el proceso está terminando: no hay nada que recuperar */
    }
    this.db = null
  }

  private require(): Database {
    if (!this.db) throw new Error('La base de datos local no está inicializada.')
    return this.db
  }

  /**
   * Registra las versiones de esquema que aún no estén aplicadas y ejecuta las
   * migraciones pendientes.
   *
   * `CREATE TABLE IF NOT EXISTS` no añade columnas a una base ya existente,
   * así que los campos nuevos (materiales/formas de la Fase 2) llegan con
   * `ALTER TABLE … ADD COLUMN`, que en SQLite es idempotente sólo si se
   * comprueba antes la tabla real: por eso `ensureColumn` pregunta a
   * `PRAGMA table_info` y sólo añade lo que falta. Las filas ya guardadas
   * conservan NULL en los campos nuevos, que el renderer interpreta como
   * «sin material / forma histórica».
   */
  private applyMigrations(): void {
    const db = this.require()
    const applied = new Set(
      this.query<{ version: number }>('SELECT version FROM schema_migrations').map((row) => Number(row.version))
    )
    const now = new Date().toISOString()

    // Migraciones de la Fase 2 (esquema v2): idempotentes por definición.
    this.ensureColumn('paredes', 'material_id', 'TEXT')
    this.ensureColumn('objetos', 'shape_id', 'TEXT')
    // Fase 1 (esquema v4): aislamiento por usuario. bases antiguas creadas
    // antes de la columna `user_id` la reciben aquí sin tocar las filas
    // existentes (quedan como estaban: NULL → en cuarentena, invisibles).
    this.ensureColumn('proyectos', 'user_id', 'TEXT')

    for (let version = 1; version <= SCHEMA_VERSION; version++) {
      if (applied.has(version)) continue
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [version, now])
    }
  }

  /** Añade una columna sólo si la tabla no la tiene todavía. */
  private ensureColumn(table: string, column: string, type: string): void {
    const columns = this.query<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => String(row.name))
    if (columns.length === 0 || columns.includes(column)) return
    this.require().run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }

  private currentSchemaVersion(): number {
    const rows = this.query<{ version: number }>('SELECT MAX(version) AS version FROM schema_migrations')
    const value = rows[0]?.version
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }

  private listTables(): string[] {
    return this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).map((row) => String(row.name))
  }

  private integrityCheck(): string {
    try {
      const rows = this.query<{ integrity_check: string }>('PRAGMA integrity_check')
      return String(rows[0]?.integrity_check ?? 'ok')
    } catch {
      return 'unknown'
    }
  }

  /** Vuelca la base en disco (sql.js mantiene la base en memoria). */
  private persist(): void {
    if (!this.db || !this.databasePath) return
    writeFileSync(this.databasePath, Buffer.from(this.db.export()))
  }

  private query<T>(sql: string, params: SqlValue[] | ParamsObject = []): T[] {
    const statement = this.require().prepare(sql)
    try {
      statement.bind(params as SqlValue[])
      const rows: T[] = []
      while (statement.step()) rows.push(statement.getAsObject() as unknown as T)
      return rows
    } finally {
      statement.free()
    }
  }

  private first<T>(sql: string, params: SqlValue[] | ParamsObject = []): T | undefined {
    return this.query<T>(sql, params)[0]
  }

  /** Ejecuta una sentencia sin volcar a disco (para usar dentro de transacciones). */
  private exec(sql: string, params: SqlValue[] | ParamsObject = []): void {
    this.require().run(sql, params as SqlValue[])
  }

  private write(sql: string, params: SqlValue[] | ParamsObject = []): void {
    this.exec(sql, params)
    this.persist()
  }

  private transaction<T>(fn: () => T): T {
    const db = this.require()
    db.run('BEGIN')
    try {
      const result = fn()
      db.run('COMMIT')
      return result
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  }

  /** Configuraciones por defecto (solo si faltan). */
  private seedDefaults(): void {
    const now = new Date().toISOString()
    const defaults: Array<[string, string]> = [
      ['unidad', 'metros'],
      ['rejilla.visible', 'true'],
      ['rejilla.tamano', '1'],
      ['snap.activo', 'true'],
      ['ortho.activo', 'false'],
      ['tema', 'oscuro']
    ]
    for (const [clave, valor] of defaults) {
      if (!this.first('SELECT clave FROM configuraciones WHERE clave = ?', [clave])) {
        this.write('INSERT INTO configuraciones (clave, valor, updated_at) VALUES (?, ?, ?)', [clave, valor, now])
      }
    }
  }

/* ---------- Repositorio: proyectos ---------- */

  /**
   * true si `userId` es el dueño (`user_id`) del proyecto. Sin sesión
   * (`userId` null/vacío) NUNCA hay propiedad: falla cerrado.
   */
  private ownsProject(projectId: string, userId: string | null | undefined): boolean {
    // Si no hay sesión, ningún proyecto puede guardarse
    if (!userId) return false

    const row = this.first<{ user_id: string | null }>('SELECT user_id FROM proyectos WHERE id = ?', [projectId])
    if (!row || row.user_id === null) {
      // Proyecto legacy (sin user_id): asignar el usuario actual como dueño
      // y permitir el guardado sin perder datos.
      this.write('UPDATE proyectos SET user_id = ? WHERE id = ? AND user_id IS NULL', [userId, projectId])
      return true
    }
    return String(row.user_id) === userId
  }

  /**
   * Proyectos del usuario autenticado.
   *
   * Fase 1 (aislamiento por usuario):
   *   - Sin `userId` (sesión no resuelta) se devuelve **NADA**: la lista de
   *     proyectos exige siempre sesión.
   *   - Solo `WHERE user_id = ?`: las filas sin dueño (`user_id IS NULL`,
   *     legado en cuarentena) no se muestran a NADIE nuevo.
   */
  listProjects(userId: string | null): DbProject[] {
    if (!userId) return []
    const rows = this.query<ProjectRow>('SELECT * FROM proyectos WHERE user_id = ? ORDER BY updated_at DESC', [userId])
    return rows.map(rowToProject)
  }

  getProject(id: string): DbProject | null {
    const row = this.first<ProjectRow>('SELECT * FROM proyectos WHERE id = ?', [id])
    return row ? rowToProject(row) : null
  }

  createProject(input: {
    userId: string | null
    name: string
    mode: '2D' | '3D'
    designIndex?: number
  }): DbProject {
    // Todo proyecto nace con dueño: sin sesión no se crea nada (Fase 1).
    if (!input.userId) {
      throw new Error('No se puede crear un proyecto sin usuario autenticado.')
    }
    const now = new Date().toISOString()
    const id = randomUUID()
    this.write(
      `INSERT INTO proyectos (id, user_id, nombre, modo, diseno_index, origen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'local', ?, ?)`,
      [id, input.userId, input.name, input.mode, input.designIndex ?? 0, now, now]
    )
    // Cada proyecto nace con su plano base: ahí viven las paredes y los objetos.
    this.ensurePlanForProject(id)
    const project = this.getProject(id)
    if (!project) throw new Error('No se pudo crear el proyecto en la base local.')
    return project
  }

  renameProject(id: string, name: string, userId: string | null): DbProject | null {
    if (!this.ownsProject(id, userId)) return null
    this.write('UPDATE proyectos SET nombre = ?, updated_at = ? WHERE id = ? AND user_id = ?', [
      name,
      new Date().toISOString(),
      id,
      userId as string
    ])
    return this.getProject(id)
  }

  removeProject(id: string, userId: string | null): boolean {
    if (!this.ownsProject(id, userId)) return false
    const db = this.require()
    // Borrado explícito de los hijos: depende de `PRAGMA foreign_keys`, así que
    // no se delega en el ON DELETE CASCADE.
    this.transaction(() => {
      db.run('DELETE FROM paredes WHERE plano_id IN (SELECT id FROM planos WHERE proyecto_id = ?)', [id])
      db.run('DELETE FROM objetos WHERE plano_id IN (SELECT id FROM planos WHERE proyecto_id = ?)', [id])
      db.run('DELETE FROM planos WHERE proyecto_id = ?', [id])
      db.run('DELETE FROM proyectos WHERE id = ? AND user_id = ?', [id, userId as string])
    })
    this.persist()
    return true
  }

  touchProject(id: string, userId: string | null): boolean {
    if (!this.ownsProject(id, userId)) return false
    this.write('UPDATE proyectos SET updated_at = ? WHERE id = ? AND user_id = ?', [
      new Date().toISOString(),
      id,
      userId as string
    ])
    return true
  }

  /* ---------- Repositorio: planos ---------- */

  /** Devuelve el id del plano base del proyecto, creándolo si no existe. */
  ensurePlanForProject(projectId: string): string {
    const existing = this.first<{ id: string }>(
      'SELECT id FROM planos WHERE proyecto_id = ? ORDER BY orden LIMIT 1',
      [projectId]
    )
    if (existing) return String(existing.id)

    const project = this.getProject(projectId)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.write(
      'INSERT INTO planos (id, proyecto_id, nombre, modo, orden, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      [id, projectId, 'Plano 1', project?.mode ?? '3D', now, now]
    )
    return id
  }

  listPlanos(projectId: string): Array<{ id: string; name: string; mode: string; order: number }> {
    return this.query<{ id: string; nombre: string; modo: string; orden: number }>(
      'SELECT id, nombre, modo, orden FROM planos WHERE proyecto_id = ? ORDER BY orden',
      [projectId]
    ).map((row) => ({
      id: String(row.id),
      name: String(row.nombre),
      mode: String(row.modo),
      order: Number(row.orden)
    }))
  }

/* ---------- Repositorio: escena (paredes + objetos) ---------- */

  /** Guarda la geometría completa del plano base del proyecto (reemplazo total).
   *
   * `textures` es opcional: si viene (array, aunque vacío), sustituye las
   * texturas importadas del proyecto en la tabla `texturas` y refresca el
   * registro ligero `arqstudio.texture.<id>` en `configuraciones` (metadatos
   * sin el binario, para listar texturas sin leer los data-URLs).
   */
  saveScene(
    projectId: string,
    walls: DbWall[],
    objects: DbObject[],
    textures?: DbTexture[],
    userId: string | null = null
  ): { planoId: string; walls: number; objects: number; textures: number } {
    if (!this.getProject(projectId)) {
      throw new Error(`El proyecto «${projectId}» no existe en la base local.`)
    }
    // Fase 1: solo el dueño puede escribir la escena (falla cerrado).
    if (!this.ownsProject(projectId, userId)) {
      throw new Error('No tienes permiso para modificar este proyecto.')
    }
    const planoId = this.ensurePlanForProject(projectId)
    const db = this.require()
    const now = new Date().toISOString()

    this.transaction(() => {
      db.run('DELETE FROM paredes WHERE plano_id = ?', [planoId])
      db.run('DELETE FROM objetos WHERE plano_id = ?', [planoId])

      for (const wall of walls) {
        db.run(
          `INSERT INTO paredes (id, plano_id, tipo, sx, sy, sz, ex, ey, ez, altura, grosor, color, ai_controlled, material_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            wall.id,
            planoId,
            wall.type,
            wall.start.x,
            wall.start.y,
            wall.start.z,
            wall.end.x,
            wall.end.y,
            wall.end.z,
            wall.height,
            wall.thickness,
            wall.color,
            wall.aiControlled ? 1 : 0,
            wall.materialId ?? null
          ]
        )
      }

      for (const object of objects) {
        db.run(
          `INSERT INTO objetos (id, plano_id, kind, nombre, x, y, z, rot_y, ancho, alto, fondo, color, props, shape_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            object.id,
            planoId,
            object.kind,
            object.name,
            object.position.x,
            object.position.y,
            object.position.z,
            object.rotationY,
            object.size.width,
            object.size.height,
            object.size.depth,
            object.color,
            // `materialId` y metadatos adicionales viajan en la columna JSON `props`,
            // que ya existía: así los objetos antiguos siguen leyéndose igual.
            JSON.stringify({
              materialId: object.materialId ?? null,
              levelId: object.levelId ?? null,
              roofProps: object.roofProps ?? null,
              layer: object.layer ?? undefined,
              includeInCosts: object.includeInCosts ?? true,
              openingVariant: object.openingVariant ?? null,
              openingId: object.openingId ?? null,
              openingAngle: object.openingAngle ?? 0,
              visible: object.visible ?? true
            }),
            object.shapeId ?? null
          ]
        )
      }

      db.run('UPDATE proyectos SET updated_at = ? WHERE id = ?', [now, projectId])
      db.run('UPDATE planos SET updated_at = ? WHERE id = ?', [now, planoId])

      if (textures) {
        // Reemplazo total de las texturas del proyecto + registro ligero.
        const previous = this.query<{ id: string }>('SELECT id FROM texturas WHERE proyecto_id = ?', [projectId]).map(
          (row) => String(row.id)
        )
        db.run('DELETE FROM texturas WHERE proyecto_id = ?', [projectId])
        const live = new Set(textures.map((tex) => tex.id))
        for (const id of previous) {
          if (!live.has(id)) db.run('DELETE FROM configuraciones WHERE clave = ?', [`arqstudio.texture.${id}`])
        }
        for (const tex of textures) {
          db.run(
            `INSERT INTO texturas (id, proyecto_id, nombre, mime, ancho, alto, datos, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [tex.id, projectId, tex.name, tex.mime, tex.width, tex.height, tex.data, tex.createdAt || now]
          )
          db.run(
            `INSERT INTO configuraciones (clave, valor, updated_at) VALUES (?, ?, ?)
             ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
            [
              `arqstudio.texture.${tex.id}`,
              JSON.stringify({
                projectId,
                name: tex.name,
                mime: tex.mime,
                width: tex.width,
                height: tex.height,
                createdAt: tex.createdAt || now
              }),
              now
            ]
          )
        }
      }
    })
    this.persist()
    return { planoId, walls: walls.length, objects: objects.length, textures: textures?.length ?? 0 }
  }

/** Lee la geometría guardada del proyecto (o una escena vacía si aún no hay nada). */
  loadScene(projectId: string, userId: string | null = null): DbScene {
    // Fase 1: leer la escena exige ser dueño (nadie abre proyectos ajenos
    // ni siquiera pasando el id a mano). Falla cerrado.
    if (!this.ownsProject(projectId, userId)) {
      throw new Error('No tienes permiso para abrir este proyecto.')
    }
    const textures = this.query<TextureRow>('SELECT * FROM texturas WHERE proyecto_id = ? ORDER BY created_at', [
      projectId
    ]).map(rowToTexture)
    const plano = this.first<{ id: string }>(
      'SELECT id FROM planos WHERE proyecto_id = ? ORDER BY orden LIMIT 1',
      [projectId]
    )
    if (!plano) return { planoId: null, walls: [], objects: [], textures }
    const planoId = String(plano.id)

    const walls = this.query<WallRow>('SELECT * FROM paredes WHERE plano_id = ?', [planoId]).map<DbWall>((row) => ({
      id: String(row.id),
      type: String(row.tipo),
      start: { x: Number(row.sx), y: Number(row.sy), z: Number(row.sz) },
      end: { x: Number(row.ex), y: Number(row.ey), z: Number(row.ez) },
      height: Number(row.altura),
      thickness: Number(row.grosor),
      color: Number(row.color),
      aiControlled: Number(row.ai_controlled) === 1,
      // NULL en muros guardados antes de la Fase 2 → sin material.
      materialId: row.material_id ?? null
    }))

    const objects = this.query<ObjectRow>('SELECT * FROM objetos WHERE plano_id = ?', [planoId]).map<DbObject>(
      (row) => {
        // `props` es JSON libre; se lee tolerante (filas antiguas: NULL o vacío).
        let materialId: string | null = null
        let levelId: string | null = null
        let roofProps: unknown = null
        let layer: string | undefined = undefined
        let includeInCosts = true
        let openingVariant: string | null = null
        let openingId: string | null = null
        let openingAngle = 0
        let visible = true
        if (row.props) {
          try {
            const parsed = JSON.parse(row.props) as {
              materialId?: string | null
              levelId?: string | null
              roofProps?: unknown
              layer?: string
              includeInCosts?: boolean
              openingVariant?: string | null
              openingId?: string | null
              openingAngle?: number
              visible?: boolean
            }
            materialId = parsed.materialId ?? null
            levelId = parsed.levelId ?? null
            roofProps = parsed.roofProps ?? null
            layer = parsed.layer
            includeInCosts = parsed.includeInCosts ?? true
            openingVariant = parsed.openingVariant ?? null
            openingId = parsed.openingId ?? null
            openingAngle = parsed.openingAngle ?? 0
            visible = parsed.visible ?? true
          } catch {
            materialId = null
          }
        }
        return {
          id: String(row.id),
          kind: String(row.kind),
          name: String(row.nombre),
          position: { x: Number(row.x), y: Number(row.y), z: Number(row.z) },
          rotationY: Number(row.rot_y),
          size: { width: Number(row.ancho), height: Number(row.alto), depth: Number(row.fondo) },
          color: row.color === null || row.color === undefined ? null : Number(row.color),
          // NULL en objetos antiguos → el motor dibuja la caja histórica.
          shapeId: row.shape_id ?? null,
          materialId,
          levelId,
          roofProps,
          layer,
          includeInCosts,
          openingVariant,
          openingId,
          openingAngle,
          visible
        }
      }
    )

    return { planoId, walls, objects, textures }
  }

  /* ---------- Repositorio: texturas importadas ---------- */

  /**
   * Crea (o actualiza) una textura importada por el usuario y la registra en
   * `configuraciones` bajo `arqstudio.texture.<id>`.
   */
  createTexture(input: {
    projectId: string
    id?: string
    name: string
    mime?: string
    width?: number
    height?: number
    data: string
    userId?: string | null
  }): DbTexture {
    if (!this.getProject(input.projectId)) {
      throw new Error(`El proyecto «${input.projectId}» no existe en la base local.`)
    }
    // Fase 1: el contenido importado queda bajo el owner del proyecto.
    if (!this.ownsProject(input.projectId, input.userId)) {
      throw new Error('No tienes permiso para añadir texturas a este proyecto.')
    }
    const texture: DbTexture = {
      id: input.id || `tex-${randomUUID()}`,
      projectId: input.projectId,
      name: input.name,
      mime: input.mime || 'image/png',
      width: input.width ?? 0,
      height: input.height ?? 0,
      data: input.data,
      createdAt: new Date().toISOString()
    }
    this.write(
      `INSERT INTO texturas (id, proyecto_id, nombre, mime, ancho, alto, datos, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         nombre = excluded.nombre, mime = excluded.mime, ancho = excluded.ancho,
         alto = excluded.alto, datos = excluded.datos`,
      [
        texture.id,
        texture.projectId,
        texture.name,
        texture.mime,
        texture.width,
        texture.height,
        texture.data,
        texture.createdAt
      ]
    )
    this.setSetting(
      `arqstudio.texture.${texture.id}`,
      JSON.stringify({
        projectId: texture.projectId,
        name: texture.name,
        mime: texture.mime,
        width: texture.width,
        height: texture.height,
        createdAt: texture.createdAt
      })
    )
    return texture
  }

  /** Texturas de un proyecto (incluye el data-URL: la paleta necesita las miniaturas). */
  listTextures(projectId: string, userId: string | null = null): DbTexture[] {
    if (!this.ownsProject(projectId, userId)) return []
    return this.query<TextureRow>('SELECT * FROM texturas WHERE proyecto_id = ? ORDER BY created_at DESC', [
      projectId
    ]).map(rowToTexture)
  }

  getTexture(id: string, userId: string | null = null): DbTexture | null {
    const row = this.first<TextureRow>('SELECT * FROM texturas WHERE id = ?', [id])
    if (!row) return null
    if (!this.ownsProject(String(row.proyecto_id), userId)) return null
    return rowToTexture(row)
  }

  deleteTexture(id: string, userId: string | null = null): boolean {
    const row = this.first<{ id: string; proyecto_id: string }>('SELECT id, proyecto_id FROM texturas WHERE id = ?', [
      id
    ])
    if (!row) return false
    if (!this.ownsProject(String(row.proyecto_id), userId)) return false
    this.write('DELETE FROM texturas WHERE id = ?', [id])
    this.write('DELETE FROM configuraciones WHERE clave = ?', [`arqstudio.texture.${id}`])
    return true
  }

  /* ---------- Repositorio: configuraciones ---------- */

  getSetting(clave: string): string | null {
    const row = this.first<{ valor: string }>('SELECT valor FROM configuraciones WHERE clave = ?', [clave])
    return row ? String(row.valor) : null
  }

  setSetting(clave: string, valor: string): void {
    this.write(
      `INSERT INTO configuraciones (clave, valor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
      [clave, valor, new Date().toISOString()]
    )
  }

  listSettings(): Array<{ key: string; value: string }> {
    return this.query<{ clave: string; valor: string }>(
      'SELECT clave, valor FROM configuraciones ORDER BY clave'
    ).map((row) => ({ key: String(row.clave), value: String(row.valor) }))
  }

/* ---------- Repositorio: usuarios (modo local) ---------- */

  /** Deriva el hash de la contraseña con scrypt + sal por usuario. */
  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex')
  }

  signUpUser(input: { name: string; email: string; password: string }): { user?: DbAuthUser; error?: string } {
    const email = input.email.trim().toLowerCase()
    if (!email || !input.password) return { error: 'Completa el correo y la contraseña.' }
    if (this.first('SELECT id FROM usuarios WHERE email = ?', [email])) {
      return { error: 'Ese correo ya tiene una cuenta: inicia sesión.' }
    }

    const name = input.name.trim() || email
    const salt = randomBytes(16).toString('hex')
    const id = `local-${randomUUID()}`
    const now = new Date().toISOString()
    this.write(
      `INSERT INTO usuarios (id, email, nombre, password_hash, password_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, email, name, this.hashPassword(input.password, salt), salt, now, now]
    )
    return { user: { id, email, name, local: true } }
  }

  signInUser(input: { email: string; password: string }): { user?: DbAuthUser; error?: string } {
    const email = input.email.trim().toLowerCase()
    const row = this.first<{ id: string; email: string; nombre: string; password_hash: string; password_salt: string }>(
      'SELECT id, email, nombre, password_hash, password_salt FROM usuarios WHERE email = ?',
      [email]
    )
    if (!row) return { error: 'Correo o contraseña incorrectos.' }

    const expected = Buffer.from(String(row.password_hash), 'hex')
    const actual = Buffer.from(this.hashPassword(input.password, String(row.password_salt)), 'hex')
    // Comparación en tiempo constante para no filtrar información por longitud.
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { error: 'Correo o contraseña incorrectos.' }
    }
    return { user: { id: String(row.id), email: String(row.email), name: String(row.nombre), local: true } }
  }

  /**
   * Migración de curación: importa a SQLite los datos que versiones anteriores
   * guardaban en `localStorage` (usuarios y proyectos), sin duplicar lo que ya
   * exista. Devuelve cuántos registros se incorporaron.
   */
  importLegacy(payload: LegacyImportPayload): LegacyImportResult {
    const result: LegacyImportResult = { users: 0, projects: 0 }
    const now = new Date().toISOString()

    for (const user of payload.users ?? []) {
      const email = user.email.trim().toLowerCase()
      if (!email || this.first('SELECT id FROM usuarios WHERE email = ?', [email])) continue
      const salt = randomBytes(16).toString('hex')
      this.write(
        `INSERT INTO usuarios (id, email, nombre, password_hash, password_salt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id ?? `local-${randomUUID()}`,
          email,
          user.name?.trim() || email,
          this.hashPassword(user.password ?? '', salt),
          salt,
          now,
          now
        ]
      )
      result.users += 1
    }

    for (const project of payload.projects ?? []) {
      if (this.first('SELECT id FROM proyectos WHERE id = ?', [project.id])) continue
      const updatedAt = new Date(project.updatedAt || Date.now()).toISOString()
      this.write(
        `INSERT INTO proyectos (id, user_id, nombre, modo, diseno_index, origen, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, 'local', ?, ?)`,
        [project.id, project.name, project.mode === '2D' ? '2D' : '3D', project.designIndex ?? 0, updatedAt, updatedAt]
      )
      this.ensurePlanForProject(project.id)
      result.projects += 1
    }

    return result
  }
}

/** Instancia única compartida por el proceso main. */
export const database = new DatabaseManager()

/* -------------------------------------------------------------------------- */
/* Puente IPC                                                                 */
/* -------------------------------------------------------------------------- */

/** Resultado uniforme de cualquier operación de base de datos. */
export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * Registra un handler que **nunca** propaga una excepción al renderer: si algo
 * falla, el renderer recibe `{ ok: false, error }` y decide cómo degradar. Así
 * una tabla ausente o un dato corrupto no puede tirar la interfaz.
 */
function handle<P, T>(channel: string, run: (payload: P) => T): void {
  ipcMain.handle(channel, (_event, payload: unknown): IpcResult<T> => {
    try {
      return { ok: true, data: run(payload as P) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

/** Canales que consume `renderer/src/services/DatabaseService.ts`. */
export function registerDatabaseIpc(): void {
  /* Salud y autocuración */
  handle<undefined, HealthReport>('db:health', () => database.health())
  handle<undefined, HealthReport>('db:ensure-schema', () => database.ensureSchema())

  /* Proyectos */
  handle<{ userId: string | null }, DbProject[]>('db:projects:list', (payload) =>
    database.listProjects(payload?.userId ?? null)
  )
  handle<{ userId: string | null; name: string; mode: string; designIndex?: number }, DbProject>(
    'db:projects:create',
    (payload) =>
      database.createProject({
        userId: payload?.userId ?? null,
        name: payload.name,
        mode: payload.mode === '2D' ? '2D' : '3D',
        designIndex: payload.designIndex
      })
  )
  handle<{ id: string; name: string; userId: string | null }, DbProject | null>('db:projects:rename', (payload) =>
    database.renameProject(payload.id, payload.name, payload?.userId ?? null)
  )
  handle<{ id: string; userId: string | null }, boolean>('db:projects:remove', (payload) =>
    database.removeProject(payload.id, payload?.userId ?? null)
  )
  handle<{ id: string; userId: string | null }, boolean>('db:projects:touch', (payload) =>
    database.touchProject(payload.id, payload?.userId ?? null)
  )

  /* Escena (paredes + objetos + texturas importadas). Siempre viaja el
     owner_id del usuario autenticado: sin userId la operación se rechaza. */
  handle<
    { projectId: string; walls: DbWall[]; objects: DbObject[]; textures?: DbTexture[]; userId?: string | null },
    { planoId: string; walls: number; objects: number; textures: number }
  >('db:scene:save', (payload) =>
    database.saveScene(
      payload.projectId,
      payload.walls ?? [],
      payload.objects ?? [],
      payload.textures,
      payload?.userId ?? null
    )
  )
  handle<{ projectId: string; userId?: string | null }, DbScene>('db:scene:load', (payload) =>
    database.loadScene(payload.projectId, payload?.userId ?? null)
  )

  /* Texturas importadas (esquema v3) */
  handle<
    {
      projectId: string
      id?: string
      name: string
      mime?: string
      width?: number
      height?: number
      data: string
      userId?: string | null
    },
    DbTexture
  >('db:textures:create', (payload) => database.createTexture(payload))
  handle<{ projectId: string; userId?: string | null }, DbTexture[]>('db:textures:list', (payload) =>
    database.listTextures(payload.projectId, payload?.userId ?? null)
  )
  handle<{ id: string; userId?: string | null }, DbTexture | null>('db:textures:get', (payload) =>
    database.getTexture(payload.id, payload?.userId ?? null)
  )
  handle<{ id: string; userId?: string | null }, boolean>('db:textures:delete', (payload) =>
    database.deleteTexture(payload.id, payload?.userId ?? null)
  )

  /* Configuraciones */
  handle<undefined, Array<{ key: string; value: string }>>('db:settings:list', () => database.listSettings())
  handle<{ clave: string }, string | null>('db:settings:get', (payload) => database.getSetting(payload.clave))
  handle<{ clave: string; valor: string }, boolean>('db:settings:set', (payload) => {
    database.setSetting(payload.clave, payload.valor)
    return true
  })

  /* Usuarios del modo local */
  handle<{ name: string; email: string; password: string }, { user?: DbAuthUser; error?: string }>(
    'db:auth:signUp',
    (payload) => database.signUpUser(payload)
  )
  handle<{ email: string; password: string }, { user?: DbAuthUser; error?: string }>('db:auth:signIn', (payload) =>
    database.signInUser(payload)
  )

  /* Curación: importar lo que versiones anteriores guardaban en localStorage */
  handle<LegacyImportPayload, LegacyImportResult>('db:legacy:import', (payload) =>
    database.importLegacy(payload ?? {})
  )
}