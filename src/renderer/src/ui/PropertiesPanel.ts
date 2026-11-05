/**
 * Panel de propiedades arquitectónicas BIM de aberturas (Puertas y Ventanas).
 *
 * Características:
 * - Selector rápido de medidas estándar normalizadas (módulos arquitectónicos).
 * - Control interactivo de abatimiento CAD (Flip mano: Izq/Der y Flip apertura: In/Out).
 * - Catálogo de estilos 3D (Lisa moderna, 6 paneles clásica, con visor, francesa, etc.).
 * - Control de apertura y animación 3D en tiempo real (0° a 90°).
 * - Sincronización bidireccional inmediata con el corte del muro en 2D y 3D.
 */
import { SceneObject } from '../models/SceneObject'
import type { SceneManager } from '../engine/SceneManager'
import {
  ARCHITECTURAL_DOOR_PRESETS,
  ARCHITECTURAL_WINDOW_PRESETS,
  SILL_PRESETS,
  DOOR_STYLES,
  WINDOW_STYLES,
  type DoorStyle,
  type WindowStyle,
  type SwingHand,
  type SwingDirection
} from '../models/Opening'
import { resolveObjectOpeningSpec } from '../engine/WallMeshBuilder'
import { toggleSwingHand, toggleSwingDirection } from '../engine/Opening2DSymbology'

export interface DoorPropertiesPanelOptions {
  object: SceneObject
  scene?: SceneManager | null
  onChange?: (props: Partial<OpeningProperties>) => void
  onClose?: () => void
}

export interface OpeningProperties {
  variant: string
  style: string | null
  width: number
  height: number
  sill: number
  leafMaterialId: string | null
  frameMaterialId: string | null
  swingHand: SwingHand
  swingDirection: SwingDirection
  openingAngle: number
  handleVisible: boolean
}

let activePanelEl: HTMLElement | null = null

export function DoorPropertiesPanel(options: DoorPropertiesPanelOptions): HTMLElement {
  const { object, scene, onChange, onClose } = options

  // Si ya existe un panel activo, eliminarlo para recrear limpio
  if (activePanelEl) {
    activePanelEl.remove()
    activePanelEl = null
  }

  const spec = resolveObjectOpeningSpec(object)
  const isDoor = spec?.type === 'door' || object.shapeId?.includes('door') || object.name.toLowerCase().includes('puerta')

  const container = document.createElement('div')
  container.className = 'properties-panel opening-cad-panel'
  activePanelEl = container

  // Valores iniciales
  let currentWidth = Math.round(object.size.x * 100) / 100
  let currentHeight = Math.round(object.size.y * 100) / 100
  let currentAngle = Math.round(object.openingAngle ?? 0)
  let currentSwingHand: SwingHand = object.swingHand ?? 'left'
  let currentSwingDir: SwingDirection = object.swingDirection ?? 'in'
  let currentDoorStyle: DoorStyle = (object.doorStyle ?? (object.openingVariant === 'doble' ? 'dobleHoja' : 'lisa')) as DoorStyle
  let currentWindowStyle: WindowStyle = (object.windowStyle ?? 'corrediza2') as WindowStyle

  // Obtener antepecho actual desde el muro anfitrión si existe
  let currentSill = 0
  if (!isDoor) {
    if (scene && object.openingId) {
      for (const wall of scene.getWalls()) {
        const op = wall.openings.find((o) => o.id === object.openingId)
        if (op) {
          currentSill = op.sill
          break
        }
      }
    } else {
      currentSill = Math.max(0, object.position.y)
    }
  }

  // Generar opciones de estilos
  const stylesList = isDoor ? DOOR_STYLES : WINDOW_STYLES
  const currentActiveStyle = isDoor ? currentDoorStyle : currentWindowStyle

  const styleCardsHtml = stylesList
    .map(
      (st) => `
      <button type="button" class="style-choice-card ${st.id === currentActiveStyle ? 'is-active' : ''}" data-style-id="${st.id}">
        <span class="style-card-title">${st.label}</span>
        <span class="style-card-desc">${st.description}</span>
      </button>
    `
    )
    .join('')

  // Generar chips de medidas estándar
  const doorSimplePresets = ARCHITECTURAL_DOOR_PRESETS.filter((p) => p.category === 'door-simple')
  const doorDoublePresets = ARCHITECTURAL_DOOR_PRESETS.filter((p) => p.category === 'door-double')

  const doorSimpleChips = doorSimplePresets
    .map(
      (p) => `
      <button type="button" class="preset-chip ${Math.abs(p.width - currentWidth) < 0.02 ? 'is-selected' : ''}" data-w="${p.width}" data-h="${p.height}" data-s="${p.sill}" title="${p.description}">
        ${p.label}
      </button>
    `
    )
    .join('')

  const doorDoubleChips = doorDoublePresets
    .map(
      (p) => `
      <button type="button" class="preset-chip ${Math.abs(p.width - currentWidth) < 0.02 ? 'is-selected' : ''}" data-w="${p.width}" data-h="${p.height}" data-s="${p.sill}" title="${p.description}">
        ${p.label}
      </button>
    `
    )
    .join('')

  const windowChips = ARCHITECTURAL_WINDOW_PRESETS
    .map(
      (p) => `
      <button type="button" class="preset-chip ${Math.abs(p.width - currentWidth) < 0.02 ? 'is-selected' : ''}" data-w="${p.width}" data-h="${p.height}" data-s="${p.sill}" title="${p.description}">
        ${p.label}
      </button>
    `
    )
    .join('')

  const sillChips = SILL_PRESETS
    .map(
      (s) => `
      <button type="button" class="preset-chip ${Math.abs(s.value - currentSill) < 0.02 ? 'is-selected' : ''}" data-sill-val="${s.value}">
        ${s.label}
      </button>
    `
    )
    .join('')

  container.innerHTML = `
    <div class="panel-header">
      <div class="header-title-box">
        <span class="header-icon">${isDoor ? '🚪' : '🪟'}</span>
        <div>
          <h3>${isDoor ? 'Puerta Arquitectónica BIM' : 'Ventana Arquitectónica BIM'}</h3>
          <p class="header-subtitle">${object.name} · Live CAD & 3D Sync</p>
        </div>
      </div>
      <button class="panel-close" aria-label="Cerrar panel">&times;</button>
    </div>

    <div class="panel-body">
      <!-- 1. Control de Abatimiento CAD / Flip -->
      <div class="panel-section flip-section">
        <label class="section-label">📐 Sentido y Abatimiento CAD (2D / 3D)</label>
        <div class="flip-buttons-row">
          <button type="button" class="btn-flip btn-flip-hand" title="Cambiar de lado la bisagra (Tecla [F])">
            <span class="flip-icon">↔</span>
            <span class="flip-text">Mano: <strong id="lbl-hand">${currentSwingHand === 'left' ? 'Izquierda' : 'Derecha'}</strong></span>
          </button>
          <button type="button" class="btn-flip btn-flip-dir" title="Invertir si abre hacia adentro o afuera (Tecla [Shift+F] o [Tab])">
            <span class="flip-icon">↕</span>
            <span class="flip-text">Apertura: <strong id="lbl-dir">${currentSwingDir === 'in' ? 'Interior' : 'Exterior'}</strong></span>
          </button>
        </div>
        <div class="flip-tip">Atajo de teclado: pulsa <code>[F]</code> para invertir mano y <code>[Tab]</code> para invertir dirección.</div>
      </div>

      <!-- 2. Ángulo de Apertura 3D y Animación -->
      <div class="panel-section angle-section">
        <div class="angle-header">
          <label class="section-label">🎬 Apertura en 3D en tiempo real</label>
          <span class="angle-badge" id="lbl-angle">${currentAngle}°</span>
        </div>
        <div class="angle-control-row">
          <input type="range" class="slider-angle" id="slider-opening-angle" min="0" max="90" step="5" value="${currentAngle}" />
          <button type="button" class="btn-toggle-open" id="btn-toggle-open">
            ${currentAngle > 0 ? 'Cerrar' : 'Abrir 90°'}
          </button>
        </div>
      </div>

      <!-- 3. Catálogo de Diseños Arquitectónicos -->
      <div class="panel-section styles-section">
        <label class="section-label">🎨 Catálogo de Estilos de Diseño</label>
        <div class="styles-grid">
          ${styleCardsHtml}
        </div>
      </div>

      <!-- 4. Selector Rápido de Medidas Estándar Normalizadas -->
      <div class="panel-section presets-section">
        <label class="section-label">📏 Medidas Estándar de Arquitectura</label>
        ${
          isDoor
            ? `
          <div class="presets-group-title">Puertas Simples (Norma Accesible):</div>
          <div class="chips-container">${doorSimpleChips}</div>
          <div class="presets-group-title" style="margin-top: 8px;">Puertas Dobles / Principales:</div>
          <div class="chips-container">${doorDoubleChips}</div>
        `
            : `
          <div class="presets-group-title">Vanos Estándar de Ventana:</div>
          <div class="chips-container">${windowChips}</div>
          <div class="presets-group-title" style="margin-top: 8px;">Antepecho Normalizado:</div>
          <div class="chips-container">${sillChips}</div>
        `
        }
      </div>

      <!-- 5. Dimensiones Paramétricas Exactas -->
      <div class="panel-section dimensions-section">
        <label class="section-label">⚙️ Dimensiones Manuales (m)</label>
        <div class="dim-inputs-grid">
          <div class="dim-field">
            <span class="dim-label">Ancho (m)</span>
            <input type="number" class="form-input" id="input-dim-w" step="0.05" min="0.4" max="8.0" value="${currentWidth}" />
          </div>
          <div class="dim-field">
            <span class="dim-label">Alto (m)</span>
            <input type="number" class="form-input" id="input-dim-h" step="0.05" min="0.4" max="5.0" value="${currentHeight}" />
          </div>
          ${
            !isDoor
              ? `
            <div class="dim-field">
              <span class="dim-label">Antepecho (m)</span>
              <input type="number" class="form-input" id="input-dim-sill" step="0.05" min="0.0" max="3.0" value="${currentSill}" />
            </div>
          `
              : ''
          }
        </div>
      </div>

      <!-- 6. Materiales de Carpintería -->
      <div class="panel-section materials-section">
        <label class="section-label">🪵 Acabados y Materiales</label>
        <div class="mat-selectors-grid">
          <div class="form-group">
            <label>Material de Hoja</label>
            <select class="form-select" id="select-leaf-material">
              <option value="">Madera Nogal Estándar</option>
            </select>
          </div>
          <div class="form-group">
            <label>Material de Marco</label>
            <select class="form-select" id="select-frame-material">
              <option value="">Aluminio / Marco Estándar</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <button class="btn-save btn-primary" id="btn-done">Listo</button>
    </div>
  `

  // Inyectar estilos modernos si no están en el DOM
  ensurePanelStyles()

  // Referencias a los elementos
  const btnFlipHand = container.querySelector('.btn-flip-hand') as HTMLButtonElement
  const btnFlipDir = container.querySelector('.btn-flip-dir') as HTMLButtonElement
  const lblHand = container.querySelector('#lbl-hand') as HTMLElement
  const lblDir = container.querySelector('#lbl-dir') as HTMLElement
  const sliderAngle = container.querySelector('#slider-opening-angle') as HTMLInputElement
  const lblAngle = container.querySelector('#lbl-angle') as HTMLElement
  const btnToggleOpen = container.querySelector('#btn-toggle-open') as HTMLButtonElement
  const inputDimW = container.querySelector('#input-dim-w') as HTMLInputElement
  const inputDimH = container.querySelector('#input-dim-h') as HTMLInputElement
  const inputDimSill = container.querySelector('#input-dim-sill') as HTMLInputElement | null
  const selectLeafMat = container.querySelector('#select-leaf-material') as HTMLSelectElement
  const selectFrameMat = container.querySelector('#select-frame-material') as HTMLSelectElement
  const btnClose = container.querySelector('.panel-close') as HTMLButtonElement
  const btnDone = container.querySelector('#btn-done') as HTMLButtonElement

  // Aplicación reactiva de cambios sobre la escena y el objeto
  function applyChanges(notify = true): void {
    object.swingHand = currentSwingHand
    object.swingDirection = currentSwingDir
    object.openingAngle = currentAngle
    if (isDoor) {
      object.doorStyle = currentDoorStyle
    } else {
      object.windowStyle = currentWindowStyle
    }

    object.size.set(currentWidth, currentHeight, object.size.z)

    if (scene) {
      scene.updateObject(object.id, {
        size: object.size,
        openingAngle: currentAngle,
        doorStyle: isDoor ? currentDoorStyle : null,
        windowStyle: !isDoor ? currentWindowStyle : null,
        swingHand: currentSwingHand,
        swingDirection: currentSwingDir,
        leafMaterialId: selectLeafMat?.value || null,
        frameMaterialId: selectFrameMat?.value || null
      })

      // Actualizar hueco de muro si existe
      if (object.openingId) {
        for (const wall of scene.getWalls()) {
          const op = wall.openings.find((o) => o.id === object.openingId)
          if (op) {
            scene.updateOpening(wall.id, op.id, {
              width: currentWidth,
              height: currentHeight,
              sill: currentSill,
              style: isDoor ? currentDoorStyle : currentWindowStyle,
              swingHand: currentSwingHand,
              swingDirection: currentSwingDir,
              openingAngle: currentAngle
            })
            break
          }
        }
      }
    }

    if (notify && onChange) {
      onChange({
        variant: object.openingVariant ?? 'simple',
        style: isDoor ? currentDoorStyle : currentWindowStyle,
        width: currentWidth,
        height: currentHeight,
        sill: currentSill,
        swingHand: currentSwingHand,
        swingDirection: currentSwingDir,
        openingAngle: currentAngle,
        leafMaterialId: selectLeafMat?.value || null,
        frameMaterialId: selectFrameMat?.value || null,
        handleVisible: true
      })
    }
  }

  // 1. Manejo de Flip
  btnFlipHand?.addEventListener('click', () => {
    currentSwingHand = toggleSwingHand(currentSwingHand)
    lblHand.textContent = currentSwingHand === 'left' ? 'Izquierda' : 'Derecha'
    applyChanges()
  })

  btnFlipDir?.addEventListener('click', () => {
    currentSwingDir = toggleSwingDirection(currentSwingDir)
    lblDir.textContent = currentSwingDir === 'in' ? 'Interior' : 'Exterior'
    applyChanges()
  })

  // 2. Manejo de Ángulo y Animación
  sliderAngle?.addEventListener('input', () => {
    currentAngle = parseInt(sliderAngle.value) || 0
    lblAngle.textContent = `${currentAngle}°`
    btnToggleOpen.textContent = currentAngle > 0 ? 'Cerrar' : 'Abrir 90°'
    applyChanges()
  })

  btnToggleOpen?.addEventListener('click', () => {
    currentAngle = currentAngle > 0 ? 0 : 90
    sliderAngle.value = currentAngle.toString()
    lblAngle.textContent = `${currentAngle}°`
    btnToggleOpen.textContent = currentAngle > 0 ? 'Cerrar' : 'Abrir 90°'
    applyChanges()
  })

  // 3. Manejo de Estilos de Diseño
  container.querySelectorAll('.style-choice-card').forEach((card) => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.style-choice-card').forEach((c) => c.classList.remove('is-active'))
      card.classList.add('is-active')
      const styleId = card.getAttribute('data-style-id')
      if (styleId) {
        if (isDoor) {
          currentDoorStyle = styleId as DoorStyle
        } else {
          currentWindowStyle = styleId as WindowStyle
        }
        applyChanges()
      }
    })
  })

  // 4. Manejo de Presets de Medidas Estándar
  container.querySelectorAll('.preset-chip[data-w]').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.preset-chip[data-w]').forEach((c) => c.classList.remove('is-selected'))
      chip.classList.add('is-selected')

      const w = parseFloat(chip.getAttribute('data-w') || '0.9')
      const h = parseFloat(chip.getAttribute('data-h') || '2.1')
      const s = parseFloat(chip.getAttribute('data-s') || '0')

      currentWidth = w
      currentHeight = h
      currentSill = s

      inputDimW.value = w.toFixed(2)
      inputDimH.value = h.toFixed(2)
      if (inputDimSill) inputDimSill.value = s.toFixed(2)

      applyChanges()
    })
  })

  // Antepechos predefinidos
  container.querySelectorAll('.preset-chip[data-sill-val]').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.preset-chip[data-sill-val]').forEach((c) => c.classList.remove('is-selected'))
      chip.classList.add('is-selected')

      const s = parseFloat(chip.getAttribute('data-sill-val') || '0.9')
      currentSill = s
      if (inputDimSill) inputDimSill.value = s.toFixed(2)
      applyChanges()
    })
  })

  // 5. Manejo de Entradas Numéricas Manuales
  inputDimW?.addEventListener('change', () => {
    const val = parseFloat(inputDimW.value)
    if (val && val > 0.3) {
      currentWidth = val
      applyChanges()
    }
  })

  inputDimH?.addEventListener('change', () => {
    const val = parseFloat(inputDimH.value)
    if (val && val > 0.3) {
      currentHeight = val
      applyChanges()
    }
  })

  inputDimSill?.addEventListener('change', () => {
    const val = parseFloat(inputDimSill.value)
    if (Number.isFinite(val)) {
      currentSill = val
      applyChanges()
    }
  })

  // Carga de catálogo de materiales
  try {
    const { MATERIAL_CATALOG } = require('../catalog/materials')
    if (Array.isArray(MATERIAL_CATALOG)) {
      const opts = MATERIAL_CATALOG.map(
        (m: any) => `<option value="${m.id}">${m.label}</option>`
      ).join('')
      selectLeafMat.innerHTML = '<option value="">(Madera Nogal)</option>' + opts
      selectFrameMat.innerHTML = '<option value="">(Aluminio Oscuro)</option>' + opts
      if (object.leafMaterialId) selectLeafMat.value = object.leafMaterialId
      if (object.frameMaterialId) selectFrameMat.value = object.frameMaterialId
    }
  } catch {
    // Modo fallback
  }

  selectLeafMat?.addEventListener('change', () => applyChanges())
  selectFrameMat?.addEventListener('change', () => applyChanges())

  // Cierre
  const closePanel = (): void => {
    container.classList.add('is-hidden')
    container.remove()
    activePanelEl = null
    onClose?.()
  }

  btnClose?.addEventListener('click', closePanel)
  btnDone?.addEventListener('click', closePanel)

  document.body.appendChild(container)
  return container
}

/** Inyecta los estilos CSS responsivos y modernos del panel de propiedades BIM. */
function ensurePanelStyles(): void {
  if (document.getElementById('opening-cad-panel-styles')) return
  const style = document.createElement('style')
  style.id = 'opening-cad-panel-styles'
  style.textContent = `
    .opening-cad-panel {
      position: fixed;
      right: 20px;
      top: 60px;
      width: 380px;
      max-height: calc(100vh - 80px);
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f8fafc;
      overflow: hidden;
      animation: slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideInRight {
      from { transform: translateX(20px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .opening-cad-panel .panel-header {
      padding: 14px 18px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-title-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-icon {
      font-size: 24px;
    }
    .header-title-box h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #38bdf8;
    }
    .header-subtitle {
      margin: 2px 0 0;
      font-size: 11px;
      color: #94a3b8;
    }
    .panel-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 22px;
      cursor: pointer;
      line-height: 1;
    }
    .panel-close:hover {
      color: #f1f5f9;
    }
    .opening-cad-panel .panel-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .panel-section {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
    }
    .section-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #cbd5e1;
      margin-bottom: 8px;
    }
    .flip-buttons-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .btn-flip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 10px;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 6px;
      color: #f8fafc;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    .btn-flip:hover {
      background: #334155;
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .btn-flip strong {
      color: #22c55e;
    }
    .flip-tip {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 6px;
      text-align: center;
    }
    .angle-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .angle-badge {
      background: #0284c7;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
    }
    .angle-control-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .slider-angle {
      flex: 1;
      accent-color: #38bdf8;
      cursor: pointer;
    }
    .btn-toggle-open {
      padding: 5px 10px;
      background: #334155;
      border: 1px solid #64748b;
      border-radius: 5px;
      color: #f8fafc;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-toggle-open:hover {
      background: #475569;
    }
    .styles-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 180px;
      overflow-y: auto;
    }
    .style-choice-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 7px 10px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
    }
    .style-choice-card:hover {
      border-color: #64748b;
      background: #172554;
    }
    .style-choice-card.is-active {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }
    .style-card-title {
      font-size: 12px;
      font-weight: 600;
      color: #f8fafc;
    }
    .style-choice-card.is-active .style-card-title {
      color: #38bdf8;
    }
    .style-card-desc {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .presets-group-title {
      font-size: 10px;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .chips-container {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .preset-chip {
      padding: 4px 8px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #cbd5e1;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .preset-chip:hover {
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .preset-chip.is-selected {
      background: #0284c7;
      border-color: #38bdf8;
      color: #ffffff;
      font-weight: 600;
    }
    .dim-inputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
      gap: 8px;
    }
    .dim-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .dim-label {
      font-size: 10px;
      color: #94a3b8;
    }
    .form-input, .form-select {
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 4px;
      color: #f8fafc;
      padding: 6px 8px;
      font-size: 12px;
    }
    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: #38bdf8;
    }
    .mat-selectors-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .mat-selectors-grid .form-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .mat-selectors-grid label {
      font-size: 10px;
      color: #94a3b8;
    }
    .opening-cad-panel .panel-footer {
      padding: 12px 16px;
      background: #1e293b;
      border-top: 1px solid #334155;
      display: flex;
      justify-content: flex-end;
    }
    .btn-primary {
      background: #0284c7;
      color: white;
      border: none;
      padding: 7px 18px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-primary:hover {
      background: #0369a1;
    }
  `
  document.head.appendChild(style)
}

/** Abre el panel de propiedades para un objeto de abertura. */
export function openDoorPropertiesPanel(object: SceneObject, scene?: SceneManager | null): void {
  DoorPropertiesPanel({
    object,
    scene: scene ?? null
  })
}
