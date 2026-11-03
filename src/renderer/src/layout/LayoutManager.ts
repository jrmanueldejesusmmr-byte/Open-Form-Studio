import { mountActivityBar, ActivityBarHandle, ActivityBarPanelId } from '../ui/ActivityBar'
import { mountAIToggleButton, AIToggleButtonHandle } from '../ui/AIToggleButton'
import { mountAccountsPopup, AccountsPopupHandle } from '../ui/AccountsPopup'
import { mountSettingsModal, SettingsModalHandle } from '../ui/SettingsModal'
import { SidePanelHost } from './SidePanelHost'
import {
  ActivityLayoutState,
  createDefaultLayout,
  LAYOUT_STORAGE_KEY,
  LeftPanelId,
  PanelId,
  validateLayout
} from './types'
import { AuthService } from '../services/AuthService'
import { IconName } from '../ui/icons'

export interface PanelDescriptor {
  id: PanelId
  title: string
  icon: IconName
  element: HTMLElement
  header?: string
  hasOwnCollapse?: boolean
  shortcut?: string
}

export interface LayoutManagerOptions {
  auth?: AuthService
  onChanged?: () => void
  onExitToDashboard?: () => void
  onRequestAuth?: () => void
  onCollaborationClick?: (button: HTMLElement) => void
  isGridVisible?: () => boolean
  onToggleGrid?: () => void
  isSnapEnabled?: () => boolean
  onToggleSnap?: () => void
  isOrthoEnabled?: () => boolean
  onToggleOrtho?: () => void
  isAiAutoApplyEnabled?: () => boolean
  onToggleAiAutoApply?: () => void
}

export class LayoutManager {
  private readonly workspace: HTMLElement
  private readonly options: LayoutManagerOptions
  private readonly descriptors = new Map<PanelId, PanelDescriptor>()

  private state: ActivityLayoutState = createDefaultLayout()
  private started = false
  private focusSnapshot: { activeLeft: LeftPanelId | null; rightOpen: boolean } | null = null

  private activityBar!: ActivityBarHandle
  private aiToggleButton!: AIToggleButtonHandle
  private sidePanelHost!: SidePanelHost
  private accountsPopup?: AccountsPopupHandle
  private settingsModal?: SettingsModalHandle

  constructor(workspace: HTMLElement, options: LayoutManagerOptions = {}) {
    this.workspace = workspace
    this.options = options
  }

  /* ---------- Registro e inicio ---------- */

  register(descriptor: PanelDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor)
  }

  start(): void {
    if (this.started) return
    this.started = true

    this.state = this.load()

    this.buildChrome()
    this.bindPanelCloseButtons()
  }

  private buildChrome(): void {
    // 1. Contenedor de ActivityBar a la izquierda
    let activityBarContainer = this.workspace.querySelector<HTMLElement>('#activity-bar')
    if (!activityBarContainer) {
      activityBarContainer = document.createElement('div')
      activityBarContainer.id = 'activity-bar'
      this.workspace.insertBefore(activityBarContainer, this.workspace.firstChild)
    }

    // 2. Contenedor de botón de IA a la derecha
    let rightBarContainer = this.workspace.querySelector<HTMLElement>('#right-activity-bar')
    if (!rightBarContainer) {
      rightBarContainer = document.createElement('div')
      rightBarContainer.id = 'right-activity-bar'
      this.workspace.appendChild(rightBarContainer)
    }

    // 3. Popup de Cuentas y Modal de Ajustes
    if (this.options.auth) {
      this.accountsPopup = mountAccountsPopup({
        auth: this.options.auth,
        onSignOut: () => {
          this.options.onExitToDashboard?.()
        },
        onRequestAuth: () => {
          this.options.onRequestAuth?.()
        }
      })
    }

    this.settingsModal = mountSettingsModal({
      onResetLayout: () => this.reset(),
      isGridVisible: this.options.isGridVisible,
      onToggleGrid: this.options.onToggleGrid,
      isSnapEnabled: this.options.isSnapEnabled,
      onToggleSnap: this.options.onToggleSnap,
      isOrthoEnabled: this.options.isOrthoEnabled,
      onToggleOrtho: this.options.onToggleOrtho,
      isAiAutoApplyEnabled: this.options.isAiAutoApplyEnabled,
      onToggleAiAutoApply: this.options.onToggleAiAutoApply
    })

    // 4. Montar ActivityBar
    this.activityBar = mountActivityBar(activityBarContainer, {
      activePanel: this.state.activeLeftPanel,
      onTogglePanel: (panelId) => {
        this.toggleLeft(panelId)
      },
      onAccountsClick: (btn) => {
        this.accountsPopup?.toggle(btn)
      },
      onCollaborationClick: (btn) => {
        this.options.onCollaborationClick?.(btn)
      },
      onSettingsClick: () => {
        this.settingsModal?.open()
      }
    })

    // 5. Montar AIToggleButton
    this.aiToggleButton = mountAIToggleButton(rightBarContainer, {
      isOpen: this.state.isRightPanelOpen,
      shortcut: this.descriptors.get('chat')?.shortcut ?? 'Ctrl+Shift+I',
      onToggle: () => {
        this.toggleRight()
      }
    })

    // 6. Montar SidePanelHost
    this.sidePanelHost = new SidePanelHost({
      workspace: this.workspace,
      initialLeftPanel: this.state.activeLeftPanel,
      initialLeftWidth: this.state.leftWidth,
      initialRightOpen: this.state.isRightPanelOpen,
      initialRightWidth: this.state.rightWidth,
      onChanged: () => {
        this.syncStateFromHost()
        this.save()
        this.options.onChanged?.()
      }
    })
  }

  private bindPanelCloseButtons(): void {
    this.workspace.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      const closeBtn = target?.closest<HTMLElement>('[data-panel-close]')
      if (!closeBtn) return

      const leftSide = closeBtn.closest('#left-side-panel')
      const rightSide = closeBtn.closest('#right-side-panel')

      if (leftSide) {
        this.setLeftActive(null)
      } else if (rightSide) {
        this.setRightOpen(false)
      }
    })
  }

  private syncStateFromHost(): void {
    // Reentrancia durante la construcción: el constructor de `SidePanelHost`
    // dispara `onChanged` (applyState → notifyResize) ANTES de que se complete la
    // asignación `this.sidePanelHost = new SidePanelHost(...)` (LayoutManager.ts:140),
    // por lo que `this.sidePanelHost` aún es `undefined`. Sin esta guarda el
    // `TypeError` abortaba `layout.start()` y, con él, todo el montaje del editor
    // (esfera de órbita, indicador de ejes e interacciones del lienzo).
    if (!this.sidePanelHost) return
    this.state.activeLeftPanel = this.sidePanelHost.getActiveLeftPanel()
    this.state.leftWidth = this.sidePanelHost.getLeftWidth()
    this.state.isRightPanelOpen = this.sidePanelHost.isRightPanelOpen()
    this.state.rightWidth = this.sidePanelHost.getRightWidth()
  }

  /* ---------- API Pública ---------- */

  toggle(id: PanelId): boolean {
    if (id === 'chat') {
      return this.toggleRight()
    }
    return this.toggleLeft(id as LeftPanelId)
  }

  toggleLeft(id: LeftPanelId): boolean {
    const isNowVisible = this.sidePanelHost.toggleLeftPanel(id)
    const activeLeft = this.sidePanelHost.getActiveLeftPanel()
    this.activityBar.setActive(activeLeft)
    this.syncStateFromHost()
    this.save()
    this.options.onChanged?.()
    return isNowVisible
  }

  setLeftActive(id: LeftPanelId | null): void {
    this.sidePanelHost.setActiveLeftPanel(id)
    this.activityBar.setActive(id)
    this.syncStateFromHost()
    this.save()
    this.options.onChanged?.()
  }

  toggleRight(): boolean {
    const isOpen = this.sidePanelHost.toggleRightPanel()
    this.aiToggleButton.setActive(isOpen)
    this.syncStateFromHost()
    this.save()
    this.options.onChanged?.()
    return isOpen
  }

  setRightOpen(open: boolean): void {
    this.sidePanelHost.setRightPanelOpen(open)
    this.aiToggleButton.setActive(open)
    this.syncStateFromHost()
    this.save()
    this.options.onChanged?.()
  }

  isVisible(id: PanelId): boolean {
    if (id === 'chat') {
      return this.sidePanelHost?.isRightPanelOpen() ?? this.state.isRightPanelOpen
    }
    const active = this.sidePanelHost?.getActiveLeftPanel() ?? this.state.activeLeftPanel
    return active === id
  }

  setShortcuts(shortcuts: Readonly<Partial<Record<PanelId, string>>>): void {
    const leftShortcuts: Partial<Record<ActivityBarPanelId, string>> = {}
    if (shortcuts.toolbox) leftShortcuts.toolbox = shortcuts.toolbox
    if (shortcuts.navigator) leftShortcuts.navigator = shortcuts.navigator
    if (shortcuts.layers) leftShortcuts.layers = shortcuts.layers
    if (shortcuts.costs) leftShortcuts.costs = shortcuts.costs

    this.activityBar?.setShortcuts(leftShortcuts)

    if (shortcuts.chat) {
      this.aiToggleButton?.setShortcut(shortcuts.chat)
    }
  }

  setCollaborationState(state: { active?: boolean; badgeCount?: number; pulsing?: boolean }): void {
    this.activityBar?.setCollaborationState(state)
  }

  toggleFocusMode(): boolean {
    if (this.focusSnapshot) {
      // Restaurar
      this.setLeftActive(this.focusSnapshot.activeLeft)
      this.setRightOpen(this.focusSnapshot.rightOpen)
      this.focusSnapshot = null
      return false
    }

    // Activar Focus Mode: guardar estado y cerrar todo
    this.focusSnapshot = {
      activeLeft: this.sidePanelHost.getActiveLeftPanel(),
      rightOpen: this.sidePanelHost.isRightPanelOpen()
    }
    this.setLeftActive(null)
    this.setRightOpen(false)
    return true
  }

  isFocusMode(): boolean {
    return this.focusSnapshot !== null
  }

  reset(): void {
    this.sidePanelHost.reset()
    this.activityBar.setActive('toolbox')
    this.aiToggleButton.setActive(false)
    this.focusSnapshot = null
    this.syncStateFromHost()
    this.save()
    this.options.onChanged?.()
  }

  /* ---------- Persistencia ---------- */

  private load(): ActivityLayoutState {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (!raw) return createDefaultLayout()
      const parsed: unknown = JSON.parse(raw)
      return validateLayout(parsed) ?? createDefaultLayout()
    } catch {
      return createDefaultLayout()
    }
  }

  private save(): void {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // Ignorar si no hay almacenamiento
    }
  }
}
