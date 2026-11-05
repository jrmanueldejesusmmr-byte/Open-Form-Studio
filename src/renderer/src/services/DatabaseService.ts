/**
 * Servicio centralizado de datos del renderer.
 *
 * Es la única puerta de entrada a la **base de datos local SQLite** (que vive en
 * el proceso main y se consume por IPC) y el responsable de la **curación**:
 *
 *   a) **Verificación**  — pregunta el estado de la base y del esquema.
 *   b) **Detección**     — clasifica los errores de Supabase (tabla ausente, RLS,
 *      timeout, red) para decidir si hay que conmutar de motor.
 *   c) **Autocuración**  — pide `ensureSchema()` (migración + recreación de tablas)
 *      y, si la base local no está disponible, cada operación devuelve `null`
 *      para que la capa superior use el almacén del navegador. La UI nunca se
 *      queda en una pantalla de error.
 *   d) **Verificación de tablas locales** — `verify()` comprueba que existan
 *      usuarios, proyectos, planos, paredes, objetos y configuraciones.
 */
import type { DashboardProject, ProjectMode } from '../models/DashboardProject'

/** Respuesta uniforme de todos los canales `db:*` (nunca lanzan). */
interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface DatabaseHealth {
  ok: boolean
  engine: string
  databasePath: string
  schemaVersion: number
  tables: string[]
  missingTables: string[]
  repaired: boolean
  integrity: string
  error: string | null
}

export interface SceneWall {
  id: string
  type: string
  start: { x: number; y: number; z: number }
  end: { x: number; y: number; z: number }
  height: number
  thickness: number
  color: number
  aiControlled: boolean
  /** Material del catálogo (Fase 2). Opcional: las filas antiguas no lo traen. */
  materialId?: string | null
  /** Aberturas del muro (puertas/ventanas). */
  openings?: import('../models/Opening').Opening[]
  /** Piso al que pertenece el muro. */
  levelId?: string
  /** Visibilidad individual del muro. */
  visible?: boolean
}

export interface SceneObject {
  id: string
  kind: string
  name: string
  position: { x: number; y: number; z: number }
  rotationY: number
  size: { width: number; height: number; depth: number }
  color: number | null
  /** Id de forma del catálogo (Fase 2). Opcional en proyectos anteriores. */
  shapeId?: string | null
  /** Material del catálogo (Fase 2). Opcional en proyectos anteriores. */
  materialId?: string | null
  /** Piso al que pertenece (opcional; nivel-0 por defecto). */
  levelId?: string | null
  /** Props del techo ajustado (opcional; solo para objetos de tipo 'roof'). */
  roofProps?: unknown
  /** Capa del dibujo (p. ej. «importado»). */
  layer?: string
  /** Si el objeto cuenta en el panel de Costos. */
  includeInCosts?: boolean
  /** Variante de abertura (`simple`, `doble`, `corrediza`, `vidrio`…). */
  openingVariant?: string | null
  /** Id de la abertura en el muro a la que pertenece este objeto. */
  openingId?: string | null
  /** Ángulo de apertura de la hoja en grados. */
  openingAngle?: number
  /** Visibilidad individual del objeto. */
  visible?: boolean
  /** Parámetros estructurales dinámicos (`struct.*` / `geo.*`). */
  structuralParams?: unknown
  /** Malla y cotas de terreno topográfico (`topo.terrain`). */
  terrainData?: unknown
}

export interface SceneData {
  planoId: string | null
  walls: SceneWall[]
  objects: SceneObject[]
  /** Texturas importadas del proyecto (vacío en proyectos anteriores). */
  textures?: SceneTexture[]
}

/** Textura importada por el usuario (data-URL) persistida en la tabla `texturas`. */
export interface SceneTexture {
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

export interface LocalAuthUser {
  id: string
  email: string
  name: string
  local: true
}

export interface LocalAuthResult {
  user?: LocalAuthUser
  error?: string
}

export interface LegacyImportPayload {
  users?: Array<{ id?: string; email: string; name: string; password: string }>
  projects?: Array<{ id: string; name: string; mode: ProjectMode; designIndex: number; updatedAt: number }>
}

export interface LegacyImportResult {
  users: number
  projects: number
}

/** Forma de `window.arqStudio.db` expuesta por `src/preload/index.ts`. */
interface DbBridge {
  health(): Promise<IpcResult<DatabaseHealth>>
  ensureSchema(): Promise<IpcResult<DatabaseHealth>>
  listProjects(payload: { userId: string | null }): Promise<IpcResult<DashboardProject[]>>
  createProject(payload: {
    userId: string | null
    name: string
    mode: string
    designIndex?: number
  }): Promise<IpcResult<DashboardProject>>
  renameProject(payload: { id: string; name: string; userId: string | null }): Promise<IpcResult<DashboardProject | null>>
  removeProject(payload: { id: string; userId: string | null }): Promise<IpcResult<boolean>>
  touchProject(payload: { id: string; userId: string | null }): Promise<IpcResult<boolean>>
  saveScene(payload: {
    projectId: string
    walls: SceneWall[]
    objects: SceneObject[]
    textures?: SceneTexture[]
    userId: string | null
  }): Promise<IpcResult<{ planoId: string; walls: number; objects: number; textures: number }>>
  loadScene(payload: { projectId: string; userId: string | null }): Promise<IpcResult<SceneData>>
  createTexture(payload: {
    projectId: string
    id?: string
    name: string
    mime?: string
    width?: number
    height?: number
    data: string
    userId: string | null
  }): Promise<IpcResult<SceneTexture>>
  listTextures(payload: { projectId: string; userId: string | null }): Promise<IpcResult<SceneTexture[]>>
  getTexture(payload: { id: string; userId: string | null }): Promise<IpcResult<SceneTexture | null>>
  deleteTexture(payload: { id: string; userId: string | null }): Promise<IpcResult<boolean>>
  listSettings(): Promise<IpcResult<Array<{ key: string; value: string }>>>
  getSetting(payload: { clave: string }): Promise<IpcResult<string | null>>
  setSetting(payload: { clave: string; valor: string }): Promise<IpcResult<boolean>>
  signUp(payload: { name: string; email: string; password: string }): Promise<IpcResult<LocalAuthResult>>
  signIn(payload: { email: string; password: string }): Promise<IpcResult<LocalAuthResult>>
  importLegacy(payload: LegacyImportPayload): Promise<IpcResult<LegacyImportResult>>
}

function dbBridge(): DbBridge | undefined {
  const holder = window as unknown as { arqStudio?: { db?: DbBridge } }
  return holder.arqStudio?.db
}

/* -------------------------------------------------------------------------- */
/* Clasificación de errores de Supabase (detección de la curación)            */
/* -------------------------------------------------------------------------- */

export interface CloudErrorClassification {
  /** Mensaje listo para mostrar en la UI. */
  message: string
  /** true cuando conviene conmutar al motor local en lugar de reintentar. */
  fallback: boolean
}

/**
 * Traduce y clasifica un error de Supabase. Los casos «la tabla no existe»,
 * «RLS bloquea» y «no hay red» marcan `fallback: true`: la aplicación debe
 * seguir trabajando con la base local sin mostrar una pantalla de error.
 */
export function classifyCloudError(message: string, code?: string): CloudErrorClassification {
  const text = (message || '').toLowerCase()

  if (code === '42P01' || code === 'PGRST205' || text.includes('schema cache') || text.includes('does not exist')) {
    return {
      message:
        'No se encontró la tabla «proyectos» en tu Supabase. Se ha activado la base de datos local para que no pierdas el trabajo (ejecuta supabase/schema.sql para volver a la nube).',
      fallback: true
    }
  }
  if (code === '42703' || (text.includes('column') && text.includes('does not exist'))) {
    return {
      message:
        'La tabla «proyectos» no tiene las columnas de ArqStudio. Se sigue trabajando con la base local (ejecuta supabase/schema.sql para repararla).',
      fallback: true
    }
  }
  if (code === '42501' || text.includes('row-level security') || text.includes('permission denied')) {
    return {
      message:
        'Supabase bloqueó la consulta por las políticas RLS. Se sigue trabajando con la base local (revisa las políticas en supabase/schema.sql).',
      fallback: true
    }
  }
  if (text.includes('failed to fetch') || text.includes('network') || text.includes('timeout') || text.includes('abort')) {
    return {
      message: 'Sin conexión con Supabase. Se ha activado la base de datos local para seguir trabajando.',
      fallback: true
    }
  }
  return { message: message || 'No se pudo sincronizar con Supabase.', fallback: true }
}

/* -------------------------------------------------------------------------- */
/* Servicio                                                                   */
/* -------------------------------------------------------------------------- */

/** Modo de datos activo. */
export type DataMode = 'cloud' | 'sqlite' | 'browser'

export class DatabaseService {
  private mode: DataMode = 'browser'
  private healthReport: DatabaseHealth | null = null
  private verification: Promise<DatabaseHealth | null> | null = null

  /** true si el puente IPC está disponible (la app corre dentro de Electron). */
  isAvailable(): boolean {
    return dbBridge() !== undefined
  }

  getMode(): DataMode {
    return this.mode
  }

  setCloudMode(): void {
    this.mode = 'cloud'
  }

  getHealth(): DatabaseHealth | null {
    return this.healthReport
  }

  /** Descripción corta para la pantalla de configuración del Dashboard. */
  describeMode(): string {
    if (this.mode === 'cloud') return 'Nube (Supabase)'
    if (this.mode === 'sqlite') {
      return this.healthReport?.repaired ? 'SQLite local (autocurada)' : 'SQLite local'
    }
    return 'Almacén del navegador (respaldo)'
  }

  /**
   * (a) Verificación + (c/d) autocuración y comprobación de tablas.
   * Se ejecuta una sola vez por sesión (el resultado se memoiza).
   */
  verify(): Promise<DatabaseHealth | null> {
    this.verification ??= this.runVerification()
    return this.verification
  }

  private async runVerification(): Promise<DatabaseHealth | null> {
    if (!dbBridge()) {
      this.mode = 'browser'
      return null
    }
    let health = await this.call((db) => db.health())
    // Autocuración: si el esquema está incompleto, se pide reconstruirlo.
    if (!health || health.ok !== true || health.missingTables.length > 0) {
      const repaired = await this.call((db) => db.ensureSchema())
      if (repaired) health = repaired
    }
    this.healthReport = health
    this.mode = health?.ok ? 'sqlite' : 'browser'
    if (health?.missingTables.length) {
      console.warn('[ArqStudio] La base local no tiene todas las tablas:', health.missingTables.join(', '))
    }
    return health
  }

  /* ---------- Repositorio: proyectos ---------- */

  listProjects(userId: string | null): Promise<DashboardProject[] | null> {
    return this.call((db) => db.listProjects({ userId }))
  }

  createProject(input: {
    userId: string | null
    name: string
    mode: ProjectMode
    designIndex?: number
  }): Promise<DashboardProject | null> {
    return this.call((db) =>
      db.createProject({
        userId: input.userId,
        name: input.name,
        mode: input.mode,
        designIndex: input.designIndex
      })
    )
  }

  renameProject(id: string, name: string, userId: string | null): Promise<DashboardProject | null> {
    return this.call((db) => db.renameProject({ id, name, userId }))
  }

  async removeProject(id: string, userId: string | null): Promise<boolean> {
    return (await this.call((db) => db.removeProject({ id, userId }))) === true
  }

  async touchProject(id: string, userId: string | null): Promise<boolean> {
    return (await this.call((db) => db.touchProject({ id, userId }))) === true
  }

  /* ---------- Repositorio: escena ---------- */

  async saveScene(
    projectId: string,
    walls: SceneWall[],
    objects: SceneObject[],
    textures?: SceneTexture[],
    userId: string | null = null
  ): Promise<boolean> {
    return (
      (await this.call((db) => db.saveScene({ projectId, walls, objects, textures, userId }))) !== null
    )
  }

  loadScene(projectId: string, userId: string | null = null): Promise<SceneData | null> {
    return this.call((db) => db.loadScene({ projectId, userId }))
  }

  /* ---------- Repositorio: texturas importadas ---------- */

  createTexture(input: {
    projectId: string
    id?: string
    name: string
    mime?: string
    width?: number
    height?: number
    data: string
    userId?: string | null
  }): Promise<SceneTexture | null> {
    return this.call((db) => db.createTexture({ ...input, userId: input.userId ?? null }))
  }

  listTextures(projectId: string, userId: string | null = null): Promise<SceneTexture[] | null> {
    return this.call((db) => db.listTextures({ projectId, userId }))
  }

  getTexture(id: string, userId: string | null = null): Promise<SceneTexture | null> {
    return this.call((db) => db.getTexture({ id, userId }))
  }

  async deleteTexture(id: string, userId: string | null = null): Promise<boolean> {
    return (await this.call((db) => db.deleteTexture({ id, userId }))) === true
  }

  /* ---------- Repositorio: configuraciones ---------- */

  getSetting(clave: string): Promise<string | null> {
    return this.call((db) => db.getSetting({ clave }))
  }

  async setSetting(clave: string, valor: string): Promise<boolean> {
    return (await this.call((db) => db.setSetting({ clave, valor }))) === true
  }

  /* ---------- Repositorio: usuarios (modo local) ---------- */

  /** Devuelve `null` si la base local no está disponible (hay que degradar). */
  signUp(input: { name: string; email: string; password: string }): Promise<LocalAuthResult | null> {
    return this.call((db) => db.signUp(input))
  }

  signIn(input: { email: string; password: string }): Promise<LocalAuthResult | null> {
    return this.call((db) => db.signIn(input))
  }

  /* ---------- Curación: migración del almacén antiguo ---------- */

  importLegacy(payload: LegacyImportPayload): Promise<LegacyImportResult | null> {
    return this.call((db) => db.importLegacy(payload))
  }

  /* ---------- Interno ---------- */

  private async call<T>(fn: (bridge: DbBridge) => Promise<IpcResult<T>>): Promise<T | null> {
    const bridge = dbBridge()
    if (!bridge) return null
    try {
      const result = await fn(bridge)
      if (!result || result.ok !== true) {
        if (result?.error) console.warn('[ArqStudio] Base local:', result.error)
        return null
      }
      return (result.data ?? null) as T | null
    } catch (error) {
      // Nunca se propaga: la app degrada al almacén del navegador.
      console.warn('[ArqStudio] Base local inaccesible:', error)
      return null
    }
  }
}

/** Instancia compartida por todo el renderer. */
export const databaseService = new DatabaseService()