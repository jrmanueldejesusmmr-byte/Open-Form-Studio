import { icon } from './icons'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastOptions {
  title: string
  subtitle?: string
  type?: ToastType
  durationMs?: number
}

let containerEl: HTMLElement | null = null

function ensureToastContainer(): HTMLElement {
  if (containerEl && document.body.contains(containerEl)) return containerEl
  containerEl = document.createElement('div')
  containerEl.id = 'arq-toast-container'
  containerEl.className = 'arq-toast-container'
  containerEl.setAttribute('aria-live', 'polite')
  document.body.appendChild(containerEl)
  return containerEl
}

/**
 * Muestra una notificación flotante moderna (Toast) sin bloquear la interfaz.
 */
export function showToast(options: ToastOptions | string): void {
  if (typeof document === 'undefined') return
  const opts: ToastOptions = typeof options === 'string' ? { title: options } : options
  const type: ToastType = opts.type ?? 'success'
  const durationMs = opts.durationMs ?? 3400

  const root = ensureToastContainer()
  const toast = document.createElement('div')
  toast.className = `arq-toast arq-toast--${type}`

  const iconMarkup =
    type === 'error'
      ? icon('alert', 18)
      : type === 'info'
        ? icon('info', 18)
        : icon('checkCircle', 18)

  const iconBadge = document.createElement('div')
  iconBadge.className = 'arq-toast__icon'
  iconBadge.innerHTML = iconMarkup

  const body = document.createElement('div')
  body.className = 'arq-toast__body'

  const titleEl = document.createElement('div')
  titleEl.className = 'arq-toast__title'
  titleEl.textContent = opts.title
  body.appendChild(titleEl)

  if (opts.subtitle) {
    const subEl = document.createElement('div')
    subEl.className = 'arq-toast__subtitle'
    subEl.textContent = opts.subtitle
    body.appendChild(subEl)
  }

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'arq-toast__close'
  closeBtn.setAttribute('aria-label', 'Cerrar notificación')
  closeBtn.innerHTML = icon('close', 14)

  let dismissed = false
  const dismiss = (): void => {
    if (dismissed) return
    dismissed = true
    toast.classList.add('is-leaving')
    setTimeout(() => {
      toast.remove()
    }, 220)
  }

  closeBtn.addEventListener('click', dismiss)

  toast.append(iconBadge, body, closeBtn)
  root.appendChild(toast)

  requestAnimationFrame(() => {
    toast.classList.add('is-visible')
  })

  if (durationMs > 0) {
    setTimeout(dismiss, durationMs)
  }
}

