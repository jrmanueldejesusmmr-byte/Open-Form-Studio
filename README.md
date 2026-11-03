# ArqStudio 3D — versión Electron / Three.js / TypeScript

Misma arquitectura que la versión WPF (Models / Engine / Services / UI),
portada a TypeScript + Three.js dentro de Electron, para correr en tu
Chromebook con Linux.

## Requisitos en tu Chromebook

1. Activa el **entorno de Linux (Crostini)** si no lo tienes ya:
   Configuración → Avanzada → "Desarrolladores" → "Entorno de desarrollo
   de Linux" → Activar. Esto te da una terminal Debian dentro de ChromeOS.
2. Dentro de esa terminal Linux, instala Node.js 20 LTS (npm incluido).
   La forma más simple:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node --version   # debe mostrar v20.x
   ```

3. Electron necesita algunas librerías de sistema que Crostini no trae por
   defecto. Instálalas una sola vez:

   ```bash
   sudo apt-get update
   sudo apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 \
     libgbm1 libasound2
   ```

## Instalación del proyecto

1. Copia/descomprime la carpeta `arqstudio3d-electron` dentro de tu
   entorno Linux (por ejemplo en `~/proyectos/arqstudio3d-electron`;
   arrastrar el .zip a la carpeta "Linux files" en el Archivos de ChromeOS
   también funciona).
2. Entra a la carpeta e instala dependencias:

   ```bash
   cd ~/proyectos/arqstudio3d-electron
   npm install
   ```

## Ejecutar en desarrollo

```bash
npm run dev
```

Esto abre la ventana de Electron con hot-reload: los cambios en
`src/renderer` se reflejan al guardar, sin reiniciar la app.

> Si la ventana no se abre y ves un error de sandbox/GPU en la terminal
> (común en Crostini), reintenta con:
> `npm run dev -- --no-sandbox` o exporta `ELECTRON_DISABLE_GPU=1` antes
> de correrlo. Es una limitante conocida de Electron dentro de
> contenedores Linux ligeros como Crostini, no del código del proyecto.

## Generar un ejecutable (AppImage)

```bash
npm run package
```

Genera un `.AppImage` en `dist/` que puedes ejecutar directamente
(`chmod +x` y doble clic desde el gestor de archivos de Linux) sin
necesidad de volver a instalar dependencias.

## Arquitectura (idéntica en espíritu a la versión WPF)

```
src/main/       → Proceso Electron: ventana sin marco + controles de ventana (IPC)
                  y apertura de URLs externas (shell:open-external, login OAuth)
src/preload/    → Puente seguro main↔renderer (expone arqStudio.window y arqStudio.shell)
src/renderer/   → La app real:
  main.ts       → Flujo de navegación: Dashboard → Login/Registro → editor 3D,
                  control de acceso y diálogos propios
  models/       → Wall, GridNode, CameraState, ProjectDesign, Layer,
                  DashboardProject — datos puros
  actions/      → ActionRegistry: registro central de acciones (id, etiqueta,
                  icono, atajo, categoría, enabled y un único run()).
                  Menús, barra de iconos, toolbox y atajos despachan por aquí.
  i18n/         → es.ts: todos los textos de la interfaz en español (fuente
                  única, lista para traducir a otros idiomas)
  engine/       → Viewport3DController, ViewportRenderer, GridBuilder, WallMeshBuilder,
                  SceneManager, HistoryManager (undo/redo), LayerManager
  services/     → AIChatService (mismo contrato JSON que la versión WPF),
                  supabaseClient, AuthService (sesión global), ProjectStore
                  (proyectos en localStorage o en Supabase)
  ui/           → Dashboard («Mis proyectos»), AuthScreen (Login/Registro),
                  Dialogs (nombre de proyecto y confirmaciones), PlanThumbnail,
                  TitleBar, MenuBar (menús + iconos rápidos), ToolboxPanel,
                  CanvasHud, LayersPanel, ProjectNavigator, AIChatPanel, StatusBar,
                  OrientationGizmo, ViewportInteractions (orbit/pan/zoom 360° y táctil),
                  icons (set SVG inline, estilo Lucide)
                  (DOM + CSS, sin framework, para mantener el paralelismo
                  1:1 con los UserControls de WPF)
  workspace/    → mountWorkspace: monta el editor CAD completo; se importa de
                  forma perezosa (el motor WebGL solo se crea al entrar a diseñar)
```

## Flujo de inicio (Dashboard → Login → Editor)

```
┌──────────────────────────────┐
│ 1. «Mis proyectos» (inicio)  │  sidebar · búsqueda · + Nuevo proyecto · tarjetas 2D/3D
└───────────────┬──────────────┘
                │ + Nuevo proyecto  ·  abrir una tarjeta  ·  usar una plantilla
                ▼
      ¿hay sesión activa? ──no──▶ Modal Login / Registro (Supabase) ──▶ al entrar, la
                │sí                                                   acción pendiente continúa
                ▼
┌──────────────────────────────┐
│ 2. Editor 3D CAD             │  se monta la primera vez (import dinámico);
│  (workspace/mountWorkspace)  │  Archivo → «Ir a Mis proyectos» vuelve al Dashboard
└──────────────────────────────┘
```

- La pantalla inicial es siempre el **Dashboard**; el editor 3D solo se monta
  cuando un usuario autenticado entra a diseñar (así no se crea el contexto
  WebGL mientras está oculto).
- `+ Nuevo proyecto` pide el nombre con un **diálogo propio** (Electron no
  implementa `window.prompt`), crea el proyecto y abre el editor.
- El proyecto abierto viaja al editor con su nombre, su modo (2D/3D) y el
  diseño base; el historial de undo/redo arranca limpio.

## Supabase (auth + proyectos en la nube) — opcional

La app funciona **sin configurar nada**: si el `.env` está vacío, arranca en
«modo local» (cuentas y proyectos en el propio equipo) y todo el flujo se puede
probar igual.

Para conectar tu proyecto de Supabase:

```bash
# 1. Copia el ejemplo y pega tus claves (Supabase → Project Settings → API)
cp .env.example .env
#    VITE_SUPABASE_URL=https://xxxx.supabase.co
#    VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
# 2. (ya está en package.json, pero si falta)
npm install @supabase/supabase-js
# 3. Reinicia el servidor de desarrollo (Vite lee el .env al arrancar)
npm run dev
```

Después, ejecuta el **script SQL** de la tabla `proyectos` (con sus políticas
RLS): abre [`supabase/schema.sql`](./supabase/schema.sql), cópialo y pégalo en
**Supabase → SQL Editor → New query → Run**. En la app aparecerá un aviso rojo
con un botón **Reintentar** que activa la nube sin reiniciar.

El resto de detalles (qué variables rellenar, confirmar el correo, activar
Google/GitHub, la tabla `projects` que ya existe en el proyecto y una tabla de
solución de problemas) están en **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)**.

> El estado de la conexión se ve dentro de la app en **Configuración →
> Conexión con Supabase** (claves detectadas, modo de datos y nº de proyectos).


## Interfaz (tema oscuro estilo CAD)

| Zona | Contenido |
|------|-----------|
| **Mis proyectos** (pantalla inicial) | Barra lateral (`Proyectos`, `Plantillas`, `Materiales`, `Mobiliario`, `Configuración`, `Cerrar sesión`), búsqueda por nombre, `+ Nuevo proyecto` y tarjetas con miniatura del plano y etiqueta 2D/3D |
| **Login / Registro** (modal) | Tarjeta centrada con campos e iconos, botón principal, Google/GitHub y enlace para conmutar Login ⇄ Sign up |
| Barra de título | Nombre de app + minimizar/maximizar/cerrar (ventana sin marco) |
| Barra de menú | `Archivo` (desplegable, incluye *Ir a Mis proyectos*), `Guardar`, `Deshacer`, `Rehacer`, `Dibujo`, `Anotación`, `Herramientas AEC`, `Notas`, `Auxiliar`, `Ayudas` — todo en español |
| Iconos rápidos | Solo lo que NO vive en el toolbox: abrir, guardar, imprimir, deshacer/rehacer, lápiz/resaltador/pluma/borrador, regla, mano, seleccionar y «Ajustar a pantalla» |
| Toolbox (izq.) | Rail con pestañas + acordeones: *Herramientas de diseño* (muros + **Mover/Copiar/Recortar/Borrar/Zoom±**), *Tipos de techos*, *Paleta de materiales*, *Formas predefinidas*, *Mobiliario* |
| Lienzo | Canvas 3D con `Coord: x, z` en vivo, slider de zoom y botones `2D` / `3D` / `Convertir a plano` |
| Capas (der.) | *Capas y propiedades*: visibilidad/bloqueo/color/tipo de línea + propiedades + planos del proyecto (las **plantas** viven solo en el Navegador) |
| Navegador (der.) | Árbol: Proyecto Principal → Plantas → Piso 0 → Planta 1-7, Secciones, Fachadas, Navegación 3D |
| Chat IA (der.) | Chat existente con tarjeta de bienvenida y sugerencias de un clic |
| Barra de estado | Mensajes de la acción, herramienta/vista/planta + iconos de sistema y reloj/fecha |

Atajos: `Ctrl+Z` / `Ctrl+Y` (undo/redo), `Ctrl+S`, `Ctrl+O`, `Ctrl+N`, `Ctrl+P`,
`Ctrl+Shift+E` (encuadrar). El motor de historial también revierte los cambios
hechos por el Chat IA. Si prefieres la barra de título nativa del sistema,
basta con poner `frame: false` → `frame: true` en `src/main/index.ts`.

## Registro central de acciones e internacionalización (Fase 1)

Todas las acciones de la app viven en `src/renderer/src/actions/ActionRegistry.ts`
(id, etiqueta, icono, atajo por defecto, categoría, `enabled()` y un único
`run()`). La barra de menú, la fila de iconos, el toolbox y los atajos de teclado
despachan por `ActionRegistry.run()`: no hay lógica duplicada y la futura paleta
de comandos (Fase 4) reutilizará el mismo registro sin cambios.

Los textos se centralizan en `src/renderer/src/i18n/es.ts` (`t('clave')`), listos
para traducir a otros idiomas.

### Opciones eliminadas por repetidas
- De la fila de iconos: **Acercar/Alejar (zoom)**, **Mover**, **Copiar**,
  **Cortar/Borrar** y **Añadir elemento** (ahora solo en el toolbox o el menú).
- Del panel de Capas: la sección **«Plantas de la Casa»** (la gestión de plantas
  vive únicamente en el Navegador del Proyecto).
- La acción `tool.move` (duplicaba `modify.move`).

### Opciones que quedaron
- **Barra superior / menú**: Guardar, Abrir, Deshacer y Rehacer (en ambos).
- **Toolbox**: muros (simple / estructural / habitación), **Mover, Copiar,
  Recortar, Borrar y Zoom ±**, tipos de techo, materiales, formas y mobiliario.
- **Panel de Capas**: propiedades, capas y planos del proyecto.
- **Navegador**: plantas, secciones, fachadas y navegación 3D.

### Opciones nuevas
- **`ActionRegistry`** (registro central) y **`i18n/es.ts`** (textos en español).
- **«Ajustar a pantalla»** (antes «Encuadrar todo») y **«Restablecer vista»**,
  ya en el menú `Auxiliar` y despachadas por el registro.
- El **Zoom (+/−)** como modificador dentro del toolbox.

## Controles de cámara (navegación 360°)

| Acción                        | Gesto                                                        |
|-------------------------------|--------------------------------------------------------------|
| Órbita 360°                   | Arrastrar con **clic izquierdo** (ejes X e Y)                |
| Pan (desplazamiento)          | Arrastrar con **clic derecho**, **botón central** o **Shift + clic izquierdo** |
| Zoom continuo                 | **Rueda del ratón** sobre el canvas (acerca hacia el punto del cursor) o el **slider inferior** |
| Vista por eje                 | Clic en el gizmo X/Y/Z (esquina superior izquierda)          |
| Táctil, 1 dedo                | Órbita                                                       |
| Táctil, 2 dedos               | Pellizco = zoom · arrastrar = pan                            |

Notas:

- Los gestos viven en `ui/ViewportInteractions.ts` (Pointer Events, así que el
  ratón, el trackpad, el lápiz y el táctil comparten el mismo código) y solo
  llaman a `engine/Viewport3DController.ts`; la cámara `THREE` real se aplica en
  `ViewportRenderer.syncCamera()`. Por eso el slider de zoom y la esfera de ejes
  nunca se desincronizan, en cualquiera de los dos sentidos.
- El gizmo/esfera de la esquina **refleja la orientación actual** de la cámara
  (en cada órbita se le pasa el `CameraState`), y sus botones X/Y/Z devuelven la
  vista a una proyección ortogonal sobre ese eje con un clic.
- El CSS del canvas declara `touch-action: none` y el código suprime el menú
  contextual (clic derecho) y el autoscroll del botón central dentro del lienzo.
- El sentido de la rueda es configurable: `mountViewportInteractions({ wheelDirection: -1 })`
  invierte el zoom de la rueda.

## Protocolo del Chat IA

Igual que en la versión WPF: pega o envía un JSON como

```json
{ "action": "add_wall", "wallType": "SimpleWall",
  "start": { "x": 0, "y": 0, "z": 0 }, "end": { "x": 4, "y": 0, "z": 0 } }
```

en el campo de texto del Chat IA para crear una pared vía
`AIChatService.applyJsonCommand`.

## Próximos pasos sugeridos

1. **Picking real**: usar `THREE.Raycaster` sobre `wallMeshes` para
   seleccionar y arrastrar paredes con snapping a `GridNode`.
2. **Guardar la geometría en Supabase**: serializar `SceneManager` en la
   columna `datos` (jsonb) de `proyectos` y restaurarla al abrir la tarjeta
   (hoy el editor parte del diseño base `diseno_index`).
3. **Deep link para OAuth**: `arqstudio://auth/callback` +
   `exchangeCodeForSession` para que Google/GitHub devuelvan la sesión a la
   app sin pasar por el navegador (ver SUPABASE_SETUP.md, apartado 5).
4. **Animación "correr por la casa"**: implementar una interpolación de
   `CameraState` a lo largo de un recorrido, disparada desde
   `AIChatService` (`run_animation`).
5. **Miniaturas renderizadas**: sustituir el SVG de `ui/PlanThumbnail.ts` por
   un render offscreen del `ProjectDesign` con Three.js.

## Nota sobre la orientación de las paredes

`WallMeshBuilder.buildWallMesh` orienta la caja extruida con
`Math.atan2(dz, dx)`; si al probarlo alguna pared aparece rotada 180°,
ajusta el signo de `angle` en `engine/WallMeshBuilder.ts` — es la única
parte de la geometría que conviene verificar visualmente al primer
`npm run dev`.
