import { icon } from './icons'
import { showToast } from './Toast'
import {
  formatTimeHHMM,
  type ActivityLogEntry,
  type ChatMessage,
  type CollaborationRoomHandle,
  type CollaboratorRole,
  type JoinRequestItem,
  type RoomMember
} from '../services/CollaborationService'

/**
 * FASE 4: Panel Lateral Desplegable de Colaboración (Drawer en Visor 3D)
 *
 * Al hacer clic en el botón de colaboración del visor 3D (barra lateral izquierda,
 * directamente debajo del icono de perfil de usuario), se despliega este panel
 * lateral derecho (Dark Mode, `backdrop-blur`, ancho de 380px) dividido en 3 pestañas:
 *
 *  1. "Chat del Equipo"
 *  2. "Registro de Cambios en Vivo" (Activity Log)
 *  3. "Gestión de Sala" (Control del Anfitrión)
 */

export type CollaborationDrawerTab = 'chat' | 'activity' | 'manage'

export interface CollaborationDrawerOptions {
  currentUserId: () => string
  currentUserName: () => string
  onEnableCollaboration?: () => Promise<CollaborationRoomHandle | null>
  onOpenStateChange?: (isOpen: boolean, unreadCount: number, pulsing: boolean) => void
}

export interface CollaborationDrawerHandle {
  open(tab?: CollaborationDrawerTab): void
  close(): void
  toggle(): void
  isOpen(): boolean
  setRoom(room: CollaborationRoomHandle | null, projectName?: string): void
  notifyIncomingChat(msg: ChatMessage): void
  notifyIncomingActivity(entry: ActivityLogEntry): void
  refresh(): void
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch)
}

function roleLabel(role: CollaboratorRole): string {
  if (role === 'owner') return 'Creador'
  if (role === 'editor') return 'Editor'
  return 'Solo lectura'
}

export function mountCollaborationDrawer(
  hostContainer: HTMLElement,
  options: CollaborationDrawerOptions
): CollaborationDrawerHandle {
  let isVisible = false
  let activeTab: CollaborationDrawerTab = 'chat'
  let roomHandle: CollaborationRoomHandle | null = null
  let currentProjectName = 'Proyecto actual'
  let unreadCount = 0
  let isPulsing = false

  const drawerEl = document.createElement('aside')
  drawerEl.id = 'collaboration-drawer'
  drawerEl.className =
    'collab-drawer is-hidden fixed top-0 right-0 h-full w-80 md:w-96 z-50 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col'
  drawerEl.setAttribute('aria-label', 'Panel de Colaboración y Chat en Vivo')
  hostContainer.appendChild(drawerEl)

  function emitBadgeState(): void {
    options.onOpenStateChange?.(isVisible, unreadCount, isPulsing)
  }

  function renderChatTab(): string {
    if (!roomHandle) return renderNoServerState()
    const messages = roomHandle.getMessages()
    const myId = options.currentUserId()

    return `
      <div class="collab-chat flex flex-col h-full min-h-0 flex-1">
        <div class="collab-chat__messages flex-1 overflow-y-auto space-y-3 pr-1 min-h-0" data-collab-chat-list>
          ${
            messages.length === 0
              ? `
              <div class="collab-empty-state flex flex-col items-center justify-center text-center p-6 my-auto text-slate-400">
                <div class="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3 border border-slate-700/40">
                  ${icon('messageSquare', 24)}
                </div>
                <span class="text-sm font-semibold text-slate-200 mb-1">Chat del Equipo (${escapeHtml(roomHandle.roomCode)})</span>
                <span class="text-xs text-slate-400 leading-relaxed max-w-[240px]">Envía un mensaje para coordinar cambios del modelo 3D en tiempo real.</span>
              </div>
            `
              : messages
                  .map((m) => {
                    const isLocal = m.senderId === myId
                    const initial = (m.senderName || 'U').trim().charAt(0).toUpperCase()
                    const timeStr = formatTimeHHMM(m.timestamp)
                    return `
                      <div class="collab-msg flex gap-2.5 ${isLocal ? 'flex-row-reverse' : 'flex-row'}">
                        <div class="w-7 h-7 rounded-full ${isLocal ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'} text-xs font-bold flex items-center justify-center shrink-0 mt-0.5" title="${escapeHtml(m.senderName)}">
                          ${escapeHtml(initial)}
                        </div>
                        <div class="collab-msg__bubble max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                          isLocal
                            ? 'bg-blue-600/20 border border-blue-500/30 text-slate-100 rounded-tr-none'
                            : 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-none'
                        }">
                          <div class="flex items-center gap-2 mb-1 text-[10px]">
                            <span class="font-semibold ${isLocal ? 'text-blue-300' : 'text-slate-300'}">${escapeHtml(isLocal ? `${m.senderName} (Tú)` : m.senderName)}</span>
                            <span class="text-slate-500">${timeStr}</span>
                          </div>
                          <div class="leading-relaxed break-words text-slate-100">${escapeHtml(m.text)}</div>
                        </div>
                      </div>
                    `
                  })
                  .join('')
          }
        </div>
        <div class="collab-chat__composer flex items-center gap-2 pt-3 border-t border-slate-800 mt-2 shrink-0">
          <input
            type="text"
            class="collab-chat__input flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            placeholder="Escribe un mensaje al equipo… (Enter para enviar)"
            maxlength="400"
            data-collab-chat-input
          />
          <button type="button" class="collab-chat__send-btn inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition shrink-0 cursor-pointer" data-collab-action="send-chat" title="Enviar mensaje">
            ${icon('send', 14)}
            <span>Enviar</span>
          </button>
        </div>
      </div>
    `
  }

  function renderActivityTab(): string {
    if (!roomHandle) return renderNoServerState()
    const logs = roomHandle.getActivities()

    return `
      <div class="collab-activity flex flex-col h-full min-h-0 flex-1">
        <div class="collab-activity__header-note flex items-center gap-2 text-xs text-slate-400 mb-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60 shrink-0">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span>Supervisión en tiempo real sobre la escena Three.js</span>
        </div>
        <div class="collab-activity__feed flex-1 overflow-y-auto space-y-2 pr-1 min-h-0" data-collab-activity-list>
          ${
            logs.length === 0
              ? `
              <div class="collab-empty-state flex flex-col items-center justify-center text-center p-6 my-auto text-slate-400">
                <div class="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3 border border-slate-700/40">
                  ${icon('activity', 24)}
                </div>
                <span class="text-sm font-semibold text-slate-200 mb-1">Sin actividad registrada aún</span>
                <span class="text-xs text-slate-400 leading-relaxed max-w-[240px]">Cada vez que alguien agregue, modifique o elimine un elemento 3D aparecerá aquí al instante.</span>
              </div>
            `
              : logs
                  .map((item) => {
                    const formattedLine = `${item.description} [${item.timeLabel}]`
                    const bulletColor =
                      item.actionType.includes('add')
                        ? 'bg-emerald-400'
                        : item.actionType.includes('remove')
                          ? 'bg-rose-400'
                          : 'bg-blue-400'
                    return `
                      <div class="collab-log-item flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 text-xs">
                        <span class="w-1.5 h-1.5 rounded-full ${bulletColor} mt-1.5 shrink-0"></span>
                        <div class="collab-log-item__content min-w-0">
                          <p class="collab-log-item__text text-slate-300 leading-snug m-0">${escapeHtml(formattedLine)}</p>
                        </div>
                      </div>
                    `
                  })
                  .join('')
          }
        </div>
      </div>
    `
  }

  function renderManageTab(): string {
    if (!roomHandle) return renderNoServerState()

    const members: RoomMember[] = roomHandle.getMembers()
    const onlineCount = roomHandle.getOnlineCount()
    const requests: JoinRequestItem[] = roomHandle.getJoinRequests()
    const isOwner = roomHandle.getCurrentUserRole() === 'owner'
    const myId = options.currentUserId()

    return `
      <div class="collab-manage flex flex-col h-full overflow-y-auto space-y-4 pr-1 min-h-0">
        <!-- 1. Código del Servidor -->
        <div class="collab-server-card p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">CÓDIGO DEL SERVIDOR</span>
            <span class="text-xs text-emerald-400 font-medium">● Activo</span>
          </div>
          <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
            <span class="text-base font-mono font-bold tracking-wider text-blue-400" data-room-code-display>${escapeHtml(roomHandle.roomCode)}</span>
            <button type="button" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition cursor-pointer" data-collab-action="copy-code">
              ${icon('copy', 13)}
              <span data-copy-label>Copiar código</span>
            </button>
          </div>
          <p class="text-[11px] text-slate-400 mt-2 mb-0 leading-normal">Comparte este código para que otros arquitectos o clientes soliciten unirse a la sala.</p>
        </div>

        <!-- 2. Lista de Colaboradores -->
        <div class="collab-section">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              ${onlineCount} ${onlineCount === 1 ? 'colaborador conectado' : 'colaboradores conectados'}
            </span>
          </div>

          <div class="collab-members-list space-y-2">
            ${members
              .map((m) => {
                const initial = (m.userName || 'U').trim().charAt(0).toUpperCase()
                const isSelf = m.userId === myId
                const canManageMember = isOwner && !isSelf && m.role !== 'owner'
                return `
                  <div class="collab-member-row flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 text-xs">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="relative w-7 h-7 rounded-full bg-slate-700 text-slate-200 font-bold flex items-center justify-center text-xs shrink-0">
                        <span>${escapeHtml(initial)}</span>
                        <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${m.online ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
                      </div>
                      <div class="min-w-0">
                        <div class="font-medium text-slate-200 truncate">${escapeHtml(m.userName)}${isSelf ? ' (Tú)' : ''}</div>
                        <div class="text-[10px] text-slate-400 capitalize">${roleLabel(m.role)}</div>
                      </div>
                    </div>
                    ${
                      canManageMember
                        ? `
                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition cursor-pointer"
                            data-collab-action="toggle-role"
                            data-target-user="${escapeHtml(m.userId)}"
                            title="Alternar entre Editor y Solo lectura"
                          >
                            ${m.role === 'editor' ? 'Solo lectura' : 'Hacer Editor'}
                          </button>
                          <button
                            type="button"
                            class="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                            data-collab-action="kick-member"
                            data-target-user="${escapeHtml(m.userId)}"
                            title="Expulsar colaborador"
                          >
                            ${icon('userMinus', 13)}
                          </button>
                        </div>
                      `
                        : ''
                    }
                  </div>
                `
              })
              .join('')}
          </div>
        </div>

        <!-- 3. Control de Acceso y Solicitudes -->
        <div class="collab-section">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-300">Solicitudes de Acceso (${requests.length})</span>
            ${
              isOwner
                ? `<button type="button" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer" data-collab-action="simulate-request" title="Simular solicitud entrante de colaborador">+ Simular solicitud</button>`
                : ''
            }
          </div>

          ${
            requests.length === 0
              ? `<p class="text-xs text-slate-500 italic p-3 rounded-lg bg-slate-900/50 border border-slate-800/60 text-center m-0">No hay solicitudes pendientes en este momento.</p>`
              : `<div class="collab-requests-list space-y-2">
                  ${requests
                    .map(
                      (req) => `
                    <div class="collab-req-card p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 flex items-center justify-between text-xs">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-7 h-7 rounded-full bg-blue-600/30 text-blue-400 font-bold flex items-center justify-center text-xs shrink-0">${escapeHtml(req.requesterName.charAt(0).toUpperCase())}</span>
                        <div class="min-w-0">
                          <div class="font-medium text-slate-200 truncate">${escapeHtml(req.requesterName)}</div>
                          <div class="text-[10px] text-slate-400">Solicita unirse a ${escapeHtml(req.roomCode)}</div>
                        </div>
                      </div>
                      ${
                        isOwner
                          ? `
                          <div class="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              class="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-[11px] transition cursor-pointer"
                              data-collab-action="accept-join"
                              data-req-id="${escapeHtml(req.id)}"
                              data-requester-id="${escapeHtml(req.requesterId)}"
                              data-requester-name="${escapeHtml(req.requesterName)}"
                            >
                              ${icon('check', 12)} Aceptar
                            </button>
                            <button
                              type="button"
                              class="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-[11px] transition cursor-pointer"
                              data-collab-action="reject-join"
                              data-req-id="${escapeHtml(req.id)}"
                              data-requester-id="${escapeHtml(req.requesterId)}"
                              data-requester-name="${escapeHtml(req.requesterName)}"
                            >
                              ${icon('close', 12)} Rechazar
                            </button>
                          </div>
                        `
                          : `<span class="text-[10px] text-slate-500 italic">Esperando al anfitrión…</span>`
                      }
                    </div>
                  `
                    )
                    .join('')}
                </div>`
          }
        </div>
      </div>
    `
  }

  function renderNoServerState(): string {
    return `
      <div class="collab-no-server flex flex-col items-center justify-center text-center p-6 my-auto text-slate-400">
        <div class="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
          ${icon('users', 28)}
        </div>
        <h4 class="text-base font-semibold text-slate-100 mb-2">Modo Individual</h4>
        <p class="text-xs text-slate-400 leading-relaxed mb-5 max-w-[280px]">
          Este proyecto se encuentra en modo local individual. Puedes activar un servidor de colaboración con código único <strong class="text-blue-400">ARQ-XXXX</strong> ahora mismo.
        </p>
        <button type="button" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition cursor-pointer" data-collab-action="enable-server">
          ${icon('zap', 15)}
          <span>Habilitar servidor colaborativo</span>
        </button>
      </div>
    `
  }

  function render(): void {
    const reqCount = roomHandle ? roomHandle.getJoinRequests().length : 0

    drawerEl.innerHTML = `
      <div class="collab-drawer__header flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/95 shrink-0">
        <div class="collab-drawer__title-group flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            ${icon('users', 18)}
          </div>
          <div class="min-w-0">
            <h3 class="collab-drawer__title text-sm font-semibold text-slate-100 m-0">Colaboración en Equipo</h3>
            <span class="collab-drawer__subtitle text-[11px] text-slate-400 block truncate">${
              roomHandle
                ? `Sala ${escapeHtml(roomHandle.roomCode)} · ${escapeHtml(currentProjectName)}`
                : escapeHtml(currentProjectName)
            }</span>
          </div>
        </div>
        <button type="button" class="collab-drawer__close p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer" data-collab-action="close-drawer" title="Cerrar panel">
          ${icon('close', 16)}
        </button>
      </div>

      <!-- Navegación de 3 Pestañas -->
      <div class="collab-drawer__tabs flex justify-between border-b border-slate-800 p-2 text-xs bg-slate-900/60 shrink-0 gap-1" role="tablist">
        <button
          type="button"
          role="tab"
          class="collab-drawer__tab flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition cursor-pointer ${activeTab === 'chat' ? 'is-active bg-slate-800 text-blue-400 font-semibold shadow-sm' : ''}"
          data-collab-tab="chat"
        >
          ${icon('messageSquare', 14)}
          <span class="truncate">Chat del Equipo</span>
        </button>
        <button
          type="button"
          role="tab"
          class="collab-drawer__tab flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition cursor-pointer ${activeTab === 'activity' ? 'is-active bg-slate-800 text-blue-400 font-semibold shadow-sm' : ''}"
          data-collab-tab="activity"
        >
          ${icon('activity', 14)}
          <span class="truncate">Cambios en Vivo</span>
        </button>
        <button
          type="button"
          role="tab"
          class="collab-drawer__tab flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition cursor-pointer ${activeTab === 'manage' ? 'is-active bg-slate-800 text-blue-400 font-semibold shadow-sm' : ''}"
          data-collab-tab="manage"
        >
          ${icon('shield', 14)}
          <span class="truncate">Gestión de Sala</span>
          ${reqCount > 0 ? `<span class="collab-drawer__tab-badge ml-1 px-1.5 py-0.2 bg-blue-500 text-white rounded-full text-[10px] font-bold">${reqCount}</span>` : ''}
        </button>
      </div>

      <div class="collab-drawer__body flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
        ${
          activeTab === 'chat'
            ? renderChatTab()
            : activeTab === 'activity'
              ? renderActivityTab()
              : renderManageTab()
        }
      </div>
    `

    // Auto-scroll al último mensaje del chat
    if (activeTab === 'chat') {
      const chatList = drawerEl.querySelector<HTMLElement>('[data-collab-chat-list]')
      if (chatList) {
        chatList.scrollTop = chatList.scrollHeight
      }
      const chatInput = drawerEl.querySelector<HTMLInputElement>('[data-collab-chat-input]')
      chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleSendChat()
        }
      })
    }
  }

  function handleSendChat(): void {
    if (!roomHandle) return
    const input = drawerEl.querySelector<HTMLInputElement>('[data-collab-chat-input]')
    const text = input?.value.trim() ?? ''
    if (!text) return
    roomHandle.sendChatMessage(text)
    if (input) input.value = ''
    render()
    const nextInput = drawerEl.querySelector<HTMLInputElement>('[data-collab-chat-input]')
    nextInput?.focus()
  }

  drawerEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement

    const tabBtn = target.closest<HTMLElement>('[data-collab-tab]')
    if (tabBtn?.dataset.collabTab) {
      activeTab = tabBtn.dataset.collabTab as CollaborationDrawerTab
      render()
      return
    }

    const actionBtn = target.closest<HTMLElement>('[data-collab-action]')
    const action = actionBtn?.dataset.collabAction
    if (!action || !actionBtn) return

    switch (action) {
      case 'close-drawer':
        close()
        break
      case 'send-chat':
        handleSendChat()
        break
      case 'copy-code': {
        if (!roomHandle) break
        void navigator.clipboard?.writeText(roomHandle.roomCode)
        const label = actionBtn.querySelector<HTMLElement>('[data-copy-label]')
        if (label) {
          label.textContent = '¡Copiado!'
          setTimeout(() => {
            label.textContent = 'Copiar código'
          }, 1800)
        }
        showToast({
          title: 'Código copiado al portapapeles',
          subtitle: `Código de sala: ${roomHandle.roomCode}`,
          type: 'success'
        })
        break
      }
      case 'toggle-role': {
        const userId = actionBtn.dataset.targetUser
        if (userId && roomHandle) {
          roomHandle.toggleMemberRole(userId)
          render()
        }
        break
      }
      case 'kick-member': {
        const userId = actionBtn.dataset.targetUser
        if (userId && roomHandle) {
          roomHandle.kickMember(userId)
          showToast({
            title: 'Colaborador expulsado',
            subtitle: 'El usuario ya no tiene acceso a la sesión en vivo.',
            type: 'info'
          })
          render()
        }
        break
      }
      case 'accept-join': {
        const reqId = actionBtn.dataset.reqId ?? ''
        const requesterId = actionBtn.dataset.requesterId ?? ''
        const requesterName = actionBtn.dataset.requesterName ?? 'Colaborador'
        if (roomHandle) {
          void roomHandle.approveRequest(reqId, requesterId, requesterName, 'editor').then(() => {
            showToast({
              title: 'Colaborador aceptado',
              subtitle: `${requesterName} se unió a la sala con permisos de Editor.`,
              type: 'success'
            })
            render()
          })
        }
        break
      }
      case 'reject-join': {
        const reqId = actionBtn.dataset.reqId ?? ''
        const requesterId = actionBtn.dataset.requesterId ?? ''
        const requesterName = actionBtn.dataset.requesterName ?? 'Colaborador'
        if (roomHandle) {
          void roomHandle.rejectRequest(reqId, requesterId, requesterName).then(() => {
            showToast({
              title: 'Solicitud rechazada',
              subtitle: `Se rechazó el acceso de ${requesterName}.`,
              type: 'info'
            })
            render()
          })
        }
        break
      }
      case 'simulate-request': {
        if (roomHandle) {
          roomHandle.simulateIncomingRequest()
          showToast({
            title: 'Nueva solicitud de acceso',
            subtitle: 'Un colaborador ha solicitado unirse con el código de sala.',
            type: 'info'
          })
          render()
        }
        break
      }
      case 'enable-server': {
        if (options.onEnableCollaboration) {
          void options.onEnableCollaboration().then((createdHandle) => {
            if (createdHandle) {
              roomHandle = createdHandle
              activeTab = 'manage'
              render()
            }
          })
        }
        break
      }
    }
  })

  function open(tab?: CollaborationDrawerTab): void {
    if (tab) activeTab = tab
    isVisible = true
    unreadCount = 0
    isPulsing = false
    drawerEl.classList.remove('is-hidden')
    render()
    emitBadgeState()
  }

  function close(): void {
    isVisible = false
    drawerEl.classList.add('is-hidden')
    emitBadgeState()
  }

  function toggle(): void {
    if (isVisible) close()
    else open()
  }

  return {
    open,
    close,
    toggle,
    isOpen: () => isVisible,
    setRoom(room: CollaborationRoomHandle | null, projectName?: string): void {
      roomHandle = room
      if (projectName) currentProjectName = projectName
      if (isVisible) render()
      emitBadgeState()
    },
    notifyIncomingChat(_msg: ChatMessage): void {
      if (!isVisible) {
        unreadCount += 1
        isPulsing = true
      } else if (activeTab === 'chat') {
        render()
      }
      emitBadgeState()
    },
    notifyIncomingActivity(_entry: ActivityLogEntry): void {
      if (!isVisible) {
        isPulsing = true
      } else if (activeTab === 'activity') {
        render()
      }
      emitBadgeState()
    },
    refresh(): void {
      if (isVisible) render()
      emitBadgeState()
    }
  }
}

