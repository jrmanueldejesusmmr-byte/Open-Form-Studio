import type { BrainSession, BrainReply } from '../ai/brain/session'
import { STICKERS, stickerHTML, stickerSVG, type StickerId } from '../ai/brain/stickers'
import { icon } from './icons'

/**
 * Panel "Chat de IA" del lateral derecho. En la Fase 2 está conectado al
 * **cerebro local** (`BrainSession`), que interpreta órdenes en español y
 * devuelve una vista previa con botones **Aplicar** y **Cancelar** antes de
 * tocar la escena. Gemini (Fase 3) llegará después sin cambiar este contrato.
 */
export interface AIChatPanelOptions {
  session: BrainSession
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
  container.innerHTML = `
    <header class="panel__head">
      <span class="panel__title">${icon('astro', 14)} Chat de IA · Astro</span>
      <div class="panel__icons">
        <button class="icon-btn" data-chat-action="clear" title="Limpiar conversación">${icon('trash', 14)}</button>
        <button class="icon-btn" data-panel-close title="Cerrar chat de IA">${icon('close', 14)}</button>
      </div>
    </header>
    <div class="chat panel__body panel__body--flush">
      <div class="chat__messages" id="chat-messages">
        <div class="chat-card">
          <p class="chat-card__intro">¡Hola! Soy <strong>Astro</strong>, tu asistente de IA. Puedo ayudarte con:</p>
          <ul class="chat-card__list">
            ${options.welcome.map((line) => `<li>${line}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="chat__prompts">
        <span class="chat__prompts-title">Preguntas:</span>
        <div class="chat-chips">
          ${options.prompts
            .map((prompt) => `<button class="chip" data-prompt="${escapeAttr(prompt.command)}">${prompt.label}</button>`)
            .join('')}
        </div>
      </div>
      <div class="chat__input-row" id="chat-input-row">
        <span class="chat__amoroso-badge" id="chat-amoroso-badge" style="display:none;" title="Modo cariñoso activo">❤️</span>
        <input id="chat-input" type="text" placeholder="Escribe lo que necesitas… (/ para modo cariñoso)" />
        <button id="chat-send" class="chat__send" title="Enviar a la IA">${icon('send', 15)}</button>
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

  /** Sticker SVG accesible para la burbuja de Astro (modo amoroso). */
  const stickerSpan = (id: StickerId): HTMLSpanElement => {
    const span = document.createElement('span')
    span.className = 'chat-sticker'
    span.setAttribute('role', 'img')
    span.setAttribute('aria-label', STICKERS[id].alt)
    span.innerHTML = stickerSVG(id)
    return span
  }

  /** Lluvia de corazones breve (~1.5 s, 12 partículas CSS, sin bloquear clicks). */
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
    const bubble = document.createElement('p')
    bubble.className = `chat-msg chat-msg--${sender}`
    bubble.textContent = text
    if (sticker) {
      bubble.appendChild(stickerSpan(sticker))
      if (sticker === 'lluvia-corazones') spawnLluviaCorazones()
    }
    messages.appendChild(bubble)
    messages.scrollTop = messages.scrollHeight
  }

  /** Vista previa con los pasos del dry-run y botones Aplicar / Cancelar. */
  const appendPreview = (reply: Extract<BrainReply, { kind: 'preview' }>): void => {
    const p = reply.preview
    const card = document.createElement('div')
    card.className = 'chat-card chat-preview'
    const steps = p.pasos
      .map((s) => `<li class="${s.valido ? '' : 'chat-preview__step--bad'}">${s.valido ? '✓' : '✕'} ${s.herramienta}: ${escapeAttr(s.resumen)}</li>`)
      .join('')
    const avisos = p.avisos.length ? `<p class="chat-preview__warn">${p.avisos.map(escapeAttr).join(' · ')}</p>` : ''
    const sticker = reply.sticker ? `<p class="chat-preview__sticker">${stickerHTML(reply.sticker)}</p>` : ''
    card.innerHTML = `
      <p class="chat-card__intro"><strong>${escapeAttr(p.titulo)}</strong></p>
      <p class="chat-preview__resumen">${escapeAttr(p.resumen)}</p>
      ${sticker}
      <ul class="chat-preview__steps">${steps}</ul>
      ${avisos}
      <div class="chat-preview__actions">
        <button class="btn btn--primary chat-preview__apply" ${p.valido ? '' : 'disabled'}>Aplicar</button>
        <button class="btn btn--secondary chat-preview__cancel">Cancelar</button>
      </div>
    `
    const actions = card.querySelector<HTMLDivElement>('.chat-preview__actions')!
    const applyBtn = card.querySelector<HTMLButtonElement>('.chat-preview__apply')!
    applyBtn.addEventListener('click', () => {
      const res = options.session.apply()
      append(`IA: ${res.ok ? '✅ ' : '⚠️ '}${res.mensaje}`, 'ia', res.sticker)
      if (res.ok) options.onApplied?.(res.mensaje)
      actions.remove()
    })
    card.querySelector<HTMLButtonElement>('.chat-preview__cancel')!.addEventListener('click', () => {
      options.session.cancel()
      append('IA: Operación cancelada. No se ha modificado la escena.', 'ia')
      actions.remove()
    })
    messages.appendChild(card)
    messages.scrollTop = messages.scrollHeight
  }

  const send = (rawText?: string): void => {
    const currentVal = rawText ?? input.value
    const text = currentVal.trim()
    if (!text) return

    append(`Tú: ${text}`, 'user')

    // Actualizamos el indicador visual inmediatamente al enviar
    input.value = ''
    updateAmorosoUi('')

    // Fase 3: `submitSmart` usa Gemini (function calling) si está activado en el
    // panel F10 y, si Gemini falla o no hay, cae sin ruido al cerebro local.
    void options.session.submitSmart(text).then((reply) => {
      if (reply.kind === 'preview') {
        appendPreview(reply)
      } else if (reply.kind === 'clarify') {
        append(`IA: ${reply.clarify.pregunta}`, 'ia', reply.sticker)
      } else {
        append(`IA: ${reply.mensaje}`, 'ia', reply.sticker)
      }
    })
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
    append('Conversación reiniciada. ¿En qué trabajamos?', 'ia')
  })

  container.querySelector('[data-chat-action="minimize"]')?.addEventListener('click', () => {
    container.classList.toggle('is-collapsed')
  })
}
