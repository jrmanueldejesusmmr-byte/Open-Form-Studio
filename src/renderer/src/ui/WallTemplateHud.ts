import { getWallTemplateDef, WALL_TEMPLATES, type LProfileVariant, type WallTemplateId } from '../engine/WallTemplates'
import type { WallTemplateParamsPatch, WallTemplateState } from '../engine/CanvasTool'
import { icon } from './icons'

export interface WallTemplateHudOptions {
  onSelectTemplate: (templateId: WallTemplateId) => void
  onUpdateParams: (patch: WallTemplateParamsPatch) => void
  onRotate90: () => void
  onExit: () => void
}

export interface WallTemplateHudHandle {
  update(state: WallTemplateState | null): void
  dispose(): void
}

/**
 * Barra flotante interactiva que acompaña el modo de colocación de Plantillas de Muros 2D.
 * Permite cambiar Ancho / Largo numéricamente antes de soltar, alternar variantes (ej. Perfil L
 * de 6 muros cerrados o 2 muros en esquina), rotar 90° con [G] y cambiar de plantilla al vuelo.
 */
export function mountWallTemplateHud(
  host: HTMLElement,
  options: WallTemplateHudOptions
): WallTemplateHudHandle {
  const root = document.createElement('div')
  root.className = 'wall-tpl-hud'
  root.hidden = true
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Parámetros de plantilla de muros 2D')

  root.innerHTML = `
    <div class="wall-tpl-hud-top">
      <div class="wall-tpl-pills" role="tablist" aria-label="Plantillas rápidas de muros">
        ${WALL_TEMPLATES.map(
          (tpl) => `
          <button type="button" class="wall-tpl-pill" data-tpl-id="${tpl.id}" title="${tpl.label} [${tpl.shortcut}]">
            <svg viewBox="0 0 48 48" width="15" height="15" fill="none" stroke="currentColor" aria-hidden="true">${tpl.previewSvg}</svg>
            <span>${tpl.shortLabel}</span>
            <kbd class="kbd-badge">${tpl.shortcut}</kbd>
          </button>
        `
        ).join('')}
      </div>
    </div>
    <div class="wall-tpl-hud-controls">
      <label class="wall-tpl-field" title="Ancho de la plantilla en metros">
        <span>Ancho</span>
        <input type="number" data-field="width" min="1" max="60" step="0.5" value="4" />
        <small>m</small>
      </label>
      <span class="wall-tpl-sep">×</span>
      <label class="wall-tpl-field" title="Largo / fondo de la plantilla en metros">
        <span>Largo</span>
        <input type="number" data-field="depth" min="1" max="60" step="0.5" value="4" />
        <small>m</small>
      </label>

      <div class="wall-tpl-variant" data-role="l-variant" hidden>
        <button type="button" class="wall-tpl-chip is-active" data-l-variant="room" title="Habitación cerrada en L (6 muros conectados)">6 muros</button>
        <button type="button" class="wall-tpl-chip" data-l-variant="corner" title="Esquina abierta en L (2 muros a 90°)">2 muros</button>
      </div>

      <label class="wall-tpl-field wall-tpl-segments" data-role="segments" hidden title="Cantidad de tramos poligonales del muro curvo">
        <span>Lados</span>
        <select data-field="segments">
          <option value="8">8</option>
          <option value="12" selected>12</option>
          <option value="16">16</option>
          <option value="24">24</option>
        </select>
      </label>

      <button type="button" class="wall-tpl-btn" data-action="rotate" title="Rotar plantilla 90° [G]">
        ${icon('rotateCw', 13)}
        <span data-role="rot-label">0°</span>
        <kbd class="kbd-badge">G</kbd>
      </button>

      <span class="wall-tpl-hint" data-role="hint">Clic: colocar · Arrastrar: esquina a esquina</span>

      <button type="button" class="wall-tpl-btn wall-tpl-close" data-action="exit" title="Volver a Seleccionar [Esc / S]">
        ${icon('close', 13)}
        <kbd class="kbd-badge">Esc</kbd>
      </button>
    </div>
  `

  host.appendChild(root)

  const widthInput = root.querySelector<HTMLInputElement>('[data-field="width"]')!
  const depthInput = root.querySelector<HTMLInputElement>('[data-field="depth"]')!
  const segmentsWrap = root.querySelector<HTMLElement>('[data-role="segments"]')!
  const segmentsSelect = root.querySelector<HTMLSelectElement>('[data-field="segments"]')!
  const lVariantWrap = root.querySelector<HTMLElement>('[data-role="l-variant"]')!
  const rotLabel = root.querySelector<HTMLElement>('[data-role="rot-label"]')!
  const hintEl = root.querySelector<HTMLElement>('[data-role="hint"]')!

  const stopCanvasKeys = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      ;(e.target as HTMLElement | null)?.blur()
      options.onExit()
      return
    }
    if (e.key === 'Enter') {
      ;(e.target as HTMLElement | null)?.blur()
    }
    e.stopPropagation()
  }

  widthInput.addEventListener('keydown', stopCanvasKeys)
  depthInput.addEventListener('keydown', stopCanvasKeys)
  segmentsSelect.addEventListener('keydown', stopCanvasKeys)

  widthInput.addEventListener('input', () => {
    const v = Number.parseFloat(widthInput.value)
    if (Number.isFinite(v) && v >= 0.5) options.onUpdateParams({ width: v })
  })

  depthInput.addEventListener('input', () => {
    const v = Number.parseFloat(depthInput.value)
    if (Number.isFinite(v) && v >= 0.5) options.onUpdateParams({ depth: v })
  })

  segmentsSelect.addEventListener('change', () => {
    const v = Number.parseInt(segmentsSelect.value, 10)
    if (Number.isFinite(v)) options.onUpdateParams({ segmentsCount: v })
    segmentsSelect.blur()
  })

  root.addEventListener('pointerdown', (e) => {
    // Impedir que un clic en el HUD atraviese hacia el lienzo 3D
    e.stopPropagation()
  })

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const pill = target.closest<HTMLButtonElement>('[data-tpl-id]')
    if (pill) {
      const id = pill.dataset.tplId as WallTemplateId
      pill.blur()
      options.onSelectTemplate(id)
      return
    }
    const variantBtn = target.closest<HTMLButtonElement>('[data-l-variant]')
    if (variantBtn) {
      const v = variantBtn.dataset.lVariant as LProfileVariant
      variantBtn.blur()
      options.onUpdateParams({ lVariant: v })
      return
    }
    const actionBtn = target.closest<HTMLButtonElement>('[data-action]')
    if (actionBtn) {
      const act = actionBtn.dataset.action
      actionBtn.blur()
      if (act === 'rotate') options.onRotate90()
      else if (act === 'exit') options.onExit()
    }
  })

  function update(state: WallTemplateState | null): void {
    if (!state) {
      root.hidden = true
      return
    }
    root.hidden = false
    const def = getWallTemplateDef(state.templateId)

    for (const pill of root.querySelectorAll<HTMLButtonElement>('[data-tpl-id]')) {
      const active = pill.dataset.tplId === state.templateId
      pill.classList.toggle('is-active', active)
      pill.setAttribute('aria-selected', String(active))
    }

    const displayW = state.isDragging ? state.liveWidth : state.width
    const displayD = state.isDragging ? state.liveDepth : state.depth

    if (document.activeElement !== widthInput) {
      widthInput.value = Number(displayW.toFixed(2)).toString()
    }
    if (document.activeElement !== depthInput) {
      depthInput.value = Number(displayD.toFixed(2)).toString()
    }

    lVariantWrap.hidden = state.templateId !== 'l'
    for (const btn of lVariantWrap.querySelectorAll<HTMLButtonElement>('[data-l-variant]')) {
      btn.classList.toggle('is-active', btn.dataset.lVariant === state.lVariant)
    }

    const hasSegments = state.templateId === 'ring' || state.templateId === 'arc'
    segmentsWrap.hidden = !hasSegments
    if (hasSegments) {
      segmentsSelect.value = String(state.segmentsCount)
    }

    rotLabel.textContent = `${state.rotationDeg}°`
    hintEl.textContent = state.isDragging
      ? `Escalando en vivo: ${displayW.toFixed(2)} × ${displayD.toFixed(2)} m (suelta para crear muros)`
      : `${def.shortLabel} · Clic coloca o arrastra de esquina a esquina`
  }

  return {
    update,
    dispose(): void {
      root.remove()
    }
  }
}

