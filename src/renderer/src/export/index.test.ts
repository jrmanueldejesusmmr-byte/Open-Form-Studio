/**
 * Pruebas de la escena de exportación compartida (Fase 1).
 *
 * Ejecución: `npx vitest run src/renderer/src/export/index.test.ts`
 */
import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'
import {
  buildExportScene,
  contentToBlob,
  EXPORT_CATEGORIES,
  EXPORT_FORMATS,
  getExportFormat
} from './index'

/** Cuenta las mallas de la escena por `userData.kind`. */
function countByKind(scene: THREE.Scene, kind: string): number {
  let count = 0
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.kind === kind) count++
  })
  return count
}

describe('buildExportScene', () => {
  it('incluye muros con identidad y pisos solo si hay nivel', () => {
    const manager = new SceneManager()
    manager.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0))

    const context = {
      walls: manager.getWalls(),
      objects: manager.getObjects(),
      levels: manager.getLevels()
    }

    const scene = buildExportScene(context)
    expect(countByKind(scene, 'wall')).toBe(1)
    // El piso por defecto existe y la huella de su muro genera la losa.
    expect(countByKind(scene, 'floor')).toBe(1)

    const wallMesh = scene.children.find(
      (child) => child instanceof THREE.Mesh && child.userData.kind === 'wall'
    ) as THREE.Mesh
    expect(wallMesh.name).toContain('muro')
    expect(wallMesh.userData.wallId).toBe(manager.getWalls()[0].id)
    expect(wallMesh.userData.levelId).toBe('level-0')
  })

  it('onlyWalls omite pisos y objetos', () => {
    const manager = new SceneManager()
    manager.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0))
    manager.restoreObject({
      id: 'obj-test',
      kind: 'furniture',
      name: 'Silla',
      position: { x: 2, y: 0, z: 2 },
      rotationY: 0,
      size: { width: 1, height: 1, depth: 1 },
      color: 0x9aa4b2
    })

    const context = {
      walls: manager.getWalls(),
      objects: manager.getObjects(),
      levels: manager.getLevels()
    }

    const full = buildExportScene(context)
    expect(countByKind(full, 'object')).toBe(1)

    const wallsOnly = buildExportScene(context, { onlyWalls: true })
    expect(countByKind(wallsOnly, 'wall')).toBe(1)
    expect(countByKind(wallsOnly, 'object')).toBe(0)
    expect(countByKind(wallsOnly, 'floor')).toBe(0)
  })

  it('escena vacía → sin mallas', () => {
    const scene = buildExportScene({ walls: [], objects: [], levels: [] })
    let meshes = 0
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes++
    })
    expect(meshes).toBe(0)
  })
})

describe('registro de formatos', () => {
  it('todos los formatos del alcance están disponibles', () => {
    for (const id of ['obj', 'mtl', 'glb', 'stl', 'dxf', 'pdf', 'svg', 'png', 'ifc']) {
      expect(EXPORT_FORMATS.find((f) => f.id === id)?.available).toBe(true)
    }
  })

  it('getExportFormat devuelve undefined para id desconocido', () => {
    expect(getExportFormat('obj')?.extension).toBe('obj')
    expect(getExportFormat('dwg' as never)).toBeUndefined()
  })

  it('el MTL declara su extensión propia y el OBJ la suya', () => {
    expect(getExportFormat('obj')?.extension).toBe('obj')
    expect(getExportFormat('mtl')?.extension).toBe('mtl')
  })

  it('PNG es binario y los formatos de texto no', () => {
    expect(getExportFormat('png')?.binary).toBe(true)
    expect(getExportFormat('glb')?.binary).toBe(true)
    expect(getExportFormat('stl')?.binary).toBe(true)
    expect(getExportFormat('dxf')?.binary).toBe(false)
    expect(getExportFormat('svg')?.binary).toBe(false)
    expect(getExportFormat('ifc')?.binary).toBe(false)
  })

  it('PNG sin visor 3D avisa en vez de fallar en silencio', async () => {
    const png = getExportFormat('png')!
    const content = await png.export(new THREE.Scene(), { walls: [], objects: [], levels: [] })
    expect(content).toBe('')
  })

  it('organiza los 9 formatos en las 3 categorías CAD/BIM y convierte contenido a Blob', async () => {
    expect(EXPORT_CATEGORIES.map((c) => c.id)).toEqual(['3d', '2d', 'bim'])
    const categorizedIds = EXPORT_CATEGORIES.flatMap((c) => c.formats)
    expect(categorizedIds).toEqual(['obj', 'mtl', 'glb', 'stl', 'dxf', 'pdf', 'svg', 'png', 'ifc'])

    const objFmt = getExportFormat('obj')!
    const objContent = await objFmt.export(new THREE.Scene(), { walls: [], objects: [], levels: [] })
    const objBlob = contentToBlob(objContent, objFmt)
    expect(objBlob.size).toBeGreaterThan(0)
    expect(objBlob.type).toContain('model/obj')

    const stlFmt = getExportFormat('stl')!
    const stlContent = await stlFmt.export(new THREE.Scene(), { walls: [], objects: [], levels: [] })
    const stlBlob = contentToBlob(stlContent, stlFmt)
    expect(stlBlob.size).toBeGreaterThanOrEqual(84)
    expect(stlBlob.type).toBe('model/stl')
  })
})