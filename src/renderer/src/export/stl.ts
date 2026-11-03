import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

import type { ExportContext } from './index'
import { toBase64 } from './base64'
import { resolveCleanScene } from './obj'

export async function exportStl(
  scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const exportScene = resolveCleanScene(scene, context)
    exportScene.updateMatrixWorld(true)
    exportScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (mesh.geometry && !mesh.geometry.getAttribute('normal')) {
          mesh.geometry.computeVertexNormals()
        }
      }
    })
    const exporter = new STLExporter()
    const data = exporter.parse(exportScene, { binary: true })
    const bytes =
      data instanceof Uint8Array
        ? data
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    return toBase64(bytes)
  } catch (err) {
    if (error) error.message = `STL: ${(err as Error).message}`
    return ''
  }
}
