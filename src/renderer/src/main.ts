import './services/ThemeManager'
import { AuthService } from './services/AuthService'
import { ProjectStore } from './services/ProjectStore'
import { isSupabaseConfigured } from './services/supabaseClient'
import { type DashboardProject } from './models/DashboardProject'
import * as THREE from 'three'
import { mountAuthScreen } from './ui/AuthScreen'
import { mountDashboard, type DashboardTemplate } from './ui/Dashboard'
import { mountDialogs } from './ui/Dialogs'
import { openImportDialog, type ImportAppBridge } from './ui/ImportDialog'
import { createProjectAfterImport } from './services/ProjectImportService'
import { type WorkspaceHandle } from './workspace/mountWorkspace'
// --- INICIO: Menú Global de Glosario (Atajo F1) ---
import { GlossaryPanel } from './ui/GlossaryPanel';

let glossaryModalContainer: HTMLElement | null = null;
let glossaryPanelInstance: GlossaryPanel | null = null;

window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault(); // Evita la ayuda predeterminada del navegador

    if (!glossaryModalContainer) {
      glossaryModalContainer = document.createElement('div');
      glossaryModalContainer.id = 'arq-glossary-global-modal';
      glossaryModalContainer.style.cssText = `
        position: fixed;
        top: 60px;
        right: 60px;
        width: 500px;
        max-height: 80vh;
        background: #1e1e1e;
        color: #ffffff;
        z-index: 99999;
        border: 1px solid #444444;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
        overflow-y: auto;
        padding: 16px;
      `;
      document.body.appendChild(glossaryModalContainer);
      glossaryPanelInstance = new GlossaryPanel(glossaryModalContainer);
    } else {
      const isVisible = glossaryModalContainer.style.display !== 'none';
      glossaryModalContainer.style.display = isVisible ? 'none' : 'block';
    }
  }
});
// --- FIN: Menú Global de Glosario ---

/**
 * Arranque de la aplicación y flujo de navegación:
 *
 *   1. La **pantalla inicial es el Dashboard** («Mis proyectos»).
 *   2. Al pulsar «+ Nuevo proyecto» o abrir una tarjeta para diseñar, se exige
 *      sesión: si no hay usuario, se abre el modal de Login/Registro y la
 *      acción queda en espera (`pendingAction`).
 *   3. Con la sesión iniciada (o al completarla) la acción pendiente se ejecuta
 *      y se abre el **editor 3D**, que se monta de forma perezosa la primera
 *      vez para no crear el contexto WebGL mientras está oculto.
 *
 * Toda la lógica del motor vive en `workspace/mountWorkspace.ts`; aquí solo se
 * orquesta el estado de sesión, los proyectos y el cambio de pantalla.
 */

const auth = new AuthService()
const store = new ProjectStore(auth)

const dashboardScreen = document.getElementById('screen-dashboard') as HTMLElement
const workspaceScreen = document.getElementById('screen-workspace') as HTMLElement
const authOverlay = document.getElementById('auth-overlay') as HTMLElement
const dialogOverlay = document.getElementById('dialog-overlay') as HTMLElement

/** Acción que el usuario pidió y que necesita una sesión activa. */
type PendingAction =
  | { kind: 'new' }
  | { kind: 'open'; project: DashboardProject }
  | { kind: 'template'; template: DashboardTemplate }

let pendingAction: PendingAction | null = null
let workspace: WorkspaceHandle | null = null
let workspaceModule: Promise<typeof import('./workspace/mountWorkspace')> | null = null

const dialogs = mountDialogs(dialogOverlay)

const authScreen = mountAuthScreen(authOverlay, {
  auth,
  onAuthenticated: () => {
    void resumePendingAction()
  }
})

let isImportingProject = false

async function handleImportProject(): Promise<void> {
  // Protección contra doble clic: si ya hay importación en curso, ignorar nuevos clics
  if (isImportingProject) return
  if (!auth.isAuthenticated()) {
    authScreen.open('login', 'Inicia sesión para importar archivos a un proyecto.')
    return
  }

  isImportingProject = true
  try {
    const bridgeApp = (
      window as unknown as { arqStudio?: { app?: ImportAppBridge } }
    ).arqStudio?.app

    const imported = await openImportDialog(dialogOverlay, { app: bridgeApp })
    // Si es null: el usuario canceló, cerró con X, Esc o clic fuera.
    // Quedarse en el dashboard, NO crear proyecto, NO escribir en base de datos y NO mostrar mensajes.
    if (!imported) {
      return
    }

    await createProjectAfterImport(imported, {
      store,
      dashboard,
      openWorkspace,
      ensureWorkspace,
      showDialogError
    })
  } catch (err) {
    console.error('[ArqStudio] Error en flujo de importación:', err)
  } finally {
    isImportingProject = false
  }
}

const dashboard = mountDashboard(dashboardScreen, {
  auth,
  store,
  onNewProject: () => requestProjectAccess({ kind: 'new' }),
  onOpenProject: (project) => requestProjectAccess({ kind: 'open', project }),
  onImportProject: () => void handleImportProject(),
  onDeleteProject: (project) => void deleteProject(project),
  dialogs: mountDialogs(dialogOverlay),
  onUseTemplate: (template) => requestProjectAccess({ kind: 'template', template }),
  onRequestAuth: (reason) => authScreen.open('login', reason)
})

/* ---------- Deep link: auth-redirect (OAuth callback) ---------- */

/**
 * El proceso main envía por IPC la URL `arqstudio://auth/callback` cuando
 * el usuario regresa del proveedor OAuth. Se la pasamos a AuthService para
 * restaurar la sesión con `supabase.auth.setSession(...)`.
 */
const bridge = (
  window as unknown as {
    arqStudio?: {
      auth?: {
        onAuthRedirect?: (cb: (url: string) => void) => void
        onDeepLink?: (cb: (url: string) => void) => (() => void) | void
      }
    }
  }
).arqStudio

if (bridge?.auth) {
  let isProcessingRedirect = false
  const onRedirect = (url: string): void => {
    if (isProcessingRedirect) return
    isProcessingRedirect = true
    console.info('[ArqStudio][main] auth redirect/deep-link recibido por IPC:', url)
    void auth.handleAuthRedirect(url).then((result) => {
      isProcessingRedirect = false
      if (result && !result.ok && result.error) {
        if (!authScreen.isOpen()) {
          authScreen.open('login', result.error)
        }
        return
      }
      // Cerrar modal de auth si está abierto tras restaurar la sesión por deep link.
      if (authScreen.isOpen()) authScreen.close()
      // Una vez restaurada la sesión, repinta el dashboard y ejecuta la acción pendiente.
      void dashboard.refresh()
      void resumePendingAction()
    }).catch(() => {
      isProcessingRedirect = false
    })
  }

  const bridgeAuth = bridge.auth as {
    onTokens?: (cb: (tokens: {
      url?: string
      access_token?: string | null
      refresh_token?: string | null
      code?: string | null
      error?: string | null
      error_description?: string | null
    }) => void) => void
    onAuthRedirect?: (cb: (url: string) => void) => void
    onDeepLink?: (cb: (url: string) => void) => void
  }

  if (bridgeAuth.onTokens) {
    bridgeAuth.onTokens((tokens) => {
      void auth.handleTokens(tokens).then((result) => {
        if (result && !result.ok && result.error) {
          if (!authScreen.isOpen()) authScreen.open('login', result.error)
          return
        }
        if (authScreen.isOpen()) authScreen.close()
        void dashboard.refresh()
        void resumePendingAction()
      })
    })
  }

  if (bridgeAuth.onAuthRedirect) {
    bridgeAuth.onAuthRedirect(onRedirect)
  } else if (bridgeAuth.onDeepLink) {
    bridgeAuth.onDeepLink(onRedirect)
  }
}

// Apertura directa del modal para pruebas visuales/capturas:
// index.html?auth=login o index.html?auth=signup (no afecta al arranque normal).
{
  const authParam = new URLSearchParams(window.location.search).get('auth')
  if (authParam === 'login' || authParam === 'signup') authScreen.open(authParam)
}

/* ---------- Sesión: puerta y limpieza entre cuentas (Fase 1) ---------- */
let sessionUserId: string | null = null
let sessionTracked = false

auth.onChange((user) => {
  const nextId = user?.id ?? null
  const changed = sessionTracked && nextId !== sessionUserId
  sessionTracked = true
  sessionUserId = nextId

  if (changed) {
    // Cambio de cuenta o cierre: NO queda nada de la cuenta anterior —
    // cachés del almacén, editor abierto (escena, texturas, proyecto) y pantalla.
    store.reset()
    workspace?.closeProject()
    workspaceScreen.classList.add('is-hidden')
    dashboardScreen.classList.remove('is-hidden')
  }

  if (!user) {
    // Fase 1: sin sesión solo existe la pantalla de inicio de sesión / registro
    // (el Dashboard de detrás no muestra lista, conteo ni miniaturas).
    void dashboard.refresh()
    if (!authScreen.isOpen()) authScreen.open('login', 'Inicia sesión para acceder a tus proyectos.')
    return
  }

  if (changed) void dashboard.refresh()
})

/* ---------- Control de acceso ---------- */

/** Puerta de entrada al editor: sin sesión se abre el Login y se recuerda la intención. */
function requestProjectAccess(action: PendingAction): void {
  if (!auth.isAuthenticated()) {
    pendingAction = action
    authScreen.open('login', 'Inicia sesión para crear o editar tus proyectos.')
    return
  }
  void runAction(action)
}

async function resumePendingAction(): Promise<void> {
  const action = pendingAction
  pendingAction = null
  if (!action) {
    // Login iniciado desde la barra lateral: solo hay que repintar el Dashboard.
    await dashboard.refresh()
    return
  }
  await runAction(action)
}

async function runAction(action: PendingAction): Promise<void> {
  switch (action.kind) {
    case 'new': {
      const suggested = `Proyecto ${new Date().toLocaleDateString('es-ES')}`
      const result = await dialogs.promptNewProject({
        title: 'Nuevo proyecto',
        suggestedName: suggested
      })
      if (!result) return
      const created = await store.create({
        name: result.name,
        mode: result.mode,
        scanData: result.scanData,
        collaborationEnabled: result.collaborationEnabled,
        roomCode: result.roomCode
      })
      await finishCreation(created.project, created.error)
      break
    }
    case 'template': {
      const created = await store.create({
        name: action.template.name,
        mode: action.template.mode,
        designIndex: action.template.designIndex
      })
      await finishCreation(created.project, created.error)
      break
    }
    case 'open': {
      await store.touch(action.project.id)
      await dashboard.refresh()
      openWorkspace(action.project)
      break
    }
  }
}

/** Elimina un proyecto tras pedir confirmación (el borrado no se puede deshacer). */
async function deleteProject(project: DashboardProject): Promise<void> {
  const confirmed = await dialogs.confirm({
    title: 'Eliminar proyecto',
    message: `¿Seguro que quieres eliminar «${project.name}»? Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true
  })
  if (!confirmed) return
  const removed = await store.remove(project.id)
  if (!removed) {
    await showDialogError('No se pudo eliminar el proyecto')
    return
  }
  await dashboard.refresh()
}

/** Aviso de un solo botón para los errores de la capa de datos. */
async function showDialogError(title: string, message?: string | null): Promise<void> {
  await dialogs.confirm({
    title,
    message: message ?? 'Inténtalo de nuevo en unos segundos.',
    confirmLabel: 'Entendido',
    cancelLabel: null
  })
}

/** Cierra la creación de un proyecto: refresca la rejilla y abre el editor. */
async function finishCreation(project: DashboardProject | undefined, error?: string): Promise<void> {
  if (!project) {
    await showDialogError('No se pudo crear el proyecto', error)
    return
  }
  await dashboard.refresh()
  openWorkspace(project)
}

/* ---------- Cambio de pantalla ---------- */

async function openWorkspace(project: DashboardProject): Promise<void> {
  dashboardScreen.classList.add('is-hidden')
  workspaceScreen.classList.remove('is-hidden')

  // Espera a que el navegador aplique el layout: el canvas debe tener medidas
  // reales antes de que el motor calcule el aspecto de la cámara.
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

  const handle = await ensureWorkspace()
  handle.openProject({
    id: project.id,
    name: project.name,
    mode: project.mode,
    collaborationEnabled: project.collaborationEnabled,
    roomCode: project.roomCode,
    role: project.role
  })
}

/** Monta el editor 3D la primera vez (import dinámico → carga diferida). */
async function ensureWorkspace(): Promise<WorkspaceHandle> {
  if (workspace) return workspace
  workspaceModule ??= import('./workspace/mountWorkspace')
  const module = await workspaceModule
  workspace = module.mountWorkspace({
    onExit: () => showDashboard(),
    auth,
    onRequestAuth: () => authScreen.open('login')
  })
  return workspace
}

function showDashboard(): void {
  workspaceScreen.classList.add('is-hidden')
  dashboardScreen.classList.remove('is-hidden')
  void dashboard.refresh()
}

/* ---------- Estado inicial ---------- */

console.info(
  `[ArqStudio] Supabase ${isSupabaseConfigured ? 'configurado: auth y proyectos en la nube.' : 'sin configurar: modo local (ver SUPABASE_SETUP.md).'}`
)

// La sesión persistida se restaura de forma asíncrona: cuando esté lista, el
// Dashboard se repinta solo (está suscrito a `auth.onChange`).
void auth.whenReady().then(() => dashboard.refresh())

