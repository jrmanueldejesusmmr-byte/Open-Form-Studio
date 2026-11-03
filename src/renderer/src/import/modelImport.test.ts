/**
 * Pruebas de la importación de modelos 3D (Fase 4): ida y vuelta GLB,
 * capa «importado», exclusión de Costos y un solo Ctrl+Z.
 *
 * Ejecución: `npx vitest run src/renderer/src/import/modelImport.test.ts`
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { SceneManager } from '../engine/SceneManager'
import { HistoryManager } from '../engine/HistoryManager'
import { WallSegmentType } from '../models/Wall'
import { buildExportScene } from '../export/index'
import { exportGlb } from '../export/glb'
import { shouldCountInCosts } from '../costs/takeoff'
import { createImportedObjects, loadModel, base64ToBytes } from './modelImport'

/**
 * `GLTFExporter`/`GLTFLoader` usan `FileReader` (solo navegador). En Node
 * (vitest) se instala un polyfill mínimo basado en `Blob.arrayBuffer()`.
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
  const bytes = base64ToBytes(base64)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Caja de una geometría de caja de prueba (atributo de posición garantizado). */
function bboxOf(geometry: THREE.BufferGeometry): THREE.Box3 {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  return new THREE.Box3().setFromBufferAttribute(position)
}

describe('importación GLB/OBJ', () => {
  it('ida y vuelta GLB: un muro de 5 m conserva la geometría ±0.001 m', async () => {
    const source = new SceneManager()
    source.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0))
    const exported = await exportGlb(
      new THREE.Scene(),
      { walls: source.getWalls(), objects: [], levels: [] }
    )
    if (!exported) throw new Error('exportGlb falló')

    const model = await loadModel(base64ToArrayBuffer(exported), 'glb')
    expect(model.meshes.length).toBeGreaterThanOrEqual(1)
    const before = new THREE.Box3().copy(model.bbox)

    const objects = createImportedObjects(model, {
      scale: new THREE.Vector3(1, 1, 1),
      position: new THREE.Vector3(0, 0, 0),
      includeInCosts: false
    })
    expect(objects.length).toBe(model.meshes.length)
    // La geometría importada conserva el tamaño: el bbox no cambia al crear objetos.
    const after = new THREE.Box3().copy(model.bbox)
    expect(after.min.distanceTo(before.min)).toBeCloseTo(0, 6)
    expect(after.max.distanceTo(before.max)).toBeCloseTo(0, 6)
    const size = model.bbox.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.z)).toBeCloseTo(5, 3)
  })

  it('los objetos entran en la capa «importado» y se excluyen de Costos salvo marca', () => {
    const source = new SceneManager()
    source.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0))
    const target = new SceneManager()
    const history = new HistoryManager(target)
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const model = {
      format: 'glb' as const,
      meshes: [{ name: 'caja', geometry, bbox: bboxOf(geometry) }],
      bbox: bboxOf(geometry),
      meshCount: 1
    }
    history.transaction('Importar modelo 3D', () => {
      for (const object of createImportedObjects(model, {
        scale: new THREE.Vector3(1, 1, 1),
        position: new THREE.Vector3(0, 0, 0),
        includeInCosts: false
      })) {
        target.addObject(object)
      }
    })
    expect(target.getObjects()).toHaveLength(1)
    const [object] = target.getObjects()
    expect(object.layer).toBe('importado')
    expect(object.includeInCosts).toBe(false)
    expect(shouldCountInCosts(object)).toBe(false)

    object.includeInCosts = true
    expect(shouldCountInCosts(object)).toBe(true)

    // Un solo Ctrl+Z revierte toda la importación.
    expect(history.undo()).toBe(true)
    expect(target.getObjects()).toHaveLength(0)
  })

  it('la escala y la posición del diálogo se aplican a los objetos', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2)
    const bbox = bboxOf(geometry)
    const model = { format: 'obj' as const, meshes: [{ name: 'cubo', geometry, bbox }], bbox, meshCount: 1 }
    const [object] = createImportedObjects(model, {
      scale: new THREE.Vector3(2, 2, 2),
      position: new THREE.Vector3(3, 0, 4),
      includeInCosts: false,
      objectName: 'Mueble'
    })
    expect(object.size.x).toBeCloseTo(4, 6)
    expect(object.position.x).toBeCloseTo(3, 6)
    expect(object.position.z).toBeCloseTo(4, 6)
    expect(object.name).toBe('Mueble')
  })

  it('GLB corrupto o vacío → error controlado', async () => {
    await expect(loadModel(new ArrayBuffer(8), 'glb')).rejects.toThrow()
    const emptyObj = new TextEncoder().encode('# OBJ vacío\n')
    const model = await loadModel(emptyObj.buffer as ArrayBuffer, 'obj')
    expect(model.meshes).toHaveLength(0)
  })
})
