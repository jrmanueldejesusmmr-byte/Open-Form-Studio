import { icon } from './icons'

/** Puente expuesto por `src/preload/index.ts` o `window.electron.ipcRenderer` para controlar la ventana sin marco. */
export interface WindowBridge {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  onMaximizedChanged(callback: (maximized: boolean) => void): void
}

export function windowBridge(): WindowBridge | undefined {
  const win = window as unknown as {
    arqStudio?: { window?: WindowBridge }
    electron?: {
      ipcRenderer?: {
        send(channel: string, ...args: unknown[]): void
        invoke(channel: string, ...args: unknown[]): Promise<unknown>
        on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void
      }
    }
  }

  if (win.arqStudio?.window) {
    return win.arqStudio.window
  }

  if (win.electron?.ipcRenderer) {
    const ipc = win.electron.ipcRenderer
    return {
      minimize: () => ipc.send('window:minimize'),
      toggleMaximize: () => ipc.send('window:toggle-maximize'),
      close: () => ipc.send('window:close'),
      isMaximized: () => ipc.invoke('window:is-maximized') as Promise<boolean>,
      onMaximizedChanged: (callback: (maximized: boolean) => void) => {
        ipc.on('window:maximized-changed', (_event, maximized) => callback(Boolean(maximized)))
      }
    }
  }

  return undefined
}

export interface TitleBarOptions {
  title: string
  subtitle?: string
}

/**
 * Barra de título propia (la ventana de Electron va sin marco: `frame: false`).
 * El nodo raíz `.titlebar` es un flex: la marca queda a la izquierda (zona de
 * arrastre de la ventana) y `.titlebar__spacer` (flex:1) empuja los controles
 * de ventana al extremo derecho, como en Windows/Linux. Los botones
 * minimizar/maximizar/cerrar hablan con el proceso main por IPC a través del
 * puente de `preload`. Si el puente no está disponible (por ejemplo al abrir
 * el renderer en un navegador), los botones simplemente no se dibujan.
 */
export function mountTitleBar(container: HTMLElement, options: TitleBarOptions): void {
  const bridge = windowBridge()

  container.innerHTML = `
    <div class="titlebar">
      <div class="titlebar__brand">
        <span class="titlebar__logo">${icon('cube', 14)}</span>
        <span class="titlebar__title">${options.title}</span>
        ${options.subtitle ? `<span class="titlebar__subtitle">${options.subtitle}</span>` : ''}
      </div>
      <div class="titlebar__spacer"></div>
      ${
        bridge
          ? `<div class="titlebar__controls">
               <button class="win-btn" data-window-action="minimize" title="Minimizar">${icon('minimize', 14)}</button>
               <button class="win-btn" data-window-action="maximize" title="Maximizar">${icon('maximize', 13)}</button>
               <button class="win-btn win-btn--close" data-window-action="close" title="Cerrar">${icon('close', 14)}</button>
             </div>`
          : ''
      }
    </div>
  `



  if (!bridge) return

  const maximizeBtn = container.querySelector<HTMLButtonElement>('[data-window-action="maximize"]')

  const paintMaximize = (maximized: boolean): void => {
    if (!maximizeBtn) return
    maximizeBtn.innerHTML = icon(maximized ? 'restore' : 'maximize', 13)
    maximizeBtn.title = maximized ? 'Restaurar' : 'Maximizar'
  }

  container.querySelectorAll<HTMLButtonElement>('.win-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switch (btn.dataset.windowAction) {
        case 'minimize':
          bridge.minimize()
          break
        case 'maximize':
          bridge.toggleMaximize()
          break
        case 'close':
          bridge.close()
          break
      }
    })
  })

  // Doble clic en la zona de arrastre = maximizar/restaurar (como en el SO).
  container.querySelector('.titlebar__brand')?.addEventListener('dblclick', () => bridge.toggleMaximize())
  container.querySelector('.titlebar__spacer')?.addEventListener('dblclick', () => bridge.toggleMaximize())

  bridge.onMaximizedChanged(paintMaximize)
  void bridge
    .isMaximized()
    .then(paintMaximize)
    .catch(() => undefined)
}
