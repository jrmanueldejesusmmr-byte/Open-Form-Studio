import type { SceneManager } from '../engine/SceneManager'
import {
  buildExportScene,
  contentToBlob,
  EXPORT_CATEGORIES,
  EXPORT_FORMATS,
  getExportFormat,
  triggerDownload,
  type ExportContext,
  type ExportFormat,
  type ExportFormatId,
  type PdfSheetId
} from '../export/index'
import { PDF_SHEETS, STANDARD_SCALES } from '../export/pdf'
import { icon } from './icons'

/** El puente arqStudio expuesto por preload/index.ts (window.arqStudio.app). */
export interface AppBridge {
  saveDialog?(options: unknown): Promise<{ canceled?: boolean; filePath?: string }>
  saveFile?(payload: { filePath: string; data: string; encoding?: 'utf8' | 'base64' }): Promise<unknown>
}

export interface ExportDialogOptions {
  scene: SceneManager
  app?: AppBridge
  statusBar?: { setMessage: (message: string) => void }
  /** Nombre del proyecto (opcional; se usa como nombre sugerido del archivo). */
  projectName?: string
  /**
   * Visor 3D. Lo utiliza el formato PNG para capturar el lienzo WebGL real
   * con la cámara, iluminación y encuadre activos.
   */
  viewport?: {
    capturePng(
      mimeType?: 'image/png' | 'image/jpeg' | Record<string, unknown>,
      quality?: number,
      options?: Record<string, unknown>
    ): string
  }
}

/** Elimina del nombre de archivo los caracteres prohibidos en Windows/Unix. */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Escape del texto del usuario antes de insertarlo en el HTML del diálogo. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Genera la fecha actual en formato DD_MM_YYYY para el nombre sugerido por defecto. */
function formattedDateSuffix(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}_${mm}_${yyyy}`
}

/**
 * Monta el modal profesional CAD/BIM "Exportar modelo" sobre `#dialog-overlay`
 * y devuelve `open`/`close`.
 */
export function mountExportDialog(
  overlay: HTMLElement,
  options: ExportDialogOptions
): { open: () => void; close: () => void } {
  const { scene, app, statusBar } = options
  const formats = EXPORT_FORMATS.filter((format) => format.available)
  let activeFormat: ExportFormatId = formats[0]?.id ?? 'obj'
  let isExporting = false

  /** Nombre por defecto del archivo: el del proyecto o `Proyecto_DD_MM_YYYY`. */
  const defaultName = (): string => {
    const raw = options.projectName?.trim()
    if (raw && raw.toLowerCase() !== 'proyecto') {
      const clean = sanitizeFileName(raw)
      if (clean) return clean
    }
    return `Proyecto_${formattedDateSuffix()}`
  }

  function close(): void {
    if (isExporting) return
    overlay.classList.add('is-hidden')
    overlay.innerHTML = ''
    document.removeEventListener('keydown', onKey, true)
  }

  function onKey(event: KeyboardEvent): void {
    if (overlay.classList.contains('is-hidden')) return
    if (event.key === 'Escape' && !isExporting) {
      event.stopPropagation()
      close()
    }
  }

  function renderFormatCard(format: ExportFormat, selected: boolean): string {
    return `<label
      class="exp-card h-24 p-2.5 rounded-xl border border-slate-800/90 bg-slate-950/40 hover:bg-slate-800/60 hover:border-slate-700 cursor-pointer transition-all flex flex-col justify-between select-none relative group ${
        selected
          ? 'is-selected border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.25)] ring-1 ring-sky-500/50'
          : ''
      }"
      data-format-card="${format.id}"
    >
      <input type="radio" name="export-format" value="${format.id}" class="sr-only" ${selected ? 'checked' : ''} />
      <div class="flex items-start justify-between gap-1.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-7 h-7 rounded-lg bg-slate-800/90 flex items-center justify-center text-sky-400 group-hover:text-sky-300 shrink-0">
            ${icon(format.icon, 16)}
          </span>
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-100 flex items-center gap-1.5 truncate">
              <span>${escapeHtml(format.shortName)}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-400 font-medium">.${escapeHtml(format.extension)}</span>
            </div>
          </div>
        </div>
        <span class="exp-card__check w-4 h-4 rounded-full flex items-center justify-center text-[10px] opacity-0 transition-opacity shrink-0">
          ${icon('check', 10)}
        </span>
      </div>
      <p class="text-[11px] text-slate-400 line-clamp-2 leading-tight mt-1 mb-0">${escapeHtml(format.description)}</p>
    </label>`
  }

  function open(): void {
    if (formats.length === 0) {
      statusBar?.setMessage('Exportar: no hay formatos disponibles.')
      return
    }
    activeFormat = formats[0].id
    isExporting = false

    const categoryMeta: Record<string, { title: string; subtitle: string; icon: import('./icons').IconName; color: string }> = {
      '3d': {
        title: 'Modelos 3D y Materiales',
        subtitle: 'OBJ, MTL, GLB, STL',
        icon: 'cube',
        color: 'text-sky-400'
      },
      '2d': {
        title: 'Documentación y Planos 2D',
        subtitle: 'DXF, PDF, SVG',
        icon: 'plan2d',
        color: 'text-emerald-400'
      },
      'bim': {
        title: 'Interoperabilidad y Captura',
        subtitle: 'IFC, PNG',
        icon: 'building',
        color: 'text-indigo-400'
      }
    }

    const categoriesHtml = EXPORT_CATEGORIES.map((category) => {
      const meta = categoryMeta[category.id] ?? {
        title: category.title,
        subtitle: category.subtitle,
        icon: 'cube',
        color: 'text-sky-400'
      }
      const catFormats = category.formats
        .map((id) => getExportFormat(id))
        .filter((f): f is ExportFormat => Boolean(f && f.available))
      if (catFormats.length === 0) return ''
      const cardsHtml = catFormats.map((f) => renderFormatCard(f, f.id === activeFormat)).join('')
      return `<div class="flex flex-col gap-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/70" data-category="${category.id}">
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/70">
          <div class="flex items-center gap-2 min-w-0">
            <span class="${meta.color} shrink-0">${icon(meta.icon, 16)}</span>
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider truncate">${escapeHtml(meta.title)}</h4>
              <p class="text-[10px] text-slate-400 truncate mt-0.5">${escapeHtml(meta.subtitle)}</p>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          ${cardsHtml}
        </div>
      </div>`
    }).join('')

    const sheetOptions = (Object.keys(PDF_SHEETS) as PdfSheetId[])
      .map(
        (id) =>
          `<option value="${id}"${id === 'A3-H' ? ' selected' : ''}>${PDF_SHEETS[id].label} (${id})</option>`
      )
      .join('')
    const scaleOptions =
      '<option value="">Automática (ajuste óptimo)</option>' +
      STANDARD_SCALES.map((s) => `<option value="${s}">1:${s}</option>`).join('')
    const today = new Date().toISOString().slice(0, 10)

    const wallCount = scene.getWalls().length
    const objectCount = scene.getObjects().length
    const levelCount = scene.getLevels().length
    const activeFmt = getExportFormat(activeFormat)!

    overlay.classList.remove('is-hidden')
    overlay.innerHTML = `<div class="exp-modal-wrapper">
      <div class="dialog__backdrop exp-modal__backdrop" data-export-cancel></div>
      <div class="exp-modal max-w-4xl w-full bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden" role="dialog" aria-modal="true" aria-label="Exportar modelo">
        <header class="exp-header bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div class="exp-header-left flex items-center gap-3">
            <div class="exp-modal__brand-icon w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-600/30 shrink-0">
              ${icon('download', 20)}
            </div>
            <div>
              <h2 class="dialog__title exp-modal__title text-base font-bold text-slate-100 tracking-tight">Exportar modelo</h2>
              <p class="exp-modal__subtitle text-xs text-slate-400 mt-0.5">Selecciona el formato CAD, BIM o 3D para convertir y descargar el proyecto actual</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="exp-modal__stats hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-1 rounded-full border border-slate-800" title="Elementos en la escena actual">
              <span>${wallCount} muro${wallCount === 1 ? '' : 's'}</span>
              <span class="exp-modal__dot">·</span>
              <span>${objectCount} objeto${objectCount === 1 ? '' : 's'}</span>
              <span class="exp-modal__dot">·</span>
              <span>${levelCount} nivel${levelCount === 1 ? '' : 'es'}</span>
            </div>
            <button type="button" class="exp-modal__close w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" data-export-cancel aria-label="Cerrar">
              ${icon('close', 16)}
            </button>
          </div>
        </header>

        <div class="exp-modal__body overflow-y-auto max-h-[85vh] p-6 space-y-4">
          <!-- Distribución en cuadrícula de 3 columnas -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${categoriesHtml}
          </div>

          <!-- Opciones PDF -->
          <div class="exp-options bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mt-3" data-pdf-options hidden>
            <div class="exp-options__title flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider mb-3">
              ${icon('sliders', 14)}
              <span>Configuración de lámina arquitectónica PDF</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Formato de hoja</span>
                <select class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-pdf-sheet>${sheetOptions}</select>
              </label>
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Escala de impresión</span>
                <select class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-pdf-scale>${scaleOptions}</select>
              </label>
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Título del proyecto</span>
                <input class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-pdf-project value="${escapeHtml(options.projectName ?? 'Proyecto Open Form Studio')}" />
              </label>
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Autor / Estudio</span>
                <input class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-pdf-author value="Open Form Studio" />
              </label>
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Fecha de emisión</span>
                <input class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-pdf-date type="date" value="${today}" />
              </label>
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">N.º de lámina</span>
                <input class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-pdf-number value="A-01" />
              </label>
            </div>
          </div>

          <!-- Opciones PNG -->
          <div class="exp-options bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mt-3" data-png-options hidden>
            <div class="exp-options__title flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider mb-3">
              ${icon('camera', 14)}
              <span>Opciones de captura del visor 3D (PNG)</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Resolución</span>
                <select class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-png-scale>
                  <option value="1">1x (Estándar HD)</option>
                  <option value="2" selected>2x (Alta resolución 2K)</option>
                  <option value="4">4x (Ultra HD 4K)</option>
                </select>
              </label>
              <label class="exp-field flex flex-col gap-1">
                <span class="exp-field__label text-xs text-slate-400 font-medium">Fondo</span>
                <select class="exp-field__control bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" data-png-bg>
                  <option value="scene" selected>Fondo actual del visor</option>
                  <option value="transparent">Fondo transparente (Alpha)</option>
                </select>
              </label>
              <label class="exp-field flex items-center gap-2 pt-6 cursor-pointer select-none">
                <input type="checkbox" data-png-clean checked class="w-4 h-4 rounded text-sky-500 accent-sky-500 bg-slate-950 border-slate-700" />
                <span class="text-xs text-slate-300 font-medium">Ocultar rejilla y gizmos</span>
              </label>
            </div>
          </div>

          <!-- Estado / Alertas -->
          <div class="export-dialog__status exp-status text-xs p-2.5 rounded-lg border border-slate-800 bg-slate-950/60" role="status" aria-live="polite" hidden></div>
        </div>

        <!-- Pie del Modal Fijo -->
        <footer class="exp-modal__footer sticky bottom-0 bg-slate-900 px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 z-10">
          <!-- Input de nombre de archivo a la izquierda con el badge de extensión fijo -->
          <div class="flex flex-col gap-1 max-w-sm w-full">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <label for="export-filename-input" class="font-medium">Nombre del archivo</label>
              <span class="truncate max-w-[220px] text-sky-400/90 text-[10px]" data-export-format-hint>${escapeHtml(activeFmt.label)} — ${escapeHtml(activeFmt.description)}</span>
            </div>
            <div class="export-dialog__file exp-file-input-group flex items-center rounded-lg border border-slate-700 bg-slate-950/80 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 w-full overflow-hidden">
              <span class="pl-2.5 text-slate-400 shrink-0">${icon('folderOpen', 15)}</span>
              <input
                id="export-filename-input"
                class="w-full bg-transparent px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none font-mono"
                type="text"
                maxlength="80"
                placeholder="Nombre_del_proyecto"
                value="${escapeHtml(defaultName())}"
                aria-label="Nombre del archivo"
              />
              <span class="export-dialog__ext px-2.5 py-1.5 text-xs font-mono text-sky-400 bg-slate-800/80 rounded-r-lg border-l border-slate-700 select-none shrink-0">.${escapeHtml(activeFmt.extension)}</span>
            </div>
          </div>

          <!-- Botones "Cancelar" y "Exportar archivo" a la derecha, fijos en la base -->
          <div class="flex items-center gap-2.5 justify-end">
            <button type="button" class="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80 transition-colors" data-export-cancel>
              Cancelar
            </button>
            <button type="button" class="exp-btn-primary px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-600/25 transition-all flex items-center gap-2 disabled:opacity-50" data-export-run>
              <span class="exp-btn__icon" data-export-btn-icon>${icon('download', 15)}</span>
              <span data-export-btn-label>Exportar .${escapeHtml(activeFmt.extension)}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>`

    document.addEventListener('keydown', onKey, true)
    overlay
      .querySelectorAll<HTMLElement>('[data-export-cancel]')
      .forEach((el) => el.addEventListener('click', close))

    const filenameInput = overlay.querySelector<HTMLInputElement>('.export-dialog__file input')!
    const extLabel = overlay.querySelector<HTMLElement>('.export-dialog__ext')!
    const formatHint = overlay.querySelector<HTMLElement>('[data-export-format-hint]')!
    const status = overlay.querySelector<HTMLElement>('.export-dialog__status')!
    const runBtn = overlay.querySelector<HTMLButtonElement>('[data-export-run]')!
    const runBtnIcon = overlay.querySelector<HTMLElement>('[data-export-btn-icon]')!
    const runBtnLabel = overlay.querySelector<HTMLElement>('[data-export-btn-label]')!
    const pdfOptions = overlay.querySelector<HTMLElement>('[data-pdf-options]')!
    const pngOptions = overlay.querySelector<HTMLElement>('[data-png-options]')!

    const setStatus = (
      type: 'idle' | 'loading' | 'success' | 'error',
      message = ''
    ): void => {
      if (type === 'idle' || !message) {
        status.hidden = true
        status.className = 'export-dialog__status exp-status'
        status.innerHTML = ''
        return
      }
      status.hidden = false
      status.className = `export-dialog__status exp-status exp-status--${type}`
      const statusIcon =
        type === 'loading'
          ? `<span class="exp-spinner">${icon('loader', 15)}</span>`
          : type === 'success'
            ? `<span class="exp-status__icon">${icon('checkCircle', 15)}</span>`
            : `<span class="exp-status__icon">${icon('alert', 15)}</span>`
      status.innerHTML = `${statusIcon}<span class="exp-status__text">${escapeHtml(message)}</span>`
    }

    const syncFormatUi = (): void => {
      const fmt = getExportFormat(activeFormat)
      if (!fmt) return
      extLabel.textContent = `.${fmt.extension}`
      runBtnLabel.textContent = `Exportar .${fmt.extension}`
      formatHint.textContent = `${fmt.label} — ${fmt.description}`
      pdfOptions.hidden = activeFormat !== 'pdf'
      pngOptions.hidden = activeFormat !== 'png'

      overlay.querySelectorAll<HTMLElement>('[data-format-card]').forEach((card) => {
        const isSelected = card.dataset.formatCard === activeFormat
        card.classList.toggle('is-selected', isSelected)
      })
      setStatus('idle')
    }

    syncFormatUi()

    overlay.querySelectorAll<HTMLInputElement>('input[name="export-format"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (isExporting) return
        activeFormat = radio.value as ExportFormatId
        syncFormatUi()
      })
    })

    const setLoadingState = (loading: boolean, ext: string): void => {
      isExporting = loading
      runBtn.disabled = loading
      runBtn.classList.toggle('is-loading', loading)
      if (loading) {
        runBtnIcon.innerHTML = `<span class="exp-spinner">${icon('loader', 16)}</span>`
        runBtnLabel.textContent = 'Exportando...'
      } else {
        runBtnIcon.innerHTML = icon('download', 16)
        runBtnLabel.textContent = `Exportar .${ext}`
      }
    }

    const runExport = async (): Promise<void> => {
      if (isExporting) return
      const format = getExportFormat(activeFormat)
      if (!format) return

      const baseName = sanitizeFileName(filenameInput.value) || defaultName()
      const fileName = `${baseName}.${format.extension}`

      setLoadingState(true, format.extension)
      setStatus('loading', `Exportando geometría y datos a ${fileName}...`)

      // Permite que el navegador pinte el spinner antes de procesar la geometría
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      try {
        const context: ExportContext & Record<string, unknown> = {
          walls: scene.getWalls(),
          objects: scene.getObjects(),
          levels: scene.getLevels(),
          projectName: options.projectName || baseName,
          viewport: options.viewport
        }

        if (activeFormat === 'pdf') {
          const sheet = overlay.querySelector<HTMLSelectElement>('[data-pdf-sheet]')?.value as
            | PdfSheetId
            | undefined
          const scaleRaw = overlay.querySelector<HTMLSelectElement>('[data-pdf-scale]')?.value ?? ''
          const project = overlay.querySelector<HTMLInputElement>('[data-pdf-project]')?.value.trim()
          const author = overlay.querySelector<HTMLInputElement>('[data-pdf-author]')?.value.trim()
          const date = overlay.querySelector<HTMLInputElement>('[data-pdf-date]')?.value.trim()
          const number = overlay.querySelector<HTMLInputElement>('[data-pdf-number]')?.value.trim()
          if (sheet) context.sheet = sheet
          if (scaleRaw !== '') context.scale = Number(scaleRaw)
          if (project) context.projectName = project
          if (author) context.author = author
          if (date) context.sheetDate = date
          if (number) context.sheetNumber = number
        } else if (activeFormat === 'png') {
          const pngScale = Number(
            overlay.querySelector<HTMLSelectElement>('[data-png-scale]')?.value ?? '2'
          )
          const pngBg = overlay.querySelector<HTMLSelectElement>('[data-png-bg]')?.value ?? 'scene'
          const pngClean =
            overlay.querySelector<HTMLInputElement>('[data-png-clean]')?.checked ?? true
          context.pngScale = pngScale
          context.pngTransparent = pngBg === 'transparent'
          context.pngHideGrid = pngClean
          context.pngHideGizmos = pngClean
        }

        const exportScene = buildExportScene(context)
        const errorInfo: { message?: string } = {}
        const content = await format.export(exportScene, context, errorInfo)

        if (!content) {
          const errMsg =
            errorInfo.message || `No se pudo generar el contenido para el formato ${format.shortName}.`
          setStatus('error', errMsg)
          statusBar?.setMessage(`Exportar (${format.label}): ${errMsg}`)
          setLoadingState(false, format.extension)
          return
        }

        const blob = contentToBlob(content, format)

        // Si el puente nativo de Electron está disponible, usa el diálogo del sistema;
        // si no (o si falla), descarga directamente el Blob con triggerDownload.
        if (typeof app?.saveDialog === 'function' && typeof app?.saveFile === 'function') {
          const dialogResult = await app.saveDialog({
            title: `Exportar ${format.label}`,
            defaultPath: fileName,
            filters: [{ name: format.label, extensions: [format.extension] }]
          })

          if (dialogResult?.canceled || !dialogResult?.filePath) {
            setStatus('idle')
            setLoadingState(false, format.extension)
            statusBar?.setMessage(`Exportación (${format.shortName}) cancelada.`)
            return
          }

          const saved = await app.saveFile({
            filePath: dialogResult.filePath,
            data: content,
            encoding: format.binary ? 'base64' : 'utf8'
          })
          const savedOk = (saved as { ok?: boolean } | undefined)?.ok !== false
          if (savedOk) {
            setLoadingState(false, format.extension)
            setStatus('success', `Archivo exportado correctamente: ${dialogResult.filePath}`)
            statusBar?.setMessage(`Exportación completada (${format.label}): ${dialogResult.filePath}`)
            setTimeout(() => close(), 650)
            return
          }
        }

        // Descarga directa mediante Blob (navegador / fallback universal)
        triggerDownload(blob, fileName, format.mimeType)
        setLoadingState(false, format.extension)
        setStatus('success', `Archivo «${fileName}» generado y descargado con éxito.`)
        statusBar?.setMessage(`Exportación completada (${format.label}): ${fileName}`)
        setTimeout(() => close(), 650)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error inesperado durante la exportación.'
        setLoadingState(false, format.extension)
        setStatus('error', `Error al exportar: ${message}`)
        statusBar?.setMessage(`Exportar (${format.label}): ${message}`)
      }
    }

    runBtn.addEventListener('click', () => void runExport())
    filenameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        void runExport()
      }
    })
    try {
      filenameInput.focus()
      filenameInput.select()
    } catch {
      /* sin foco */
    }
  }

  return { open, close }
}
