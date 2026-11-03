/**
 * Modelo de datos del sistema de barra de actividades y paneles laterales
 * (estilo Visual Studio Code).
 */

export type PanelId = 'toolbox' | 'layers' | 'navigator' | 'costs' | 'chat'
export type LeftPanelId = 'toolbox' | 'navigator' | 'layers' | 'costs'

export interface ActivityLayoutState {
  version: 2
  /** Panel abierto en el lateral izquierdo, o `null` si está cerrado. */
  activeLeftPanel: LeftPanelId | null
  /** Ancho en píxeles del panel lateral izquierdo (min 200, max 650). */
  leftWidth: number
  /** Si el panel lateral derecho (Chat de IA) está abierto. */
  isRightPanelOpen: boolean
  /** Ancho en píxeles del panel lateral derecho (min 240, max 650). */
  rightWidth: number
}

export const LAYOUT_STORAGE_KEY = 'arqstudio.layout.v2'
export const LEGACY_LAYOUT_STORAGE_KEY = 'arqstudio.layout.v1'

export const DEFAULT_LEFT_WIDTH = 280
export const DEFAULT_RIGHT_WIDTH = 320
export const MIN_LEFT_WIDTH = 200
export const MAX_LEFT_WIDTH = 650
export const MIN_RIGHT_WIDTH = 240
export const MAX_RIGHT_WIDTH = 650

export function createDefaultLayout(): ActivityLayoutState {
  return {
    version: 2,
    activeLeftPanel: 'toolbox',
    leftWidth: DEFAULT_LEFT_WIDTH,
    isRightPanelOpen: false,
    rightWidth: DEFAULT_RIGHT_WIDTH
  }
}

export function validateLayout(raw: unknown): ActivityLayoutState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const data = raw as Partial<ActivityLayoutState>
  if (data.version !== 2) return null

  const validLeft: (LeftPanelId | null)[] = ['toolbox', 'navigator', 'layers', null]
  const activeLeft = validLeft.includes(data.activeLeftPanel ?? null) ? (data.activeLeftPanel ?? null) : 'toolbox'

  const leftWidth =
    typeof data.leftWidth === 'number' && Number.isFinite(data.leftWidth)
      ? Math.min(Math.max(data.leftWidth, MIN_LEFT_WIDTH), MAX_LEFT_WIDTH)
      : DEFAULT_LEFT_WIDTH

  const isRightOpen = typeof data.isRightPanelOpen === 'boolean' ? data.isRightPanelOpen : false

  const rightWidth =
    typeof data.rightWidth === 'number' && Number.isFinite(data.rightWidth)
      ? Math.min(Math.max(data.rightWidth, MIN_RIGHT_WIDTH), MAX_RIGHT_WIDTH)
      : DEFAULT_RIGHT_WIDTH

  return {
    version: 2,
    activeLeftPanel: activeLeft,
    leftWidth,
    isRightPanelOpen: isRightOpen,
    rightWidth
  }
}
