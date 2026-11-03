/// <reference types="vite/client" />

/**
 * Tipado de las variables de entorno que Vite inyecta en el renderer
 * (`import.meta.env`). Solo se exponen al cliente las que empiezan por `VITE_`;
 * el resto del .env nunca llega al renderer. Ver SUPABASE_SETUP.md.
 */
interface ImportMetaEnv {
  /** URL del proyecto Supabase (Supabase → Project Settings → API). */
  readonly VITE_SUPABASE_URL: string
  /** Clave pública «anon» de Supabase. */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
