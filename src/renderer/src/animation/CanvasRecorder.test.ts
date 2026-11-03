import { describe, expect, it, vi } from 'vitest'
import {
  arrayBufferToBase64,
  CanvasRecorder,
  detectSupportedVideoMimeType,
  formatDefaultRecordingFileName,
  formatRecordingDuration
} from './CanvasRecorder'

describe('CanvasRecorder utilities & controller', () => {
  it('formats elapsed recording duration as MM:SS', () => {
    expect(formatRecordingDuration(0)).toBe('00:00')
    expect(formatRecordingDuration(9.8)).toBe('00:09')
    expect(formatRecordingDuration(65)).toBe('01:05')
    expect(formatRecordingDuration(605)).toBe('10:05')
  })

  it('generates default WebM filename Recorrido_Animacion_DD_MM_AAAA.webm', () => {
    const sampleDate = new Date(2026, 9, 26) // 26 Oct 2026
    expect(formatDefaultRecordingFileName(sampleDate)).toBe('Recorrido_Animacion_26_10_2026.webm')
  })

  it('resolves preferred WebM MIME type in order (vp9 -> vp8 -> webm)', () => {
    expect(detectSupportedVideoMimeType((m) => m.includes('vp9'))).toBe('video/webm;codecs=vp9')
    expect(detectSupportedVideoMimeType((m) => m.includes('vp8'))).toBe('video/webm;codecs=vp8')
    expect(detectSupportedVideoMimeType(() => false)).toBe('video/webm')
  })

  it('encodes binary ArrayBuffer to Base64 accurately', () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]) // WebM EBML magic header
    const b64 = arrayBufferToBase64(bytes.buffer)
    expect(b64).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('handles unsupported canvas captureStream gracefully without throwing', () => {
    const errors: string[] = []
    const fakeCanvas = {} as HTMLCanvasElement
    const recorder = new CanvasRecorder(fakeCanvas, {
      onError: (msg) => errors.push(msg)
    })

    expect(recorder.isSupported()).toBe(false)
    const started = recorder.start()
    expect(started).toBe(false)
    expect(recorder.isRecording()).toBe(false)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('captureStream')
  })

  it('records and stops when captureStream and MediaRecorder are available', () => {
    const stateChanges: Array<{ isRecording: boolean; time: string }> = []
    const stopTrackSpy = vi.fn()
    const fakeStream = {
      getTracks: () => [{ stop: stopTrackSpy }]
    } as unknown as MediaStream

    const fakeCanvas = {
      captureStream: vi.fn(() => fakeStream)
    } as unknown as HTMLCanvasElement

    const prevMediaRecorder = globalThis.MediaRecorder
    class MockMediaRecorder {
      static isTypeSupported(mime: string): boolean {
        return mime === 'video/webm;codecs=vp9'
      }
      state: 'inactive' | 'recording' | 'paused' = 'inactive'
      mimeType = 'video/webm;codecs=vp9'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      onerror: (() => void) | null = null
      start(): void {
        this.state = 'recording'
      }
      requestData(): void {
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) })
      }
      stop(): void {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = MockMediaRecorder

    try {
      const recorder = new CanvasRecorder(fakeCanvas, {
        fps: 60,
        videoBitsPerSecond: 8_000_000,
        onStateChange: (isRecording, time) => stateChanges.push({ isRecording, time })
      })

      expect(recorder.isSupported()).toBe(true)
      expect(recorder.start({ syncedWithAnimation: true })).toBe(true)
      expect(recorder.isRecording()).toBe(true)
      expect(recorder.isSyncedWithAnimation()).toBe(true)
      expect(fakeCanvas.captureStream).toHaveBeenCalledWith(60)

      recorder.stop()
      expect(recorder.isRecording()).toBe(false)
      expect(stopTrackSpy).toHaveBeenCalled()
      expect(stateChanges[0]).toEqual({ isRecording: true, time: '00:00' })
      expect(stateChanges[stateChanges.length - 1]).toEqual({ isRecording: false, time: '00:00' })
    } finally {
      ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = prevMediaRecorder
    }
  })

  it('stores recorded video in memory and notifies onRecorded without auto-download', async () => {
    let recordedVideo: unknown = null
    const stopTrackSpy = vi.fn()
    const fakeStream = {
      getTracks: () => [{ stop: stopTrackSpy }]
    } as unknown as MediaStream

    const fakeCanvas = {
      captureStream: vi.fn(() => fakeStream)
    } as unknown as HTMLCanvasElement

    const prevMediaRecorder = globalThis.MediaRecorder
    const prevUrl = globalThis.URL

    class MockMediaRecorder {
      static isTypeSupported(): boolean {
        return true
      }
      state: 'inactive' | 'recording' | 'paused' = 'inactive'
      mimeType = 'video/webm;codecs=vp9'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      onerror: (() => void) | null = null
      start(): void {
        this.state = 'recording'
      }
      stop(): void {
        this.state = 'inactive'
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([10, 20, 30, 40])], { type: this.mimeType })
        })
        this.onstop?.()
      }
    }
    ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = MockMediaRecorder

    const revokeSpy = vi.fn()
    const createObjectURLSpy = vi.fn(() => 'blob:arqstudio/test-recorded-preview')
    ;(globalThis as unknown as { URL: unknown }).URL = {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeSpy
    }

    try {
      const recorder = new CanvasRecorder(fakeCanvas, {
        autoDownload: false,
        onRecorded: (video) => {
          recordedVideo = video
        }
      })

      recorder.start()
      recorder.stop()

      // Esperar microtareas de onstop
      await new Promise((r) => setTimeout(r, 10))

      expect(recordedVideo).not.toBeNull()
      const v = recorder.getLastRecordedVideo()
      expect(v).not.toBeNull()
      expect(v?.objectUrl).toBe('blob:arqstudio/test-recorded-preview')
      expect(v?.byteLength).toBe(4)
      expect(createObjectURLSpy).toHaveBeenCalled()

      // Al limpiar, debe revocar la URL de objeto
      recorder.clearRecordedVideo()
      expect(revokeSpy).toHaveBeenCalledWith('blob:arqstudio/test-recorded-preview')
      expect(recorder.getLastRecordedVideo()).toBeNull()
    } finally {
      ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = prevMediaRecorder
      ;(globalThis as unknown as { URL: unknown }).URL = prevUrl
    }
  })
})

