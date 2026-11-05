import { WallSegmentType } from '../models/Wall'
import { WALL_TEMPLATES, type WallTemplateId } from '../engine/WallTemplates'
import { icon, IconName } from './icons'
import { t } from '../i18n/es'
import {
  DEVICE_SPECS,
  CIRCUIT_SPECS,
  type ElectricalDeviceType,
  type CircuitType
} from '../mep/electricalTypes'
import { CAD_BLOCKS, CAD_BLOCK_CATEGORIES, type CadBlockCategory } from '../catalog/cadBlocksData'
import { generateBlock2DSymbol } from '../catalog/cadBlocks2D'

/**
 * Panel izquierdo "Toolbox": rail vertical con pestañas (Herramientas AEC,
 * Materiales y Catálogo) más acordeones plegables, incluyendo:
 * - Herramientas de diseño y modificadores con etiquetas de atajo ([W], [S], [V], [G], [Supr]…)
 * - Atajos de Plantillas de Muros 2D ([R], [L], [U], [C], [T], [Y], [N], [B])
 * - Topografía y Terreno (Sacar Niveles / Cotas + Aplanar Terreno / Plataforma)
 * - Sistemas Estructurales y Formas 3D (13 sistemas arquitectónicos + figuras curvas/base)
 * - Tipos de techos, Mobiliario y Puertas/Ventanas.
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
   * Acciones del registro central que dispara el toolbox (plantillas 2D, modificadores,
   * seleccionar, rotar 90°, vista 2D/3D, vaciar, zoom, añadir elemento).
   */
  onAction: (actionId: string) => void
  /** Acciones del módulo Topografía y Terreno. */
  onTopographyAction?: (action: 'import' | 'demo' | 'probe' | 'grade' | 'clearSpots') => void
  onTopographyTargetElevationChange?: (elevation: number) => void
  onTopographyShapeChange?: (shape: 'rect' | 'polygon') => void
  /** Selector de material estructural por defecto al insertar sistemas estructurales. */
  onStructuralMaterialChange?: (materialType: 'concrete' | 'wood' | 'steel') => void
  /** Acciones y selección del módulo MEP Instalación Eléctrica. */
  onSelectElectricalDevice?: (deviceType: ElectricalDeviceType) => void
  onSelectElectricalCircuit?: (circuitType: CircuitType) => void
  onToggleWiringTool?: (active?: boolean) => void
  onElectricalAction?: (action: 'xray' | 'simulate' | 'diagnose' | 'clear') => void
}

export interface ToolboxHandle {
  setActiveWallTool: (type: WallSegmentType | null) => void
  /** Marca visualmente la plantilla de muros 2D activa (`rect`, `l`, `u`… o `null`). */
  setActiveWallTemplate: (templateId: WallTemplateId | null) => void
  /** Marca visualmente una herramienta de acción (`tool.crosshair`, `modify.move` o `null`). */
  setActiveActionTool: (actionId: string | null) => void
  /** `null` limpia la selección del catálogo. */
  setActiveCatalogItem: (id: string | null) => void
  /** Cambia la pestaña activa ('tools' | 'materials' | 'catalog'). */
  setActiveTab: (tab: 'tools' | 'materials' | 'catalog') => void
  /** Contenedor montado para la paleta de materiales. */
  getMaterialsContainer: () => HTMLElement | null
  /** Refleja la herramienta topográfica activa ('none' | 'probe' | 'grade'). */
  setActiveTopographyMode: (mode: 'none' | 'probe' | 'grade') => void
  /** Actualiza las métricas de Corte y Relleno (m³) tras aplanar terreno. */
  setCutFillStats: (cutM3: number, fillM3: number, targetElev?: number) => void
  /** Material estructural activo en el selector ('concrete' | 'wood' | 'steel'). */
  getStructuralMaterial: () => 'concrete' | 'wood' | 'steel'
  /** Marca visualmente el dispositivo eléctrico activo. */
  setActiveElectricalDevice: (deviceType: ElectricalDeviceType | null) => void
  /** Marca visualmente el estado de la herramienta de cableado [E]. */
  setWiringToolActive: (active: boolean, circuit?: CircuitType) => void
  /** Actualiza el estado visual del botón de simulación y rayos X. */
  setElectricalSimulating: (simulating: boolean) => void
  setXRayActive: (active: boolean) => void
}

interface WallToolEntry {
  type: WallSegmentType
  label: string
  icon: IconName
  shortcut: string
  tooltip: string
}

/* ---------- Datos de las secciones ---------- */

const WALL_TOOLS: WallToolEntry[] = [
  {
    type: WallSegmentType.SimpleWall,
    label: t('action.tool.simpleWall'),
    icon: 'wall',
    shortcut: 'W',
    tooltip: 'Muro simple [W / M]'
  },
  {
    type: WallSegmentType.StructuralSegment,
    label: t('action.tool.structuralSegment'),
    icon: 'cube',
    shortcut: 'E',
    tooltip: 'Segmento estructural [E]'
  }
]

/**
 * Herramientas rápidas de selección, modificación, vista y escena con sus atajos visibles.
 */
const DESIGN_ACTIONS: Array<{
  actionId: string
  label: string
  iconName: IconName
  shortcut: string
  tooltip: string
  selectable?: boolean
}> = [
  {
    actionId: 'tool.crosshair',
    label: t('action.tool.crosshair'),
    iconName: 'crosshair',
    shortcut: 'S',
    tooltip: 'Seleccionar / Cancelar trazo actual [S / Esc]',
    selectable: true
  },
  {
    actionId: 'modify.move',
    label: t('action.modify.move'),
    iconName: 'move',
    shortcut: 'V',
    tooltip: 'Mover elemento o estirar extremo de muro [V]',
    selectable: true
  },
  {
    actionId: 'modify.rotate90',
    label: t('action.modify.rotate90'),
    iconName: 'rotateCw',
    shortcut: 'G',
    tooltip: 'Rotar 90° plantilla o selección [G]'
  },
  {
    actionId: 'edit.duplicate',
    label: t('action.modify.copy'),
    iconName: 'copy',
    shortcut: 'Ctrl+D',
    tooltip: 'Duplicar muro o grupo seleccionado [Ctrl+D]'
  },
  {
    actionId: 'edit.delete',
    label: t('action.modify.erase'),
    iconName: 'trash',
    shortcut: 'Supr',
    tooltip: 'Borrar elemento seleccionado [Supr / Backspace]'
  },
  {
    actionId: 'view.toggle2d3d',
    label: 'Vista 2D / 3D',
    iconName: 'plan2d',
    shortcut: 'Espacio',
    tooltip: 'Alternar instantáneamente entre Planta 2D y Vista 3D [Barra espaciadora]'
  },
  {
    actionId: 'aux.fit',
    label: t('action.aux.fit'),
    iconName: 'orbit',
    shortcut: 'C',
    tooltip: 'Centrar y encuadrar toda la estructura en pantalla (Fit to View) [C / Home]'
  },
  {
    actionId: 'aux.zoomIn',
    label: t('action.aux.zoomIn'),
    iconName: 'zoomIn',
    shortcut: '+',
    tooltip: 'Acercar vista suavemente [+ / RePág]'
  },
  {
    actionId: 'aux.zoomOut',
    label: t('action.aux.zoomOut'),
    iconName: 'zoomOut',
    shortcut: '−',
    tooltip: 'Alejar vista suavemente [− / AvPág]'
  },
  {
    actionId: 'file.clear',
    label: t('action.file.clear'),
    iconName: 'eraser',
    shortcut: 'X',
    tooltip: 'Vaciar escena con confirmación rápida [X]'
  }
]

/** 13 Sistemas Estructurales Arquitectónicos con diagramas vectoriales técnicos. */
const STRUCTURAL_SYSTEMS: Array<{ item: CatalogItem; badge: string; preview: string }> = [
  {
    badge: '01',
    item: { id: 'struct.adintelada', label: 'Adintelada / Pórtico', kind: 'shape' },
    preview: '<path d="M6 12h36v5H6z"/><path d="M9 17v23M24 17v23M39 17v23"/><path d="M4 40h40"/>'
  },
  {
    badge: '02',
    item: { id: 'struct.abovedada', label: 'Abovedada / Cúpula', kind: 'shape' },
    preview: '<path d="M8 40V24a16 16 0 0 1 32 0v16"/><path d="M13 40V25a11 11 0 0 1 22 0v15"/><path d="M4 40h40"/>'
  },
  {
    badge: '03',
    item: { id: 'struct.entramada', label: 'Entramada / Armazón', kind: 'shape' },
    preview: '<rect x="8" y="8" width="32" height="32"/><path d="M8 20h32M8 30h32M19 8v32M29 8v32"/>'
  },
  {
    badge: '04',
    item: { id: 'struct.triangulada', label: 'Triangulada / Cercha', kind: 'shape' },
    preview: '<polygon points="4,34 24,12 44,34"/><path d="M14 23l10 11 10-11M24 12v22"/>'
  },
  {
    badge: '05',
    item: { id: 'struct.colgante', label: 'Colgante / Suspendida', kind: 'shape' },
    preview: '<path d="M12 8v32M36 8v32M4 30h40"/><path d="M12 10Q24 26 36 10M4 26Q8 20 12 10M36 10Q40 20 44 26"/><path d="M18 18v12M24 20v10M30 18v12"/>'
  },
  {
    badge: '06',
    item: { id: 'struct.tensada', label: 'Tensada / Velaria', kind: 'shape' },
    preview: '<path d="M6 34Q24 10 42 34Q24 24 6 34Z"/><path d="M24 8v28M8 38l4-6M40 38l-4-6"/>'
  },
  {
    badge: '07',
    item: { id: 'struct.neumatica', label: 'Neumática / Inflable', kind: 'shape' },
    preview: '<path d="M6 38C6 16 42 16 42 38Z"/><path d="M15 38c0-16 18-16 18 0M6 30h36"/>'
  },
  {
    badge: '08',
    item: { id: 'struct.muros_carga', label: 'Muros de Carga', kind: 'shape' },
    preview: '<rect x="6" y="12" width="36" height="28"/><path d="M16 40V24a4 4 0 0 1 8 0v16"/><rect x="29" y="20" width="8" height="8"/>'
  },
  {
    badge: '09',
    item: { id: 'struct.laminar', label: 'Laminar / Cascarón', kind: 'shape' },
    preview: '<path d="M4 36Q14 10 24 24Q34 10 44 36"/><path d="M4 36Q24 18 44 36"/><path d="M14 22l10 14 10-14"/>'
  },
  {
    badge: '10',
    item: { id: 'struct.geodesica', label: 'Cúpula Geodésica', kind: 'shape' },
    preview: '<path d="M6 38a18 18 0 0 1 36 0Z"/><path d="M12 24l12-6 12 6M12 24l6 14 6-10 6 10 6-14M18 38h12"/>'
  },
  {
    badge: '11',
    item: { id: 'struct.espacial', label: 'Malla Espacial 3D', kind: 'shape' },
    preview: '<path d="M6 16h36M10 24h28M6 16l4 8 6-8 6 8 6-8 6 8 6-8"/><path d="M10 24v16M38 24v16"/>'
  },
  {
    badge: '12',
    item: { id: 'struct.plegada', label: 'Plegada / Origami', kind: 'shape' },
    preview: '<polyline points="4,28 12,14 20,28 28,14 36,28 44,14"/><path d="M4 28v12M20 28v12M36 28v12"/>'
  },
  {
    badge: '13',
    item: { id: 'struct.voladizo', label: 'En Voladizo / Cantilever', kind: 'shape' },
    preview: '<rect x="8" y="10" width="10" height="30"/><rect x="18" y="14" width="24" height="9"/><path d="M18 23l14-9M4 40h40"/>'
  }
]

/** 14. Figuras Geométricas y Redondas Base. */
const BASE_GEOMETRIC_FORMS: Array<{ item: CatalogItem; preview: string }> = [
  {
    item: { id: 'geo.cilindro', label: 'Cilindro 3D', kind: 'shape' },
    preview: '<ellipse cx="24" cy="12" rx="13" ry="5"/><path d="M11 12v22c0 2.8 5.8 5 13 5s13-2.2 13-5V12"/>'
  },
  {
    item: { id: 'geo.anillo', label: 'Anillo / Toroide', kind: 'shape' },
    preview: '<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="8"/>'
  },
  {
    item: { id: 'geo.muro_curvo', label: 'Muro Curvo', kind: 'shape' },
    preview: '<path d="M8 36a18 18 0 0 1 32 0"/><path d="M13 36a13 13 0 0 1 22 0"/><path d="M8 36h5M35 36h5"/>'
  },
  {
    item: { id: 'geo.cono', label: 'Cono', kind: 'shape' },
    preview: '<path d="M24 8 9 36h30Z"/><ellipse cx="24" cy="36" rx="15" ry="4"/>'
  },
  {
    item: { id: 'geo.esfera', label: 'Esfera', kind: 'shape' },
    preview: '<circle cx="24" cy="24" r="15"/><ellipse cx="24" cy="24" rx="15" ry="6"/><ellipse cx="24" cy="24" rx="6" ry="15"/>'
  },
  {
    item: { id: 'geo.prisma', label: 'Prisma Poligonal', kind: 'shape' },
    preview: '<polygon points="24,7 38,14 38,34 24,41 10,34 10,14"/><path d="M24 21v20M10 14l14 7 14-7"/>'
  },
  {
    item: { id: 'geo.extrusion', label: 'Extrusión Libre', kind: 'shape' },
    preview: '<path d="M10 30C10 14 26 12 34 20S38 38 22 38Z"/>'
  },
  {
    item: { id: 'shape.stairs', label: 'Escalera 3D', kind: 'shape' },
    preview: '<path d="M6 42h8v-8h8v-8h8v-8h8V8h4"/>'
  }
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

function renderAccordion(title: string, body: string, isOpen = true): string {
  return `<section class="acc${isOpen ? ' is-open' : ''}">
      <button type="button" class="acc__head">
        <span class="acc__chevron">${icon('chevronDown', 14)}</span>
        <span class="acc__title">${title}</span>
      </button>
      <div class="acc__body">${body}</div>
    </section>`
}

function renderWallTools(): string {
  const tools = WALL_TOOLS.map(
    (tool) => `<button type="button" class="tool-tile has-kbd" data-wall-tool="${tool.type}" title="${tool.tooltip}">
        <kbd class="kbd-badge kbd-badge--corner">[${tool.shortcut}]</kbd>
        <span class="tool-tile__icon">${icon(tool.icon, 18)}</span>
        <span class="tool-tile__label">${tool.label}</span>
      </button>`
  )

  const roomQuickTile = `<button type="button" class="tool-tile has-kbd" data-wall-template="rect" data-toolbox-action="template.rect" title="Habitación Rectangular (4 muros cerrados de un clic o arrastrando) [R]">
      <kbd class="kbd-badge kbd-badge--corner">[R]</kbd>
      <span class="tool-tile__icon">${icon('layers', 18)}</span>
      <span class="tool-tile__label">${t('action.template.rect')}</span>
    </button>`

  const actions = DESIGN_ACTIONS.map(
    ({ actionId, label, iconName, shortcut, tooltip, selectable }) =>
      `<button type="button" class="tool-tile has-kbd" data-toolbox-action="${actionId}"${selectable ? ` data-action-tool="${actionId}"` : ''} title="${tooltip}">
        <kbd class="kbd-badge kbd-badge--corner">[${shortcut}]</kbd>
        <span class="tool-tile__icon">${icon(iconName, 18)}</span>
        <span class="tool-tile__label">${label}</span>
      </button>`
  )

  return `<div class="tool-grid">
      ${[...tools, roomQuickTile, ...actions].join('')}
      <button type="button" class="tool-tile tool-tile--add has-kbd" data-toolbox-action="tool.add" title="${t('action.tool.add')} [A]">
        <kbd class="kbd-badge kbd-badge--corner">[A]</kbd>
        <span class="tool-tile__icon">${icon('plus', 18)}</span>
        <span class="tool-tile__label">${t('action.tool.add')}</span>
      </button>
    </div>`
}

function renderWallTemplatesSection(includeEscalera = false): string {
  const templateTiles = WALL_TEMPLATES.map(
    (tpl) => `<button type="button" class="tile wall-tpl-tile has-kbd" data-wall-template="${tpl.id}" data-toolbox-action="${tpl.actionId}" title="${tpl.label} [${tpl.shortcut}] — ${tpl.hint}">
        <kbd class="kbd-badge kbd-badge--corner">[${tpl.shortcut}]</kbd>
        <svg class="tile__art" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round">${tpl.previewSvg}</svg>
        <span class="tile__label">${tpl.shortLabel}</span>
      </button>`
  )

  if (includeEscalera) {
    templateTiles.push(
      `<button type="button" class="tile" data-catalog="shape|shape.stairs" title="Escalera 3D">
        <svg class="tile__art" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M6 42h8v-8h8v-8h8v-8h8V8h4"/></svg>
        <span class="tile__label">Escalera 3D</span>
      </button>`
    )
  }

  return `
    <div class="wall-tpl-section">
      <p class="wall-tpl-note">Generan <strong>muros reales conectados</strong> (2.5 m alto × 0.2 m grosor). Clic directo o arrastra esquina a esquina · <code>[G]</code> rota 90°.</p>
      <div class="tile-grid">${templateTiles.join('')}</div>
    </div>
  `
}

function renderTopographySection(): string {
  return `
    <div class="topo-controls">
      <div class="tool-grid">
        <button type="button" class="tool-tile" data-topo-action="import" title="Importar mapa topográfico (.DXF 3D, .CSV, .TXT, .GeoJSON)">
          <span class="tool-tile__icon">${icon('uploadCloud', 17)}</span>
          <span class="tool-tile__label">Importar Mapa GIS/DXF</span>
        </button>
        <button type="button" class="tool-tile" data-topo-action="demo" title="Generar malla topográfica 3D de demostración con curvas de nivel">
          <span class="tool-tile__icon">${icon('globe', 17)}</span>
          <span class="tool-tile__label">Terreno 3D Base</span>
        </button>
        <button type="button" class="tool-tile" data-topo-mode="probe" data-topo-action="probe" title="Sacar Niveles / Cotas (Elevation Probe): muestra e inserta coordenadas (X, Y) y cota Z en metros">
          <span class="tool-tile__icon">${icon('crosshair', 17)}</span>
          <span class="tool-tile__label">Sacar Niveles / Cotas</span>
        </button>
        <button type="button" class="tool-tile" data-topo-mode="grade" data-topo-action="grade" title="Aplanar Terreno / Plataforma (Grading Pad): dibuja rectángulo o polígono y calcula corte y relleno">
          <span class="tool-tile__icon">${icon('layers', 17)}</span>
          <span class="tool-tile__label">Aplanar Terreno</span>
        </button>
      </div>

      <div class="topo-inline-box">
        <div class="topo-field-row">
          <label class="topo-field-label">Cota plataforma Z (m)</label>
          <input type="number" class="prop-input topo-elev-input" data-topo-target-elev value="0.00" step="0.25" />
        </div>
        <div class="topo-presets-row">
          <button type="button" class="topo-chip-btn" data-topo-elev-preset="0">Nivel 0.00m</button>
          <button type="button" class="topo-chip-btn" data-topo-elev-preset="2.5">+2.50m</button>
          <button type="button" class="topo-chip-btn is-active" data-topo-shape="rect" title="Trazar plataforma rectangular">Rectángulo</button>
          <button type="button" class="topo-chip-btn" data-topo-shape="polygon" title="Trazar plataforma poligonal (Enter confirma)">Polígono</button>
        </div>
        <div class="topo-cutfill-card" data-topo-cutfill>
          <div class="topo-cutfill-item">
            <span class="topo-cutfill-label">Corte (Excav.)</span>
            <strong class="topo-cutfill-val is-cut" data-topo-cut>0.00 m³</strong>
          </div>
          <div class="topo-cutfill-item">
            <span class="topo-cutfill-label">Relleno (Terrap.)</span>
            <strong class="topo-cutfill-val is-fill" data-topo-fill>0.00 m³</strong>
          </div>
        </div>
        <button type="button" class="topo-clear-btn" data-topo-action="clearSpots" title="Eliminar marcadores de cotas sobre el terreno">
          Limpiar cotas del mapa
        </button>
      </div>
    </div>
  `
}

function renderStructuralGeneratorSection(): string {
  const systemsTiles = STRUCTURAL_SYSTEMS.map(
    ({ item, badge, preview }) => `<button type="button" class="tile struct-tile" data-catalog="${item.kind}|${item.id}" title="${badge}. ${item.label}">
        <span class="struct-tile__badge">${badge}</span>
        <svg class="tile__art" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${preview}</svg>
        <span class="tile__label">${item.label}</span>
      </button>`
  ).join('')

  const baseGeoTiles = BASE_GEOMETRIC_FORMS.map(
    ({ item, preview }) => `<button type="button" class="tile struct-tile" data-catalog="${item.kind}|${item.id}" title="${item.label}">
        <svg class="tile__art" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${preview}</svg>
        <span class="tile__label">${item.label}</span>
      </button>`
  ).join('')

  return `
    <div class="struct-generator">
      <div class="struct-mat-bar" role="group" aria-label="Material estructural">
        <span class="struct-mat-bar__label">Material base:</span>
        <div class="struct-mat-pills">
          <button type="button" class="struct-mat-pill is-active" data-struct-mat="concrete">Hormigón</button>
          <button type="button" class="struct-mat-pill" data-struct-mat="wood">Madera</button>
          <button type="button" class="struct-mat-pill" data-struct-mat="steel">Acero</button>
        </div>
      </div>
      <div class="struct-subhead">13 Tipologías Estructurales</div>
      <div class="tile-grid struct-grid">${systemsTiles}</div>
      <div class="struct-subhead" style="margin-top:8px;">14. Figuras Geométricas y Escalera</div>
      <div class="tile-grid struct-grid">${baseGeoTiles}</div>
    </div>
  `
}

function renderPreviewGrid(entries: Array<{ item: CatalogItem; preview: string }>, viewBox: string): string {
  return `<div class="tile-grid">
      ${entries
        .map(
          ({ item, preview }) => `<button type="button" class="tile" data-catalog="${item.kind}|${item.id}" title="${item.label}">
          <svg class="tile__art" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${preview}</svg>
          <span class="tile__label">${item.label}</span>
        </button>`
        )
        .join('')}
    </div>`
}

function renderFurniture(): string {
  return `<div class="tile-grid">
      ${FURNITURE.map(
        ({ item, iconName }) => `<button type="button" class="tile" data-catalog="${item.kind}|${item.id}" title="${item.label}">
          <span class="tile__art tile__art--icon">${icon(iconName, 26)}</span>
          <span class="tile__label">${item.label}</span>
        </button>`
      ).join('')}
    </div>`
}

function renderCadBlockCategory(category: CadBlockCategory): string {
  const blocks = CAD_BLOCKS.filter((b) => b.category === category)
  return `<div class="tile-grid cad-blocks-grid">
    ${blocks
      .map((b) => {
        const maxDim = Math.max(b.dimensions.width, b.dimensions.depth) * 0.65
        const viewBox = `${-maxDim} ${-maxDim} ${maxDim * 2} ${maxDim * 2}`
        const symbolSvg = generateBlock2DSymbol(b.blockType, b.dimensions.width, b.dimensions.depth)
        return `
          <button
            type="button"
            class="tile cad-block-tile"
            data-catalog="furniture|${b.id}"
            title="${b.label} (${b.dimensions.width.toFixed(2)}×${b.dimensions.depth.toFixed(2)}m) — $${b.defaultPrice} USD · ${b.hint}"
          >
            <svg class="tile__art" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round">
              ${symbolSvg}
            </svg>
            <span class="tile__label">${b.shortLabel}</span>
          </button>
        `
      })
      .join('')}
  </div>`
}

/* ---------- Montaje ---------- */

function renderElectricalSection(): string {
  const devices: Array<{ type: ElectricalDeviceType; hint: string }> = [
    { type: 'panel', hint: 'Tablero / Centro de Carga (Caja de Breakers) · Y = 1.60m en muro. Origen de circuitos.' },
    { type: 'junction', hint: 'Caja de Registro / Octagonal (Junction Box) · Y = 2.40m en losa o parte alta de muro.' },
    { type: 'switch', hint: 'Interruptor Simple (Switch 1 vía) · Y = 1.20m en muro.' },
    { type: 'switch3', hint: 'Interruptor Conmutado (3-Way / Escalera) · Y = 1.20m en muro.' },
    { type: 'outlet', hint: 'Tomacorriente Doble 120V (NEMA 5-15R) · Y = 0.40m en muro (o 1.10m en mesón).' },
    { type: 'outlet240', hint: 'Tomacorriente 240V Especial (Cocina/Aire/Secadora) · Y = 0.40m en muro.' },
    { type: 'gfci', hint: 'Tomacorriente GFCI con protección de fuga a tierra · Y = 0.40m en muro.' },
    { type: 'luminaire', hint: 'Luminaria de Techo (Foco LED / Plafón) · Y = 2.50m centro de habitación/losa.' },
    { type: 'sconce', hint: 'Aplique de Pared · Y = 2.20m en muro.' },
    { type: 'groundRod', hint: 'Puesta a Tierra Física (Varilla Copperweld) · Y = 0.00m exterior / patio.' },
    { type: 'meter', hint: 'Medidor Principal (Acometida) · Y = 1.50m muro exterior.' }
  ]

  const deviceTiles = devices
    .map(({ type, hint }) => {
      const spec = DEVICE_SPECS[type]
      return `
        <button type="button" class="tile elec-dev-tile" data-elec-dev="${type}" title="${hint}">
          <svg class="tile__art" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
            ${spec.preview}
          </svg>
          <span class="tile__label">${spec.shortLabel}</span>
        </button>
      `
    })
    .join('')

  const circuits: Array<{ type: CircuitType; label: string; awg: string; color: string }> = [
    { type: 'lighting', label: 'Iluminación (14 AWG)', awg: '14 AWG', color: '#f59e0b' },
    { type: 'power', label: 'Fuerza / Tomas (12 AWG)', awg: '12 AWG', color: '#06b6d4' },
    { type: 'special', label: 'Especial 240V (10 AWG)', awg: '10 AWG', color: '#e11d74' },
    { type: 'ground', label: 'Tierra Física (Verde)', awg: '8 AWG', color: '#22c55e' }
  ]

  const circuitPills = circuits
    .map(
      (c, idx) => `
      <button type="button" class="elec-circuit-pill ${idx === 0 ? 'is-active' : ''}" data-elec-circuit="${c.type}" style="--c-accent: ${c.color}">
        <span class="elec-pill-dot" style="background: ${c.color}"></span>
        <span>${c.label}</span>
      </button>
    `
    )
    .join('')

  return `
    <div class="elec-section">
      <div class="elec-toolbar-actions">
        <button type="button" class="tool-tile has-kbd elec-wire-btn" data-elec-wire-tool title="Trazar cableado / tubería conduit punto a punto [E]">
          <kbd class="kbd-badge kbd-badge--corner">[E]</kbd>
          <span class="tool-tile__icon">${icon('layers', 17)}</span>
          <span class="tool-tile__label">Trazar Cableado [E]</span>
        </button>
        <button type="button" class="tool-tile has-kbd elec-xray-btn" data-elec-action="xray" title="Alternar Vista Rayos X (Muros semitransparentes para ver cableado interno) [K]">
          <kbd class="kbd-badge kbd-badge--corner">[K]</kbd>
          <span class="tool-tile__icon">${icon('monitor', 17)}</span>
          <span class="tool-tile__label">👁️ Rayos X [K]</span>
        </button>
        <button type="button" class="tool-tile elec-sim-btn" data-elec-action="simulate" title="Simular flujo de corriente y encendido/apagado de luminarias en tiempo real">
          <span class="tool-tile__icon">${icon('refresh', 17)}</span>
          <span class="tool-tile__label">⚡ Probar / Simular</span>
        </button>
        <button type="button" class="tool-tile elec-diag-btn" data-elec-action="diagnose" title="Verificar instalación: errores de conexión, cuadro de cargas, breakers y presupuesto de metraje 3D">
          <span class="tool-tile__icon">${icon('sliders', 17)}</span>
          <span class="tool-tile__label">📋 Diagnóstico MEP</span>
        </button>
      </div>

      <div class="struct-subhead" style="margin-top: 10px;">Tipo de Circuito para Trazado:</div>
      <div class="elec-circuit-selector">
        ${circuitPills}
      </div>

      <div class="struct-subhead" style="margin-top: 10px;">Dispositivos y Nodos Eléctricos:</div>
      <div class="tile-grid struct-grid elec-devices-grid">
        ${deviceTiles}
      </div>
    </div>
  `
}

export function mountToolboxPanel(container: HTMLElement, options: ToolboxOptions): ToolboxHandle {
  let activeStructMaterial: 'concrete' | 'wood' | 'steel' = 'concrete'

  container.innerHTML = `
    <div class="toolbox">
      <header class="panel__head">
        <span class="panel__title">${icon('ruler', 14)} ${t('panel.toolbox')}</span>
        <div class="panel__icons">
          <button type="button" class="icon-btn" data-panel-action="collapse-all" title="Plegar / desplegar secciones">${icon('sliders', 14)}</button>
          <button type="button" class="icon-btn" data-panel-close title="Cerrar panel lateral">${icon('close', 14)}</button>
        </div>
      </header>
      <div class="toolbox__subnav">
        <button type="button" class="subnav-tab is-active" data-rail-tab="tools">${icon('ruler', 13)}<span>${t('section.designTools')}</span></button>
        <button type="button" class="subnav-tab" data-rail-tab="materials">${icon('palette', 13)}<span>${t('section.materials')}</span></button>
        <button type="button" class="subnav-tab" data-rail-tab="catalog">${icon('shapes', 13)}<span>${t('section.catalog')}</span></button>
      </div>
      <div class="toolbox__scroll">
        <div class="toolbox__panel" data-panel="tools">
          ${renderAccordion(t('section.designTools'), renderWallTools(), true)}
          ${renderAccordion('⚡ Instalación Eléctrica y Cableado (MEP)', renderElectricalSection(), true)}
          ${renderAccordion(t('section.wallTemplates'), renderWallTemplatesSection(false), true)}
          ${renderAccordion('Topografía y Terreno', renderTopographySection(), false)}
          ${renderAccordion('Sistemas Estructurales y Formas 3D', renderStructuralGeneratorSection(), false)}
          ${renderAccordion(t('section.roofTypes'), renderPreviewGrid(ROOFS, '0 0 48 32'), false)}
        </div>
        <div class="toolbox__panel is-hidden" data-panel="materials" id="toolbox-materials-dock" style="height:100%;display:none;flex-direction:column;">
        </div>
        <div class="toolbox__panel is-hidden" data-panel="catalog">
          <div style="padding: 6px 10px 10px;">
            <input
              type="text"
              class="catalog-search-input"
              placeholder="🔍 Buscar bloque (sofá, cama, WC, auto...)"
              style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border, #374151); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 11px;"
            />
          </div>
          ${renderAccordion('1. 🛋️ Sala y Estar (Living Room)', renderCadBlockCategory('living'), true)}
          ${renderAccordion('2. 🍽️ Comedor y Desayunador (Dining)', renderCadBlockCategory('dining'), false)}
          ${renderAccordion('3. 🛏️ Dormitorios (Bedrooms)', renderCadBlockCategory('bedrooms'), false)}
          ${renderAccordion('4. 🚿 Baños y Sanitarios (Plumbing)', renderCadBlockCategory('bathrooms'), false)}
          ${renderAccordion('5. 🍳 Cocina y Lavandería (Kitchen & Laundry)', renderCadBlockCategory('kitchen'), false)}
          ${renderAccordion('6. 💻 Oficina y Estudio (Office)', renderCadBlockCategory('office'), false)}
          ${renderAccordion('7. 🚗 Vehículos y Entorno CAD (Exterior)', renderCadBlockCategory('exterior'), false)}
          ${renderAccordion('⚡ Instalación Eléctrica (MEP)', renderElectricalSection(), false)}
          ${renderAccordion(`${t('section.shapes')} (Plantillas de Muros 2D)`, renderWallTemplatesSection(true), false)}
          ${renderAccordion(t('section.openings'), renderPreviewGrid(OPENINGS, '0 0 48 48'), false)}
          ${renderAccordion('Sistemas Estructurales y Formas 3D', renderStructuralGeneratorSection(), false)}
        </div>
      </div>
    </div>
  `
  /* Acordeones plegables */
  container.querySelectorAll<HTMLElement>('.acc__head').forEach((head) => {
    head.addEventListener('click', () => {
      head.blur()
      head.closest('.acc')?.classList.toggle('is-open')
    })
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
      tab.blur()
      selectTab(tab.dataset.railTab as 'tools' | 'materials' | 'catalog')
    })
  })

  /* Plegar/desplegar todas las secciones */
  container.querySelector<HTMLButtonElement>('[data-panel-action="collapse-all"]')?.addEventListener('click', (e) => {
    ;(e.currentTarget as HTMLButtonElement | null)?.blur()
    const sections = [...container.querySelectorAll<HTMLElement>('.acc')]
    const collapse = sections.some((section) => section.classList.contains('is-open'))
    sections.forEach((section) => section.classList.toggle('is-open', !collapse))
  })

  /* Herramientas de muro, plantillas 2D y herramientas de selección/acción */
  const wallTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-wall-tool]')]
  const templateTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-wall-template]')]
  const actionToolTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-action-tool]')]

  const markWallTool = (type: WallSegmentType | null): void => {
    wallTiles.forEach((tile) => tile.classList.toggle('is-active', type !== null && tile.dataset.wallTool === type))
  }

  const markTemplate = (templateId: WallTemplateId | null): void => {
    templateTiles.forEach((tile) =>
      tile.classList.toggle('is-active', templateId !== null && tile.dataset.wallTemplate === templateId)
    )
  }

  const markActionTool = (actionId: string | null): void => {
    actionToolTiles.forEach((tile) =>
      tile.classList.toggle('is-active', actionId !== null && tile.dataset.actionTool === actionId)
    )
  }

  wallTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      tile.blur()
      const type = tile.dataset.wallTool as WallSegmentType
      markWallTool(type)
      markTemplate(null)
      markActionTool(null)
      markTopoMode('none')
      options.onSelectWallTool(type)
    })
  })

  /* Herramientas de Topografía y Terreno */
  const topoModeTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-topo-mode]')]
  const markTopoMode = (mode: 'none' | 'probe' | 'grade'): void => {
    topoModeTiles.forEach((tile) => {
      tile.classList.toggle('is-active', mode !== 'none' && tile.dataset.topoMode === mode)
    })
  }

  container.querySelectorAll<HTMLButtonElement>('[data-topo-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.blur()
      const act = btn.dataset.topoAction as 'import' | 'demo' | 'probe' | 'grade' | 'clearSpots'
      if (!act) return
      options.onTopographyAction?.(act)
    })
  })

  const elevInputs = [...container.querySelectorAll<HTMLInputElement>('[data-topo-target-elev]')]
  elevInputs.forEach((inp) => {
    inp.addEventListener('input', () => {
      const val = Number(inp.value)
      if (Number.isFinite(val)) {
        options.onTopographyTargetElevationChange?.(val)
      }
    })
  })

  container.querySelectorAll<HTMLButtonElement>('[data-topo-elev-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.blur()
      const val = Number(btn.dataset.topoElevPreset)
      if (!Number.isFinite(val)) return
      elevInputs.forEach((inp) => {
        inp.value = val.toFixed(2)
      })
      options.onTopographyTargetElevationChange?.(val)
    })
  })

  const shapeBtns = [...container.querySelectorAll<HTMLButtonElement>('[data-topo-shape]')]
  shapeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.blur()
      const shape = btn.dataset.topoShape as 'rect' | 'polygon'
      if (!shape) return
      shapeBtns.forEach((other) => other.classList.toggle('is-active', other.dataset.topoShape === shape))
      options.onTopographyShapeChange?.(shape)
    })
  })

  /* Selector de material estructural (sincronizado entre pestañas Herramientas y Catálogo) */
  const matPills = [...container.querySelectorAll<HTMLButtonElement>('[data-struct-mat]')]
  matPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pill.blur()
      const mat = pill.dataset.structMat as 'concrete' | 'wood' | 'steel'
      if (!mat) return
      activeStructMaterial = mat
      matPills.forEach((other) => other.classList.toggle('is-active', other.dataset.structMat === mat))
      options.onStructuralMaterialChange?.(mat)
    })
  })

  /* Catálogo (sistemas estructurales, formas geométricas, cubiertas, muebles y aberturas) */
  const catalogTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-catalog]')]
  const markCatalogItem = (id: string | null): void => {
    catalogTiles.forEach((tile) => {
      tile.classList.toggle('is-active', id !== null && tile.dataset.catalog?.split('|')[1] === id)
    })
  }

  catalogTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      tile.blur()
      const [kind, id] = (tile.dataset.catalog ?? '').split('|')
      if (!id) return
      markCatalogItem(id)
      markWallTool(null)
      markTemplate(null)
      markActionTool(null)
      markTopoMode('none')
      options.onSelectCatalogItem({ id, kind: kind as CatalogItem['kind'], label: tile.title })
    })
  })

  /* Búsqueda en vivo de bloques arquitectónicos CAD */
  const blockSearchInput = container.querySelector<HTMLInputElement>('.catalog-search-input')
  if (blockSearchInput) {
    blockSearchInput.addEventListener('input', () => {
      const q = blockSearchInput.value.toLowerCase().trim()
      container.querySelectorAll<HTMLButtonElement>('.cad-block-tile').forEach((btn) => {
        const title = (btn.title || '').toLowerCase()
        const label = (btn.querySelector('.tile__label')?.textContent || '').toLowerCase()
        const matches = !q || title.includes(q) || label.includes(q)
        btn.style.display = matches ? '' : 'none'
      })
      if (q) {
        container.querySelectorAll<HTMLElement>('.cad-blocks-grid').forEach((grid) => {
          const hasVisible = Array.from(grid.querySelectorAll<HTMLButtonElement>('.cad-block-tile')).some(
            (b) => b.style.display !== 'none'
          )
          grid.closest('.acc')?.classList.toggle('is-open', hasVisible)
        })
      }
    })
  }

  /* Acciones directas del registro central (plantillas 2D, seleccionar, mover, rotar, duplicar, borrar, vista, zoom, añadir). */
  container.querySelectorAll<HTMLButtonElement>('[data-toolbox-action]').forEach((tile) => {
    tile.addEventListener('click', () => {
      tile.blur()
      const actionId = tile.dataset.toolboxAction
      if (actionId) options.onAction(actionId)
    })
  })

  /* MEP Instalación Eléctrica */
  const elecDevTiles = [...container.querySelectorAll<HTMLButtonElement>('[data-elec-dev]')]
  const wireBtns = [...container.querySelectorAll<HTMLButtonElement>('[data-elec-wire-tool]')]
  const circuitPills = [...container.querySelectorAll<HTMLButtonElement>('[data-elec-circuit]')]
  const xrayBtns = [...container.querySelectorAll<HTMLButtonElement>('[data-elec-action="xray"]')]
  const simBtns = [...container.querySelectorAll<HTMLButtonElement>('[data-elec-action="simulate"]')]

  const markElecDev = (devType: ElectricalDeviceType | null): void => {
    elecDevTiles.forEach((tile) => tile.classList.toggle('is-active', devType !== null && tile.dataset.elecDev === devType))
  }

  elecDevTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      tile.blur()
      const devType = tile.dataset.elecDev as ElectricalDeviceType
      markElecDev(devType)
      markWallTool(null)
      markTemplate(null)
      markActionTool(null)
      markTopoMode('none')
      wireBtns.forEach((b) => b.classList.remove('is-active'))
      options.onSelectElectricalDevice?.(devType)
    })
  })

  wireBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.blur()
      const nextActive = !btn.classList.contains('is-active')
      wireBtns.forEach((b) => b.classList.toggle('is-active', nextActive))
      if (nextActive) {
        markElecDev(null)
        markWallTool(null)
        markTemplate(null)
        markActionTool(null)
        markTopoMode('none')
      }
      options.onToggleWiringTool?.(nextActive)
    })
  })

  circuitPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pill.blur()
      const cType = pill.dataset.elecCircuit as CircuitType
      circuitPills.forEach((p) => p.classList.toggle('is-active', p.dataset.elecCircuit === cType))
      options.onSelectElectricalCircuit?.(cType)
    })
  })

  container.querySelectorAll<HTMLButtonElement>('[data-elec-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.blur()
      const act = btn.dataset.elecAction as 'xray' | 'simulate' | 'diagnose' | 'clear'
      if (!act) return
      options.onElectricalAction?.(act)
    })
  })

  // Estado inicial coherente con el motor (arranca con la herramienta de muro simple).
  markWallTool(WallSegmentType.SimpleWall)

  return {
    setActiveWallTool(type: WallSegmentType | null): void {
      markWallTool(type)
      if (type !== null) {
        markTemplate(null)
        markActionTool(null)
        markElecDev(null)
        wireBtns.forEach((b) => b.classList.remove('is-active'))
      }
    },
    setActiveWallTemplate(templateId: WallTemplateId | null): void {
      markTemplate(templateId)
      if (templateId !== null) {
        markWallTool(null)
        markActionTool(null)
        markCatalogItem(null)
        markElecDev(null)
        wireBtns.forEach((b) => b.classList.remove('is-active'))
      }
    },
    setActiveActionTool(actionId: string | null): void {
      markActionTool(actionId)
      if (actionId !== null) {
        markWallTool(null)
        markTemplate(null)
        markCatalogItem(null)
        markElecDev(null)
        wireBtns.forEach((b) => b.classList.remove('is-active'))
      }
    },
    setActiveCatalogItem(id: string | null): void {
      markCatalogItem(id)
      if (id !== null) {
        markWallTool(null)
        markTemplate(null)
        markActionTool(null)
        markElecDev(null)
        wireBtns.forEach((b) => b.classList.remove('is-active'))
      }
    },
    setActiveTab(tab: 'tools' | 'materials' | 'catalog'): void {
      selectTab(tab)
    },
    getMaterialsContainer(): HTMLElement | null {
      return container.querySelector('#toolbox-materials-dock')
    },
    setActiveTopographyMode(mode: 'none' | 'probe' | 'grade'): void {
      markTopoMode(mode)
      if (mode !== 'none') {
        markWallTool(null)
        markTemplate(null)
        markActionTool(null)
        markCatalogItem(null)
        markElecDev(null)
        wireBtns.forEach((b) => b.classList.remove('is-active'))
      }
    },
    setCutFillStats(cutM3: number, fillM3: number, targetElev?: number): void {
      const cutEl = container.querySelector<HTMLElement>('[data-topo-cut]')
      const fillEl = container.querySelector<HTMLElement>('[data-topo-fill]')
      if (cutEl) cutEl.textContent = `${cutM3.toFixed(2)} m³`
      if (fillEl) fillEl.textContent = `${fillM3.toFixed(2)} m³`
      if (typeof targetElev === 'number' && Number.isFinite(targetElev)) {
        elevInputs.forEach((inp) => {
          inp.value = targetElev.toFixed(2)
        })
      }
    },
    getStructuralMaterial(): 'concrete' | 'wood' | 'steel' {
      return activeStructMaterial
    },
    setActiveElectricalDevice(deviceType: ElectricalDeviceType | null): void {
      markElecDev(deviceType)
      if (deviceType !== null) {
        markWallTool(null)
        markTemplate(null)
        markActionTool(null)
        markCatalogItem(null)
        markTopoMode('none')
        wireBtns.forEach((b) => b.classList.remove('is-active'))
      }
    },
    setWiringToolActive(active: boolean, circuit?: CircuitType): void {
      wireBtns.forEach((b) => b.classList.toggle('is-active', active))
      if (circuit) {
        circuitPills.forEach((p) => p.classList.toggle('is-active', p.dataset.elecCircuit === circuit))
      }
      if (active) {
        markWallTool(null)
        markTemplate(null)
        markActionTool(null)
        markCatalogItem(null)
        markTopoMode('none')
        markElecDev(null)
      }
    },
    setElectricalSimulating(simulating: boolean): void {
      simBtns.forEach((b) => b.classList.toggle('is-active', simulating))
    },
    setXRayActive(active: boolean): void {
      xrayBtns.forEach((b) => b.classList.toggle('is-active', active))
    }
  }
}
