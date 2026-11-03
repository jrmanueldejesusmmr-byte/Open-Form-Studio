import { showToast } from '../ui/Toast'

/**
 * Orden de prioridad de codecs WebM para grabación de alta nitidez arquitectónica.
 */
export const PREFERRED_WEBM_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm; codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm; codecs=vp8',
  'video/webm'
] as const

/** Bitrate por defecto: 8 Mbps para nitidez arquitectónica en líneas CAD y sombras. */
export const DEFAULT_VIDEO_BITS_PER_SECOND = 8_000_000

export interface CanvasRecorderExportResult {
  saved: boolean
  canceled?: boolean
  filePath?: string
  fileName: string
  mimeType: string
  durationSeconds: number
  byteLength: number
  blob?: Blob
  objectUrl?: string
}

/**
 * Estructura de video capturado en memoria listo para previsualización inmediata.
 */
export interface CanvasRecordedVideo {
  blob: Blob
  objectUrl: string
  fileName: string
  mimeType: string
  durationSeconds: number
  byteLength: number
  createdAt: Date
}

export interface CanvasRecorderOptions {
  /** Fotogramas por segundo de captura (por defecto 60 FPS, fallback a 30 FPS). */
  fps?: number
  /** Tasa de bits de video en bps (por defecto 8_000_000 = 8 Mbps). */
  videoBitsPerSecond?: number
  /** Si es true, descarga automáticamente al terminar la grabación (por defecto false para dar paso al modal de previsualización). */
  autoDownload?: boolean
  /** Se invoca en cada actualización del cronómetro (formato MM:SS). */
  onTick?: (formattedTime: string, elapsedSeconds: number) => void
  /** Se invoca cuando cambia el estado de grabación (activo / inactivo). */
  onStateChange?: (isRecording: boolean, formattedTime: string) => void
  /** Callback ejecutado en cada frame (requestAnimationFrame) mientras graba para garantizar render continuo. */
  onFrameRequest?: () => void
  /** Se invoca cuando el video ha terminado de grabarse y está disponible en memoria como Blob / objectUrl para previsualización. */
  onRecorded?: (video: CanvasRecordedVideo) => void
  /** Se invoca cuando el video termina de ensamblarse y exportarse. */
  onExported?: (result: CanvasRecorderExportResult) => void
  /** Se invoca ante cualquier error de soporte o grabación sin bloquear la UI. */
  onError?: (message: string) => void
}

/**
 * Formatea segundos transcurridos como cronómetro `MM:SS` (ej. `00:00`, `01:25`).
 */
export function formatRecordingDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Genera el nombre de archivo por defecto `Recorrido_Animacion_DD_MM_AAAA.webm`.
 */
export function formatDefaultRecordingFileName(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `Recorrido_Animacion_${dd}_${mm}_${yyyy}.webm`
}

/**
 * Detecta el primer MIME type compatible con `MediaRecorder` según el orden de preferencia:
 * 1) `video/webm;codecs=vp9`
 * 2) `video/webm;codecs=vp8`
 * 3) `video/webm`
 */
export function detectSupportedVideoMimeType(
  isTypeSupported?: (mimeType: string) => boolean
): string {
  const checker =
    isTypeSupported ??
    (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? (mime: string) => MediaRecorder.isTypeSupported(mime)
      : undefined)

  if (!checker) return 'video/webm'

  for (const candidate of PREFERRED_WEBM_MIME_TYPES) {
    try {
      if (checker(candidate)) {
        return candidate
      }
    } catch {
      /* continúa probando el siguiente codec */
    }
  }
  return 'video/webm'
}

/**
 * Convierte un `ArrayBuffer` a cadena Base64 para enviarlo por IPC a Electron (`app:save-file`).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

interface ElectronAppBridge {
  saveDialog?: (options: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ canceled?: boolean; filePath?: string }>
  saveFile?: (payload: {
    filePath: string
    data: string
    encoding?: 'utf8' | 'base64'
  }) => Promise<{ ok?: boolean; message?: string }>
}

function getElectronAppBridge(): ElectronAppBridge | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { arqStudio?: { app?: ElectronAppBridge } }
  return w.arqStudio?.app ?? null
}

/**
 * Controlador modular de grabación de video en tiempo real desde el `<canvas>` WebGL de Three.js.
 * Utiliza `canvas.captureStream(fps)` y `MediaRecorder` sin bloquear el hilo principal.
 */
export class CanvasRecorder {
  private readonly canvas: HTMLCanvasElement
  private readonly options: CanvasRecorderOptions
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: BlobPart[] = []
  private startTimeMs = 0
  private timerIntervalId: ReturnType<typeof setInterval> | null = null
  private rafKeepAliveId: number | null = null
  private activeMimeType = 'video/webm'
  private recording = false
  /** Indica si la grabación se inició sincronizada con la reproducción de la línea de tiempo. */
  private syncedWithAnimation = false
  /** Último video capturado en memoria listo para previsualización o exportación. */
  private lastRecordedVideo: CanvasRecordedVideo | null = null

  constructor(canvas: HTMLCanvasElement, options: CanvasRecorderOptions = {}) {
    this.canvas = canvas
    this.options = options
  }

  /** Devuelve `true` si actualmente está grabando el lienzo 3D. */
  isRecording(): boolean {
    return this.recording
  }

  /** Devuelve `true` si la grabación actual fue iniciada junto con la animación programada. */
  isSyncedWithAnimation(): boolean {
    return this.syncedWithAnimation
  }

  /** Devuelve el último clip de video grabado en memoria (si existe). */
  getLastRecordedVideo(): CanvasRecordedVideo | null {
    return this.lastRecordedVideo
  }

  /**
   * Libera la URL de objeto del video grabado en memoria para evitar fugas de memoria.
   */
  clearRecordedVideo(): void {
    if (this.lastRecordedVideo?.objectUrl) {
      try {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(this.lastRecordedVideo.objectUrl)
        }
      } catch {
        /* ignore */
      }
    }
    this.lastRecordedVideo = null
  }

  /** Segundos transcurridos desde que comenzó la grabación actual. */
  getElapsedSeconds(): number {
    if (!this.recording || this.startTimeMs <= 0) return 0
    return Math.max(0, (Date.now() - this.startTimeMs) / 1000)
  }

  /** Verifica si el entorno soporta `canvas.captureStream` y `MediaRecorder`. */
  isSupported(): boolean {
    const hasCaptureStream =
      Boolean(this.canvas) &&
      typeof (this.canvas as HTMLCanvasElement & { captureStream?: unknown }).captureStream === 'function'
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined'
    return hasCaptureStream && hasMediaRecorder
  }

  /**
   * Inicia la captura del canvas a 60 FPS (con fallback a 30 FPS) y arranca `MediaRecorder`.
   */
  start(options?: { syncedWithAnimation?: boolean }): boolean {
    if (this.recording) return true

    if (!this.isSupported()) {
      const msg = 'Tu navegador o lienzo WebGL no soporta captura de video en tiempo real (captureStream / MediaRecorder).'
      this.emitError(msg)
      return false
    }

    const targetFps = this.options.fps ?? 60
    let capturedStream: MediaStream | null = null
    try {
      capturedStream = this.canvas.captureStream(targetFps)
    } catch {
      try {
        capturedStream = this.canvas.captureStream(30)
      } catch (err) {
        this.emitError(`No se pudo iniciar captureStream en el visor 3D: ${(err as Error)?.message ?? String(err)}`)
        return false
      }
    }

    if (!capturedStream) {
      this.emitError('El lienzo 3D no devolvió un MediaStream válido.')
      return false
    }

    const mimeType = detectSupportedVideoMimeType()
    const videoBitsPerSecond = this.options.videoBitsPerSecond ?? DEFAULT_VIDEO_BITS_PER_SECOND

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(capturedStream, {
        mimeType,
        videoBitsPerSecond
      })
    } catch {
      try {
        recorder = new MediaRecorder(capturedStream)
      } catch (err) {
        this.stopTracks(capturedStream)
        this.emitError(`Error al inicializar MediaRecorder: ${(err as Error)?.message ?? String(err)}`)
        return false
      }
    }

    this.stream = capturedStream
    this.mediaRecorder = recorder
    this.activeMimeType = recorder.mimeType || mimeType || 'video/webm'
    this.chunks = []
    this.recording = true
    this.syncedWithAnimation = Boolean(options?.syncedWithAnimation)
    this.startTimeMs = Date.now()

    recorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data)
      }
    }

    recorder.onerror = (): void => {
      this.cleanupRecordingState()
      this.emitError('Se produjo un error durante la grabación de video del recorrido 3D.')
    }

    recorder.onstop = (): void => {
      const durationSeconds = Math.max(0.1, (Date.now() - this.startTimeMs) / 1000)
      const collectedChunks = [...this.chunks]
      const finalMime = this.activeMimeType || 'video/webm'
      this.cleanupRecordingState()
      void this.finalizeAndExport(collectedChunks, finalMime, durationSeconds)
    }

    try {
      // Recopila fragmentos cada 200 ms para no perder fotogramas finales
      recorder.start(200)
    } catch (err) {
      this.cleanupRecordingState()
      this.emitError(`No se pudo iniciar la grabación: ${(err as Error)?.message ?? String(err)}`)
      return false
    }

    this.options.onStateChange?.(true, '00:00')
    this.options.onTick?.('00:00', 0)

    this.timerIntervalId = setInterval(() => {
      if (!this.recording) return
      const elapsed = this.getElapsedSeconds()
      const formatted = formatRecordingDuration(elapsed)
      this.options.onTick?.(formatted, elapsed)
    }, 250)

    this.startKeepAliveLoop()
    return true
  }

  /**
   * Detiene la grabación activa; `onstop` ensamblará el Blob y disparará la exportación.
   */
  stop(): void {
    if (!this.recording || !this.mediaRecorder) return
    try {
      if (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.requestData?.()
        this.mediaRecorder.stop()
      } else {
        this.cleanupRecordingState()
      }
    } catch (err) {
      this.cleanupRecordingState()
      this.emitError(`Error al detener la grabación: ${(err as Error)?.message ?? String(err)}`)
    }
  }

  /** Alterna entre iniciar y detener la grabación. */
  toggle(options?: { syncedWithAnimation?: boolean }): boolean {
    if (this.recording) {
      this.stop()
      return false
    }
    return this.start(options)
  }

  private startKeepAliveLoop(): void {
    const tick = (): void => {
      if (!this.recording) return
      this.options.onFrameRequest?.()
      if (typeof requestAnimationFrame === 'function') {
        this.rafKeepAliveId = requestAnimationFrame(tick)
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      this.rafKeepAliveId = requestAnimationFrame(tick)
    }
  }

  private stopTracks(stream: MediaStream | null): void {
    if (!stream) return
    try {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    } catch {
      /* ignore */
    }
  }

  private cleanupRecordingState(): void {
    this.recording = false
    this.syncedWithAnimation = false
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId)
      this.timerIntervalId = null
    }
    if (this.rafKeepAliveId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafKeepAliveId)
      this.rafKeepAliveId = null
    }
    this.stopTracks(this.stream)
    this.stream = null
    this.mediaRecorder = null
    this.options.onStateChange?.(false, '00:00')
  }

  private async finalizeAndExport(
    chunks: BlobPart[],
    mimeType: string,
    durationSeconds: number
  ): Promise<void> {
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
    if (blob.size === 0) {
      this.emitError('La grabación finalizó sin datos de video capturados.')
      return
    }

    // Limpia grabación previa si existía en memoria
    this.clearRecordedVideo()

    let objectUrl = ''
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        objectUrl = URL.createObjectURL(blob)
      }
    } catch {
      /* ignore */
    }

    const defaultFileName = formatDefaultRecordingFileName(new Date())
    const recordedVideo: CanvasRecordedVideo = {
      blob,
      objectUrl,
      fileName: defaultFileName,
      mimeType: mimeType || 'video/webm',
      durationSeconds,
      byteLength: blob.size,
      createdAt: new Date()
    }
    this.lastRecordedVideo = recordedVideo

    // Notifica que el video está listo en memoria para previsualización
    this.options.onRecorded?.(recordedVideo)

    // Solo si el usuario configuró autoDownload se fuerza la descarga inmediata
    if (this.options.autoDownload) {
      await this.exportRecording(recordedVideo)
    }
  }

  /**
   * Guarda físicamente el video en disco mediante el diálogo nativo de Electron o descarga del navegador.
   */
  async exportRecording(videoToExport?: CanvasRecordedVideo): Promise<CanvasRecorderExportResult> {
    const video = videoToExport ?? this.lastRecordedVideo
    if (!video || !video.blob || video.blob.size === 0) {
      this.emitError('No hay ninguna grabación disponible en memoria para guardar.')
      return {
        saved: false,
        fileName: '',
        mimeType: '',
        durationSeconds: 0,
        byteLength: 0
      }
    }

    const defaultFileName = video.fileName || formatDefaultRecordingFileName(new Date())
    const appBridge = getElectronAppBridge()

    try {
      if (appBridge?.saveDialog && appBridge?.saveFile) {
        const dialogRes = await appBridge.saveDialog({
          title: 'Guardar grabación de recorrido 3D',
          defaultPath: defaultFileName,
          filters: [{ name: 'Video WebM (*.webm)', extensions: ['webm'] }]
        })

        if (dialogRes.canceled || !dialogRes.filePath) {
          const canceledResult: CanvasRecorderExportResult = {
            saved: false,
            canceled: true,
            fileName: defaultFileName,
            mimeType: video.mimeType,
            durationSeconds: video.durationSeconds,
            byteLength: video.byteLength,
            blob: video.blob,
            objectUrl: video.objectUrl
          }
          this.options.onExported?.(canceledResult)
          return canceledResult
        }

        const targetPath = dialogRes.filePath.toLowerCase().endsWith('.webm')
          ? dialogRes.filePath
          : `${dialogRes.filePath}.webm`

        const arrayBuffer = await video.blob.arrayBuffer()
        const base64Data = arrayBufferToBase64(arrayBuffer)
        const writeRes = await appBridge.saveFile({
          filePath: targetPath,
          data: base64Data,
          encoding: 'base64'
        })

        if (!writeRes?.ok) {
          this.emitError(writeRes?.message ?? 'No se pudo escribir el archivo de video en disco.')
          return {
            saved: false,
            fileName: defaultFileName,
            mimeType: video.mimeType,
            durationSeconds: video.durationSeconds,
            byteLength: video.byteLength,
            blob: video.blob,
            objectUrl: video.objectUrl
          }
        }

        const savedResult: CanvasRecorderExportResult = {
          saved: true,
          filePath: targetPath,
          fileName: targetPath.split(/[\\/]/).pop() ?? defaultFileName,
          mimeType: video.mimeType,
          durationSeconds: video.durationSeconds,
          byteLength: video.byteLength,
          blob: video.blob,
          objectUrl: video.objectUrl
        }

        showToast({
          title: 'Video exportado con éxito',
          subtitle: `${savedResult.fileName} · ${formatRecordingDuration(video.durationSeconds)}`,
          type: 'success'
        })

        this.options.onExported?.(savedResult)
        return savedResult
      }

      // Fallback de descarga directa en navegador si no está el puente nativo de Electron
      const url = video.objectUrl || URL.createObjectURL(video.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = defaultFileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)

      const browserResult: CanvasRecorderExportResult = {
        saved: true,
        fileName: defaultFileName,
        mimeType: video.mimeType,
        durationSeconds: video.durationSeconds,
        byteLength: video.byteLength,
        blob: video.blob,
        objectUrl: url
      }

      showToast({
        title: 'Video exportado con éxito',
        subtitle: `${defaultFileName} · ${formatRecordingDuration(video.durationSeconds)}`,
        type: 'success'
      })

      this.options.onExported?.(browserResult)
      return browserResult
    } catch (err) {
      this.emitError(`No se pudo exportar el video grabado: ${(err as Error)?.message ?? String(err)}`)
      return {
        saved: false,
        fileName: defaultFileName,
        mimeType: video.mimeType,
        durationSeconds: video.durationSeconds,
        byteLength: video.byteLength,
        blob: video.blob,
        objectUrl: video.objectUrl
      }
    }
  }

  private emitError(message: string): void {
    showToast({
      title: 'Error de grabación',
      subtitle: message,
      type: 'error'
    })
    this.options.onError?.(message)
  }
}

/**
 * Factory / Hook funcional (`useCanvasRecorder`) para instanciar el grabador de canvas 3D.
 */
export function useCanvasRecorder(
  canvas: HTMLCanvasElement,
  options: CanvasRecorderOptions = {}
): CanvasRecorder {
  return new CanvasRecorder(canvas, options)
}
