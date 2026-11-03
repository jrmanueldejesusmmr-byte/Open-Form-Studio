# Fase 0 — Diagnóstico: fuga de proyectos entre usuarios

> Rama: `feature/proyectos-por-usuario` · Commit base: `8013dd7`
> Solo lectura: **ningún archivo de código se modificó en esta fase.**
> **Continuación: la Fase 1 (implementación y verificación) está en
> [`proyectos-fase1.md`](./proyectos-fase1.md).**

## 1. Dónde se guardan los proyectos

Hay **tres niveles de persistencia**, declarados en la cabecera de
`src/renderer/src/services/ProjectStore.ts:10-19`:

| Nivel | Motor | Ubicación / clave | Escritura |
|---|---|---|---|
| 1. Nube | Supabase, tabla `proyectos` | Proyecto Supabase del usuario (tabla creada con `supabase/schema.sql`) | `ProjectStore.list/create/rename/remove/touch` (`ProjectStore.ts:121-250`) |
| 2. Local | SQLite vía **sql.js (WASM)** en el proceso main | `app.getPath('userData')` → `arqstudio.db` (`src/main/index.ts:330`, `database.ts:29`) → en Linux `~/.config/arqstudio3d/arqstudio.db` | IPC `db:projects:*` (`database.ts:1078-1101`) |
| 3. Fallback | `localStorage` | clave `arqstudio.projects.v1` (`ProjectStore.ts:21`) | `writeLocalProjects` (`ProjectStore.ts:71-77`) |

Esquema de la tabla local `proyectos` (`src/main/database.ts:54-64`):
`id TEXT PK, user_id TEXT` ← **columna nullable**, `nombre, modo, diseno_index,
origen, cloud_id, created_at, updated_at`.

Esquema de la tabla nube (`supabase/schema.sql:16-25`):
`id uuid PK, user_id uuid NOT NULL references auth.users, nombre, modo,
diseno_index, created_at, updated_at` + índice `(user_id, updated_at)`.

### Cómo se lee la lista «Mis proyectos»

```
src/renderer/index.html:18        #screen-dashboard visible al arrancar
src/renderer/src/main.ts:52       mountDashboard(…)
src/renderer/src/ui/Dashboard.ts:517   void refresh()   ← se ejecuta al montar
src/renderer/src/ui/Dashboard.ts:208   refresh() → options.store.list()
src/renderer/src/services/ProjectStore.ts:121  list()
   ├─ useCloud (sesión Supabase + tabla responde) → SELECT … de `proyectos`
   │   SIN .eq('user_id')  (ProjectStore.ts:123-126)   ← solo RLS filtra
   ├─ si falla → degrade() silencioso (ProjectStore.ts:115-118)
   └─ listLocal() (ProjectStore.ts:305-309)
        → prepareLocal() → runLocalCuration()  (siembra, ver §3)
        → databaseService.listProjects(this.localUserId())
        → IPC 'db:projects:list' (database.ts:1084-1086)
        → DatabaseManager.listProjects(userId) (database.ts:594-602)
```

`localUserId()` = `auth.currentUser?.id ?? null` (`ProjectStore.ts:255-257`).

## 2. ¿Filtran las consultas por user_id?

| Operación | ¿Filtra por usuario? | Evidencia |
|---|---|---|
| Nube: leer lista | **Solo RLS** (ningún `.eq('user_id')` en cliente) | `ProjectStore.ts:123-126` |
| Nube: crear | Sí, inserta `user_id` | `ProjectStore.ts:146-152` |
| Local: listar | **Parcial**: `WHERE user_id = ? OR user_id IS NULL` → **cualquier fila sin dueño es visible para todos**; con `userId = null` devuelve **toda la tabla** | `database.ts:594-600` |
| Local: crear | Sí, `userId` = usuario actual (o NULL si no hay sesión) | `ProjectStore.ts:167-172`, `database.ts:609-627` |
| Local: renombrar / borrar / tocar | **NO**: solo `WHERE id = ?` | `database.ts:629-658` |
| Local: leer escena (`loadScene`) / guardar | **NO**: solo `proyecto_id`/`projectId` | `database.ts:806-814`, `707-803` |
| localStorage fallback | **NO**: lista entera, sin owner | `ProjectStore.ts:60-77, 315-321` |


## 3. Hipótesis (verificadas una a una)

### (a) «La base local no tiene columna user_id o no se filtra por ella»
**PARCIALMENTE CIERTA.** La columna **existe** (`database.ts:56`) pero es
**nullable** y el filtro la incluye con `OR user_id IS NULL`
(`database.ts:597`), de modo que **toda fila huérfana (owner NULL) se muestra
a cualquier cuenta y también al invitado**. Además, con `userId = null`
(la consulta se hace sin sesión) se devuelve la tabla entera
(`database.ts:600`). En la nube el cliente **no** añade `.eq('user_id')`:
depende exclusivamente de que RLS esté aplicado (`ProjectStore.ts:123-126`).

### (b) «Hay proyectos semilla/ejemplo que se insertan en el primer arranque»
**CIERTA.** `ProjectStore.runLocalCuration()` (`ProjectStore.ts:273-302`):
si `getSetting('proyectos.sembrados') !== 'true'` y no hay proyectos locales,
inserta 5 semillas con `userId: null` (`ProjectStore.ts:290-299`) creadas por
`createSeedProjects()` (`DashboardProject.ts:86-104`: *Casa Los Robles,
Oficinas Centro, Apartamento Loft, Bodega Industrial, Villa Costa*).
Además:
- `readLocalFallback()` **siembra de nuevo** si `localStorage` está vacío
  (`ProjectStore.ts:315-321`).
- `importLegacy` migra proyectos antiguos de `localStorage` con
  **`user_id NULL`** (`database.ts:1032-1042`) → origen muy probable de
  «primera casa» y «Copia de El primer proyecto» (creados en versiones
  antiguas sin dueño).
- `seedDefaults()` solo siembra `configuraciones` (unidades/tema), no
  proyectos (`database.ts:574-589`).

### (c) «La lista se carga antes de resolver la sesión»
**CIERTA (y peor: no hay ninguna puerta de sesión).**
- `Dashboard.ts:517` llama `void refresh()` **en el montaje**, sin esperar a
  `auth.whenReady()`.
- `main.ts:205` sí espera `auth.whenReady()` para *repintar*, pero el
  `refresh()` inicial de Dashboard ya corrió con `currentUser = null`.
- **No existe ningún gate**: el Dashboard (lista, contador, miniaturas,
  tarjetas) se pinta **con o sin sesión** (`index.html:12-17` describe el
  Dashboard como pantalla inicial visible; `main.ts:72-79` solo exige sesión
  para *crear/abrir*, no para *ver*).
- Con `currentUser = null`, `listLocal()` llama
  `db.listProjects(null)` → `SELECT * FROM proyectos` (`database.ts:600`):
  **se ven todos los proyectos de la máquina**.

### (d) «Al cerrar sesión no se limpia el estado»
**CIERTA.** `AuthService.signOut()` (`AuthService.ts:316-321`) solo borra la
clave de sesión y emite `setUser(null)`. No se limpia:
- La lista del Dashboard: `auth.onChange` (`Dashboard.ts:263-266`) dispara
  `refresh()` → `store.list()` con `localUserId() = null` → **vuelve a
  mostrar todos los proyectos** (`database.ts:600`).
- El cache `localReady` de `ProjectStore` (`ProjectStore.ts:89`) y el flag
  `cloudUnavailable` (`ProjectStore.ts:86`) persisten entre cuentas.
- El workspace montado (`main.ts:40, 179-189`) conserva `currentProjectId`
  y la escena en memoria (`mountWorkspace.ts:146, 2067-2068`); `signOut` no
  lo cierra ni lo desmonta.
- Las miniaturas se regeneran del `designIndex` (`PlanThumbnail.ts`), pero
  mientras la lista no se filtra, se pintan también las ajenas.

### (e) «Las políticas RLS no están aplicadas o permiten leer todo»
**NO APLICADAS EN EL PROYECTO DE MANUEL (según su propia documentación).**
- `supabase/schema.sql:40-61` define 4 políticas correctas
  (`auth.uid() = user_id` en select/insert/update/delete) y RLS habilitado.
- Pero `SUPABASE_SETUP.md:36-38` documenta que en el proyecto real la tabla
  `proyectos` **no existe** (`PGRST205`).
- Consecuencia: `ProjectStore.list()` recibe error → `degrade()` **silencioso**
  (`ProjectStore.ts:115-118, 133`) → todo el mundo pasa a la SQLite local
  **compartida por la máquina**, saltándose RLS por completo. La UI no
  muestra ningún aviso (solo cambia un texto en Configuración,
  `Dashboard.ts:344-348, 480`).
- `supabase/rls-tests.sql` **no existe** en el repo (solo hay
  `supabase/schema.sql`); habrá que crearlo en la Fase 1.

### (f) «Existe un modo demo que carga datos»
**CIERTA.**
- OAuth sin Supabase configurado crea una **sesión demo con id fijo**
  `local-${provider}` («Demo Google»/«Demo GitHub») compartida por todo el
  equipo (`AuthService.ts:301-314`).
- «Modo local» completo (auth y proyectos en el propio equipo) cuando falta
  `.env` (`supabaseClient.ts:18-32`, `AuthService.ts:13-16`): dos cuentas
  reales comparten la misma SQLite **sin filtrado efectivo** (ver (a)).
- **No hay un aviso claro** al entrar sin Supabase configurado en la pantalla
  de proyectos (solo un hint en Configuración, `Dashboard.ts:480`).

## 4. Flujo exacto hoy (inicio → carga → cierre)

```
ARRANQUE
  index.html:18        #screen-dashboard visible; #auth-overlay oculto
  main.ts:25-26        new AuthService() → restoreSession() (async)
  main.ts:52 / Dashboard.ts:517
                       refresh() INMEDIATO → store.list()
                         sin sesión → listLocal() → db.listProjects(null)
                         → SELECT * FROM proyectos  ⇒ SE VE TODO
                         (semillas NULL + legacy importado NULL + fallback localStorage)
  main.ts:205          whenReady() → refresh() (repinta; sigue sin gate)

INICIO DE SESIÓN (AuthScreen → AuthService.signIn, AuthService.ts:201-234)
  setUser(user) → Dashboard.onChange (Dashboard.ts:263) → refresh()
    Supabase OK  → SELECT de `proyectos` sin .eq('user_id') (RLS si está aplicada)
    Supabase KO  → degrade() → SQLite local con user_id actual
                     PERO sigue viendo: sus filas + TODAS las NULL
                     (`WHERE user_id = ? OR user_id IS NULL`, database.ts:597)
    local        → SQLite con id local → mismas filas NULL visibles

CREAR PROYECTO (main.ts:72-79 exige sesión)
  → ProjectStore.create → nube con user_id, o local con
    userId = localUserId() (ProjectStore.ts:167-172)

CIERRE DE SESIÓN (Dashboard.ts:217-220 → AuthService.ts:316-321)
  → solo borra la sesión
  → onChange → refresh() → listLocal() → listProjects(null)
  → SELECT * ⇒ TODOS LOS PROYECTOS SIGUEN A LA VISTA
  → workspace y caché de ProjectStore NO se limpian
```

## 5. Resumen de causas raíz (para la Fase 1)

1. **Sin puerta de sesión**: el Dashboard lista proyectos con o sin sesión.
2. **`listProjects(null)` devuelve todo** y `WHERE … OR user_id IS NULL`
   expone las filas huérfanas a todas las cuentas.
3. **Siembra automática** de proyectos de ejemplo con `owner = NULL`
   (más la migración `importLegacy` con `NULL` y el fallback de
   `localStorage`).
4. **Fallback silencioso a SQLite compartida** cuando Supabase falla: cruza
   datos entre cuentas sin avisar.
5. **`signOut` no limpia** lista, caché, workspace ni miniaturas.
6. **Escrituras/lecturas por `id` sin verificar dueño** en la capa local.
7. **RLS nunca aplicada** en el Supabase real (tabla inexistente);
   `rls-tests.sql` no existe.
8. **Cuenta demo** con id fijo compartido y mezcla de datos en modo local.

## 6. Comandos ejecutados (evidencia)

```bash
pwd && git branch --show-current
# /home/jrmanueldejesusmmr/arq-proyectos
# feature/proyectos-por-usuario

ls supabase/         # → solo schema.sql  (rls-tests.sql NO existe)
grep -n "baseDir\|app.getPath" src/main/index.ts
# 330:        baseDir: app.getPath('userData'),
```

Ninguna clave de `.env` se leyó ni se imprimió.
