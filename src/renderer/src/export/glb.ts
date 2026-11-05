import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

import type { ExportContext } from './index'
import { toBase64 } from './base64'
import { resolveCleanScene } from './obj'

if (typeof (globalThis as { FileReader?: unknown }).FileReader === 'undefined') {
  ;(globalThis as Record<string, unknown>).FileReader = class FileReaderPolyfill {
    result: ArrayBuffer | null = null
    onloadend: (() => void) | null = null
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
    }
  }
}

if (typeof (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement === 'undefined') {
  ;(globalThis as Record<string, unknown>).HTMLCanvasElement = class HTMLCanvasElement {}
}
if (typeof (globalThis as { HTMLImageElement?: unknown }).HTMLImageElement === 'undefined') {
  ;(globalThis as Record<string, unknown>).HTMLImageElement = class HTMLImageElement {}
}

if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  const dummyObj = { addColorStop: () => {} }
  const mockCtx = new Proxy(
    {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      width: 256,
      height: 256,
      getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) }),
      createImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) }),
      createLinearGradient: () => dummyObj,
      createRadialGradient: () => dummyObj,
      createPattern: () => dummyObj
    },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string, unknown>)[prop as string]
        return () => {}
      }
    }
  )
  ;(globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const c = Object.create((globalThis as { HTMLCanvasElement: { prototype: object } }).HTMLCanvasElement.prototype)
        return Object.assign(c, {
          width: 256,
          height: 256,
          getContext: () => mockCtx,
          toDataURL: () =>
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          toBlob: (cb: (b: Blob) => void) => cb(new Blob([new Uint8Array(10)])),
          convertToBlob: async () => new Blob([new Uint8Array(10)])
        })
      }
      return {}
    }
  }
}

export async function exportGlb(
  scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const exportScene = resolveCleanScene(scene, context)
    exportScene.updateMatrixWorld(true)
    const exporter = new GLTFExporter()
    const data = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        exportScene,
        (result: unknown) => {
          if (result instanceof ArrayBuffer) {
            resolve(result)
          } else if (result && typeof result === 'object' && 'buffer' in (result as Record<string, unknown>)) {
            resolve((result as { buffer: ArrayBuffer }).buffer)
          } else {
            reject(new Error('GLTFExporter: formato inesperado'))
          }
        },
        (event: unknown) => {
          const err = (event as { error?: Error })?.error ?? (event instanceof Error ? event : new Error(String(event)))
          reject(err)
        },
        { binary: true }
      )
    })
    return toBase64(data)
  } catch (err) {
    if (error) error.message = `GLB: ${(err as Error).message}`
    return ''
  }
}
