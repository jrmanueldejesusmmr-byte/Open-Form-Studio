import { icon, IconName } from './icons'

export type ActivityBarPanelId = 'toolbox' | 'navigator' | 'layers' | 'costs'

export interface ActivityBarItem {
  id: ActivityBarPanelId
  title: string
  icon: IconName
  shortcut?: string
}

export interface ActivityBarOptions {
  activePanel?: ActivityBarPanelId | null
  onTogglePanel: (panelId: ActivityBarPanelId) => void
  onAccountsClick: (button: HTMLElement) => void
  onCollaborationClick?: (button: HTMLElement) => void
  onSettingsClick: () => void
}

export interface ActivityBarHandle {
  setActive: (panelId: ActivityBarPanelId | null) => void
  getActive: () => ActivityBarPanelId | null
  setShortcuts: (shortcuts: Partial<Record<ActivityBarPanelId, string>>) => void
  setCollaborationState: (state: { active?: boolean; badgeCount?: number; pulsing?: boolean }) => void
}

export const ACTIVITY_BAR_ITEMS: readonly ActivityBarItem[] = [
  { id: 'toolbox', title: 'Herramientas AEC', icon: 'ruler', shortcut: 'Ctrl+B' },
  { id: 'navigator', title: 'Navegador del Proyecto', icon: 'folderOpen', shortcut: 'Ctrl+Shift+N' },
  { id: 'layers', title: 'Capas y Propiedades', icon: 'layers', shortcut: 'Ctrl+Shift+L' },
  { id: 'costs', title: 'Tabla Maestra BIM, Cuantificación y Costos', icon: 'calculator', shortcut: 'Ctrl+Shift+C' }
]

export function mountActivityBar(container: HTMLElement, options: ActivityBarOptions): ActivityBarHandle {
  let activePanel: ActivityBarPanelId | null = options.activePanel ?? null
  let collabActive = false
  let collabBadgeCount = 0
  let collabPulsing = false
  const shortcuts: Partial<Record<ActivityBarPanelId, string>> = {}

  ACTIVITY_BAR_ITEMS.forEach((item) => {
    if (item.shortcut) shortcuts[item.id] = item.shortcut
  })

  function getTooltip(item: ActivityBarItem): string {
    const sc = shortcuts[item.id] ?? item.shortcut
    return sc ? `${item.title} (${sc})` : item.title
  }

  function render(): void {
    const badgeHtml =
      collabBadgeCount > 0 || collabPulsing
        ? `<span class="activity-bar__collab-badge${collabPulsing ? ' is-pulsing' : ''}">${
            collabBadgeCount > 0 ? (collabBadgeCount > 9 ? '9+' : collabBadgeCount) : ''
          }</span>`
        : ''

    container.innerHTML = `
      <div class="activity-bar">
        <div class="activity-bar__top">
          ${ACTIVITY_BAR_ITEMS.map(
            (item) => `
            <button
              class="activity-bar__btn${activePanel === item.id ? ' is-active' : ''}"
              data-activity-id="${item.id}"
              title="${getTooltip(item)}"
              aria-label="${item.title}"
            >
              <span class="activity-bar__indicator"></span>
              <span class="activity-bar__icon">${icon(item.icon, 20)}</span>
            </button>
          `
          ).join('')}
        </div>
        <div class="activity-bar__bottom">
          <button
            class="activity-bar__btn activity-bar__btn--action"
            data-activity-action="accounts"
            title="Cuentas (Perfil y Sesión)"
            aria-label="Cuentas"
          >
            <span class="activity-bar__icon">${icon('user', 19)}</span>
          </button>
          <button
            class="activity-bar__btn activity-bar__btn--action activity-bar__btn--collab${collabActive ? ' is-active' : ''}"
            data-activity-action="collaboration"
            title="Colaboración y Chat en Tiempo Real"
            aria-label="Colaboración y Chat"
          >
            <span class="activity-bar__indicator"></span>
            <span class="activity-bar__icon">${icon('users', 19)}</span>
            ${badgeHtml}
          </button>
          <button
            class="activity-bar__btn activity-bar__btn--action"
            data-activity-action="settings"
            title="Ajustes (Preferencias de la aplicación)"
            aria-label="Ajustes"
          >
            <span class="activity-bar__icon">${icon('settings', 19)}</span>
          </button>
        </div>
      </div>
    `

    // Listeners para paneles principales
    container.querySelectorAll<HTMLButtonElement>('[data-activity-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.activityId as ActivityBarPanelId
        options.onTogglePanel(id)
      })
    })

    // Listeners para acciones inferiores
    const accountsBtn = container.querySelector<HTMLButtonElement>('[data-activity-action="accounts"]')
    accountsBtn?.addEventListener('click', () => {
      if (accountsBtn) options.onAccountsClick(accountsBtn)
    })

    const collabBtn = container.querySelector<HTMLButtonElement>('[data-activity-action="collaboration"]')
    collabBtn?.addEventListener('click', () => {
      if (collabBtn) options.onCollaborationClick?.(collabBtn)
    })

    const settingsBtn = container.querySelector<HTMLButtonElement>('[data-activity-action="settings"]')
    settingsBtn?.addEventListener('click', () => {
      options.onSettingsClick()
    })
  }

  render()

  return {
    setActive(panelId: ActivityBarPanelId | null): void {
      if (activePanel === panelId) return
      activePanel = panelId
      render()
    },
    getActive(): ActivityBarPanelId | null {
      return activePanel
    },
    setShortcuts(nextShortcuts: Partial<Record<ActivityBarPanelId, string>>): void {
      Object.assign(shortcuts, nextShortcuts)
      render()
    },
    setCollaborationState(state: { active?: boolean; badgeCount?: number; pulsing?: boolean }): void {
      if (state.active !== undefined) collabActive = state.active
      if (state.badgeCount !== undefined) collabBadgeCount = state.badgeCount
      if (state.pulsing !== undefined) collabPulsing = state.pulsing
      render()
    }
  }
}

