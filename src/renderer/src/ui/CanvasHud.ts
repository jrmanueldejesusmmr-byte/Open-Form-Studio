import type { ViewMode } from '../engine/ViewportRenderer'
import { icon } from './icons'
import { t } from '../i18n/es'

/**
 * Superposiciones del lienzo: lectura de coordenadas estilo CAD
 * ("Status: x, z"), el control de zoom continuo y los botones de cambio de
 * vista 2D / 3D / Convertir a plano.
 */
export interface CanvasHudOptions {
  onZoomFraction: (fraction01: number) => void
  onViewMode: (mode: ViewMode) => void
  onConvertToPlan: () => void
}

export interface CanvasHudHandle {
  /** Refleja el zoom del motor en el slider (p. ej. al usar la rueda del ratón). */
  setZoomFraction: (fraction01: number) => void
  setViewMode: (mode: ViewMode) => void
  /** Coordenadas del cursor sobre el plano de trabajo. */
  setStatusCoordinates: (x: number, z: number) => void
  setStatusText: (text: string) => void
}

export function mountCanvasHud(container: HTMLElement, options: CanvasHudOptions): CanvasHudHandle {
  container.innerHTML = `
    <div class="hud">
      <div class="hud__status" id="hud-status">${t('hud.coords')}: 0.000, 0.000</div>
      <div class="hud__zoom">
        <span class="hud__zoom-sign">−</span>
        <input id="hud-zoom" class="hud__slider" type="range" min="0" max="1" step="0.01" value="0.4"
               aria-label="Zoom" />
        <span class="hud__zoom-sign">+</span>
      </div>
      <div class="hud__views">
        <button class="view-btn" data-view-mode="2d" title="Planta ortográfica">${icon('plan2d', 14)}<span>${t('hud.view2d')}</span></button>
        <button class="view-btn is-active" data-view-mode="3d" title="Vista 3D orbital">${icon('cube', 14)}<span>${t('hud.view3d')}</span></button>
        <button class="view-btn view-btn--accent" data-convert-plan title="Generar la planta del modelo">${t('hud.convert')}</button>
      </div>
    </div>
  `

  const statusEl = container.querySelector<HTMLDivElement>('#hud-status')!
  const slider = container.querySelector<HTMLInputElement>('#hud-zoom')!
  const viewButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-view-mode]')]

  slider.addEventListener('input', () => options.onZoomFraction(parseFloat(slider.value)))

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.viewMode as ViewMode
      viewButtons.forEach((other) => other.classList.toggle('is-active', other === btn))
      options.onViewMode(mode)
    })
  })

  container.querySelector<HTMLButtonElement>('[data-convert-plan]')?.addEventListener('click', () => {
    options.onConvertToPlan()
  })

  return {
    setZoomFraction(fraction01: number): void {
      slider.value = fraction01.toString()
    },
    setViewMode(mode: ViewMode): void {
      viewButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.viewMode === mode))
    },
    setStatusCoordinates(x: number, z: number): void {
      statusEl.textContent = `${t('hud.coords')}: ${x.toFixed(3)}, ${z.toFixed(3)}`
    },
    setStatusText(text: string): void {
      statusEl.textContent = text
    }
  }
}
