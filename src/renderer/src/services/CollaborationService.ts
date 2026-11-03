import { isSupabaseConfigured, supabase } from './supabaseClient'
import type { ProjectMode } from '../models/DashboardProject'

/**
 * Servicio y hook reactivo (`useCollaborationRoom`) para la colaboración en
 * tiempo real de ArqStudio 3D usando Supabase Realtime (`supabase.channel('room_${roomCode}')`).
 *
 * Incluye:
 *  - Generación de códigos únicos de sala (`ARQ-XXXX`).
 *  - Persistencia en Supabase (`rooms`, `room_members`) y respaldo local en
 *    `localStorage` + `BroadcastChannel` para que la sincronización en vivo
 *    funcione incluso en modo local o entre múltiples ventanas de Electron.
 *  - Manejo de presencia (`presenceState`) para detectar colaboradores en línea.
 *  - Transmisión por broadcast de mensajes de chat, registro de cambios en vivo
 *    (Activity Log), cambios de escena 3D y solicitudes de acceso.
 *  - Validación de permisos: los cambios sobre la escena 3D solo se sincronizan
 *    si el colaborador tiene rol `owner` o `editor` aprobado por el anfitrión.
 */

export type CollaboratorRole = 'owner' | 'editor' | 'viewer'
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'kicked'

export interface RoomRecord {
  id: string
  roomCode: string
  projectId: string
  projectName: string
  ownerId: string
  ownerName: string
  mode: ProjectMode
  createdAt: number
}

export interface RoomMember {
  id: string
  roomCode: string
  userId: string
  userName: string
  userEmail: string
  role: CollaboratorRole
  status: MemberStatus
  online: boolean
  joinedAt: number
}

export interface ChatMessage {
  id: string
  roomCode: string
  senderId: string
  senderName: string
  text: string
  timestamp: number
}

export interface ActivityLogEntry {
  id: string
  roomCode: string
  userId: string
  userName: string
  /** Ejemplo: "Manuel agregó un muro simple" */
  description: string
  /** Hora formateada HH:MM, ej. "16:20" */
  timeLabel: string
  timestamp: number
  actionType: 'wall_add' | 'wall_modify' | 'wall_remove' | 'object_add' | 'object_modify' | 'object_remove' | 'material' | 'system'
}

export interface JoinRequestItem {
  id: string
  roomCode: string
  projectId: string
  projectName: string
  requesterId: string
  requesterName: string
  requesterEmail: string
  ownerId: string
  status: 'pending' | 'approved' | 'rejected'
  timestamp: number
}

export interface AppNotification {
  id: string
  type: 'join_request' | 'request_approved' | 'request_rejected' | 'chat_message' | 'activity'
  title: string
  subtitle: string
  roomCode: string
  projectId?: string
  projectName?: string
  requesterId?: string
  requesterName?: string
  read: boolean
  timestamp: number
}

export interface SceneSyncPayload {
  roomCode: string
  senderId: string
  senderName: string
  kind: 'wall_added' | 'wall_changed' | 'wall_removed' | 'object_added' | 'object_changed' | 'object_removed'
  data: Record<string, unknown>
  activityText: string
  timestamp: number
}

const ROOMS_STORAGE_KEY = 'arqstudio.collab.rooms.v1'
const MEMBERS_STORAGE_KEY = 'arqstudio.collab.members.v1'
const CHAT_STORAGE_PREFIX = 'arqstudio.collab.chat.v1.'
const ACTIVITY_STORAGE_PREFIX = 'arqstudio.collab.activity.v1.'
const REQUESTS_STORAGE_KEY = 'arqstudio.collab.requests.v1'
const NOTIFICATIONS_STORAGE_KEY = 'arqstudio.collab.notifications.v1'

/** Genera un código de servidor único con formato `ARQ-XXXX`. */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `ARQ-${suffix}`
}

/** Formatea una marca de tiempo en `HH:MM` (ej. `16:20`). */
export function formatTimeHHMM(timestamp = Date.now()): string {
  const d = new Date(timestamp)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

/* ==========================================================================
   Repositorio de Salas, Solicitudes y Notificaciones (Supabase + Local)
   ========================================================================== */

export function listStoredRooms(): RoomRecord[] {
  return readStorage<RoomRecord[]>(ROOMS_STORAGE_KEY, [])
}

export function findRoomByProjectId(projectId: string): RoomRecord | null {
  const rooms = listStoredRooms()
  return rooms.find((r) => r.projectId === projectId) ?? null
}

export function findRoomByCode(roomCode: string): RoomRecord | null {
  const clean = roomCode.trim().toUpperCase()
  const rooms = listStoredRooms()
  return rooms.find((r) => r.roomCode.toUpperCase() === clean) ?? null
}

/**
 * Crea y registra una sala de colaboración en Supabase (`rooms` y `projects`)
 * y en el almacén local, asignando al creador el rol `owner`.
 */
export async function createCollaborationRoom(params: {
  roomCode?: string
  projectId: string
  projectName: string
  ownerId: string
  ownerName: string
  ownerEmail?: string
  mode: ProjectMode
}): Promise<RoomRecord> {
  const roomCode = (params.roomCode?.trim().toUpperCase() || generateRoomCode())
  const now = Date.now()

  const record: RoomRecord = {
    id: `room-${now}-${Math.random().toString(36).slice(2, 7)}`,
    roomCode,
    projectId: params.projectId,
    projectName: params.projectName,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    mode: params.mode,
    createdAt: now
  }

  // Guardar sala localmente
  const rooms = listStoredRooms().filter((r) => r.roomCode !== roomCode && r.projectId !== params.projectId)
  rooms.unshift(record)
  writeStorage(ROOMS_STORAGE_KEY, rooms)

  // Registrar al creador como `owner` aprobado en la lista de miembros
  const members = readStorage<RoomMember[]>(MEMBERS_STORAGE_KEY, []).filter(
    (m) => !(m.roomCode === roomCode && m.userId === params.ownerId)
  )
  members.push({
    id: `mem-${now}`,
    roomCode,
    userId: params.ownerId,
    userName: params.ownerName,
    userEmail: params.ownerEmail ?? '',
    role: 'owner',
    status: 'approved',
    online: true,
    joinedAt: now
  })
  writeStorage(MEMBERS_STORAGE_KEY, members)

  // Actividad inicial de creación del servidor
  appendActivityLog(roomCode, {
    id: `act-init-${now}`,
    roomCode,
    userId: params.ownerId,
    userName: params.ownerName,
    description: `${params.ownerName} inició el servidor colaborativo (${roomCode})`,
    timeLabel: formatTimeHHMM(now),
    timestamp: now,
    actionType: 'system'
  })

  // Persistir en Supabase (`rooms` y `room_members`) si está configurado
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('rooms').upsert(
        {
          room_code: roomCode,
          project_id: params.projectId,
          project_name: params.projectName,
          owner_id: params.ownerId,
          owner_name: params.ownerName,
          mode: params.mode,
          metadata: {
            collaborationEnabled: true,
            createdBy: params.ownerName,
            createdAtIso: new Date(now).toISOString()
          }
        },
        { onConflict: 'room_code' }
      )
      await supabase.from('room_members').upsert(
        {
          room_code: roomCode,
          user_id: params.ownerId,
          user_name: params.ownerName,
          user_email: params.ownerEmail ?? '',
          role: 'owner',
          status: 'approved'
        },
        { onConflict: 'room_code,user_id' }
      )
    } catch (err) {
      console.info('[ArqStudio Collab] Sala registrada en modo local (respaldo Supabase):', err)
    }
  }

  return record
}

export function getRoomMembers(roomCode: string): RoomMember[] {
  const clean = roomCode.trim().toUpperCase()
  return readStorage<RoomMember[]>(MEMBERS_STORAGE_KEY, []).filter((m) => m.roomCode.toUpperCase() === clean)
}

export function upsertRoomMember(member: RoomMember): RoomMember[] {
  const cleanCode = member.roomCode.trim().toUpperCase()
  const all = readStorage<RoomMember[]>(MEMBERS_STORAGE_KEY, [])
  const idx = all.findIndex((m) => m.roomCode.toUpperCase() === cleanCode && m.userId === member.userId)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...member, roomCode: cleanCode }
  } else {
    all.push({ ...member, roomCode: cleanCode })
  }
  writeStorage(MEMBERS_STORAGE_KEY, all)
  return all.filter((m) => m.roomCode.toUpperCase() === cleanCode)
}

export function getChatHistory(roomCode: string): ChatMessage[] {
  return readStorage<ChatMessage[]>(`${CHAT_STORAGE_PREFIX}${roomCode.toUpperCase()}`, [])
}

export function appendChatMessage(roomCode: string, msg: ChatMessage): ChatMessage[] {
  const key = `${CHAT_STORAGE_PREFIX}${roomCode.toUpperCase()}`
  const list = readStorage<ChatMessage[]>(key, [])
  if (!list.some((m) => m.id === msg.id)) {
    list.push(msg)
    writeStorage(key, list.slice(-200))
  }
  return list
}

export function getActivityLogs(roomCode: string): ActivityLogEntry[] {
  return readStorage<ActivityLogEntry[]>(`${ACTIVITY_STORAGE_PREFIX}${roomCode.toUpperCase()}`, [])
}

export function appendActivityLog(roomCode: string, entry: ActivityLogEntry): ActivityLogEntry[] {
  const key = `${ACTIVITY_STORAGE_PREFIX}${roomCode.toUpperCase()}`
  const list = readStorage<ActivityLogEntry[]>(key, [])
  if (!list.some((item) => item.id === entry.id)) {
    list.unshift(entry)
    writeStorage(key, list.slice(0, 200))
  }
  return list
}

/* ---------- Solicitudes de Unión y Bandeja de Notificaciones ---------- */

export function listJoinRequestsForOwner(ownerId: string): JoinRequestItem[] {
  const all = readStorage<JoinRequestItem[]>(REQUESTS_STORAGE_KEY, [])
  return all.filter((r) => r.ownerId === ownerId && r.status === 'pending')
}

export function listJoinRequestsForRoom(roomCode: string): JoinRequestItem[] {
  const clean = roomCode.trim().toUpperCase()
  const all = readStorage<JoinRequestItem[]>(REQUESTS_STORAGE_KEY, [])
  return all.filter((r) => r.roomCode.toUpperCase() === clean && r.status === 'pending')
}

export function listNotificationsForUser(userId: string): AppNotification[] {
  const all = readStorage<Array<AppNotification & { targetUserId?: string }>>(NOTIFICATIONS_STORAGE_KEY, [])
  return all
    .filter((n) => !n.targetUserId || n.targetUserId === userId)
    .sort((a, b) => b.timestamp - a.timestamp)
}

export function addNotificationForUser(
  targetUserId: string,
  notification: Omit<AppNotification, 'id' | 'read' | 'timestamp'>
): AppNotification {
  const all = readStorage<Array<AppNotification & { targetUserId?: string }>>(NOTIFICATIONS_STORAGE_KEY, [])
  const created: AppNotification & { targetUserId?: string } = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    read: false,
    timestamp: Date.now(),
    targetUserId
  }
  all.unshift(created)
  writeStorage(NOTIFICATIONS_STORAGE_KEY, all.slice(0, 100))
  return created
}

export function markAllNotificationsRead(userId: string): void {
  const all = readStorage<Array<AppNotification & { targetUserId?: string }>>(NOTIFICATIONS_STORAGE_KEY, [])
  for (const item of all) {
    if (!item.targetUserId || item.targetUserId === userId) {
      item.read = true
    }
  }
  writeStorage(NOTIFICATIONS_STORAGE_KEY, all)
}

/**
 * Envía una solicitud para unirse a una sala mediante código `ARQ-XXXX`.
 */
export async function requestToJoinRoom(params: {
  roomCode: string
  requesterId: string
  requesterName: string
  requesterEmail: string
}): Promise<{ ok: boolean; room?: RoomRecord; request?: JoinRequestItem; message: string }> {
  const cleanCode = params.roomCode.trim().toUpperCase()
  if (!/^ARQ-[A-Z0-9]{4,}$/i.test(cleanCode)) {
    return { ok: false, message: 'Formato de código inválido. Usa el formato ARQ-XXXX.' }
  }

  let room = findRoomByCode(cleanCode)

  // Intentar buscar en Supabase si no está en caché local
  if (!room && isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', cleanCode)
        .maybeSingle()
      if (data) {
        room = {
          id: String(data.id),
          roomCode: String(data.room_code),
          projectId: String(data.project_id),
          projectName: String(data.project_name || 'Proyecto Colaborativo'),
          ownerId: String(data.owner_id),
          ownerName: String(data.owner_name || 'Anfitrión'),
          mode: data.mode === '2D' ? '2D' : '3D',
          createdAt: new Date(data.created_at || Date.now()).getTime()
        }
        const rooms = listStoredRooms()
        rooms.unshift(room)
        writeStorage(ROOMS_STORAGE_KEY, rooms)
      }
    } catch {
      /* fallback local */
    }
  }

  // Si aún no existe la sala (ej. prueba de código externo), crear un registro de sala remoto para demostración
  if (!room) {
    room = {
      id: `room-ext-${Date.now()}`,
      roomCode: cleanCode,
      projectId: `collab-${cleanCode.toLowerCase()}`,
      projectName: `Sala Colaborativa ${cleanCode}`,
      ownerId: params.requesterId,
      ownerName: 'Anfitrión de Sala',
      mode: '3D',
      createdAt: Date.now()
    }
    const rooms = listStoredRooms()
    rooms.unshift(room)
    writeStorage(ROOMS_STORAGE_KEY, rooms)
  }

  const now = Date.now()
  const request: JoinRequestItem = {
    id: `req-${now}-${Math.random().toString(36).slice(2, 6)}`,
    roomCode: cleanCode,
    projectId: room.projectId,
    projectName: room.projectName,
    requesterId: params.requesterId,
    requesterName: params.requesterName,
    requesterEmail: params.requesterEmail,
    ownerId: room.ownerId,
    status: 'pending',
    timestamp: now
  }

  const requests = readStorage<JoinRequestItem[]>(REQUESTS_STORAGE_KEY, []).filter(
    (r) => !(r.roomCode === cleanCode && r.requesterId === params.requesterId && r.status === 'pending')
  )
  requests.unshift(request)
  writeStorage(REQUESTS_STORAGE_KEY, requests)

  // Registrar miembro en estado 'pending'
  upsertRoomMember({
    id: `mem-${now}`,
    roomCode: cleanCode,
    userId: params.requesterId,
    userName: params.requesterName,
    userEmail: params.requesterEmail,
    role: 'editor',
    status: 'pending',
    online: true,
    joinedAt: now
  })

  // Crear notificación para el anfitrión
  addNotificationForUser(room.ownerId, {
    type: 'join_request',
    title: `Solicitud de unión a ${cleanCode}`,
    subtitle: `${params.requesterName} solicita unirse a «${room.projectName}»`,
    roomCode: cleanCode,
    projectId: room.projectId,
    projectName: room.projectName,
    requesterId: params.requesterId,
    requesterName: params.requesterName
  })

  // Si Supabase está activo, insertar en `room_members` y emitir por el canal realtime
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('room_members').upsert(
        {
          room_code: cleanCode,
          user_id: params.requesterId,
          user_name: params.requesterName,
          user_email: params.requesterEmail,
          role: 'editor',
          status: 'pending'
        },
        { onConflict: 'room_code,user_id' }
      )
      const ch = supabase.channel(`room_${cleanCode}`)
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void ch.send({
            type: 'broadcast',
            event: 'join_request',
            payload: request
          })
        }
      })
    } catch {
      /* ignore */
    }
  }

  // Emitir también por BroadcastChannel local para sincronizar pestañas/ventanas al instante
  broadcastLocalEvent(cleanCode, 'join_request', request)

  return {
    ok: true,
    room,
    request,
    message: `Solicitud enviada a la sala ${cleanCode}. Esperando aprobación del anfitrión.`
  }
}

/**
 * Aprueba o rechaza una solicitud de acceso a la sala.
 */
export async function resolveJoinRequest(params: {
  requestId: string
  roomCode: string
  requesterId: string
  requesterName: string
  decision: 'approved' | 'rejected'
  role?: CollaboratorRole
}): Promise<void> {
  const cleanCode = params.roomCode.trim().toUpperCase()
  const requests = readStorage<JoinRequestItem[]>(REQUESTS_STORAGE_KEY, [])
  for (const r of requests) {
    if (r.id === params.requestId || (r.roomCode === cleanCode && r.requesterId === params.requesterId)) {
      r.status = params.decision
    }
  }
  writeStorage(REQUESTS_STORAGE_KEY, requests)

  // Marcar notificación asociada como leída
  const notifs = readStorage<Array<AppNotification & { targetUserId?: string }>>(NOTIFICATIONS_STORAGE_KEY, [])
  for (const n of notifs) {
    if (n.roomCode === cleanCode && n.requesterId === params.requesterId && n.type === 'join_request') {
      n.read = true
    }
  }
  writeStorage(NOTIFICATIONS_STORAGE_KEY, notifs)

  const assignedRole: CollaboratorRole = params.role ?? 'editor'
  upsertRoomMember({
    id: `mem-${params.requesterId}`,
    roomCode: cleanCode,
    userId: params.requesterId,
    userName: params.requesterName,
    userEmail: '',
    role: assignedRole,
    status: params.decision,
    online: params.decision === 'approved',
    joinedAt: Date.now()
  })

  if (params.decision === 'approved') {
    const now = Date.now()
    appendActivityLog(cleanCode, {
      id: `act-join-${now}`,
      roomCode: cleanCode,
      userId: params.requesterId,
      userName: params.requesterName,
      description: `${params.requesterName} se unió a la sala como ${assignedRole === 'editor' ? 'Editor' : 'Solo lectura'}`,
      timeLabel: formatTimeHHMM(now),
      timestamp: now,
      actionType: 'system'
    })
  }

  addNotificationForUser(params.requesterId, {
    type: params.decision === 'approved' ? 'request_approved' : 'request_rejected',
    title: params.decision === 'approved' ? `Acceso aprobado a ${cleanCode}` : `Solicitud rechazada en ${cleanCode}`,
    subtitle:
      params.decision === 'approved'
        ? `Ya puedes colaborar en la sala ${cleanCode}.`
        : `El anfitrión rechazó la solicitud para ${cleanCode}.`,
    roomCode: cleanCode
  })

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('room_members')
        .update({ status: params.decision, role: assignedRole })
        .eq('room_code', cleanCode)
        .eq('user_id', params.requesterId)
    } catch {
      /* ignore */
    }
  }

  broadcastLocalEvent(cleanCode, 'member_updated', {
    roomCode: cleanCode,
    userId: params.requesterId,
    userName: params.requesterName,
    status: params.decision,
    role: assignedRole
  })
}

/* ---------- BroadcastChannel entre ventanas locales ---------- */

type LocalPacket = {
  roomCode: string
  event: 'chat_message' | 'activity_log' | 'scene_sync' | 'join_request' | 'member_updated' | 'presence_ping'
  payload: unknown
}

const localListeners = new Map<string, Set<(packet: LocalPacket) => void>>()
let sharedBroadcastChannel: BroadcastChannel | null = null

function ensureBroadcastChannel(): BroadcastChannel | null {
  if (sharedBroadcastChannel) return sharedBroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    sharedBroadcastChannel = new BroadcastChannel('arqstudio_realtime_bus')
    sharedBroadcastChannel.onmessage = (ev: MessageEvent<LocalPacket>) => {
      const packet = ev.data
      if (!packet || !packet.roomCode) return
      const set = localListeners.get(packet.roomCode.toUpperCase())
      set?.forEach((cb) => cb(packet))
      const globalSet = localListeners.get('*')
      globalSet?.forEach((cb) => cb(packet))
    }
  }
  return sharedBroadcastChannel
}

export function subscribeGlobalCollaborationEvents(cb: (packet: LocalPacket) => void): () => void {
  ensureBroadcastChannel()
  let set = localListeners.get('*')
  if (!set) {
    set = new Set()
    localListeners.set('*', set)
  }
  set.add(cb)
  return () => {
    set?.delete(cb)
  }
}

function broadcastLocalEvent(
  roomCode: string,
  event: LocalPacket['event'],
  payload: unknown
): void {
  const clean = roomCode.toUpperCase()
  const packet: LocalPacket = { roomCode: clean, event, payload }
  ensureBroadcastChannel()?.postMessage(packet)
  // Notificar también a los listeners de la misma ventana
  localListeners.get(clean)?.forEach((cb) => cb(packet))
  localListeners.get('*')?.forEach((cb) => cb(packet))
}

/* ==========================================================================
   FASE 5: Hook / Servicio `useCollaborationRoom` (Supabase Realtime)
   ========================================================================== */

export interface UseCollaborationRoomOptions {
  roomCode: string
  projectId: string
  projectName: string
  currentUser: {
    id: string
    name: string
    email: string
  }
  initialRole?: CollaboratorRole
  onChatMessage?: (message: ChatMessage) => void
  onActivityLog?: (entry: ActivityLogEntry) => void
  onMembersChange?: (members: RoomMember[]) => void
  onJoinRequestsChange?: (requests: JoinRequestItem[]) => void
  onSceneSync?: (payload: SceneSyncPayload) => void
  onPermissionDenied?: (reason: string) => void
}

export interface CollaborationRoomHandle {
  readonly roomCode: string
  getMembers(): RoomMember[]
  getOnlineCount(): number
  getMessages(): ChatMessage[]
  getActivities(): ActivityLogEntry[]
  getJoinRequests(): JoinRequestItem[]
  getCurrentUserRole(): CollaboratorRole
  canCurrentUserEdit(): boolean
  /** Envía un mensaje en tiempo real al canal `supabase.channel('room_${roomCode}')`. */
  sendChatMessage(text: string): ChatMessage | null
  /** Registra y transmite una acción sobre la escena Three.js en el Activity Log. */
  recordSceneAction(
    description: string,
    actionType?: ActivityLogEntry['actionType'],
    syncPayload?: Omit<SceneSyncPayload, 'roomCode' | 'senderId' | 'senderName' | 'activityText' | 'timestamp'>
  ): ActivityLogEntry | null
  /** Aprueba a un colaborador que solicitó unirse con el código de sala. */
  approveRequest(requestId: string, requesterId: string, requesterName: string, role?: CollaboratorRole): Promise<void>
  /** Rechaza una solicitud pendiente. */
  rejectRequest(requestId: string, requesterId: string, requesterName: string): Promise<void>
  /** Alterna el rol de un colaborador entre `editor` y `viewer` (Solo lectura). */
  toggleMemberRole(userId: string): void
  /** Expulsa a un colaborador de la sala (solo anfitrión). */
  kickMember(userId: string): void
  /** Simula una solicitud entrante para facilitar pruebas del anfitrión si se requiere. */
  simulateIncomingRequest(guestName?: string): void
  /** Cierra la suscripción al canal Realtime. */
  disconnect(): void
}

export function useCollaborationRoom(options: UseCollaborationRoomOptions): CollaborationRoomHandle {
  const cleanCode = options.roomCode.trim().toUpperCase()
  let supabaseChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

  // Asegurar que el usuario actual figure en la lista de miembros de la sala
  const existingMembers = getRoomMembers(cleanCode)
  const existingSelf = existingMembers.find((m) => m.userId === options.currentUser.id)
  const roomRecord = findRoomByCode(cleanCode)
  const resolvedInitialRole: CollaboratorRole =
    existingSelf?.role ??
    (roomRecord && roomRecord.ownerId === options.currentUser.id ? 'owner' : options.initialRole ?? 'owner')

  upsertRoomMember({
    id: existingSelf?.id ?? `mem-${options.currentUser.id}`,
    roomCode: cleanCode,
    userId: options.currentUser.id,
    userName: options.currentUser.name,
    userEmail: options.currentUser.email,
    role: resolvedInitialRole,
    status: existingSelf?.status === 'kicked' ? 'kicked' : 'approved',
    online: true,
    joinedAt: existingSelf?.joinedAt ?? Date.now()
  })

  function getMembers(): RoomMember[] {
    return getRoomMembers(cleanCode).filter((m) => m.status === 'approved')
  }

  function getOnlineCount(): number {
    return getMembers().filter((m) => m.online).length
  }

  function getMessages(): ChatMessage[] {
    return getChatHistory(cleanCode)
  }

  function getActivities(): ActivityLogEntry[] {
    return getActivityLogs(cleanCode)
  }

  function getJoinRequests(): JoinRequestItem[] {
    return listJoinRequestsForRoom(cleanCode)
  }

  function getCurrentUserRole(): CollaboratorRole {
    const me = getRoomMembers(cleanCode).find((m) => m.userId === options.currentUser.id)
    return me?.role ?? resolvedInitialRole
  }

  /**
   * Valida que los cambios solo se sincronicen si el colaborador tiene permisos
   * aprobados por el anfitrión (`owner` o `editor` con estado `approved`).
   */
  function canCurrentUserEdit(): boolean {
    const me = getRoomMembers(cleanCode).find((m) => m.userId === options.currentUser.id)
    if (!me) return resolvedInitialRole === 'owner' || resolvedInitialRole === 'editor'
    if (me.status !== 'approved') return false
    return me.role === 'owner' || me.role === 'editor'
  }

  function notifyAllState(): void {
    options.onMembersChange?.(getMembers())
    options.onJoinRequestsChange?.(getJoinRequests())
  }

  // Suscripción al bus local (misma ventana y otras ventanas Electron)
  ensureBroadcastChannel()
  let roomSet = localListeners.get(cleanCode)
  if (!roomSet) {
    roomSet = new Set()
    localListeners.set(cleanCode, roomSet)
  }

  const onLocalPacket = (packet: LocalPacket): void => {
    if (packet.roomCode !== cleanCode) return
    switch (packet.event) {
      case 'chat_message': {
        const msg = packet.payload as ChatMessage
        appendChatMessage(cleanCode, msg)
        options.onChatMessage?.(msg)
        break
      }
      case 'activity_log': {
        const entry = packet.payload as ActivityLogEntry
        appendActivityLog(cleanCode, entry)
        options.onActivityLog?.(entry)
        break
      }
      case 'scene_sync': {
        const sync = packet.payload as SceneSyncPayload
        if (sync.senderId !== options.currentUser.id) {
          options.onSceneSync?.(sync)
        }
        break
      }
      case 'join_request':
      case 'member_updated':
      case 'presence_ping': {
        notifyAllState()
        break
      }
    }
  }
  roomSet.add(onLocalPacket)

  // Suscripción a Supabase Realtime: `supabase.channel('room_${roomCode}')`
  if (isSupabaseConfigured && supabase) {
    supabaseChannel = supabase.channel(`room_${cleanCode}`, {
      config: {
        presence: { key: options.currentUser.id },
        broadcast: { self: false }
      }
    })

    supabaseChannel
      .on('presence', { event: 'sync' }, () => {
        if (!supabaseChannel) return
        const presenceState = supabaseChannel.presenceState()
        const onlineIds = new Set<string>(Object.keys(presenceState))

        // Actualizar estado online de miembros según `presenceState`
        for (const [key, presences] of Object.entries(presenceState)) {
          const first = (presences as Array<Record<string, unknown>>)[0]
          if (first) {
            const existing = getRoomMembers(cleanCode).find((m) => m.userId === key)
            upsertRoomMember({
              id: existing?.id ?? `mem-${key}`,
              roomCode: cleanCode,
              userId: key,
              userName: String(first.userName ?? existing?.userName ?? 'Colaborador'),
              userEmail: String(first.userEmail ?? existing?.userEmail ?? ''),
              role: (existing?.role ?? (first.role as CollaboratorRole) ?? 'editor'),
              status: existing?.status ?? 'approved',
              online: true,
              joinedAt: existing?.joinedAt ?? Date.now()
            })
          }
        }

        const currentList = getRoomMembers(cleanCode)
        for (const m of currentList) {
          const isOnline = m.userId === options.currentUser.id || onlineIds.has(m.userId)
          if (m.online !== isOnline) {
            upsertRoomMember({ ...m, online: isOnline })
          }
        }

        options.onMembersChange?.(getMembers())
      })
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        const msg = payload as ChatMessage
        appendChatMessage(cleanCode, msg)
        options.onChatMessage?.(msg)
      })
      .on('broadcast', { event: 'activity_log' }, ({ payload }) => {
        const entry = payload as ActivityLogEntry
        appendActivityLog(cleanCode, entry)
        options.onActivityLog?.(entry)
      })
      .on('broadcast', { event: 'scene_sync' }, ({ payload }) => {
        const sync = payload as SceneSyncPayload
        // Validar que el emisor tenga permisos aprobados por el anfitrión
        const senderMember = getRoomMembers(cleanCode).find((m) => m.userId === sync.senderId)
        if (senderMember && (senderMember.status !== 'approved' || senderMember.role === 'viewer')) {
          return
        }
        if (sync.senderId !== options.currentUser.id) {
          options.onSceneSync?.(sync)
        }
      })
      .on('broadcast', { event: 'join_request' }, ({ payload }) => {
        const req = payload as JoinRequestItem
        const all = readStorage<JoinRequestItem[]>(REQUESTS_STORAGE_KEY, [])
        if (!all.some((r) => r.id === req.id)) {
          all.unshift(req)
          writeStorage(REQUESTS_STORAGE_KEY, all)
        }
        notifyAllState()
      })
      .on('broadcast', { event: 'member_updated' }, ({ payload }) => {
        const data = payload as {
          userId: string
          userName: string
          role: CollaboratorRole
          status: MemberStatus
        }
        const existing = getRoomMembers(cleanCode).find((m) => m.userId === data.userId)
        upsertRoomMember({
          id: existing?.id ?? `mem-${data.userId}`,
          roomCode: cleanCode,
          userId: data.userId,
          userName: data.userName || existing?.userName || 'Colaborador',
          userEmail: existing?.userEmail ?? '',
          role: data.role,
          status: data.status,
          online: data.status === 'approved',
          joinedAt: existing?.joinedAt ?? Date.now()
        })
        notifyAllState()
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && supabaseChannel) {
          await supabaseChannel.track({
            userId: options.currentUser.id,
            userName: options.currentUser.name,
            userEmail: options.currentUser.email,
            role: getCurrentUserRole(),
            onlineAt: new Date().toISOString()
          })
        }
      })
  }

  function sendChatMessage(text: string): ChatMessage | null {
    const cleanText = text.trim()
    if (!cleanText) return null

    const now = Date.now()
    const message: ChatMessage = {
      id: `msg-${now}-${Math.random().toString(36).slice(2, 7)}`,
      roomCode: cleanCode,
      senderId: options.currentUser.id,
      senderName: options.currentUser.name,
      text: cleanText,
      timestamp: now
    }

    appendChatMessage(cleanCode, message)
    broadcastLocalEvent(cleanCode, 'chat_message', message)

    if (supabaseChannel) {
      void supabaseChannel.send({
        type: 'broadcast',
        event: 'chat_message',
        payload: message
      })
    }

    if (isSupabaseConfigured && supabase) {
      void supabase
        .from('room_messages')
        .insert({
          room_code: cleanCode,
          sender_id: message.senderId,
          sender_name: message.senderName,
          text: message.text
        })
        .then(() => undefined, () => undefined)
    }

    return message
  }

  function recordSceneAction(
    description: string,
    actionType: ActivityLogEntry['actionType'] = 'wall_add',
    syncPayload?: Omit<SceneSyncPayload, 'roomCode' | 'senderId' | 'senderName' | 'activityText' | 'timestamp'>
  ): ActivityLogEntry | null {
    // Validar que los cambios solo se sincronicen si el colaborador tiene permisos aprobados
    if (!canCurrentUserEdit()) {
      options.onPermissionDenied?.(
        'No tienes permisos de edición aprobados por el anfitrión (modo Solo lectura).'
      )
      return null
    }

    const now = Date.now()
    const timeLabel = formatTimeHHMM(now)
    const entry: ActivityLogEntry = {
      id: `act-${now}-${Math.random().toString(36).slice(2, 7)}`,
      roomCode: cleanCode,
      userId: options.currentUser.id,
      userName: options.currentUser.name,
      description,
      timeLabel,
      timestamp: now,
      actionType
    }

    appendActivityLog(cleanCode, entry)
    broadcastLocalEvent(cleanCode, 'activity_log', entry)

    if (supabaseChannel) {
      void supabaseChannel.send({
        type: 'broadcast',
        event: 'activity_log',
        payload: entry
      })
    }

    if (syncPayload) {
      const fullSync: SceneSyncPayload = {
        ...syncPayload,
        roomCode: cleanCode,
        senderId: options.currentUser.id,
        senderName: options.currentUser.name,
        activityText: `${description} [${timeLabel}]`,
        timestamp: now
      }
      broadcastLocalEvent(cleanCode, 'scene_sync', fullSync)
      if (supabaseChannel) {
        void supabaseChannel.send({
          type: 'broadcast',
          event: 'scene_sync',
          payload: fullSync
        })
      }
    }

    return entry
  }

  async function approveRequest(
    requestId: string,
    requesterId: string,
    requesterName: string,
    role: CollaboratorRole = 'editor'
  ): Promise<void> {
    await resolveJoinRequest({
      requestId,
      roomCode: cleanCode,
      requesterId,
      requesterName,
      decision: 'approved',
      role
    })
    if (supabaseChannel) {
      void supabaseChannel.send({
        type: 'broadcast',
        event: 'member_updated',
        payload: {
          userId: requesterId,
          userName: requesterName,
          role,
          status: 'approved'
        }
      })
    }
    notifyAllState()
  }

  async function rejectRequest(
    requestId: string,
    requesterId: string,
    requesterName: string
  ): Promise<void> {
    await resolveJoinRequest({
      requestId,
      roomCode: cleanCode,
      requesterId,
      requesterName,
      decision: 'rejected'
    })
    if (supabaseChannel) {
      void supabaseChannel.send({
        type: 'broadcast',
        event: 'member_updated',
        payload: {
          userId: requesterId,
          userName: requesterName,
          role: 'viewer',
          status: 'rejected'
        }
      })
    }
    notifyAllState()
  }

  function toggleMemberRole(userId: string): void {
    if (getCurrentUserRole() !== 'owner') return
    const members = getRoomMembers(cleanCode)
    const target = members.find((m) => m.userId === userId)
    if (!target || target.role === 'owner') return

    const nextRole: CollaboratorRole = target.role === 'editor' ? 'viewer' : 'editor'
    upsertRoomMember({ ...target, role: nextRole })

    const now = Date.now()
    appendActivityLog(cleanCode, {
      id: `act-role-${now}`,
      roomCode: cleanCode,
      userId: options.currentUser.id,
      userName: options.currentUser.name,
      description: `${options.currentUser.name} cambió permisos de ${target.userName} a ${nextRole === 'editor' ? 'Editor' : 'Solo lectura'}`,
      timeLabel: formatTimeHHMM(now),
      timestamp: now,
      actionType: 'system'
    })

    broadcastLocalEvent(cleanCode, 'member_updated', {
      userId: target.userId,
      userName: target.userName,
      role: nextRole,
      status: target.status
    })

    if (supabaseChannel) {
      void supabaseChannel.send({
        type: 'broadcast',
        event: 'member_updated',
        payload: {
          userId: target.userId,
          userName: target.userName,
          role: nextRole,
          status: target.status
        }
      })
    }

    notifyAllState()
  }

  function kickMember(userId: string): void {
    if (getCurrentUserRole() !== 'owner') return
    const members = getRoomMembers(cleanCode)
    const target = members.find((m) => m.userId === userId)
    if (!target || target.role === 'owner') return

    upsertRoomMember({ ...target, status: 'kicked', online: false })

    const now = Date.now()
    appendActivityLog(cleanCode, {
      id: `act-kick-${now}`,
      roomCode: cleanCode,
      userId: options.currentUser.id,
      userName: options.currentUser.name,
      description: `${options.currentUser.name} expulsó a ${target.userName} de la sala`,
      timeLabel: formatTimeHHMM(now),
      timestamp: now,
      actionType: 'system'
    })

    broadcastLocalEvent(cleanCode, 'member_updated', {
      userId: target.userId,
      userName: target.userName,
      role: target.role,
      status: 'kicked'
    })

    if (supabaseChannel) {
      void supabaseChannel.send({
        type: 'broadcast',
        event: 'member_updated',
        payload: {
          userId: target.userId,
          userName: target.userName,
          role: target.role,
          status: 'kicked'
        }
      })
    }

    notifyAllState()
  }

  function simulateIncomingRequest(guestName = 'Arq. Sofía Méndez'): void {
    const guestId = `guest-${Date.now().toString(36)}`
    void requestToJoinRoom({
      roomCode: cleanCode,
      requesterId: guestId,
      requesterName: guestName,
      requesterEmail: 'sofia.mendez@estudio.arq'
    }).then(() => {
      notifyAllState()
    })
  }

  function disconnect(): void {
    roomSet?.delete(onLocalPacket)
    if (supabaseChannel && supabase) {
      void supabase.removeChannel(supabaseChannel)
      supabaseChannel = null
    }
  }

  return {
    roomCode: cleanCode,
    getMembers,
    getOnlineCount,
    getMessages,
    getActivities,
    getJoinRequests,
    getCurrentUserRole,
    canCurrentUserEdit,
    sendChatMessage,
    recordSceneAction,
    approveRequest,
    rejectRequest,
    toggleMemberRole,
    kickMember,
    simulateIncomingRequest,
    disconnect
  }
}

