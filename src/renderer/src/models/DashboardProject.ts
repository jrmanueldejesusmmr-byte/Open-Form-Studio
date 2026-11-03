/**
 * Proyecto tal como lo consume la pantalla inicial («Mis proyectos»).
 *
 * Es el modelo compartido por el Dashboard, el almacén de proyectos
 * (`services/ProjectStore.ts`) y el workspace 3D (que solo usa `name`,
 * `mode` y `designIndex` para montar la escena).
 */

export type ProjectMode = '2D' | '3D'
export type CreationMethod = 'blank' | 'scan'

export interface ScanImageData {
  id: string
  name: string
  previewUrl: string
  timestamp: number
  source: 'webcam' | 'phone_usb' | 'local_file'
}

export interface ScanData {
  method: 'photogrammetry'
  images: ScanImageData[]
  imageCount: number
  status: 'pending' | 'ready' | 'processing'
  processedAt?: number
}

export interface DashboardProject {
  id: string
  name: string
  mode: ProjectMode
  /** Índice del diseño de ejemplo que se carga en el lienzo (models/ProjectDesign). */
  designIndex: number
  /** Fecha de última modificación en milisegundos (epoch). */
  updatedAt: number
  /** id del usuario de Supabase dueño del proyecto; null en modo local. */
  ownerId: string | null
  /** De dónde salió el dato: almacén local del equipo o tabla `proyectos` de Supabase. */
  source: 'local' | 'cloud'
  /** Datos del escaneo 3D fotogramétrico si el proyecto fue generado por escaneo. */
  scanData?: ScanData | null
  /** Si el proyecto tiene servidor de colaboración en equipo habilitado. */
  collaborationEnabled?: boolean
  /** Código de sala único (formato ARQ-XXXX) para la colaboración en equipo. */
  roomCode?: string | null
  /** Rol del usuario actual en la sala de colaboración ('owner' | 'editor' | 'viewer'). */
  role?: 'owner' | 'editor' | 'viewer'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** «Hace 2 horas», «Ayer», «Hace 3 días»… como en las tarjetas de referencia. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)

  if (diff < MINUTE) return 'Hace un momento'
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE)
    return minutes === 1 ? 'Hace 1 minuto' : `Hace ${minutes} minutos`
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR)
    return hours === 1 ? 'Hace 1 hora' : `Hace ${hours} horas`
  }
  if (diff < 2 * DAY) return 'Ayer'
  if (diff < 7 * DAY) return `Hace ${Math.round(diff / DAY)} días`
  if (diff < 30 * DAY) {
    const weeks = Math.round(diff / (7 * DAY))
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`
  }
  if (diff < 365 * DAY) {
    const months = Math.round(diff / (30 * DAY))
    return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`
  }
  const years = Math.round(diff / (365 * DAY))
  return years === 1 ? 'Hace 1 año' : `Hace ${years} años`
}

/** Identificador local sin depender de APIs criptográficas del navegador. */
export function createLocalId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID()
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Fase 1: se eliminó `createSeedProjects()`. La app NUNCA crea proyectos de
// ejemplo: una cuenta nueva muestra el estado vacío «Aún no tienes proyectos».

