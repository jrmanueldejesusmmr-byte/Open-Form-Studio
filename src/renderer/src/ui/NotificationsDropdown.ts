import { icon } from './icons'
import { formatRelativeTime } from '../models/DashboardProject'
import type { AppNotification, JoinRequestItem } from '../services/CollaborationService'

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

export interface NotificationsDropdownProps {
  user: { id: string; name?: string; email?: string } | null
  pendingRequests: JoinRequestItem[]
  notifications: AppNotification[]
}

/**
 * Renderiza el contenido interno del menú desplegable de Mensajes, Solicitudes
 * y Conexión a Servidor Colaborativo en el Dashboard de ArqStudio 3D.
 */
export function renderNotificationsDropdown(props: NotificationsDropdownProps): string {
  const { user, pendingRequests, notifications } = props

  if (!user) {
    return `
      <div class="dash-inbox-dropdown-inner p-6 flex flex-col items-center justify-center text-center">
        <div class="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 mb-3">
          ${icon('lock', 22)}
        </div>
        <h4 class="text-sm font-semibold text-slate-200 mb-1">Acceso restringido</h4>
        <p class="text-xs text-slate-400 leading-relaxed max-w-[240px]">
          Inicia sesión para gestionar mensajes, unirte a salas y colaborar en tiempo real.
        </p>
      </div>
    `
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const totalItems = pendingRequests.length + notifications.length

  return `
    <div class="dash-inbox-dropdown-inner flex flex-col gap-3.5 text-slate-100">
      
      <!-- Cabecera del Dropdown -->
      <div class="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center">
            ${icon('radio', 14)}
          </div>
          <span class="text-xs font-semibold text-slate-200">Mensajes y Conexión</span>
        </div>
        ${
          unreadCount > 0
            ? `<button class="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition cursor-pointer" type="button" data-dash-action="mark-notifications-read">Marcar leídos</button>`
            : `<span class="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">● En línea</span>`
        }
      </div>

      <!-- Tarjeta Superior: Unirse a un Servidor Colaborativo -->
      <div class="dash-inbox__join-card bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 flex flex-col gap-2.5 shadow-sm">
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-slate-200 flex items-center gap-1.5" for="join-room-input">
            <span class="text-blue-400">${icon('radio', 13)}</span>
            <span>Unirse mediante código</span>
          </label>
          <span class="text-[10px] text-slate-400 font-mono tracking-wider">ARQ-XXXX</span>
        </div>

        <div class="space-y-2">
          <input
            id="join-room-input"
            type="text"
            class="dash-inbox__join-input w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-center text-sm font-mono tracking-widest uppercase text-white placeholder:text-slate-500 placeholder:normal-case placeholder:tracking-normal outline-none transition"
            placeholder="EJ: ARQ-7842"
            maxlength="12"
            data-join-room-input
          />
          <button
            type="button"
            class="dash-inbox__join-btn w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            data-dash-action="join-room-submit"
          >
            <span>Solicitar Entrada / Unirse</span>
          </button>
        </div>
      </div>

      <!-- Separador visual sutil -->
      <div class="border-t border-slate-800/80 my-0.5"></div>

      <!-- Sección Inferior: Notificaciones y Solicitudes -->
      <div class="dash-inbox__section flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-300">Bandeja de avisos</span>
          ${
            pendingRequests.length > 0
              ? `<span class="px-1.5 py-0.2 bg-blue-500 text-white text-[10px] font-bold rounded-full">${pendingRequests.length}</span>`
              : ''
          }
        </div>

        <!-- Si no hay avisos ni solicitudes -->
        ${
          totalItems === 0
            ? `
            <div class="dash-inbox__empty flex flex-col items-center justify-center text-center p-5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-slate-400">
              <div class="w-10 h-10 rounded-full bg-slate-800/60 text-slate-500 flex items-center justify-center mb-2">
                ${icon('bellOff', 20)}
              </div>
              <span class="text-xs font-medium text-slate-300">Sin avisos nuevos</span>
              <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">No tienes solicitudes ni mensajes pendientes</p>
            </div>
          `
            : ''
        }

        <!-- Solicitudes de unión pendientes -->
        ${
          pendingRequests.length > 0
            ? `
            <div class="space-y-2 mb-1">
              ${pendingRequests
                .map(
                  (req) => `
                <div class="dash-inbox__req-card p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col gap-2 text-xs" data-req-id="${escapeHtml(req.id)}">
                  <div class="flex items-center gap-2.5">
                    <span class="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold flex items-center justify-center text-xs shrink-0">
                      ${escapeHtml(req.requesterName.charAt(0).toUpperCase())}
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="font-semibold text-slate-100 truncate">${escapeHtml(req.requesterName)}</div>
                      <div class="text-[11px] text-slate-400 truncate">Sala <strong class="text-blue-400 font-mono">${escapeHtml(req.roomCode)}</strong> · ${escapeHtml(req.projectName)}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 pt-1.5 border-t border-slate-700/40 justify-end">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium transition cursor-pointer"
                      data-dash-action="accept-request"
                      data-req-id="${escapeHtml(req.id)}"
                      data-room-code="${escapeHtml(req.roomCode)}"
                      data-requester-id="${escapeHtml(req.requesterId)}"
                      data-requester-name="${escapeHtml(req.requesterName)}"
                    >
                      ${icon('check', 12)} Aceptar
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-[11px] font-medium transition cursor-pointer"
                      data-dash-action="reject-request"
                      data-req-id="${escapeHtml(req.id)}"
                      data-room-code="${escapeHtml(req.roomCode)}"
                      data-requester-id="${escapeHtml(req.requesterId)}"
                      data-requester-name="${escapeHtml(req.requesterName)}"
                    >
                      ${icon('close', 12)} Rechazar
                    </button>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
            : ''
        }

        <!-- Notificaciones recientes -->
        ${
          notifications.length > 0
            ? `
            <div class="dash-inbox__notif-list space-y-1.5 max-h-44 overflow-y-auto pr-1">
              ${notifications
                .map(
                  (n) => `
                <div class="p-2 rounded-lg ${n.read ? 'bg-slate-900/40 text-slate-400' : 'bg-slate-800/50 text-slate-200 border-l-2 border-blue-500'} flex items-start gap-2 text-xs transition">
                  <span class="w-1.5 h-1.5 rounded-full ${n.read ? 'bg-slate-600' : 'bg-blue-400 animate-pulse'} mt-1.5 shrink-0"></span>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-slate-200 truncate">${escapeHtml(n.title)}</div>
                    <div class="text-[11px] text-slate-400 line-clamp-1">${escapeHtml(n.subtitle)}</div>
                  </div>
                  <span class="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">${formatRelativeTime(n.timestamp)}</span>
                </div>
              `
                )
                .join('')}
            </div>
          `
            : ''
        }

      </div>
    </div>
  `
}

