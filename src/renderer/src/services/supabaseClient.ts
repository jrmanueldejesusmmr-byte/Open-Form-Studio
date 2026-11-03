import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase compartido por todo el renderer.
 *
 * Las claves se leen del `.env` de la raíz del proyecto (Vite las inyecta en
 * `import.meta.env` porque el renderer tiene `envDir: '.'` en
 * electron.vite.config.ts). Instrucciones paso a paso: SUPABASE_SETUP.md.
 *
 * Detalle importante respecto al snippet mínimo:
 * `createClient('', '')` **lanza una excepción** («supabaseUrl is required»), y
 * eso dejaría la app inutilizable mientras el `.env` esté vacío (o con los
 * textos de ejemplo). Por eso `supabase` es `null` cuando la configuración no
 * está puesta y la app entra en «modo local» (auth y proyectos en el propio
 * equipo) en lugar de romperse.
 */

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabaseUrl = rawUrl || ''
const supabaseAnonKey = rawKey || ''

const hasValidUrl = /^https?:\/\/.+/i.test(supabaseUrl.trim())
const hasValidKey = supabaseAnonKey.trim().length > 20

/** true solo cuando hay URL y anon key reales: habilita auth y proyectos en la nube. */
export const isSupabaseConfigured = hasValidUrl && hasValidKey

export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl.trim(), supabaseAnonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined,
        storageKey: 'arqstudio.supabase.auth.token',
        flowType: 'pkce'
      }
    })
  : null

/** Permite configurar un cliente mock para tests unitarios. */
export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  supabase = client
}

// Debug: registrar qué valores de entorno llegan al renderer.
if (import.meta.env.DEV) {
  console.info('[ArqStudio] Supabase env debug:', {
    VITE_SUPABASE_URL: rawUrl ? `${rawUrl.substring(0, 30)}...` : '(vacío)',
    VITE_SUPABASE_ANON_KEY: rawKey ? `${rawKey.substring(0, 20)}...` : '(vacío)',
    isSupabaseConfigured,
  })
}

/** Mensaje único para la interfaz cuando falta la configuración. */
export const SUPABASE_SETUP_HINT =
  'Supabase sin configurar: la app funciona en modo local. Pega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env (ver SUPABASE_SETUP.md).'
