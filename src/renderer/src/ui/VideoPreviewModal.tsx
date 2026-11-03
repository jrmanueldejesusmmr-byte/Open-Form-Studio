import {
  formatRecordingDuration,
  type CanvasRecordedVideo,
  type CanvasRecorderExportResult
} from '../animation/CanvasRecorder'
import { icon } from './icons'

export interface VideoPreviewModalOptions {
  video: CanvasRecordedVideo
  onDownload: () => Promise<CanvasRecorderExportResult | void> | CanvasRecorderExportResult | void
  onDiscard: () => void
  onClose?: () => void
  onNewRecording?: () => void
}

export interface VideoPreviewModalController {
  open: (options: VideoPreviewModalOptions) => void
  close: () => void
  minimize: () => void
  restore: () => void
  isOpen: () => boolean
  isMinimized: () => boolean
  getCurrentVideo: () => CanvasRecordedVideo | null
  destroy: () => void
}

/**
 * Formatea el tamaño en bytes a KB o MB legibles.
 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Monta el modal moderno de previsualización y reproductor de video HTML5.
 * Admite modo modal completo con backdrop-blur y modo dock flotante minimizado (Picture-in-Picture).
 */
export function mountVideoPreviewModal(
  parentContainer?: HTMLElement | null
): VideoPreviewModalController {
  const root = parentContainer ?? document.body
  let overlayEl: HTMLDivElement | null = null
  let currentOptions: VideoPreviewModalOptions | null = null
  let isMin = false
  let isDownloading = false

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!overlayEl || overlayEl.classList.contains('is-hidden')) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (isMin) {
        close()
      } else {
        minimize()
      }
    }
  }

  function ensureElements(): HTMLDivElement {
    if (overlayEl && overlayEl.parentElement) {
      return overlayEl
    }

    const overlay = document.createElement('div')
    overlay.className = 'video-preview-overlay is-hidden'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Previsualización de video grabado')

    root.appendChild(overlay)
    overlayEl = overlay

    document.addEventListener('keydown', handleKeyDown, true)
    return overlay
  }

  function render(): void {
    if (!overlayEl || !currentOptions) return
    const { video } = currentOptions
    const durationText = formatRecordingDuration(video.durationSeconds)
    const sizeText = formatByteSize(video.byteLength)

    overlayEl.className = `video-preview-overlay${isMin ? ' is-minimized' : ''}`
    overlayEl.innerHTML = `
      <div class="video-preview-backdrop" data-preview-action="backdrop"></div>
      <div class="video-preview-card${isMin ? ' is-minimized' : ''}" data-preview-card>
        <!-- Encabezado de la ventana -->
        <header class="video-preview-header">
          <div class="video-preview-header-left">
            <span class="video-preview-badge-icon" aria-hidden="true">${icon('video', 16)}</span>
            <div class="video-preview-titles">
              <h2 class="video-preview-title">${isMin ? 'Grabación lista' : 'Vista previa de grabación'}</h2>
              <p class="video-preview-subtitle">${video.fileName} · ${durationText} · ${sizeText}</p>
            </div>
          </div>
          <div class="video-preview-header-actions">
            ${
              isMin
                ? `<button type="button" class="video-preview-icon-btn" data-preview-action="restore" title="Restaurar a tamaño completo" aria-label="Restaurar">
                     ${icon('maximize2', 15)}
                   </button>`
                : `<button type="button" class="video-preview-icon-btn" data-preview-action="minimize" title="Minimizar a dock flotante (seguir editando en 3D)" aria-label="Minimizar">
                     ${icon('minimize2', 15)}
                   </button>`
            }
            <button type="button" class="video-preview-icon-btn video-preview-icon-btn--close" data-preview-action="close" title="Cerrar y conservar en memoria" aria-label="Cerrar">
              ${icon('close', 15)}
            </button>
          </div>
        </header>

        <!-- Reproductor de video HTML5 -->
        <div class="video-preview-viewport" data-preview-viewport>
          <video
            class="video-preview-player"
            data-preview-video
            controls
            autoplay
            loop
            playsinline
            src="${video.objectUrl}">
            Tu visor no soporta reproducción directa de video HTML5 WebM.
          </video>
          ${
            isMin
              ? `<div class="video-preview-mini-overlay" data-preview-action="restore" title="Haz clic para restaurar y descargar">
                   <span class="video-preview-mini-pill">${icon('maximize2', 12)} Expandir (${durationText})</span>
                 </div>`
              : ''
          }
        </div>

        <!-- Metadatos y badges (solo en tamaño completo) -->
        ${
          !isMin
            ? `<div class="video-preview-meta-row">
                 <span class="video-preview-tag">
                   <strong class="video-preview-tag-label">Formato:</strong> WebM (VP9 / VP8)
                 </span>
                 <span class="video-preview-tag">
                   <strong class="video-preview-tag-label">Duración:</strong> ${durationText}
                 </span>
                 <span class="video-preview-tag">
                   <strong class="video-preview-tag-label">Tamaño:</strong> ${sizeText}
                 </span>
                 <span class="video-preview-tag">
                   <strong class="video-preview-tag-label">Calidad:</strong> 60 FPS · 8 Mbps CAD
                 </span>
               </div>`
            : ''
        }

        <!-- Barra inferior de acciones -->
        <footer class="video-preview-footer${isMin ? ' is-minimized' : ''}">
          ${
            !isMin
              ? `<div class="video-preview-footer-left">
                   <button type="button" class="video-btn video-btn--danger-ghost" data-preview-action="discard" title="Descartar clip y limpiar memoria">
                     <span class="video-btn-icon">${icon('trash', 14)}</span>
                     <span>Descartar / Nueva grabación</span>
                   </button>
                 </div>
                 <div class="video-preview-footer-right">
                   <button type="button" class="video-btn video-btn--secondary" data-preview-action="close" title="Ocultar ventana y continuar editando en 3D">
                     <span>Cerrar y seguir editando</span>
                   </button>
                   <button type="button" class="video-btn video-btn--primary" data-preview-action="download" ${isDownloading ? 'disabled' : ''}>
                     <span class="video-btn-icon">${icon('download', 16)}</span>
                     <span data-download-text>${isDownloading ? 'Guardando video…' : 'Descargar video .webm'}</span>
                   </button>
                 </div>`
              : `<div class="video-preview-mini-bar">
                   <button type="button" class="video-btn video-btn--primary video-btn--sm" data-preview-action="download" ${isDownloading ? 'disabled' : ''}>
                     <span class="video-btn-icon">${icon('download', 14)}</span>
                     <span>${isDownloading ? 'Guardando…' : 'Descargar'}</span>
                   </button>
                   <button type="button" class="video-btn video-btn--secondary video-btn--sm" data-preview-action="restore">
                     <span>Expandir</span>
                   </button>
                 </div>`
          }
        </footer>
      </div>
    `

    bindEvents()
  }

  function bindEvents(): void {
    if (!overlayEl || !currentOptions) return

    // Backdrop click solo cierra o minimiza si está en modo completo
    const backdrop = overlayEl.querySelector<HTMLElement>('[data-preview-action="backdrop"]')
    backdrop?.addEventListener('click', () => {
      if (!isMin) {
        minimize()
      }
    })

    // Botones de acción
    overlayEl.querySelectorAll<HTMLElement>('[data-preview-action]').forEach((el) => {
      el.addEventListener('click', (event) => {
        const action = el.dataset.previewAction
        if (!action || action === 'backdrop') return
        event.stopPropagation()

        if (action === 'minimize') {
          minimize()
        } else if (action === 'restore') {
          restore()
        } else if (action === 'close') {
          close()
        } else if (action === 'discard') {
          discard()
        } else if (action === 'download') {
          void triggerDownload()
        }
      })
    })

    // En modo minimizado, hacer clic en la tarjeta restaura la ventana
    const card = overlayEl.querySelector<HTMLElement>('[data-preview-card]')
    card?.addEventListener('click', (event) => {
      if (!isMin) return
      // No disparar si se hizo clic en un botón interno
      const target = event.target as HTMLElement | null
      if (target?.closest('button') || target?.closest('[data-preview-action]')) return
      restore()
    })
  }

  async function triggerDownload(): Promise<void> {
    if (isDownloading || !currentOptions) return
    isDownloading = true
    render()

    try {
      await currentOptions.onDownload()
    } finally {
      isDownloading = false
      render()
    }
  }

  function discard(): void {
    const opts = currentOptions
    close()
    opts?.onDiscard()
    opts?.onNewRecording?.()
  }

  function open(options: VideoPreviewModalOptions): void {
    currentOptions = options
    isMin = false
    isDownloading = false
    const overlay = ensureElements()
    overlay.classList.remove('is-hidden')
    render()
  }

  function close(): void {
    if (!overlayEl) return
    overlayEl.classList.add('is-hidden')
    // Pausar video para no consumir GPU en segundo plano
    const vid = overlayEl.querySelector<HTMLVideoElement>('[data-preview-video]')
    if (vid) {
      vid.pause()
    }
    currentOptions?.onClose?.()
  }

  function minimize(): void {
    if (!overlayEl || isMin) return
    isMin = true
    render()
  }

  function restore(): void {
    if (!overlayEl || !isMin) return
    isMin = false
    render()
  }

  function isOpen(): boolean {
    return Boolean(overlayEl && !overlayEl.classList.contains('is-hidden'))
  }

  function isMinimized(): boolean {
    return isOpen() && isMin
  }

  function getCurrentVideo(): CanvasRecordedVideo | null {
    return currentOptions?.video ?? null
  }

  function destroy(): void {
    document.removeEventListener('keydown', handleKeyDown, true)
    if (overlayEl && overlayEl.parentElement) {
      overlayEl.parentElement.removeChild(overlayEl)
    }
    overlayEl = null
    currentOptions = null
  }

  return {
    open,
    close,
    minimize,
    restore,
    isOpen,
    isMinimized,
    getCurrentVideo,
    destroy
  }
}

/**
 * Función auxiliar para abrir directamente la previsualización modal.
 */
export function openVideoPreviewModal(
  options: VideoPreviewModalOptions,
  container?: HTMLElement | null
): VideoPreviewModalController {
  const controller = mountVideoPreviewModal(container)
  controller.open(options)
  return controller
}

