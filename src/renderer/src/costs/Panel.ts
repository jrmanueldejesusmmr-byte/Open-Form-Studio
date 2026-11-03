/** Panel de Costos / Presupuesto. Vista sobre los módulos de cálculo puro
 * (`takeoff.ts`, `quote.ts`, `rows.ts`). Precios solo los que escribe el
 * usuario; se guardan en local. Resalta elementos en 3D al hacer clic y
 * muestra etiquetas de cota sobre cada muro (con toggle).
 */
import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { ViewportRenderer } from '../engine/ViewportRenderer'
import { buildRows, categoryLabel, type CostRow, type CostRowsResult, type CostDetailItem } from './rows'
import { toCsv, toPrintableHtml, ESTIMATE_DISCLAIMER } from './exporters'
import { makeWallLabel, type WallDimLabel } from './labels'
import { loadStore, saveStore } from './store'
import type { CostParams, CostPrices } from './types'
import { icon } from '../ui/icons'
import './Panel.css'

const PRICE_CATEGORIES = ['muros', 'slabs', 'roofs', 'puertas', 'ventanas', 'muebles'] as const
type PriceCategory = (typeof PRICE_CATEGORIES)[number]

export class CostPanel {
  private readonly root: HTMLElement
  private readonly scene: SceneManager
  private readonly viewport: ViewportRenderer
  private readonly container: HTMLElement

  prices: CostPrices
  params: CostParams
  private result: CostRowsResult = {
    rows: [],
    subtotal: 0,
    withLabour: 0,
    beforeTax: 0,
    total: 0,
    details: [],
    totals: {
      wallLinearLength: 0,
      builtArea: 0,
      doorCount: 0,
      windowCount: 0,
      furnitureCount: 0,
      total: 0
    }
  }
  private showDims = true
  private labelLayer: HTMLDivElement | null = null
  private labelSpans = new Map<string, HTMLSpanElement>()
  private unsubs: Array<() => void> = []

  constructor(scene: SceneManager, viewport: ViewportRenderer, container: HTMLElement) {
    this.scene = scene
    this.viewport = viewport
    this.container = container

    const store = loadStore()
    this.prices = store.prices
    this.params = store.params

    this.root = document.createElement('div')
    this.root.id = 'cost-panel'
    this.root.className = 'cost-panel'
    this.root.innerHTML = this.template()
    container.appendChild(this.root)

    this.ensureLabelLayer()
    this.syncParamInputs()
    this.syncPriceInputs()
    this.mountEvents()
    this.bindScene()
    this.update()
    this.startLabelLoop()
  }

  private readonly $ = (sel: string): HTMLElement | null => this.root.querySelector(sel)

  /** Rellena los inputs de parámetros con los valores persistidos. */
  private syncParamInputs(): void {
    const set = (id: string, value: string): void => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`)
      if (input) input.value = value
    }
    set('params-wastage', String(this.params.wastagePct))
    set('params-labour', String(this.params.labourMultiplier))
    set('params-contingency', String(this.params.contingencyPct))
    set('params-tax', String(this.params.taxPct))
    set('params-round', String(this.params.roundTo))
    set('params-currency', this.params.currencySymbol)
  }

  /** Rellena los inputs de precios con los valores persistidos. */
  private syncPriceInputs(): void {
    for (const key of PRICE_CATEGORIES) {
      const input = this.root.querySelector<HTMLInputElement>(`#price-${key}`)
      if (input) input.value = this.prices[key] != null ? String(this.prices[key]) : ''
    }
  }


  private template(): string {
    const cats = ['muros', 'slabs', 'roofs', 'puertas', 'ventanas', 'muebles'] as const
    const priceInputs = cats
      .map((key) => {
        const label =
          key === 'muros'
            ? 'Muros (m²)'
            : key === 'slabs'
              ? 'Losa (m²)'
              : key === 'roofs'
                ? 'Techo (m²)'
                : key === 'puertas'
                  ? 'Puerta (ud)'
                  : key === 'ventanas'
                    ? 'Ventana (ud)'
                    : 'Mueble (ud)'
        return `<label>${label} <input id="price-${key}" type="number" min="0" step="0.01" placeholder="0"></label>`
      })
      .join('')

    return `
      <div class="cost-panel__header">
        <div class="cost-panel__title">
          <span class="icon">${icon('calculator', 20)}</span>
          <span>Costos / Presupuesto</span>
        </div>
        <div class="cost-panel__actions">
          <button id="btn-export-csv" class="btn">CSV</button>
          <button id="btn-export-pdf" class="btn">PDF</button>
        </div>
      </div>

      <div class="cost-panel__tabs" role="tablist">
        <button class="cost-panel__tab cost-panel__tab--active" data-tab="resumen" role="tab" aria-selected="true">Resumen</button>
        <button class="cost-panel__tab" data-tab="detalle" role="tab" aria-selected="false">Detalle</button>
      </div>

      <section class="cost-panel__section cost-panel__section--summary">
        <div class="cost-panel__section-head"><span>Totales (siempre visibles)</span></div>
        <div class="cost-panel__summary">
          <div class="cost-sum-row"><span>Metros lineales de muros</span><strong id="total-wall-length">0.00 m</strong></div>
          <div class="cost-sum-row"><span>Área total construida</span><strong id="total-built-area">0.00 m²</strong></div>
          <div class="cost-sum-row"><span>Puertas</span><strong id="total-doors">0</strong></div>
          <div class="cost-sum-row"><span>Ventanas</span><strong id="total-windows">0</strong></div>
          <div class="cost-sum-row"><span>Muebles</span><strong id="total-furniture">0</strong></div>
          <div class="cost-sum-row"><span>Total general</span><strong id="total-general">$0.00</strong></div>
          <div class="cost-sum-row notes">${ESTIMATE_DISCLAIMER}</div>
        </div>
      </section>

      <section class="cost-panel__section">
        <div class="cost-panel__section-head">
          <span id="tab-content-resumen" role="tabpanel">Resumen</span>
          <span class="cost-panel__count" id="table-count">0 líneas</span>
        </div>
        <div class="cost-panel__table-wrapper">
          <table id="cost-table" class="cost-panel__table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th>Precio unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody id="cost-table-body"></tbody>
          </table>
        </div>
      </section>

      <section class="cost-panel__section" id="tab-content-detalle" role="tabpanel" hidden>
        <div class="cost-panel__section-head"><span>Detalle</span></div>
        <div class="cost-panel__table-wrapper">
          <table id="cost-detail-table" class="cost-panel__table cost-panel__table--detail">
            <thead>
              <tr>
                <th>Elemento</th>
                <th style="text-align:right">Medidas</th>
                <th style="text-align:right">&nbsp;</th>
              </tr>
            </thead>
            <tbody id="cost-detail-body"></tbody>
          </table>
        </div>
      </section>
    `
  }

  private mountEvents(): void {
    for (const key of PRICE_CATEGORIES) {
      this.root.querySelector<HTMLInputElement>(`#price-${key}`)?.addEventListener('input', (e) => {
        const v = parseFloat((e.target as HTMLInputElement).value)
        this.prices[key] = Number.isFinite(v) ? v : 0
        this.persist()
        this.scheduleUpdate()
      })
    }
    this.bindParamNum('params-wastage', (v) => (this.params.wastagePct = v))
    this.bindParamNum('params-labour', (v) => (this.params.labourMultiplier = v))
    this.bindParamNum('params-contingency', (v) => (this.params.contingencyPct = v))
    this.bindParamNum('params-tax', (v) => (this.params.taxPct = v))
    this.bindParamNum('params-round', (v) => (this.params.roundTo = v))
    this.bindParam('params-currency', (v) => (this.params.currencySymbol = v))

    this.root.querySelector<HTMLInputElement>('#toggle-dims')?.addEventListener('change', (e) => {
      this.showDims = (e.target as HTMLInputElement).checked
      this.renderLabels()
    })

    // Pestañas: resumen / detalle.
    for (const tab of this.root.querySelectorAll<HTMLButtonElement>('.cost-panel__tab')) {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab ?? 'resumen'))
    }
    this.root.querySelector<HTMLButtonElement>('#btn-export-csv')?.addEventListener('click', () => this.exportCsv())
    this.root.querySelector<HTMLButtonElement>('#btn-export-pdf')?.addEventListener('click', () => this.exportPdf())

    // En la vista detalle, el clic en una fila resalta el elemento en 3D y
    // lo expande (si no estaba ya abierto).
    this.root.querySelector<HTMLTableElement>('#cost-detail-table')?.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('tr.detail-row') as HTMLTableRowElement | null
      if (!row) return
      const itemId = row.dataset.detailId
      if (!itemId) return
      this.toggleDetailRow(itemId)
      this.highlightDetailItem(itemId)
    })
  }

  private switchTab(tab: string): void {
    for (const t of this.root.querySelectorAll<HTMLButtonElement>('.cost-panel__tab')) {
      const active = t.dataset.tab === tab
      t.classList.toggle('cost-panel__tab--active', active)
      t.setAttribute('aria-selected', String(active))
    }
    this.root.querySelector<HTMLElement>('#tab-content-resumen')!.hidden = tab !== 'resumen'
    this.root.querySelector<HTMLElement>('#tab-content-detalle')!.hidden = tab !== 'detalle'
  }

  /** Enlaza un parámetro de texto (símbolo de moneda). */
  private bindParam(id: string, apply: (v: string) => void): void {
    this.root.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', (e) => {
      apply((e.target as HTMLInputElement).value.trim() || '$')
      this.persist()
      this.scheduleUpdate()
    })
  }

  /** Enlaza un parámetro numérico (%, multiplicador, redondeo). */
  private bindParamNum(id: string, apply: (v: number) => void): void {
    this.root.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value)
      apply(Number.isFinite(v) ? v : 0)
      this.persist()
      this.scheduleUpdate()
    })
  }

  private persist(): void {
    saveStore({ prices: this.prices, params: this.params })
  }

  /** Suscribe los eventos de la escena para recalcular en vivo. */
  private bindScene(): void {
    const bump = (): void => this.update()
    this.scene.onWallAdded(bump)
    this.scene.onWallRemoved(bump)
    this.scene.onWallChanged(bump)
    this.scene.onWallMoved(bump)
    this.scene.onObjectAdded(bump)
    this.scene.onObjectRemoved(bump)
    this.scene.onObjectChanged(bump)
    this.scene.onObjectMoved(bump)
    this.scene.onLevelsChanged(bump)
  }

  /** Debounce de ~150 ms para no recalcular en cada cambio rápido del modelo. */
  private scheduledUpdate = -1
  private scheduleUpdate(): void {
    window.clearTimeout(this.scheduledUpdate)
    this.scheduledUpdate = window.setTimeout(() => {
      this.update()
      this.scheduledUpdate = -1
    }, 150)
  }

  update(): void {
    this.result = buildRows(this.scene, this.prices, this.params)
    this.renderSummary()
    this.renderTable()
    this.renderDetail()
  }

  private renderSummary(): void {
    const t = this.result.totals
    const $ = (id: string): HTMLElement | null => this.root.querySelector(`#${id}`)

    const wallLength = $(`total-wall-length`)
    if (wallLength) wallLength.textContent = `${t.wallLinearLength.toFixed(2)} m`
    const builtArea = $(`total-built-area`)
    if (builtArea) builtArea.textContent = `${t.builtArea.toFixed(2)} m²`
    const doors = $(`total-doors`)
    if (doors) doors.textContent = String(t.doorCount)
    const windows = $(`total-windows`)
    if (windows) windows.textContent = String(t.windowCount)
    const furniture = $(`total-furniture`)
    if (furniture) furniture.textContent = String(t.furnitureCount)
    const general = $(`total-general`)
    if (general) general.textContent = this.p(this.result.total)
  }

  private renderTable(): void {
    const body = this.$('#cost-table-body')
    if (!body) return
    body.innerHTML = ''
    for (const row of this.result.rows) {
      const tr = document.createElement('tr')
      tr.dataset.rowId = row.id
      tr.innerHTML = `
        <td>${this.esc(row.levelName)} ${this.esc(categoryLabel(row.category))}</td>
        <td>${this.formatQty(row.qty)}</td>
        <td>${this.esc(row.unit)}</td>
        <td style="text-align:right">${this.p(row.unitPrice)}</td>
        <td style="text-align:right">${this.p(row.subtotal)}</td>
      `.trim()
      body.appendChild(tr)
    }
    const count = this.$('#table-count')
    if (count) count.textContent = `${this.result.rows.length} línea(s)`
  }

  /** Renderiza la vista "Detalle": una fila por elemento individual. */
  private renderDetail(): void {
    const body = this.$('#cost-detail-body')
    if (!body) return
    body.innerHTML = ''
    if (this.result.details.length === 0) {
      const tr = document.createElement('tr')
      tr.innerHTML = `<td colspan="3" style="color:#9aa4b2;text-align:center">Sin elementos en costos.</td>`
      body.appendChild(tr)
      return
    }
    for (const item of this.result.details) {
      const tr = document.createElement('tr')
      tr.className = 'detail-row'
      tr.dataset.detailId = item.id
      const label = document.createElement('td')
      label.className = 'detail-label'
      label.textContent = item.label
      const measures = document.createElement('td')
      measures.style.textAlign = 'right'
      measures.textContent = this.detailMeasures(item)
      const toggle = document.createElement('td')
      toggle.style.textAlign = 'right'
      const btn = document.createElement('button')
      btn.className = 'link detail-toggle'
      btn.textContent = !!item.isOpen ? '–' : '+'
      btn.title = !!item.isOpen ? 'Ocultar detalle' : 'Ver detalle'
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.toggleDetailRow(item.id)
      })
      toggle.appendChild(btn)
      tr.appendChild(label)
      tr.appendChild(measures)
      tr.appendChild(toggle)
      body.appendChild(tr)
    }
  }

  /** Alterna la visibilidad del detalle de un elemento. */
  private toggleDetailRow(id: string): void {
    for (const item of this.result.details) {
      if (item.id !== id) continue
      item.isOpen = !item.isOpen
      break
    }
    this.renderDetail()
  }

  private getDetailItem(id: string): CostDetailItem | undefined {
    return this.result.details.find((d) => d.id === id)
  }

  /** Resalta un elemento en 3D (muro u objeto) según sus ids, y desmarca el resto. */
  private highlightDetailItem(id: string): void {
    const item = this.getDetailItem(id)
    if (!item) return
    const ids = new Set(item.ids)
    for (const wall of this.scene.getWalls()) wall.isSelected = ids.has(wall.id)
    for (const object of this.scene.getObjects()) object.isSelected = ids.has(object.id)
    this.scene.notifySelectionChanged()
  }

  /** Mide un elemento individual para mostrar en la columna "Medidas". */
  private detailMeasures(item: CostDetailItem): string {
    const parts: string[] = []
    if (item.length != null && item.length > 0) parts.push(`${item.length.toFixed(2)} m`)
    if (item.height != null && item.height > 0) parts.push(`${item.height.toFixed(2)} m`)
    if (item.thickness != null && item.thickness > 0) parts.push(`${item.thickness.toFixed(2)} m`)
    if (item.width != null && item.width > 0) parts.push(`${item.width.toFixed(2)} m`)
    if (item.depth != null && item.depth > 0) parts.push(`${item.depth.toFixed(2)} m`)
    if (item.grossArea != null && item.grossArea > 0) parts.push(`${item.grossArea.toFixed(2)} m²`)
    if (item.netArea != null && item.netArea > 0) parts.push(`${item.netArea.toFixed(2)} m²`)
    if (item.volume != null && item.volume > 0) parts.push(`${item.volume.toFixed(2)} m³`)
    return parts.length > 0 ? parts.join(' · ') : '—'
  }

  private formatQty(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(2)
  }

  private p(v: number, sym: string = this.params.currencySymbol): string {
    return `${sym}${v.toFixed(2)}`
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c] as string)
  }

  private escAttr(s: string): string {
    return this.esc(s).replace(/\s+/g, '_')
  }

  /* ---------- Etiquetas de cota sobre los muros ---------- */

  /** Crea (una sola vez) la capa de etiquetas sobre el contenedor del lienzo. */
  private ensureLabelLayer(): void {
    if (this.labelLayer) return
    const layer = document.createElement('div')
    layer.id = 'cost-dim-labels'
    layer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;'
    // La capa vive junto al canvas para que herede su sistema de coordenadas.
    // El panel puede estar en el dock lateral (que recorta con overflow), así
    // que se busca el contenedor del lienzo por id y se cae al propio panel.
    const parent = document.getElementById('viewport-container') ?? this.container
    parent.appendChild(layer)
    this.labelLayer = layer
  }

  /** Recoloca las etiquetas en un bucle de animación (sigue a la cámara). */
  private startLabelLoop(): void {
    const tick = (): void => {
      this.positionLabels()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /** Reconstruye los spans de etiqueta a partir de los muros de la escena. */
  private renderLabels(): void {
    if (!this.labelLayer) return
    this.labelSpans.clear()
    this.labelLayer.innerHTML = ''
    if (!this.showDims) return
    for (const wall of this.scene.getWalls()) {
      const label = makeWallLabel(wall.id, wall.start, wall.end, wall.height)
      const span = document.createElement('span')
      span.className = 'cost-dim-label'
      span.textContent = label.text
      span.dataset.wallId = wall.id
      span.style.cssText =
        'position:absolute;transform:translate(-50%,-50%);background:rgba(10,12,16,.82);' +
        'color:#e8eaed;font-size:11px;padding:1px 5px;border-radius:3px;white-space:nowrap;'
      this.labelLayer.appendChild(span)
      this.labelSpans.set(wall.id, span)
    }
    this.positionLabels()
  }

  /** Coloca cada etiqueta proyectando su ancla a pantalla. */
  private positionLabels(): void {
    if (!this.showDims || !this.labelLayer) return
    for (const wall of this.scene.getWalls()) {
      const span = this.labelSpans.get(wall.id)
      if (!span) continue
      const label = makeWallLabel(wall.id, wall.start, wall.end, wall.height)
      const anchor = new THREE.Vector3(label.anchor.x, label.anchor.y, label.anchor.z)
      const pos = this.viewport.worldToScreen(anchor)
      if (!pos) {
        span.style.display = 'none'
        continue
      }
      span.style.display = ''
      span.style.left = `${pos.x}px`
      span.style.top = `${pos.y}px`
    }
  }

  /* ---------- Exportación ---------- */

  /** Descarga la tabla por piso/categoría como CSV. */
  private exportCsv(): void {
    const csv = toCsv(this.result, this.params.currencySymbol)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cotizacion.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Abre la «Cotización» imprimible (tabla, totales, fecha y aviso) y la imprime. */
  private exportPdf(): void {
    const html = toPrintableHtml(this.result, this.params.currencySymbol, new Date().toISOString().slice(0, 10))
    const win = window.open('', '_blank', 'width=820,height=900')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    // Tras pintar, abre el diálogo de impresión (equivale a «Guardar como PDF»).
    win.addEventListener('load', () => win.print())
  }
}

/** Fábrica usada por `mountWorkspace` para montar el panel en `#cost-panel`. */
export function mountCostPanel(
  container: HTMLElement,
  deps: { scene: SceneManager; viewport: ViewportRenderer }
): CostPanel {
  return new CostPanel(deps.scene, deps.viewport, container)
}
