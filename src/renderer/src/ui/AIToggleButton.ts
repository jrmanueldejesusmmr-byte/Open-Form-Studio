import { icon } from './icons'

export interface AIToggleButtonOptions {
  isOpen?: boolean
  shortcut?: string
  onToggle: () => void
}

export interface AIToggleButtonHandle {
  setActive: (isOpen: boolean) => void
  isOpen: () => boolean
  setShortcut: (shortcut: string) => void
}

export function mountAIToggleButton(
  container: HTMLElement,
  options: AIToggleButtonOptions
): AIToggleButtonHandle {
  let isOpen = options.isOpen ?? false
  let shortcut = options.shortcut ?? 'Ctrl+Shift+I'

  function getTooltip(): string {
    return shortcut ? `Chat de IA · Astro (${shortcut})` : 'Chat de IA · Astro'
  }

  function render(): void {
    container.innerHTML = `
      <div class="ai-activity-bar">
        <button
          class="ai-toggle-btn${isOpen ? ' is-active' : ''}"
          title="${getTooltip()}"
          aria-label="Chat de IA (Astro)"
        >
          <span class="ai-toggle-btn__indicator"></span>
          <span class="ai-toggle-btn__icon">${icon('astro', 20)}</span>
          <span class="ai-toggle-btn__badge">IA</span>
        </button>
      </div>
    `

    const button = container.querySelector<HTMLButtonElement>('.ai-toggle-btn')
    button?.addEventListener('click', () => {
      options.onToggle()
    })
  }

  render()

  return {
    setActive(nextIsOpen: boolean): void {
      if (isOpen === nextIsOpen) return
      isOpen = nextIsOpen
      render()
    },
    isOpen(): boolean {
      return isOpen
    },
    setShortcut(nextShortcut: string): void {
      shortcut = nextShortcut
      render()
    }
  }
}

