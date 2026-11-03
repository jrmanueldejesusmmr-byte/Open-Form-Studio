# FASE 0 — Reconocimiento y Auditoría del Sistema de IA y Workspace

Documento de auditoría y reconocimiento previo de la base de código en la rama `feature/ia-razonamiento-modo-amoroso` (`~/arq-ia`).

---

## 1. Cableado del Sistema: Chat → Cerebro → Herramientas

El flujo de procesamiento de una orden en ArqStudio 3D está cableado de la siguiente manera:

1. **Entrada de Usuario en el Chat de Astro (`src/renderer/src/ui/AIChatPanel.ts`)**:
   - `mountAIChatPanel` monta la interfaz del panel lateral derecho.
   - El input de texto (`#chat-input`) recoge el mensaje y al enviar ejecuta `send()`.
   - Llama a `options.session.submitSmart(text)` en `BrainSession`.

2. **Cerebro Local y Detección de Modo (`src/renderer/src/ai/brain/session.ts` y `tone.ts`)**:
   - `BrainSession.submitSmart(text)` intenta ejecutar `geminiPlan` si `geminiEnabled` está activo; ante cualquier fallo o si está apagado, delega en `BrainSession.submit(text)`.
   - `BrainSession.submit`:
     - Invoca `analizarModoAmoroso(text)` en `src/renderer/src/ai/brain/tone.ts`.
     - Detecta si el mensaje inicia con `/` (o comandos `/modo amoroso` / `/modo normal`).
     - Detecta declaraciones afectivas (`detectarDeclaracion`), respondiendo directamente con texto afectivo sin tocar la escena 3D.
     - Limpia el texto (retirando el prefijo `/`).
     - Interpreta la orden mediante `interpret(analisis.textoLimpio)` en `parse.ts` → produce un `ParsedOrder`.
     - Planifica la orden con `plan(order, scene, memory)` en `planner.ts` → genera un `Plan` con una secuencia de `OrderStep[]` o una solicitud de aclaración (`Clarification`).
     - Valida los pasos simulándolos en seco (`dry-run`) mediante `simulateOrder` y `simulateStep` (`src/renderer/src/ai/tools/executor.ts`).
     - Construye un `Preview` estructurado con títulos, lista de pasos (`valido`, `resumen`, `error`) y avisos. Si el modo amoroso está activo, envuelve el resumen con `envuelveConTono` / `frase(...)` respetando los datos técnicos y reportando errores con honestidad.

3. **Confirmación en UI o Ejecución Automática (`AIChatPanel.ts` y `executor.ts`)**:
   - Si `autoApply` es falso (modo interactivo estándar), la UI muestra la tarjeta de vista previa con botones **Aplicar** y **Cancelar**.
   - Al pulsar **Aplicar**, se invoca `BrainSession.apply()`, que ejecuta `runOrder(...)` en `src/renderer/src/ai/tools/executor.ts`.
   - `runOrder` agrupa todos los pasos en una sola transacción en `HistoryManager` (`history.executeTransaction(...)`), garantizando un único `Ctrl+Z` para deshacer toda la orden.
   - Cada `OrderStep` invoca una herramienta registrada en el catálogo `AI_TOOLS` (`src/renderer/src/ai/tools/registry.ts`).

4. **Integración con el Workspace (`src/renderer/src/workspace/mountWorkspace.ts`)**:
   - `mountWorkspace` inicializa `SceneManager`, `HistoryManager`, `LayerManager`, `ViewportRenderer` y `Viewport3DController`.
   - Instancia `BrainSession({ scene, history, autoApply: () => aiAutoApply })`.
   - Monta `mountAIChatPanel` pasándole la instancia de `aiBrain`.

---

## 2. Qué Existe Actualmente

- **Modo Amoroso y Tono (`src/renderer/src/ai/brain/tone.ts` y `tone.test.ts`)**:
  - Implementación inicial de `analizarModoAmoroso`, detección de `/` al inicio, persistencia local con `localStorage` y banco básico de frases en `FRASES` dentro de `tone.ts`.
  - Respuestas directas para declaraciones tipo `/te amo` ("Yo te amo aún más, mi vida.").
  - Suite de tests unitarios iniciales en `tone.test.ts` (diseñados para Vitest).
- **Especificación Intermedia (`src/renderer/src/ai/brain/spec.ts`)**:
  - Definición de tipos `DesignSpec`, `EspecOrigen`, `EspecMaterial`, `EspecTecho`, `EspecExterior`, `EspecColocacion`.
  - Funciones de parsing para números en dígitos y palabras (`NUMBER_WORDS`), dimensiones, conteos de habitaciones y puertas, materiales y techos.
- **Validadores de Arquitectura (`src/renderer/src/ai/brain/validators.ts`)**:
  - Constantes `ARCH_LIMITS` y funciones `validarDesignSpec`, `validarCoordenada`, `validarDimension`.
- **Generadores de Pasos (`src/renderer/src/ai/brain/generators.ts`)**:
  - `planRoom`, `planHouse`, `planBuilding`, `generarCasaPorCuenta`.
- **Herramientas de IA (`src/renderer/src/ai/tools/*`)**:
  - 28 herramientas registradas en `registry.ts`: muros, habitaciones rectangulares, puertas, ventanas, techos, plantas, niveles, consultas, primitivas, `generar_casa`, `generar_edificio`.
  - Mecanismo de sustitución de marcadores dinámicos `{{crear_habitacion.0}}` para encadenar puertas y ventanas a muros recién creados.

---

## 3. Qué Falta por Implementar (según requerimientos del Prompt)

### Para FASE 1 — Modo Amoroso en el Área de Trabajo
1. **Unificación y extracción del banco de frases a `src/renderer/src/ai/brain/phrases.ts`**:
   - Actualmente `phrases.ts` tiene los casos de prueba `TEST_CASES` de Fase 2. Debe modularizarse o incorporar el banco estructurado de frases por tipo (saludo, confirmación, error honesto, aclaración, deshacer, despedida, declaración de afecto) y garantizar no repetición de frases consecutivas.
   - Función única de detección/limpieza de tono `detectTone(message) -> { tone, cleaned }` o integración robusta con `analizarModoAmoroso` para respetar los casos bordes (`/`, `/ `, `//`, rutas `/casa`, espacios en blanco).
2. **Indicador Visual Discreto en el Chat (`AIChatPanel.ts`)**:
   - Actualmente no existe indicador visual en la UI. Se requiere un borde sutil o icono/corazón reactivo junto al input mientras el mensaje empiece con `/` o el último intercambio haya sido en modo amoroso, desapareciendo en mensajes sin `/`.
3. **Runner de Tests Operativo**:
   - Vitest falla al arrancar por incompatibilidad de export de Vite (`./module-runner`). Es necesario un script/runner ejecutable con `node` para validar las pruebas unitarias de modo amoroso y razonamiento sin depender del bundler defectuoso.

### Para FASE 2 — Mejor Razonamiento de Astro
1. **DesignSpec y Semántica Completa**:
   - Parseo exacto del ejemplo complejo: *"casa de 45 × 30 m, 10 habitaciones, 10 ventanas, una puerta por habitación, tabla roca, techo adaptado, césped afuera, arco estilo hotel en la entrada"*.
   - Aumento de límites arquitectónicos: subir `MAX` de 30m a 200m en `validators.ts` y `ARCH_LIMITS.AREA_MAX` para que no rechace terrenos de 45×30 m (1350 m²).
   - Manejo de colocación relativa con bounding boxes reales ("en medio de dos casas", "a la derecha de la casa A").
2. **Distribuidor de Layout Real (`layout.ts`)**:
   - Actualmente `Distribuidor` es solo un stub que no calcula partición espacial. Debe implementar partición BSP/treemap con pasillo central o distribuidor que cumpla exactamente los conteos requeridos (ej. 10 habitaciones, 10 ventanas, 1 puerta por habitación).
3. **Planificación en 2 Pasos y Validadores Post-Generación**:
   - (a) Construcción y validación del `DesignSpec` mostrando plan resumido con Aplicar/Cancelar. Si faltan datos críticos, emitir una sola pregunta concreta.
   - (b) Validador post-ejecución que inspeccione la escena real tras generar, cuente muros, puertas, ventanas y habitaciones creadas y las compare con el spec solicitado. Reintento automático en caso de discrepancia y reporte honesto con el tono activo si falla.
4. **Nuevas Herramientas de Edición**:
   - Implementar y registrar en `registry.ts`: `borrar_habitacion`, `unir_habitaciones`, `agregar_habitaciones`, mover y redimensionar habitación completa con un único `Ctrl+Z`.

### Para FASE 3 — Mejoras del Área de Trabajo (Editor)
*(Cuidando estrictamente no tocar `OpeningMeshBuilder`, `WallMeshBuilder` ni lógica de aberturas)*:
1. Selección clara (resaltado, selección múltiple con Shift, caja de selección) y panel de propiedades editables para el objeto seleccionado.
2. Manipuladores / Gizmos (mover, rotar, escalar) con ajuste (snap) a cuadrícula y muros; atajos: Supr, Ctrl+Z/Y, Ctrl+D (duplicar), Esc.
3. Optimización del renderizado (reutilización de geometrías/materiales, instancing donde aplique).
4. Sincronización precisa de estados y mensajes en la barra de estado.

