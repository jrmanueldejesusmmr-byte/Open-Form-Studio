# Configuración de Supabase en ArqStudio 3D

Guía corta y práctica para conectar la app con **tu** proyecto de Supabase
(autenticación + guardado de proyectos en la nube).

> **Atajo:** si solo quieres ver la app funcionando, no hagas nada de esto.
> Sin claves, ArqStudio arranca en **modo local** (login y proyectos guardados
> en el propio equipo) y todo el flujo se puede recorrer igual.

---

## 1. ¿Qué cambia al configurar Supabase?

| | Modo local (`.env` vacío) | Con Supabase configurado |
|---|---|---|
| Login / Registro | Cuentas guardadas en `localStorage` del equipo | `supabase.auth` (email + contraseña); la sesión se mantiene al reiniciar |
| Proyectos | `localStorage` (con 5 proyectos de ejemplo) | Tabla `proyectos` del proyecto, filtrada por usuario (RLS) |
| Google / GitHub | Sesión de demostración local | OAuth real (abre el navegador del sistema) |
| Requisitos | Ninguno | Cuenta en [supabase.com](https://supabase.com) |

El renderer detecta automáticamente el modo: la insignia de la esquina
(**Configuración → Conexión con Supabase**) dice si las claves se han
detectado.

### Estado de tu proyecto (comprobado)

Diagnóstico hecho contra `https://xamaaxvitpfjrezhyiia.supabase.co` con las
claves de tu `.env`:

| Comprobación | Resultado |
|---|---|
| URL + `anon key` válidas | ✅ `GET /auth/v1/settings` → **200** |
| Login por correo | ✅ `POST /auth/v1/token` responde (credenciales → `invalid_credentials`) |
| Correo habilitado | ✅ |
| **Confirmación de correo** | ⚠️ **ACTIVA** (`mailer_autoconfirm = false`) |
| Proveedores OAuth | ⚠️ Solo `email`; **Google y GitHub están apagados** |
| Tabla `proyectos` (la que usa la app) | ❌ **No existe** (`PGRST205`) |
| Tabla `projects` (otra, ya presente) | ℹ️ Existe pero con otro esquema: `id, owner_id, name, description, created_at, updated_at` (sin `modo` ni `diseno_index`). **No se toca.** |

**Te quedan dos pasos en el panel de Supabase (yo no puedo hacerlos: la clave
`anon` no tiene permisos de DDL ni de configuración):**

1. **Crear la tabla** → SQL Editor → *New query* → pega
   [`supabase/schema.sql`](./supabase/schema.sql) → **Run**.
2. **Registro con acceso directo** → *Authentication → Sign In / Providers →
   Email* → desmarca **Confirm email** → *Save*. Mientras esté marcado, al
   registrarse la app avisa de que hay que confirmar el correo y no inicia
   sesión.

Después, en la app: el aviso rojo de «Mis proyectos» incluye un botón
**Reintentar** que reactiva la nube sin reiniciar (si aún no lo creaste,
crear el proyecto abre el editor igualmente y te lo guarda en local: nunca se
pierde trabajo).

> **Detalle de implementación:** el cliente se exporta como
> `export const supabase: SupabaseClient | null`, no como un `createClient(...)`
> incondicional. El motivo es que `createClient('', '')` **lanza una excepción**
> («supabaseUrl is required») y dejaría la app inservible mientras el `.env`
> esté vacío. Con este patrón, `supabase` vale `null` y la app entra en modo
> local; el resto del código comprueba `isSupabaseConfigured` antes de usarlo
> (`services/supabaseClient.ts`).

---

## 2. Dónde pegar tus claves

Las claves se leen del archivo **`.env`** en la **raíz del proyecto**
(`~/arqstudio3d-electron/.env`, junto a `package.json`), no dentro de
`src/renderer`. El bundler está configurado para leerlas desde ahí
(`envDir: '.'` en `electron.vite.config.ts`).

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

1. Entra en [supabase.com](https://supabase.com) → **New project** (guarda la
   contraseña de la base de datos que te pide).
2. En el panel del proyecto: **Project Settings → API**.
3. Copia **Project URL** → pégala en `VITE_SUPABASE_URL`.
4. Copia **Project API keys → `anon` `public`** → pégala en
   `VITE_SUPABASE_ANON_KEY`.
5. Guarda el archivo y **reinicia** `npm run dev` (Vite lee el `.env` solo al
   arrancar).

> **Detalle de configuración (importante):** el renderer de electron-vite usa
> `root: 'src/renderer'` y Vite resuelve `envDir` **contra ese `root`**. Por eso
> `electron.vite.config.ts` fija `envDir: resolve(process.cwd())` (la raíz del
> proyecto). Si alguna vez las claves no llegan, es que el `.env` no se está
> leyendo: comprueba que esté **en la raíz** y que `npm run dev` se ejecute
> desde esa misma raíz. En el build se puede verificar: la URL y la clave
> aparecen literales en `out/renderer/assets/index-*.js`.

Si prefieres no tocar la raíz, también vale copiar `.env.example` a `.env` y
rellenarlo. El archivo `.env` ya está en `.gitignore`: no se sube a Git.

> ⚠️ Usa **solo** la clave `anon public`. La clave `service_role` **nunca**
> debe ir al `VITE_*` de una app de escritorio: se distribuiría con la app y
> salta todas las políticas RLS.

### Instalación del SDK

El SDK ya está declarado en `package.json`
(`@supabase/supabase-js`). Si clonas el proyecto y falta:

```bash
npm install @supabase/supabase-js
```

---

## 3. Script SQL de la tabla `proyectos`

La copia canónica está en **[`supabase/schema.sql`](./supabase/schema.sql)**
(idempotente: puedes ejecutarlo las veces que quieras). Pégalo en el panel de
Supabase → **SQL Editor → New query → Run**. Crea la tabla, el índice y las
políticas RLS que hacen que **cada usuario solo vea y modifique sus propios
proyectos**.

> Si prefieres copiar/pegar desde aquí, el mismo script es el bloque siguiente.

```sql
-- ============================================================================
-- ArqStudio 3D — tabla de proyectos
-- ============================================================================
create table if not exists public.proyectos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  nombre       text not null,
  modo         text not null default '3D' check (modo in ('2D', '3D')),
  -- Índice del diseño base que carga el editor (models/ProjectDesign.ts)
  diseno_index smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists proyectos_user_id_updated_at_idx
  on public.proyectos (user_id, updated_at desc);

-- Seguridad por fila: sin estas políticas, RLS bloquea todo por defecto.
alter table public.proyectos enable row level security;

drop policy if exists "proyectos: ver los propios" on public.proyectos;
create policy "proyectos: ver los propios"
  on public.proyectos for select
  using (auth.uid() = user_id);

drop policy if exists "proyectos: crear los propios" on public.proyectos;
create policy "proyectos: crear los propios"
  on public.proyectos for insert
  with check (auth.uid() = user_id);

drop policy if exists "proyectos: actualizar los propios" on public.proyectos;
create policy "proyectos: actualizar los propios"
  on public.proyectos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "proyectos: borrar los propios" on public.proyectos;
create policy "proyectos: borrar los propios"
  on public.proyectos for delete
  using (auth.uid() = user_id);
```

### Columnas que usa la app

| Columna | Tipo | Uso |
|---|---|---|
| `id` | `uuid` | Identificador de la tarjeta en «Mis proyectos». |
| `user_id` | `uuid` | Dueño del proyecto: se rellena con el usuario de la sesión. |
| `nombre` | `text` | Nombre visible en la tarjeta. |
| `modo` | `'2D' \| '3D'` | Etiqueta y vista inicial del editor. |
| `diseno_index` | `smallint` | Diseño de ejemplo que se carga en el lienzo (`0`, `1`, `2`). |
| `updated_at` | `timestamptz` | Alimenta los textos «Hace 2 horas», «Ayer»… |

**Opcional (para más adelante):** cuando quieras guardar la geometría real de
cada muro en la nube, añade una columna y rellénala desde el editor:

```sql
alter table public.proyectos
  add column if not exists datos jsonb;   -- SceneManager serializado
```

---

## 4. Confirmación de correo (importante)

Por defecto Supabase activa **Confirm email**: tras registrarse, el usuario
recibe un correo y **no** tiene sesión hasta confirmarlo. En ese caso la app
muestra *«Cuenta creada. Revisa tu correo para confirmarla y después inicia
sesión.»*

Si quieres que el registro **autentique al usuario automáticamente** y lo
devuelva al Dashboard (como pide el flujo), desactiva esa opción:

> Supabase → **Authentication → Sign In / Providers → Email → Confirm email**
> (desmarcar) y guardar.

> ⚠️ **En tu proyecto está activa ahora mismo** (el diagnóstico devolvió
> `mailer_autoconfirm: false`). Mientras no la desactives, «Sign up» te avisará
> de que hay que confirmar el correo y **no** iniciará sesión automáticamente.


---

## 5. Google / GitHub (opcional)

1. Supabase → **Authentication → Providers** → activa *Google* o *GitHub* y
   pega el **Client ID / Client Secret** que generas en cada proveedor
   (Google Cloud Console / GitHub → Developer settings → OAuth Apps).
2. En el proveedor, la *Authorized redirect URI* debe ser la que indica
   Supabase: `https://<tu-proyecto>.supabase.co/auth/v1/callback`.
3. En la app, el botón abre el navegador del sistema con la URL de Supabase.

**Limitación conocida (Electron):** el retorno del OAuth llega como
redirección web, así que la sesión se completa en el navegador. Para que
ArqStudio la reciba haría falta registrar un *deep link* propio
(`arqstudio://auth/callback`) en `src/main/index.ts`
(`app.setAsDefaultProtocolClient`) y cerrar el flujo con
`supabase.auth.exchangeCodeForSession`. Mientras eso no esté hecho, el camino
recomendado es **correo + contraseña** (y sin claves, el botón crea una sesión
de demostración local).

---

## 6. Comprobar que funciona

1. `npm run dev`.
2. En la consola de la app verás:
   `[ArqStudio] Supabase configurado: auth y proyectos en la nube.`
   (si sale «sin configurar», revisa el `.env` y reinicia).
3. Dashboard → **Configuración → Conexión con Supabase**: debe decir
   *Claves en el .env: Detectadas* y *Modo de datos: Local hasta iniciar sesión*.
4. **+ Nuevo proyecto** → Login/Registro → crea una cuenta.
5. Tras entrar, *Modo de datos* pasa a **Nube (tabla proyectos)** y los
   proyectos se guardan en Supabase (siguen ahí al reiniciar la app).

### Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| Aviso rojo «No se encontró la tabla «proyectos»» con botón **Reintentar** | Ejecuta `supabase/schema.sql` y pulsa **Reintentar**. Mientras tanto la app no se bloquea: guarda en los proyectos locales. |
| «Modo local: no hay claves de Supabase en el .env» | El `.env` está vacío o con los textos de ejemplo, o Vite no lo leyó (debe estar en la **raíz** y hay que reiniciar `npm run dev`). |
| «No se pudo conectar con Supabase» | URL mal copiada, sin internet o proyecto pausado en el panel. |
| «La tabla «proyectos» existe pero no tiene las columnas…» | Se creó a medias: vuelve a ejecutar `supabase/schema.sql` (añade lo que falte). |
| «Supabase bloqueó la consulta por las políticas RLS» | Faltan las políticas del **apartado 3** (o la tabla se creó sin `enable row level security`). |
| Registro correcto pero no entra | *Confirm email* activo (es el caso de tu proyecto): revisa el correo o desactívalo (**apartado 4**). |
| «Correo o contraseña incorrectos» | Credenciales erróneas; en modo local, además, solo existen las cuentas creadas en ese equipo. |
| «El proveedor no está habilitado en Supabase» | Google/GitHub están apagados en tu proyecto: actívalos en *Authentication → Providers* (**apartado 5**). |

---

## 7. Mapa del código (por si quieres tocarlo)

```
.env / .env.example              → claves (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
supabase/schema.sql              → script SQL listo para pegar (tabla + RLS)
SUPABASE_SETUP.md                → este documento
src/renderer/src/
  env.d.ts                       → tipado de import.meta.env
  main.ts                        → flujo de navegación, control de acceso y diálogos
  services/
    supabaseClient.ts            → cliente de Supabase (null si no hay claves)
    AuthService.ts               → sesión global: signIn / signUp / signOut / OAuth
    ProjectStore.ts              → proyectos: localStorage o tabla `proyectos`
  models/DashboardProject.ts     → modelo de proyecto + fechas relativas
  ui/
    Dashboard.ts                 → pantalla «Mis proyectos» (menú, búsqueda, tarjetas)
    AuthScreen.ts                → modal Login / Registro
    Dialogs.ts                   → diálogos propios (nombre, confirmaciones)
    PlanThumbnail.ts             → miniaturas SVG de las tarjetas
  workspace/mountWorkspace.ts    → editor 3D CAD (se carga solo al entrar)
src/preload/index.ts             → puente `arqStudio.shell.openExternal` (OAuth)
src/main/index.ts                → IPC `shell:open-external`
```

---

## 8. Notas de seguridad

- La clave `anon` es **pública por diseño**: lo que protege los datos son las
  políticas RLS del apartado 3. No pongas la clave `service_role` en el `.env`.
- El modo local guarda la contraseña en `localStorage` **solo** para poder
  probar el flujo sin servidor. Es código de demostración: en cuanto hay claves
  de Supabase, nunca se usa (ver `services/AuthService.ts`).
- Los nombres de proyecto que escribe el usuario se escapan antes de pintarse
  (`escapeHtml` en `ui/Dashboard.ts`), así que no pueden inyectar HTML.

---

## 9. ¿Y la tabla `projects` que ya existe en tu proyecto?

Tu proyecto tiene una tabla `public.projects` con otro esquema (`id`,
`owner_id`, `name`, `description`, `created_at`, `updated_at`). ArqStudio usa su
propia tabla `proyectos` y **no toca la tuya**, para no romper nada que tengas
ahí guardado.

Si prefieres que la app escriba en `projects`, harían falta dos cosas:

1. **SQL** — añadir las columnas que usa la app y las políticas RLS sobre
   `owner_id`:

   ```sql
   alter table public.projects
     add column if not exists mode text not null default '3D',
     add column if not exists design_index smallint not null default 0;

   alter table public.projects enable row level security;

   create policy "projects: ver los propios" on public.projects
     for select using (auth.uid() = owner_id);
   create policy "projects: crear los propios" on public.projects
     for insert with check (auth.uid() = owner_id);
   create policy "projects: actualizar los propios" on public.projects
     for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
   create policy "projects: borrar los propios" on public.projects
     for delete using (auth.uid() = owner_id);
   ```

2. **Código** — el mapeo está aislado en `services/ProjectStore.ts`:
   `PROJECTS_TABLE` y `rowToProject` (`user_id`→`owner_id`, `nombre`→`name`,
   `modo`→`mode`, `diseno_index`→`design_index`). Se adapta en un momento si
   lo prefieres así.


