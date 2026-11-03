import { icon } from './icons'
import { formatDefaultProjectName } from '../services/ProjectPersistence'

export interface SaveAsDialogResult {
  name: string
  saveMode: 'update' | 'duplicate'
  exportJsonFile: boolean
}

export interface SaveAsDialogOptions {
  currentName: string
  hasExistingId: boolean
  isSaveAs: boolean
}

/**
 * Abre un modal moderno para «Guardar» (cuando el proyecto es nuevo) o
 * «Guardar como…» con nombre sugerido (`Proyecto_DD_MM_AAAA`), opción de
 * guardar como copia nueva en la base de datos local SQLite y/o exportar un
 * archivo `.arqproj` / `.json` en disco.
 */
export function openSaveAsDialog(
  overlay: HTMLElement,
  options: SaveAsDialogOptions
): Promise<SaveAsDialogResult | null> {
  const suggestedName = options.currentName?.trim() || formatDefaultProjectName()

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: SaveAsDialogResult | null): void => {
      if (settled) return
      settled = true
      window.removeEventListener('keydown', onKeyDown, true)
      overlay.classList.add('is-hidden')
      overlay.innerHTML = ''
      resolve(value)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(null)
      }
    }

    overlay.innerHTML = `
      <div class="exp-modal save-as-modal" role="dialog" aria-modal="true" aria-labelledby="save-as-title">
        <header class="exp-header">
          <div class="exp-header-left">
            <span class="exp-header-icon">${icon('save', 18)}</span>
            <div>
              <h3 class="exp-title" id="save-as-title">${
                options.isSaveAs ? 'Guardar proyecto como…' : 'Guardar proyecto'
              }</h3>
              <p class="exp-subtitle">Persistencia directa en base de datos SQLite local y archivo nativo</p>
            </div>
          </div>
          <button type="button" class="exp-close-btn" data-action="cancel" aria-label="Cerrar">
            ${icon('close', 16)}
          </button>
        </header>

        <div class="exp-body">
          <div class="exp-section">
            <label class="exp-section-label" for="save-as-name-input">NOMBRE DEL PROYECTO</label>
            <input
              id="save-as-name-input"
              type="text"
              class="imp-input imp-input--full"
              placeholder="${formatDefaultProjectName()}"
              maxlength="80"
              autocomplete="off"
            />
          </div>

          ${
            options.hasExistingId && options.isSaveAs
              ? `
          <div class="exp-section">
            <span class="exp-section-label">MODO DE PERSISTENCIA EN SQLITE LOCAL</span>
            <div class="save-as-modes">
              <label class="imp-CheckLabel">
                <input type="radio" name="save-as-mode" value="update" checked />
                <span>Actualizar y renombrar el proyecto actual</span>
              </label>
              <label class="imp-CheckLabel">
                <input type="radio" name="save-as-mode" value="duplicate" />
                <span>Crear una copia independiente en «Mis proyectos»</span>
              </label>
            </div>
          </div>
          `
              : ''
          }

          <div class="exp-section">
            <span class="exp-section-label">RESPALDO EN DISCO (OPCIONAL)</span>
            <label class="imp-checkbox-card">
              <input type="checkbox" id="save-as-export-json" />
              <div class="imp-checkbox-card__text">
                <span class="imp-checkbox-card__title">Guardar también copia como archivo (.arqproj / .json)</span>
                <span class="imp-checkbox-card__desc">Permite exportar el archivo serializado a cualquier carpeta del sistema operativo.</span>
              </div>
            </label>
          </div>
        </div>

        <footer class="exp-footer">
          <div class="exp-status">
            <span class="exp-status-dot"></span>
            <span class="exp-status-text">Motor: SQLite local (transacción atómica)</span>
          </div>
          <div class="exp-actions">
            <button type="button" class="exp-btn-secondary" data-action="cancel">Cancelar</button>
            <button type="button" class="exp-btn-primary" data-action="confirm">
              ${icon('save', 15)}
              <span>Guardar proyecto</span>
            </button>
          </div>
        </footer>
      </div>
    `

    const nameInput = overlay.querySelector<HTMLInputElement>('#save-as-name-input')!
    nameInput.value = suggestedName

    const submit = (): void => {
      const name = nameInput.value.trim() || formatDefaultProjectName()
      const modeRadio = overlay.querySelector<HTMLInputElement>('input[name="save-as-mode"]:checked')
      const saveMode: 'update' | 'duplicate' =
        modeRadio?.value === 'duplicate' ? 'duplicate' : 'update'
      const exportCheck = overlay.querySelector<HTMLInputElement>('#save-as-export-json')
      finish({
        name,
        saveMode,
        exportJsonFile: Boolean(exportCheck?.checked)
      })
    }

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    })

    overlay.querySelectorAll<HTMLElement>('[data-action="cancel"]').forEach((btn) => {
      btn.addEventListener('click', () => finish(null))
    })
    overlay.querySelector<HTMLElement>('[data-action="confirm"]')?.addEventListener('click', submit)

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null)
    })

    overlay.classList.remove('is-hidden')
    window.addEventListener('keydown', onKeyDown, true)
    queueMicrotask(() => {
      nameInput.focus()
      nameInput.select()
    })
  })
}

