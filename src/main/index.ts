/* ------------------------------------------------------------------ *
 * Diagnóstico de arranque (sin ventana ⇒ sin pistas).                  *
 * - Captura excepciones/rechazos no controlados y los vuelca a consola *
 *   y a `logs/main-error.log` (nunca la clave: ver `redactSecrets`).   *
 * - `ARQ_SAFE_BOOT=1` salta el registro de los handlers de Gemini para *
 *   descartar la Fase 3 como causa de un arranque sin ventana.         *
 * ------------------------------------------------------------------ */
import { appendFileSync, mkdirSync } from 'node:fs'

/** `true` cuando se arranca con `ARQ_SAFE_BOOT=1` (sin Gemini). */
const ARQ_SAFE_BOOT: boolean = process.env['ARQ_SAFE_BOOT'] === '1'

/** Quita posibles secretos de un texto antes de registrarlo. */
function redactSecrets(text: string): string {
  let out = text
  // API keys de Google (AIza…) y bearer tokens genéricos.
  out = out.replace(/AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
  out = out.replace(/([\"']?(?:api[_-]?key|token|secret)[\"']?\s*[:=]\s*[\"']?)([^\"'\s,}]{8,})/gi, '$1[REDACTED]')
  return out
}

/** Directorio `logs/` junto a la raíz del proyecto (dev) o userData (empaquetado). */
function bootLogsDir(): string {
  try {
    // `app` y `join` ya están importados abajo (el hoisting de `import` lo permite).
    if (app.isPackaged) return app.getPath('userData')
  } catch {
    /* se usa cwd */
  }
  return join(process.cwd(), 'logs')
}

/** Añade una línea al `logs/main-error.log` (y lo crea si hace falta). */
function appendBootLog(line: string): void {
  try {
    const dir = bootLogsDir()
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      return
    }
    appendFileSync(join(dir, 'main-error.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* el registro nunca debe tumbar el arranque */
  }
}

/** Vuelca un error del arranque en consola y en `logs/main-error.log`. */
export function logBootError(origen: string, error: unknown): void {
  const detalle = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
  const linea = `[ArqStudio][arranque:${origen}] ${redactSecrets(detalle)}`
  try {
    console.error(linea)
  } catch {
    /* sin consola disponible */
  }
  appendBootLog(linea)
}

process.on('uncaughtException', (error) => logBootError('uncaughtException', error))
process.on('unhandledRejection', (reason) => logBootError('unhandledRejection', reason))

if (ARQ_SAFE_BOOT) {
  const aviso = '[ArqStudio] ARQ_SAFE_BOOT=1: arranque seguro, no se registran los handlers de Gemini.'
  try {
    console.warn(aviso)
  } catch {
    /* sin consola disponible */
  }
  appendBootLog(aviso)
}


import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { join, resolve } from 'path'
import { database, registerDatabaseIpc } from './database'
import { GeminiService } from './gemini'

/** Ventana principal activa de la aplicación. */
let mainWindow: BrowserWindow | null = null

/** Deep link pendiente de entrega si la app se abrió antes de que el renderer estuviera listo. */
let pendingDeepLink: string | null = null

// Registro del esquema deep link: arqstudio:// (exclusivo para cuando la app esté empaquetada)
if (app.isPackaged) {
  try {
    app.setAsDefaultProtocolClient('arqstudio')
  } catch (error) {
    logBootError('setAsDefaultProtocolClient', error)
  }
}

export interface AuthTokenPayload {
  url: string
  access_token: string | null
  refresh_token: string | null
  code: string | null
  error: string | null
  error_description: string | null
}

export function parseDeepLinkTokens(rawUrl: string): AuthTokenPayload {
  const url = (rawUrl || '').replace(/^["']|["']$/g, '').trim()
  let access_token: string | null = null
  let refresh_token: string | null = null
  let code: string | null = null
  let error: string | null = null
  let error_description: string | null = null

  try {
    const normalized = url.replace(/^arqstudio:\/*/, 'http://localhost/')
    const parsed = new URL(normalized)

    // De query params (?code=...&access_token=...)
    code = parsed.searchParams.get('code')
    access_token = parsed.searchParams.get('access_token')
    refresh_token = parsed.searchParams.get('refresh_token')
    error = parsed.searchParams.get('error')
    error_description = parsed.searchParams.get('error_description')

    // De hash params (#access_token=...&refresh_token=...)
    let hash = parsed.hash || ''
    while (hash.startsWith('#')) hash = hash.slice(1)
    if (hash.includes('#')) hash = hash.split('#').pop() || ''
    if (hash.startsWith('?') || hash.startsWith('/')) hash = hash.replace(/^[/?]+/, '')
    const hashParams = new URLSearchParams(hash)

    access_token = access_token || hashParams.get('access_token')
    refresh_token = refresh_token || hashParams.get('refresh_token')
    code = code || hashParams.get('code')
    error = error || hashParams.get('error')
    error_description = error_description || hashParams.get('error_description')
  } catch {
    /* Fallback por regex */
  }

  const extractWithRegex = (name: string): string | null => {
    const match = url.match(new RegExp(`[#?&]${name}=([^&#]+)`))
    return match ? decodeURIComponent(match[1]) : null
  }

  access_token = access_token || extractWithRegex('access_token')
  refresh_token = refresh_token || extractWithRegex('refresh_token')
  code = code || extractWithRegex('code')
  error = error || extractWithRegex('error')
  error_description = error_description || extractWithRegex('error_description')

  return { url, access_token, refresh_token, code, error, error_description }
}

function dispatchDeepLink(rawUrl: string): void {
  try {
    const tokens = parseDeepLinkTokens(rawUrl)
    console.info(`[ArqStudio][protocolo] URL recibida: ${tokens.url} (access_token: ${tokens.access_token ? 'SÍ' : 'NO'}, code: ${tokens.code ? 'SÍ' : 'NO'})`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      // En Linux (GNOME/X11/Wayland): forzar ventana al frente evitando focus-stealing prevention
      try {
        mainWindow.setAlwaysOnTop(true)
        mainWindow.focus()
        mainWindow.setAlwaysOnTop(false)
      } catch {
        mainWindow.focus()
      }
      mainWindow.webContents.send('auth:deep-link', tokens.url)
      mainWindow.webContents.send('auth-redirect', tokens.url)
      mainWindow.webContents.send('auth:tokens', tokens)
    } else {
      pendingDeepLink = tokens.url
    }
  } catch (error) {
    logBootError('protocolo-url', error)
  }
}

// macOS maneja deep links mediante el evento open-url
app.on('open-url', (event, url) => {
  event.preventDefault()
  dispatchDeepLink(url)
})

// Windows / Linux: asegurar instancia única y reenviar argumentos
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const rawUrl = commandLine.map((arg) => arg.replace(/^["']|["']$/g, '')).find((arg) => arg.startsWith('arqstudio://'))
    if (rawUrl) {
      dispatchDeepLink(rawUrl)
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

/**
 * Proceso "main" de Electron. Su única responsabilidad es crear la ventana y
 * conectar los controles de la barra de título propia (la ventana va sin marco:
 * `frame: false`), igual que en la versión WPF donde Program.cs solo arranca la
 * ventana. Toda la lógica de escena, cámara y UI vive en src/renderer.
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0c0e',
    autoHideMenuBar: true,
    // Barra de título propia: ver src/renderer/src/ui/TitleBar.ts
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  console.info('[ArqStudio][arranque] ventana creada, cargando contenido…')

  // `show: false` + `ready-to-show` deja la ventana invisible para siempre si
  // el evento nunca llega (p. ej. fallo de carga del renderer). Respaldo de
  // 3 s: pasado ese tiempo se fuerza `show()` + `focus()` aunque no haya
  // llegado `ready-to-show`. Queda registrado en el log de arranque.
  const forceShowTimer = setTimeout(() => {
    try {
      if (!win.isDestroyed() && !win.isVisible()) {
        console.warn('[ArqStudio][arranque] ready-to-show no llegó en 3 s: forzando show() + focus() de respaldo.')
        win.show()
        win.focus()
      }
    } catch (error) {
      logBootError('force-show', error)
    }
  }, 3000)
  // No mantener vivo el proceso solo por este temporizador.
  if (typeof forceShowTimer === 'object' && typeof (forceShowTimer as unknown as { unref?: unknown }).unref === 'function') {
    ;(forceShowTimer as unknown as { unref: () => void }).unref()
  }

  win.once('ready-to-show', () => {
    console.info('[ArqStudio][arranque] ready-to-show recibido: mostrando ventana.')
    clearTimeout(forceShowTimer)
    try {
      win.show()
    } catch (error) {
      logBootError('show', error)
    }
  })

  win.webContents.on('did-finish-load', () => {
    const initialArg = process.argv.map((arg) => arg.replace(/^["']|["']$/g, '')).find((arg) => arg.startsWith('arqstudio://'))
    const initialUrl = pendingDeepLink || initialArg
    if (initialUrl && !win.isDestroyed()) {
      const tokens = parseDeepLinkTokens(initialUrl)
      win.webContents.send('auth:deep-link', tokens.url)
      win.webContents.send('auth-redirect', tokens.url)
      win.webContents.send('auth:tokens', tokens)
      pendingDeepLink = null
    }
  })

  // Escuchas de carga: si el renderer falla, el motivo queda en consola y en
  // `logs/main-error.log` en lugar de quedarse la ventana invisible en silencio.
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logBootError('did-fail-load', new Error(`code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`))
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    logBootError('render-process-gone', new Error(`reason=${details.reason} exitCode=${details.exitCode}`))
  })
  win.webContents.on('unresponsive', () => {
    logBootError('unresponsive', new Error('el renderer no responde (unresponsive)'))
  })
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logBootError('preload-error', new Error(`preload=${preloadPath} ${(error as Error)?.message ?? String(error)}`))
  })

  // Interceptar navegación y redirecciones hacia arqstudio:// o callback web local
  const isAuthCallbackUrl = (targetUrl: string): boolean => {
    if (targetUrl.startsWith('arqstudio://')) return true
    if (
      targetUrl.includes('localhost:5173') &&
      (targetUrl.includes('auth/callback') || targetUrl.includes('access_token=') || targetUrl.includes('code='))
    ) {
      return true
    }
    return false
  }

  win.webContents.on('will-navigate', (event, url) => {
    if (isAuthCallbackUrl(url)) {
      event.preventDefault()
      dispatchDeepLink(url)
    }
  })

  win.webContents.on('will-redirect', (event, url) => {
    if (isAuthCallbackUrl(url)) {
      event.preventDefault()
      dispatchDeepLink(url)
    }
  })

  // Interceptar apertura de ventanas (popups / window.open):
  // Si apunta al callback de autenticación se captura; si es enlace web externo, se abre en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthCallbackUrl(url)) {
      dispatchDeepLink(url)
      return { action: 'deny' }
    }
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url) // Abre en Chrome/Firefox del sistema
      return { action: 'deny' } // Bloquea el popup interno de Electron
    }
    return { action: 'allow' }
  })

  const notifyMaximized = (): void => {
    win.webContents.send('window:maximized-changed', win.isMaximized())
  }
  win.on('maximize', notifyMaximized)
  win.on('unmaximize', notifyMaximized)

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Modo desarrollo: electron-vite sirve el renderer con hot-reload.
    console.info(`[ArqStudio][arranque] loadURL ${process.env['ELECTRON_RENDERER_URL']}`)
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((error: unknown) => {
      logBootError('loadURL', error)
    })
  } else {
    const filePath = join(__dirname, '../renderer/index.html')
    console.info(`[ArqStudio][arranque] loadFile ${filePath}`)
    void win.loadFile(filePath).catch((error: unknown) => {
      logBootError('loadFile', error)
    })
  }
}

/* Controles de ventana solicitados por la barra de título del renderer.
   Se registran una sola vez y se resuelven sobre la ventana que emite el
   mensaje, evitando duplicar handlers si se abren varias ventanas. */
ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())

ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})

ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

ipcMain.handle('window:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)

/* Abre un enlace (login OAuth de Supabase) en el navegador del sistema.
   Solo se aceptan URLs http(s) para no exponer `shell` al renderer. */
ipcMain.on('shell:open-external', (_event, url: unknown) => {
  if (typeof url !== 'string') return
  if (url.startsWith('arqstudio://')) {
    dispatchDeepLink(url)
    return
  }
  if (!/^https?:\/\//i.test(url)) return
  void shell.openExternal(url)
})

/** Servidor de relay local para recibir tokens desde el navegador externo en desarrollo. */
let authRelayServer: http.Server | null = null
const AUTH_RELAY_PORT = 45678

function startAuthRelayServer(): void {
  if (authRelayServer) return
  try {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, *')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const reqUrl = req.url || ''
      const isAuthEndpoint = reqUrl.startsWith('/auth-callback') || reqUrl.startsWith('/auth-tokens')
      if (isAuthEndpoint) {
        const processPayload = (payload: {
          url?: string
          access_token?: string
          refresh_token?: string
          code?: string
        }): boolean => {
          if (payload && (payload.access_token || payload.code || payload.url)) {
            console.info('[ArqStudio][auth-relay] Tokens recibidos en /auth-callback desde navegador externo.')
            const targetUrl =
              payload.url ||
              `http://localhost:5173/#access_token=${payload.access_token || ''}&refresh_token=${payload.refresh_token || ''}&code=${payload.code || ''}`
            dispatchDeepLink(targetUrl)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, message: 'Sesión transferida con éxito a ArqStudio.' }))
            return true
          }
          return false
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const payload = JSON.parse(body) as {
                url?: string
                access_token?: string
                refresh_token?: string
                code?: string
              }
              if (processPayload(payload)) return
            } catch {
              /* fallo al parsear JSON */
            }
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'invalid payload' }))
          })
          return
        }

        if (req.method === 'GET') {
          try {
            const parsed = new URL(reqUrl, 'http://localhost/')
            const payload = {
              url: parsed.searchParams.get('url') || undefined,
              access_token: parsed.searchParams.get('access_token') || undefined,
              refresh_token: parsed.searchParams.get('refresh_token') || undefined,
              code: parsed.searchParams.get('code') || undefined
            }
            if (processPayload(payload)) return
          } catch {
            /* error al parsear url */
          }
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid query params' }))
          return
        }
      }

      res.writeHead(404)
      res.end()
    })

    server.listen(AUTH_RELAY_PORT, '0.0.0.0', () => {
      console.info(`[ArqStudio][auth-relay] Servidor de relay de autenticación activo en http://127.0.0.1:${AUTH_RELAY_PORT}/auth-callback`)
    })

    server.on('error', (err: { code?: string; message?: string }) => {
      console.warn(`[ArqStudio][auth-relay] Aviso en servidor de relay (${AUTH_RELAY_PORT}):`, err.message)
    })

    authRelayServer = server
  } catch (err) {
    console.warn('[ArqStudio][auth-relay] Error al iniciar servidor de relay:', err)
  }
}

/** Ventana emergente opcional para autenticación OAuth interna en Electron. */
let authWindow: BrowserWindow | null = null

ipcMain.handle('auth:open-oauth-window', async (_event, url: unknown) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false }

  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus()
    return { ok: true }
  }

  const authWin = new BrowserWindow({
    width: 600,
    height: 720,
    parent: mainWindow ?? undefined,
    modal: true,
    show: true,
    autoHideMenuBar: true,
    title: 'Iniciar sesión',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  authWindow = authWin

  // Emular User-Agent estándar de Chrome en Linux para evitar el bloqueo 'disallowed_useragent' de Google
  authWin.webContents.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  )

  const handleIntercept = (targetUrl: string): boolean => {
    if (
      targetUrl.startsWith('arqstudio://') ||
      (targetUrl.includes('localhost:5173') &&
        (targetUrl.includes('auth/callback') || targetUrl.includes('access_token=') || targetUrl.includes('code=')))
    ) {
      dispatchDeepLink(targetUrl)
      if (!authWin.isDestroyed()) {
        authWin.close()
      }
      return true
    }
    return false
  }

  authWin.webContents.on('will-navigate', (event, navUrl) => {
    if (handleIntercept(navUrl)) {
      event.preventDefault()
    }
  })

  authWin.webContents.on('will-redirect', (event, redUrl) => {
    if (handleIntercept(redUrl)) {
      event.preventDefault()
    }
  })

  authWin.webContents.on('did-navigate', (_event, navUrl) => {
    handleIntercept(navUrl)
  })

  authWin.webContents.on('did-redirect-navigation', (_event, redUrl) => {
    handleIntercept(redUrl)
  })

  authWin.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (handleIntercept(openUrl)) {
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  authWin.on('closed', () => {
    if (authWindow === authWin) authWindow = null
  })

  void authWin.loadURL(url)
  return { ok: true }
})

ipcMain.handle('app:is-packaged', () => app.isPackaged)

/* ---------- Gemini (Fase 3) ----------
   La API key se lee del `.env` SOLO en el main y nunca viaja al renderer.
   Estos handlers son el único punto de contacto: el renderer pregunta si hay
   clave y pide generar texto; jamás recibe la clave. Andamiaje sin function
   calling: `generate` es texto libre. La integración con el cerebro y las
   herramientas del registro llega en la Fase 3 completa.

   Blindaje de arranque: la lectura del `.env` y el registro de estos
   handlers van en `try/catch`. Si fallan (p. ej. `.env` corrupto), la app
   abre igual con el cerebro local. Con `ARQ_SAFE_BOOT=1` se saltan por
   completo para descartar la Fase 3 como causa. */

/** Directorio donde se buscan los `.env`: dev usa cwd; empaquetado, el app. */
function envBaseDir(): string {
  try {
    return app.isPackaged ? app.getAppPath() : process.cwd()
  } catch {
    return process.cwd()
  }
}

/** Servicio de Gemini si se pudo inicializar; `null` en arranque degradado. */
let gemini: GeminiService | null = null

try {
  if (ARQ_SAFE_BOOT) {
    console.warn('[ArqStudio] Arranque seguro: handlers de Gemini omitidos (ARQ_SAFE_BOOT=1).')
  } else {
    gemini = new GeminiService(envBaseDir())
  }
} catch (error) {
  logBootError('gemini-init', error)
  gemini = null
}

if (gemini !== null) {
  const geminiSvc: GeminiService = gemini
  try {

// ¿Está Gemini configurado y con qué modelo? (seguro: sin clave).
// Si el servicio no se inicializó, responde "no configurado" para que el
// renderer degrade al cerebro local en lugar de quedarse sin respuesta.
ipcMain.handle('ai:gemini-status', () => {
  try {
    return geminiSvc.status()
  } catch (error) {
    return { configured: false as const, model: null as string | null }
  }
})

// Genera texto libre. Devuelve { ok, text? , error? }; nunca la clave.
ipcMain.handle('ai:gemini-generate', (_event, payload: unknown) => {
  const prompt = typeof payload === 'object' && payload !== null && 'prompt' in payload ? (payload as { prompt: unknown }).prompt : undefined
  if (typeof prompt !== 'string') return { ok: false, error: 'Falta el parámetro «prompt» (string).' }
  // Tope defensivo de longitud para no mandar prompts enormos a la API.
  if (prompt.length > 8000) return { ok: false, error: 'El prompt es demasiado largo (máx. 8000 caracteres).' }
  // `generate` ya captura sus errores y devuelve { ok:false }; el `await`
  // implícito de `ipcMain.handle` propaga el resultado al renderer.
  return geminiSvc.generate(prompt)
})

// Function calling (Fase 3): pide a Gemini un plan de herramientas. El renderer
// envía las definiciones de su propio registro; aquí se reenvían a la API y se
// devuelven pasos `{ herramienta, parametros }`. Devuelve { ok, steps?, error? };
// jamás la clave. Ante cualquier problema el renderer cae al cerebro local.
ipcMain.handle('ai:gemini-plan', (_event, payload: unknown) => {
  const obj = typeof payload === 'object' && payload !== null ? (payload as { prompt?: unknown; tools?: unknown }) : null
  const prompt = obj?.prompt
  if (typeof prompt !== 'string') return { ok: false, error: 'Falta el parámetro «prompt» (string).' }
  if (prompt.length > 8000) return { ok: false, error: 'El prompt es demasiado largo (máx. 8000 caracteres).' }
  // Validación defensiva de las herramientas (nunca confiamos en el payload).
  const rawTools = Array.isArray(obj?.tools) ? (obj!.tools as unknown[]) : []
  const tools: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }> = []
  for (const t of rawTools.slice(0, 64)) {
    if (typeof t !== 'object' || t === null) continue
    const tool = t as { name?: unknown; description?: unknown; parameters?: unknown }
    const name = typeof tool.name === 'string' ? tool.name.trim() : ''
    if (name === '' || name.length > 64) continue
    const decl: { name: string; description?: string; parameters?: Record<string, unknown> } = { name }
    if (typeof tool.description === 'string') decl.description = tool.description
    if (typeof tool.parameters === 'object' && tool.parameters !== null && !Array.isArray(tool.parameters)) {
      decl.parameters = tool.parameters as Record<string, unknown>
    }
    tools.push(decl)
  }
  return geminiSvc.plan(prompt, tools)
})
  } catch (error) {
    // El registro de los handlers de IA nunca puede impedir que la ventana
    // se cree: se registra el fallo y la app sigue con el cerebro local.
    logBootError('gemini-handlers', error)
    gemini = null
  }
}

/**
 * Localiza el binario WebAssembly de SQLite que viene con `sql.js`.
 * En desarrollo está en `node_modules`; empaquetado, dentro del `app.asar`
 * (Electron redirige la lectura a `app.asar.unpacked` si hiciera falta).
 * Si no se encuentra, `DatabaseManager` lo intenta por su cuenta y, si tampoco
 * puede, la app sigue funcionando sin base local en lugar de caerse.
 */
function readSqlJsWasm(): Uint8Array | null {
  const candidates = [
    join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  ]
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return readFileSync(candidate)
    } catch {
      /* se prueba la siguiente ruta */
    }
  }
  return null
}

/* ---------- Controladores de archivos de exportación/importación ---------- *
 * Se registran a nivel de módulo (antes de whenReady) para que el renderer
 * pueda invocarlos en cuanto la ventana cargue, sin esperar a la base de datos.
 */

/**
 * Escribe un archivo en disco. `encoding: 'base64'` descodifica el contenido
 * (GLB/PDF son binarios y llegan en base64 desde el renderer); por defecto se
 * escribe como texto UTF-8 (OBJ/DXF).
 */
ipcMain.handle(
  'app:save-file',
  async (_event, payload: { filePath: string; data: string; encoding?: 'utf8' | 'base64' }) => {
    try {
      writeFileSync(payload.filePath, payload.data, payload.encoding === 'base64' ? 'base64' : 'utf8')
      return { ok: true }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }
)

/** Diálogo nativo de guardado (filtra por extensión). */
ipcMain.handle(
  'app:save-dialog',
  async (event, options: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions = {
      title: options.title ?? 'Guardar archivo',
      defaultPath: options.defaultPath ?? '',
      filters: options.filters ?? [{ name: 'Todos', extensions: ['*'] }]
    }
    return win ? dialog.showSaveDialog(win, dialogOptions) : dialog.showSaveDialog(dialogOptions)
  }
)

/** Diálogo nativo de apertura (filtra por extensión). */
ipcMain.handle(
  'app:open-dialog',
  async (event, options: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions = {
      title: options.title ?? 'Abrir archivo',
      filters: options.filters ?? [{ name: 'Todos', extensions: ['*'] }],
      properties: ['openFile'] as Array<'openFile'>
    }
    return win ? dialog.showOpenDialog(win, dialogOptions) : dialog.showOpenDialog(dialogOptions)
  }
)

/** Lee un archivo y devuelve su contenido como base64 (el renderer decide el formato). */
ipcMain.handle('app:read-file', async (_event, payload: { filePath: string }) => {
  try {
    return Buffer.from(readFileSync(payload.filePath)).toString('base64')
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
})

app.whenReady().then(async () => {
  console.info('[ArqStudio][arranque] app lista (whenReady). Registrando IPC y creando ventana…')
  try {
    // Los handlers se registran antes de inicializar: si el renderer preguntara
    // durante el arranque recibiría un error controlado, nunca una excepción.
    try {
      registerDatabaseIpc()
    } catch (error) {
      // El registro de la base nunca puede impedir que la ventana se cree.
      logBootError('database-ipc', error)
    }

    // Migración automática + autocuración de la base local (nunca lanza).
    // Si `init` fallara o tardara demasiado, NO debe bloquear la ventana:
    // se le da un tope de 10 s y después se abre igual con el almacén web.
    let health: { ok: boolean; engine?: unknown; schemaVersion?: unknown; databasePath?: unknown; repaired?: unknown; error?: unknown } = { ok: false, error: 'pendiente' }
    try {
      const initPromise = database.init({
        baseDir: app.getPath('userData'),
        wasmBinary: readSqlJsWasm()
      })
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000))
      const settled = await Promise.race([initPromise, timeoutPromise])
      if (settled === null) {
        console.warn('[ArqStudio][arranque] database.init superó 10 s: se abre la ventana con el almacén del navegador.')
        health = { ok: false, error: 'timeout 10 s en database.init' }
      } else {
        health = settled as typeof health
      }
    } catch (error) {
      logBootError('database-init', error)
      health = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    console.info(
      health.ok
        ? `[ArqStudio] Base local lista (${String(health.engine)}, esquema v${String(health.schemaVersion)}) en ${String(health.databasePath)}${health.repaired ? ' — autocuración aplicada' : ''}.`
        : `[ArqStudio] Base local no disponible (${String(health.error ?? 'motivo desconocido')}); se usará el almacén del navegador.`
    )

    try {
      startAuthRelayServer()
    } catch (error) {
      logBootError('authRelayServer', error)
    }

    try {
      createWindow()
    } catch (error) {
      logBootError('createWindow', error)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          createWindow()
        } catch (error) {
          logBootError('createWindow-activate', error)
        }
      }
    })
  } catch (error) {
    // Última red: si algo del arranque falló antes de crear la ventana, se
    // registra y se intenta crear la ventana de todos modos.
    logBootError('whenReady', error)
    try {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    } catch (inner) {
      logBootError('createWindow-fallback', inner)
    }
  }
}).catch((error: unknown) => {
  // Sin este `.catch`, un rechazo en el arranque deja el proceso vivo SIN
  // ventana y SIN error visible (el síntoma reportado). Ahora queda en
  // consola y en `logs/main-error.log`, y se intenta abrir la ventana igual.
  logBootError('whenReady-reject', error)
  try {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  } catch (inner) {
    logBootError('createWindow-reject-fallback', inner)
  }
})

// Vuelca y cierra el archivo de base de datos antes de terminar.
app.on('before-quit', () => {
  if (authRelayServer) {
    try {
      authRelayServer.close()
    } catch {
      /* ignorar */
    }
  }
  database.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
