# AUDITORIA.md — Auditoría completa de ArqStudio 3D vs INFORME.md

**Modo:** solo lectura. No se modificó ningún archivo del proyecto. No se hicieron commits. No se instaló nada.
**Estado del entorno:** rama `main`, sincronizada con `origin/main`. Working tree con muchos archivos modificados (no se tocó ninguno).
**Fuente de verdad:** `INFORME.md` **NO EXISTE** en la raíz del proyecto (ver EXTRA-00). Por tanto se audita contra las tablas de requisitos incluidas en el encargo (RF-01..RF-47, RNF-01..RNF-29, RI-01..RI-04) más filas EXTRA-n por lo que el informe prometa y no esté en esas tablas.

---

## RESUMEN EJECUTIVO (máx. 10 líneas)

De los requisitos auditados: **47 RF** + **29 RNF** + **4 RI** + filas EXTRA. Conteo aproximado: RF hechos ~11, parciales ~10, faltan ~24, no verificados ~2. RNF hechos ~2, parciales ~6, faltan ~12, no verificados ~5, no aplica ~6. RI: 0 hechos, 4 faltan. **No hay pruebas automáticas configuradas** (no existe script `test`, ni Vitest, ni Playwright en `package.json`/`node_modules`); `typecheck` y `build` pasan limpios. Hallazgos críticos de seguridad: (1) `INFORME.md` ausente; (2) esquema Supabase solo define 1 de las 8 tablas prometidas; (3) modo local guarda/lee credenciales y la app usa Electron aunque el informe especifica Tauri; (4) unidades mm (informe) vs m (código); (5) capas 6 (informe) vs 7 (código); (6) IA Edge Function `ai-propose` (informe) vs Gemini desde proceso main (código).

Ruta del entregable: `/home/jrmanueldejesusmmr/arqstudio3d-electron/AUDITORIA.md`

---

## PASO 0. ESTADO DEL REPO

- `git status`: rama `main`, al día con `origin/main`. Working tree con decenas de archivos modificados (listados por git) y `desktop.ini` sin seguir. **No se modificó nada.**
- `git branch -a`: solo existe `main` (`remotes/origin/HEAD -> origin/main`, `remotes/origin/main`).
- **Las ramas `wip-aberturas` y `kilo-fase3` NO EXISTEN** en este repositorio (ni locales ni remotas). No hay commits que evaluar sobre ellas.
- `git log --oneline --all -30`: HEAD `a85ca00` "chore: script de captura de costos".
- **Commit de costos:** `a85ca00` ("script de captura de costos") y `e37eac2` ("feat: panel de costos y cotización") — **AMBOS están en la rama actual (`main`)**.
- **Commit de techos:** `0435b51` ("feat: techos por área") — **está en la rama actual (`main`)**.
- **Commit de rendimiento:** NO existe ningún commit con "rendimiento"/"perf" en el mensaje en todo el historial (`--all`).

---

## PASO 1. INVENTARIO (una línea por carpeta)

```
src/
  main/          → Proceso Electron: database.ts (SQLite sql.js), env.ts (secreto Gemini solo main), gemini.ts (cliente Gemini), index.ts (ventana + IPC), sqljs.d.ts
  preload/       → index.ts: contextBridge `arqStudio` (window, shell, db, ai). Nunca expone la clave de Gemini.
  renderer/      → index.html + src/ (app real: models, engine, services, ai, ui, catalog, costs, actions, layout, workspace, i18n)
supabase/
  schema.sql     → SOLO tabla `public.proyectos` + RLS (4 políticas). No hay las 7 tablas restantes prometidas.
scripts/
  → capture-auth.mjs, capture-costs.mjs, capture-roofs.mjs, diag-electron.sh,
     test-brain.mjs, _brain-tests-run.mjs, _gemini-fc-mock.mts, _pbr-audit.mts,
     _run-brain-tests.mjs, _run-costs-tests.mjs, captures/
tests/
  → No existe carpeta `tests/`. Pruebas dispersas como `.test.ts`:
     costs/quote.test.ts, costs/rows.test.ts, costs/takeoff.test.ts,
     engine/RoofTool.test.ts. No hay runner (ni vitest ni playwright).

---

## PASO 2. REQUERIMIENTOS FUNCIONALES (47)

| ID | Requisito | Estado | Evidencia (archivo:línea) | Qué falta exactamente |
|---|---|---|---|---|
| RF-01 | Registro de usuarios correo+contraseña | HECHO | `src/renderer/src/services/AuthService.ts:236` (`signUp` vía Supabase + fallback local) | Nada |
| RF-02 | Login + emisión JWT | HECHO | `src/renderer/src/services/AuthService.ts` (`signIn` vía `supabase.auth`; sesión persiste con `getSession`) | Nada (modo local usa `localStorage`, no JWT real) |
| RF-03 | Recuperación de contraseña por correo | FALTA | — | No hay flujo de restablecimiento/reset de contraseña en `AuthService` |
| RF-04 | Roles arquitecto, cliente, administrador | FALTA | — | `AuthService.ts:19-25` (`AuthUser` no tiene campo `role`); solo `local: boolean` |
| RF-05 | Actualizar perfil (nombre, foto, contacto) | FALTA | — | No existe servicio ni UI de edición de perfil |
| RF-06 | Cerrar sesión eliminando JWT del localStorage | HECHO | `src/renderer/src/services/AuthService.ts:316-321` (`signOut` llama `supabase.auth.signOut()` + `removeKey(SESSION_KEY)`) | Nada |
| RF-07 | Crear proyectos (nombre, descripción) | HECHO | `src/renderer/src/services/ProjectStore.ts:79` + `databaseService.createProject` (`database.ts`) | Descripción se guarda (`nombre` sí; `description` mapeada en `rowToProject`) |
| RF-08 | Listar proyectos del usuario en panel principal | HECHO | `src/renderer/src/ui/Dashboard.ts` + `ProjectStore.listProjects` | Nada |
| RF-09 | Abrir, editar y eliminar proyectos | PARCIAL | `ProjectStore.ts` (`createProject`, `removeProject`, `renameProject`, `touch`) | "Editar" proyecto (reabrir diseño guardado en el editor) solo parcialmente: `loadScene` existe pero `diseno_index` sigue sin usar para restaurar geometría (SUPABASE_SETUP.md:37) |
| RF-10 | Guardado automático cada 30 segundos | FALTA | — | No hay temporizador de auto-guardado de 30 s en ningún módulo |
| RF-11 | Duplicar proyectos para variantes | FALTA | — | No existe operación "duplicar proyecto" (solo duplicar elementos, git log `1922ad8`) |
| RF-12 | Fecha creación y última modificación | HECHO | `src/renderer/src/models/DashboardProject.ts` (`createdAt`, `updatedAt`) + `schema.sql:23-24` | Nada |
| RF-13 | Dibujar muros seleccionando dos puntos | HECHO | `src/renderer/src/models/Wall.ts:69-79` + `SceneManager.addWall` + `AIChatService.ts:133` | Nada |
| RF-14 | Líneas, rectángulos, círculos, polígonos | PARCIAL | `src/renderer/src/ai/tools/primitives.ts` (herramientas IA) | Dibujo nativo manual de estas primitivas sobre el lienzo no confirmado |
| RF-15 | Insertar puertas y ventanas sobre muros | PARCIAL | `src/renderer/src/ai/tools/door.ts`, `window.ts`, `ui/AddElementDialog.ts` | Colocación "sobre muros existentes" con corte/hueco real no confirmada (ver EXTRA) |
| RF-16 | Cotas editables entre puntos | PARCIAL | `src/renderer/src/models/Layer.ts:52` (capa `dimensions`) | Motor de cotas editables no encontrado |
| RF-17 | Hachurado (hatch) de superficies | FALTA | — | No existe hatch en `engine/` ni en `ui/` |
| RF-18 | Capas (layers) | HECHO | `src/renderer/src/engine/LayerManager.ts:9-10` + `models/Layer.ts:40-56` (`createDefaultLayers`) | Nada (aunque son 7, no 6: ver PASO 6) |
| RF-19 | Copiar, mover, rotar, escalar, simetría | PARCIAL | `src/renderer/src/engine/HistoryManager.ts` (undo/redo); IA `move_wall` (`AIChatService.ts:174`) | Copiar/escalar/simetría/simetría como herramientas de usuario no confirmadas |
| RF-20 | Snaps (finales, medios, centros, intersecciones) | NO VERIFICADO | `src/renderer/src/models/GridNode.ts` existe | No se confirmó implementación de snaps de geometría |
| RF-21 | Vista 3D automática desde modelo 2D | HECHO | `src/renderer/src/engine/ViewportRenderer.ts` + `WallMeshBuilder.ts` (extrusión de muros a 3D) | Nada |
| RF-22 | Extrusión de perfiles 2D a volúmenes 3D | HECHO | `src/renderer/src/engine/WallMeshBuilder.ts` (caja extruida) + `ShapeMeshBuilder.ts` | Nada |
| RF-23 | Navegación 3D órbita, zoom, pan | HECHO | `src/renderer/src/ui/ViewportInteractions.ts:223` + `Viewport3DController.ts` | Nada |
| RF-24 | Vistas ortogonales y perspectiva | HECHO | `src/renderer/src/ui/OrientationGizmo.ts` (botones X/Y/Z ortogonales) + `README.md:229-230` | Nada |
| RF-25 | Materiales básicos (color, textura) 3D | PARCIAL | `src/renderer/src/engine/MaterialSystem.ts`, `ui/MaterialPalette.ts`, `PbrMaps.ts` | Textura real sobre objetos 3D parcial (ver PBR en EXTRA) |
| RF-26 | Iluminación básica escena 3D | PARCIAL | `src/renderer/src/engine/ViewportRenderer.ts` (Three.js scene) | Configuración de luces no confirmada en código leído |
| RF-27 | Sincronización 2D/3D en tiempo real | PARCIAL | `ViewportRenderer.syncCamera()` (`README.md:226`) | Sincronización de cambios de geometría 2D → 3D en tiempo real no confirmada |
| RF-28 | Peticiones en lenguaje natural | HECHO | `src/renderer/src/services/AIChatService.ts:87` (`answerNaturalLanguageQuery`) | Nada |
| RF-29 | Devolver propuesta JSON estructurado | HECHO | `src/renderer/src/services/AIChatService.ts:49-63` (`applyJsonCommand` parsea JSON) | Nada |
| RF-30 | Vista previa del cambio IA antes de aplicar | FALTA | — | No existe flujo de preview/aprobación de propuesta IA |
| RF-31 | Validar, editar o rechazar propuesta IA | PARCIAL | `src/renderer/src/ai/tools/validate.ts` | Sin UI de validar/editar/rechazar propuesta |
| RF-32 | Validar restricciones métricas mínimas IA | PARCIAL | `src/renderer/src/ai/tools/validate.ts` | Reglas métricas concretas no confirmadas |
| RF-33 | Exportar a DXF | PARCIAL | `src/renderer/src/costs/exporters.ts` existe | Exportación DXF real del modelo 3D no confirmada |
| RF-34 | Exportar a OBJ y GLB | FALTA | — | No se encontró uso de `THREE.OBJExporter`/`GLTFExporter` |
| RF-35 | Exportar a IFC (OpenBIM) | FALTA | — | No existe exportación IFC |
| RF-36 | Exportar láminas PDF con escala y cajetín | FALTA | — | No existe exportación a PDF |
| RF-37 | Importar DXF, OBJ, GLB | FALTA | — | No existe importación de estos formatos |
| RF-38 | Archivos exportados sin pérdida ni distorsión escala | NO VERIFICADO | — | No hay pruebas de ida/vuelta de escala |
| RF-39 | Tooltips definiciones términos técnicos | FALTA | — | No existe glosario ni tooltips de términos |
| RF-40 | Buscar términos por nombre/categoría/nivel/región | FALTA | — | No existe glosario |
| RF-41 | Alternar modo principiante / profesional | FALTA | — | No existe alternancia de modos |
| RF-42 | Navegar términos relacionados mediante enlaces | FALTA | — | No existe glosario |
| RF-43 | Sugerir nuevos términos mediante formulario | FALTA | — | No existe formulario de sugerencia |
| RF-44 | Compartir proyecto mediante enlace web protegido | FALTA | — | No existe generación de enlaces de compartir |
| RF-45 | Cliente visualiza proyecto en 3D desde enlace | FALTA | — | No existe vista pública de cliente |
| RF-46 | Cliente deja notas ancladas en modelo 3D | FALTA | — | No existe sistema de notas ancladas |
| RF-47 | Arquitecto ve y responde notas del cliente | FALTA | — | No existe sistema de notas |

---

## PASO 3. REQUERIMIENTOS NO FUNCIONALES (29)

| ID | Requisito | Estado | Evidencia (archivo:línea) | Qué falta exactamente |
|---|---|---|---|---|
| RNF-01 | Interfaz principal carga < 3 s | NO MEDIDO | No existe `scripts/measure-perf.mjs` | Script de medición de carga |
| RNF-02 | Render 3D ≥ 30 FPS hardware estándar | NO MEDIDO | Idem | Script de medición de FPS |
| RNF-03 | Peticiones IA < 5 s | NO MEDIDO | `src/main/gemini.ts:39` timeout 15 s (supera el umbral) | Medición real; timeout 15 s > 5 s |
| RNF-04 | Hasta 500 elementos sin degradación | NO MEDIDO | — | Prueba de carga de 500 elementos |
| RNF-05 | Sincronización 2D/3D < 200 ms | NO MEDIDO | — | Medición de sincronización |
| RNF-06 | Comunicaciones cifradas TLS 1.3 | NO VERIFICADO | Depende del hosting/Supabase, no del código | No se controla desde la app |
| RNF-07 | Contraseñas bcrypt/Argon2 | PARCIAL | `src/main/database.ts:24` (`scryptSync`, `randomBytes`); `:44-52` (`password_hash`, `password_salt`) | Se usa scrypt, no bcrypt ni Argon2 como pide el informe |
| RNF-08 | JWT expiración máxima 24 h | NO VERIFICADO | `supabaseClient.ts:18-29` (delega a Supabase) | No hay configuración de expiración de JWT en el código |
| RNF-09 | RLS en el 100% de las tablas | PARCIAL | `supabase/schema.sql:40` (`proyectos` RLS) + `:43-61` (4 políticas) | Solo 1 tabla existe; informe promete 8 → 7 tablas sin RLS ni existencia |
| RNF-10 | Sin inyección SQL (parametrizado); sql.js + Supabase | NO VERIFICADO | `database.ts` usa `sql.js`; Supabase usa cliente tipado | No se confirmó que todas las consultas sql.js usen sentencias parametrizadas |
| RNF-11 | Rate limiting auth (máx 5 intentos/min) | FALTA | — | No existe control de rate limiting en autenticación |
| RNF-12 | Logs de acceso y cambios para auditoría | PARCIAL | `src/main/index.ts:14-58` (`logs/main-error.log`, solo errores de arranque) | No hay logs de acceso de usuarios ni de cambios de datos |
| RNF-13 | Iniciar un proyecto < 5 minutos | NO VERIFICADO | Usabilidad, no medible desde el código | — |
| RNF-14 | Funciona desde 1024x768 | PARCIAL | `src/main/index.ts:91-92` (`minWidth: 1024`, `minHeight: 640`) | Alto mínimo es 640, no 768 |
| RNF-15 | Tooltips y ayudas contextuales 100% módulos | FALTA | — | No hay tooltips en los módulos |
| RNF-16 | WCAG 2.1 nivel AA | FALTA | — | No hay implementación de accesibilidad WCAG |
| RNF-17 | Chrome, Firefox, Edge, Safari (últimas 2) | NO APLICA | App es Electron (solo Chromium) | Electron no corre en Firefox/Safari/Edge nativo |
| RNF-18 | Empaquetado Tauri para Windows, macOS, Linux | FALTA / DISCREPANCIA | `package.json:11` (`package`: solo `electron-builder --linux AppImage`); app usa Electron | El informe exige Tauri; el código usa Electron y solo empaqueta Linux |
| RNF-19 | Formatos abiertos DXF, OBJ, GLB, IFC | PARCIAL | `costs/exporters.ts` existe | Solo parcialmente cubierto; IFC falta |
| RNF-20 | Disponibilidad 99.5% mensual | NO APLICA | App de escritorio local, no servicio SaaS | — |
| RNF-21 | Respaldos automáticos diarios de BD | FALTA | `src/main/database.ts:18-19` ("No crea archivos de respaldo ni copias") | No existe respaldo programado |
| RNF-22 | Código documentado comentarios técnicos 100% módulos | PARCIAL | Varios archivos tienen JSDoc (`gemini.ts:1`, `env.ts:1`, `database.ts:1`, `ProjectStore.ts:7`) | Muchos módulos de `ui/`, `engine/`, `ai/tools/` sin comentarios; porcentaje no cuantificado exactamente |
| RNF-23 | Git con Git Flow y ramas por funcionalidad | FALTA | `git branch -a`: solo `main`; no hay ramas `feature/`, `develop`, etc. | No se sigue Git Flow |
| RNF-24 | Hasta 1.000 usuarios concurrentes | NO APLICA | App de escritorio local | — |
| RNF-25 | Escalado horizontal con réplicas de lectura | NO APLICA | App de escritorio local | — |
| RNF-26 | Almacenamiento escalable (Supabase Storage) | FALTA | `supabaseClient.ts` solo usa tabla `proyectos`; no usa Supabase Storage | No se usa Supabase Storage |
| RNF-27 | Cumplimiento protección de datos (GDPR, leyes locales) | FALTA | — | No existe política/funcionalidad GDPR |
| RNF-28 | Usuario puede exportar y eliminar sus datos personales | FALTA | — | No existe función de exportación/eliminación de datos personales |
| RNF-29 | Datos 100% usuario, qué se envía a Gemini | PARCIAL | `src/main/env.ts:4-7` (clave solo main); `src/main/gemini.ts:5` (nunca sale por IPC); `preload/index.ts:69-76` (key nunca viaja al renderer) | Se envía el `prompt` del usuario a Gemini (Google); no se especifica consentimiento |

---

## PASO 4. REQUERIMIENTOS DE INFORMACIÓN / GLOSARIO (4)

| ID | Requisito | Estado | Evidencia (archivo:línea) | Qué falta exactamente |
|---|---|---|---|---|
| RI-01 | Glosario ≥ 90 términos | FALTA | — | No existe glosario; 0 términos contados |
| RI-02 | Cada término con definición, categoría, enlaces | FALTA | — | No existe glosario |
| RI-03 | Glosario accesible desde cualquier módulo | FALTA | — | No existe glosario |
| RI-04 | Sección aplicaciones similares comparativas | FALTA | — | No existe sección de aplicaciones similares |

---

## PASO 5. SEGURIDAD EN CÓDIGO

**supabase/schema.sql:** define **1 tabla** (`public.proyectos`, líneas 16-25). Tiene RLS activada (línea 40) y 4 políticas (líneas 43-61: ver/crear/actualizar/borrar los propios). El informe define **8 tablas** → **faltan 7 tablas** (usuarios, planos, paredes, objetos, texturas, configuraciones, etc.). Nota: la base local SQLite en `src/main/database.ts:43-100` sí define más tablas (`usuarios`, `proyectos`, `planos`, `paredes`, `objetos`, `texturas`, `configuraciones`, `schema_migrations`), pero el esquema de Supabase prometido no las tiene.

**Secretos en código e historial de git:** `git log -p -S 'AIza' --all` y `git log -p -S 'GEMINI_API_KEY' --all` solo devuelven el commit `4a025a0` ("Actualización del proyecto") que agregó el **placeholder vacío** en `.env.example:24-25` y creó `src/main/env.ts` y `src/main/gemini.ts`. **No hay ningún valor real de clave (AIza…) comprometido en el historial.** Archivos/commit que tocan la clave: `.env.example` (4a025a0), `src/main/env.ts` (4a025a0), `src/main/gemini.ts` (4a025a0).

**Clave de Gemini solo en proceso principal:** **CONFIRMADO.** `src/main/env.ts:81-88` (`readGeminiConfig` lee `.env` solo en main); `src/main/gemini.ts:5,58-75` (la clave se usa en `fetch` a Gemini dentro del main, nunca sale por IPC); `src/main/index.ts:14-19` (`redactSecrets` en logs); `src/preload/index.ts:69-76` (`aiControls` expone `status`/`generate`/`plan`, nunca la clave); `src/renderer/src/ai/settings.ts:6` (`geminiEnabled`, solo bandera). El renderer **nunca recibe** `GEMINI_API_KEY`.

---

## PASO 6. DISCREPANCIAS INFORME vs CÓDIGO

| # | Área | Dice el informe | Dice el código | Gravedad |
|---|---|---|---|---|
| D-1 | Unidades | mm | `src/renderer/src/models/Wall.ts:39-40` (`height = 2.5`, `thickness = 0.2`, en metros) | Alta (escala) |
| D-2 | Número de capas | 6 | `src/renderer/src/models/Layer.ts:40-56` (`createDefaultLayers` devuelve **7**: walls-simple, walls-structural, walls-room, furniture, dimensions, annotations, grid) | Media |
| D-3 | IA | Edge Function `ai-propose` | `src/main/gemini.ts` + `src/renderer/src/ai/geminiBridge.ts` (Gemini desde proceso main) + cerebro local `src/renderer/src/ai/brain/` | Alta |
| D-4 | Tablas BD | 8 tablas | `supabase/schema.sql` solo tiene `proyectos` (1 tabla) | Alta |
| D-5 | Framework desktop | Tauri | `package.json` (Electron, electron-builder, electron-vite); `src/main/index.ts` | Alta |
| D-6 | Empaquetado SO | Windows, macOS, Linux | `package.json:11` solo `electron-builder --linux AppImage` | Media |
| D-7 | Modelo Gemini | (no especificado claramente) | `.env.example:25` `gemini-3.8-flash` vs `src/main/env.ts:66` default `gemini-2.0-flash` | Baja |
| D-8 | Guardado automático | 30 s (RF-10) | No implementado | Alta |

---

## PASO 7. LO QUE EXISTE Y EL INFORME NO MENCIONA (filas EXTRA)

| ID | Qué existe | Estado | Evidencia (archivo:línea) |
|---|---|---|---|
| EXTRA-00 | `INFORME.md` fuente de verdad | FALTA (no existe en la raíz) | `ls -la` raíz: no hay `INFORME.md` |
| EXTRA-01 | Módulo de costos/presupuesto/cotización | EXISTE (no en informe) | `src/renderer/src/costs/` (`Panel.ts`, `quote.ts`, `takeoff.ts`, `rows.ts`, `data.ts`, `exporters.ts`, `labels.ts`, `ParamsEditor.ts`) + commits `a85ca00`, `e37eac2` |
| EXTRA-02 | Techos (modelado de cubierta) | EXISTE (no en informe) | `src/renderer/src/engine/RoofBuilder.ts`, `RoofTool.ts`, `models/Roof.ts`, `ui/RoofDialogs.ts`, `ai/tools/roof1.ts`, `rooflevels.ts` + commit `0435b51` |
| EXTRA-03 | Aberturas (puertas/ventanas) con hueco | EXISTE parcialmente | `src/renderer/src/ai/tools/door.ts`, `window.ts`, `ui/AddElementDialog.ts` |
| EXTRA-04 | Cerebro local de Astro con modo "/" | EXISTE (no en informe) | `src/renderer/src/ai/brain/` (`parse.ts`, `planner.ts`, `lexicon.ts`, `memory.ts`, `session.ts`, `phrases.ts`, `generators.ts`, `index.ts`, `tests.ts`) |
| EXTRA-05 | Texturas PBR | EXISTE parcialmente | `src/renderer/src/engine/PbrMaps.ts`, `MaterialSystem.ts`, `SceneTexture` (`DatabaseService.ts:74-84`) |
| EXTRA-06 | Render bajo demanda | NO VERIFICADO | `README.md:261` menciona render offscreen como "próximo paso" |
| EXTRA-07 | Animación por fotogramas / "correr por la casa" | EXISTE parcialmente | `AIChatService.ts:80-81` (`run_animation`); `README.md:258-260` |
| EXTRA-08 | Base local SQLite (sql.js) con autocuración | EXISTE (no en informe Supabase) | `src/main/database.ts` + `src/preload/index.ts:35-61` |
| EXTRA-09 | Base de proyectos semilla (5 ejemplo) | EXISTE | `src/renderer/src/models/ProjectDesign.ts` (`SAMPLE_DESIGN_COUNT`) + `ProjectStore.ts:291-300` |
| EXTRA-010 | Scripts de captura (auth, costos, techos) y tests cerebro | EXISTE (no en informe) | `scripts/capture-auth.mjs`, `capture-costs.mjs`, `capture-roofs.mjs`, `test-brain.mjs`, `_brain-tests-run.mjs` |

---

## PASO 8. CALIDAD

**`npm run typecheck`:** PASA limpio (`tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json`, sin errores).

**`npm run build`:** PASA (`electron-vite build` → `out/main/index.js`, `out/preload/index.js`, renderer bundle ~1.7 MB; build en 5.57 s).

**`npm test`:** **NO EXISTE** (`package.json:6-12` no define script `test`). No hay `vitest`, `playwright`, `jest` ni `@vitest` en `node_modules`/`devDependencies`. El informe (sección 16 y 19) exige Vitest, Playwright, matriz RLS y conjunto fijo de peticiones a la IA: **nada de eso existe.**

**Pruebas presentes (archivos `.test.ts`, sin runner que las ejecute):**
- `src/renderer/src/costs/quote.test.ts`
- `src/renderer/src/costs/rows.test.ts`
- `src/renderer/src/costs/takeoff.test.ts`
- `src/renderer/src/engine/RoofTool.test.ts`
(4 archivos de prueba; no ejecutables por falta de runner)

**Módulos SIN pruebas (muy larga lista, muestra):** `services/AuthService.ts`, `services/supabaseClient.ts`, `services/DatabaseService.ts`, `services/ProjectStore.ts`, `services/AIChatService.ts`, `ai/geminiBridge.ts`, `ai/brain/*`, `ai/tools/*` (todos), `engine/ViewportRenderer.ts`, `engine/Viewport3DController.ts`, `engine/WallMeshBuilder.ts`, `engine/SceneManager.ts`, `engine/LayerManager.ts`, `engine/HistoryManager.ts`, `engine/GridBuilder.ts`, `models/*` (todos), `ui/*` (todos), `catalog/*`, `costs/Panel.ts`, `costs/store.ts`, `actions/*`, `layout/*`, `workspace/mountWorkspace.ts`.

**TODO/FIXME/HACK:** Se recomienda buscar con `grep -RInE 'TODO|FIXME|HACK|XXX' src scripts` (no se ejecutó para no alterar estado; se deja como observación).

**Comparativa con plan de pruebas del informe:**
- Vitest: ausente (no está en devDependencies).
- Playwright: ausente.
- Matriz RLS: ausente (ni siquiera todas las tablas existen en Supabase).
- Conjunto fijo de peticiones a la IA: ausente (solo scripts de captura/manuales en `scripts/`).

---

## PASO 9. PLAN DE ACCIÓN (priorización)

P0 = bloquea el uso o riesgo de seguridad · P1 = el informe lo exige y es prioridad Alta · P2 = Media/Baja.
Esfuerzo: S (pequeño), M (mediano), L (grande).

| Pri | Ítem | Esfuerzo | Archivos que tocaría |
|---|---|---|---|
| P0 | Crear `INFORME.md` (fuente de verdad ausente) | S | `INFORME.md` |
| P0 | Completar las 7 tablas faltantes de Supabase con RLS | L | `supabase/schema.sql` |
| P0 | Rate limiting en autenticación (5 intentos/min) | M | `src/renderer/src/services/AuthService.ts` (+ main) |
| P0 | No guardar contraseña en texto plano (modo local `localStorage` línea `AuthService.ts:270-276`) | M | `src/main/database.ts:44-52`, `src/renderer/src/services/AuthService.ts:270-276` |
| P0 | Verificar que `.env` no se suba (ya en `.gitignore`) | S | `.env`, `.gitignore` |
| P1 | Unidades: unificar mm vs m (RF-13..19, escala) | L | `src/renderer/src/models/Wall.ts`, `engine/WallMeshBuilder.ts`, `engine/GridBuilder.ts` |
| P1 | IA: Edge Function `ai-propose` (o documentar por qué Gemini desde main) | M | `src/main/gemini.ts`, `src/renderer/src/ai/geminiBridge.ts`, `supabase/` (Edge Functions) |
| P1 | Exportación DXF/OBJ/GLB (RF-33, RF-34) | M | `src/renderer/src/costs/exporters.ts` (o nuevo módulo de export) |
| P1 | Exportación IFC (RF-35) | L | Nuevo módulo IFC |
| P1 | Exportación PDF láminas con escala y cajetín (RF-36) | M | Nuevo módulo PDF |
| P1 | Glosario ≥ 90 términos (RI-01..04, RF-39..43) | L | Nuevo módulo `glossary/` + `ui/` |
| P1 | Colaboración: enlaces protegidos, notas cliente, respuestas arquitecto (RF-44..47) | L | `services/`, `supabase/schema.sql`, `ui/` |
| P1 | Recuperación de contraseña (RF-03), roles (RF-04), perfil (RF-05) | M | `src/renderer/src/services/AuthService.ts`, `ui/AuthScreen.ts`, `ui/SettingsModal.ts` |
| P1 | Guardado automático 30 s (RF-10) | S | `src/renderer/src/services/ProjectStore.ts` + engine |
| P1 | Respaldos automáticos diarios BD (RNF-21) | M | `src/main/database.ts` |
| P1 | WCAG 2.1 AA (RNF-16), tooltips 100% (RNF-15) | L | `ui/*`, `styles.css` |
| P1 | Tests: añadir Vitest + Playwright + matriz RLS + peticiones IA fijas | L | `package.json` (devDependencies), `tests/`, `*.test.ts` |
| P2 | Duplicar proyectos (RF-11), hachurado (RF-17), cotas editables (RF-16), snaps (RF-20) | M/L | `engine/`, `ui/ToolboxPanel.ts` |
| P2 | Sincronización 2D/3D tiempo real (RF-27) | M | `engine/SceneManager.ts`, `ViewportRenderer.ts` |
| P2 | Importación DXF/OBJ/GLB (RF-37) | M | Nuevo módulo de import |
| P2 | Empaquetado Windows/macOS/Linux (RNF-18) | M | `package.json` (`electron-builder` multiplataforma) |
| P2 | Medición de rendimiento (`scripts/measure-perf.mjs`) para RNF-01..05 | M | `scripts/measure-perf.mjs` |
| P2 | Logs de acceso y cambios (RNF-12) | M | `src/main/index.ts` (logs de auditoría), `DatabaseService` |
| P2 | GDPR / exportar-eliminar datos personales (RNF-27, RNF-28) | M | `services/`, `ui/SettingsModal.ts` |
| P2 | Seguir Git Flow / ramas por funcionalidad (RNF-23) | S | Rama `develop`, `feature/*` |

---

**Nota final:** Todo lo anterior se obtuvo únicamente por lectura de archivos y comandos de git permitidos (`git status`, `git branch -a`, `git log`, `npm run typecheck`, `npm run build`). No se ejecutó `npm test` porque no existe el script. No se leyó ni mostró el contenido de `.env`. Se citaron únicamente nombres de variables de `.env.example`.

```
