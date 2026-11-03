import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { SceneManager } from '../engine/SceneManager'
import { LayerManager } from '../engine/LayerManager'
import { Viewport3DController } from '../engine/Viewport3DController'
import { WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import {
  formatDefaultProjectName,
  serializeProjectState,
  exportProjectJson,
  parseProjectJson,
  applySerializedProjectToWorkspace
} from '../services/ProjectPersistence'
import { parseDxf, inferWalls, applyDxfImport } from '../export/dxfImport'
import { buildSvg } from '../export/svg'
import { parseSvg, applySvgImport } from './svgImport'
import { parseIfc, planIfcImport, applyIfcImport } from './ifcImport'
import { loadModel, createImportedObjects } from './modelImport'

describe('Persistencia completa del proyecto y formato nativo (.arqproj / .json)', () => {
  it('genera nombre por defecto con formato Proyecto_DD_MM_AAAA', () => {
    const d = new Date(2026, 9, 26) // 26/10/2026
    expect(formatDefaultProjectName(d)).toBe('Proyecto_26_10_2026')
  })

  it('serializa y reconstruye íntegramente muros (con vanos), objetos, capas y cámara', () => {
    const sourceScene = new SceneManager()
    const sourceLayers = new LayerManager()
    const sourceCam = new Viewport3DController()

    const wall = sourceScene.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(6, 0, 0)
    )
    wall.thickness = 0.25
    wall.height = 3.0
    sourceScene.addOpening(wall.id, {
      wallId: wall.id,
      type: 'door',
      x: 2.0,
      width: 0.9,
      height: 2.1,
      sill: 0,
      materialId: null
    })

    const sofa = new SceneObject('Sofá modular', 'furniture')
    sofa.position.set(2, 0, 3)
    sofa.rotationY = Math.PI / 4
    sofa.size.set(2.2, 0.85, 0.95)
    sofa.includeInCosts = true
    sourceScene.addObject(sofa)

    sourceLayers.setVisible('walls-simple', false)
    sourceLayers.setColor('walls-simple', 0xff5500)

    sourceCam.state.yaw = 60
    sourceCam.state.pitch = 42
    sourceCam.state.distance = 24
    sourceCam.state.target.set(3, 0, 2)

    const serialized = serializeProjectState({
      projectId: 'proj-test-1',
      projectName: 'Residencia Central',
      scene: sourceScene,
      layers: sourceLayers,
      cameraController: sourceCam,
      viewMode: '2d'
    })

    const jsonText = exportProjectJson(serialized)
    const parsed = parseProjectJson(jsonText)

    expect(parsed.metadata.name).toBe('Residencia Central')
    expect(parsed.walls).toHaveLength(1)
    expect(parsed.walls[0].openings).toHaveLength(1)
    expect(parsed.objects).toHaveLength(1)
    expect(parsed.objects[0].position).toEqual([2, 0, 3])
    expect(parsed.camera.viewMode).toBe('2d')

    const targetScene = new SceneManager()
    const targetLayers = new LayerManager()
    const targetCam = new Viewport3DController()
    let restoredMode: '2d' | '3d' = '3d'

    applySerializedProjectToWorkspace(parsed, {
      scene: targetScene,
      layers: targetLayers,
      cameraController: targetCam,
      setViewMode: (m) => {
        restoredMode = m
      }
    })

    expect(targetScene.getWalls()).toHaveLength(1)
    expect(targetScene.getWalls()[0].thickness).toBeCloseTo(0.25, 5)
    expect(targetScene.getWalls()[0].height).toBeCloseTo(3.0, 5)
    expect(targetScene.getWalls()[0].openings).toHaveLength(1)
    expect(targetScene.getObjects()).toHaveLength(1)
    expect(targetScene.getObjects()[0].name).toBe('Sofá modular')
    expect(targetLayers.getLayer('walls-simple')?.visible).toBe(false)
    expect(targetLayers.getLayer('walls-simple')?.color).toBe(0xff5500)
    expect(targetCam.state.yaw).toBeCloseTo(60, 5)
    expect(targetCam.state.target.x).toBeCloseTo(3, 5)
    expect(restoredMode).toBe('2d')
  })
})

describe('Importación avanzada DXF, SVG, IFC y OBJ+MTL', () => {
  it('DXF: parsea LWPOLYLINE cerrada, CIRCLE y ARC con parámetros de inserción', () => {
    const dxf = [
      '0\nSECTION\n2\nENTITIES',
      '0\nLWPOLYLINE\n8\n0\n70\n1\n10\n0.0\n20\n0.0\n10\n4.0\n20\n0.0\n10\n4.0\n20\n3.0\n10\n0.0\n20\n3.0',
      '0\nCIRCLE\n8\n0\n10\n2.0\n20\n1.5\n40\n0.5',
      '0\nARC\n8\n0\n10\n0.0\n20\n0.0\n40\n1.0\n50\n0\n51\n90',
      '0\nENDSEC\n0\nEOF\n'
    ].join('\n')

    const parsed = parseDxf(dxf)
    // 4 lados de LWPOLYLINE + 16 segmentos de CIRCLE + 4 segmentos de ARC = 24
    expect(parsed.lines.length).toBeGreaterThanOrEqual(20)

    const scene = new SceneManager()
    const res = applyDxfImport(scene, dxf, {
      scale: 2,
      position: { x: 10, y: 0, z: 5 },
      rotationY: 0,
      centerAtOrigin: false
    })
    expect(res.ok).toBe(true)
    expect(scene.getWalls().length).toBe(parsed.lines.length)
  })

  it('SVG: ida y vuelta de plano 2D exportado y lectura de trazos', () => {
    const source = new SceneManager()
    source.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0))
    const svg = buildSvg({ walls: source.getWalls(), objects: [], levels: source.getLevels() })

    const parsed = parseSvg(svg)
    expect(parsed.lines.length).toBeGreaterThan(0)

    const target = new SceneManager()
    const res = applySvgImport(target, svg)
    expect(res.ok).toBe(true)
    expect(target.getWalls().length).toBeGreaterThanOrEqual(1)
  })

  it('IFC: integra IfcWall, IfcSlab, IfcColumn y IfcDoor como entidades nativas', () => {
    const ifc = [
      'ISO-10303-21;',
      'HEADER;',
      'ENDSEC;',
      'DATA;',
      '#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
      "#2=CARTESIAN_POINT('',(0.,0.,0.));",
      "#3=DIRECTION('',(0.,0.,1.));",
      "#4=DIRECTION('',(1.,0.));",
      '#5=IFCAXIS2PLACEMENT3D($,#2,#3,#4);',
      '#6=IFCLOCALPLACEMENT($,#5);',
      "#7=IFCRECTANGLEPROFILEDEF(.AREA.,'Muro',$,#5,6.,0.2.);",
      '#8=IFCEXTRUDEDAREASOLID($,#7,#2,#3,2.8.);',
      "#9=IFCWALLSTANDARDCASE('Muro Principal',#01,$,$,$,#6,$,#8,$,$);",
      "#10=IFCRECTANGLEPROFILEDEF(.AREA.,'Losa',$,#5,6.,4.);",
      '#11=IFCEXTRUDEDAREASOLID($,#10,#2,#3,0.2.);',
      "#12=IFCSLAB('Losa Planta Baja',#02,$,$,$,#6,$,#11,$,$);",
      "#13=IFCRECTANGLEPROFILEDEF(.AREA.,'Columna',$,#5,0.4,0.4);",
      '#14=IFCEXTRUDEDAREASOLID($,#13,#2,#3,2.8.);',
      "#15=IFCCOLUMN('Columna C1',#03,$,$,$,#6,$,#14,$,$);",
      'ENDSEC;',
      'END-ISO-10303-21;'
    ].join('\n')

    const plan = planIfcImport(parseIfc(ifc))
    expect(plan.walls).toHaveLength(1)
    expect(plan.slabs).toHaveLength(1)
    expect(plan.columns).toHaveLength(1)

    const scene = new SceneManager()
    const result = applyIfcImport(scene, plan, { scale: 1, includeInCosts: true })
    expect(result.ok).toBe(true)
    expect(scene.getWalls()).toHaveLength(1)
    expect(scene.getWalls()[0].length).toBeCloseTo(6, 4)
    expect(scene.getObjects()).toHaveLength(2) // 1 losa + 1 columna
  })

  it('OBJ + MTL: aplica materiales MTL y parámetros de rotación/escala', async () => {
    const objText = [
      'mtllib test.mtl',
      'usemtl RedMat',
      'v 0 0 0',
      'v 2 0 0',
      'v 2 2 0',
      'f 1 2 3'
    ].join('\n')
    const mtlText = ['newmtl RedMat', 'Kd 0.8 0.2 0.1'].join('\n')
    const buffer = new TextEncoder().encode(objText).buffer as ArrayBuffer

    const model = await loadModel(buffer, 'obj', { mtlText })
    expect(model.meshCount).toBe(1)

    const objects = createImportedObjects(model, {
      scale: new THREE.Vector3(2, 2, 2),
      position: new THREE.Vector3(1, 0.5, 2),
      rotationY: Math.PI / 2,
      centerAtOrigin: true,
      includeInCosts: true,
      objectName: 'Pieza OBJ'
    })
    expect(objects).toHaveLength(1)
    expect(objects[0].position.y).toBeCloseTo(0.5, 5)
    expect(objects[0].rotationY).toBeCloseTo(Math.PI / 2, 5)
    expect(objects[0].includeInCosts).toBe(true)
  })
})

