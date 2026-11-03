# Avance — Astro: órdenes complejas, edición exacta y modo amoroso

Rama: `feature/astro-ordenes` (desde `develop`).

## Fase 0. Preparación — HECHO

- `git status`: árbol limpio salvo `.env.example` (cambio ajeno, no se toca).
- `develop` existe y está al día; rama `feature/astro-ordenes` creada desde ella.
- `docs/avance/astro-ordenes.md` creado (este documento).

### Cómo fluye hoy un mensaje (10 líneas)

1. `AIChatPanel.ts` recibe el texto y llama `BrainSession.submitSmart(text)` (`submit` si Gemini apagado).
2. `BrainSession.submit` (`session.ts:65`) interpreta con `interpret(text)` → `ParsedOrder` (`parse.ts:167`).
3. `plan(order, scene, memory)` (`planner.ts:33`) convierte el intent en `Plan` con `OrderStep[]` o pide aclaración.
4. `buildPreview` (`session.ts:129`) hace dry-run de cada paso con `simulateStep`/`executor.ts` y valida.
5. UI muestra vista previa con botones **Aplicar** / **Cancelar** (`AIChatPanel.ts:74`).
6. `apply()` (`session.ts:174`) ejecuta `runOrder` dentro de una `history.transaction` → un solo deshacer (Ctrl+Z).
7. Herramientas existentes: `crear_habitacion`, `generar_casa`, `generar_edificio`, `crear_muro`, `colocar_puerta/ventana`, `crear_techo`, `crear_planta`, `aplicar_material`, `borrar_muro/objeto`, etc. (`tools/registry.ts`).
8. No existe entidad «habitación»: solo muros sueltos (`Wall`) y grupos de 4 muros de `crear_habitacion`; no hay `Room` con nombre/contorno.
9. No existe modo «/»: todo el texto va al intérprete normal; no hay tono cariñoso ni comandos de modo.
10. El cerebro funciona sin internet (Gemini es opcional vía `aiSettings.geminiEnabled`, `settings.ts`).

## Fase 1. Modo amoroso — EN PROGRESO

## Fase 2. Especificación intermedia — PENDIENTE

## Fase 3. Generador de distribución — PENDIENTE

## Fase 4. Césped y arco — PENDIENTE

## Fase 5. Colocación relativa — PENDIENTE

## Fase 6. Edición exacta de habitaciones — PENDIENTE

## Cierre — PENDIENTE

- Commits por fase y `git push -u origin feature/astro-ordenes`.
