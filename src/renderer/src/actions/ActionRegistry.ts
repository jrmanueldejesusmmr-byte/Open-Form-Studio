import type { IconName } from '../ui/icons'
import { t } from '../i18n/es'

/**
 * Registro central de acciones de ArqStudio.
 *
 * Cada acción de la aplicación se declara **una sola vez** aquí (identificador,
 * etiqueta, icono, atajo por defecto, categoría y estado `enabled`) y su lógica
 * vive en un único `run()`. Todos los puntos de entrada de la interfaz —barra de
 * menú, barra de iconos, toolbox, menú contextual (Fase 4) y paleta de comandos
 * (Fase 4)— despachan por `run(id)`, de modo que no hay lógica duplicada ni
 * acciones que existan en un panel y no en otro.
 *
 * La separación es deliberada: este módulo describe *qué* acciones existen
 * (metadatos, agnósticos de la vista) y `workspace/mountWorkspace.ts` aporta los
 * *handlers* concretos al construir el editor.
 */

/** Familia de la acción; agrupa la paleta de comandos y los menús. */
export type ActionCategory =
  | 'archivo'
  | 'edicion'
  | 'dibujo'
  | 'modificadores'
  | 'herramientas'
  | 'anotacion'
  | 'aec'
  | 'notas'
  | 'vista'
  | 'ayudas'

/** Metadatos de una acción (sin lógica). */
export interface ActionMeta {
  id: string
  label: string
  icon: IconName
  category: ActionCategory
  /** Combinación por defecto (se gestiona en `KeybindingManager`, Fase 4). */
  defaultShortcut?: string
  /** En menús desplegables, dibuja un separador antes de la entrada. */
  separatorBefore?: boolean
}

/** Acción completa: metadatos + ejecución + disponibilidad. */
export interface ActionDefinition extends ActionMeta {
  enabled: () => boolean
  run: () => void
}

/**
 * Catálogo completo de acciones de la app. Es la fuente única para etiquetas e
 * iconos: los menús y el toolbox lo consultan en vez de repetir textos.
 */
export const ACTION_CATALOG: readonly ActionMeta[] = [
  /* Archivo */
  { id: 'file.dashboard', label: t('action.file.dashboard'), icon: 'house', category: 'archivo' },
  { id: 'file.new', label: t('action.file.new'), icon: 'plus', category: 'archivo', defaultShortcut: 'Ctrl+N', separatorBefore: true },
  { id: 'file.open', label: t('action.file.open'), icon: 'folderOpen', category: 'archivo', defaultShortcut: 'Ctrl+O' },
  { id: 'file.save', label: t('action.file.save'), icon: 'save', category: 'archivo', defaultShortcut: 'Ctrl+S', separatorBefore: true },
  { id: 'file.import', label: t('action.file.import'), icon: 'archive', category: 'archivo' },
  { id: 'file.print', label: t('action.file.print'), icon: 'printer', category: 'archivo', defaultShortcut: 'Ctrl+P' },
  { id: 'file.export', label: t('action.file.export'), icon: 'shapes', category: 'archivo' },
  { id: 'file.clear', label: t('action.file.clear'), icon: 'trash', category: 'archivo', defaultShortcut: 'X', separatorBefore: true },
  { id: 'file.exit', label: t('action.file.exit'), icon: 'close', category: 'archivo', separatorBefore: true },

  /* Edición */
  { id: 'edit.undo', label: t('action.edit.undo'), icon: 'undo', category: 'edicion', defaultShortcut: 'Ctrl+Z' },
  { id: 'edit.redo', label: t('action.edit.redo'), icon: 'redo', category: 'edicion', defaultShortcut: 'Ctrl+Y' },
  { id: 'edit.duplicate', label: t('action.edit.duplicate'), icon: 'copy', category: 'edicion', defaultShortcut: 'Ctrl+D' },
  { id: 'edit.copy', label: t('action.edit.copy'), icon: 'copy', category: 'edicion', defaultShortcut: 'Ctrl+C' },
  { id: 'edit.cut', label: t('action.edit.cut'), icon: 'scissors', category: 'edicion', defaultShortcut: 'Ctrl+X' },
  { id: 'edit.delete', label: t('action.edit.delete'), icon: 'trash', category: 'edicion', defaultShortcut: 'Supr' },
  {
    id: 'edit.selectAll',
    label: t('action.edit.selectAll'),
    icon: 'crosshair',
    category: 'edicion',
    defaultShortcut: 'Ctrl+A'
  },

  /* Dibujo */
  { id: 'tool.SimpleWall', label: t('action.tool.simpleWall'), icon: 'wall', category: 'dibujo', defaultShortcut: 'W' },
  { id: 'tool.StructuralSegment', label: t('action.tool.structuralSegment'), icon: 'cube', category: 'dibujo', defaultShortcut: 'E' },
  { id: 'tool.RoomWalls', label: t('action.tool.roomWalls'), icon: 'layers', category: 'dibujo' },
  { id: 'template.rect', label: t('action.template.rect'), icon: 'plan2d', category: 'dibujo', defaultShortcut: 'R', separatorBefore: true },
  { id: 'template.l', label: t('action.template.l'), icon: 'shapes', category: 'dibujo', defaultShortcut: 'L' },
  { id: 'template.u', label: t('action.template.u'), icon: 'shapes', category: 'dibujo', defaultShortcut: 'U' },
  { id: 'template.c', label: t('action.template.c'), icon: 'shapes', category: 'dibujo', defaultShortcut: 'P' },
  { id: 'template.t', label: t('action.template.t'), icon: 'shapes', category: 'dibujo', defaultShortcut: 'T' },
  { id: 'template.cross', label: t('action.template.cross'), icon: 'plus', category: 'dibujo', defaultShortcut: 'Y' },
  { id: 'template.ring', label: t('action.template.ring'), icon: 'orbit', category: 'dibujo', defaultShortcut: 'N' },
  { id: 'template.arc', label: t('action.template.arc'), icon: 'shapes', category: 'dibujo', defaultShortcut: 'B' },
  { id: 'tool.roof', label: t('action.tool.roof'), icon: 'roof', category: 'dibujo', separatorBefore: true },
  { id: 'tool.slab', label: t('action.tool.slab'), icon: 'table', category: 'dibujo' },
  { id: 'tool.door', label: t('action.tool.door'), icon: 'door', category: 'dibujo', separatorBefore: true },
  { id: 'tool.window', label: t('action.tool.window'), icon: 'window', category: 'dibujo' },
  { id: 'tool.stairs', label: t('action.tool.stairs'), icon: 'stairs', category: 'dibujo' },
  { id: 'tool.add', label: t('action.tool.add'), icon: 'plus', category: 'dibujo', defaultShortcut: 'A' },
  /* Niveles (multiplanta) */
  { id: 'level.add', label: t('action.level.add'), icon: 'plus', category: 'dibujo', separatorBefore: true },
  { id: 'level.next', label: t('action.level.next'), icon: 'stairs', category: 'dibujo' },

  /* Modificadores (viven en el toolbox) */
  { id: 'modify.move', label: t('action.modify.move'), icon: 'move', category: 'modificadores', defaultShortcut: 'V' },
  { id: 'modify.rotate90', label: t('action.modify.rotate90'), icon: 'rotateCw', category: 'modificadores', defaultShortcut: 'G' },
  { id: 'modify.copy', label: t('action.modify.copy'), icon: 'copy', category: 'modificadores' },
  { id: 'modify.trim', label: t('action.modify.trim'), icon: 'scissors', category: 'modificadores' },
  { id: 'modify.erase', label: t('action.modify.erase'), icon: 'trash', category: 'modificadores' },

  /* Herramientas de dibujo */
  { id: 'tool.pencil', label: t('action.tool.pencil'), icon: 'pencil', category: 'herramientas' },
  { id: 'tool.highlighter', label: t('action.tool.highlighter'), icon: 'highlighter', category: 'herramientas' },
  { id: 'tool.pen', label: t('action.tool.pen'), icon: 'pen', category: 'herramientas' },
  { id: 'tool.eraser', label: t('action.tool.eraser'), icon: 'eraser', category: 'herramientas' },
  { id: 'tool.ruler', label: t('action.tool.ruler'), icon: 'ruler', category: 'herramientas' },
  { id: 'tool.hand', label: t('action.tool.hand'), icon: 'hand', category: 'herramientas' },
  { id: 'tool.crosshair', label: t('action.tool.crosshair'), icon: 'crosshair', category: 'herramientas', defaultShortcut: 'S' },

  /* Anotación */
  { id: 'annot.text', label: t('action.annot.text'), icon: 'type', category: 'anotacion' },
  { id: 'annot.dimension', label: t('action.annot.dimension'), icon: 'ruler', category: 'anotacion' },
  { id: 'annot.tag', label: t('action.annot.tag'), icon: 'tag', category: 'anotacion' },
  { id: 'annot.highlight', label: t('action.annot.highlight'), icon: 'highlighter', category: 'anotacion' },

  /* Herramientas AEC */
  { id: 'aec.testHouse', label: t('action.aec.testHouse'), icon: 'cube', category: 'aec' },
  { id: 'aec.space', label: t('action.aec.space'), icon: 'plan2d', category: 'aec' },
  { id: 'aec.curtain', label: t('action.aec.curtain'), icon: 'grid', category: 'aec' },
  { id: 'aec.core', label: t('action.aec.core'), icon: 'layers', category: 'aec' },
  { id: 'aec.quantity', label: t('action.aec.quantity'), icon: 'sliders', category: 'aec' },
  { id: 'aec.levels', label: t('action.aec.levels'), icon: 'stairs', category: 'aec' },

  /* Notas */
  { id: 'notas.note', label: t('action.notas.note'), icon: 'message', category: 'notas' },
  { id: 'notas.leader', label: t('action.notas.leader'), icon: 'tag', category: 'notas' },
  { id: 'notas.revision', label: t('action.notas.revision'), icon: 'highlighter', category: 'notas' },
  { id: 'notas.table', label: t('action.notas.table'), icon: 'archive', category: 'notas' },

  /* Vistas */
  { id: 'view.toggle2d3d', label: t('action.view.toggle2d3d'), icon: 'plan2d', category: 'vista', defaultShortcut: 'Space' },
  { id: 'view.quadView', label: 'Vista Cuádruple BIM (Planta / Corte / Fachada / 3D)', icon: 'monitor', category: 'vista', defaultShortcut: '4' },
  { id: 'view.toggleBimTable', label: 'Tabla Maestra BIM, Cuantificación y Costos (Live Data)', icon: 'calculator', category: 'vista', defaultShortcut: 'Ctrl+Shift+B' },
  { id: 'aux.2d', label: t('action.aux.2d'), icon: 'plan2d', category: 'vista', defaultShortcut: '2' },
  { id: 'aux.3d', label: t('action.aux.3d'), icon: 'cube', category: 'vista', defaultShortcut: '3' },
  { id: 'aux.fit', label: t('action.aux.fit'), icon: 'crosshair', category: 'vista', defaultShortcut: 'C' },
  { id: 'view.orbit', label: t('action.view.orbit'), icon: 'orbit', category: 'vista', defaultShortcut: 'O' },
  { id: 'aux.reset', label: t('action.aux.reset'), icon: 'refresh', category: 'vista' },
  { id: 'aux.top', label: t('action.aux.top'), icon: 'plan2d', category: 'vista' },
  { id: 'aux.front', label: t('action.aux.front'), icon: 'monitor', category: 'vista' },
  { id: 'aux.right', label: t('action.aux.right'), icon: 'monitor', category: 'vista' },
  { id: 'aux.zoomIn', label: t('action.aux.zoomIn'), icon: 'zoomIn', category: 'vista', defaultShortcut: '+' },
  { id: 'aux.zoomOut', label: t('action.aux.zoomOut'), icon: 'zoomOut', category: 'vista', defaultShortcut: '−' },

  /* Ayudas de dibujo */
  { id: 'aids.grid', label: t('action.aids.grid'), icon: 'grid', category: 'ayudas' },
  { id: 'aids.snap', label: t('action.aids.snap'), icon: 'crosshair', category: 'ayudas' },
  { id: 'aids.ortho', label: t('action.aids.ortho'), icon: 'ruler', category: 'ayudas' },
  { id: 'aids.polar', label: t('action.aids.polar'), icon: 'crosshair', category: 'ayudas' },
  { id: 'aids.layers', label: t('action.aids.layers'), icon: 'layers', category: 'ayudas', defaultShortcut: 'Ctrl+2' },
  { id: 'help.shortcuts', label: t('action.help.shortcuts'), icon: 'keyboard', category: 'ayudas', defaultShortcut: '?', separatorBefore: true },

  /* Paleta de comandos (Fase 4) */
  {
    id: 'view.commandPalette',
    label: t('action.view.commandPalette'),
    icon: 'search',
    category: 'vista',
    defaultShortcut: 'Ctrl+K'
  },

  /* Paneles acoplables (Fase 1 del dock): menú «Ver» + atajos estilo VS Code */
  {
    id: 'view.toggleToolbox',
    label: t('action.view.toggleToolbox'),
    icon: 'ruler',
    category: 'vista',
    defaultShortcut: 'Ctrl+B'
  },
  {
    id: 'view.toggleLayers',
    label: t('action.view.toggleLayers'),
    icon: 'layers',
    category: 'vista',
    defaultShortcut: 'Ctrl+Shift+L'
  },
  {
    id: 'view.toggleNavigator',
    label: t('action.view.toggleNavigator'),
    icon: 'folderOpen',
    category: 'vista',
    // OJO: Ctrl+Shift+E ya es «Ajustar a pantalla» (aux.fit); se propone
    // Ctrl+Shift+N como alternativa sin choque.
    defaultShortcut: 'Ctrl+Shift+N'
  },
  {
    id: 'view.toggleCosts',
    label: t('action.view.toggleCosts'),
    icon: 'calculator',
    category: 'vista',
    defaultShortcut: 'Ctrl+Shift+C'
  },
  {
    id: 'view.toggleChat',
    label: t('action.view.toggleChat'),
    icon: 'message',
    category: 'vista',
    defaultShortcut: 'Ctrl+Shift+I'
  },
  {
    id: 'view.toggleTimeline',
    label: t('action.view.toggleTimeline'),
    icon: 'clock',
    category: 'vista',
    defaultShortcut: 'Ctrl+Shift+T'
  },
  {
    id: 'view.focusMode',
    label: t('action.view.focusMode'),
    icon: 'monitor',
    category: 'vista',
    // Acorde estilo VS Code: Ctrl+K y después Z (soporte en KeybindingManager).
    defaultShortcut: 'Ctrl+K Z',
    separatorBefore: true
  },
  {
    id: 'view.resetLayout',
    label: t('action.view.resetLayout'),
    icon: 'refresh',
    category: 'vista',
    separatorBefore: true
  }
]

/** Índice id → metadatos, para consultas O(1) desde los menús y herramientas. */
export const ACTION_CATALOG_MAP: ReadonlyMap<string, ActionMeta> = new Map(
  ACTION_CATALOG.map((action) => [action.id, action])

  
)

/** Devuelve los metadatos de una acción o `undefined` si no existe. */
export function getActionMeta(id: string): ActionMeta | undefined {
  return ACTION_CATALOG_MAP.get(id)
}

/**
 * Registro de acciones en uso. Se construye una sola vez (en el workspace) con
 * los handlers concretos; cualquier panel puede consultarlo para conocer la
 * etiqueta, el atajo o si una acción está habilitada.
 */
export class ActionRegistry {
  private readonly actions = new Map<string, ActionDefinition>()

  constructor(
    catalog: readonly ActionMeta[],
    handlers: Readonly<Record<string, () => void>>,
    enabled: Readonly<Record<string, () => boolean>> = {}
  ) {
    for (const meta of catalog) {
      const run = handlers[meta.id]
      if (!run) {
        // Un catálogo sin handler se registra como no-op para no romper el
        // arranque; el aviso en consola delata el olvido al desarrollar.
        console.warn(`[ActionRegistry] La acción «${meta.id}» no tiene handler; se ignora.`)
      }
      this.actions.set(meta.id, {
        ...meta,
        enabled: enabled[meta.id] ?? (() => true),
        run: run ?? (() => undefined)
      })
    }
  }

  /** Acción completa (metadatos + run + enabled). */
  get(id: string): ActionDefinition | undefined {
    return this.actions.get(id)
  }

  /** `true` si la acción existe (aunque esté deshabilitada). */
  has(id: string): boolean {
    return this.actions.has(id)
  }

  /** ¿Puede ejecutarse ahora mismo? Una acción inexistente se considera no disponible. */
  isEnabled(id: string): boolean {
    const action = this.actions.get(id)
    return action ? action.enabled() : false
  }

  /**
   * Ejecuta una acción por su id. Devuelve `false` si no existe o está
   * deshabilitada (permite a la UI dar feedback sin lanzar excepciones).
   */
  run(id: string): boolean {
    const action = this.actions.get(id)
    if (!action || !action.enabled()) return false
    action.run()
    return true
  }

  /** Todas las acciones registradas (para la paleta de comandos de la Fase 4). */
  all(): readonly ActionDefinition[] {
    return [...this.actions.values()]
  }

  /** Acciones de una categoría concreta. */
  byCategory(category: ActionCategory): readonly ActionDefinition[] {
    return this.all().filter((action) => action.category === category)
  }
}

