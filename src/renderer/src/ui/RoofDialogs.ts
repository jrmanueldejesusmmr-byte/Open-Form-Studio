/**
 * Diálogo de opciones del techo por área: modo (manual o automático) y
 * propiedades editables (tipo, pendiente, alero, espesor y material).
 *
 * Se apoya en el overlay `#dialog-overlay` y las clases `.dialog` del resto de
 * la app. Electron no implementa `window.prompt`, por eso es un modal con
 * promesa. Materiales ofrecidos: los de cubierta (teja y lámina), siempre
 * opacos.
 */

import { materialsForCategory, isMaterialId } from '../catalog/materials'
import type { RoofType } from '../models/Roof'

type DialogOverlay = HTMLElement

/** Escape del texto antes de insertarlo en el HTML del diálogo. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Resultado del diálogo de techo. */
export interface RoofOptions {
  mode: 'manual' | 'auto'
  type: RoofType
  slope: number
  overhang: number
  thickness: number
  ridgeDir: 'x' | 'z'
  material: string
}

const TYPE_OPTIONS: ReadonlyArray<{ value: RoofType; label: string }> = [
  { value: 'flat', label: 'Plana / terraza' },
  { value: 'gable', label: 'A dos aguas' },
  { value: 'hip', label: 'A cuatro aguas' }
]

const RIDGE_DIR_OPTIONS: ReadonlyArray<{ value: 'x' | 'z'; label: string }> = [
  { value: 'x', label: 'Este–Oeste' },
  { value: 'z', label: 'Norte–Sur' }
]

/** Materiales de cubierta (teja + lámina), todos opacos. */
function roofMaterials(): ReadonlyArray<{ id: string; label: string }> {
  return [...materialsForCategory('teja'), ...materialsForCategory('lamina')].map((m) => ({
    id: m.id,
    label: m.label
  }))
}

export interface AskRoofOptionsDefaults {
  type?: RoofType
  slope?: number
  overhang?: number
  thickness?: number
  ridgeDir?: 'x' | 'z'
  material?: string
}

/**
 * Pide modo y propiedades del techo. Resuelve `null` si se cancela. Los
 * valores se sanean a los rangos válidos antes de devolverse.
 */
export function askRoofOptions(
  overlay: DialogOverlay,
  defaults: AskRoofOptionsDefaults = {}
): Promise<RoofOptions | null> {
  return new Promise((resolve) => {
    let settled = false
    const activeType = defaults.type ?? 'gable'
    const activeRidgeDir = defaults.ridgeDir ?? 'x'
    const activeMaterial = defaults.material ?? 'mat.terracotta'
    const typeButtons = TYPE_OPTIONS.map(
      (o) =>
        `<button class="dialog__button${o.value === activeType ? ' is-active' : ''}" data-roof-type="${o.value}">${escapeHtml(o.label)}</button>`
    ).join('')
    const materialOptions = roofMaterials()
      .map(
        (m) =>
          `<option value="${escapeHtml(m.id)}"${m.id === activeMaterial ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
      )
      .join('')
    const ridgeDirButtons = RIDGE_DIR_OPTIONS.map(
      (o) =>
        `<button class="dialog__button${o.value === activeRidgeDir ? ' is-active' : ''}" data-roof-ridge-dir="${o.value}">${escapeHtml(o.label)}</button>`
    ).join('')

    overlay.innerHTML = `<div class="dialog">
        <div class="dialog__backdrop" data-roof-cancel></div>
        <div class="dialog__card" role="dialog" aria-modal="true" aria-label="Techo">
          <h2 class="dialog__title">Techo por área</h2>
          <p class="dialog__message">Elige cómo definir el techo y sus propiedades.</p>
          <div class="roof-dialog__modes">
            <button class="dialog__button is-active" data-roof-mode="manual">Manual (dibujar contorno)</button>
            <button class="dialog__button" data-roof-mode="auto">Automático (muros del piso)</button>
          </div>
          <div class="roof-dialog__types">
            <span class="roof-dialog__label">Tipo</span>
            ${typeButtons}
          </div>
          <div class="roof-dialog__grid">
            <label class="roof-dialog__field">Pendiente (°)
              <input class="command-palette__input roof-dialog__input" type="number" min="0" max="60" step="1" value="${defaults.slope ?? 30}" data-roof-slope />
            </label>
            <label class="roof-dialog__field">Alero (m)
              <input class="command-palette__input roof-dialog__input" type="number" min="0" max="2" step="0.05" value="${defaults.overhang ?? 0.3}" data-roof-overhang />
            </label>
            <label class="roof-dialog__field">Espesor (m)
              <input class="command-palette__input roof-dialog__input" type="number" min="0.02" max="1" step="0.01" value="${defaults.thickness ?? 0.15}" data-roof-thickness />
            </label>
            <label class="roof-dialog__field">Material
              <select class="command-palette__input roof-dialog__input" data-roof-material>${materialOptions}</select>
            </label>
            <label class="roof-dialog__field">Dirección de caballete
              ${ridgeDirButtons}
            </label>
          </div>
          <div class="dialog__actions">
            <button class="dialog__button dialog__button--primary" data-roof-accept>Crear</button>
            <button class="dialog__button" data-roof-cancel>Cancelar</button>
          </div>
        </div>
      </div>`

    let mode: 'manual' | 'auto' = 'manual'
    let type: RoofType = activeType
    let ridgeDir: 'x' | 'z' = activeRidgeDir

    const setActive = (selector: string, value: string): void => {
      overlay.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.classList.toggle('is-active', el.dataset.roofMode === value || el.dataset.roofType === value)
      })
    }

    overlay.classList.remove('is-hidden')

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        cancel()
      }
    }
    document.addEventListener('keydown', onKey, true)

    const close = (): void => {
      document.removeEventListener('keydown', onKey, true)
      overlay.classList.add('is-hidden')
      overlay.innerHTML = ''
    }

    const cancel = (): void => {
      if (settled) return
      settled = true
      close()
      resolve(null)
    }

    const accept = (): void => {
      if (settled) return
      const slopeRaw = Number(overlay.querySelector<HTMLInputElement>('[data-roof-slope]')?.value)
      const overhangRaw = Number(overlay.querySelector<HTMLInputElement>('[data-roof-overhang]')?.value)
      const thicknessRaw = Number(overlay.querySelector<HTMLInputElement>('[data-roof-thickness]')?.value)
      const materialRaw = overlay.querySelector<HTMLSelectElement>('[data-roof-material]')?.value ?? 'mat.terracotta'
      const clamp = (v: number, lo: number, hi: number, fallback: number): number =>
        Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
      settled = true
      close()
      resolve({
        mode,
        type,
        slope: clamp(slopeRaw, 0, 60, 30),
        overhang: clamp(overhangRaw, 0, 2, 0.3),
        thickness: clamp(thicknessRaw, 0.02, 1, 0.15),
        ridgeDir,
        material: isMaterialId(materialRaw) ? materialRaw : 'mat.terracotta'
      })
    }

    overlay.querySelectorAll<HTMLElement>('[data-roof-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        mode = (el.dataset.roofMode as 'manual' | 'auto') ?? 'manual'
        setActive('[data-roof-mode]', mode)
      })
    })
    overlay.querySelectorAll<HTMLElement>('[data-roof-type]').forEach((el) => {
      el.addEventListener('click', () => {
        type = (el.dataset.roofType as RoofType) ?? 'gable'
        setActive('[data-roof-type]', type)
      })
    })
    overlay.querySelectorAll<HTMLElement>('[data-roof-ridge-dir]').forEach((el) => {
      el.addEventListener('click', () => {
        ridgeDir = (el.dataset.roofRidgeDir as 'x' | 'z') ?? 'x'
        setActive('[data-roof-ridge-dir]', ridgeDir)
      })
    })
    overlay.querySelectorAll<HTMLElement>('[data-roof-cancel]').forEach((el) => {
      el.addEventListener('click', cancel)
    })
    overlay.querySelector<HTMLElement>('[data-roof-accept]')?.addEventListener('click', accept)
  })
}

