import type { BrainSession, BrainReply } from '../ai/brain/session'
import { STICKERS, stickerHTML, stickerSVG, type StickerId } from '../ai/brain/stickers'
import { icon } from './icons'
import { AIChatService, normalizeSpanish } from '../services/AIChatService'

/**
 * Panel "Chat de IA - ASTRO" del lateral derecho en Open Form Studio.
 * Conectado al motor avanzado AIChatService con comprensión multi-intención
 * y bloqueo estricto de confirmación del usuario (2 pasos).
 */
export interface AIChatPanelOptions {
  service?: AIChatService
  session?: BrainSession
  /** Notas del proyecto que se muestran en la tarjeta de bienvenida. */
  welcome: readonly string[]
  /** Sugerencias de un clic: etiqueta visible + frase realmente enviada. */
  prompts: ReadonlyArray<{ label: string; command: string }>
  /** Callback tras aplicar (p. ej. reencuadrar la vista). */
  onApplied?: (mensaje: string) => void
}

/** Escapa un valor para usarlo como atributo HTML (los comandos JSON llevan comillas). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function mountAIChatPanel(container: HTMLElement, options: AIChatPanelOptions): void {
  // Chips por defecto actualizados con las capacidades de ASTRO y Smart Reactive BIM
  const activePrompts =
    options.prompts && options.prompts.length > 0
      ? options.prompts
      : [
          {
            label: '¿Cuántos bloques y cemento?',
            command: '¿cuántos sacos de cemento y cuántos bloques necesito para esta casa?'
          },
          {
            label: 'Auditar choques (Zero-Trash)',
            command: '¿hay algún choque entre tuberías y vigas o muros encimados?'
          },
          {
            label: 'Muros Piso 0 a 3.00m',
            command: 'cambia en la tabla todos los muros del Piso 0 a 3.00 metros de altura y dime cuánto sube el material'
          },
          {
            label: 'Segunda planta a la construcción',
            command: 'agrega una segunda planta a la construcción'
          },
          {
            label: 'Cablear casa (MEP)',
            command: 'cablea toda la casa con focos, switches, tomas y tablero'
          },
          {
            label: 'Terreno + aplanado + cúpula',
            command: 'crea terreno topográfico, aplana a +2m y pon cúpula geodésica'
          }
        ]

  container.innerHTML = `
    <header class="panel__head">
      <span class="panel__title">${icon('astro', 14)} CHAT DE IA - ASTRO</span>
      <div class="panel__icons">
        <button class="icon-btn" data-chat-action="clear" title="Limpiar conversación">${icon('trash', 14)}</button>
        <button class="icon-btn" data-panel-close title="Cerrar chat de IA">${icon('close', 14)}</button>
      </div>
    </header>
    <div class="chat panel__body panel__body--flush">
      <div class="chat__messages" id="chat-messages">
        <div class="chat-card">
          <p class="chat-card__intro">¡Hola! Soy <strong>ASTRO</strong>, tu asistente senior de arquitectura, estructuras y sistemas BIM 3D.</p>
          <p style="font-size: 11px; color: var(--text-dim, #888); margin: 4px 0 8px;">🛡️ <em>Modo de Seguridad Activo: Ninguna acción modificará tu proyecto sin tu confirmación previa.</em></p>
          <ul class="chat-card__list">
            ${options.welcome.map((line) => `<li>${line}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="chat__prompts">
        <span class="chat__prompts-title">Sugerencias Rápidas:</span>
        <div class="chat-chips">
          ${activePrompts
            .map((prompt) => `<button class="chip" data-prompt="${escapeAttr(prompt.command)}">${prompt.label}</button>`)
            .join('')}
        </div>
      </div>
      <div class="chat__input-row" id="chat-input-row">
        <span class="chat__amoroso-badge" id="chat-amoroso-badge" style="display:none;" title="Modo cariñoso activo">❤️</span>
        <input id="chat-input" type="text" placeholder="Escribe tu orden o consulta arquitectónica…" />
        <button id="chat-send" class="chat__send" title="Enviar orden a ASTRO">${icon('send', 15)}</button>
      </div>
    </div>
  `

  const messages = container.querySelector<HTMLDivElement>('#chat-messages')!
  const inputRow = container.querySelector<HTMLDivElement>('#chat-input-row')!
  const input = container.querySelector<HTMLInputElement>('#chat-input')!
  const sendBtn = container.querySelector<HTMLButtonElement>('#chat-send')!
  const badge = container.querySelector<HTMLSpanElement>('#chat-amoroso-badge')!

  const updateAmorosoUi = (text: string): void => {
    const isAmoroso = text.trimStart().startsWith('/')
    if (isAmoroso) {
      inputRow.classList.add('is-amoroso')
      if (badge) badge.style.display = 'inline-flex'
    } else {
      inputRow.classList.remove('is-amoroso')
      if (badge) badge.style.display = 'none'
    }
  }

  const stickerSpan = (id: StickerId): HTMLSpanElement => {
    const span = document.createElement('span')
    span.className = 'chat-sticker'
    span.setAttribute('role', 'img')
    span.setAttribute('aria-label', STICKERS[id].alt)
    span.innerHTML = stickerSVG(id)
    return span
  }

  const spawnLluviaCorazones = (): void => {
    const rain = document.createElement('div')
    rain.className = 'chat-heart-rain'
    rain.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < 12; i += 1) {
      const heart = document.createElement('span')
      heart.textContent = '💖'
      heart.style.setProperty('--i', String(i))
      rain.appendChild(heart)
    }
    messages.appendChild(rain)
    messages.scrollTop = messages.scrollHeight
    window.setTimeout(() => rain.remove(), 1600)
  }

  const append = (text: string, sender: 'user' | 'ia', sticker?: StickerId): void => {
    const bubble = document.createElement('div')
    bubble.className = `chat-msg chat-msg--${sender}`
    
    // Si contiene markdown con saltos de línea y negritas, formatear legible
    const formatted = escapeAttr(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
    bubble.innerHTML = formatted

    if (sticker) {
      bubble.appendChild(stickerSpan(sticker))
      if (sticker === 'lluvia-corazones') spawnLluviaCorazones()
    }
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }

  let activeProposalActions: HTMLDivElement | null = null

  /**
   * Renderiza el Plan de Acción Propuesto de 2 pasos con los dos botones interactivos destacados:
   * [ ✅ Confirmar y aplicar cambios ]
   * [ ❌ Cancelar operación ]
   */
  const appendPreview = (reply: Extract<BrainReply, { kind: 'preview' }>): void => {
    const p = reply.preview
    const card = document.createElement('div')
    card.className = 'chat-card chat-preview'

    const stepsHtml = p.pasos
      .map(
        (s, idx) =>
          `<li class="${s.valido ? '' : 'chat-preview__step--bad'}" style="margin: 4px 0; font-size: 11.5px; line-height: 1.4;">
            <strong>${idx + 1}.</strong> ${s.valido ? '✓' : '✕'} <span style="color: var(--accent-color, #38bdf8); font-weight: 500;">${escapeAttr(s.herramienta)}</span>: ${escapeAttr(s.resumen)}
          </li>`
      )
      .join('')

    const avisos = p.avisos.length
      ? `<div class="chat-preview__warn" style="font-size: 11px; padding: 6px 8px; border-radius: 4px; background: rgba(234, 179, 8, 0.15); color: #eab308; margin: 8px 0;">⚠️ ${p.avisos.map(escapeAttr).join(' · ')}</div>`
      : ''
    const sticker = reply.sticker ? `<p class="chat-preview__sticker">${stickerHTML(reply.sticker)}</p>` : ''

    const formattedResumen = escapeAttr(p.resumen)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
        <span style="font-size: 16px;">📋</span>
        <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--text-primary);">${escapeAttr(p.titulo)}</h4>
      </div>
      <div class="chat-preview__resumen" style="font-size: 11.5px; line-height: 1.5; color: var(--text-secondary); margin-bottom: 8px;">${formattedResumen}</div>
      ${sticker}
      <div style="background: var(--bg-surface-2, rgba(255,255,255,0.03)); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 6px; padding: 8px; margin: 8px 0;">
        <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-dim, #888); letter-spacing: 0.5px;">Pasos Técnicos a Ejecutar:</span>
        <ol class="chat-preview__steps" style="margin: 6px 0 0 16px; padding: 0;">${stepsHtml}</ol>
      </div>
      ${avisos}
      <div style="margin-top: 10px; font-size: 11px; color: var(--text-dim, #aaa);">
        🔒 <em>Requiere tu autorización. Haz clic abajo o escribe "sí" / "confirmar" en el chat.</em>
      </div>
      <div class="chat-preview__actions" style="display: flex; gap: 8px; margin-top: 10px;">
        <button class="btn btn--primary chat-preview__apply" ${p.valido ? '' : 'disabled'} style="font-weight: 600; background: #16a34a; border-color: #15803d; color: #ffffff; padding: 8px 12px; border-radius: 6px; flex: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>✅ Confirmar y aplicar cambios</span>
        </button>
        <button class="btn btn--secondary chat-preview__cancel" style="font-weight: 500; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>❌ Cancelar operación</span>
        </button>
      </div>
    `

    const actions = card.querySelector<HTMLDivElement>('.chat-preview__actions')!
    activeProposalActions = actions

    const applyBtn = card.querySelector<HTMLButtonElement>('.chat-preview__apply')!
    const cancelBtn = card.querySelector<HTMLButtonElement>('.chat-preview__cancel')!

    applyBtn.addEventListener('click', async () => {
      actions.remove()
      activeProposalActions = null
      if (options.service) {
        const res = await options.service.confirmAndExecute()
        append(`ASTRO: ${res.mensaje}`, 'ia', res.sticker)
        if (res.ok) options.onApplied?.(res.mensaje)
      } else if (options.session) {
        const res = options.session.apply()
        append(`ASTRO: ${res.ok ? '✅ ' : '⚠️ '}${res.mensaje}`, 'ia', res.sticker)
        if (res.ok) options.onApplied?.(res.mensaje)
      }
    })

    cancelBtn.addEventListener('click', () => {
      actions.remove()
      activeProposalActions = null
      if (options.service) {
        const res = options.service.cancelProposal()
        append(`ASTRO: ${res.mensaje}`, 'ia')
      } else if (options.session) {
        options.session.cancel()
        append('ASTRO: Operación cancelada. No se ha modificado la escena.', 'ia')
      }
    })

    messages.appendChild(card)
    messages.scrollTop = messages.scrollHeight
  }

  const isConfirmation = (text: string): boolean => {
    const n = normalizeSpanish(text)
    return /^(s[ií]|confirmar|confirmado|hazlo|aplicar|adelante|dale|ok|proceder|ejecutar|autorizar|claro|por\s*favor|acepto|va|venga)$/i.test(n)
  }

  const isCancellation = (text: string): boolean => {
    const n = normalizeSpanish(text)
    return /^(no|cancelar|cancela|cancelado|descarta|descartar|rechazar|abortar|detener|para|detente)$/i.test(n)
  }

  const send = (rawText?: string): void => {
    const currentVal = rawText ?? input.value
    const text = currentVal.trim()
    if (!text) return

    append(`Tú: ${text}`, 'user')
    input.value = ''
    updateAmorosoUi('')

    // Verificar si hay una propuesta pendiente y el usuario responde por texto
    if (activeProposalActions) {
      if (isConfirmation(text)) {
        activeProposalActions.querySelector<HTMLButtonElement>('.chat-preview__apply')?.click()
        return
      }
      if (isCancellation(text)) {
        activeProposalActions.querySelector<HTMLButtonElement>('.chat-preview__cancel')?.click()
        return
      }
      // Si escribió una nueva orden, descartar los botones de la propuesta anterior
      activeProposalActions.remove()
      activeProposalActions = null
    }

    // Procesar con AIChatService si está presente
    if (options.service) {
      void options.service.processNaturalLanguage(text).then((reply) => {
        if (reply.kind === 'preview' && reply.preview) {
          appendPreview({ kind: 'preview', preview: reply.preview, sticker: reply.sticker })
        } else if (reply.kind === 'clarify' && reply.clarify) {
          append(`ASTRO: ${reply.clarify.pregunta}`, 'ia', reply.sticker)
        } else {
          append(`ASTRO: ${reply.mensaje ?? ''}`, 'ia', reply.sticker)
        }
      })
      return
    }

    // Fallback con BrainSession
    if (options.session) {
      void options.session.submitSmart(text).then((reply) => {
        if (reply.kind === 'preview') {
          appendPreview(reply)
        } else if (reply.kind === 'clarify') {
          append(`ASTRO: ${reply.clarify.pregunta}`, 'ia', reply.sticker)
        } else {
          append(`ASTRO: ${reply.mensaje}`, 'ia', reply.sticker)
        }
      })
    }
  }

  input.addEventListener('input', () => updateAmorosoUi(input.value))
  sendBtn.addEventListener('click', () => send())
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') send()
  })

  container.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach((chip) => {
    chip.addEventListener('click', () => send(chip.dataset.prompt ?? ''))
  })

  container.querySelector('[data-chat-action="clear"]')?.addEventListener('click', () => {
    messages.innerHTML = ''
    activeProposalActions = null
    options.service?.cancelProposal()
    options.session?.cancel()
    append('ASTRO: Conversación reiniciada. ¿En qué proyecto arquitectónico trabajamos hoy?', 'ia')
  })
}
