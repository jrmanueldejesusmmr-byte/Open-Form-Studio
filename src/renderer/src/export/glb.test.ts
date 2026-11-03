/**
 * Pruebas unitarias de la exportación GLB.
 *
 * - Verifica que un muro de 5 m se exporta y se mide correctamente tras
 *   redondear el GLB con GLTFLoader (tolerancia 0.001 m).
 *
 * Ejecución: `npx vitest run src/renderer/src/export/glb.test.ts`
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'
import { buildExportScene } from './index'
import { exportGlb } from './glb'

/**
 * `GLTFExporter` usa `FileReader` (sólo existe en navegador). En Node (vitest)
 * se instala un polyfill mínimo basado en `Blob.arrayBuffer()`, disponible en
 * Node ≥ 18.
 */
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function loadArrayBuffer(buffer: ArrayBuffer): Promise<THREE.Scene> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.parse(buffer, '', (gltf: unknown) => {
      const scene = (gltf as { scene?: THREE.Scene | null }).scene ?? new THREE.Scene()
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.updateMatrix()
        }
      })
      resolve(scene)
    }, (event: ErrorEvent) => {
      reject(event.error ?? new Error('Error parseando GLB'))
    })
  })
}

describe('exportación GLB', () => {
  it('mide correctamente un muro de 5 m redondeado', async () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0))
    const exported = await exportGlb(
      new THREE.Scene(),
      { walls: scene.getWalls(), objects: [], levels: [] }
    )
    if (!exported) throw new Error('exportGlb falló')

    expect(exported.length).toBeGreaterThan(100)

    const loaded = await loadArrayBuffer(base64ToArrayBuffer(exported))
    const meshes = new Set<THREE.Mesh>()
    loaded.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.add(child)
      }
    })
    expect(meshes.size).toBeGreaterThanOrEqual(1)

    const wallMeshes = Array.from(meshes).filter((mesh) => {
      const name = mesh.name ?? ''
      return name.includes('muro') && mesh.userData?.kind === 'wall'
    })
    expect(wallMeshes.length).toBeGreaterThanOrEqual(1)

    const measured = wallMeshes.map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh)
      return { x: box.max.x - box.min.x }
    })
    expect(measured.every((m) => Math.abs(m.x - 5) < 0.001)).toBe(true)
  })

  it('exporta un escenario vacío sin lanzar', async () => {
    const exported = await exportGlb(new THREE.Scene(), { walls: [], objects: [], levels: [] })
    expect(exported.length).toBeGreaterThanOrEqual(0)
  })
})
