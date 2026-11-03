import { isSupabaseConfigured, supabase } from './supabaseClient'
import { databaseService } from './DatabaseService'

/**
 * Estado global de sesión (equivalente a un «AuthContext» en React, pero con
 * un store observable propio porque la interfaz es DOM puro).
 *
 * Dos modos de funcionamiento:
 *
 *  1. **Supabase configurado** → `signIn` / `signUp` / `signOut` hablan con
 *     `supabase.auth` y la sesión se restaura con `getSession()` +
 *     `onAuthStateChange`, así que sobrevive al reinicio de la app.
 *  2. **Supabase sin configurar** → «modo local»: los usuarios y la sesión se
 *     guardan en `localStorage` para poder recorrer completo el flujo
 *     (login → dashboard → editor) sin nube. Es solo para desarrollo/demo; en
 *     cuanto el `.env` tiene claves reales este camino no se usa nunca.
 */

export interface AuthUser {
  id: string
  email: string
  name: string
  /** true si la sesión viene del modo local (Supabase sin configurar). */
  local: boolean
}

export type AuthErrorCode =
  | 'EMAIL_NOT_CONFIRMED'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'INVALID_EMAIL'
  | 'INVALID_URL'
  | 'GENERIC_ERROR'

export interface AuthResult {
  ok: boolean
  /** Alias booleano para mayor claridad y compatibilidad de estado */
  success?: boolean
  /** Código de error normalizado (ej: 'EMAIL_NOT_CONFIRMED', 'RATE_LIMITED') */
  code?: AuthErrorCode | string
  /** Correo electrónico vinculado al flujo de autenticación */
  email?: string
  /** Mensaje de error ya traducido para mostrar en el formulario. */
  error?: string
  /** Aviso informativo (p. ej. sesión de demostración en modo local). */
  notice?: string
  /** Alta correcta, pero Supabase exige confirmar el correo antes de tener sesión. */
  needsEmailConfirmation?: boolean
  /** Login OAuth: se abrió el navegador externo para completar el flujo. */
  external?: boolean
}

export type AuthProvider = 'google' | 'github'

type AuthListener = (user: AuthUser | null) => void

const USERS_KEY = 'arqstudio.auth.users.v1'
const SESSION_KEY = 'arqstudio.auth.session.v1'

interface LocalUserRecord {
  id: string
  email: string
  name: string
  /** Solo existe en modo local (nunca se envía a ningún servidor). */
  password: string
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* almacenamiento no disponible: el modo local queda sin persistencia */
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignorado */
  }
}

/** Traduce los mensajes de Supabase Auth a algo legible en la interfaz. */
export function translateAuthError(message: string): string {
  const text = (message || '').toLowerCase()
  if (text.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (text.includes('email not confirmed')) {
    return 'Tu cuenta aún no ha sido confirmada. Revisa tu bandeja de entrada o carpeta de spam para verificarla.'
  }
  if (text.includes('user already registered')) return 'Ese correo ya tiene una cuenta: inicia sesión.'
  if (text.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (text.includes('unable to validate email')) return 'El correo no tiene un formato válido.'
  if (text.includes('rate limit')) return 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.'
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'No se pudo conectar con Supabase. Revisa la conexión y VITE_SUPABASE_URL.'
  }
  if (text.includes('provider is not enabled')) {
    return 'El proveedor no está habilitado en Supabase (Authentication → Providers).'
  }
  return message || 'Ha ocurrido un error inesperado.'
}

/**
 * Determina si la aplicación se ejecuta dentro del entorno Electron (escritorio).
 */
export function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as unknown as {
    arqStudio?: {
      auth?: unknown
      shell?: unknown
    }
  }
  return Boolean(win.arqStudio?.auth || win.arqStudio?.shell)
}

/**
 * Determina si la aplicación se ejecuta en entorno de desarrollo.
 */
export function isDevEnvironment(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return true
  }
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
    return true
  }
  return false
}

/**
 * Obtiene la URL de redirección adecuada para OAuth según el entorno de ejecución:
 * 1. En entorno de desarrollo (import.meta.env.DEV):
 *    Usa http://localhost:5173/#/auth/callback (ruta web local con hash).
 * 2. En producción empaquetada de Electron:
 *    Usa el protocolo personalizado arqstudio://auth/callback.
 * 3. En entorno Web de producción:
 *    Usa origin + /#/auth/callback
 */
export function getOAuthRedirectUrl(): string {
  // 1. Entorno de desarrollo: soporte inteligente para Linux y navegadores locales
  if (isDevEnvironment()) {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return `${window.location.origin}/#/auth/callback`
    }
    return 'http://localhost:5173/#/auth/callback'
  }

  // 2. En Electron empaquetado para producción (con electron-builder)
  if (isElectronEnvironment()) {
    return 'arqstudio://auth/callback'
  }

  // 3. Web en producción
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/#/auth/callback`
  }
  return 'http://localhost:5173/#/auth/callback'
}

/**
 * Extrae parámetros de autenticación (code, access_token, refresh_token, errores)
 * de forma unificada tanto de deep links (`arqstudio://**`) como de URLs Web (`http://...#...`).
 */
export function extractAuthParams(rawUrl: string): {
  code: string | null
  accessToken: string | null
  refreshToken: string | null
  error: string | null
  errorDescription: string | null
} {
  let normalized = (rawUrl || '').trim()
  if (normalized.startsWith('arqstudio://')) {
    normalized = normalized.replace(/^arqstudio:\/*/, 'http://localhost/')
  }

  let searchParams: URLSearchParams
  let hashParams: URLSearchParams

  try {
    const urlObj = new URL(normalized)
    searchParams = urlObj.searchParams

    let rawHash = urlObj.hash || ''
    while (rawHash.startsWith('#')) {
      rawHash = rawHash.slice(1)
    }
    if (rawHash.includes('#')) {
      rawHash = rawHash.split('#').pop() || ''
    }
    if (rawHash.startsWith('?') || rawHash.startsWith('/')) {
      rawHash = rawHash.replace(/^[/?]+/, '')
    }
    hashParams = new URLSearchParams(rawHash)
  } catch {
    searchParams = new URLSearchParams()
    hashParams = new URLSearchParams()
  }

  const getParam = (name: string): string | null => {
    return hashParams.get(name) || searchParams.get(name) || null
  }

  const getParamWithRegex = (name: string): string | null => {
    const direct = getParam(name)
    if (direct) return direct
    const regex = new RegExp(`[#?&]${name}=([^&#]+)`)
    const match = rawUrl.match(regex)
    return match ? decodeURIComponent(match[1]) : null
  }

  const code = getParamWithRegex('code')
  const accessToken = getParamWithRegex('access_token')
  const refreshToken = getParamWithRegex('refresh_token')
  const error = getParamWithRegex('error')
  const errorDescription = getParamWithRegex('error_description') || getParamWithRegex('error')

  return { code, accessToken, refreshToken, error, errorDescription }
}

/** Abre una URL en el navegador del sistema (para OAuth); degrada a window.open si está disponible. */
function openExternal(url: string): void {
  const bridge = (window as unknown as { arqStudio?: { shell?: { openExternal(url: string): void } } }).arqStudio
    ?.shell
  if (bridge && typeof bridge.openExternal === 'function') {
    bridge.openExternal(url)
    return
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank')
  }
}

/**
 * Notifica a la aplicación de escritorio Electron que el inicio de sesión se completó en el navegador,
 * envía los tokens al relay local, intenta abrir el protocolo arqstudio:// y muestra la interfaz de retorno.
 */
export function showAuthCallbackScreen(tokens: {
  url?: string
  access_token?: string | null
  refresh_token?: string | null
  code?: string | null
}): void {
  if (typeof document === 'undefined') return

  // Evitar duplicar la pantalla si ya existe
  if (document.getElementById('arq-auth-callback-container')) return

  const accessToken = tokens.access_token || ''
  const refreshToken = tokens.refresh_token || ''
  const code = tokens.code || ''

  // 1. Enviar tokens al relay local de Electron en 127.0.0.1 y localhost (POST + GET)
  const notifyRelay = () => {
    const payload = JSON.stringify({
      url: tokens.url || (typeof window !== 'undefined' ? window.location.href : ''),
      access_token: accessToken,
      refresh_token: refreshToken,
      code
    })

    const endpoints = [
      'http://127.0.0.1:45678/auth-callback',
      'http://localhost:45678/auth-callback',
      'http://127.0.0.1:38282/auth-tokens'
    ]

    for (const endpoint of endpoints) {
      try {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        })
          .then((res) => {
            if (res.ok) {
              const statusEl = document.getElementById('arq-return-status')
              const subtitleEl = document.getElementById('arq-return-subtitle')
              if (subtitleEl) {
                subtitleEl.innerHTML = '<strong>¡Autenticación exitosa!</strong> Puedes cerrar esta pestaña y volver a la app.'
                subtitleEl.style.color = '#10b981'
              }
              if (statusEl) {
                statusEl.innerText = 'Sesión transferida con éxito a la aplicación de escritorio.'
                statusEl.style.color = '#10b981'
              }
              try {
                window.close()
              } catch {}
            }
          })
          .catch(() => {})
      } catch {}
    }

    // Fallback GET con imagen por si CORS o Private Network Access bloquea el POST
    try {
      const img = new Image()
      img.src = `http://127.0.0.1:45678/auth-callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&code=${encodeURIComponent(code)}&t=${Date.now()}`
    } catch {}
  }

  notifyRelay()

  // 2. Intentar deep link a arqstudio:// para que el sistema operativo dé foco a Electron
  const deepLinkParams = new URLSearchParams()
  if (accessToken) deepLinkParams.set('access_token', accessToken)
  if (refreshToken) deepLinkParams.set('refresh_token', refreshToken)
  if (code) deepLinkParams.set('code', code)
  const deepLinkUrl = `arqstudio://auth/callback#${deepLinkParams.toString()}`

  try {
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = deepLinkUrl
    document.body.appendChild(iframe)
    setTimeout(() => iframe.remove(), 2000)
  } catch {}

  // 3. Montar pantalla estética de confirmación en la pestaña del navegador
  const container = document.createElement('div')
  container.id = 'arq-auth-callback-container'
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #0b0c0e;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #e5e7eb;
    padding: 24px;
    box-sizing: border-box;
  `

  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''

  container.innerHTML = `
    <div style="
      background: #18191c;
      border: 1px solid #2d3036;
      border-radius: 16px;
      padding: 40px 36px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.7);
    ">
      <div style="
        width: 64px;
        height: 64px;
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 24px auto;
        color: #10b981;
      ">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>

      <h2 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 600; color: #ffffff;">
        ¡Inicio de sesión completado!
      </h2>
      <p id="arq-return-subtitle" style="margin: 0 0 28px 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
        Tu cuenta se ha autenticado con éxito. Estamos transfiriendo tu sesión a la aplicación de escritorio de ArqStudio.
      </p>

      <button id="arq-btn-return-app" style="
        width: 100%;
        padding: 14px 20px;
        background: #2563eb;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.15s ease, transform 0.05s ease;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        Volver a ArqStudio (Escritorio)
      </button>

      <div style="margin-top: 16px;">
        <a id="arq-btn-continue-web" href="${origin}/#" style="
          font-size: 13px;
          color: #6b7280;
          text-decoration: none;
          transition: color 0.15s ease;
        ">
          Continuar en versión Web
        </a>
      </div>

      <p id="arq-return-status" style="margin: 20px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.4;">
        Si la ventana de escritorio no se abre automáticamente, haz clic en el botón de arriba.
      </p>
    </div>
  `

  document.body.appendChild(container)

  const returnBtn = document.getElementById('arq-btn-return-app')
  const statusText = document.getElementById('arq-return-status')

  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      notifyRelay()
      if (statusText) {
        statusText.innerText = 'Enfocando ArqStudio... Si la aplicación no aparece al frente, búscala en la barra de tareas.'
        statusText.style.color = '#10b981'
      }
      window.location.href = deepLinkUrl
    })
  }
}

function mapSupabaseUser(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null
): AuthUser | null {
  if (!user) return null
  const email = user.email ?? ''
  const metadataName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''
  return {
    id: user.id,
    email,
    name: metadataName.trim() || email.split('@')[0] || 'Usuario',
    local: false
  }
}

export class AuthService {
  /** true solo si hay claves reales en el .env (ver services/supabaseClient.ts) o un cliente inyectado. */
  get configured(): boolean {
    return isSupabaseConfigured || supabase !== null
  }

  private user: AuthUser | null = null
  private readonly listeners = new Set<AuthListener>()
  private readonly ready: Promise<void>
  private lastProcessedUrl: string | null = null
  private lastProcessedTime = 0

  /** Base local: en modo local los usuarios viven en SQLite (contraseña con hash). */
  private readonly db = databaseService

  constructor() {
    this.ready = this.restoreSession()
  }

  get currentUser(): AuthUser | null {
    return this.user
  }

  isAuthenticated(): boolean {
    return this.user !== null
  }

  /** Nombre corto para la cabecera del dashboard («Manuel»). */
  get displayName(): string {
    if (!this.user) return 'Invitado'
    return this.user.name.split(' ')[0] || this.user.email
  }

  /** Resuelve cuando la sesión persistida ya se intentó restaurar. */
  whenReady(): Promise<void> {
    return this.ready
  }

  /** Suscripción a los cambios de sesión; devuelve la función para desuscribirse. */
  onChange(listener: AuthListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setUser(user: AuthUser | null): void {
    this.user = user
    this.listeners.forEach((listener) => listener(user))
  }

  /**
   * Limpia la barra de direcciones del navegador web tras procesar los tokens de OAuth
   * para no dejar credenciales sensibles expuestas en la URL.
   */
  private cleanUrlAfterAuth(): void {
    if (typeof window !== 'undefined' && window.history?.replaceState && window.location) {
      try {
        const hash = window.location.hash || ''
        const search = window.location.search || ''
        if (
          hash.includes('access_token=') ||
          hash.includes('code=') ||
          hash.includes('error_description=') ||
          search.includes('code=') ||
          search.includes('error=')
        ) {
          const cleanUrl = window.location.origin + window.location.pathname + '#'
          window.history.replaceState(null, document.title, cleanUrl)
        }
      } catch {
        /* ignorar en entornos sin acceso a history */
      }
    }
  }

  private async restoreSession(): Promise<void> {
    // 1. Escucha de deep links (arqstudio://auth/callback) y tokens emitidos por Electron
    const bridge = (
      window as unknown as {
        arqStudio?: {
          auth?: {
            onTokens?(cb: (tokens: unknown) => void): () => void
            onDeepLink?(cb: (url: string) => void): () => void
            onAuthRedirect?(cb: (url: string) => void): () => void
          }
        }
      }
    ).arqStudio?.auth

    if (bridge?.onTokens) {
      bridge.onTokens((tokens: unknown) => {
        void this.handleTokens(
          tokens as {
            url?: string
            access_token?: string | null
            refresh_token?: string | null
            code?: string | null
            error?: string | null
            error_description?: string | null
          }
        )
      })
    }
    if (bridge?.onDeepLink) {
      bridge.onDeepLink((url: string) => {
        void this.handleDeepLink(url)
      })
    }
    if (bridge?.onAuthRedirect) {
      bridge.onAuthRedirect((url: string) => {
        void this.handleAuthRedirect(url)
      })
    }

    // 2. Procesar callback OAuth si se llega por URL Web en la carga inicial (o hashchange)
    if (typeof window !== 'undefined' && window.location) {
      const isCallbackUrl = (href: string): boolean => {
        return (
          href.includes('access_token=') ||
          href.includes('code=') ||
          href.includes('error_description=') ||
          href.includes('/auth/callback') ||
          Boolean(window.location.pathname && window.location.pathname.includes('/auth/callback')) ||
          Boolean(window.location.hash && window.location.hash.includes('/auth/callback'))
        )
      }

      const initialHref = window.location.href || ''
      if (isCallbackUrl(initialHref)) {
        await this.handleUrl(initialHref)
      }

      window.addEventListener('hashchange', () => {
        const href = window.location.href || ''
        if (isCallbackUrl(href)) {
          void this.handleUrl(href)
        }
      })
    }

    if (this.configured && supabase) {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user && !this.user) {
        this.setUser(mapSupabaseUser(data.session.user))
      }
      // Cubre tanto los logins hechos aquí como la vuelta de un OAuth o deep link.
      supabase.auth.onAuthStateChange((_event, session) => {
        this.setUser(mapSupabaseUser(session?.user ?? null))
      })
      return
    }
    // Curación: la primera vez se importan los usuarios que la versión anterior
    // guardaba en `localStorage` (la contraseña se guarda hasheada en SQLite).
    await this.migrateLegacyUsers()
    this.setUser(readJson<AuthUser | null>(SESSION_KEY, null))
  }

  /**
   * Maneja directamente los tokens recibidos por IPC desde el proceso main de Electron.
   */
  async handleTokens(tokens: {
    url?: string
    access_token?: string | null
    refresh_token?: string | null
    code?: string | null
    error?: string | null
    error_description?: string | null
  }): Promise<AuthResult> {
    if (!this.configured || !supabase) {
      return { ok: false, success: false, error: 'Supabase no está configurado.' }
    }

    if (tokens.error || tokens.error_description) {
      const err = tokens.error_description || tokens.error || 'Error en la autenticación.'
      return { ok: false, success: false, error: translateAuthError(err) }
    }

    if (tokens.access_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || ''
      })
      if (error) {
        return { ok: false, success: false, error: translateAuthError(error.message) }
      }
      if (data.session) {
        this.setUser(mapSupabaseUser(data.session.user))
        this.cleanUrlAfterAuth()
        return { ok: true, success: true, notice: 'Sesión iniciada correctamente.' }
      }
    }

    if (tokens.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(tokens.code)
      if (error) {
        return { ok: false, success: false, error: translateAuthError(error.message) }
      }
      if (data.session) {
        this.setUser(mapSupabaseUser(data.session.user))
        this.cleanUrlAfterAuth()
        return { ok: true, success: true, notice: 'Sesión iniciada correctamente.' }
      }
    }

    if (tokens.url) {
      return this.handleUrl(tokens.url)
    }

    return { ok: false, success: false, error: 'No se encontraron credenciales de sesión.' }
  }

  /**
   * Procesa cualquier URL de callback de autenticación (tanto de deep link arqstudio:// como de Web http://...).
   */
  async handleUrl(url: string): Promise<AuthResult> {
    if (!url || typeof url !== 'string') {
      return { ok: false, success: false, code: 'INVALID_URL', error: 'URL de enlace no válida.' }
    }

    const trimmed = url.trim()
    const isDeepLink = trimmed.startsWith('arqstudio://')
    const isHttp = /^https?:\/\//i.test(trimmed)

    if (!isDeepLink && !isHttp) {
      return { ok: false, success: false, code: 'INVALID_URL', error: 'URL de enlace no válida.' }
    }

    if (!this.configured || !supabase) {
      return { ok: false, success: false, error: 'Supabase no está configurado.' }
    }

    // Evitar reprocesar la misma URL idéntica en ráfaga (por eventos dobles IPC/hashchange)
    const now = Date.now()
    if (this.lastProcessedUrl === trimmed && now - this.lastProcessedTime < 2500) {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        this.setUser(mapSupabaseUser(data.session.user))
        return { ok: true, success: true }
      }
    }
    this.lastProcessedUrl = trimmed
    this.lastProcessedTime = now

    try {
      const { code, accessToken, refreshToken, error, errorDescription } = extractAuthParams(trimmed)

      // Errores transmitidos en la redirección OAuth
      if (error || errorDescription) {
        const desc = errorDescription || error || 'Error en la autenticación externa.'
        return {
          ok: false,
          success: false,
          code: 'GENERIC_ERROR',
          error: translateAuthError(desc)
        }
      }

      // Si la URL se abrió en el navegador web externo durante desarrollo, transferir tokens al relay local de Electron
      if (!isElectronEnvironment() && (accessToken || code)) {
        showAuthCallbackScreen({
          url: trimmed,
          access_token: accessToken,
          refresh_token: refreshToken,
          code
        })
      }

      // 1. Flujo de tokens (#access_token=...&refresh_token=... o en query)
      if (accessToken) {
        const { data, error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || ''
        })
        if (setSessionError) {
          return { ok: false, success: false, error: translateAuthError(setSessionError.message) }
        }
        if (data.session) {
          this.setUser(mapSupabaseUser(data.session.user))
          if (!isElectronEnvironment()) {
            showAuthCallbackScreen({
              url: trimmed,
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              code
            })
          }
          this.cleanUrlAfterAuth()
          return { ok: true, success: true, notice: 'Sesión confirmada e iniciada correctamente.' }
        }
      }

      // 2. Flujo PKCE (code en query params o hash)
      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          return { ok: false, success: false, error: translateAuthError(exchangeError.message) }
        }
        if (data.session) {
          this.setUser(mapSupabaseUser(data.session.user))
          if (!isElectronEnvironment()) {
            showAuthCallbackScreen({
              url: trimmed,
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              code
            })
          }
          this.cleanUrlAfterAuth()
          return { ok: true, success: true, notice: 'Sesión iniciada correctamente desde el enlace.' }
        }
      }

      // 3. Comprobación de respaldo de sesión activa
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        this.setUser(mapSupabaseUser(data.session.user))
        if (!isElectronEnvironment()) {
          showAuthCallbackScreen({
            url: trimmed,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            code
          })
        }
        this.cleanUrlAfterAuth()
        return { ok: true, success: true }
      }

      return { ok: false, success: false, error: 'No se encontraron credenciales en el enlace.' }
    } catch (err) {
      return {
        ok: false,
        success: false,
        error: (err as Error).message || 'Error al procesar el enlace de autenticación.'
      }
    }
  }

  /** Procesa una URL de deep link arqstudio:// recibida desde Electron. */
  async handleDeepLink(url: string): Promise<AuthResult> {
    if (!url || !url.startsWith('arqstudio://')) {
      return { ok: false, success: false, code: 'INVALID_URL', error: 'URL de enlace no válida.' }
    }
    return this.handleUrl(url)
  }

  /** Trae a la base local los usuarios del almacén antiguo (una sola vez). */
  private async migrateLegacyUsers(): Promise<void> {
    if ((await this.db.getSetting('usuarios.migrados')) === 'true') return
    const legacy = readJson<LocalUserRecord[]>(USERS_KEY, [])
    if (legacy.length > 0) {
      await this.db.importLegacy({
        users: legacy.map((record) => ({
          id: record.id,
          email: record.email,
          name: record.name,
          password: record.password
        }))
      })
    }
    await this.db.setSetting('usuarios.migrados', 'true')
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    await this.ready
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      return {
        ok: false,
        success: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Completa el correo y la contraseña.'
      }
    }

    if (this.configured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (error) {
        const errorMsg = (error.message || '').toLowerCase()
        const isEmailNotConfirmed =
          errorMsg.includes('email not confirmed') ||
          (error as { code?: string }).code === 'email_not_confirmed'

        if (isEmailNotConfirmed) {
          return {
            ok: false,
            success: false,
            code: 'EMAIL_NOT_CONFIRMED',
            email: cleanEmail,
            error: translateAuthError(error.message)
          }
        }

        const isRateLimited =
          errorMsg.includes('rate limit') ||
          (error as { code?: string }).code === 'over_request_rate_limit'
        const isBadCredentials =
          errorMsg.includes('invalid login credentials') ||
          (error as { code?: string }).code === 'invalid_credentials'

        return {
          ok: false,
          success: false,
          code: isRateLimited ? 'RATE_LIMITED' : isBadCredentials ? 'INVALID_CREDENTIALS' : 'GENERIC_ERROR',
          email: cleanEmail,
          error: translateAuthError(error.message)
        }
      }
      this.setUser(mapSupabaseUser(data.user))
      return { ok: true, success: true }
    }

    // Modo local: la base SQLite verifica la contraseña con scrypt + sal.
    await this.migrateLegacyUsers()
    const viaDatabase = await this.db.signIn({ email: cleanEmail, password })
    if (viaDatabase) {
      if (!viaDatabase.user) {
        return {
          ok: false,
          success: false,
          code: 'INVALID_CREDENTIALS',
          error: viaDatabase.error ?? 'Correo o contraseña incorrectos.'
        }
      }
      const user: AuthUser = { ...viaDatabase.user, local: true }
      writeJson(SESSION_KEY, user)
      this.setUser(user)
      return { ok: true, success: true, notice: 'Sesión iniciada en modo local (Supabase sin configurar).' }
    }

    // Último recurso: almacén del navegador.
    const users = readJson<LocalUserRecord[]>(USERS_KEY, [])
    const found = users.find((candidate) => candidate.email === cleanEmail)
    if (!found || found.password !== password) {
      return { ok: false, success: false, code: 'INVALID_CREDENTIALS', error: 'Correo o contraseña incorrectos.' }
    }
    const user: AuthUser = { id: found.id, email: found.email, name: found.name, local: true }
    writeJson(SESSION_KEY, user)
    this.setUser(user)
    return { ok: true, success: true, notice: 'Sesión iniciada en modo local (Supabase sin configurar).' }
  }

  async signUp(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    await this.ready
    const name = input.name.trim()
    const email = input.email.trim().toLowerCase()

    if (this.configured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: { full_name: name },
          emailRedirectTo: getOAuthRedirectUrl()
        }
      })
      if (error) {
        const errorMsg = (error.message || '').toLowerCase()
        const isRateLimited =
          errorMsg.includes('rate limit') ||
          (error as { code?: string }).code === 'over_request_rate_limit'
        return {
          ok: false,
          success: false,
          code: isRateLimited ? 'RATE_LIMITED' : 'GENERIC_ERROR',
          email,
          error: translateAuthError(error.message)
        }
      }
      // Con «Confirm email» activado en Supabase no hay sesión todavía.
      if (!data.session) {
        return {
          ok: true,
          success: true,
          needsEmailConfirmation: true,
          code: 'EMAIL_NOT_CONFIRMED',
          email,
          notice: 'Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión.'
        }
      }
      this.setUser(mapSupabaseUser(data.user))
      return { ok: true, success: true }
    }

    // Modo local: cuenta nueva en la base SQLite (contraseña hasheada).
    await this.migrateLegacyUsers()
    const viaDatabase = await this.db.signUp({ name, email, password: input.password })
    if (viaDatabase) {
      if (!viaDatabase.user) {
        return {
          ok: false,
          success: false,
          code: 'GENERIC_ERROR',
          error: viaDatabase.error ?? 'No se pudo crear la cuenta.'
        }
      }
      const user: AuthUser = { ...viaDatabase.user, local: true }
      writeJson(SESSION_KEY, user)
      this.setUser(user)
      return { ok: true, success: true, notice: 'Cuenta creada en modo local y sesión iniciada.' }
    }

    // Último recurso: almacén del navegador.
    const users = readJson<LocalUserRecord[]>(USERS_KEY, [])
    if (users.some((candidate) => candidate.email === email)) {
      return {
        ok: false,
        success: false,
        code: 'GENERIC_ERROR',
        error: 'Ese correo ya tiene una cuenta: inicia sesión.'
      }
    }
    const record: LocalUserRecord = {
      id: `local-${Date.now().toString(36)}`,
      email,
      name: name || email,
      password: input.password
    }
    writeJson(USERS_KEY, [...users, record])
    const user: AuthUser = { id: record.id, email: record.email, name: record.name, local: true }
    writeJson(SESSION_KEY, user)
    this.setUser(user)
    return { ok: true, success: true, notice: 'Cuenta creada en modo local y sesión iniciada.' }
  }

  /** Reenvía el correo de confirmación de registro con redirect según el entorno */
  async resendVerificationEmail(email: string): Promise<AuthResult> {
    await this.ready
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      return {
        ok: false,
        success: false,
        code: 'INVALID_EMAIL',
        error: 'Ingresa un correo electrónico válido.'
      }
    }

    if (this.configured && supabase) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: getOAuthRedirectUrl()
        }
      })
      if (error) {
        const errorMsg = (error.message || '').toLowerCase()
        const isRateLimited =
          errorMsg.includes('rate limit') ||
          (error as { code?: string }).code === 'over_request_rate_limit'
        return {
          ok: false,
          success: false,
          code: isRateLimited ? 'RATE_LIMITED' : 'GENERIC_ERROR',
          email: cleanEmail,
          error: translateAuthError(error.message)
        }
      }
      return {
        ok: true,
        success: true,
        email: cleanEmail,
        notice: `Correo de confirmación reenviado con éxito a ${cleanEmail}. Revisa tu bandeja.`
      }
    }

    // Modo local: simulación para testing y coherencia
    return {
      ok: true,
      success: true,
      email: cleanEmail,
      notice: `Modo local: simulado reenvío de confirmación a ${cleanEmail}.`
    }
  }

  async signInWithProvider(provider: AuthProvider): Promise<AuthResult> {
    await this.ready
    const label = provider === 'google' ? 'Google' : 'GitHub'

    if (this.configured && supabase) {
      const isDesktop = isElectronEnvironment()
      const redirectTo = getOAuthRedirectUrl()

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          skipBrowserRedirect: isDesktop,
          redirectTo
        }
      })
      if (error) {
        return { ok: false, success: false, code: 'GENERIC_ERROR', error: translateAuthError(error.message) }
      }
      if (data?.url) {
        if (isDesktop) {
          // Abrir directamente en el navegador predeterminado del sistema (Chrome/Firefox)
          // donde el usuario ya tiene su sesión y cuentas iniciadas
          openExternal(data.url)
          return {
            ok: true,
            success: true,
            external: true,
            notice: `Se abrió el navegador para entrar con ${label}. Completa el inicio de sesión y vuelve a ArqStudio.`
          }
        } else {
          if (typeof window !== 'undefined' && window.location) {
            window.location.assign(data.url)
          }
          return {
            ok: true,
            success: true,
            notice: `Redirigiendo a ${label}...`
          }
        }
      }

      return {
        ok: true,
        success: true,
        external: isDesktop,
        notice: isDesktop
          ? `Se inició el flujo con ${label}. Completa el inicio de sesión y vuelve a la app.`
          : `Iniciando sesión con ${label}...`
      }
    }

    // Modo local: sesión de demostración para no bloquear el recorrido visual.
    const user: AuthUser = {
      id: `local-${provider}`,
      email: `demo.${provider}@arqstudio.local`,
      name: provider === 'google' ? 'Demo Google' : 'Demo GitHub',
      local: true
    }
    writeJson(SESSION_KEY, user)
    this.setUser(user)
    return {
      ok: true,
      success: true,
      notice: `Modo local: sesión de demostración de ${label} iniciada (configura Supabase para OAuth real).`
    }
  }

  async signOut(): Promise<void> {
    await this.ready
    if (this.configured && supabase) await supabase.auth.signOut()
    removeKey(SESSION_KEY)
    this.setUser(null)
  }

  /**
   * Maneja la URL de retorno del deep link arqstudio://auth/callback
   * o callback Web tras completar el flujo OAuth.
   * Devuelve el resultado AuthResult.
   */
  async handleAuthRedirect(url: string): Promise<AuthResult> {
    await this.ready
    return this.handleUrl(url)
  }
}
