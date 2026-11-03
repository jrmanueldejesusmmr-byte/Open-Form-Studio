import { contextBridge, ipcRenderer } from 'electron'

/**
 * Puente entre el proceso "main" y el renderer con contextIsolation activo.
 * Expone únicamente lo que la interfaz necesita hoy: los controles de la
 * ventana sin marco que dibuja `renderer/src/ui/TitleBar.ts`. Es también el
 * punto de extensión natural para guardar/cargar proyectos en disco.
 */
const windowControls = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChanged: (callback: (maximized: boolean) => void): void => {
    ipcRenderer.on('window:maximized-changed', (_event, maximized: boolean) => callback(maximized))
  }
}

/**
 * Abre URLs en el navegador del sistema. Lo usa el login OAuth
 * (services/AuthService.signInWithProvider): Supabase devuelve la URL del
 * proveedor y el flujo se completa fuera de la app.
 */
const shellControls = {
  openExternal: (url: string): void => ipcRenderer.send('shell:open-external', url)
}

/**
 * Base de datos local (SQLite vía `sql.js`), ejecutada en el proceso main.
 * Todas las llamadas devuelven `{ ok, data?, error? }`: nunca lanzan, de modo
 * que la interfaz puede degradar sin mostrar una pantalla de error.
 * La forma concreta de cada respuesta la describe
 * `renderer/src/services/DatabaseService.ts`.
 */
const dbControls = {
  health: (): Promise<unknown> => ipcRenderer.invoke('db:health'),
  ensureSchema: (): Promise<unknown> => ipcRenderer.invoke('db:ensure-schema'),

  listProjects: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:projects:list', payload),
  createProject: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:projects:create', payload),
  renameProject: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:projects:rename', payload),
  removeProject: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:projects:remove', payload),
  touchProject: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:projects:touch', payload),

  saveScene: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:scene:save', payload),
  loadScene: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:scene:load', payload),

  createTexture: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:textures:create', payload),
  listTextures: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:textures:list', payload),
  getTexture: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:textures:get', payload),
  deleteTexture: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:textures:delete', payload),

  listSettings: (): Promise<unknown> => ipcRenderer.invoke('db:settings:list'),
  getSetting: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:settings:get', payload),
  setSetting: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:settings:set', payload),

  signUp: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:auth:signUp', payload),
  signIn: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:auth:signIn', payload),

  importLegacy: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('db:legacy:import', payload)
}

/**
 * Gemini (Fase 3), ejecutado en el proceso main. La API key vive solo en el
 * `.env` del main y NUNCA viaja por este puente: `status` dice si está
 * configurado y `generate` pide texto. Si Gemini no está o falla, ambos
 * degradan para que el renderer use el cerebro local.
 */
const aiControls = {
  status: (): Promise<{ configured: boolean; model: string | null }> => ipcRenderer.invoke('ai:gemini-status'),
  generate: (payload: { prompt: string }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('ai:gemini-generate', payload),
  /** Function calling (Fase 3): devuelve { ok, steps?, error? }; nunca la clave. */
  plan: (payload: { prompt: string; tools: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }> }): Promise<{ ok: boolean; steps?: Array<{ herramienta: string; parametros: Record<string, unknown> }>; error?: string }> =>
    ipcRenderer.invoke('ai:gemini-plan', payload)
}

/**
 * Archivos de exportación/importación (Fase 1+): diálogos nativos y
 * lectura/escritura de archivos. El renderer nunca toca `fs` directamente.
 */
const appControls = {
  saveDialog: (options: unknown): Promise<{ canceled?: boolean; filePath?: string }> =>
    ipcRenderer.invoke('app:save-dialog', options),
  saveFile: (payload: { filePath: string; data: string; encoding?: 'utf8' | 'base64' }): Promise<unknown> =>
    ipcRenderer.invoke('app:save-file', payload),
  openDialog: (options: unknown): Promise<{ canceled?: boolean; filePaths?: string[] }> =>
    ipcRenderer.invoke('app:open-dialog', options),
  /** Devuelve el contenido en base64; el renderer decide el formato. */
  readFile: (payload: { filePath: string }): Promise<unknown> => ipcRenderer.invoke('app:read-file', payload),
  isPackaged: (): Promise<boolean> => ipcRenderer.invoke('app:is-packaged')
}

/**
 * Control de autenticación y deep links (arqstudio://auth/callback).
 */
const authControls = {
  openOAuthWindow: (url: string): Promise<unknown> => ipcRenderer.invoke('auth:open-oauth-window', url),
  onTokens: (
    callback: (tokens: {
      url: string
      access_token: string | null
      refresh_token: string | null
      code: string | null
      error: string | null
      error_description: string | null
    }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      tokens: {
        url: string
        access_token: string | null
        refresh_token: string | null
        code: string | null
        error: string | null
        error_description: string | null
      }
    ): void => callback(tokens)
    ipcRenderer.on('auth:tokens', handler)
    return () => {
      ipcRenderer.removeListener('auth:tokens', handler)
    }
  },
  onDeepLink: (callback: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => callback(url)
    ipcRenderer.on('auth:deep-link', handler)
    return () => {
      ipcRenderer.removeListener('auth:deep-link', handler)
    }
  },
  onAuthRedirect: (callback: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => callback(url)
    ipcRenderer.on('auth-redirect', handler)
    return () => {
      ipcRenderer.removeListener('auth-redirect', handler)
    }
  },
  offAuthRedirect: (): void => {
    ipcRenderer.removeAllListeners('auth-redirect')
    ipcRenderer.removeAllListeners('auth:deep-link')
    ipcRenderer.removeAllListeners('auth:tokens')
  }
}

// Diagnóstico de carga (visible en logs/diag-electron*.log y en la consola
// del proceso main con ELECTRON_ENABLE_LOGGING=1): si el preload falla,
// Electron emite `preload-error` en el main (ver createWindow).
console.info('[ArqStudio][preload] cargando puente arqStudio…')
try {
  contextBridge.exposeInMainWorld('arqStudio', {
    window: windowControls,
    shell: shellControls,
    db: dbControls,
    ai: aiControls,
    app: appControls,
    auth: authControls
  })
  console.info('[ArqStudio][preload] puente arqStudio expuesto (preload OK).')
} catch (error) {
  console.error('[ArqStudio][preload] ERROR al exponer el puente:', error)
  throw error
}
