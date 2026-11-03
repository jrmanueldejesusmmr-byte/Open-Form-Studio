import {
  LeftPanelId,
  MIN_LEFT_WIDTH,
  MAX_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  MAX_RIGHT_WIDTH,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH
} from './types'

export interface SidePanelHostOptions {
  workspace: HTMLElement
  initialLeftPanel: LeftPanelId | null
  initialLeftWidth: number
  initialRightOpen: boolean
  initialRightWidth: number
  onChanged?: () => void
}

export class SidePanelHost {
  private readonly workspace: HTMLElement
  private readonly leftPanelEl: HTMLElement
  private readonly rightPanelEl: HTMLElement
  private readonly leftResizerEl: HTMLElement
  private readonly rightResizerEl: HTMLElement
  private readonly options: SidePanelHostOptions

  private activeLeftPanel: LeftPanelId | null = null
  private leftWidth: number = DEFAULT_LEFT_WIDTH
  private isRightOpen = false
  private rightWidth: number = DEFAULT_RIGHT_WIDTH

  private readonly panelElements = new Map<LeftPanelId, HTMLElement>()
  private chatPanelElement: HTMLElement | null = null

  constructor(options: SidePanelHostOptions) {
    this.options = options
    this.workspace = options.workspace

    this.leftWidth = options.initialLeftWidth
    this.rightWidth = options.initialRightWidth
    this.activeLeftPanel = options.initialLeftPanel
    this.isRightOpen = options.initialRightOpen

    // Obtiene o crea los contenedores de paneles laterales
    this.leftPanelEl = this.ensureLeftContainer()
    this.rightPanelEl = this.ensureRightContainer()

    // Resizers
    this.leftResizerEl = this.createResizer('right')
    this.leftPanelEl.appendChild(this.leftResizerEl)
    this.bindLeftResizer(this.leftResizerEl)

    this.rightResizerEl = this.createResizer('left')
    this.rightPanelEl.insertBefore(this.rightResizerEl, this.rightPanelEl.firstChild)
    this.bindRightResizer(this.rightResizerEl)

    // Encuentra paneles hijos
    this.discoverChildPanels()

    this.applyState()
  }

  private ensureLeftContainer(): HTMLElement {
    let el = this.workspace.querySelector<HTMLElement>('#left-side-panel')
    if (!el) {
      el = document.createElement('div')
      el.id = 'left-side-panel'
      el.className = 'side-panel-host side-panel-host--left'
      // Inserta después de activity-bar o como primer hijo
      const activityBar = this.workspace.querySelector('#activity-bar')
      if (activityBar && activityBar.nextSibling) {
        this.workspace.insertBefore(el, activityBar.nextSibling)
      } else {
        this.workspace.insertBefore(el, this.workspace.firstChild)
      }
    }
    return el
  }

  private ensureRightContainer(): HTMLElement {
    let el = this.workspace.querySelector<HTMLElement>('#right-side-panel')
    if (!el) {
      el = document.createElement('div')
      el.id = 'right-side-panel'
      el.className = 'side-panel-host side-panel-host--right'
      const rightBar = this.workspace.querySelector('#right-activity-bar')
      if (rightBar) {
        this.workspace.insertBefore(el, rightBar)
      } else {
        this.workspace.appendChild(el)
      }
    }
    return el
  }

  private createResizer(side: 'left' | 'right'): HTMLElement {
    const resizer = document.createElement('div')
    resizer.className = `side-panel-resizer side-panel-resizer--${side}`
    resizer.title = 'Arrastra para redimensionar · doble clic para ancho predeterminado'
    return resizer
  }

  private discoverChildPanels(): void {
    const toolbox = this.workspace.querySelector<HTMLElement>('#toolbox-dock')
    const navigator = this.workspace.querySelector<HTMLElement>('#navigator-panel')
    const layers = this.workspace.querySelector<HTMLElement>('#properties-panel')
    const costs = this.workspace.querySelector<HTMLElement>('#cost-panel')
    const chat = this.workspace.querySelector<HTMLElement>('#chat-panel')

    if (toolbox) {
      this.panelElements.set('toolbox', toolbox)
      if (toolbox.parentElement !== this.leftPanelEl) {
        this.leftPanelEl.appendChild(toolbox)
      }
    }
    if (navigator) {
      this.panelElements.set('navigator', navigator)
      if (navigator.parentElement !== this.leftPanelEl) {
        this.leftPanelEl.appendChild(navigator)
      }
    }
    if (layers) {
      this.panelElements.set('layers', layers)
      if (layers.parentElement !== this.leftPanelEl) {
        this.leftPanelEl.appendChild(layers)
      }
    }
    if (costs) {
      this.panelElements.set('costs', costs)
      if (costs.parentElement !== this.leftPanelEl) {
        this.leftPanelEl.appendChild(costs)
      }
    }
    if (chat) {
      this.chatPanelElement = chat
      if (chat.parentElement !== this.rightPanelEl) {
        this.rightPanelEl.appendChild(chat)
      }
    }
  }

  private applyState(): void {
    // Panel izquierdo
    if (this.activeLeftPanel) {
      this.leftPanelEl.classList.remove('is-closed')
      this.leftPanelEl.style.width = `${this.leftWidth}px`
      this.leftPanelEl.style.display = 'flex'

      for (const [id, element] of this.panelElements) {
        const isMatch = id === this.activeLeftPanel
        element.classList.toggle('is-dock-hidden', !isMatch)
        element.style.display = isMatch ? 'flex' : 'none'
      }
    } else {
      this.leftPanelEl.classList.add('is-closed')
      this.leftPanelEl.style.width = '0px'
      this.leftPanelEl.style.display = 'none'

      for (const element of this.panelElements.values()) {
        element.classList.add('is-dock-hidden')
        element.style.display = 'none'
      }
    }

    // Panel derecho
    if (this.isRightOpen && this.chatPanelElement) {
      this.rightPanelEl.classList.remove('is-closed')
      this.rightPanelEl.style.width = `${this.rightWidth}px`
      this.rightPanelEl.style.display = 'flex'
      this.chatPanelElement.classList.remove('is-dock-hidden')
      this.chatPanelElement.style.display = 'flex'
    } else {
      this.rightPanelEl.classList.add('is-closed')
      this.rightPanelEl.style.width = '0px'
      this.rightPanelEl.style.display = 'none'
      if (this.chatPanelElement) {
        this.chatPanelElement.classList.add('is-dock-hidden')
        this.chatPanelElement.style.display = 'none'
      }
    }

    // Trigger de redimensionado para el viewport
    this.notifyResize()
  }

  private notifyResize(): void {
    window.dispatchEvent(new Event('resize'))
    this.options.onChanged?.()
  }

  private bindLeftResizer(resizer: HTMLElement): void {
    let startX = 0
    let startWidth = 0
    let dragging = false

    resizer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      dragging = true
      startX = event.clientX
      startWidth = this.leftWidth
      resizer.classList.add('is-dragging')
      resizer.setPointerCapture(event.pointerId)
      document.body.classList.add('is-resizing-panel')
    })

    resizer.addEventListener('pointermove', (event) => {
      if (!dragging) return
      const deltaX = event.clientX - startX
      const nextWidth = Math.min(Math.max(startWidth + deltaX, MIN_LEFT_WIDTH), MAX_LEFT_WIDTH)
      this.leftWidth = nextWidth
      this.leftPanelEl.style.width = `${nextWidth}px`
      this.notifyResize()
    })

    const onPointerUp = (event: PointerEvent): void => {
      if (!dragging) return
      dragging = false
      resizer.classList.remove('is-dragging')
      document.body.classList.remove('is-resizing-panel')
      if (resizer.hasPointerCapture(event.pointerId)) {
        resizer.releasePointerCapture(event.pointerId)
      }
      this.notifyResize()
    }

    resizer.addEventListener('pointerup', onPointerUp)
    resizer.addEventListener('pointercancel', onPointerUp)

    resizer.addEventListener('dblclick', () => {
      this.leftWidth = DEFAULT_LEFT_WIDTH
      this.leftPanelEl.style.width = `${DEFAULT_LEFT_WIDTH}px`
      this.notifyResize()
    })
  }

  private bindRightResizer(resizer: HTMLElement): void {
    let startX = 0
    let startWidth = 0
    let dragging = false

    resizer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      dragging = true
      startX = event.clientX
      startWidth = this.rightWidth
      resizer.classList.add('is-dragging')
      resizer.setPointerCapture(event.pointerId)
      document.body.classList.add('is-resizing-panel')
    })

    resizer.addEventListener('pointermove', (event) => {
      if (!dragging) return
      const deltaX = startX - event.clientX
      const nextWidth = Math.min(Math.max(startWidth + deltaX, MIN_RIGHT_WIDTH), MAX_RIGHT_WIDTH)
      this.rightWidth = nextWidth
      this.rightPanelEl.style.width = `${nextWidth}px`
      this.notifyResize()
    })

    const onPointerUp = (event: PointerEvent): void => {
      if (!dragging) return
      dragging = false
      resizer.classList.remove('is-dragging')
      document.body.classList.remove('is-resizing-panel')
      if (resizer.hasPointerCapture(event.pointerId)) {
        resizer.releasePointerCapture(event.pointerId)
      }
      this.notifyResize()
    }

    resizer.addEventListener('pointerup', onPointerUp)
    resizer.addEventListener('pointercancel', onPointerUp)

    resizer.addEventListener('dblclick', () => {
      this.rightWidth = DEFAULT_RIGHT_WIDTH
      this.rightPanelEl.style.width = `${DEFAULT_RIGHT_WIDTH}px`
      this.notifyResize()
    })
  }

  // --- API Pública ---

  setActiveLeftPanel(id: LeftPanelId | null): void {
    this.activeLeftPanel = id
    this.applyState()
  }

  getActiveLeftPanel(): LeftPanelId | null {
    return this.activeLeftPanel
  }

  toggleLeftPanel(id: LeftPanelId): boolean {
    if (this.activeLeftPanel === id) {
      this.activeLeftPanel = null
    } else {
      this.activeLeftPanel = id
    }
    this.applyState()
    return this.activeLeftPanel !== null
  }

  setRightPanelOpen(open: boolean): void {
    this.isRightOpen = open
    this.applyState()
  }

  toggleRightPanel(): boolean {
    this.isRightOpen = !this.isRightOpen
    this.applyState()
    return this.isRightOpen
  }

  isRightPanelOpen(): boolean {
    return this.isRightOpen
  }

  getLeftWidth(): number {
    return this.leftWidth
  }

  getRightWidth(): number {
    return this.rightWidth
  }

  reset(): void {
    this.activeLeftPanel = 'toolbox'
    this.leftWidth = DEFAULT_LEFT_WIDTH
    this.isRightOpen = false
    this.rightWidth = DEFAULT_RIGHT_WIDTH
    this.applyState()
  }
}

