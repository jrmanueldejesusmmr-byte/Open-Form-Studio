/**
 * Diálogos de los pisos (multiplanta): «Copiar planta al nuevo piso»,
 * renombrar, cambiar altura y confirmación de borrado.
 *
 * Se apoyan en el overlay `#dialog-overlay` y las clases `.dialog` del resto
 * de la aplicación. Electron NO implementa `window.prompt`/`window.confirm`,
 * por eso cada operación tiene su modal con promesa.
 */

type DialogOverlay = HTMLElement

/** Escape del texto del usuario antes de insertarlo en el HTML del diálogo. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Monta el marcado y devuelve el helper de cierre (una sola resolución). */
function openDialog(overlay: DialogOverlay, html: string, onEscape?: () => void): { done: () => void } {
  let settled = false
  const done = (): void => {
    if (settled) return
    settled = true
    overlay.classList.add('is-hidden')
    overlay.innerHTML = ''
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onEscape?.()
      done()
    }
  }
  document.addEventListener('keydown', onKey, true)
  overlay.classList.remove('is-hidden')
  overlay.innerHTML = html
  overlay.querySelectorAll<HTMLElement>('[data-level-cancel]').forEach((el) => {
    el.addEventListener('click', () => {
      onEscape?.()
      done()
    })
  })
  return { done }
}

/**
 * Al crear un piso: ¿copiar los muros del piso inferior como base o empezar
 * vacío? Resuelve `'copy'`, `'empty'` o `null` (cancelado).
 */
export function askLevelCopy(overlay: DialogOverlay, belowName: string): Promise<'copy' | 'empty' | null> {
  return new Promise((resolve) => {
    const dialog = openDialog(
      overlay,
      `<div class="dialog">
        <div class="dialog__backdrop" data-level-cancel></div>
        <div class="dialog__card" role="dialog" aria-modal="true" aria-label="Añadir piso">
          <h2 class="dialog__title">Añadir piso</h2>
          <p class="dialog__message">¿Copiar la planta de «${escapeHtml(belowName)}» como base del nuevo piso? Los muros se replicarán a la elevación del piso nuevo.</p>
          <div class="dialog__actions">
            <button class="dialog__btn" data-level-copy>Copiar planta</button>
            <button class="dialog__btn" data-level-empty>Empezar vacío</button>
            <button class="dialog__btn" data-level-cancel>Cancelar</button>
          </div>
        </div>
      </div>`,
      () => resolve(null)
    )
    overlay.querySelector<HTMLElement>('[data-level-copy]')?.addEventListener('click', () => {
      resolve('copy')
      dialog.done()
    })
    overlay.querySelector<HTMLElement>('[data-level-empty]')?.addEventListener('click', () => {
      resolve('empty')
      dialog.done()
    })
  })
}


/** Prompt de texto (renombrar piso). Resuelve `null` si se cancela. */
export function promptLevelName(overlay: DialogOverlay, initial: string): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = openDialog(
      overlay,
      `<div class="dialog">
        <div class="dialog__backdrop" data-level-cancel></div>
        <div class="dialog__card" role="dialog" aria-modal="true" aria-label="Renombrar piso">
          <h2 class="dialog__title">Renombrar piso</h2>
          <input class="command-palette__input level-dialog__input" type="text" maxlength="60" value="${escapeHtml(initial)}" aria-label="Nombre del piso" />
          <div class="dialog__actions">
            <button class="dialog__btn" data-level-accept>Guardar</button>
            <button class="dialog__btn" data-level-cancel>Cancelar</button>
          </div>
        </div>
      </div>`,
      () => resolve(null)
    )
    const input = overlay.querySelector<HTMLInputElement>('.level-dialog__input')!
    const accept = (): void => {
      const value = input.value.trim()
      if (!value) return
      resolve(value)
      dialog.done()
    }
    overlay.querySelector<HTMLElement>('[data-level-accept]')?.addEventListener('click', accept)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        accept()
      }
    })
    try {
      input.focus()
      input.select()
    } catch {
      /* sin foco */
    }
  })
}

/** Prompt numérico de altura en metros (> 0). Resuelve `null` si se cancela. */
export function promptLevelHeight(overlay: DialogOverlay, initial: number): Promise<number | null> {
  return new Promise((resolve) => {
    const dialog = openDialog(
      overlay,
      `<div class="dialog">
        <div class="dialog__backdrop" data-level-cancel></div>
        <div class="dialog__card" role="dialog" aria-modal="true" aria-label="Altura del piso">
          <h2 class="dialog__title">Altura del piso</h2>
          <p class="dialog__message">Altura en metros (cota a cota). La elevación de los pisos superiores se recalculará.</p>
          <input class="command-palette__input level-dialog__input" type="number" min="0.1" step="0.1" value="${initial}" aria-label="Altura del piso en metros" />
          <p class="level-dialog__error" hidden>Introduce una altura mayor que 0.</p>
          <div class="dialog__actions">
            <button class="dialog__btn" data-level-accept>Guardar</button>
            <button class="dialog__btn" data-level-cancel>Cancelar</button>
          </div>
        </div>
      </div>`,
      () => resolve(null)
    )
    const input = overlay.querySelector<HTMLInputElement>('.level-dialog__input')!
    const error = overlay.querySelector<HTMLParagraphElement>('.level-dialog__error')!
    const accept = (): void => {
      const value = Number(input.value)
      if (!Number.isFinite(value) || value <= 0) {
        error.hidden = false
        return
      }
      resolve(value)
      dialog.done()
    }
    overlay.querySelector<HTMLElement>('[data-level-accept]')?.addEventListener('click', accept)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        accept()
      }
    })
    try {
      input.focus()
      input.select()
    } catch {
      /* sin foco */
    }
  })
}

/** Confirmación de borrado de un piso (junto con sus muros y objetos). */
export function confirmLevelDelete(overlay: DialogOverlay, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = openDialog(
      overlay,
      `<div class="dialog">
        <div class="dialog__backdrop" data-level-cancel></div>
        <div class="dialog__card" role="dialog" aria-modal="true" aria-label="Eliminar piso">
          <h2 class="dialog__title">Eliminar piso</h2>
          <p class="dialog__message">¿Eliminar «${escapeHtml(name)}»? Se borrarán también sus muros y objetos. Puedes deshacerlo con Ctrl+Z.</p>
          <div class="dialog__actions">
            <button class="dialog__btn" data-level-accept>Eliminar</button>
            <button class="dialog__btn" data-level-cancel>Cancelar</button>
          </div>
        </div>
      </div>`,
      () => resolve(false)
    )
    overlay.querySelector<HTMLElement>('[data-level-accept]')?.addEventListener('click', () => {
      resolve(true)
      dialog.done()
    })
  })
}
