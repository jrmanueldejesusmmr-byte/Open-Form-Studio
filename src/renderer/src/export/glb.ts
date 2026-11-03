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
        (event: ErrorEvent) => {
          reject(event.error ?? new Error('GLTFExporter: error desconocido'))
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
