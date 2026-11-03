# Fase 2 — Exportar a formatos estándar

> Rama: `feature/proyectos-por-usuario` · Base: `668774e` (Fase 1 de proyectos)
> Continuación: la Fase 3 (importar) está en [`proyectos-fase3.md`](./proyectos-fase3.md).

## 1. Qué se exporta

| Formato | Archivo | Contenido | Estado |
|---|---|---|---|
| **OBJ** | `.obj` | Mallas 3D (muros, objetos, losas) en metros | ✅ verificado |
| **MTL** | `.mtl` | Materiales del catálogo (`Kd`, `Ks`, `Ns`, `d`, `illum`) | ✅ verificado |
| **GLB** | `.glb` | glTF binario con la escena completa | ✅ verificado |
| **STL** | `.stl` | Malla triangulada binaria (impresión 3D) | ✅ verificado |
| **DXF** | `.dxf` | AutoCAD R12, capas MUROS/OBJETOS/PISOS | ✅ verificado |
| **PDF** | `.pdf` | Lámina A4/A3/A2 con marco, cajetín y escala | ✅ verificado |
| **SVG** | `.svg` | Planta vectorial con capas, `viewBox` en metros | ✅ verificado |
| **PNG** | `.png` | Captura del visor 3D (vista y encuadre reales) | ⚠️ solo en la app |
| **IFC** | `.ifc` | IFC4 (STEP): muros, losas, puertas, ventanas | ✅ verificado |

**Unidades:** metros en todos los formatos. **Ejes:** X a la derecha, Y arriba, Z
hacia el observador (los formatos 2D proyectan a planta con Y = −Z).

## 2. Verificación ejecutada (resultados reales)

```bash
npm run typecheck      # ✔ sin errores
npm run build          # ✔ compila
npm run test:export    # ✔ 44/44 pruebas (8 archivos)
npm run verify:export  # ✔ 22/22 comprobaciones de ida y vuelta
```

`scripts/_verify-export.mjs` genera un archivo real de cada formato y **lo vuelve
a leer** con el lector correspondiente (OBJLoader, GLTFLoader, STLLoader, el
parser DXF del propio proyecto), comprobando que las medidas se conservan en
metros. Los archivos quedan en `scripts/captures/export/` para inspección.

| Formato | Verificado | Cómo se comprobó |
|---|---|---|
| OBJ | ✅ | Relee con `OBJLoader`: muro de 8 m → 8,000 × 0,200 m |
| MTL | ✅ | 2 materiales (`mat.plaster`, piso) con `Kd`/`illum` |
| GLB | ✅ | Relee con `GLTFLoader`: 8,200 × 6,200 m |
| STL | ✅ | Relee con `STLLoader`: 8,200 × 6,200 m, 84 triángulos |
| DXF | ✅ | Relee con `parseDxf`: 28 segmentos, `INSUNITS=6` (metros) |
| PDF | ✅ | Cabecera `%PDF-1.4` y `%%EOF` comprobados |
| SVG | ✅ | `viewBox` de 9,2 × 7,2 m, capas MUROS/OBJETOS/PISOS |
| IFC | ✅ | STEP IFC4, 0 referencias rotas, unidades en metros |
| PNG | ❌ | **No verificado en headless**: necesita el lienzo WebGL real |

## 3. Bugs reales encontrados y corregidos

1. **`matrixWorld` sin actualizar** (`stl.ts`, `obj.ts`, `glb.ts`): los
   exportadores de three escriben los vértices con `object.matrixWorld`. Sin
   `scene.updateMatrixWorld(true)`, los muros salían **sin girar ni desplazar**
   (en su posición local). Afectaba a OBJ, STL y GLB por igual.
2. **Referencias IFC rotas**: `IfcRelContainedInSpatialStructure` recibía el
   *GUID* del storey en vez de su *id de entidad*. Ahora se guardan los dos
   (`entityId` y `placementId`) y se usan en el sitio correcto.
3. **Materiales sin nombre**: el material del catálogo no llevaba `name`, así que
   el MTL los nombraba por malla. Ahora `buildBaseMaterial` fija `material.name`
   con su id (`mat.plaster`).
4. **Ciclo de imports** (`svg.ts` → `dxf.ts` → `index.ts` → `svg.ts`): dejaba
   `DXF_LAYERS` sin inicializar y rompía DXF, PDF y el importador de DXF.
   Los nombres de capa del SVG son ahora literales.
5. **vitest 5 incompatible con vite 5**: `ERR_PACKAGE_PATH_NOT_EXPORTED` al
   arrancar. Se baja a `vitest@^2.1.8` (la serie compatible con vite 5).

## 4. Menú Archivo → Exportar

`file.export` abre `ExportDialog`, que lista **todos** los formatos
disponibles y ofrece:

- **Nombre sugerido**: el del proyecto, saneado (sin caracteres prohibidos).
- **Opciones del PDF**: hoja (A4/A3/A2 × horizontal/vertical), escala
  (automática o forzada a la serie comercial), proyecto, autor, fecha y número
  de lámina.
- **Mensajes honestos**: si un exportador falla, se muestra el motivo real en
  el diálogo y en la barra de estado (no se guarda un archivo corrupto).

## 5. Limitaciones conocidas

- **IFC4 es un subconjunto**: no incluye `IfcSpace`, carpintería paramétrica,
  propiedades personalizadas (Pset) ni materiales PBR. El mobiliario que no sea
  hueco no se exporta. Es un IFC4 legible y reimportable por visores de
  OpenBIM, pero no un modelo de cálculo completo.
- **PNG solo funciona dentro de la app**: captura el lienzo WebGL; sin visor
  activo el exportador avisa («La captura PNG necesita el visor 3D activo»)
  en vez de generar un archivo vacío.
- **STL no lleva materiales** (el formato no los admite) ni color.
- **El MTL se guarda aparte** que el OBJ: el diálogo guarda un archivo por
  formato, así que hay que guardar el `.obj` y el `.mtl` con el mismo nombre.
- **DXF en R12**: formato clásico, sin bloques ni cotas automáticas.

## 6. Archivos

- `src/renderer/src/export/stl.ts` — exportador STL (nuevo).
- `src/renderer/src/export/svg.ts` — exportador SVG (nuevo).
- `src/renderer/src/export/png.ts` — exportador PNG (nuevo).
- `src/renderer/src/export/ifc.ts` — exportador IFC4 (nuevo).
- `src/renderer/src/export/obj.ts` — OBJ + `buildMtl()` (nuevo).
- `src/renderer/src/export/index.ts` — registro de formatos.
- `src/renderer/src/engine/ViewportRenderer.ts` — `capturePng()`.
- `src/renderer/src/engine/MaterialSystem.ts` — `material.name` con el id.
- `scripts/_verify-export.mjs` + `_verify-export-entry.ts` — verificación de ida y vuelta.

## Fase 0. Preparación — HECHO

- `git checkout develop && git checkout -b feature/exportacion-planos` (develop = f508d5f, sin upstream remoto; árbol limpio, cambios ajenos ninguno).
- `docs/avance/exportacion-planos.md` creado (este documento).

### Qué existe hoy (10 líneas, archivo:línea)

1. `src/renderer/src/engine/SceneManager.ts:124` `getWalls()` y `:128` `getObjects()`; `:272` `getLevels()` — fuente de muros, objetos y pisos.
2. `src/renderer/src/engine/SceneManager.ts:137` `addWall(type,start,end)`, `:155` `removeWall(id)`, `:188` `restoreWall(snapshot)`, `:598` `restoreObject(snapshot)` — mutación de escena.
3. `src/renderer/src/models/Wall.ts:33` `Wall` con start/end (m), height, thickness, color, materialId, levelId; getter `length`.
4. `src/renderer/src/models/SceneObject.ts:29` `SceneObject` con position/rotationY/size, kind, shapeId, materialId, roofProps.
5. `src/renderer/src/models/Layer.ts:40` `createDefaultLayers()`; `:52` ya existe la capa `dimensions` ('Cotas').
6. `src/renderer/src/engine/WallMeshBuilder.ts:35` `buildWallMesh()` y `:67` `buildObjectMesh()` — geometría 3D reutilizable para exportar (solo muros/objetos).
7. `src/renderer/src/engine/TestSceneBuilder.ts:33` `buildTestHouseScene()` — casa de ejemplo (muros 8×6 m, vano puerta 1.1 m, 3 ventanas, mobiliario).
8. `src/main/index.ts:74` imports de electron; `:175`+ handlers ipcMain — punto para agregar `app:save-dialog`/`app:save-file`/`app:open-dialog`/`app:read-file`.
9. `src/preload/index.ts:83` `contextBridge.exposeInMainWorld('arqStudio', …)` — punto para agregar controles `app:`.
10. `src/renderer/src/workspace/mountWorkspace.ts:1415` `file.export` está como stub ('pendiente de implementar'); `:1962` `saveScene()` persiste escena por proyecto (DB/SQLite).

### Hallazgos de dependencias
- `node_modules/three/examples/jsm/exporters/`: GLTFExporter.js y OBJExporter.js presentes (three ^0.166.1). `tsconfig.web.json` ya resuelve `three/examples/jsm/*` (lo usa ViewportRenderer.ts:2). No hay `web-ifc` ni `jspdf` instalados (npm sí tiene ambas: jspdf 4.2.1, web-ifc 0.0.78). `ezdxf` de Python no está instalado.

## Fase 1. Base de exportación, OBJ y GLB — HECHO

- `src/renderer/src/export/index.ts`: registro central `EXPORT_FORMATS` (DXF/PDF/IFC quedan con `available: false` y mensaje de su fase), `ExportContext`, `BuildExportSceneOptions` y `buildExportScene()` (muros con `userData.kind/wallId/levelId`, objetos y losa por piso ajustada a la huella; opción `onlyWalls`).
- `src/renderer/src/export/obj.ts` + `glb.ts`: exportadores sobre `OBJExporter`/`GLTFExporter` de three (GLB → base64; tolera el `ArrayBuffer` directo de three r166 y la forma `{ buffer }`).
- `src/renderer/src/export/index.test.ts`, `obj.test.ts`, `glb.test.ts`: 10 tests con vitest (registro, escena de exportación, geometría OBJ 5 m × 0,2 m, ida y vuelta GLB con `GLTFLoader` y `FileReader` polyfill para Node).
- `src/renderer/src/ui/ExportDialog.ts`: diálogo modal (patrón `LevelDialogs`) con selector de formatos, nombre de archivo y guardado vía diálogo nativo; estilos en `ui/styles.css` (`.export-dialog__*`).
- `src/main/index.ts`: handlers `app:save-file` (utf8/base64), `app:save-dialog`, `app:open-dialog`, `app:read-file` a nivel de módulo (antes de `whenReady`).
- `src/preload/index.ts`: `arqStudio.app` (`saveDialog`, `saveFile`, `openDialog`, `readFile`).
- `src/renderer/src/workspace/mountWorkspace.ts`: `file.export` abre el diálogo (nombre del proyecto como nombre sugerido); `package.json` añade `vitest` y `@types/jest`.
- Verificación: `npm run typecheck` verde; `npx vitest run src/renderer/src/export/` → 10/10.

## Fase 2. DXF — HECHO

- `src/renderer/src/export/dxf.ts`: generador DXF R12 (AC1009) propio, sin dependencias: HEADER ($INSUNITS = metros), TABLES con capas usadas (más la capa 0 obligatoria) y ENTITIES con un `LINE` por segmento.
- Proyección en planta X→X, Z→−Y; capas estables `DXF_LAYERS` = MUROS/OBJETOS/PISOS/COTAS/RAYADO (las dos últimas las usa la Fase 6).
- Huellas: `wallFootprint()` (rectángulo con espesor y normal del muro), `objectFootprint()` (con rotación Y) y `collectPlanSegments()`; la huella por piso se comparte con la losa 3D vía `computeLevelFootprint()` (extraído de `buildFloorMesh`).
- `dxf` pasa a `available: true` en `EXPORT_FORMATS` (el diálogo lo lista automáticamente).
- `src/renderer/src/export/dxf.test.ts`: 6 tests con parser propio de DXF (estructura R12, geometría exacta del muro de 5 m, proyección, pisos, rotación 45°, escena vacía).
- Verificación: `npm run typecheck` verde; `npx vitest run src/renderer/src/export/` → 16/16.

## Fase 3. PDF de láminas — HECHO

- `src/renderer/src/export/pdf.ts`: lámina PDF 1.4 a mano (sin dependencias), A3 horizontal, con marco, cajetín (proyecto, escala, unidades, fecha) y trazado vectorial (`m`/`l`/`S`) por capas MUROS/OBJETOS/PISOS/COTAS/RAYADO.
- Escala normalizada a serie comercial (1:10…1:1000) con `pointsPerMeter()`/`normalizeScale()`/`layoutSheet()`/`toPaper()`; solo Latin-1 con `escapePdfText()` para que los offsets del xref sean exactos.
- `src/renderer/src/export/pdf.test.ts`: 5 tests (estructura PDF 1.4 con xref verificado, serie comercial, rótulo, operadores de línea, escena vacía).
- Verificación: `npm run typecheck` verde; `npx vitest run src/renderer/src/export/` → 21/21.

## Fase 4. Importación — PENDIENTE
## Fase 5. IFC — PENDIENTE
## Fase 6. Cotas y rayado — PENDIENTE
## Cierre — PENDIENTE

- Commits: uno por fase; push solo a `feature/exportacion-planos`.