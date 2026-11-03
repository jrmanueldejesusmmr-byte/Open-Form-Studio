import { colorToHex, LAYER_PALETTE, Layer, LineType } from '../models/Layer'
import { icon } from './icons'
import { t } from '../i18n/es'

/**
 * Panel "Layers & Properties": gestión de capas (visibilidad, bloqueo, color
 * y tipo de línea) más las propiedades de la capa activa. La visibilidad y el
 * color se aplican a la geometría real a través de `LayerManager` +
 * `ViewportRenderer`.
 */

export interface LayersPanelOptions {
  layers: readonly Layer[]
  onToggleVisible: (layerId: string) => void
  onToggleLocked: (layerId: string) => void
  onChangeLineType: (layerId: string, lineType: LineType) => void
  onChangeColor: (layerId: string, color: number) => void
  onChangeProperty: (layerId: string, property: 'material' | 'core' | 'zone', value: string) => void
  onSetAllVisible: (visible: boolean) => void
  onSetAllLocked: (locked: boolean) => void
}

export interface LayersPanelHandle {
  /** Repinta el panel tras un cambio en el modelo de capas. */
  refresh: () => void
}

const CORE_OPTIONS = ['Núcleo 0.20 m', 'Núcleo 0.30 m', 'Núcleo 0.50 m', 'Sin núcleo']
const MATERIAL_OPTIONS = ['Hormigón', 'Ladrillo', 'Madera', 'Acero', 'Vidrio', 'Yeso']
const ZONE_OPTIONS = ['Malla', 'Sólido', 'Hueco']

function renderLayerRow(layer: Layer, selected: boolean): string {
  return `<div class="layer-row${selected ? ' is-selected' : ''}${layer.visible ? '' : ' is-hidden-layer'}"
               data-layer="${layer.id}" title="${layer.name}">
      <button class="icon-btn icon-btn--tiny" data-layer-action="visible"
              title="${layer.visible ? 'Ocultar capa' : 'Mostrar capa'}">${icon(layer.visible ? 'eye' : 'eyeOff', 13)}</button>
      <button class="icon-btn icon-btn--tiny" data-layer-action="locked"
              title="${layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}">${icon(layer.locked ? 'lock' : 'unlock', 13)}</button>
      <span class="layer-row__swatch" style="background:${colorToHex(layer.color)}"></span>
      <span class="layer-row__name">${layer.name}</span>
      <span class="layer-row__line">${layer.lineType}</span>
    </div>`
}

function renderPropertyRow(label: string, control: string): string {
  return `<div class="prop-row">
      <span class="prop-row__label">${label}</span>
      <div class="prop-row__control">${control}</div>
    </div>`
}

function renderSelect(property: string, current: string, values: readonly string[]): string {
  return `<select class="prop-select" data-prop="${property}">
      ${values
        .map((value) => `<option value="${value}"${value === current ? ' selected' : ''}>${value}</option>`)
        .join('')}
    </select>`
}

/* ---------- Montaje ---------- */

export function mountLayersPanel(container: HTMLElement, options: LayersPanelOptions): LayersPanelHandle {
  let selectedLayerId = options.layers[0]?.id ?? ''
  let paletteLayerId: string | null = null
  let allVisible = true
  let allLocked = false

  container.innerHTML = `
    <header class="panel__head">
      <span class="panel__title">${icon('layers', 14)} ${t('panel.layers')}</span>
      <div class="panel__icons">
        <button class="icon-btn" data-panel-action="visible-all" title="Mostrar / ocultar todas las capas">${icon('eye', 14)}</button>
        <button class="icon-btn" data-panel-action="lock-all" title="Bloquear / desbloquear todas las capas">${icon('lock', 14)}</button>
        <button class="icon-btn" data-panel-action="collapse-all" title="Plegar / desplegar secciones">${icon('sliders', 14)}</button>
        <button class="icon-btn" data-panel-action="palette-quick" title="Color de la capa activa">${icon('palette', 14)}</button>
        <button class="icon-btn" data-panel-close title="Cerrar panel lateral">${icon('close', 14)}</button>
      </div>
    </header>
    <div class="panel__body" id="layers-body"></div>
  `

  const body = container.querySelector<HTMLDivElement>('#layers-body')!

  const selectedLayer = (): Layer | undefined =>
    options.layers.find((layer) => layer.id === selectedLayerId) ?? options.layers[0]

  function render(): void {
    const layer = selectedLayer()
    if (!layer) {
      body.innerHTML = '<p class="panel__empty">Este proyecto aún no tiene capas.</p>'
      return
    }

    body.innerHTML = `
      <section class="acc is-open">
        <button class="acc__head">
          <span class="acc__chevron">${icon('chevronDown', 14)}</span>
          <span class="acc__title">${t('section.properties')} · ${layer.name}</span>
        </button>
        <div class="acc__body">
          ${renderPropertyRow(t('layer.lineType'), renderSelect('lineType', layer.lineType, Object.values(LineType)))}
          ${renderPropertyRow(
            t('layer.color'),
            `<button class="color-control" data-layer-action="palette">
               <span class="color-control__swatch" style="background:${colorToHex(layer.color)}"></span>
               <span class="color-control__name">${nameForColor(layer.color)}</span>
               ${icon('chevronDown', 12)}
             </button>
             ${
               paletteLayerId === layer.id
                 ? `<div class="color-palette">${LAYER_PALETTE.map(
                     (entry) =>
                       `<button class="color-palette__swatch" data-color="${entry.color}" title="${entry.name}"
                                style="background:${colorToHex(entry.color)}"></button>`
                   ).join('')}</div>`
                 : ''
             }`
          )}
          ${renderPropertyRow(t('layer.core'), renderSelect('core', layer.core, CORE_OPTIONS))}
          ${renderPropertyRow(t('layer.material'), renderSelect('material', layer.material, MATERIAL_OPTIONS))}
          ${renderPropertyRow(t('layer.zone'), renderSelect('zone', layer.zone, ZONE_OPTIONS))}
        </div>
      </section>

      <section class="acc is-open">
        <button class="acc__head">
          <span class="acc__chevron">${icon('chevronDown', 14)}</span>
          <span class="acc__title">${t('section.layers')}</span>
          <span class="acc__count">${options.layers.length}</span>
        </button>
        <div class="acc__body acc__body--flush">
          <div class="layer-list">
            ${options.layers.map((entry) => renderLayerRow(entry, entry.id === layer.id)).join('')}
          </div>
        </div>
      </section>
    `

    bind()
  }

  function nameForColor(color: number): string {
    return LAYER_PALETTE.find((entry) => entry.color === color)?.name ?? colorToHex(color)
  }

  /** Reconecta los controles después de cada repintado. */
  function bind(): void {
    body.querySelectorAll<HTMLElement>('.acc__head').forEach((head) => {
      head.addEventListener('click', () => head.closest('.acc')?.classList.toggle('is-open'))
    })

    body.querySelectorAll<HTMLDivElement>('.layer-row').forEach((row) => {
      const layerId = row.dataset.layer ?? ''

      row.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('[data-layer-action]')) return
        selectedLayerId = layerId
        paletteLayerId = null
        render()
      })

      row.querySelector('[data-layer-action="visible"]')?.addEventListener('click', () => options.onToggleVisible(layerId))
      row.querySelector('[data-layer-action="locked"]')?.addEventListener('click', () => options.onToggleLocked(layerId))
    })

    const layer = selectedLayer()
    if (layer) {
      body.querySelector<HTMLSelectElement>('[data-prop="lineType"]')?.addEventListener('change', (event) => {
        options.onChangeLineType(layer.id, (event.target as HTMLSelectElement).value as LineType)
      })

      ;(['material', 'core', 'zone'] as const).forEach((property) => {
        body.querySelector<HTMLSelectElement>(`[data-prop="${property}"]`)?.addEventListener('change', (event) => {
          options.onChangeProperty(layer.id, property, (event.target as HTMLSelectElement).value)
        })
      })

      body.querySelector('[data-layer-action="palette"]')?.addEventListener('click', () => {
        paletteLayerId = paletteLayerId === layer.id ? null : layer.id
        render()
      })

      body.querySelectorAll<HTMLButtonElement>('.color-palette__swatch').forEach((swatch) => {
        swatch.addEventListener('click', () => {
          const color = Number(swatch.dataset.color)
          paletteLayerId = null
          options.onChangeColor(layer.id, color)
        })
      })
    }

  }

  container.querySelector('[data-panel-action="visible-all"]')?.addEventListener('click', () => {
    allVisible = !allVisible
    options.onSetAllVisible(allVisible)
  })

  container.querySelector('[data-panel-action="lock-all"]')?.addEventListener('click', () => {
    allLocked = !allLocked
    options.onSetAllLocked(allLocked)
  })

  container.querySelector('[data-panel-action="collapse-all"]')?.addEventListener('click', () => {
    const sections = [...body.querySelectorAll<HTMLElement>('.acc')]
    const collapse = sections.some((section) => section.classList.contains('is-open'))
    sections.forEach((section) => section.classList.toggle('is-open', !collapse))
  })

  container.querySelector('[data-panel-action="palette-quick"]')?.addEventListener('click', () => {
    const layer = selectedLayer()
    if (!layer) return
    paletteLayerId = paletteLayerId === layer.id ? null : layer.id
    render()
  })

  render()

  return {
    refresh(): void {
      render()
    }
  }
}
