import { AuthService, AuthUser } from '../services/AuthService'
import { icon } from './icons'

export interface AccountsPopupOptions {
  auth: AuthService
  onSignOut?: () => void
  onRequestAuth?: () => void
}

export interface AccountsPopupHandle {
  toggle: (anchor: HTMLElement) => void
  open: (anchor: HTMLElement) => void
  close: () => void
  isOpen: () => boolean
}

export function mountAccountsPopup(options: AccountsPopupOptions): AccountsPopupHandle {
  let popupEl: HTMLElement | null = null
  let isVisible = false

  function getInitials(user: AuthUser | null): string {
    if (!user) return '?'
    const parts = user.name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return (user.name[0] || user.email[0] || 'U').toUpperCase()
  }

  function close(): void {
    if (!isVisible || !popupEl) return
    isVisible = false
    popupEl.classList.remove('is-open')
    window.removeEventListener('pointerdown', onWindowPointerDown)
    window.removeEventListener('keydown', onKeyDown)
    setTimeout(() => {
      popupEl?.remove()
      popupEl = null
    }, 150)
  }

  function onWindowPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null
    if (popupEl && !popupEl.contains(target) && !target?.closest('[data-activity-action="accounts"]')) {
      close()
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      close()
    }
  }

  function open(anchor: HTMLElement): void {
    if (isVisible) {
      close()
      return
    }

    const user = options.auth.currentUser
    const isAuthenticated = options.auth.isAuthenticated()
    const isCloud = options.auth.configured && !user?.local
    const initials = getInitials(user)
    const displayName = user?.name || options.auth.displayName || 'Invitado'
    const email = user?.email || (isAuthenticated ? 'Sesión local' : 'Sin iniciar sesión')
    const providerBadge = isCloud ? 'Supabase Cloud' : isAuthenticated ? 'Modo Local SQLite' : 'Sin conexión'

    popupEl = document.createElement('div')
    popupEl.className = 'accounts-popup'
    popupEl.innerHTML = `
      <div class="accounts-popup__card">
        <div class="accounts-popup__header">
          <div class="accounts-popup__avatar">${initials}</div>
          <div class="accounts-popup__info">
            <div class="accounts-popup__name">${escapeHtml(displayName)}</div>
            <div class="accounts-popup__email">${escapeHtml(email)}</div>
            <div class="accounts-popup__badge accounts-popup__badge--${isCloud ? 'cloud' : 'local'}">
              ${icon(isCloud ? 'wifi' : 'database', 11)} ${providerBadge}
            </div>
          </div>
        </div>

        <div class="accounts-popup__divider"></div>

        <div class="accounts-popup__actions">
          ${
            isAuthenticated
              ? `
            <button class="accounts-popup__btn accounts-popup__btn--danger" data-account-action="sign-out">
              ${icon('logOut', 14)}
              <span>Cerrar sesión</span>
            </button>
          `
              : `
            <button class="accounts-popup__btn accounts-popup__btn--primary" data-account-action="sign-in">
              ${icon('user', 14)}
              <span>Iniciar sesión / Registrarse</span>
            </button>
          `
          }
        </div>
      </div>
    `

    // Posicionamiento junto al botón del ActivityBar
    const anchorRect = anchor.getBoundingClientRect()
    popupEl.style.left = `${anchorRect.right + 8}px`
    popupEl.style.bottom = `${Math.max(12, window.innerHeight - anchorRect.bottom - 4)}px`

    document.body.appendChild(popupEl)

    // Listeners
    popupEl.querySelector('[data-account-action="sign-out"]')?.addEventListener('click', () => {
      close()
      void options.auth.signOut().then(() => {
        options.onSignOut?.()
      })
    })

    popupEl.querySelector('[data-account-action="sign-in"]')?.addEventListener('click', () => {
      close()
      options.onRequestAuth?.()
    })

    // Animación de entrada
    requestAnimationFrame(() => {
      popupEl?.classList.add('is-open')
      isVisible = true
      window.addEventListener('pointerdown', onWindowPointerDown)
      window.addEventListener('keydown', onKeyDown)
    })
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  return {
    toggle(anchor: HTMLElement): void {
      if (isVisible) close()
      else open(anchor)
    },
    open,
    close,
    isOpen(): boolean {
      return isVisible
    }
  }
}

