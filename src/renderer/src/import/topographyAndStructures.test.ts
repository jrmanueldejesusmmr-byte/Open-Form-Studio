import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  parseDxfTopography,
  parseCsvTxtTopography,
  parseGeoJsonTopography,
  parseTopographyFile
} from './topographyImport'
import {
  createTerrainDataFromPoints,
  createDemoTerrainData,
  buildTerrainGeometry,
  buildTerrainContourLines,
  sampleTerrainElevation,
  sampleAnyTerrainAt,
  applyGradingPadToTerrain
} from '../engine/TerrainBuilder'
import { buildStructuralOrGeometricGeometry } from '../engine/StructuralSystemsBuilder'
import { defaultStructuralParamsFor } from '../models/StructuralTypes'
import { SceneObject } from '../models/SceneObject'
import { SceneManager } from '../engine/SceneManager'
import { HistoryManager } from '../engine/HistoryManager'
import { themeManager } from '../services/ThemeManager'
import { buildWorkspaceGridSystem } from '../engine/GridBuilder'

describe('1. Sincronización de Temas y Lienzo 3D (ThemeManager + GridBuilder)', () => {
  it('sincroniza colores exactos de fondo y grilla 3D en los 4 temas y 3 estilos de fondo', () => {
    themeManager.setTheme('light-arch')
    expect(themeManager.getThemeDef().sceneBg.toLowerCase()).toBe('#e2e8f0')

    themeManager.setTheme('space-blue')
    expect(themeManager.getThemeDef().sceneBg.toLowerCase()).toBe('#0b1528')
    expect(themeManager.getThemeDef().gridMajor.toLowerCase()).toBe('#06b6d4')

    themeManager.setTheme('cad-dark')
    expect(themeManager.getThemeDef().sceneBg.toLowerCase()).toBe('#121316')

    themeManager.setTheme('deep-dark')
    expect(themeManager.getThemeDef().sceneBg.toLowerCase()).toBe('#090d16')

    const spaceBlueDef = { ...themeManager.getThemeDef() }
    themeManager.setTheme('space-blue')
    const gridSys = buildWorkspaceGridSystem(60, 1)

    gridSys.updateTheme(themeManager.getThemeDef(), 'grid', true)
    expect(gridSys.group.visible).toBe(true)
    const gridHelpers = gridSys.group.children.filter((c) => c instanceof THREE.GridHelper)
    const dotPoints = gridSys.group.children.find((c) => c instanceof THREE.Points)!
    expect(gridHelpers.length).toBe(2)
    expect(gridHelpers.every((g) => g.visible)).toBe(true)
    expect(dotPoints.visible).toBe(false)

    gridSys.updateTheme(themeManager.getThemeDef(), 'dots', true)
    expect(gridSys.group.visible).toBe(true)
    expect(gridHelpers.every((g) => !g.visible)).toBe(true)
    expect(dotPoints.visible).toBe(true)

    gridSys.updateTheme(spaceBlueDef, 'solid', true)
    expect(gridHelpers.every((g) => !g.visible)).toBe(true)
    expect(dotPoints.visible).toBe(false)
    gridSys.dispose()
  })
})

describe('2. Módulo de Topografía CAD / GIS y Terreno 3D', () => {
  it('lee elevaciones 3D de archivos DXF (POLYLINE/VERTEX Z, LWPOLYLINE código 38 y POINT)', () => {
    const sampleDxf = [
      '0', 'SECTION',
      '2', 'ENTITIES',
      '0', 'POLYLINE',
      '8', 'CURVAS',
      '66', '1',
      '70', '8',
      '0', 'VERTEX',
      '10', '0.0', '20', '0.0', '30', '102.5',
      '0', 'VERTEX',
      '10', '20.0', '20', '0.0', '30', '104.0',
      '0', 'SEQEND',
      '0', 'LWPOLYLINE',
      '38', '106.0',
      '10', '0.0', '20', '20.0',
      '10', '20.0', '20', '20.0',
      '0', 'POINT',
      '10', '10.0', '20', '10.0', '30', '108.5',
      '0', 'ENDSEC',
      '0', 'EOF'
    ].join('\n')

    const parsed = parseDxfTopography(sampleDxf)
    expect(parsed.format).toBe('DXF')
    expect(parsed.points.length).toBeGreaterThanOrEqual(5)
    expect(parsed.contourLinesCount).toBe(2)
    expect(parsed.bounds.relief).toBeCloseTo(6.0, 2)
  })

  it('lee archivos topográficos CSV / TXT (X,Y,Z) y GeoJSON con cotas', () => {
    const csvText = [
      'X,Y,Z',
      '0,0,1.20',
      '15,0,2.50',
      '0,15,1.80',
      '15,15,4.10',
      '7.5,7.5,3.20'
    ].join('\n')
    const csvParsed = parseCsvTxtTopography(csvText, 'CSV')
    expect(csvParsed.points.length).toBe(5)
    expect(csvParsed.bounds.maxZ - csvParsed.bounds.minZ).toBeCloseTo(2.9, 2)

    const geojsonText = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { elevation: 12.5 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [10, 0],
              [10, 10]
            ]
          }
        },
        {
          type: 'Feature',
          properties: { elevation: 15.0 },
          geometry: {
            type: 'Point',
            coordinates: [5, 5, 15.0]
          }
        }
      ]
    })
    const geoParsed = parseGeoJsonTopography(geojsonText)
    expect(geoParsed.format).toBe('GeoJSON')
    expect(geoParsed.points.length).toBeGreaterThanOrEqual(4)
    expect(parseTopographyFile(csvText, 'levantamiento.txt').format).toBe('TXT')
  })

  it('construye TerrainMesh con curvas de nivel, muestrea cotas Z y aplana plataformas calculando Corte y Relleno (m³)', () => {
    const demoData = createDemoTerrainData(30, 30)
    const terrainObj = new SceneObject('Terreno Test', 'shape')
    terrainObj.shapeId = 'topo.terrain'
    terrainObj.terrainData = demoData
    terrainObj.size.set(demoData.width, Math.max(0.5, demoData.maxElev - demoData.minElev), demoData.depth)

    const geo = buildTerrainGeometry(demoData, terrainObj.size)
    expect(geo.getAttribute('position').count).toBe(demoData.cols * demoData.rows)
    expect(geo.getAttribute('color')).toBeDefined()
    geo.dispose()

    const contours = buildTerrainContourLines(demoData, terrainObj.size)
    expect(contours.children.length).toBeGreaterThan(0)

    const centerZBefore = sampleTerrainElevation(terrainObj, 0, 0)
    expect(centerZBefore).not.toBeNull()

    // Aplanar una plataforma rectangular central de 10x10m a Nivel +1.00m (sin margen para comprobar planitud exacta interior)
    const padPoly = [
      { x: -5, z: -5 },
      { x: 5, z: -5 },
      { x: 5, z: 5 },
      { x: -5, z: 5 }
    ]
    const targetElev = 1.0
    const graded = applyGradingPadToTerrain(terrainObj, padPoly, targetElev, 0)
    expect(graded).not.toBeNull()
    expect(graded!.modifiedVertices).toBeGreaterThan(10)
    expect(graded!.cutVolumeM3 + graded!.fillVolumeM3).toBeGreaterThan(0)

    terrainObj.terrainData = graded!.updatedData
    terrainObj.size.y = graded!.newHeightSize

    const centerSampleAfter = sampleAnyTerrainAt([terrainObj], 0, 0)
    expect(centerSampleAfter).not.toBeNull()
    expect(centerSampleAfter!.elevation).toBeCloseTo(targetElev, 2)
  })
})

describe('3. Generador Paramétrico de los 13 Sistemas Estructurales + Figuras Base y Escalado en Tiempo Real', () => {
  const ALL_SYSTEM_SHAPES = [
    'struct.adintelada',
    'struct.abovedada',
    'struct.entramada',
    'struct.triangulada',
    'struct.colgante',
    'struct.tensada',
    'struct.neumatica',
    'struct.muros_carga',
    'struct.laminar',
    'struct.geodesica',
    'struct.espacial',
    'struct.plegada',
    'struct.voladizo',
    'geo.cilindro',
    'geo.anillo',
    'geo.muro_curvo',
    'geo.cono',
    'geo.esfera',
    'geo.prisma',
    'geo.extrusion'
  ]

  it('genera geometría 3D válida (BufferGeometry con normales, UVs y cotas finitas) para las 20 tipologías', () => {
    for (const shapeId of ALL_SYSTEM_SHAPES) {
      const def = defaultStructuralParamsFor(shapeId)
      const size = new THREE.Vector3(def.size.width, def.size.height, def.size.depth)
      const geo = buildStructuralOrGeometricGeometry(shapeId, size, def.params)
      expect(geo, `Geometría nula para ${shapeId}`).not.toBeNull()
      const pos = geo!.getAttribute('position')
      const norm = geo!.getAttribute('normal')
      const uv = geo!.getAttribute('uv')
      expect(pos.count, `Sin vértices en ${shapeId}`).toBeGreaterThanOrEqual(12)
      expect(norm.count).toBe(pos.count)
      expect(uv.count).toBe(pos.count)

      // Verificar ausencia de NaN en coordenadas
      for (let i = 0; i < Math.min(60, pos.count); i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true)
        expect(Number.isFinite(pos.getY(i))).toBe(true)
        expect(Number.isFinite(pos.getZ(i))).toBe(true)
      }
      geo!.dispose()
    }
  })

  it('soporta subtipos arquitectónicos (arco, bóveda, cúpula, muro curvo) y adaptación paramétrica con Undo/Redo', () => {
    for (const subType of ['arco', 'boveda', 'cupula']) {
      const def = defaultStructuralParamsFor('struct.abovedada')
      const geo = buildStructuralOrGeometricGeometry(
        'struct.abovedada',
        new THREE.Vector3(8, 4.5, 8),
        { ...def.params, subType }
      )
      expect(geo).not.toBeNull()
      expect(geo!.getAttribute('position').count).toBeGreaterThan(24)
      geo!.dispose()
    }

    const scene = new SceneManager()
    const history = new HistoryManager(scene)

    const dome = new SceneObject('Cúpula Geodésica', 'shape')
    dome.shapeId = 'struct.geodesica'
    const def = defaultStructuralParamsFor('struct.geodesica')
    dome.size.set(def.size.width, def.size.height, def.size.depth)
    dome.structuralParams = { ...def.params }

    history.transaction('Insertar cúpula', () => {
      scene.addObject(dome)
    })

    history.transaction('Redimensionar cúpula', () => {
      scene.updateObject(dome.id, {
        size: new THREE.Vector3(14, 7, 14),
        rotationY: Math.PI / 4,
        structuralParams: { ...def.params, radius: 7, divisions: 3 }
      })
    })

    expect(dome.size.x).toBe(14)
    expect(dome.structuralParams?.radius).toBe(7)
    expect(dome.structuralParams?.divisions).toBe(3)

    expect(history.undo()).toBe(true)
    const restored = scene.getObjects().find((o) => o.id === dome.id)!
    expect(restored.size.x).toBe(def.size.width)
    expect(restored.structuralParams?.divisions).toBe(def.params.divisions)

    expect(history.redo()).toBe(true)
    const redone = scene.getObjects().find((o) => o.id === dome.id)!
    expect(redone.size.x).toBe(14)
    expect(redone.structuralParams?.radius).toBe(7)
  })
})
