import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin, type Plugin } from 'electron-vite'

// Directorio real donde está este archivo (raíz del proyecto).
// Usamos import.meta.url en lugar de process.cwd() porque cwd() puede
// cambiar según desde dónde se invoque `npm run dev`.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * Sello de hora de compilación visible en la barra de estado («build
 * YYYY-MM-DD HH:MM»). Sirve para confirmar de un vistazo que se está viendo el
 * código recién compilado y no un `out/` obsoleto.
 *
 * `define` llega al bundler de producción, pero **electron-vite 2.3 no lo propaga
 * al dev server del renderer**: en `npm run dev` la macro quedaba literal y la
 * barra mostraba «dev». Este plugin hace el reemplazo en tiempo de
 * transformación, así funciona igual en dev y en build. En dev la hora se
 * congela al arrancar el servidor (no en cada recarga), que es justo lo que se
 * quiere: es la hora de la compilación/servido en curso.
 */
function buildStamp(): Plugin {
  const stamp = JSON.stringify(new Date().toISOString())
  return {
    name: 'arqstudio:build-stamp',
    enforce: 'pre',
    transform(code) {
      if (!code.includes('__BUILD_TIME__')) return null
      // Se reemplaza la macro por su valor, pero se conserva la declaración de
      // tipo `declare const __BUILD_TIME__` (si se sustituyera, esbuild rompería
      // el tipado con «declare const "2026-…"»).
      const replaced = code.replace(/^(\s*declare\s+const\s+)__BUILD_TIME__/gm, '$1__BUILD_TIME_TYPE_KEEP__')
      const stamped = replaced.replace(/__BUILD_TIME__/g, stamp)
      return { code: stamped.replace(/__BUILD_TIME_TYPE_KEEP__/g, '__BUILD_TIME__'), map: null }
    }
  }
}

export default defineConfig({
  // `externalizeDepsPlugin` deja las dependencias fuera del bundle: imprescindible
  // para `sql.js`, que necesita leer su `sql-wasm.wasm` desde `node_modules` en
  // tiempo de ejecución (y para no duplicar `three`/`@supabase` en el proceso main).
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: 'src/renderer',
    // El sello de hora lo inyecta el plugin `buildStamp` (define no llega al dev
    // server); se mantiene también como `define` para que el build de producción
    // lo sustituya aunque el plugin no transforme (p. ej. en dependencias).
    plugins: [buildStamp()],
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    },
    // El root del renderer es `src/renderer`, y Vite resuelve `envDir` **contra
    // su root**, así que `envDir: '.'` buscaría el .env en src/renderer (donde
    // no está) y las variables llegarían vacías. Usamos PROJECT_ROOT (la ruta
    // absoluta de este archivo de configuración, que está en la raíz del
    // proyecto) para que Vite lea el `.env` de la raíz:
    // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (ver SUPABASE_SETUP.md).
    envDir: PROJECT_ROOT
  }
})

