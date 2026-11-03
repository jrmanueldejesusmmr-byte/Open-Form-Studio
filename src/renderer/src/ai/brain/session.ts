import type { HistoryManager } from '../../engine/HistoryManager'
import type { SceneManager } from '../../engine/SceneManager'
import { hasUnresolvedMarker, resolveMarkers, runOrder, simulateStep, type OrderStep } from '../tools/executor'
import type { DryRunResult } from '../tools/types'
import type { Clarification, Plan } from './planner'
import { interpret } from './parse'
import { plan } from './planner'
import { createMemory, rememberCreated, rememberRoom, type BrainMemory } from './memory'
import { aiSettings } from '../settings'
import { geminiPlan as defaultGeminiPlan } from '../geminiBridge'
import { validarEscenaContraSpec } from './validators'
import {
  analizarModoAmoroso,
  detectarDeclaracion,
  detectTone,
  envuelveConTono,
  formatearErrorHonesto,
  frase,
  modoAmorosoActivo,
  setModoAmoroso,
  type AstroTone
} from './tone'
import { stickerParaCategoria, type StickerId } from './stickers'

/** Vista previa generada por el cerebro: títulos, pasos y la orden lista para aplicar. */
export interface Preview {
  titulo: string
  resumen: string
  /** Resultado del dry-run por paso (para mostrar validez/errores). */
  pasos: Array<{ herramienta: string; resumen: string; valido: boolean; error?: string }>
  avisos: string[]
  /** `false` si algún paso no pasa el dry-run: no se puede aplicar. */
  valido: boolean
  /** Pasos listos para ejecutar (se guardan para el «Aplicar»). */
  order: OrderStep[]
  /** Etiqueta del deshacer único. */
  etiqueta: string
  /** Tono con el que fue generada la orden. */
  tone?: AstroTone
  /** Especificación intermedia para validación post-generación. */
  spec?: import('./spec').DesignSpec
}

export type BrainReply =
  | { kind: 'preview'; preview: Preview; sticker?: StickerId }
  | { kind: 'clarify'; clarify: Clarification; sticker?: StickerId }
  | { kind: 'chat'; mensaje: string; sticker?: StickerId }

export interface SessionOptions {
  scene: SceneManager
  history: HistoryManager
  /** Si está activo, aplica directamente sin vista previa. Puede ser un valor o una función (para reflejar el ajuste en caliente). */
  autoApply: boolean | (() => boolean)
  /**
   * Proveedor de function calling de Gemini (Fase 3). Si no se pasa, se usa el
   * puente real (`geminiBridge`); en tests se inyecta un mock. Devuelve los
   * pasos propuestos por Gemini, o lanza para que se caiga al cerebro local.
   */
  geminiPlan?: (prompt: string) => Promise<OrderStep[]>
}

export class BrainSession {
  private readonly memory: BrainMemory = createMemory()
  private lastPreview: Preview | null = null
  private lastTone: AstroTone = 'profesional'

  constructor(private readonly opts: SessionOptions) {}

  private get autoApply(): boolean {
    return typeof this.opts.autoApply === 'function' ? this.opts.autoApply() : this.opts.autoApply
  }

  /** Memoria actual (para depuración/tests). */
  getMemory(): BrainMemory {
    return this.memory
  }

  /** Tono de la última orden recibida. */
  getLastTone(): AstroTone {
    return this.lastTone
  }

  /**
   * Interpreta y planifica la frase. Si `autoApply` está activo y el plan es
   * válido, lo aplica y devuelve el resultado; si no, devuelve la vista previa
   * para que el usuario confirme.
   */
  submit(text: string): BrainReply {
    const analisis = analizarModoAmoroso(text)
    const tone: AstroTone = analisis.tone
    this.lastTone = tone

    // Cambio de modo persistente: no es una orden de construcción.
    if (analisis.comando === 'activar') {
      setModoAmoroso(true)
      return { kind: 'chat', mensaje: 'Modo amoroso activado. Estoy aquí para ti, mi vida. ¿En qué te ayudo? 💖', sticker: 'corazon-latido' }
    }
    if (analisis.comando === 'desactivar') {
      setModoAmoroso(false)
      return { kind: 'chat', mensaje: 'Modo normal activado. Quedo a tus órdenes.' }
    }

    // Declaración de afecto: solo respuesta cariñosa, no toca la escena.
    // El emoji y el sticker de lluvia de corazones SOLO en tono amoroso.
    const declaracion = detectarDeclaracion(analisis.textoLimpio)
    if (declaracion.esDeclaracion) {
      return {
        kind: 'chat',
        mensaje: tone === 'amoroso' ? `${declaracion.respuesta} 💖✨` : declaracion.respuesta,
        sticker: stickerParaCategoria('declaracion', tone)
      }
    }

    // Si el texto limpio está vacío (p. ej. escribió solo "/" o "/   "):
    if (!analisis.textoLimpio) {
      const msg = tone === 'amoroso'
        ? frase('ayuda', 'amoroso')
        : 'Por favor escribe una orden de diseño.'
      return { kind: 'chat', mensaje: msg, sticker: stickerParaCategoria('ayuda', tone) }
    }

    const order = interpret(analisis.textoLimpio)
    const result = plan(order, this.opts.scene, this.memory)

    if (result.kind === 'clarify') {
      let pregunta = result.clarify.pregunta
      if (tone === 'amoroso') {
        const prefijo = frase('aclaracion', 'amoroso')
        // Si la variante trae {pregunta}, se usa como plantilla completa
        // (nunca debe filtrarse el marcador literal en la burbuja).
        pregunta = prefijo.includes('{pregunta}')
          ? prefijo.replace('{pregunta}', pregunta)
          : `${prefijo} ${pregunta}`.trim()
      }
      return { kind: 'clarify', clarify: { ...result.clarify, pregunta }, sticker: stickerParaCategoria('aclaracion', tone) }
    }
    if (result.kind === 'chat') {
      const msg = tone === 'amoroso'
        ? `${frase('saludo', 'amoroso')} ${result.mensaje}`.trim()
        : result.mensaje
      return { kind: 'chat', mensaje: msg, sticker: stickerParaCategoria('saludo', tone) }
    }

    const preview = this.buildPreview(result.plan)
    preview.tone = tone

    if (!preview.valido) {
      const fallos = preview.pasos
        .filter((p) => !p.valido)
        .map((p) => p.error || p.resumen || '')
        .filter((s) => s.length > 0)
      const motivo = fallos.length > 0 ? fallos.join(' · ') : 'la orden no pudo prepararse'
      preview.resumen = formatearErrorHonesto(motivo, tone)
    } else {
      if (tone === 'amoroso' && preview.resumen) {
        preview.resumen = envuelveConTono(preview.resumen, preview.avisos, 'amoroso')
        preview.avisos = []
      }
    }

    this.lastPreview = preview
    if (this.autoApply && preview.valido) {
      this.apply()
    }

    return { kind: 'preview', preview, sticker: stickerParaCategoria(preview.valido ? 'resumen' : 'error', tone) }
  }

  /**
   * Envío «inteligente» (Fase 3). Si Gemini está activado en los ajustes,
   * pide un plan por function calling y, si el cerebro local lo valida en el
   * dry-run, devuelve la vista previa (nunca se aplica sin vista previa salvo
   * autoApply). ante cualquier fallo (sin Gemini, sin red, timeout, plan
   * inválido) cae SIN RUIDO al cerebro local (`submit`). El flag y el proveedor
   * se leen en cada llamada, así que se puede activar/desactivar sin reiniciar.
   */
  async submitSmart(text: string): Promise<BrainReply> {
    if (aiSettings.geminiEnabled) {
      const provider = this.opts.geminiPlan ?? defaultGeminiPlan
      try {
        const steps = await provider(text)
        if (Array.isArray(steps) && steps.length > 0) {
          const preview = this.buildPreviewFromSteps(steps)
          if (preview.valido) {
            const tone = analizarModoAmoroso(text).tone
            preview.tone = tone
            this.lastPreview = preview
            if (this.autoApply) this.apply()
            return { kind: 'preview', preview, sticker: stickerParaCategoria('resumen', tone) }
          }
        }
      } catch {
        // Silencioso a propósito: Gemini no disponible o falló → cerebro local.
      }
    }
    return this.submit(text)
  }

  /** Vista previa a partir de pasos ya propuestos (p. ej. por Gemini). */
  private buildPreviewFromSteps(steps: OrderStep[]): Preview {
    const pasos = this.simulateOrder(steps).map((paso) => ({
      herramienta: paso.herramienta,
      resumen: paso.dry.resumen || paso.dry.error || '(sin resumen)',
      valido: paso.dry.valido,
      error: paso.dry.error
    }))
    const valido = pasos.length > 0 && pasos.every((p) => p.valido)
    return {
      titulo: 'Plan propuesto por Gemini',
      resumen: `${pasos.length} paso(s) propuestos y validados con el cerebro local. Revísalos antes de aplicar.`,
      pasos,
      avisos: ['Plan generado por Gemini (function calling) y verificado localmente.'],
      valido,
      order: steps,
      etiqueta: 'IA-Gemini: plan propuesto'
    }
  }

  /** Construye la vista previa haciendo dry-run de cada paso, en orden. */
  private buildPreview(planValue: Plan): Preview {
    const pasos = this.simulateOrder(planValue.pasos).map((paso) => ({
      herramienta: paso.herramienta,
      resumen: paso.dry.resumen || paso.dry.error || '(sin resumen)',
      valido: paso.dry.valido,
      error: paso.dry.error
    }))
    const valido = pasos.length > 0 && pasos.every((p) => p.valido)
    return {
      titulo: planValue.titulo,
      resumen: planValue.resumen,
      pasos,
      avisos: planValue.avisos,
      valido,
      order: planValue.pasos,
      etiqueta: `IA: ${planValue.titulo}`,
      spec: planValue.spec
    }
  }

  /**
   * Dry-run de cada paso en orden. Un paso que aún referencia un marcador
   * `{{herramienta.indice}}` depende de geometría que creará un paso anterior
   * de la misma orden (p. ej. «coloca la puerta en el primer muro de la
   * habitación»): como en la vista previa ese muro todavía no existe, no se
   * puede validar por adelantado y se deja para el «Aplicar», donde `runOrder`
   * resuelve el marcador contra los ids realmente creados.
   */
  private simulateOrder(pasos: OrderStep[]): Array<{ herramienta: string; dry: DryRunResult }> {
    const createdByTool = new Map<string, string[]>()
    return pasos.map((paso) => {
      const parametros = resolveMarkers(paso.parametros, createdByTool)
      const dry: DryRunResult = hasUnresolvedMarker(parametros)
        ? { valido: true, resumen: `${paso.herramienta}: se resolverá al aplicar la orden.`, acciones: [], avisos: [] }
        : simulateStep(this.opts.scene, this.opts.history, paso.herramienta, parametros)
      if (dry.valido) {
        for (const acc of dry.acciones ?? []) {
          const ids = acc.ids_afectados ?? []
          if (ids.length > 0) createdByTool.set(paso.herramienta, ids)
        }
      }
      return { herramienta: paso.herramienta, dry }
    })
  }

  /** Ejecuta la última vista previa (un solo deshacer) y actualiza memoria. */
  apply(preview?: Preview): { ok: boolean; mensaje: string; sticker?: StickerId } {
    const target = preview ?? this.lastPreview
    if (!target) return { ok: false, mensaje: 'No hay ninguna orden preparada.' }
    const result = runOrder(this.opts.scene, this.opts.history, target.etiqueta, target.order)
    if (result.ok) {
      rememberCreated(this.memory, result.ids_creados, this.opts.scene)
      // Historial de recintos: cada `crear_habitacion` exitoso añade sus 4
      // muros al índice «habitación N» que usan borrar/union por número.
      for (const paso of result.pasos) {
        if (paso.ok && paso.herramienta === 'crear_habitacion' && paso.ids && paso.ids.length > 0) {
          rememberRoom(this.memory, paso.ids)
        }
      }
    }

    const tone = target.tone ?? this.lastTone
    let mensaje = result.mensaje
    let sticker: StickerId | undefined
    if (result.ok) {
      // Si la orden tenía un spec, validamos la escena resultante:
      if (target.spec) {
        const val = validarEscenaContraSpec(target.spec, this.opts.scene)
        if (!val.ok) {
          const motivo = `Discrepancia en la escena: ${val.discrepancias.join('. ')}.`
          mensaje = formatearErrorHonesto(motivo, tone)
          return { ok: false, mensaje, sticker: stickerParaCategoria('error', tone) }
        }
      }

      if (tone === 'amoroso') {
        const exito = frase('exito', 'amoroso')
        mensaje = `${exito} ${result.mensaje}`.trim()
        // Orden grande (casa, edificio o muchos pasos) → frase corta de ánimo
        // para seguir motivando después de terminar.
        const grande = target.order.length >= 5 || target.order.some(
          (s) => s.herramienta === 'generar_casa' || s.herramienta === 'generar_edificio'
        )
        if (grande) mensaje = `${mensaje} ${frase('animo', 'amoroso')}`.trim()
        sticker = stickerParaCategoria('exito', tone)
      }
    } else {
      mensaje = formatearErrorHonesto(result.mensaje, tone)
      sticker = stickerParaCategoria('error', tone)
    }

    return { ok: result.ok, mensaje, sticker }
  }

  /** Descarta la vista previa pendiente (botón Cancelar). */
  cancel(): void {
    this.lastPreview = null
  }
}
