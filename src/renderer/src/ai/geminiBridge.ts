/** Puente de function calling (Fase 3). Convierte el registro local de
 *  herramientas en las «function declarations» que entiende Gemini y pide un
 *  plan vía IPC (la clave sigue SOLO en el proceso main). Devuelve los pasos
 *  propuestos como `OrderStep[]`, listos para que el cerebro local los valide
 *  con dry-run antes de mostrar la vista previa. */
import { AI_TOOLS, type ToolDef } from './tools'
import type { OrderStep } from './tools/executor'

/** Declaración de herramienta para la API de Gemini (espejo de la de main). */
interface GeminiToolDecl {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

interface GeminiPlanResultLike {
  ok: boolean
  steps?: Array<{ herramienta: string; parametros: Record<string, unknown> }>
  error?: string
}

/** Convierte una herramienta del registro a su esquema JSON Schema de Gemini. */
function toGeminiTool(t: ToolDef): GeminiToolDecl {
  return {
    name: t.nombre,
    description: t.descripcion,
    parameters: t.esquema as unknown as Record<string, unknown>
  }
}

/** Todas las herramientas del registro, listas para enviar a Gemini. */
export function buildGeminiTools(): GeminiToolDecl[] {
  return AI_TOOLS.map(toGeminiTool)
}

/**
 * Pide a Gemini un plan (function calling) para `prompt`. Lanza una excepción
 * ante cualquier fallo (sin puente, sin clave, sin red, sin pasos) para que la
 * llamada pueda caer sin ruido al cerebro local.
 */
export async function geminiPlan(prompt: string): Promise<OrderStep[]> {
  const ai = (window as unknown as { arqStudio?: { ai?: { plan?: (p: { prompt: string; tools: GeminiToolDecl[] }) => Promise<GeminiPlanResultLike> } } }).arqStudio?.ai
  if (!ai?.plan) throw new Error('Puente Gemini no disponible.')
  const res = await ai.plan({ prompt, tools: buildGeminiTools() })
  if (!res.ok || !Array.isArray(res.steps) || res.steps.length === 0) {
    throw new Error(res.error ?? 'Gemini no devolvió pasos.')
  }
  return res.steps as OrderStep[]
}