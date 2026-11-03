import { strict as assert } from 'node:assert'
import {
  AuthService,
  translateAuthError,
  getOAuthRedirectUrl,
  isElectronEnvironment,
  isDevEnvironment,
  extractAuthParams
} from './AuthService'
import { setSupabaseClientForTesting } from './supabaseClient'
import type { SupabaseClient } from '@supabase/supabase-js'

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

async function runTests(): Promise<void> {
  const storage = memoryLocalStorage()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    open: () => {},
    arqStudio: {
      auth: {
        onDeepLink: () => () => {}
      },
      shell: {
        openExternal: () => {}
      }
    }
  }

  // 1. Detección específica de error de correo sin confirmar
  {
    let lastResendCall: unknown = null
    let lastSignUpCall: unknown = null
    let lastOAuthCall: unknown = null

    const mockSupabase = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithOAuth: async (args: unknown) => {
          lastOAuthCall = args
          const typed = args as { provider: string; options?: { redirectTo?: string; skipBrowserRedirect?: boolean } }
          return {
            data: {
              url: `https://mock.supabase.co/auth/v1/authorize?provider=${typed.provider}&redirect_to=${encodeURIComponent(typed.options?.redirectTo || '')}`,
              provider: typed.provider
            },
            error: null
          }
        },
        signInWithPassword: async ({ email }: { email: string }) => {
          if (email === 'unconfirmed@example.com') {
            return {
              data: { user: null, session: null },
              error: { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 }
            }
          }
          if (email === 'ratelimited@example.com') {
            return {
              data: { user: null, session: null },
              error: { message: 'rate limit exceeded', code: 'over_request_rate_limit', status: 429 }
            }
          }
          return {
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 }
          }
        },
        signUp: async (args: unknown) => {
          lastSignUpCall = args
          return {
            data: { user: { id: 'u1', email: 'new@example.com' }, session: null },
            error: null
          }
        },
        resend: async (args: unknown) => {
          lastResendCall = args
          const typed = args as { email: string }
          if (typed.email === 'ratelimit@example.com') {
            return { error: { message: 'Rate limit exceeded', code: 'over_request_rate_limit' } }
          }
          return { error: null }
        },
        exchangeCodeForSession: async (code: string) => {
          if (code === 'valid-code') {
            return {
              data: {
                session: {
                  user: { id: 'code-user', email: 'verified@example.com' },
                  access_token: 'tok',
                  refresh_token: 'ref'
                }
              },
              error: null
            }
          }
          return { data: { session: null }, error: { message: 'Invalid code' } }
        },
        setSession: async ({ access_token }: { access_token: string }) => {
          if (access_token === 'valid-token') {
            return {
              data: {
                session: {
                  user: { id: 'token-user', email: 'token@example.com' },
                  access_token: 'valid-token',
                  refresh_token: 'ref'
                }
              },
              error: null
            }
          }
          return { data: { session: null }, error: { message: 'Invalid token' } }
        }
      }
    }

    setSupabaseClientForTesting(mockSupabase as unknown as SupabaseClient)
    const auth = new AuthService()
    await auth.whenReady()

    // Prueba 1.1: Correo no confirmado en signIn
    const unconfirmedResult = await auth.signIn('unconfirmed@example.com', 'password123')
    assert.equal(unconfirmedResult.ok, false)
    assert.equal(unconfirmedResult.success, false)
    assert.equal(unconfirmedResult.code, 'EMAIL_NOT_CONFIRMED')
    assert.equal(unconfirmedResult.email, 'unconfirmed@example.com')
    assert.match(unconfirmedResult.error ?? '', /Tu cuenta aún no ha sido confirmada/i)
    ok('signIn detecta específicamente EMAIL_NOT_CONFIRMED con código, email y mensaje claro')

    // Prueba 1.2: Credenciales incorrectas en signIn
    const badCredsResult = await auth.signIn('wrong@example.com', 'badpass')
    assert.equal(badCredsResult.ok, false)
    assert.equal(badCredsResult.success, false)
    assert.equal(badCredsResult.code, 'INVALID_CREDENTIALS')
    ok('signIn detecta credenciales inválidas como INVALID_CREDENTIALS')

    // Prueba 1.3: Reenvío de confirmación con deep link arqstudio://auth/callback
    const resendResult = await auth.resendVerificationEmail('unconfirmed@example.com')
    assert.equal(resendResult.ok, true)
    assert.equal(resendResult.success, true)
    assert.equal(resendResult.email, 'unconfirmed@example.com')
    assert.match(resendResult.notice ?? '', /reenviado con éxito/i)
    assert.deepEqual(lastResendCall, {
      type: 'signup',
      email: 'unconfirmed@example.com',
      options: {
        emailRedirectTo: 'arqstudio://auth/callback'
      }
    })
    ok('resendVerificationEmail llama a supabase.auth.resend con type: signup y emailRedirectTo: arqstudio://auth/callback')

    // Prueba 1.4: Rate limit en reenvío
    const rateLimitResult = await auth.resendVerificationEmail('ratelimit@example.com')
    assert.equal(rateLimitResult.ok, false)
    assert.equal(rateLimitResult.success, false)
    assert.equal(rateLimitResult.code, 'RATE_LIMITED')
    ok('resendVerificationEmail detecta rate limit y retorna código RATE_LIMITED')

    // Prueba 1.5: signUp pasa emailRedirectTo arqstudio://auth/callback
    const signUpResult = await auth.signUp({
      name: 'Manuel',
      email: 'new@example.com',
      password: 'password123'
    })
    assert.equal(signUpResult.ok, true)
    assert.equal(signUpResult.needsEmailConfirmation, true)
    assert.equal(signUpResult.code, 'EMAIL_NOT_CONFIRMED')
    assert.equal(signUpResult.email, 'new@example.com')
    assert.deepEqual(lastSignUpCall, {
      email: 'new@example.com',
      password: 'password123',
      options: {
        data: { full_name: 'Manuel' },
        emailRedirectTo: 'arqstudio://auth/callback'
      }
    })
    ok('signUp incluye emailRedirectTo: arqstudio://auth/callback y retorna code EMAIL_NOT_CONFIRMED')

    // Prueba 1.6: handleDeepLink con code (PKCE)
    const codeDeepLinkResult = await auth.handleDeepLink('arqstudio://auth/callback?code=valid-code')
    assert.equal(codeDeepLinkResult.ok, true)
    assert.equal(auth.currentUser?.email, 'verified@example.com')
    ok('handleDeepLink resuelve código PKCE mediante exchangeCodeForSession e inicia sesión')

    // Prueba 1.7: handleDeepLink con tokens en hash
    const tokenDeepLinkResult = await auth.handleDeepLink('arqstudio://auth/callback#access_token=valid-token&refresh_token=ref')
    assert.equal(tokenDeepLinkResult.ok, true)
    assert.equal(auth.currentUser?.email, 'token@example.com')
    ok('handleDeepLink resuelve tokens mediante setSession e inicia sesión')

    // Prueba 1.7b: handleDeepLink con tokens en query params
    const tokenQueryDeepLinkResult = await auth.handleDeepLink('arqstudio://auth/callback?access_token=valid-token&refresh_token=ref')
    assert.equal(tokenQueryDeepLinkResult.ok, true)
    assert.equal(auth.currentUser?.email, 'token@example.com')
    ok('handleDeepLink resuelve tokens recibidos por query params e inicia sesión')

    // Prueba 1.8: handleUrl con redireccionamiento Web (hash con tokens)
    const webHashResult = await auth.handleUrl('http://localhost:5173/#access_token=valid-token&refresh_token=ref')
    assert.equal(webHashResult.ok, true)
    assert.equal(auth.currentUser?.email, 'token@example.com')
    ok('handleUrl procesa correctamente URLs web con hash de tokens (http://localhost:5173/#access_token=...)')

    // Prueba 1.9: handleUrl con redireccionamiento Web (PKCE code en hash o query)
    const webPkceResult = await auth.handleUrl('http://localhost:5173/#?code=valid-code')
    assert.equal(webPkceResult.ok, true)
    assert.equal(auth.currentUser?.email, 'verified@example.com')
    ok('handleUrl procesa correctamente URLs web con PKCE code (http://localhost:5173/#?code=...)')

    const webQueryPkceResult = await auth.handleUrl('http://localhost:5173/?code=valid-code')
    assert.equal(webQueryPkceResult.ok, true)
    ok('handleUrl procesa correctamente URLs web con query params (?code=...)')

    // Prueba 1.10: handleUrl con error de OAuth externo
    const oauthErrorResult = await auth.handleUrl('http://localhost:5173/#error=access_denied&error_description=User+denied+access')
    assert.equal(oauthErrorResult.ok, false)
    assert.equal(oauthErrorResult.code, 'GENERIC_ERROR')
    assert.match(oauthErrorResult.error ?? '', /User denied access|error/i)
    ok('handleUrl captura y traduce errores devueltos en la redirección OAuth')

    // Prueba 1.11: signInWithProvider en Electron genera redirectTo arqstudio://auth/callback
    const oAuthResult = await auth.signInWithProvider('google')
    assert.equal(oAuthResult.ok, true)
    assert.equal(oAuthResult.external, true)
    assert.deepEqual(lastOAuthCall, {
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
        redirectTo: 'arqstudio://auth/callback'
      }
    })
    ok('signInWithProvider en Electron usa skipBrowserRedirect: true y redirectTo: arqstudio://auth/callback')

    // Prueba 1.12: Detección de entorno y URL de retorno para Web
    const currentWindow = (globalThis as unknown as { window: { arqStudio?: unknown; location?: unknown } }).window
    const savedBridge = currentWindow.arqStudio
    try {
      delete (currentWindow as { arqStudio?: unknown }).arqStudio
      currentWindow.location = { origin: 'http://localhost:5173', pathname: '/', hash: '#' }
      assert.equal(isElectronEnvironment(), false)
      assert.equal(getOAuthRedirectUrl(), 'http://localhost:5173/#/auth/callback')
      ok('getOAuthRedirectUrl devuelve http://localhost:5173/#/auth/callback cuando se ejecuta en entorno Web o Dev')
    } finally {
      currentWindow.arqStudio = savedBridge
    }

    // Prueba 1.12b: En modo desarrollo local, getOAuthRedirectUrl usa http://localhost:5173/#/auth/callback
    const originalEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'development'
      assert.equal(isDevEnvironment(), true)
      assert.equal(getOAuthRedirectUrl(), 'http://localhost:5173/#/auth/callback')
      ok('getOAuthRedirectUrl en desarrollo devuelve http://localhost:5173/#/auth/callback incluso en Electron')
    } finally {
      process.env.NODE_ENV = originalEnv
    }

    // Prueba 1.13: handleTokens inyecta tokens directamente en la sesión
    const tokenPayloadResult = await auth.handleTokens({
      access_token: 'valid-token',
      refresh_token: 'ref',
      url: 'arqstudio://auth/callback'
    })
    assert.equal(tokenPayloadResult.ok, true)
    assert.equal(auth.currentUser?.email, 'token@example.com')
    ok('handleTokens inyecta access_token y refresh_token directamente mediante setSession')
  }

  // 2. Traducción de mensajes de error
  {
    assert.match(
      translateAuthError('Email not confirmed'),
      /Tu cuenta aún no ha sido confirmada/i
    )
    assert.match(
      translateAuthError('invalid login credentials'),
      /Correo o contraseña incorrectos/i
    )
    ok('translateAuthError traduce correctamente el mensaje de confirmación de correo')
  }

  console.log('\nAuthService & Deep Links: TODOS LOS TESTS PASARON EXITOSAMENTE.')
}

export const testsDone = runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
