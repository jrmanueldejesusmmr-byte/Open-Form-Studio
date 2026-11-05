import { type AuthService } from '../services/AuthService'
import { type ProjectStore } from '../services/ProjectStore'
import { isSupabaseConfigured, SUPABASE_SETUP_HINT } from '../services/supabaseClient'
import { type DashboardProject, formatRelativeTime, type ProjectMode } from '../models/DashboardProject'
import { icon, type IconName } from './icons'
import { projectThumbnailSvg, planThumbnailSvg } from './PlanThumbnail'
import { windowBridge } from './TitleBar'
import {
  listJoinRequestsForOwner,
  listNotificationsForUser,
  markAllNotificationsRead,
  requestToJoinRoom,
  resolveJoinRequest,
  subscribeGlobalCollaborationEvents,
  findRoomByCode
} from '../services/CollaborationService'
import { showToast } from './Toast'
import { renderNotificationsDropdown } from './NotificationsDropdown'
import logoUrl from '../assets/logo.png'
import {
  themeManager,
  BACKGROUND_THEMES,
  ACCENT_COLORS,
  type BackgroundThemeId,
  type AccentColorId,
  type WorkBgStyleId,
  type RenderQuality
} from '../services/ThemeManager'

/**
 * Pantalla inicial de la aplicación: «Mis proyectos».
 *
 * Contiene la barra superior TitleBar con marca, búsqueda, perfil y controles
 * de ventana OS (minimizar, maximizar, cerrar), la barra lateral de navegación
 * fija a la izquierda (Proyectos, Plantillas, Materiales, Mobiliario,
 * Configuración, Cerrar sesión), y el panel principal con la grilla de proyectos.
 */

export type DashboardSection = 'projects' | 'templates' | 'materials' | 'furniture' | 'settings'

export interface DashboardOptions {
  auth: AuthService
  store: ProjectStore
  /** Tarjeta o botón «+ Nuevo proyecto». */
  onNewProject(): void
  /** Abrir un proyecto para diseñar (el editor 3D lo pide autenticado). */
  onOpenProject(project: DashboardProject): void
  /** Importar un archivo (DXF, GLB/OBJ/STL, IFC) y crear un proyecto nuevo. */
  onImportProject(filePath?: string, fileName?: string, format?: 'dxf' | 'model' | 'ifc'): void | Promise<void>
  /** Diálogos disponibles para la pantalla. */
  dialogs: {
    confirm: (options: { title: string; message: string }) => Promise<boolean>
  }
  /** Eliminar un proyecto: el shell pide confirmación antes de borrarlo. */
  onDeleteProject(project: DashboardProject): void
  /** «Usar plantilla»: crea un proyecto a partir del diseño y abre el editor. */
  onUseTemplate(template: DashboardTemplate): void
  /** Pedir el login desde la propia pantalla (barra lateral o usuario «Invitado»). */
  onRequestAuth(reason: string): void
}

export interface DashboardHandle {
  /** Vuelve a leer los proyectos del almacén y repinta la pantalla. */
  refresh(): Promise<void>
  setSection(section: DashboardSection): void
  getSection(): DashboardSection
}

const NAV: Array<{ id: DashboardSection; label: string; icon: IconName }> = [
  { id: 'projects', label: 'Proyectos', icon: 'folderOpen' },
  { id: 'templates', label: 'Plantillas', icon: 'shapes' },
  { id: 'materials', label: 'Materiales', icon: 'palette' },
  { id: 'furniture', label: 'Mobiliario', icon: 'sofa' },
  { id: 'settings', label: 'Configuración', icon: 'settings' }
]

const SECTION_TITLES: Record<DashboardSection, string> = {
  projects: 'Mis proyectos',
  templates: 'Plantillas',
  materials: 'Materiales',
  furniture: 'Muestrario de mobiliario',
  settings: 'Configuración'
}

/** Plantilla de la sección «Plantillas» (reutiliza los diseños de ejemplo del motor 3D). */
export interface DashboardTemplate {
  name: string
  description: string
  designIndex: number
  mode: ProjectMode
}

const TEMPLATES: DashboardTemplate[] = [
  { name: 'Vivienda unifamiliar', description: 'Planta 8 × 6 m con tabique estructural central.', designIndex: 0, mode: '3D' },
  { name: 'Planta modular', description: '10 × 5 m con dos divisiones interiores.', designIndex: 1, mode: '2D' },
  { name: 'Apartamento compacto', description: '6 × 7 m con dos ambientes.', designIndex: 2, mode: '3D' }
]

/** Paleta de materiales del proyecto (catálogo de referencia). */
const MATERIALS: Array<{ name: string; hex: string; family: string }> = [
  { name: 'Hormigón visto', hex: '#8d9299', family: 'Estructura' },
  { name: 'Ladrillo rojo', hex: '#a2503a', family: 'Fábrica' },
  { name: 'Madera de roble', hex: '#b08050', family: 'Acabado' },
  { name: 'Yeso blanco', hex: '#e6e4e0', family: 'Acabado' },
  { name: 'Acero corten', hex: '#8a4b2d', family: 'Metálicos' },
  { name: 'Vidrio templado', hex: '#5d94a8', family: 'Carpintería' },
  { name: 'Mármol Calacatta', hex: '#ded9d1', family: 'Pétreos' },
  { name: 'Pizarra natural', hex: '#414850', family: 'Pétreos' }
]

/** Muestrario de mobiliario (iconos del set propio de `ui/icons`). */
const FURNITURE: Array<{ name: string; icon: IconName }> = [
  { name: 'Sofá modular', icon: 'sofa' },
  { name: 'Butaca', icon: 'armchair' },
  { name: 'Mesa de comedor', icon: 'table' },
  { name: 'Silla', icon: 'chair' },
  { name: 'Escritorio', icon: 'desk' },
  { name: 'Cama doble', icon: 'bed' },
  { name: 'Lámpara de pie', icon: 'lamp' },
  { name: 'Planta de interior', icon: 'plant' },
  { name: 'Puerta interior', icon: 'door' },
  { name: 'Ventana corredera', icon: 'window' }
]

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Los nombres de proyecto los escribe el usuario: nunca se inyectan en crudo. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

export function mountDashboard(container: HTMLElement, options: DashboardOptions): DashboardHandle {
  let section: DashboardSection = 'projects'
  let projects: DashboardProject[] = []
  let query = ''
  let loading = true
  let inboxOpen = false
  const bridge = windowBridge()

  function getUnreadCount(): number {
    const userId = options.auth.currentUser?.id
    if (!userId) return 0
    const pendingReqs = listJoinRequestsForOwner(userId).length
    const unreadNotifs = listNotificationsForUser(userId).filter((n) => !n.read && n.type !== 'join_request').length
    return pendingReqs + unreadNotifs
  }

  function renderInboxDropdownContent(): string {
    const user = options.auth.currentUser
    if (!user) {
      return renderNotificationsDropdown({
        user: null,
        pendingRequests: [],
        notifications: []
      })
    }

    const pendingRequests = listJoinRequestsForOwner(user.id)
    const notifications = listNotificationsForUser(user.id).filter((n) => n.type !== 'join_request').slice(0, 8)

    return renderNotificationsDropdown({
      user,
      pendingRequests,
      notifications
    })
  }

  function shellHtml(): string {
    return `
      <div class="dash">
        <!-- TitleBar superior estilo OS -->
        <header class="dash__topbar">
          <div class="dash__brand">
            <span class="dash__brand-mark" title="Open Form Studio">
              <img class="brand-logo-img" src="${logoUrl}" alt="Open Form Studio Logo" />
            </span>
            <span class="brand-title">
              <strong class="brand-title__bold">OPEN FORM</strong>
              <span class="brand-title__light">STUDIO</span>
            </span>
            <span class="dash__brand-badge">3D</span>
          </div>

          <div class="dash__topbar-search">
            <label class="dash__search">
              <span class="dash__search-icon">${icon('search', 14)}</span>
              <input class="dash__search-input" type="search" placeholder="Buscar proyecto por nombre…" data-dash-search />
            </label>
          </div>

          <div class="dash__topbar-actions">
            <!-- Bandeja de Mensajes y Solicitudes -->
            <div class="dash-inbox-wrap relative" data-inbox-wrap>
              <button
                class="dash__inbox-btn relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer flex items-center justify-center"
                type="button"
                data-dash-action="toggle-inbox"
                title="Mensajes y Solicitudes de Colaboración"
                aria-label="Mensajes y Notificaciones"
              >
                <span class="dash__inbox-icon">${icon('bell', 16)}</span>
                <span class="dash__inbox-badge is-hidden" data-inbox-badge>0</span>
              </button>
              <div class="dash-inbox-dropdown is-hidden absolute right-0 top-12 md:top-14 w-88 md:w-96 z-50 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-4 flex flex-col gap-3" data-inbox-dropdown></div>
            </div>

            <button class="dash__user" type="button" data-dash-action="account" title="Cuenta y configuración">
              <span class="dash__user-avatar" data-user-avatar></span>
              <span class="dash__user-name" data-user-name></span>
            </button>

            ${
              bridge
                ? `<div class="dash__win-controls">
                     <button class="win-btn" data-window-action="minimize" title="Minimizar">${icon('minimize', 14)}</button>
                     <button class="win-btn" data-window-action="maximize" title="Maximizar">${icon('maximize', 13)}</button>
                     <button class="win-btn win-btn--close" data-window-action="close" title="Cerrar">${icon('close', 14)}</button>
                   </div>`
                : ''
            }
          </div>
        </header>

        <!-- Cuerpo principal: Sidebar + Main -->
        <div class="dash__body">
          <aside class="dash__sidebar">
            <nav class="dash__nav" aria-label="Secciones">
              ${NAV.map(
                (item) =>
                  `<button class="dash__nav-item" type="button" data-dash-section="${item.id}">
                    <span class="dash__nav-indicator"></span>
                    <span class="dash__nav-icon">${icon(item.icon, 16)}</span>
                    <span class="dash__nav-label">${item.label}</span>
                  </button>`
              ).join('')}
            </nav>
            <div class="dash__sidebar-footer" data-sidebar-footer></div>
          </aside>

          <main class="dash__main">
            <section class="dash__content" data-dash-content></section>
          </main>
        </div>
      </div>
    `
  }

  function setSection(next: DashboardSection): void {
    section = next
    renderContent()
  }

  function paintInbox(): void {
    const badgeEl = container.querySelector<HTMLElement>('[data-inbox-badge]')
    const dropdownEl = container.querySelector<HTMLElement>('[data-inbox-dropdown]')
    const btnEl = container.querySelector<HTMLElement>('.dash__inbox-btn')
    const unread = getUnreadCount()

    if (badgeEl) {
      badgeEl.textContent = unread > 99 ? '99+' : String(unread)
      badgeEl.classList.toggle('is-hidden', unread === 0)
    }
    btnEl?.classList.toggle('is-active', inboxOpen)
    btnEl?.classList.toggle('has-unread', unread > 0)

    if (dropdownEl) {
      dropdownEl.classList.toggle('is-hidden', !inboxOpen)
      if (inboxOpen) {
        dropdownEl.innerHTML = renderInboxDropdownContent()
        const joinInput = dropdownEl.querySelector<HTMLInputElement>('[data-join-room-input]')
        joinInput?.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            dropdownEl.querySelector<HTMLElement>('[data-dash-action="join-room-submit"]')?.click()
          }
        })
      }
    }
  }

  function paintHeader(): void {
    const authenticated = options.auth.isAuthenticated()
    const name = options.auth.displayName
    const nameEl = container.querySelector<HTMLElement>('[data-user-name]')
    const avatarEl = container.querySelector<HTMLElement>('[data-user-avatar]')
    const userButton = container.querySelector<HTMLElement>('.dash__user')

    if (nameEl) nameEl.textContent = name
    if (avatarEl) avatarEl.innerHTML = authenticated ? escapeHtml(name.charAt(0).toUpperCase()) : icon('user', 14)
    userButton?.classList.toggle('is-guest', !authenticated)

    paintInbox()

    const footer = container.querySelector<HTMLElement>('[data-sidebar-footer]')
    if (footer) {
      footer.innerHTML = authenticated
        ? `<button class="dash__nav-item dash__nav-item--ghost" type="button" data-dash-action="signout"><span class="dash__nav-icon">${icon('logOut', 16)}</span><span class="dash__nav-label">Cerrar sesión</span></button>`
        : `<button class="dash__nav-item dash__nav-item--ghost" type="button" data-dash-action="auth"><span class="dash__nav-icon">${icon('lock', 16)}</span><span class="dash__nav-label">Iniciar sesión</span></button>`
    }
  }

  function paintNav(): void {
    container.querySelectorAll<HTMLElement>('[data-dash-section]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.dashSection === section)
    })
  }

  async function refresh(): Promise<void> {
    loading = true
    const t0 = performance.now()
    // Fase 1: sin sesión NO se pide la lista (ni lista, ni conteo, ni miniaturas).
    projects = options.auth.isAuthenticated() ? await options.store.list() : []
    const t1 = performance.now() // después de list() SQL/LocalStorage
    loading = false
    // eslint-disable-next-line no-console
    console.log('[PROFILING] Dashboard.refresh: store.list=' + (t1 - t0).toFixed(1) + 'ms, totalFromStart=' + (performance.now() - t0).toFixed(1) + 'ms')
    // Usar requestIdleCallback para renderizar la UI después de que el hilo principal esté ocioso,
    // evitando congelamientos al volver a la lista después de guardar.
    requestIdleCallback(() => {
      paintHeader()
      renderContent()
    }, { timeout: 500 })
  }

  async function handleSignOut(): Promise<void> {
    // Fase 1: al cerrar sesión se limpia el almacén en memoria (cachés,
    // marca de fallback) antes de soltar el usuario; la navegación al
    // pantalla de login la gobierna main.ts al recibir el cambio de sesión.
    options.store.reset()
    await options.auth.signOut()
    projects = []
    setSection('projects')
  }

  container.innerHTML = shellHtml()
  paintHeader()

  // Conexión de controles de ventana OS con el bridge
  if (bridge) {
    const maximizeBtn = container.querySelector<HTMLButtonElement>('.dash__win-controls [data-window-action="maximize"]')

    const paintMaximize = (maximized: boolean): void => {
      if (!maximizeBtn) return
      maximizeBtn.innerHTML = icon(maximized ? 'restore' : 'maximize', 13)
      maximizeBtn.title = maximized ? 'Restaurar' : 'Maximizar'
    }

    container.querySelectorAll<HTMLButtonElement>('.dash__win-controls .win-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
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

    container.querySelector('.dash__topbar')?.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement
      if (target.closest('button, input, label, a')) return
      bridge.toggleMaximize()
    })

    bridge.onMaximizedChanged(paintMaximize)
    void bridge.isMaximized().then(paintMaximize).catch(() => undefined)
  }

  // La sesión cambia el nombre de usuario y el origen de los proyectos (nube/local).
  options.auth.onChange(() => {
    paintHeader()
    void refresh()
  })

  // Suscripción en tiempo real a solicitudes y notificaciones
  subscribeGlobalCollaborationEvents(() => {
    paintInbox()
  })

  // Suscripción a cambios de tema en vivo
  themeManager.subscribe(() => {
    if (section === 'settings') {
      renderContent()
    }
  })

  document.addEventListener('pointerdown', (ev) => {
    if (!inboxOpen) return
    const target = ev.target as HTMLElement | null
    if (!target?.closest('[data-inbox-wrap]')) {
      inboxOpen = false
      paintInbox()
    }
  })

  container.addEventListener('click', (event) => {
    const target = event.target as HTMLElement

    const sectionButton = target.closest<HTMLElement>('[data-dash-section]')
    if (sectionButton?.dataset.dashSection) {
      setSection(sectionButton.dataset.dashSection as DashboardSection)
      return
    }

    const actionElement = target.closest<HTMLElement>('[data-dash-action]')
    const action = actionElement?.dataset.dashAction
    if (!action || !actionElement) return

    const projectId = actionElement.closest('[data-project-id]')?.getAttribute('data-project-id') ?? ''

    switch (action) {
      case 'toggle-inbox': {
        event.stopPropagation()
        inboxOpen = !inboxOpen
        paintInbox()
        break
      }
      case 'mark-notifications-read': {
        event.stopPropagation()
        const userId = options.auth.currentUser?.id
        if (userId) markAllNotificationsRead(userId)
        paintInbox()
        break
      }
      case 'join-room-submit': {
        event.stopPropagation()
        const user = options.auth.currentUser
        if (!user) {
          inboxOpen = false
          paintInbox()
          options.onRequestAuth('Inicia sesión para unirte a una sala colaborativa.')
          break
        }
        const input = container.querySelector<HTMLInputElement>('[data-join-room-input]')
        const submitBtn = container.querySelector<HTMLButtonElement>('[data-dash-action="join-room-submit"]')
        const rawCode = input?.value.trim().toUpperCase() ?? ''
        if (!rawCode) {
          showToast({
            title: 'Código requerido',
            subtitle: 'Ingresa el código del servidor (ej. ARQ-4829).',
            type: 'error'
          })
          break
        }
        if (submitBtn) {
          submitBtn.disabled = true
          submitBtn.innerHTML = `<span class="inline-block animate-spin mr-1">${icon('loader', 13)}</span> Conectando…`
        }
        const existingRoom = findRoomByCode(rawCode)
        // Si el proyecto ya existe en la lista del usuario o es el anfitrión, abrir directo
        const ownedProject = projects.find(
          (p) => p.roomCode?.toUpperCase() === rawCode || (existingRoom && p.id === existingRoom.projectId)
        )
        if (ownedProject) {
          inboxOpen = false
          paintInbox()
          options.onOpenProject({
            ...ownedProject,
            collaborationEnabled: true,
            roomCode: rawCode
          })
          break
        }
        void requestToJoinRoom({
          roomCode: rawCode,
          requesterId: user.id,
          requesterName: user.name || user.email || 'Colaborador',
          requesterEmail: user.email
        }).then((res) => {
          if (submitBtn) {
            submitBtn.disabled = false
            submitBtn.innerHTML = 'Solicitar Entrada / Unirse'
          }
          showToast({
            title: res.ok ? `Solicitud enviada a ${rawCode}` : 'Código inválido',
            subtitle: res.message,
            type: res.ok ? 'info' : 'error'
          })
          if (input && res.ok) input.value = ''
          paintInbox()
        })
        break
      }
      case 'accept-request': {
        event.stopPropagation()
        const reqId = actionElement.dataset.reqId ?? ''
        const roomCode = actionElement.dataset.roomCode ?? ''
        const requesterId = actionElement.dataset.requesterId ?? ''
        const requesterName = actionElement.dataset.requesterName ?? 'Colaborador'
        void resolveJoinRequest({
          requestId: reqId,
          roomCode,
          requesterId,
          requesterName,
          decision: 'approved',
          role: 'editor'
        }).then(() => {
          showToast({
            title: 'Colaborador aceptado',
            subtitle: `${requesterName} ahora tiene acceso como Editor en ${roomCode}.`,
            type: 'success'
          })
          paintInbox()
        })
        break
      }
      case 'reject-request': {
        event.stopPropagation()
        const reqId = actionElement.dataset.reqId ?? ''
        const roomCode = actionElement.dataset.roomCode ?? ''
        const requesterId = actionElement.dataset.requesterId ?? ''
        const requesterName = actionElement.dataset.requesterName ?? 'Colaborador'
        void resolveJoinRequest({
          requestId: reqId,
          roomCode,
          requesterId,
          requesterName,
          decision: 'rejected'
        }).then(() => {
          showToast({
            title: 'Solicitud rechazada',
            subtitle: `Se denegó el acceso de ${requesterName} a ${roomCode}.`,
            type: 'info'
          })
          paintInbox()
        })
        break
      }
      case 'new':
        options.onNewProject()
        break
      case 'auth':
        options.onRequestAuth('Inicia sesión para crear o editar proyectos.')
        break
      case 'import': {
        // Trigger the existing import flow via onImportProject callback
        // This will open the ImportDialog from main.ts with proper scene context
        options.onImportProject('', '', 'dxf')
        break
      }
      case 'account':
        setSection('settings')
        break
      case 'signout':
        void handleSignOut()
        break
      case 'open': {
        const project = projects.find((item) => item.id === projectId)
        if (project) options.onOpenProject(project)
        break
      }
      case 'delete': {
        const project = projects.find((item) => item.id === projectId)
        if (project) options.onDeleteProject(project)
        break
      }
      case 'template': {
        const index = Number(actionElement.getAttribute('data-template-index') ?? '-1')
        const template = TEMPLATES[index]
        if (template) options.onUseTemplate(template)
        break
      }
      case 'set-theme': {
        const themeId = actionElement.dataset.themeId as BackgroundThemeId
        if (themeId) {
          themeManager.setTheme(themeId)
          renderContent()
        }
        break
      }
      case 'set-accent': {
        const accentId = actionElement.dataset.accentId as AccentColorId
        if (accentId) {
          themeManager.setAccent(accentId)
          renderContent()
        }
        break
      }
      case 'set-bg-style': {
        const style = actionElement.dataset.bgStyle as WorkBgStyleId
        if (style) {
          themeManager.setWorkBgStyle(style)
          renderContent()
        }
        break
      }
      case 'set-quality': {
        const quality = actionElement.dataset.quality as RenderQuality
        if (quality) {
          themeManager.setRenderQuality(quality)
          renderContent()
        }
        break
      }
      case 'toggle-hardware-accel': {
        const current = themeManager.getConfig().hardwareAcceleration
        themeManager.setHardwareAcceleration(!current)
        renderContent()
        break
      }
      case 'save-theme-settings': {
        showToast({
          title: 'Configuración guardada',
          subtitle: 'La personalización visual se aplicó correctamente.',
          type: 'success'
        })
        break
      }
      case 'reset-theme-settings': {
        themeManager.resetToDefaults()
        renderContent()
        showToast({
          title: 'Valores restablecidos',
          subtitle: 'Se ha restaurado el tema original por defecto.',
          type: 'info'
        })
        break
      }
    }
  })

  container.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement
    if (!target.matches('[data-dash-search]')) return
    query = target.value
    renderContent()
  })

  function projectCard(project: DashboardProject): string {
    const collabBadge = project.roomCode
      ? `<span class="proj-card__collab-badge" title="Servidor Colaborativo ${escapeHtml(project.roomCode)}">${icon('users', 11)} ${escapeHtml(project.roomCode)}</span>`
      : ''
    return `
      <article class="proj-card" data-project-id="${project.id}">
        <button class="proj-card__surface" type="button" data-dash-action="open">
          <div class="proj-card__thumb-wrapper">
            <span class="proj-card__thumb">${projectThumbnailSvg(project)}</span>
            ${collabBadge}
            <span class="proj-card__badge proj-card__badge--${project.mode.toLowerCase()}">${project.mode}</span>
          </div>
          <div class="proj-card__footer">
            <div class="proj-card__meta">
              <h3 class="proj-card__name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</h3>
              <span class="proj-card__updated">${formatRelativeTime(project.updatedAt)}</span>
            </div>
          </div>
        </button>
        <button class="proj-card__delete" type="button" data-dash-action="delete" title="Eliminar proyecto">${icon('trash', 14)}</button>
      </article>`
  }

  function projectsView(): string {
    const term = query.trim().toLowerCase()

    // Fase 1 — SIN SESIÓN: nada de proyectos, conteos ni miniaturas en pantalla.
    if (!options.auth.isAuthenticated()) {
      return `
        <div class="dash__header">
          <div class="dash__header-info">
            <h1 class="dash__title">Mis proyectos</h1>
            <p class="dash__subtitle">Tu cuenta protege tus proyectos.</p>
          </div>
        </div>
        <p class="dash__empty">${icon('lock', 16)}<span>Inicia sesión o regístrate para ver y crear tus proyectos.</span></p>
        <p style="text-align:center;margin-top:12px">
          <button class="dash__btn-primary" type="button" data-dash-action="auth">
            ${icon('user', 16)}<span>Iniciar sesión / Registrarse</span>
          </button>
        </p>`
    }

    const visible = term ? projects.filter((project) => project.name.toLowerCase().includes(term)) : projects
    const degraded = options.store.cloudUnavailable
    const scope =
      options.auth.isAuthenticated() && !degraded
        ? 'guardados en tu cuenta de Supabase'
        : 'guardados en este equipo'

    return `
      <div class="dash__header">
        <div class="dash__header-info">
          <div class="dash__title-row">
            <h1 class="dash__title">Mis proyectos</h1>
            <span class="dash__count-badge">${projects.length}</span>
          </div>
          <p class="dash__subtitle">${projects.length === 1 ? '1 proyecto guardado' : `${projects.length} proyectos guardados`} · ${scope}</p>
        </div>
        <button class="dash__btn-secondary" type="button" data-dash-action="import" aria-label="Importar proyecto" title="Importar DXF, GLB, OBJ, STL, IFC o .arq">
          ${icon('upload', 16)}<span>Importar proyecto</span>
        </button>
        <button class="dash__btn-primary" type="button" data-dash-action="new">
          ${icon('plus', 16)}<span>Nuevo proyecto</span>
        </button>
      </div>

      ${
        isSupabaseConfigured
          ? ''
          : `<p class="dash__hint dash__hint--warning">${icon('alert', 14)}<span>${SUPABASE_SETUP_HINT}</span></p>`
      }

      <div class="dash__grid">
        <button class="proj-card proj-card--new" type="button" data-dash-action="new">
          <div class="proj-card__new-inner">
            <span class="proj-card__new-icon">${icon('plus', 22)}</span>
            <span class="proj-card__new-title">Nuevo proyecto</span>
            <span class="proj-card__new-sub">Crea un diseño desde cero en 2D o 3D</span>
          </div>
        </button>
        ${visible.map(projectCard).join('')}
      </div>

      ${loading ? `<p class="dash__loading">${icon('loader', 14)}<span>Cargando proyectos…</span></p>` : ''}
      ${
        !loading && visible.length === 0
          ? `<p class="dash__empty">${
              term
                ? `Ningún proyecto coincide con «${escapeHtml(query.trim())}».`
                : 'Aún no tienes proyectos. ¡Crea el primero!'
            }</p>`
          : ''
      }
    `
  }

  function templatesView(): string {
    return `
      <div class="dash__header">
        <div class="dash__header-info">
          <h1 class="dash__title">Plantillas</h1>
          <p class="dash__subtitle">Empieza desde un plano base: se crea un proyecto y se abre el editor.</p>
        </div>
      </div>
      <div class="dash__grid dash__grid--templates">
        ${TEMPLATES.map(
          (template, index) => `
          <article class="template-card">
            <div class="template-card__thumb-wrapper">
              <span class="template-card__thumb">${planThumbnailSvg(template.designIndex)}</span>
              <span class="proj-card__badge proj-card__badge--${template.mode.toLowerCase()}">${template.mode}</span>
            </div>
            <div class="template-card__body">
              <h3 class="template-card__name">${escapeHtml(template.name)}</h3>
              <p class="template-card__desc">${escapeHtml(template.description)}</p>
            </div>
            <button class="template-card__use" type="button" data-dash-action="template" data-template-index="${index}">
              ${icon('arrowRight', 14)}<span>Usar plantilla</span>
            </button>
          </article>`
        ).join('')}
      </div>`
  }

  function materialsView(): string {
    return `
      <div class="dash__header">
        <div class="dash__header-info">
          <h1 class="dash__title">Materiales</h1>
          <p class="dash__subtitle">Catálogo de materiales para asignar a muros, suelos y acabados.</p>
        </div>
      </div>
      <div class="dash__swatches">
        ${MATERIALS.map(
          (material) => `
          <article class="swatch">
            <span class="swatch__chip" style="background:${material.hex}"></span>
            <div class="swatch__meta">
              <span class="swatch__name">${escapeHtml(material.name)}</span>
              <span class="swatch__family">${escapeHtml(material.family)} · ${material.hex.toUpperCase()}</span>
            </div>
          </article>`
        ).join('')}
      </div>`
  }

  function furnitureView(): string {
    return `
      <div class="dash__header">
        <div class="dash__header-info">
          <h1 class="dash__title">Muestrario de mobiliario</h1>
          <p class="dash__subtitle">Mobiliario listo para colocar en el lienzo desde el panel de herramientas.</p>
        </div>
      </div>
      <div class="dash__list">
        ${FURNITURE.map(
          (item) =>
            `<article class="furniture-item"><span class="furniture-item__icon">${icon(item.icon, 16)}</span><span class="furniture-item__name">${escapeHtml(item.name)}</span></article>`
        ).join('')}
      </div>`
  }

  function settingsView(): string {
    const user = options.auth.currentUser
    const cloudConfigured = isSupabaseConfigured
    const dataMode = cloudConfigured
      ? user && !user.local
        ? options.store.cloudUnavailable
          ? 'SQLite local (este equipo)'
          : 'Nube (tabla proyectos)'
        : 'Local hasta iniciar sesión'
      : 'Local (este equipo)'

    const currentConfig = themeManager.getConfig()
    const activeTheme = BACKGROUND_THEMES[currentConfig.themeId] || BACKGROUND_THEMES['deep-dark']

    const themesList = (Object.keys(BACKGROUND_THEMES) as BackgroundThemeId[])
      .map((id) => {
        const theme = BACKGROUND_THEMES[id]
        const isSelected = theme.id === currentConfig.themeId
        return `
          <button
            type="button"
            class="theme-option-card ${isSelected ? 'is-selected' : ''}"
            data-dash-action="set-theme"
            data-theme-id="${theme.id}"
            title="${escapeHtml(theme.name)} — ${escapeHtml(theme.subtitle)}"
          >
            <div class="theme-preview-circle theme-circle--${theme.id}"></div>
            <span class="theme-option-label">${escapeHtml(theme.name)}</span>
          </button>
        `
      })
      .join('')

    const accentsList = (Object.keys(ACCENT_COLORS) as AccentColorId[])
      .map((id) => {
        const acc = ACCENT_COLORS[id]
        const isSelected = acc.id === currentConfig.accentId
        return `
          <button
            type="button"
            class="accent-option-dot ${isSelected ? 'is-selected' : ''}"
            data-dash-action="set-accent"
            data-accent-id="${acc.id}"
            style="background-color: ${acc.hex};"
            title="${escapeHtml(acc.name)} (${acc.hex})"
            aria-label="${escapeHtml(acc.name)}"
          ></button>
        `
      })
      .join('')

    return `
      <div class="dash__header">
        <div class="dash__header-info">
          <h1 class="dash__title">Configuración de la Aplicación</h1>
          <p class="dash__subtitle">Personaliza la apariencia gráfica, temas visuales y preferencias del sistema.</p>
        </div>
      </div>

      <div class="settings-view">
        <!-- Panel 1: Personalización de Interfaz (Theme & Colors) -->
        <section class="settings-card">
          <div class="settings-card__header">
            <h2 class="settings-section-title">Personalización de Interfaz</h2>
            <p class="settings-section-sub">Theme &amp; Colors</p>
          </div>

          <!-- Selector de Temas de Fondo -->
          <div class="settings-field-group">
            <div class="settings-field-header">
              <span class="settings-group-title">Temas de Fondo</span>
              <span class="settings-group-subtitle">${escapeHtml(activeTheme.subtitle)}</span>
            </div>
            <div class="theme-picker-grid">
              ${themesList}
            </div>
          </div>

          <!-- Selector de Color de Acento -->
          <div class="settings-field-group" style="margin-top: 24px;">
            <span class="settings-group-title">Color de Acento</span>
            <div class="accent-picker-row">
              ${accentsList}
            </div>
          </div>

          <!-- Selector de Estilo de Fondo de Trabajo -->
          <div class="settings-field-group" style="margin-top: 24px;">
            <div class="settings-group-row">
              <span class="settings-group-title">Estilo de Fondo de Trabajo</span>
              <div class="segmented-control" role="group" aria-label="Estilo de Fondo de Trabajo">
                <button
                  type="button"
                  class="segmented-btn ${currentConfig.workBgStyle === 'grid' ? 'is-selected' : ''}"
                  data-dash-action="set-bg-style"
                  data-bg-style="grid"
                >Grid/Retícula</button>
                <button
                  type="button"
                  class="segmented-btn ${currentConfig.workBgStyle === 'dots' ? 'is-selected' : ''}"
                  data-dash-action="set-bg-style"
                  data-bg-style="dots"
                >Puntos</button>
                <button
                  type="button"
                  class="segmented-btn ${currentConfig.workBgStyle === 'solid' ? 'is-selected' : ''}"
                  data-dash-action="set-bg-style"
                  data-bg-style="solid"
                >Sólido</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Panel 2: Motor y Rendimiento -->
        <section class="settings-card">
          <div class="settings-field-group">
            <div class="settings-group-row">
              <span class="settings-group-title">Ajustes de Renderizado 3D</span>
              <div class="segmented-control" role="group" aria-label="Ajustes de Renderizado 3D">
                <button
                  type="button"
                  class="segmented-btn ${currentConfig.renderQuality === 'high' ? 'is-selected' : ''}"
                  data-dash-action="set-quality"
                  data-quality="high"
                >Alto</button>
                <button
                  type="button"
                  class="segmented-btn ${currentConfig.renderQuality === 'medium' ? 'is-selected' : ''}"
                  data-dash-action="set-quality"
                  data-quality="medium"
                >Medio</button>
                <button
                  type="button"
                  class="segmented-btn ${currentConfig.renderQuality === 'low' ? 'is-selected' : ''}"
                  data-dash-action="set-quality"
                  data-quality="low"
                >Bajo</button>
              </div>
            </div>
          </div>

          <div class="settings-field-group" style="margin-top: 22px;">
            <div class="hw-switch-row">
              <div>
                <span class="settings-group-title" style="margin-bottom:0">Aceleración por Hardware</span>
                <p class="settings-group-desc">Aprovecha la GPU dedicada para un renderizado 3D fluido y eficiente.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="${currentConfig.hardwareAcceleration}"
                class="ui-toggle ${currentConfig.hardwareAcceleration ? 'is-active' : ''}"
                data-dash-action="toggle-hardware-accel"
                title="Alternar aceleración por hardware"
              >
                <span class="ui-toggle-thumb"></span>
              </button>
            </div>
          </div>

          <!-- Botones de Acción -->
          <div class="settings-footer-actions">
            <button class="dash__btn-primary" type="button" data-dash-action="save-theme-settings">
              <span>Guardar cambios</span>
            </button>
            <button class="dash__btn-secondary" type="button" data-dash-action="reset-theme-settings">
              <span>Restablecer predeterminados</span>
            </button>
          </div>
        </section>

        <!-- Paneles de Conexión y Cuenta -->
        <div class="dash__panels" style="margin-top: 4px;">
          <section class="dash__panel">
            <h2 class="dash__panel-title">Conexión con Supabase</h2>
            <dl class="dash__facts">
              <div><dt>Claves en el .env</dt><dd>${cloudConfigured ? 'Detectadas' : 'Sin configurar'}</dd></div>
              <div><dt>Modo de datos</dt><dd>${dataMode}</dd></div>
              <div><dt>Proyectos cargados</dt><dd>${projects.length}</dd></div>
            </dl>
            ${cloudConfigured ? '' : `<p class="dash__hint">${icon('info', 14)}<span>${SUPABASE_SETUP_HINT}</span></p>`}
          </section>

          <section class="dash__panel">
            <h2 class="dash__panel-title">Cuenta</h2>
            ${
              user
                ? `<dl class="dash__facts">
                     <div><dt>Usuario</dt><dd>${escapeHtml(user.name)}</dd></div>
                     <div><dt>Correo</dt><dd>${escapeHtml(user.email)}</dd></div>
                     <div><dt>Identificador</dt><dd>${escapeHtml(user.id)}</dd></div>
                   </dl>
                   <button class="dash__panel-button" type="button" data-dash-action="signout">${icon('logOut', 15)}<span>Cerrar sesión</span></button>`
                : `<p class="dash__hint">${icon('user', 14)}<span>Estás como invitado: puedes explorar la app, pero para crear o editar proyectos hay que iniciar sesión.</span></p>
                   <button class="dash__panel-button dash__panel-button--primary" type="button" data-dash-action="auth">${icon('lock', 15)}<span>Iniciar sesión / Registrarse</span></button>`
            }
          </section>
        </div>
      </div>
    `
  }

  function renderContent(): void {
    const target = container.querySelector<HTMLElement>('[data-dash-content]')
    if (!target) return

    const views: Record<DashboardSection, () => string> = {
      projects: projectsView,
      templates: templatesView,
      materials: materialsView,
      furniture: furnitureView,
      settings: settingsView
    }

    target.innerHTML = views[section]()
    paintNav()
  }

  renderContent()
  void refresh()

  return { refresh, setSection, getSection: () => section }
}

