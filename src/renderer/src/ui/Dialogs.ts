import { icon } from './icons'
import { createLocalId, type ProjectMode, type ScanData, type ScanImageData } from '../models/DashboardProject'
import { generateRoomCode } from '../services/CollaborationService'

/**
 * Diálogos propios de la aplicación (nombre de proyecto, confirmaciones y
 * modal interactivo de creación de proyecto con módulo de escaneo 3D / fotogrametría).
 */

export interface NameDialogOptions {
  title: string
  label: string
  value?: string
  confirmLabel?: string
}

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmLabel?: string
  /** `null` oculta el botón de cancelar (aviso de un solo botón). */
  cancelLabel?: string | null
  danger?: boolean
}

export interface NewProjectDialogOptions {
  title?: string
  suggestedName?: string
}

/** Mínimo de fotos para fotogrametría */
export const MIN_PHOTOS = 20

export interface NewProjectResult {
  name: string
  mode: ProjectMode
  method: 'blank' | 'scan'
  scanData?: ScanData | null
  collaborationEnabled?: boolean
  roomCode?: string | null
  role?: 'owner' | 'editor' | 'viewer'
}

export interface DialogsHandle {
  /** Pide un texto. Resuelve con el valor o `null` si se cancela. */
  promptName(options: NameDialogOptions): Promise<string | null>
  /** Confirmación. Resuelve `true` solo si se pulsa el botón principal. */
  confirm(options: ConfirmDialogOptions): Promise<boolean>
  /** Modal de creación de proyecto con selector de métodos y escaneo 3D. */
  promptNewProject(options?: NewProjectDialogOptions): Promise<NewProjectResult | null>
  isOpen(): boolean
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return map[char] ?? char
  })
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;')
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

export function mountDialogs(container: HTMLElement): DialogsHandle {
  let settle: ((value: unknown) => void) | null = null
  let activeStream: MediaStream | null = null

  container.classList.add('is-hidden')

  function stopActiveStream(): void {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop())
      activeStream = null
    }
  }

  function close(value: unknown): void {
    stopActiveStream()
    container.classList.add('is-hidden')
    container.innerHTML = ''
    const resolve = settle
    settle = null
    resolve?.(value)
  }

  function isOpen(): boolean {
    return !container.classList.contains('is-hidden')
  }

  interface RenderBasicOptions {
    title: string
    message?: string
    label?: string
    value?: string
    confirmLabel: string
    cancelLabel: string | null
    danger?: boolean
  }

  function renderBasic(options: RenderBasicOptions): void {
    if (isOpen()) close(null)
    container.classList.remove('is-hidden')
    container.innerHTML = `
      <div class="dialog">
        <div class="dialog__backdrop" data-dialog-cancel></div>
        <div class="dialog__card" role="dialog" aria-modal="true">
          <h2 class="dialog__title">${options.title}</h2>
          ${options.message ? `<p class="dialog__message">${options.message}</p>` : ''}
          ${
            options.label
              ? `<label class="dialog__field">
                   <span class="dialog__label">${options.label}</span>
                   <input class="dialog__input" type="text" data-dialog-input value="${escapeAttribute(options.value ?? '')}" />
                 </label>`
              : ''
          }
          <div class="dialog__actions">
            ${
              options.cancelLabel
                ? `<button class="dialog__button" type="button" data-dialog-cancel>${options.cancelLabel}</button>`
                : ''
            }
            <button class="dialog__button ${options.danger ? 'dialog__button--danger' : 'dialog__button--primary'}" type="button" data-dialog-confirm>
              ${options.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `

    const input = container.querySelector<HTMLInputElement>('[data-dialog-input]')
    const accept = (): void => close(input ? input.value : true)
    const cancel = (): void => close(input ? null : false)

    container.querySelectorAll('[data-dialog-confirm]').forEach((button) => button.addEventListener('click', accept))
    container.querySelectorAll('[data-dialog-cancel]').forEach((button) => button.addEventListener('click', cancel))
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') accept()
    })

    try {
      input?.focus()
      input?.select()
    } catch {
      /* sin foco/selección disponible */
    }
  }

  function renderNewProjectModal(options?: NewProjectDialogOptions): void {
    if (isOpen()) close(null)
    container.classList.remove('is-hidden')

    const suggestedName = options?.suggestedName || `Proyecto ${new Date().toLocaleDateString('es-ES')}`
    let currentMethod: 'blank' | 'scan' = 'blank'
    let currentMode: ProjectMode = '3D'
    let activeScanTab: 'webcam' | 'phone' | 'files' = 'webcam'
    let collaborationEnabled = false
    let generatedRoomCode = generateRoomCode()
    const capturedImages: ScanImageData[] = []

    container.innerHTML = `
      <div class="dialog-overlay" role="dialog" aria-modal="true" data-dialog-close>
        <div class="dialog__backdrop" data-dialog-cancel></div>
        <div class="dialog__card dialog__card--new-project" role="dialog" aria-modal="true">
          
          <!-- Encabezado del Modal -->
          <div class="dialog__header">
            <div class="dialog__header-left">
              <span class="dialog__header-icon">${icon('cube', 18)}</span>
              <div>
                <h2 class="dialog__title">Crear nuevo proyecto</h2>
                <p class="dialog__subtitle">Selecciona el método de diseño o inicia mediante escaneo 3D fotogramétrico.</p>
              </div>
            </div>
            <button class="dialog__close-btn" type="button" data-dialog-cancel title="Cerrar">${icon('close', 14)}</button>
          </div>

          <div class="dialog__body">
            
            <!-- 1. Campo de texto: Nombre del proyecto -->
            <div class="dialog__section">
              <label class="dialog__field">
                <span class="dialog__label">Nombre del proyecto</span>
                <div class="dialog__input-wrap">
                  <span class="dialog__input-icon">${icon('folderOpen', 15)}</span>
                  <input class="dialog__input" type="text" data-project-name value="${escapeAttribute(suggestedName)}" placeholder="Ej: Vivienda Residencial Norte" />
                </div>
              </label>
            </div>

            <!-- 2. Modo de inicio: Selector de Métodos (Tarjetas) -->
            <div class="dialog__section">
              <span class="dialog__label">Método de creación</span>
              <div class="create-methods">
                <button class="create-method-card is-active" type="button" data-method="blank">
                  <div class="create-method-card__indicator"></div>
                  <div class="create-method-card__icon">${icon('cube', 20)}</div>
                  <div class="create-method-card__content">
                    <div class="create-method-card__title">Proyecto en blanco</div>
                    <div class="create-method-card__desc">Lienzo vacío estándar para modelar muros, acabados y plantas desde cero.</div>
                  </div>
                </button>

                <button class="create-method-card" type="button" data-method="scan">
                  <div class="create-method-card__indicator"></div>
                  <div class="create-method-card__icon create-method-card__icon--scan">${icon('camera', 20)}</div>
                  <div class="create-method-card__content">
                    <div class="create-method-card__title">Escaneo 3D / Fotogrametría</div>
                    <div class="create-method-card__desc">Genera el modelo 3D escaneando una casa o habitación real mediante captura fotográfica.</div>
                    <span class="create-method-card__badge">Nuevo · Fotogrametría</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- 3A. Vista: Proyecto en Blanco -->
            <div class="method-view method-view--blank" data-view-blank>
              <span class="dialog__label">Modo inicial de vista</span>
              <div class="mode-select-grid">
                <label class="mode-option is-active" data-mode-card="3D">
                  <input type="radio" name="project_mode" value="3D" checked class="is-hidden" />
                  <div class="mode-option__box">
                    <div class="mode-option__icon">${icon('cube', 18)}</div>
                    <div class="mode-option__text">
                      <span class="mode-option__title">Espacio 3D</span>
                      <span class="mode-option__desc">Entorno tridimensional volumétrico con cámara orbital y renderizado en tiempo real.</span>
                    </div>
                  </div>
                </label>

                <label class="mode-option" data-mode-card="2D">
                  <input type="radio" name="project_mode" value="2D" class="is-hidden" />
                  <div class="mode-option__box">
                    <div class="mode-option__icon">${icon('plan2d', 18)}</div>
                    <div class="mode-option__text">
                      <span class="mode-option__title">Plano Técnico 2D</span>
                      <span class="mode-option__desc">Vista ortogonal en planta para trazo de muros acotados y replanteo de superficies.</span>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <!-- 3B. Vista: Módulo de Escaneo 3D (Fotogrametría y Captura) -->
            <div class="method-view method-view--scan is-hidden" data-view-scan>
              <div class="scan-module">
                
                <!-- Columna Izquierda: Fuentes de Entrada y Captura -->
                <div class="scan-module__main">
                  
                  <!-- Tabs de Fuentes de Entrada -->
                  <div class="scan-sources-nav">
                    <button class="scan-source-tab is-active" type="button" data-scan-tab="webcam">
                      ${icon('camera', 15)}<span>Cámara USB / WebCam</span>
                    </button>
                    <button class="scan-source-tab" type="button" data-scan-tab="phone">
                      ${icon('smartphone', 15)}<span>Teléfono por Cable USB</span>
                    </button>
                    <button class="scan-source-tab" type="button" data-scan-tab="files">
                      ${icon('upload', 15)}<span>Escáner / Archivos locales</span>
                    </button>
                  </div>

                  <!-- Tab 1: Cámara USB / WebCam en vivo -->
                  <div class="scan-tab-content scan-tab-content--webcam" data-scan-content="webcam">
                    <div class="camera-toolbar">
                      <div class="camera-select-wrap">
                        <span class="camera-select-icon">${icon('camera', 14)}</span>
                        <select class="camera-select" data-camera-select>
                          <option value="">Buscando cámaras conectadas...</option>
                        </select>
                      </div>
                      <button class="icon-btn" type="button" data-camera-refresh title="Actualizar dispositivos">${icon('refresh', 14)}</button>
                    </div>

                    <div class="webcam-viewport" data-webcam-viewport>
                      <video class="webcam-video" autoplay playsinline muted data-webcam-video></video>
                      <div class="webcam-overlay">
                        <div class="webcam-crosshair">${icon('crosshair', 26)}</div>
                        <div class="webcam-badge"><span class="webcam-badge-dot"></span> EN VIVO</div>
                      </div>
                      <div class="webcam-placeholder is-hidden" data-webcam-placeholder>
                        ${icon('camera', 36)}
                        <p>No se pudo activar la cámara USB. Revisa permisos o conecta un dispositivo.</p>
                      </div>
                    </div>

                    <div class="webcam-controls">
                      <button class="scan-action-btn scan-action-btn--snap" type="button" data-snap-photo>
                        ${icon('camera', 16)}<span>Tomar foto individual</span>
                      </button>
                      <button class="scan-action-btn scan-action-btn--burst" type="button" data-snap-burst>
                        ${icon('zap', 16)}<span>Ráfaga (5 fotos)</span>
                      </button>
                    </div>
                  </div>

                  <!-- Tab 2: Carga desde Teléfono / Dispositivo USB -->
                  <div class="scan-tab-content scan-tab-content--phone is-hidden" data-scan-content="phone">
                    <div class="scan-dropzone" data-phone-dropzone>
                      <div class="scan-dropzone__icon">${icon('smartphone', 36)}</div>
                      <h4 class="scan-dropzone__title">Carga desde teléfono conectado por cable USB</h4>
                      <p class="scan-dropzone__desc">Conecta tu teléfono mediante cable USB (en modo Transferencia de fotos/MTP) e importa las fotografías tomadas en el espacio.</p>
                      <label class="scan-file-btn">
                        ${icon('upload', 16)}<span>Seleccionar fotos del dispositivo</span>
                        <input type="file" multiple accept="image/*" class="is-hidden" data-phone-input />
                      </label>
                    </div>
                  </div>

                  <!-- Tab 3: Escáner / Archivos locales -->
                  <div class="scan-tab-content scan-tab-content--files is-hidden" data-scan-content="files">
                    <div class="scan-dropzone" data-files-dropzone>
                      <div class="scan-dropzone__icon">${icon('upload', 36)}</div>
                      <h4 class="scan-dropzone__title">Importar archivos de imagen o carpeta</h4>
                      <p class="scan-dropzone__desc">Arrastra y suelta imágenes JPG/PNG o selecciona un lote desde tu disco local o escáner.</p>
                      <div class="scan-dropzone__actions">
                        <label class="scan-file-btn">
                          ${icon('image', 16)}<span>Seleccionar imágenes</span>
                          <input type="file" multiple accept="image/*" class="is-hidden" data-files-input />
                        </label>
                        <label class="scan-file-btn scan-file-btn--secondary">
                          ${icon('folderOpen', 16)}<span>Importar carpeta</span>
                          <input type="file" multiple webkitdirectory class="is-hidden" data-folder-input />
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Galería de Miniaturas de Imágenes Capturadas -->
                  <div class="captured-gallery-wrap">
                    <div class="captured-gallery-header">
                      <span class="captured-gallery-title">Lote de capturas (<span data-images-count>0</span> fotos)</span>
                      <button class="captured-clear-btn is-hidden" type="button" data-clear-images>Vaciar lote</button>
                    </div>
                    <div class="captured-gallery-grid" data-gallery-grid>
                      <div class="gallery-empty-hint">Aún no hay fotos añadidas. Captura con la cámara o importa archivos para comenzar.</div>
                    </div>
                  </div>

                </div>

                <!-- Columna Derecha: Asistente Guiado de Fotogrametría -->
                <div class="scan-module__sidebar">
                  <div class="scan-guide-card">
                    <div class="scan-guide-header">
                      <span class="scan-guide-icon">${icon('sparkles', 16)}</span>
                      <h4 class="scan-guide-title">Asistente de Fotogrametría</h4>
                    </div>
                    
                    <div class="scan-guide-tip">
                      <div class="scan-guide-tip__icon">💡</div>
                      <p class="scan-guide-tip__text">
                        <strong>Recomendación visual:</strong> Toma fotografías desde múltiples ángulos (360°), manteniendo solapamiento (60-80%) entre tomas (mínimo 15-20 imágenes) y buena iluminación.
                      </p>
                    </div>

                    <!-- Contador y barra de progreso -->
                    <div class="scan-progress-box">
                      <div class="scan-progress-labels">
                        <span class="scan-progress-count"><strong data-progress-current>0</strong> / 20 fotos mínimas</span>
                        <span class="scan-progress-status" data-progress-status>Insuficientes</span>
                      </div>
                      <div class="scan-progress-bar">
                        <div class="scan-progress-fill" data-progress-fill style="width: 0%;"></div>
                      </div>
                    </div>

                    <!-- Checklist de requisitos -->
                    <ul class="scan-checklist">
                      <li class="scan-checklist-item" data-rule="overlap">
                        <span class="scan-check-icon">${icon('check', 13)}</span>
                        <span>Solapamiento visual entre capturas</span>
                      </li>
                      <li class="scan-checklist-item" data-rule="lighting">
                        <span class="scan-check-icon">${icon('check', 13)}</span>
                        <span>Iluminación uniforme sin contraluces</span>
                      </li>
                      <li class="scan-checklist-item" data-rule="angles">
                        <span class="scan-check-icon">${icon('check', 13)}</span>
                        <span>Cobertura 360° en distintos niveles</span>
                      </li>
                      <li class="scan-checklist-item is-met" data-rule="count">
                        <span class="scan-check-icon">${icon('check', 13)}</span>
                        <span>Mínimo recomendado: 15 a 20 imágenes</span>
                      </li>
                    </ul>
                  </div>
                </div>

              </div>
            </div>

            <!-- 4. Configuración de Servidor de Colaboración en Equipo -->
            <div class="dialog__section">
              <span class="dialog__label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Servidor y trabajo en equipo</span>
              <div class="collab-mode-grid grid grid-cols-2 gap-3" role="radiogroup" aria-label="Servidor y trabajo en equipo">
                <!-- Tarjeta 1: Modo Local / Individual -->
                <button
                  type="button"
                  class="collab-choice-card is-active flex items-start gap-3 p-3.5 rounded-xl border border-blue-500 bg-blue-500/10 text-left transition-all cursor-pointer relative"
                  data-collab-toggle="no"
                  role="radio"
                  aria-checked="true"
                >
                  <div class="collab-choice-card__icon inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 text-white shrink-0 mt-0.5">
                    ${icon('user', 18)}
                  </div>
                  <div class="collab-choice-card__text flex flex-col gap-1 min-w-0">
                    <span class="font-bold text-slate-100 text-sm">Modo Local / Individual</span>
                    <span class="text-xs text-slate-400 leading-snug">Trabajo sin conexión en almacenamiento local (SQLite).</span>
                  </div>
                </button>

                <!-- Tarjeta 2: Servidor Colaborativo -->
                <button
                  type="button"
                  class="collab-choice-card flex items-start gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-800/40 hover:border-slate-700 text-left transition-all cursor-pointer relative"
                  data-collab-toggle="yes"
                  role="radio"
                  aria-checked="false"
                >
                  <div class="collab-choice-card__icon inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 text-slate-400 shrink-0 mt-0.5">
                    ${icon('users', 18)}
                  </div>
                  <div class="collab-choice-card__text flex flex-col gap-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-slate-100 text-sm">Servidor Colaborativo</span>
                      <span class="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">Realtime</span>
                    </div>
                    <span class="text-xs text-slate-400 leading-snug">Genera un código de sala único (ARQ-XXXX) para invitar a tu equipo con chat y sincronización en vivo.</span>
                  </div>
                </button>
              </div>

              <!-- Detalles de Sala cuando está activo el Servidor Colaborativo -->
              <div class="collab-setup-card__details is-hidden mt-3" data-collab-details>
                <div class="collab-room-preview flex items-center justify-between p-3 rounded-xl bg-slate-900/95 border border-slate-800">
                  <div class="collab-room-preview__left flex flex-col gap-1">
                    <span class="text-[10px] font-semibold tracking-wider uppercase text-slate-400">CÓDIGO DE SERVIDOR / SALA ÚNICO</span>
                    <div class="flex items-center gap-2">
                      <span class="text-base font-mono font-bold tracking-wider text-blue-400 bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-800/60" data-collab-code>${generatedRoomCode}</span>
                      <button type="button" class="collab-room-preview__regen p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition" data-collab-regen title="Generar nuevo código">
                        ${icon('refresh', 13)}
                      </button>
                    </div>
                  </div>
                  <div class="collab-room-preview__right flex flex-col gap-1.5 items-end">
                    <span class="collab-owner-pill inline-flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">${icon('shield', 13)} Rol asignado: <strong class="text-blue-400">Anfitrión (owner)</strong></span>
                    <span class="collab-sync-pill inline-flex items-center gap-1.5 text-[11px] text-emerald-400">● Sincronización Supabase Realtime activa</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Acciones del Modal -->
          <div class="dialog__actions">
            <button class="dialog__button" type="button" data-dialog-cancel>Cancelar</button>
            <button class="dialog__button dialog__button--primary" type="button" data-dialog-submit>
              <span data-submit-label>Crear y abrir</span>
            </button>
            <span class="dialog__button__reason" data-submit-reason hidden></span>
          </div>

        </div>
      </div>
    `

    const nameInput = container.querySelector<HTMLInputElement>('[data-project-name]')
    const submitLabel = container.querySelector<HTMLElement>('[data-submit-label]')
    const viewBlank = container.querySelector<HTMLElement>('[data-view-blank]')
    const viewScan = container.querySelector<HTMLElement>('[data-view-scan]')
    const galleryGrid = container.querySelector<HTMLElement>('[data-gallery-grid]')
    const imagesCountEl = container.querySelector<HTMLElement>('[data-images-count]')
    const clearImagesBtn = container.querySelector<HTMLButtonElement>('[data-clear-images]')
    const progressCurrent = container.querySelector<HTMLElement>('[data-progress-current]')
    const progressStatus = container.querySelector<HTMLElement>('[data-progress-status]')
    const progressFill = container.querySelector<HTMLElement>('[data-progress-fill]')
    const ruleCount = container.querySelector<HTMLElement>('[data-rule="count"]')
    const videoEl = container.querySelector<HTMLVideoElement>('[data-webcam-video]')
    const videoPlaceholder = container.querySelector<HTMLElement>('[data-webcam-placeholder]')
    const cameraSelect = container.querySelector<HTMLSelectElement>('[data-camera-select]')

    function updateSubmitState(): void {
      if (submitLabel) {
        submitLabel.textContent = currentMethod === 'scan' ? 'Procesar Escaneo y Crear' : 'Crear y abrir'
      }
    }

    function updateButtonState(): void {
      const isScan = currentMethod === 'scan'
      const nameValue = nameInput?.value ?? ''
      const hasName = nameValue.trim().length > 0
      const hasMinPhotos = capturedImages.length >= MIN_PHOTOS
      const submitReason = container.querySelector<HTMLElement>('[data-submit-reason]')

      if (submitBtn) {
        // Reset styles first
        submitBtn.classList.remove('is-disabled')
        submitBtn.disabled = false
        if (submitReason) submitReason.classList.add('is-hidden')

        if (isScan && !hasMinPhotos) {
          // Modo escaneo: bloquear hasta tener 20 fotos
          submitBtn.disabled = true
          submitBtn.classList.add('is-disabled')
          submitReason!.textContent = `Añade al menos ${MIN_PHOTOS} fotos (te faltan ${MIN_PHOTOS - capturedImages.length})`
          submitReason!.classList.remove('is-hidden')
        } else if (!hasName) {
          // Nombre vacío: bloquear
          submitBtn.disabled = true
          submitBtn.classList.add('is-disabled')
          submitReason!.textContent = 'Introduce un nombre para el proyecto'
          submitReason!.classList.remove('is-hidden')
        } else {
          // Todo bien: desbloquear
          submitReason!.classList.add('is-hidden')
        }
      }
    }

    function updateProgressAndGallery(): void {
      const count = capturedImages.length
      if (imagesCountEl) imagesCountEl.textContent = String(count)
      if (progressCurrent) progressCurrent.textContent = String(count)
      if (clearImagesBtn) clearImagesBtn.classList.toggle('is-hidden', count === 0)

      const pct = Math.min(100, Math.round((count / 20) * 100))
      if (progressFill) {
        progressFill.style.width = `${pct}%`
        progressFill.classList.toggle('is-ready', count >= 20)
        progressFill.classList.toggle('is-warning', count >= 10 && count < 20)
      }

      if (progressStatus) {
        if (count === 0) {
          progressStatus.textContent = 'Sin capturas'
          progressStatus.className = 'scan-progress-status'
        } else if (count < 10) {
          progressStatus.textContent = 'Insuficientes'
          progressStatus.className = 'scan-progress-status is-danger'
        } else if (count < 20) {
          progressStatus.textContent = 'Aceptable (15-20)'
          progressStatus.className = 'scan-progress-status is-warning'
        } else {
          progressStatus.textContent = 'Óptimo para 3D'
          progressStatus.className = 'scan-progress-status is-ready'
        }
      }

      if (ruleCount) {
        ruleCount.classList.toggle('is-met', count >= 15)
      }

      if (galleryGrid) {
        if (count === 0) {
          galleryGrid.innerHTML = `<div class="gallery-empty-hint">Aún no hay fotos añadidas. Captura con la cámara o importa imágenes para comenzar.</div>`
        } else {
          galleryGrid.innerHTML = capturedImages
            .map(
              (img, idx) => `
              <div class="gallery-thumb" data-img-id="${img.id}">
                <img src="${img.previewUrl}" alt="${escapeAttribute(img.name)}" class="gallery-thumb__img" />
                <span class="gallery-thumb__badge">${img.source === 'webcam' ? 'Cámara' : img.source === 'phone_usb' ? 'USB' : 'Archivo'} #${idx + 1}</span>
                <button class="gallery-thumb__del" type="button" data-delete-img="${img.id}" title="Eliminar foto">${icon('trash', 12)}</button>
              </div>`
            )
            .join('')

          galleryGrid.querySelectorAll<HTMLButtonElement>('[data-delete-img]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation()
              const imgId = btn.dataset.deleteImg
              const index = capturedImages.findIndex((item) => item.id === imgId)
              if (index !== -1) {
                capturedImages.splice(index, 1)
                updateProgressAndGallery()
              }
            })
          })
        }
      }
    }

    async function startCamera(deviceId?: string): Promise<void> {
      stopActiveStream()
      if (!videoEl) return

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } }
        }
        activeStream = await navigator.mediaDevices.getUserMedia(constraints)
        videoEl.srcObject = activeStream
        videoPlaceholder?.classList.add('is-hidden')
        await videoEl.play()
      } catch (err) {
        console.warn('[ArqStudio] Error al iniciar cámara USB:', err)
        videoPlaceholder?.classList.remove('is-hidden')
      }
    }

    async function refreshCameras(): Promise<void> {
      if (!cameraSelect) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')

        if (videoInputs.length === 0) {
          cameraSelect.innerHTML = `<option value="">Cámara predeterminada del sistema</option>`
        } else {
          cameraSelect.innerHTML = videoInputs
            .map(
              (dev, i) =>
                `<option value="${dev.deviceId}">${dev.label || `Cámara USB / Dispositivo ${i + 1}`}</option>`
            )
            .join('')
        }

        const selectedId = cameraSelect.value || (videoInputs[0]?.deviceId ?? '')
        if (currentMethod === 'scan' && activeScanTab === 'webcam') {
          await startCamera(selectedId)
        }
      } catch {
        cameraSelect.innerHTML = `<option value="">Cámara del sistema</option>`
      }
    }

    function captureSinglePhoto(): void {
      if (!videoEl || videoEl.videoWidth === 0) return
      const canvas = document.createElement('canvas')
      canvas.width = videoEl.videoWidth
      canvas.height = videoEl.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(videoEl, 0, 0)
      const previewUrl = canvas.toDataURL('image/jpeg', 0.85)

      capturedImages.push({
        id: createLocalId(),
        name: `Foto_USB_${capturedImages.length + 1}.jpg`,
        previewUrl,
        timestamp: Date.now(),
        source: 'webcam'
      })

      // Efecto visual de flash en el visor
      const viewport = container.querySelector<HTMLElement>('[data-webcam-viewport]')
      if (viewport) {
        viewport.classList.add('is-flashing')
        setTimeout(() => viewport.classList.remove('is-flashing'), 180)
      }

      updateProgressAndGallery()
    }

    async function captureBurst(count = 5): Promise<void> {
      for (let i = 0; i < count; i++) {
        captureSinglePhoto()
        await new Promise((resolve) => setTimeout(resolve, 320))
      }
    }

    async function addFiles(fileList: FileList | File[], source: 'phone_usb' | 'local_file'): Promise<void> {
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp)$/i)) continue
        const previewUrl = await readFileAsDataUrl(file)
        if (previewUrl) {
          capturedImages.push({
            id: createLocalId(),
            name: file.name,
            previewUrl,
            timestamp: Date.now(),
            source
          })
        }
      }
      updateProgressAndGallery()
    }

    // Selector de métodos (En blanco vs Escaneo 3D)
    container.querySelectorAll<HTMLButtonElement>('[data-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.method as 'blank' | 'scan'
        currentMethod = method
        container.querySelectorAll('[data-method]').forEach((b) => b.classList.remove('is-active'))
        btn.classList.add('is-active')

        if (method === 'blank') {
          viewBlank?.classList.remove('is-hidden')
          viewScan?.classList.add('is-hidden')
          stopActiveStream()
        } else {
          viewBlank?.classList.add('is-hidden')
          viewScan?.classList.remove('is-hidden')
          if (activeScanTab === 'webcam') {
            void refreshCameras()
          }
        }
        updateSubmitState()
      })
    })

    // Selector de modo para proyectos en blanco (3D vs 2D)
    container.querySelectorAll<HTMLElement>('[data-mode-card]').forEach((card) => {
      card.addEventListener('click', () => {
        const mode = card.dataset.modeCard as ProjectMode
        currentMode = mode
        container.querySelectorAll('[data-mode-card]').forEach((c) => c.classList.remove('is-active'))
        card.classList.add('is-active')
      })
    })

    // Selector de tabs de fuentes de escaneo (webcam / phone / files)
    container.querySelectorAll<HTMLButtonElement>('[data-scan-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.dataset.scanTab as 'webcam' | 'phone' | 'files'
        activeScanTab = tab
        container.querySelectorAll('[data-scan-tab]').forEach((b) => b.classList.remove('is-active'))
        tabBtn.classList.add('is-active')

        container.querySelectorAll('[data-scan-content]').forEach((content) => {
          content.classList.toggle('is-hidden', content.getAttribute('data-scan-content') !== tab)
        })

        if (tab === 'webcam') {
          void refreshCameras()
        } else {
          stopActiveStream()
        }
      })
    })

    // Botones de cámara
    container.querySelector('[data-snap-photo]')?.addEventListener('click', () => captureSinglePhoto())
    container.querySelector('[data-snap-burst]')?.addEventListener('click', () => void captureBurst(5))
    container.querySelector('[data-camera-refresh]')?.addEventListener('click', () => void refreshCameras())
    cameraSelect?.addEventListener('change', () => void startCamera(cameraSelect.value))

    // Entradas de archivo
    const phoneInput = container.querySelector<HTMLInputElement>('[data-phone-input]')
    phoneInput?.addEventListener('change', () => {
      if (phoneInput.files) void addFiles(phoneInput.files, 'phone_usb')
    })

    const filesInput = container.querySelector<HTMLInputElement>('[data-files-input]')
    filesInput?.addEventListener('change', () => {
      if (filesInput.files) void addFiles(filesInput.files, 'local_file')
    })

    const folderInput = container.querySelector<HTMLInputElement>('[data-folder-input]')
    folderInput?.addEventListener('change', () => {
      if (folderInput.files) void addFiles(folderInput.files, 'local_file')
    })

    // Drag and Drop en zonas de escáner
    const dropzones = container.querySelectorAll<HTMLElement>('[data-phone-dropzone], [data-files-dropzone]')
    dropzones.forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault()
        zone.classList.add('is-drag-over')
      })
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drag-over'))
      zone.addEventListener('drop', (e) => {
        e.preventDefault()
        zone.classList.remove('is-drag-over')
        if (e.dataTransfer?.files) {
          void addFiles(e.dataTransfer.files, 'local_file')
        }
      })
    })

    // Vaciar lote
    clearImagesBtn?.addEventListener('click', () => {
      capturedImages.length = 0
      updateProgressAndGallery()
    })

    // Selector de colaboración en equipo (Modo Local vs Servidor Colaborativo)
    const collabDetails = container.querySelector<HTMLElement>('[data-collab-details]')
    const collabCodeEl = container.querySelector<HTMLElement>('[data-collab-code]')

    const syncCollabUi = (): void => {
      collabDetails?.classList.toggle('is-hidden', !collaborationEnabled)
      if (collabCodeEl) collabCodeEl.textContent = generatedRoomCode

      container.querySelectorAll<HTMLButtonElement>('[data-collab-toggle]').forEach((btn) => {
        const isYes = btn.dataset.collabToggle === 'yes'
        const isSelected = isYes === collaborationEnabled
        btn.classList.toggle('is-active', isSelected)
        btn.setAttribute('aria-checked', String(isSelected))

        const iconWrap = btn.querySelector('.collab-choice-card__icon')
        if (isSelected) {
          btn.className =
            'collab-choice-card is-active flex items-start gap-3 p-3.5 rounded-xl border border-blue-500 bg-blue-500/10 text-left transition-all cursor-pointer relative shadow-sm ring-1 ring-blue-500/30'
          if (iconWrap) {
            iconWrap.className =
              'collab-choice-card__icon inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 text-white shrink-0 mt-0.5'
          }
        } else {
          btn.className =
            'collab-choice-card flex items-start gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-800/40 hover:border-slate-700 text-left transition-all cursor-pointer relative'
          if (iconWrap) {
            iconWrap.className =
              'collab-choice-card__icon inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 text-slate-400 shrink-0 mt-0.5'
          }
        }
      })
    }

    container.querySelectorAll<HTMLButtonElement>('[data-collab-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.collabToggle === 'yes'
        if (next && !collaborationEnabled) {
          generatedRoomCode = generateRoomCode()
        }
        collaborationEnabled = next
        syncCollabUi()
      })
    })

    container.querySelector<HTMLButtonElement>('[data-collab-regen]')?.addEventListener('click', () => {
      generatedRoomCode = generateRoomCode()
      if (collabCodeEl) collabCodeEl.textContent = generatedRoomCode
    })

    // Enviar y Crear
    const submitBtn = container.querySelector<HTMLButtonElement>('[data-dialog-submit]')
    const handleSubmit = (): void => {
      const name = nameInput?.value.trim() || suggestedName

      // Validación: modo escaneo requiere mínimo de fotos
      if (currentMethod === 'scan' && capturedImages.length < MIN_PHOTOS) {
        alert(`Para crear un proyecto de escaneo 3D/fotogrametría necesitas al menos ${MIN_PHOTOS} fotos. Sube más fotos o selecciona "Proyecto en blanco".`)
        return
      }

      let scanData: ScanData | null = null
      if (currentMethod === 'scan') {
        scanData = {
          method: 'photogrammetry',
          images: [...capturedImages],
          imageCount: capturedImages.length,
          status: 'ready',
          processedAt: Date.now()
        }
      }

      const result: NewProjectResult = {
        name,
        mode: currentMethod === 'scan' ? '3D' : currentMode,
        method: currentMethod,
        scanData,
        collaborationEnabled,
        roomCode: collaborationEnabled ? generatedRoomCode : null,
        role: collaborationEnabled ? 'owner' : undefined
      }

      close(result)
    }

    submitBtn?.addEventListener('click', handleSubmit)
    container.querySelectorAll('[data-dialog-cancel]').forEach((btn) => btn.addEventListener('click', () => close(null)))

    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit()
    })

    try {
      nameInput?.focus()
      nameInput?.select()
    } catch {
      /* sin foco */
    }

    updateSubmitState()
    updateButtonState()
    updateProgressAndGallery()
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) close(null)
  })

  return {
    isOpen,
    promptName(options: NameDialogOptions): Promise<string | null> {
      return new Promise<string | null>((resolve) => {
        renderBasic({
          title: options.title,
          label: options.label,
          value: options.value,
          confirmLabel: options.confirmLabel ?? 'Aceptar',
          cancelLabel: 'Cancelar'
        })
        settle = (value) => resolve(typeof value === 'string' && value.trim() ? value.trim() : null)
      })
    },
    confirm(options: ConfirmDialogOptions): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        renderBasic({
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? 'Aceptar',
          cancelLabel: options.cancelLabel === undefined ? 'Cancelar' : options.cancelLabel,
          danger: options.danger
        })
        settle = (value) => resolve(value === true)
      })
    },
    promptNewProject(options?: NewProjectDialogOptions): Promise<NewProjectResult | null> {
      return new Promise<NewProjectResult | null>((resolve) => {
        renderNewProjectModal(options)
        settle = (value) => resolve((value as NewProjectResult) || null)
      })
    }
  }
}

