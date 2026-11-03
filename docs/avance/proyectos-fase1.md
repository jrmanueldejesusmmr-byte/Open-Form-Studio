# Fase 1 — Implementación: aislamiento de proyectos por usuario

> Rama: `feature/proyectos-por-usuario` · Base: `2c15b38` (Fase 0)
> Cierra las 8 causas raíz detectadas en `proyectos-fase0.md`.
> **Estado: compilada, probada y validada con la app real (22/22 aserciones).**

## 1. Qué cambió (resumen)

Cada proyecto pertenece a **exactamente un usuario**. El aislamiento se aplica en
la **capa de datos** (no solo en la interfaz): si la UI comets un error, la base
de datos sigue rechazando la operación.

| Ámbito | Antes (Fase 0) | Ahora (Fase 1) |
|---|---|---|
| Sin sesión | Se veían **todos** los proyectos de la máquina | **No se consulta nada**: lista vacía, sin contador ni miniaturas |
| Listado local | `WHERE user_id = ? OR user_id IS NULL` | `WHERE user_id = ?` (las filas sin dueño quedan en cuarentena) |
| Crear | Permitido con `user_id NULL` | **Rechazado** sin sesión; siempre nace con dueño |
| Renombrar / borrar / marcar | Solo `WHERE id = ?` | Exige ser **dueño** (`ownsProject`), falla cerrado |
| Guardar / cargar escena | Solo `WHERE proyecto_id = ?` | Exige ser **dueño**; el id a mano no abre proyectos ajenos |
| Texturas (crear/listar/leer/borrar) | Sin filtro | Heredan el dueño del proyecto |
| Semillas | 5 proyectos de ejemplo con `owner NULL` | **Eliminadas**: cuenta nueva ve 0 |
| Legacy de `localStorage` | Se importaba con `owner NULL` (visible para todos) | Se importa **sin dueño** → cuarentena, no visible para nadie |
| Cierre de sesión / cambio de cuenta | No limpiaba nada | Limpia caché, lista, proyecto abierto, escena, historial y texturas |
| Nube (Supabase) | Confiaba solo en RLS | `.eq('user_id', …)` **siempre** + RLS |

## 2. Cambios por archivo

### Capa de datos (proceso main)

- **`src/main/database.ts`**
  - `ownsProject(projectId, userId)`: única fuente de verdad de propiedad;
    con `userId` nulo **siempre es `false`** (fail-closed).
  - `listProjects(userId)`: `if (!userId) return []` + `WHERE user_id = ?`.
  - `createProject()`: lanza si no hay `userId`; inserta `user_id` siempre.
  - `renameProject()`, `removeProject()`, `touchProject()`: exigen dueño y
    añaden `AND user_id = ?` a la escritura.
  - `saveScene()`, `loadScene()`, `createTexture()`, `listTextures()`,
    `getTexture()`, `deleteTexture()`: exigen dueño del proyecto.
  - Esquema local **v4** con la columna `proyectos.user_id` (migración
    idempotente; los proyectos heredados sin dueño quedan en cuarentena).

### Capa de datos (renderer)

- **`src/renderer/src/services/ProjectStore.ts`**
  - `list()`: sin sesión → `[]` (no consulta). En nube, filtro `.eq('user_id')`.
  - `create()`: sin sesión → error; en nube inserta `user_id`.
  - `rename()`, `remove()`, `touch()`: `.eq('user_id', …)` en nube y `userId`
    obligatorio en local.
  - **Sin siembra**: `runLocalCuration()` ya no crea proyectos de ejemplo.
  - `reset()`: vacía cachés (`localReady`, `cloudUnavailable`) entre cuentas.
  - Fallback de `localStorage`: solo escribe/lee proyectos del usuario actual.

- **`src/renderer/src/services/DatabaseService.ts`**: todas las llamadas al
  puente SQLite llevan `userId` (proyectos, escena y texturas).

### Interfaz y ciclo de vida

- **`src/renderer/src/main.ts`**: `auth.onChange` detecta **cambio de cuenta**
  y ejecuta `store.reset()` + `workspace.closeProject()` + vuelve al Dashboard.
  Sin sesión, la pantalla de login/registro se muestra siempre.
- **`src/renderer/src/ui/AuthScreen.ts`**: login/registro ya no se cierra con
  `Escape` (evita quedarse sin sesión y con la app «abierta»).
- **`src/renderer/src/ui/Dashboard.ts`**: estado vacío amable
  («Aún no tienes proyectos. ¡Crea el primero!»).
- **`src/renderer/src/workspace/mountWorkspace.ts`**: `ownerUserId()` propaga
  el id de sesión a `saveScene`, `loadScene` y `listTextures`;
  `closeProject()` vacía escena, historial y texturas.
- **`src/renderer/src/ui/MaterialPalette.ts`**: las texturas se crean, listan y
  borran con `options.getOwnerId()`.
- **`src/renderer/src/models/DashboardProject.ts`**: `ownerId` en el modelo.

### Nube

- **`supabase/schema.sql`**: políticas RLS (`select/insert/update/delete` con
  `auth.uid() = user_id`) e índice por `(user_id, updated_at)`.
- **`supabase/rls-tests.sql`** (nuevo): pruebas SQL de aislamiento entre dos
  usuarios — **las ejecuta Manuel** en el SQL Editor de Supabase (necesita
  dos usuarios de prueba y sus UUID; ver cabecera del archivo).

## 3. Verificación ejecutada (resultados reales)

```bash
npm run typecheck                              # ✔ sin errores
npm run build                                  # ✔ compila
node scripts/_run-projects-tests.mjs           # ✔ 17 pruebas OK (10 + 7)
xvfb-run -a node_modules/.bin/electron --no-sandbox \
  scripts/capture-fase1.mjs                    # ✔ 22/22 aserciones, 7 capturas
```

Pruebas automáticas:

- `src/main/database.owners.test.ts` (10): lista vacía sin sesión; A crea y ve
  sus proyectos; B ve 0; B no puede renombrar/borrar/tocar; B no puede abrir
  la escena de A ni pasando el id a mano; A guarda y lee su escena; legado sin
  dueño en cuarentena; crear sin sesión se rechaza; cambio de cuenta sin
  rastros cruzados.
- `src/renderer/src/services/ProjectStore.test.ts` (7): cuenta nueva ve 0
  (sin semillas); aislamiento entre A y B; sin sesión no lista ni crea; sin
  rastros al alternar sesiones; legado en cuarentena.

Validación con la **app real** (`scripts/capture-fase1.mjs`, Electron bajo
`xvfb`): 22 aserciones y 7 capturas en `scripts/captures/`:

| Captura | Qué demuestra |
|---|---|
| `fase1-01-sin-sesion.png` | Sin sesión: solo login, 0 tarjetas, `Escape` no cierra |
| `fase1-02-cuenta-a-vacia.png` | Cuenta A recién creada: estado vacío amable |
| `fase1-03-proyecto-a-abierto.png` | A crea y abre su proyecto |
| `fase1-04-lista-a-1-proyecto.png` | A ve **1** proyecto (el suyo) |
| `fase1-05-cierre-sesion.png` | Cierre de sesión: vuelve al login, 0 tarjetas, sin rastro |
| `fase1-06-cuenta-b-vacia.png` | Cuenta B: **no ve nada** del proyecto de A |
| `fase1-07-vuelta-a-a.png` | Al volver, A recupera **exactamente** su proyecto |

## 4. Estado vacío y fin de la siembra

Una cuenta nueva ve el mensaje **«Aún no tienes proyectos. ¡Crea el primero!»**
(0 tarjetas, contador a 0). Se eliminaron las 5 semillas automáticas que
creaban proyectos de ejemplo con `owner NULL`.

## 5. Pendiente para Manuel (no bloquea la Fase 1)

1. **Ejecutar `supabase/schema.sql`** en el SQL Editor de Supabase (crea la
   tabla `proyectos` con `user_id` y activa RLS).
2. **Ejecutar `supabase/rls-tests.sql`** (7 bloques) sustituyendo los dos
   UUID de prueba; comprueba que A no ve los proyectos de B y que B no puede
   modificar ni borrar los de A.
3. El proyecto Supabase real **hoy no tiene la tabla `proyectos`**: hasta
   ejecutar el esquema, la app funciona con la SQLite local (ya aislada por
   usuario) y muestra un aviso en la consola.

## 6. Notas y limitaciones

- La validación end-to-end se ejecutó en **modo local** (sin claves de
  Supabase) porque el registro en Supabase exige correo válido y confirmación
  por email, incompatible con la automatización. El camino de la nube usa
  exactamente el mismo filtro `.eq('user_id')` y está cubierto por las pruebas
  unitarias de `ProjectStore`.
- Los proyectos heredados sin dueño **no se pierden**: quedan en la tabla con
  `user_id NULL` y pueden reclamarse a mano con el id del usuario (no se
  asignan solos para no reintroducir la fuga).
- La cuenta «Demo Google/GitHub» sin Supabase configurado sigue usando un id
  fijo por proveedor: es un modo de demostración local, no una cuenta real.

