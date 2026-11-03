import {
  entriesForModalCategory,
  loadPersistedCustomCatalog,
  placeableEntries,
  registerCustomCatalogEntry,
  removeCustomCatalogEntry,
  type CatalogEntry,
  type ModalElementCategory
} from '../catalog/catalog'
import { loadModel, type Model3DFormat } from '../import/modelImport'
import { icon } from './icons'

/**
 * Modal rediseñado «Añadir elemento» (`AddElementModal.tsx`).
 *
 * Características:
 * 1. Barra de búsqueda oscura estilizada (`bg-slate-800 border-slate-700 rounded-lg`) con icono de lupa.
 * 2. Pestañas de categorías separadas, con espaciado limpio y badges de conteo:
 *    - Mobiliario
 *    - Carpintería / Huecos
 *    - Estructural / Cubiertas
 *    - Personalizados / Mis Modelos
 * 3. Cuadrícula de tarjetas con vista previa 3D en miniatura, título en negrita y dimensiones en metros.
 * 4. Flujo «+ Añadir nuevo modelo (GLB / OBJ)» con selector de archivo `.glb`, `.gltf`, `.obj`,
 *    cálculo automático de dimensiones 3D, formulario de registro y persistencia permanente en SQLite / catálogo local.
 */

interface ModalTabDef {
  id: ModalElementCategory
  label: string
  shortHint: string
  iconName: 'sofa' | 'door' | 'roof' | 'cube'
}

const MODAL_TABS: ReadonlyArray<ModalTabDef> = [
  {
    id: 'furniture',
    label: 'Mobiliario',
    shortHint: 'Sofás, mesas, sillas, camas, lámparas y plantas',
    iconName: 'sofa'
  },
  {
    id: 'openings',
    label: 'Carpintería / Huecos',
    shortHint: 'Puertas y ventanas con perforación booleana en muros',
    iconName: 'door'
  },
  {
    id: 'structural',
    label: 'Estructural / Cubiertas',
    shortHint: 'Columnas, vigas, losas, escaleras y techos',
    iconName: 'roof'
  },
  {
    id: 'custom',
    label: 'Personalizados / Mis Modelos',
    shortHint: 'Modelos 3D propios importados (.GLB, .GLTF, .OBJ)',
    iconName: 'cube'
  }
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDimensionsBadge(entry: CatalogEntry): string {
  if (entry.dimensions) {
    const { width, height, depth } = entry.dimensions
    return `${width.toFixed(2)} × ${height.toFixed(2)} × ${depth.toFixed(2)} m`
  }
  return entry.hint
}

function getPreviewBadgeText(entry: CatalogEntry): string {
  if (entry.isCustom) return (entry.format ?? '3d').toUpperCase()
  if (entry.modalCategory === 'openings') return 'CSG Hueco'
  if (entry.kind === 'roof') return 'Cubierta 3D'
  if (entry.modalCategory === 'structural') return 'Estructural'
  return 'PBR 3D'
}

function detectFormatFromFilename(filename: string): Model3DFormat | null {
  const lower = filename.trim().toLowerCase()
  if (lower.endsWith('.glb')) return 'glb'
  if (lower.endsWith('.gltf')) return 'gltf'
  if (lower.endsWith('.obj')) return 'obj'
  return null
}

export async function openAddElementModal(container: HTMLElement): Promise<CatalogEntry | null> {
  await loadPersistedCustomCatalog()

  return new Promise((resolve) => {
    let activeTab: ModalElementCategory = 'furniture'
    let searchQuery = ''
    let viewMode: 'catalog' | 'upload' = 'catalog'
    let settled = false

    // Estado del formulario de carga de modelo personalizado
    let pendingBuffer: ArrayBuffer | null = null
    let pendingFormat: Model3DFormat | null = null
    let pendingFileName = ''
    let customName = ''
    let customCategory: ModalElementCategory = 'furniture'
    let customWidth = 1.0
    let customHeight = 1.0
    let customDepth = 1.0
    let uploadError = ''
    let isSubmitting = false

    const done = (value: CatalogEntry | null): void => {
      if (settled) return
      settled = true
      container.classList.add('is-hidden')
      container.innerHTML = ''
      document.removeEventListener('keydown', onKeyDown, true)
      resolve(value)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (viewMode === 'upload') {
          viewMode = 'catalog'
          uploadError = ''
          render()
          return
        }
        done(null)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    container.classList.remove('is-hidden')
    container.innerHTML = `
      <div class="dialog add-modal-backdrop">
        <div class="dialog__backdrop" data-modal-close></div>
        <div class="dialog__card add-modal" role="dialog" aria-modal="true" aria-label="Añadir elemento">
          <!-- Input de archivo oculto para cargar .glb / .gltf / .obj -->
          <input
            type="file"
            accept=".glb,.gltf,.obj"
            class="is-hidden"
            data-custom-file-input
          />
          <div data-modal-root></div>
        </div>
      </div>
    `

    const rootEl = container.querySelector<HTMLDivElement>('[data-modal-root]')!
    const fileInput = container.querySelector<HTMLInputElement>('[data-custom-file-input]')!

    container.querySelector('[data-modal-close]')?.addEventListener('click', () => done(null))

    async function handleSelectedFile(file: File): Promise<void> {
      const format = detectFormatFromFilename(file.name)
      if (!format) {
        uploadError = 'Formato no soportado. Selecciona un archivo .glb, .gltf u .obj.'
        viewMode = 'upload'
        render()
        return
      }

      try {
        uploadError = ''
        const buffer = await file.arrayBuffer()
        pendingBuffer = buffer
        pendingFormat = format
        pendingFileName = file.name
        const cleanTitle = file.name.replace(/\.(glb|gltf|obj)$/i, '').replace(/[-_]+/g, ' ').trim()
        if (!customName) {
          customName = cleanTitle ? cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) : 'Modelo personalizado'
        }

        // Medir el BoundingBox real del modelo para sugerir dimensiones exactas
        const parsed = await loadModel(buffer, format)
        const sizeVec = parsed.bbox.getSize(
          new ( await import('three') ).Vector3()
        )
        if (sizeVec.x > 0.01 && sizeVec.y > 0.01 && sizeVec.z > 0.01) {
          customWidth = Number(Math.min(25, Math.max(0.1, sizeVec.x)).toFixed(2))
          customHeight = Number(Math.min(25, Math.max(0.1, sizeVec.y)).toFixed(2))
          customDepth = Number(Math.min(25, Math.max(0.1, sizeVec.z)).toFixed(2))
        }
        viewMode = 'upload'
        render()
      } catch (err) {
        uploadError = `No se pudo leer el modelo 3D: ${(err as Error).message}`
        viewMode = 'upload'
        render()
      }
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      fileInput.value = ''
      if (file) {
        void handleSelectedFile(file)
      }
    })

    function openUploadView(defaultCategory?: ModalElementCategory): void {
      uploadError = ''
      if (defaultCategory) {
        customCategory = defaultCategory
      } else if (activeTab !== 'custom') {
        customCategory = activeTab
      }
      viewMode = 'upload'
      render()
    }

    function renderCatalogView(): string {
      const q = searchQuery.trim().toLowerCase()
      const entries = q
        ? placeableEntries().filter(
            (e) =>
              e.label.toLowerCase().includes(q) ||
              e.hint.toLowerCase().includes(q) ||
              e.id.toLowerCase().includes(q)
          )
        : entriesForModalCategory(activeTab)

      const tabsHtml = MODAL_TABS.map((tab) => {
        const count = entriesForModalCategory(tab.id).length
        const isActive = !q && activeTab === tab.id
        return `
          <button
            type="button"
            class="add-modal__tab${isActive ? ' is-active' : ''}"
            data-tab-id="${tab.id}"
            title="${escapeHtml(tab.shortHint)}"
          >
            <span class="add-modal__tab-icon">${icon(tab.iconName, 16)}</span>
            <span class="add-modal__tab-label">${escapeHtml(tab.label)}</span>
            <span class="add-modal__tab-badge">${count}</span>
          </button>
        `
      }).join('')

      const uploadCardHtml = `
        <button
          type="button"
          class="add-modal__card add-modal__card--upload"
          data-open-upload
          title="Subir archivo 3D (.glb, .gltf, .obj) desde tu ordenador"
        >
          <div class="add-modal__preview add-modal__preview--upload">
            <span class="add-modal__upload-plus">+</span>
            <span class="add-modal__preview-tag">GLB / OBJ</span>
          </div>
          <div class="add-modal__card-body">
            <span class="add-modal__card-title">+ Añadir nuevo modelo (GLB / OBJ)</span>
            <span class="add-modal__card-dims">Importar modelo 3D personalizado</span>
          </div>
        </button>
      `

      const cardsHtml = entries
        .map((entry) => {
          const dimsText = formatDimensionsBadge(entry)
          const badgeText = getPreviewBadgeText(entry)
          const deleteBtn = entry.isCustom
            ? `<button type="button" class="add-modal__delete-custom" data-delete-custom="${escapeHtml(entry.id)}" title="Eliminar modelo personalizado">×</button>`
            : ''
          return `
            <div class="add-modal__card-wrap">
              <button
                type="button"
                class="add-modal__card"
                data-select-entry="${escapeHtml(entry.id)}"
                title="${escapeHtml(entry.hint)}"
              >
                <div class="add-modal__preview" data-kind="${escapeHtml(entry.modalCategory ?? entry.kind)}">
                  <span class="add-modal__preview-icon">${icon(entry.icon, 28)}</span>
                  <span class="add-modal__preview-tag">${escapeHtml(badgeText)}</span>
                </div>
                <div class="add-modal__card-body">
                  <span class="add-modal__card-title">${escapeHtml(entry.label)}</span>
                  <span class="add-modal__card-dims">${escapeHtml(dimsText)}</span>
                </div>
              </button>
              ${deleteBtn}
            </div>
          `
        })
        .join('')

      return `
        <header class="add-modal__header">
          <div class="add-modal__header-left">
            <div class="add-modal__brand-icon">${icon('cube', 20)}</div>
            <div>
              <h2 class="add-modal__title">Añadir elemento</h2>
              <p class="add-modal__subtitle">Selecciona un elemento del catálogo o importa tu propio modelo 3D para colocarlo en la escena.</p>
            </div>
          </div>
          <div class="add-modal__header-actions">
            <button type="button" class="add-modal__new-model-btn" data-open-upload>
              <span>+ Añadir nuevo modelo (GLB / OBJ)</span>
            </button>
            <button type="button" class="add-modal__close-btn" data-close-modal aria-label="Cerrar">×</button>
          </div>
        </header>

        <!-- Barra de búsqueda superior estilizada -->
        <div class="add-modal__search-bar">
          <span class="add-modal__search-icon">${icon('search', 16)}</span>
          <input
            type="text"
            class="add-modal__search-input"
            placeholder="Buscar mobiliario, puerta, ventana panorámica, columna, techo o modelo…"
            value="${escapeHtml(searchQuery)}"
            aria-label="Buscar elemento"
            data-search-input
          />
          ${
            searchQuery
              ? `<button type="button" class="add-modal__search-clear" data-clear-search title="Limpiar búsqueda">×</button>`
              : ''
          }
        </div>

        <!-- Tabs de Categorías separadas y legibles con badges -->
        <nav class="add-modal__tabs" aria-label="Categorías de elementos">
          ${tabsHtml}
        </nav>

        <!-- Cuadrícula de selección -->
        <div class="add-modal__grid">
          ${uploadCardHtml}
          ${
            cardsHtml ||
            `<div class="add-modal__empty">
              <p>No se encontraron elementos para esta vista.</p>
              <span>Usa <strong>+ Añadir nuevo modelo (GLB / OBJ)</strong> para importar tu propio archivo 3D.</span>
            </div>`
          }
        </div>

        <footer class="add-modal__footer">
          <span class="add-modal__footer-hint">
            Tip: Las puertas y ventanas perforan automáticamente el muro sobre el que hagas clic.
          </span>
          <button type="button" class="dialog__btn" data-close-modal>Cancelar (Esc)</button>
        </footer>
      `
    }

    function renderUploadView(): string {
      return `
        <header class="add-modal__header">
          <div class="add-modal__header-left">
            <div class="add-modal__brand-icon">${icon('cube', 20)}</div>
            <div>
              <h2 class="add-modal__title">Registrar nuevo modelo 3D (GLB / OBJ)</h2>
              <p class="add-modal__subtitle">Carga un archivo .glb, .gltf u .obj desde tu ordenador para guardarlo permanentemente en tu biblioteca local.</p>
            </div>
          </div>
          <div class="add-modal__header-actions">
            <button type="button" class="add-modal__close-btn" data-back-to-catalog aria-label="Volver">×</button>
          </div>
        </header>

        <div class="add-modal__upload-form">
          <div class="add-modal__dropzone ${pendingBuffer ? 'has-file' : ''}" data-pick-file>
            <div class="add-modal__dropzone-icon">${icon('cube', 32)}</div>
            <div class="add-modal__dropzone-text">
              ${
                pendingBuffer
                  ? `<strong>Archivo cargado: ${escapeHtml(pendingFileName)}</strong>
                     <span>Formato ${(pendingFormat ?? 'glb').toUpperCase()} listo para guardar · Haz clic para cambiar de archivo</span>`
                  : `<strong>Haz clic para seleccionar un archivo 3D (.glb, .gltf, .obj)</strong>
                     <span>Se extraerán automáticamente sus mallas, materiales y dimensiones en metros</span>`
              }
            </div>
            <button type="button" class="add-modal__browse-btn" data-pick-file-btn>
              ${pendingBuffer ? 'Cambiar archivo…' : 'Examinar archivo…'}
            </button>
          </div>

          ${
            uploadError
              ? `<div class="add-modal__error">${escapeHtml(uploadError)}</div>`
              : ''
          }

          <div class="add-modal__form-grid">
            <label class="add-modal__field add-modal__field--full">
              <span class="add-modal__label">Nombre del elemento</span>
              <input
                type="text"
                class="add-modal__input"
                placeholder="Ej. Silla Eames, Lámpara colgante, Pérgola de madera…"
                value="${escapeHtml(customName)}"
                data-input-name
              />
            </label>

            <label class="add-modal__field add-modal__field--full">
              <span class="add-modal__label">Categoría en la biblioteca</span>
              <select class="add-modal__select" data-input-category>
                <option value="furniture" ${customCategory === 'furniture' ? 'selected' : ''}>Mobiliario ( aparecerá también en Personalizados )</option>
                <option value="openings" ${customCategory === 'openings' ? 'selected' : ''}>Carpintería / Huecos</option>
                <option value="structural" ${customCategory === 'structural' ? 'selected' : ''}>Estructural / Cubiertas</option>
                <option value="custom" ${customCategory === 'custom' ? 'selected' : ''}>Personalizados / Mis Modelos</option>
              </select>
            </label>

            <label class="add-modal__field">
              <span class="add-modal__label">Ancho X (metros)</span>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="50"
                class="add-modal__input"
                value="${customWidth}"
                data-input-width
              />
            </label>

            <label class="add-modal__field">
              <span class="add-modal__label">Alto Y (metros)</span>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="50"
                class="add-modal__input"
                value="${customHeight}"
                data-input-height
              />
            </label>

            <label class="add-modal__field">
              <span class="add-modal__label">Fondo Z (metros)</span>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="50"
                class="add-modal__input"
                value="${customDepth}"
                data-input-depth
              />
            </label>
          </div>
        </div>

        <footer class="add-modal__footer">
          <button type="button" class="dialog__btn" data-back-to-catalog>← Volver al catálogo</button>
          <div class="add-modal__footer-right">
            <button
              type="button"
              class="dialog__btn"
              data-save-only
              ${isSubmitting ? 'disabled' : ''}
            >
              Guardar en biblioteca
            </button>
            <button
              type="button"
              class="dialog__btn dialog__btn--primary"
              data-save-and-place
              ${isSubmitting ? 'disabled' : ''}
            >
              ${isSubmitting ? 'Procesando 3D…' : 'Guardar y colocar en escena'}
            </button>
          </div>
        </footer>
      `
    }

    async function submitCustomModel(placeImmediately: boolean): Promise<void> {
      if (!pendingBuffer || !pendingFormat) {
        uploadError = 'Selecciona primero un archivo .glb, .gltf u .obj desde tu ordenador.'
        render()
        fileInput.click()
        return
      }
      if (!customName.trim()) {
        uploadError = 'Escribe un nombre descriptivo para el elemento.'
        render()
        return
      }

      try {
        isSubmitting = true
        uploadError = ''
        render()

        const created = await registerCustomCatalogEntry({
          name: customName.trim(),
          modalCategory: customCategory,
          dimensions: {
            width: Number(customWidth) || 1.0,
            height: Number(customHeight) || 1.0,
            depth: Number(customDepth) || 1.0
          },
          buffer: pendingBuffer,
          format: pendingFormat
        })

        // Limpiar formulario
        pendingBuffer = null
        pendingFormat = null
        pendingFileName = ''
        customName = ''
        isSubmitting = false

        if (placeImmediately) {
          done(created)
        } else {
          activeTab = customCategory
          viewMode = 'catalog'
          render()
        }
      } catch (err) {
        isSubmitting = false
        uploadError = `Error al registrar el modelo: ${(err as Error).message}`
        render()
      }
    }

    function bindEvents(): void {
      rootEl.querySelectorAll<HTMLElement>('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => done(null))
      })

      rootEl.querySelectorAll<HTMLElement>('[data-open-upload]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openUploadView()
          if (!pendingBuffer) {
            fileInput.click()
          }
        })
      })

      rootEl.querySelectorAll<HTMLButtonElement>('[data-tab-id]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          activeTab = tabBtn.dataset.tabId as ModalElementCategory
          searchQuery = ''
          render()
        })
      })

      const searchEl = rootEl.querySelector<HTMLInputElement>('[data-search-input]')
      if (searchEl) {
        searchEl.addEventListener('input', () => {
          const caret = searchEl.selectionStart ?? searchEl.value.length
          searchQuery = searchEl.value
          render()
          const nextSearch = rootEl.querySelector<HTMLInputElement>('[data-search-input]')
          if (nextSearch) {
            nextSearch.focus()
            try {
              nextSearch.setSelectionRange(caret, caret)
            } catch {
              /* ignore */
            }
          }
        })
      }

      rootEl.querySelector('[data-clear-search]')?.addEventListener('click', () => {
        searchQuery = ''
        render()
        rootEl.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
      })

      rootEl.querySelectorAll<HTMLButtonElement>('[data-select-entry]').forEach((cardBtn) => {
        cardBtn.addEventListener('click', () => {
          const entryId = cardBtn.dataset.selectEntry
          const found = placeableEntries().find((e) => e.id === entryId) ?? null
          done(found)
        })
      })

      rootEl.querySelectorAll<HTMLButtonElement>('[data-delete-custom]').forEach((delBtn) => {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          const id = delBtn.dataset.deleteCustom
          if (!id) return
          void removeCustomCatalogEntry(id).then(() => render())
        })
      })

      // Eventos de la vista de carga de modelo personalizado
      rootEl.querySelectorAll<HTMLElement>('[data-back-to-catalog]').forEach((btn) => {
        btn.addEventListener('click', () => {
          viewMode = 'catalog'
          uploadError = ''
          render()
        })
      })

      rootEl.querySelectorAll<HTMLElement>('[data-pick-file], [data-pick-file-btn]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          fileInput.click()
        })
      })

      const nameInput = rootEl.querySelector<HTMLInputElement>('[data-input-name]')
      nameInput?.addEventListener('input', () => {
        customName = nameInput.value
      })

      const catSelect = rootEl.querySelector<HTMLSelectElement>('[data-input-category]')
      catSelect?.addEventListener('change', () => {
        customCategory = catSelect.value as ModalElementCategory
      })

      const wInput = rootEl.querySelector<HTMLInputElement>('[data-input-width]')
      wInput?.addEventListener('input', () => {
        customWidth = Math.max(0.1, Number(wInput.value) || 1.0)
      })

      const hInput = rootEl.querySelector<HTMLInputElement>('[data-input-height]')
      hInput?.addEventListener('input', () => {
        customHeight = Math.max(0.1, Number(hInput.value) || 1.0)
      })

      const dInput = rootEl.querySelector<HTMLInputElement>('[data-input-depth]')
      dInput?.addEventListener('input', () => {
        customDepth = Math.max(0.1, Number(dInput.value) || 1.0)
      })

      rootEl.querySelector('[data-save-only]')?.addEventListener('click', () => {
        void submitCustomModel(false)
      })

      rootEl.querySelector('[data-save-and-place]')?.addEventListener('click', () => {
        void submitCustomModel(true)
      })
    }

    function render(): void {
      rootEl.innerHTML = viewMode === 'catalog' ? renderCatalogView() : renderUploadView()
      bindEvents()
    }

    render()
    try {
      rootEl.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
    } catch {
      /* ignore focus error */
    }
  })
}

export const AddElementModal = {
  open: openAddElementModal
}

