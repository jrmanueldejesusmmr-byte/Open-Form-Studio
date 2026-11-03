/**
 * Esqueleto del cliente de Gemini para el proceso **main** (Fase 3).
 *
 * IMPORTANTE — alcance de este andamiaje (aún SIN function calling):
 * - La `GEMINI_API_KEY` se lee del `.env` SOLO aquí y nunca sale por IPC.
 * - Expone `status()` (¿hay clave? ¿qué modelo?) y `generate()` (texto libre).
 * - El renderer NO recibe la clave: solo `{ ok, text }` o `{ ok:false, error }`.
 * - La integración con las herramientas del registro (function calling) y el
 *   enrutado cerebro-local ↔ Gemini llegan en la Fase 3 completa.
 *
 * Usa `fetch` global (Node 20 / Electron 31). Si no hay red o Gemini falla,
 * devuelve `{ ok:false, error }` para que el renderer caiga al cerebro local.
 */

import { readGeminiConfig, type GeminiConfig } from './env'

/** Estado de configuración visible de forma segura para el renderer. */
export interface GeminiStatus {
  configured: boolean
  model: string | null
}

/** Respuesta de una generación (nunca incluye la clave). */
export interface GeminiResult {
  ok: boolean
  text?: string
  error?: string
  /** Código HTTP de la API cuando falla (400, 403, 404…); útil para depurar. */
  status?: number
}

/** Endpoint REST de Gemini (API key va en la query, aquí en el main). */
const GEMINI_URL = (model: string, apiKey: string): string =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

/** Tiempo máximo de espera de la API. Sin esto, si no hay salida a Internet el
 *  `fetch` puede quedar colgado minutos (el TCP connect no rechaza). Con este
 *  timeout garantizamos un error controlado en lugar de un cuelgue. */
const GEMINI_TIMEOUT_MS = 15_000

export class GeminiService {
  private config: GeminiConfig | null

  constructor(baseDir: string) {
    this.config = readGeminiConfig(baseDir)
  }

  /** ¿Está configurado y con qué modelo? (seguro para enviar al renderer). */
  status(): GeminiStatus {
    return { configured: this.config !== null, model: this.config?.model ?? null }
  }

  /**
   * Genera texto libre con Gemini. Sin function calling por ahora.
   * Ante cualquier problema (sin clave, sin red, error de API) devuelve
   * `{ ok:false, error }` en lugar de lanzar, para que la UI degrade al local.
   */
  async generate(prompt: string): Promise<GeminiResult> {
    if (!this.config) return { ok: false, error: 'Gemini no está configurado (falta GEMINI_API_KEY).' }
    const trimmed = prompt.trim()
    if (trimmed === '') return { ok: false, error: 'El prompt está vacío.' }

    try {
      // Tiempo de espera: aborta si la API no responde (red sin salida, API
      // caída…), para no colgar el botón ni el proceso. Ver GEMINI_TIMEOUT_MS.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(GEMINI_URL(this.config.model, this.config.apiKey), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: trimmed }] }] }),
          signal: controller.signal
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        // No se filtra la clave: solo el código HTTP y un extracto del cuerpo
        // del error (Google devuelve ahí el motivo: API_KEY_INVALID, etc.).
        const detail = await res.text().catch(() => '')
        return { ok: false, status: res.status, error: `Gemini respondió ${res.status}. ${detail.slice(0, 300)}` }
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (text.trim() === '') return { ok: false, error: 'Gemini devolvió una respuesta vacía.' }
      return { ok: true, text }
    } catch (e) {
      const err = e as Error
      // Abort por nuestro timeout → mensaje claro, no un crash de red.
      if (err.name === 'AbortError') {
        return { ok: false, error: `Tiempo de espera agotado (${GEMINI_TIMEOUT_MS / 1000} s) al contactar a Gemini. ¿Hay salida a Internet?` }
      }
      // Sin red, DNS caído, etc.: degrade al cerebro local.
      return { ok: false, error: err.message }
    }
  }

  /**
   * Function calling (Fase 3): pide a Gemini que proponga una secuencia de
   * herramientas del registro para cumplir `prompt`. El renderer envía las
   * definiciones (ya las conoce: son su propio registro); aquí solo se reenvían
   * a la API y se devuelven como pasos `{ herramienta, parametros }`.
   *
   * Devuelve `{ ok:false, ... }` ante cualquier problema (sin clave, sin red,
   * timeout, la API no devuelve ninguna llamada a función) para que el renderer
   * caiga SIN RUIDO al cerebro local. Nunca se filtra la clave.
   */
  async plan(prompt: string, tools: readonly GeminiToolDecl[]): Promise<GeminiPlanResult> {
    if (!this.config) return { ok: false, error: 'Gemini no está configurado (falta GEMINI_API_KEY).' }
    const trimmed = prompt.trim()
    if (trimmed === '') return { ok: false, error: 'El prompt está vacío.' }
    const declarations = sanitizeToolDecls(tools)
    if (declarations.length === 0) return { ok: false, error: 'No hay herramientas que ofrecer a Gemini.' }

    const body = {
      contents: [{ role: 'user', parts: [{ text: trimmed }] }],
      tools: [{ functionDeclarations: declarations }]
    }
    const res = await this.postJson(body)
    if (!res.ok) return res

    const data = (res.data ?? {}) as {
      candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name?: unknown; args?: unknown } }> } }>
    }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const steps: GeminiPlanStep[] = []
    for (const part of parts) {
      const call = part.functionCall
      if (!call || typeof call.name !== 'string' || call.name.trim() === '') continue
      const parametros = isPlainObject(call.args) ? call.args : {}
      steps.push({ herramienta: call.name.trim(), parametros })
    }
    if (steps.length === 0) {
      return { ok: false, error: 'Gemini no devolvió ninguna llamada a función.' }
    }
    return { ok: true, steps }
  }

  /** POST a `generateContent` con timeout. Compartido por `generate` y `plan`. */
  private async postJson(body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string; status?: number }> {
    const config = this.config
    if (!config) return { ok: false, error: 'Gemini no está configurado (falta GEMINI_API_KEY).' }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(GEMINI_URL(config.model, config.apiKey), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false, status: res.status, error: `Gemini respondió ${res.status}. ${detail.slice(0, 300)}` }
      }
      return { ok: true, data: await res.json() }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') {
        return { ok: false, error: `Tiempo de espera agotado (${GEMINI_TIMEOUT_MS / 1000} s) al contactar a Gemini. ¿Hay salida a Internet?` }
      }
      return { ok: false, error: err.message }
    }
  }
}

/** Declaración de herramienta tal y como la espera la API de function calling. */
export interface GeminiToolDecl {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

/** Paso propuesto por Gemini: una herramienta del registro + sus argumentos. */
export interface GeminiPlanStep {
  herramienta: string
  parametros: Record<string, unknown>
}

/** Resultado de un plan de Gemini (nunca incluye la clave). */
export interface GeminiPlanResult {
  ok: boolean
  steps?: GeminiPlanStep[]
  error?: string
  status?: number
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Limpia las herramientas del renderer antes de enviarlas a la API (defensa
 *  en profundidad: nada raro llega a Google y no se cuelga una tool inválida). */
function sanitizeToolDecls(tools: readonly GeminiToolDecl[]): GeminiToolDecl[] {
  const out: GeminiToolDecl[] = []
  for (const t of tools.slice(0, 64)) {
    if (!isPlainObject(t)) continue
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    if (name === '' || name.length > 64) continue
    const decl: GeminiToolDecl = { name }
    if (typeof t.description === 'string') decl.description = t.description.slice(0, 512)
    if (isPlainObject(t.parameters)) decl.parameters = t.parameters
    out.push(decl)
  }
  return out
}
