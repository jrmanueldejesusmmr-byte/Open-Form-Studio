import type { AuthService } from './AuthService'
import { databaseService, classifyCloudError } from './DatabaseService'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { createLocalId, type DashboardProject, type ProjectMode } from '../models/DashboardProject'
import { SAMPLE_DESIGN_COUNT } from '../models/ProjectDesign'
import { createCollaborationRoom, findRoomByProjectId, generateRoomCode } from './CollaborationService'

/**
 * Almacén de proyectos de la pantalla «Mis proyectos».
 *
 * Tres niveles, en este orden:
 *
 * 1. **Nube** (Supabase configurado + sesión activa): tabla `proyectos`,
 *    filtrada SIEMPRE por `user_id` en la consulta (y reforzado por RLS).
 * 2. **SQLite local** — filtrada por el `user_id` del usuario autenticado.
 *    Se entra aquí cuando Supabase falla o le faltan tablas (fallback).
 * 3. **localStorage** — último recurso, solo si la base local tampoco está
 *    disponible (también filtrado por dueño).
 *
 * Reglas de la Fase 1 (aislamiento por usuario):
 *   - **Sin sesión no se lee ni se escribe nada**: `list()` devuelve `[]`.
 *   - **Sin siembra**: aquí NUNCA se crean proyectos de ejemplo; una cuenta
 *     nueva ve la lista vacía (estado «Aún no tienes proyectos»).
 *   - **`reset()`** se llama al cerrar sesión: limpia cachés en memoria para
 *     que la siguiente cuenta no herede nada de la anterior.
 */

const LOCAL_KEY = 'arqstudio.projects.v1'

/** Nombre de la tabla de proyectos en Supabase. */
export const PROJECTS_TABLE = 'proyectos'

/** Fila de la tabla `proyectos` tal como se definió en SUPABASE_SETUP.md. */
interface ProjectRow {
  id: string
  user_id: string
  nombre: string
  modo: string
  diseno_index: number | null
  updated_at: string
}

export interface ProjectMutationResult {
  ok: boolean
  project?: DashboardProject
  error?: string
}

function rowToProject(row: ProjectRow): DashboardProject {
  return {
    id: row.id,
    name: row.nombre,
    mode: row.modo === '2D' ? '2D' : '3D',
    designIndex: row.diseno_index ?? 0,
    updatedAt: new Date(row.updated_at).getTime(),
    ownerId: row.user_id,
    source: 'cloud'
  }
}

/**
 * Proyectos que versiones anteriores guardaban en `localStorage`. Se usan como
 * fuente de la migración de curación a SQLite y como último recurso si la base
 * local no está disponible.
 */

function readLocalProjects(): DashboardProject[] | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DashboardProject[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLocalProjects(projects: DashboardProject[]): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(projects))
  } catch {
    /* almacenamiento no disponible: se pierde la persistencia local */
  }
}

export class ProjectStore {
  /**
   * true cuando la nube falló (la tabla `proyectos` no existe, RLS la bloquea,
   * falta red, etc.). La conmutación es **silenciosa**: el almacén pasa a la
   * base local SQLite sin mostrar ningún aviso en la interfaz, como si la base
   * de datos estuviera funcionando con normalidad.
   */
  cloudUnavailable = false

  /** Curación local (verificación + migración + siembra): una vez por sesión. */
  private localReady: Promise<void> | null = null

  /** Base de datos local SQLite (con autocuración y fallback). */
  private readonly db = databaseService

  constructor(private readonly auth: AuthService) {}

  /** id del usuario de Supabase, o null si toca leer la base local. */
  private get cloudUserId(): string | null {
    const user = this.auth.currentUser
    if (!user || user.local) return null
    if (!isSupabaseConfigured || !supabase) return null
    return user.id
  }

  /** true si hay que leer/escribir en la tabla `proyectos` de Supabase. */
  private get useCloud(): boolean {
    return this.cloudUserId !== null && supabase !== null && !this.cloudUnavailable
  }

  /**
   * Limpia el estado en memoria entre cuentas. Se invoca al cerrar sesión
   * (y al cambiar de usuario) para que no quede NADA de la cuenta anterior:
   * caché de curación local, marca de fallback a SQLite y lista en curso.
   */
  reset(): void {
    this.localReady = null
    this.cloudUnavailable = false
  }

  /**
   * Conmuta al motor local de forma **silenciosa** (silent fallback): solo se
   * marca el estado y se anota el motivo en consola. La interfaz no muestra
   * errores ni botones de reintento; SQLite sigue respondiendo en segundo plano
   * como si la base de datos estuviera normal.
   */
  private degrade(message: string): void {
    this.cloudUnavailable = true
    console.info('[ArqStudio] Supabase no disponible; se continúa con SQLite en segundo plano.', message)
  }

  /** Proyectos visibles ahora mismo (nube si hay sesión, base local en el resto). */
  async list(): Promise<DashboardProject[]> {
    // Fase 1: SIN SESIÓN no se consulta nada — ni lista, ni conteo, ni miniaturas.
    if (!this.auth.currentUser) return []

    if (this.useCloud && supabase) {
      const userId = this.cloudUserId as string
      const { data, error } = await supabase
        .from(PROJECTS_TABLE)
        .select('id, user_id, nombre, modo, diseno_index, updated_at')
        // Defensa en el cliente: aunque RLS ya lo garantiza, la consulta lleva
        // siempre el filtro por dueño (Fase 1: aislamiento por usuario).
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (!error) {
        databaseService.setCloudMode()
        return (data ?? []).map((row) => {
          const proj = rowToProject(row as ProjectRow)
          const room = findRoomByProjectId(proj.id)
          if (room) {
            proj.collaborationEnabled = true
            proj.roomCode = room.roomCode
            proj.role = room.ownerId === userId ? 'owner' : 'editor'
          }
          return proj
        })
      }
      // (b) Detección: se clasifica el fallo y se conmuta al motor local.
      this.degrade(classifyCloudError(error.message, error.code).message)
    }
    return this.listLocal()
  }

  async create(input: {
    name: string
    mode: ProjectMode
    designIndex?: number
    scanData?: import('../models/DashboardProject').ScanData | null
    collaborationEnabled?: boolean
    roomCode?: string | null
  }): Promise<ProjectMutationResult> {
    const name = input.name.trim() || 'Proyecto sin título'
    // Fase 1: todo proyecto nace con dueño — sin sesión no se crea nada.
    if (!this.auth.currentUser) {
      return { ok: false, error: 'Inicia sesión para crear proyectos.' }
    }

    const currentUser = this.auth.currentUser
    const resolvedRoomCode = input.collaborationEnabled
      ? (input.roomCode?.trim().toUpperCase() || generateRoomCode())
      : null

    const attachCollabIfNeeded = async (proj: DashboardProject): Promise<DashboardProject> => {
      if (input.collaborationEnabled && resolvedRoomCode) {
        proj.collaborationEnabled = true
        proj.roomCode = resolvedRoomCode
        proj.role = 'owner'
        await createCollaborationRoom({
          roomCode: resolvedRoomCode,
          projectId: proj.id,
          projectName: proj.name,
          ownerId: currentUser.id,
          ownerName: currentUser.name || currentUser.email || 'Anfitrión',
          ownerEmail: currentUser.email,
          mode: proj.mode
        })
      }
      return proj
    }

    if (this.useCloud && supabase) {
      const userId = this.cloudUserId as string
      const { data, error } = await supabase
        .from(PROJECTS_TABLE)
        .insert({ user_id: userId, nombre: name, modo: input.mode, diseno_index: input.designIndex ?? 0 })
        .select('id, user_id, nombre, modo, diseno_index, updated_at')
        .single()

      // Si la nube falla se degrada y el proyecto se crea igualmente en local.
      if (error) {
        this.degrade(classifyCloudError(error.message, error.code).message)
      } else {
        const proj = rowToProject(data as ProjectRow)
        if (input.scanData) proj.scanData = input.scanData
        await attachCollabIfNeeded(proj)
        return { ok: true, project: proj }
      }
    }

    await this.prepareLocal()
    const existing = (await this.db.listProjects(this.localUserId())) ?? []
    const designIndex = input.designIndex ?? existing.length % Math.max(SAMPLE_DESIGN_COUNT, 1)
    const local = await this.db.createProject({
      userId: this.localUserId(),
      name,
      mode: input.mode,
      designIndex
    })
    if (local) {
      local.scanData = input.scanData ?? null
      await attachCollabIfNeeded(local)
      return { ok: true, project: local }
    }

    // Último recurso: almacén del navegador (siempre con el dueño actual).
    const projects = this.readLocalFallback()
    const project: DashboardProject = {
      id: createLocalId(),
      name,
      mode: input.mode,
      designIndex: input.designIndex ?? projects.length % Math.max(SAMPLE_DESIGN_COUNT, 1),
      updatedAt: Date.now(),
      ownerId: this.localUserId(),
      source: 'local',
      scanData: input.scanData ?? null
    }
    await attachCollabIfNeeded(project)
    writeLocalProjects([project, ...projects])
    return { ok: true, project }
  }

  async rename(id: string, name: string): Promise<ProjectMutationResult> {
    const cleanName = name.trim()
    if (!cleanName) return { ok: false, error: 'El nombre no puede estar vacío.' }
    if (!this.auth.currentUser) return { ok: false, error: 'Inicia sesión para editar proyectos.' }

    if (this.useCloud && supabase) {
      const { data, error } = await supabase
        .from(PROJECTS_TABLE)
        .update({ nombre: cleanName, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', this.cloudUserId as string)
        .select('id, user_id, nombre, modo, diseno_index, updated_at')
        .single()
      if (error) this.degrade(classifyCloudError(error.message, error.code).message)
      else return { ok: true, project: rowToProject(data as ProjectRow) }
    }

    await this.prepareLocal()
    const renamed = await this.db.renameProject(id, cleanName, this.localUserId())
    if (renamed) return { ok: true, project: renamed }

    // Fallback del navegador: solo el dueño puede renombrar.
    const owner = this.localUserId()
    const projects = this.readLocalFallback().map((project) =>
      project.id === id && project.ownerId === owner ? { ...project, name: cleanName, updatedAt: Date.now() } : project
    )
    writeLocalProjects(projects)
    const found = projects.find((project) => project.id === id && project.ownerId === owner)
    return found ? { ok: true, project: found } : { ok: false, error: 'No tienes permiso para editar este proyecto.' }
  }

  async remove(id: string): Promise<boolean> {
    if (!this.auth.currentUser) return false

    if (this.useCloud && supabase) {
      const { error } = await supabase
        .from(PROJECTS_TABLE)
        .delete()
        .eq('id', id)
        .eq('user_id', this.cloudUserId as string)
      if (error) this.degrade(classifyCloudError(error.message, error.code).message)
      else return true
    }

    await this.prepareLocal()
    if (await this.db.removeProject(id, this.localUserId())) return true

    // Fallback del navegador: solo si el proyecto es del usuario actual.
    const owner = this.localUserId()
    const stored = this.readLocalFallback()
    if (!stored.some((project) => project.id === id && project.ownerId === owner)) return false
    writeLocalProjects(stored.filter((project) => project.id !== id))
    return true
  }

  /** Marca el proyecto como recién modificado (al abrirlo en el editor 3D). */
  async touch(id: string): Promise<void> {
    if (!this.auth.currentUser) return
    if (this.useCloud && supabase) {
      const { error } = await supabase
        .from(PROJECTS_TABLE)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', this.cloudUserId as string)
      if (!error) return
      this.degrade(classifyCloudError(error.message, error.code).message)
    }
    await this.prepareLocal()
    if (await this.db.touchProject(id, this.localUserId())) return

    const owner = this.localUserId()
    writeLocalProjects(
      this.readLocalFallback().map((project) =>
        project.id === id && project.ownerId === owner ? { ...project, updatedAt: Date.now() } : project
      )
    )
  }

  /* ---------- Curación local ---------- */

  /** Id del usuario actual para filtrar la base local (null si es invitado). */
  private localUserId(): string | null {
    return this.auth.currentUser?.id ?? null
  }

  /**
   * (a) Verificación + migración de la base local, la primera vez por sesión.
   *
   *   1. `databaseService.verify()` comprueba el esquema y pide `ensureSchema()`
   *      si falta alguna tabla (migración idempotente; añade `user_id` si faltaba).
   *   2. Si es la primera ejecución, **importa** los datos que la versión
   *      anterior guardaba en `localStorage` (curación, sin duplicar).
   *      Esos proyectos antiguos se importan SIN dueño (`user_id NULL`):
   *      quedan en **cuarentena** y no se muestran a ninguna cuenta nueva
   *      (solo Manuel podrá reclamarlos explícitamente con su id).
   *
   * NUNCA siembra proyectos de ejemplo (Fase 1): una cuenta nueva ve 0.
   */
  private prepareLocal(): Promise<void> {
    this.localReady ??= this.runLocalCuration()
    return this.localReady
  }

  private async runLocalCuration(): Promise<void> {
    await this.db.verify()
    if ((await this.db.getSetting('proyectos.legacy.importado')) === 'true') return

    const legacy = readLocalProjects()
    if (legacy && legacy.length > 0) {
      await this.db.importLegacy({
        projects: legacy.map((project) => ({
          id: project.id,
          name: project.name,
          mode: project.mode,
          designIndex: project.designIndex,
          updatedAt: project.updatedAt
        }))
      })
    }
    // Marcador propio (no reutiliza «proyectos.sembrados» de versiones viejas):
    // importLegacy además deduplica por id, así que repetir es inocuo.
    await this.db.setSetting('proyectos.legacy.importado', 'true')
  }

  /** Proyectos del motor local; si no está disponible, del almacén del navegador. */
  private async listLocal(): Promise<DashboardProject[]> {
    // Sin sesión la capa local devuelve NADA (listProjects exige userId).
    const userId = this.localUserId()
    if (!userId) return []
    await this.prepareLocal()
    const local = await this.db.listProjects(userId)
    const enrich = (items: DashboardProject[]): DashboardProject[] =>
      items.map((proj) => {
        const room = findRoomByProjectId(proj.id)
        if (room) {
          return {
            ...proj,
            collaborationEnabled: true,
            roomCode: room.roomCode,
            role: room.ownerId === userId ? 'owner' : 'editor'
          }
        }
        return proj
      })
    if (local) return enrich(local)
    // Último recurso: solo las filas cuyo dueño ES el usuario actual.
    return enrich(this.readLocalFallback().filter((project) => project.ownerId === userId))
  }

  /**
   * Último recurso (solo si SQLite no está disponible): replica el
   * comportamiento anterior sobre `localStorage` **sin siembra alguna** y
   * siempre filtrado por dueño (en `listLocal`).
   */
  private readLocalFallback(): DashboardProject[] {
    return readLocalProjects() ?? []
  }
}