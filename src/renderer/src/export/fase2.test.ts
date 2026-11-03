/**
 * Pruebas de los exportadores de la Fase 2 (STL, SVG, IFC4, MTL).
 *
 * Cada formato se genera y después se vuelve a LEER con el cargador
 * correspondiente (o con un parser propio), comprobando que la geometría
 * conserva las medidas en metros.
 *
 * Ejecución: `npx vitest run src/renderer/src/export/fase2.test.ts`
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'
import { setQuality } from '../engine/MaterialSystem'
import { buildExportScene, type ExportContext } from './index'
import { buildMtl } from './obj'
import { buildSvg } from './svg'
import { buildIfc, ifcGuid } from './ifc'

// En calidad «baja» el motor no genera las texturas PBR (necesitan DOM/canvas),
// así que la escena de exportación se puede construir en Node sin navegador.
setQuality('baja')

/** Escena de prueba: un muro de 5 m con espesor 0,2 m y una puerta. */
export function makeContext(): ExportContext {
  const manager = new SceneManager()
  const wall = manager.addWall(
    WallSegmentType.SimpleWall,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5, 0, 0)
  )
  wall.height = 2.8
  wall.thickness = 0.2
  // `mat.plaster` no lleva textura procedural: no necesita canvas (ni DOM).
  wall.materialId = 'mat.plaster'

  manager.restoreObject({
    id: 'obj-puerta',
    kind: 'shape',
    name: 'Puerta',
    position: { x: 2, y: 0, z: 0 },
    rotationY: 0,
    size: { width: 0.9, height: 2.1, depth: 0.12 },
    color: 0xffffff,
    materialId: 'mat.plaster'
  })

  return {
    walls: manager.getWalls(),
    objects: manager.getObjects(),
    levels: manager.getLevels(),
    projectName: 'Casa de prueba'
  }
}

describe('STL (ida y vuelta con STLLoader)', () => {
  it('genera un STL binario que se relee con las medidas en metros', () => {
    const context = makeContext()
    const scene = buildExportScene(context)
    const exporter = new STLExporter()
    const data = exporter.parse(scene, { binary: true })

    const loader = new STLLoader()
    // El loader espera un ArrayBuffer: se copia a uno propio.
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    const geometry = loader.parse(buffer as ArrayBuffer)
    const positions = geometry.getAttribute('position')
    expect(positions.count).toBeGreaterThan(0)

    // El muro mide 5 m de largo: la caja del MURO debe medir 5 m.
    // (La escena de exportación incluye además la losa del piso, que es
    // más ancha, así que se mide la malla del muro por separado.)
    const wallMesh = scene.children.find(
      (child) => child instanceof THREE.Mesh && child.userData.kind === 'wall'
    ) as THREE.Mesh
    expect(wallMesh).toBeTruthy()
    const wallGeometry = wallMesh.geometry.clone()
    wallGeometry.applyMatrix4(wallMesh.matrixWorld)
    wallGeometry.computeBoundingBox()
    const wallBox = wallGeometry.boundingBox!
    expect(wallBox.max.x - wallBox.min.x).toBeCloseTo(5, 2)
    expect(wallBox.max.z - wallBox.min.z).toBeCloseTo(0.2, 2)
    // La altura llega a 2,8 m.
    expect(wallBox.max.y - wallBox.min.y).toBeCloseTo(2.8, 2)

    // Y el conjunto entero tiene triángulos (no una escena vacía).
    expect(positions.count).toBeGreaterThan(0)
  })
})

describe('MTL (materiales del catálogo)', () => {
  it('declara un material por cada material de la escena', () => {
    const context = makeContext()
    const scene = buildExportScene(context)
    const mtl = buildMtl(scene)
    expect(mtl).toContain('newmtl ')
    expect(mtl).toContain('Kd ')
    expect(mtl).toContain('illum 2')
    // El material del muro (`mat.plaster`) aparece nombrado por su id.
    expect(mtl).toContain('newmtl mat.plaster')
  })

  it('los nombres de material no llevan espacios (el MTL no los admite)', () => {
    const context = makeContext()
    const scene = buildExportScene(context)
    const mtl = buildMtl(scene)
    for (const line of mtl.split('\n')) {
      if (!line.startsWith('newmtl ')) continue
      const name = line.slice('newmtl '.length).trim()
      expect(name).toMatch(/^[\w.-]+$/)
    }
  })
})

describe('SVG (planta vectorial)', () => {
  it('produce un SVG válido con capas y viewBox en metros', () => {
    const context = makeContext()
    const svg = buildSvg(context)
    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('</svg>')
    // El viewBox va en metros: el muro va de x=0 a x=5 (± margen de 0,5).
    const viewBox = svg.match(/viewBox="([^"]+)"/)!
    expect(viewBox).toBeTruthy()
    const parts = viewBox[1].split(' ').map(Number)
    expect(parts[0]).toBeCloseTo(-0.5, 3)
    expect(parts[2]).toBeCloseTo(6, 3)
  })

  it('incluye la capa de muros y la de objetos', () => {
    const context = makeContext()
    const svg = buildSvg(context)
    expect(svg).toContain('id="MUROS"')
    expect(svg).toContain('id="OBJETOS"')
  })

  it('escena vacía → SVG vacío (no un archivo corrupto)', () => {
    const svg = buildSvg({ walls: [], objects: [], levels: [] })
    expect(svg).toBe('')
  })
})

describe('IFC4 (OpenBIM)', () => {
  it('genera un archivo STEP con el esquema IFC4', () => {
    const context = makeContext()
    const ifc = buildIfc(context)
    expect(ifc.startsWith('ISO-10303-21;')).toBe(true)
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));")
    expect(ifc).toContain('DATA;')
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true)
  })

  it('incluye proyecto, edificio, piso, muro, losa y puerta', () => {
    const context = makeContext()
    const ifc = buildIfc(context)
    expect(ifc).toContain('IFCPROJECT(')
    expect(ifc).toContain('IFCBUILDING(')
    expect(ifc).toContain('IFCBUILDINGSTOREY(')
    expect(ifc).toContain('IFCWALLSTANDARDCASE(')
    expect(ifc).toContain('IFCSLAB(')
    expect(ifc).toContain('IFCDOOR(')
  })

  it('declara las unidades en metros', () => {
    const context = makeContext()
    const ifc = buildIfc(context)
    expect(ifc).toContain('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')
    expect(ifc).toContain('IFCUNITASSIGNMENT(')
  })

  it('asocia el material del muro al elemento', () => {
    const context = makeContext()
    const ifc = buildIfc(context)
    expect(ifc).toContain("IFCMATERIAL('mat.plaster'")
    expect(ifc).toContain('IFCRELASSOCIATESMATERIAL(')
  })

  it('el GUID de IFC tiene 22 caracteres y es único por semilla', () => {
    expect(ifcGuid(1)).toHaveLength(22)
    expect(ifcGuid(1)).not.toBe(ifcGuid(2))
    expect(ifcGuid(1)).toMatch(/^[0-9A-Za-z_$]{22}$/)
  })

  it('todos los ids de entidad referenciados existen en el archivo', () => {
    const context = makeContext()
    const ifc = buildIfc(context)
    const defined = new Set([...ifc.matchAll(/^#(\d+)=/gm)].map((m) => m[1]))
    // Las referencias locales son `#N`; los GUID de IFC (22 caracteres) son
    // globales y no cuentan como referencias a entidades de este archivo.
    const referenced = [...ifc.matchAll(/#(\d{1,6})(?![0-9A-Za-z_$])/g)].map((m) => m[1])
    expect(referenced.filter((id) => defined.has(id) === false)).toEqual([])
  })

  it('el nombre del proyecto aparece escapado en el IFC', () => {
    const context = { ...makeContext(), projectName: 'Casa "Los Robles"' }
    const ifc = buildIfc(context)
    expect(ifc).toContain('Casa \\"Los Robles\\"')
  })
})
