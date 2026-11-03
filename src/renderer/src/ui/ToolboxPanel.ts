import { WallSegmentType } from '../models/Wall'
import { icon, IconName } from './icons'
import { t } from '../i18n/es'

/**
 * Panel izquierdo "Toolbox": rail vertical con dos pestañas (Herramientas AEC
 * y Catálogo) más acordeones plegables. Sustituye al antiguo LeftToolbar y
 * absorbe sus herramientas de muros dentro del acordeón "Herramientas de
 * Diseño".
 */

export interface CatalogItem {
  id: string
  label: string
  /** Familia del catálogo; define con qué parte del motor se conectará. */
  kind: 'roof' | 'material' | 'shape' | 'furniture' | 'modifier'
}

export interface ToolboxOptions {
  onSelectWallTool: (type: WallSegmentType) => void
  onSelectCatalogItem: (item: CatalogItem) => void
  /**
   * Acciones del registro central que dispara el toolbox (modificadores, zoom,
   * añadir elemento). Todos los paneles comparten el MISMO `ActionRegistry`.
   */
  onAction: (actionId: string) => void
}

export interface ToolboxHandle {
  setActiveWallTool: (type: WallSegmentType) => void
  /** `null` limpia la selección del catálogo. */
  setActiveCatalogItem: (id: string | null) => void
  /** Cambia la pestaña activa ('tools' | 'materials' | 'catalog'). */
  setActiveTab: (tab: 'tools' | 'materials' | 'catalog') => void
  /** Contenedor montado para la paleta de materiales. */
  getMaterialsContainer: () => HTMLElement | null
}

interface WallToolEntry {
  type: WallSegmentType
  label: string
  icon: IconName
}

/* ---------- Datos de las secciones ---------- */

const WALL_TOOLS: WallToolEntry[] = [
  { type: WallSegmentType.SimpleWall, label: t('action.tool.simpleWall'), icon: 'wall' },
  { type: WallSegmentType.StructuralSegment, label: t('action.tool.structuralSegment'), icon: 'cube' },
  { type: WallSegmentType.RoomWalls, label: t('action.tool.roomWalls'), icon: 'layers' }
]

/**
 * Modificadores y zoom. Viven SOLO en el toolbox (Fase 1: sin duplicar en la
 * barra de iconos) y despachan por el registro central de acciones.
 */
const MODIFIERS: Array<{ actionId: string; label: string; iconName: IconName }> = [
  { actionId: 'modify.move', label: t('action.modify.move'), iconName: 'move' },
  { actionId: 'modify.copy', label: t('action.modify.copy'), iconName: 'copy' },
  { actionId: 'modify.trim', label: t('action.modify.trim'), iconName: 'scissors' },
  { actionId: 'modify.erase', label: t('action.modify.erase'), iconName: 'trash' },
  { actionId: 'aux.zoomIn', label: t('action.aux.zoomIn'), iconName: 'zoomIn' },
  { actionId: 'aux.zoomOut', label: t('action.aux.zoomOut'), iconName: 'zoomOut' }
]

/** Vistas previas de cubiertas dibujadas en SVG (sin imágenes externas). */
const ROOFS: Array<{ item: CatalogItem; preview: string }> = [
  {
    item: { id: 'roof.gable', label: 'A dos aguas', kind: 'roof' },
    preview: '<path d="M4 26h40L24 8z"/><path d="M24 8v18"/>'
  },
  {
    item: { id: 'roof.hip', label: 'A cuatro aguas', kind: 'roof' },
    preview: '<path d="M6 26h36l-6-14H12z"/><path d="M12 12 24 26l12-14"/>'
  },
  {
    item: { id: 'roof.shed', label: 'A un agua', kind: 'roof' },
    preview: '<path d="M4 12l40 10v6H4z"/><path d="M4 12v16h40"/>'
  },
  {
    item: { id: 'roof.mansard', label: 'Mansarda', kind: 'roof' },
    preview: '<path d="M4 26h40l-6-8H10z"/><path d="M10 18 24 8l14 10"/>'
  },
  {
    item: { id: 'roof.flat', label: 'Plana / terraza', kind: 'roof' },
    preview: '<path d="M4 16h40v10H4z"/><path d="M10 16v10M38 16v10"/>'
  },
  {
    item: { id: 'roof.sawtooth', label: 'Diente de sierra', kind: 'roof' },
    preview: '<path d="M4 26h9L22 12v14h9L40 12v14h4"/>'
  }
]

const MATERIALS: Array<{ item: CatalogItem; swatchClass: string }> = [
  { item: { id: 'mat.concrete', label: 'Concreto', kind: 'material' }, swatchClass: 'mat--concrete' },
  { item: { id: 'mat.metal-ore', label: 'Metal ore', kind: 'material' }, swatchClass: 'mat--metal-ore' },
  { item: { id: 'mat.metal-pot', label: 'Metal pot', kind: 'material' }, swatchClass: 'mat--metal-pot' },
  { item: { id: 'mat.wood', label: 'Madera', kind: 'material' }, swatchClass: 'mat--wood' },
  { item: { id: 'mat.brick', label: 'Ladrillo', kind: 'material' }, swatchClass: 'mat--brick' },
  { item: { id: 'mat.marble', label: 'Mármol', kind: 'material' }, swatchClass: 'mat--marble' },
  { item: { id: 'mat.glass', label: 'Vidrio', kind: 'material' }, swatchClass: 'mat--glass' },
  { item: { id: 'mat.terracotta', label: 'Teja de barro', kind: 'material' }, swatchClass: 'mat--terracotta' }
]

const SHAPES: Array<{ item: CatalogItem; preview: string }> = [
  { item: { id: 'shape.l', label: 'Perfil L', kind: 'shape' }, preview: '<path d="M14 6h8v26h20v8H14z"/>' },
  { item: { id: 'shape.u', label: 'Perfil U', kind: 'shape' }, preview: '<path d="M10 8h8v24h12V8h8v34H10z"/>' },
  { item: { id: 'shape.c', label: 'Perfil C', kind: 'shape' }, preview: '<path d="M12 8h24v8H20v16h16v8H12z"/>' },
  { item: { id: 'shape.t', label: 'Perfil T', kind: 'shape' }, preview: '<path d="M6 8h36v8H30v26H18V16H6z"/>' },
  { item: { id: 'shape.cross', label: 'Cruz', kind: 'shape' }, preview: '<path d="M18 6h12v12h12v12H30v12H18V30H6V18h12z"/>' },
  { item: { id: 'shape.ring', label: 'Anillo', kind: 'shape' }, preview: '<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="7"/>' },
  { item: { id: 'shape.stairs', label: 'Escalera', kind: 'shape' }, preview: '<path d="M6 42h8v-8h8v-8h8v-8h8V8h4"/>' },
  { item: { id: 'shape.arc', label: 'Arco', kind: 'shape' }, preview: '<path d="M8 42a34 34 0 0 1 34-34"/><path d="M8 42h32V10"/>' }
]

const FURNITURE: Array<{ item: CatalogItem; iconName: IconName }> = [
  { item: { id: 'furn.armchair', label: 'Sillón', kind: 'furniture' }, iconName: 'armchair' },
  { item: { id: 'furn.sofa', label: 'Sofá', kind: 'furniture' }, iconName: 'sofa' },
  { item: { id: 'furn.table', label: 'Mesa', kind: 'furniture' }, iconName: 'table' },
  { item: { id: 'furn.chair', label: 'Silla', kind: 'furniture' }, iconName: 'chair' },
  { item: { id: 'furn.lamp', label: 'Lámpara', kind: 'furniture' }, iconName: 'lamp' },
  { item: { id: 'furn.plant', label: 'Planta', kind: 'furniture' }, iconName: 'plant' },
  { item: { id: 'furn.desk', label: 'Escritorio', kind: 'furniture' }, iconName: 'desk' },
  { item: { id: 'furn.bed', label: 'Cama', kind: 'furniture' }, iconName: 'bed' }
]

/** Miniaturas SVG para puertas y ventanas (sin imágenes externas). */
const OPENINGS: Array<{ item: CatalogItem; preview: string }> = [
  { item: { id: 'opening.door', label: 'Puerta', kind: 'shape' }, preview: '<rect x="6" y="8" width="12" height="32" rx="1"/><path d="M6 24h12"/><line x1="12" y1="8" x2="12" y2="40"/>' },
  { item: { id: 'opening.door.double', label: 'Puerta doble', kind: 'shape' }, preview: '<rect x="6" y="8" width="6" height="32" rx="1"/><rect x="24" y="8" width="6" height="32" rx="1"/><path d="M6 24h12M18 8v32"/>' },
  { item: { id: 'opening.door.sliding', label: 'Puerta corrediza', kind: 'shape' }, preview: '<rect x="6" y="8" width="12" height="32" rx="1"/><path d="M6 24h12M12 8v32"/><line x1="18" y1="20" x2="18" y2="28"/>' },
  { item: { id: 'opening.door.glass', label: 'Puerta de vidrio', kind: 'shape' }, preview: '<rect x="6" y="8" width="12" height="32" rx="1"/><path d="M6 24h12M12 8v32M9 14h18M9 26h18"/>' },
  { item: { id: 'opening.window', label: 'Ventana', kind: 'shape' }, preview: '<rect x="6" y="14" width="12" height="16" rx="1"/><path d="M6 22h12M12 14v16"/>' },
  { item: { id: 'opening.window.sliding', label: 'Ventana corrediza', kind: 'shape' }, preview: '<rect x="6" y="14" width="12" height="16" rx="1"/><path d="M6 22h12M12 14v16"/><line x1="18" y1="18" x2="18" y2="22"/>' },
  { item: { id: 'opening.window.casement', label: 'Ventana abatible', kind: 'shape' }, preview: '<rect x="6" y="14" width="12" height="16" rx="1"/><path d="M6 22h12M12 14v16"/><path d="M12 22A6 6 0 0 1 18 16"/>' },
  { item: { id: 'opening.window.double', label: 'Ventana dos hojas', kind: 'shape' }, preview: '<rect x="6" y="14" width="12" height="16" rx="1"/><path d="M6 22h12M12 14v16M18 14v16"/>' },
  { item: { id: 'opening.window.four', label: 'Ventana cuatro hojas', kind: 'shape' }, preview: '<rect x="6" y="14" width="12" height="16" rx="1"/><path d="M6 22h12M12 14v16M18 14v16M12 22h12"/>' }
]

/* ---------- Render ---------- */

function renderAccordion(title: string, body: string): string {
  return `<section class="acc is-open">
      <button class="acc__head">
        <span class="acc__chevron">${icon('chevronDown', 14)}</span>
        <span class="acc__title">${title}</span>
      </button>
      <div class="acc__body">${body}</div>
    </section>`
}

function renderWallTools(): string {
  const tools = WALL_TOOLS.map(
    (tool) => `<button class="tool-tile" data-wall-tool="${tool.type}" title="${tool.label}">
        <span class="tool-tile__icon">${icon(tool.icon, 18)}</span>
        <span class="tool-tile__label">${tool.label}</span>
      </button>`
  )

  const modifiers = MODIFIERS.map(
    ({ actionId, label, iconName }) =>
      `<button class="tool-tile" data-toolbox-action="${actionId}" title="${label}">
        <span class="tool-tile__icon">${icon(iconName, 18)}</span>
        <span class="tool-tile__label">${label}</span>
      </button>`
  )

  return `<div class="tool-grid">
      ${[...tools, ...modifiers].join('')}
      <button class="tool-tile tool-tile--add" data-toolbox-action="tool.add" title="${t('action.tool.add')}">
        <span class="tool-tile__icon">${icon('plus', 18)}</span>
        <span class="tool-tile__label">${t('action.tool.add')}</span>
      </button>
    </div>`
}

function renderPreviewGrid(entries: Array<{ item: CatalogItem; preview: string }>, viewBox: string): string {
  return `<div class="tile-grid">
      ${entries
        .map(
          ({ item, preview }) => `<button class="tile" data-catalog="${item.kind}|${item.id}" title="${item.label}">
          <svg class="tile__art" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${preview}</svg>
          <span class="tile__label">${item.label}</span>
        </button>`
        )
        .join('')}
    </div>`
}

function renderMaterials(): string {
  return `<div class="tile-grid">
      ${MATERIALS.map(
        ({ item, swatchClass }) => `<button class="tile" data-catalog="${item.kind}|${item.id}" title="${item.label}">
          <span class="tile__swatch ${swatchClass}"></span>
          <span class="tile__label">${item.label}</span>
        </button>`
      ).join('')}
    </div>`
}

function renderFurniture(): string {
  return `<div class="tile-grid">
      ${FURNITURE.map(
        ({ item, iconName }) => `<button class="tile" data-catalog="${item.kind}|${item.id}" title="${item.label}">
          <span class="tile__art tile__art--icon">${icon(iconName, 26)}</span>
          <span class="tile__label">${item.label}</span>
        </button>`
      ).join('')}
    </div>`
}

/* ---------- Montaje ---------- */

export function mountToolboxPanel(container: HTMLElement, options: ToolboxOptions): ToolboxHandle {
  container.innerHTML = `
    <div class="toolbox">
      <header class="panel__head">
        <span class="panel__title">${icon('ruler', 14)} ${t('panel.toolbox')}</span>
        <div class="panel__icons">
          <button class="icon-btn" data-panel-action="collapse-all" title="Plegar / desplegar secciones">${icon('sliders', 14)}</button>
          <button class="icon-btn" data-panel-close title="Cerrar panel lateral">${icon('close', 14)}</button>
        </div>
      </header>
      <div class="toolbox__subnav">
        <button class="subnav-tab is-active" data-rail-tab="tools">${icon('ruler', 13)}<span>${t('section.designTools')}</span></button>
        <button class="subnav-tab" data-rail-tab="materials">${icon('palette', 13)}<span>${t('section.materials')}</span></button>
        <button class="subnav-tab" data-rail-tab="catalog">${icon('shapes', 13)}<span>${t('section.catalog')}</span></button>
      </div>
      <div class="toolbox__scroll">
        <div class="toolbox__panel" data-panel="tools">
          ${renderAccordion(t('section.designTools'), renderWallTools())}
          ${renderAccordion(t('section.roofTypes'), renderPreviewGrid(ROOFS, '0 0 48 32'))}
        </div>
        <div class="toolbox__panel is-hidden" data-panel="materials" id="toolbox-materials-dock" style="height:100%;display:none;flex-direction:column;">
        </div>
        <div class="toolbox__panel is-hidden" data-panel="catalog">
          ${renderAccordion(t('section.shapes'), renderPreviewGrid(SHAPES, '0 0 48 48'))}
          ${renderAccordion(t('section.furniture'), renderFurniture())}
          ${renderAccordion(t('section.openings'), renderPreviewGrid(OPENINGS, '0 0 48 48'))}
        </div>
      </div>
    </div>
  `
  /* Acordeones plegables */
  container.querySelectorAll<HTMLElement>('.acc__head').forEach((head) => {
    head.addEventListener('click', () => head.closest('.acc')?.classList.toggle('is-open'))
  })

  /* Pestañas de subnavegación */
  const tabs = [...container.querySelectorAll<HTMLButtonElement>('.subnav-tab')]
  const panels = [...container.querySelectorAll<HTMLElement>('.toolbox__panel')]

  function selectTab(tabId: 'tools' | 'materials' | 'catalog'): void {
    tabs.forEach((other) => other.classList.toggle('is-active', other.dataset.railTab === tabId))
    panels.forEach((panel) => {
      const isMatch = panel.dataset.panel === tabId
      panel.classList.toggle('is-hidden', !isMatch)
      if (panel.dataset.panel === 'materials') {
        panel.style.display = isMatch ? 'flex' : 'none'
      } else {
        panel.style.display = isMatch ? 'block' : 'none'
      }
    })
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      selectTab(tab.dataset.railTab as 'tools' | 'materials' | 'catalog')
    })
  })

  /* Plegar/desplegar todas las secciones */
  container.querySelector('[data-panel-action="collapse-all"]')?.addEventListener('click', () => {
    const sections = [...container.querySelectorAll<HTMLElement>('.acc')]
    const collapse = sections.some((section) => section.classList.contains('is-open'))
    sections.forEach((section) => section.classList.toggle('is-open', !collapse))
  })

  /* Herramientas de muro (migradas del antiguo LeftToolbar) */
  const wallTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-wall-tool]')]
  const markWallTool = (type: WallSegmentType): void => {
    wallTiles.forEach((tile) => tile.classList.toggle('is-active', tile.dataset.wallTool === type))
  }

  wallTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      const type = tile.dataset.wallTool as WallSegmentType
      markWallTool(type)
      options.onSelectWallTool(type)
    })
  })

  /* Catálogo (cubiertas, materiales, formas, muebles y modificadores) */
  const catalogTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-catalog]')]
  const markCatalogItem = (id: string | null): void => {
    catalogTiles.forEach((tile) => {
      tile.classList.toggle('is-active', id !== null && tile.dataset.catalog?.split('|')[1] === id)
    })
  }

  catalogTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      const [kind, id] = (tile.dataset.catalog ?? '').split('|')
      if (!id) return
      markCatalogItem(id)
      options.onSelectCatalogItem({ id, kind: kind as CatalogItem['kind'], label: tile.title })
    })
  })

  /* Modificadores, zoom y «Añadir elemento»: despachan por el registro central. */
  container.querySelectorAll<HTMLButtonElement>('[data-toolbox-action]').forEach((tile) => {
    tile.addEventListener('click', () => {
      const actionId = tile.dataset.toolboxAction
      if (actionId) options.onAction(actionId)
    })
  })

  // Estado inicial coherente con el motor (arranca con la herramienta de muro simple).
  markWallTool(WallSegmentType.SimpleWall)

  return {
    setActiveWallTool(type: WallSegmentType): void {
      markWallTool(type)
    },
    setActiveCatalogItem(id: string | null): void {
      markCatalogItem(id)
    },
    setActiveTab(tab: 'tools' | 'materials' | 'catalog'): void {
      selectTab(tab)
    },
    getMaterialsContainer(): HTMLElement | null {
      return container.querySelector('#toolbox-materials-dock')
    }
  }
}

