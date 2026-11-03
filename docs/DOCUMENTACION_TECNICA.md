# DOCUMENTACION TÉCNICA — ArqStudio 3D

> Nota: documento inicial (Paso 1 de 4). Solo incluye secciones 1, 2 y 4, basadas en código real observado (`package.json` y estructura raíz). Resto de secciones pendientes.

## 1. Descripción general

ArqStudio 3D es un editor visual de arquitectura / diseño 3D asistido por IA, en versión Electron + Three.js.

- Fuente: campo `description` de `package.json`: "Editor visual de arquitectura/diseño 3D asistido por IA — versión Electron/Three.js".
- Carpeta del proyecto: `arqstudio3d-electron`.
- Stack base observado: Electron + TypeScript + Vite (ver Sección 2).
- Para quién es: Por confirmar (no hay evidencia explícita en `package.json` más allá de "arquitectura/diseño").
- Qué problema resuelve: Por confirmar en detalle; por su descripción, provee edición visual de diseños 3D de arquitectura con asistencia de IA.

## 2. Stack tecnológico

Versiones tomadas literalmente de `package.json` (name `arqstudio3d`, version `0.1.0`, main `./out/main/index.js`):

### Scripts (`package.json > scripts`)

| Script | Comando |
|---|---|
| `dev` | `electron-vite dev` |
| `build` | `electron-vite build` |
| `typecheck` | `tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json` |
| `start` | `electron-vite preview` |
| `package` | `npm run build && electron-builder --linux AppImage` |

### Dependencias (`dependencies`)

| Dependencia | Versión en `package.json` |
|---|---|
| `@supabase/supabase-js` | `^2.117.2` |
| `sql.js` | `^1.14.2` |
| `three` | `^0.166.1` |

### DevDependencies (`devDependencies`)

| Dependencia | Versión en `package.json` |
|---|---|
| `@types/three` | `^0.166.0` |
| `electron` | `^31.0.2` |
| `electron-builder` | `^24.13.3` |
| `electron-vite` | `^2.3.0` |
| `typescript` | `^5.5.3` |
| `vite` | `^5.3.3` |

Notas:
- Three.js confirma el visor 3D observado en tareas previas.
- Supabase (`@supabase/supabase-js`) y SQLite vía `sql.js` confirman persistencia remota + local. Detalle de uso: Por confirmar (ver pasos siguientes).
- Electron + electron-vite + electron-builder confirman app de escritorio empaquetable (target observado: `AppImage` Linux).

## 4. Estructura de carpetas

Observada con `ls` en la raíz del proyecto. Contenido raíz confirmado:

- `src/` — código fuente de la app.
- `out/` — salida de compilación del proceso main (coherente con `"main": "./out/main/index.js"`).
- `dist/` — salida de build. Por confirmar su contenido exacto.
- `node_modules/` — dependencias instaladas.
- `supabase/` — recursos/config de Supabase. Detalle: Por confirmar.
- `electron.vite.config.ts` — configuración de electron-vite. Contenido detallado: Por confirmar.
- `package.json` / `package-lock.json` — manifiesto y lock de dependencias.
- `tsconfig.json`, `tsconfig.web.json`, `tsconfig.node.json` (+ `tsconfig.*.tsbuildinfo`) — configuración TypeScript separada web/node (coherente con script `typecheck`).
- `README.md`, `SUPABASE_SETUP.md` — documentación existente. Contenido: Por confirmar.
- `docs/` — carpeta de esta documentación.
- `tsc` — Por confirmar (fichero/carpeta observado en `ls`; no se asume su propósito).

Estructura bajo `src/` (evidencia de tareas previas en este mismo proyecto, rutas reales tocadas):

- `src/renderer/src/ui/TitleBar.ts` — barra de título superior (se eliminó de aquí la instancia duplicada de Play/Pausa/Detener).
- `src/renderer/src/ui/MenuBar.ts` — barra de herramientas / fila de iconos donde se mantienen Play/Pausa/Detener.
- `src/renderer/src/ui/icons.ts` — iconos de la UI.
- `src/renderer/src/ui/styles.css` — estilos de la UI (incluye estilos de playback y esfera de navegación).
- `src/renderer/src/ui/ViewportInteractions.ts` — interacciones del visor (órbita/pan/zoom).
- `src/renderer/src/ui/OrientationGizmo.ts` — `mountNavigationSphere` y `mountOrientationGizmo` (esfera de navegación + indicador de ejes X/Y/Z).
- `src/renderer/src/workspace/mountWorkspace.ts` — montaje del workspace; conecta `Viewport3DController`, esfera, gizmo e interacciones.
- `src/renderer/src/engine/ViewportRenderer.ts` — render del visor. Por confirmar detalle interno (pendiente de lectura por rangos en pasos siguientes).
- `src/renderer/src/engine/Viewport3DController.ts` — controlador de cámara 3D (órbita, pan, zoom).
- `src/renderer/src/engine/CanvasTool.ts` — herramienta activa del canvas (dibujo / mover).

Convención Electron + electron-vite (estándar, pendiente de confirmar contra `electron.vite.config.ts` y `src/main`, `src/preload`, `src/renderer` en Paso 2):

- `src/main` — proceso main de Electron. Por confirmar.
- `src/preload` — preload / puente IPC. Por confirmar.
- `src/renderer` — renderer (Vite + TypeScript). Confirmado parcialmente por rutas `src/renderer/src/...` anteriores.
