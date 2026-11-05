import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import { HistoryManager } from '../engine/HistoryManager'
import { WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { ElectricalModel } from '../mep/ElectricalModel'
import { AIChatService, normalizeSpanish, splitChainedInstructions } from './AIChatService'

describe('AIChatService - ASTRO AI Engine', () => {
  let scene: SceneManager
  let history: HistoryManager
  let electricalModel: ElectricalModel
  let astro: AIChatService

  beforeEach(() => {
    scene = new SceneManager()
    history = new HistoryManager(scene)
    electricalModel = new ElectricalModel()
    astro = new AIChatService(scene, {
      history,
      electricalModel
    })
  })

  describe('1. Normalizador Léxico y Tolerancia a Errores en Español', () => {
    it('normaliza errores ortográficos y tildes comunes', () => {
      expect(normalizeSpanish('agrega una seguda plata a la contruccion')).toBe(
        'agrega una segunda planta a la construccion'
      )
      expect(normalizeSpanish('cabliado con swiches y focos')).toBe(
        'cableado con switch y foco'
      )
      expect(normalizeSpanish('cupula geodesica con tridilosa')).toBe(
        'cupula geodesica con tridilosa'
      )
      expect(normalizeSpanish('aplana una plataforma a nivel +2m')).toBe(
        'aplanar una plataforma a nivel +2m'
      )
    })

    it('divide órdenes compuestas encadenadas por conectores y comas', () => {
      const parts = splitChainedInstructions(
        'crea terreno topográfico, aplana a +2m y pon cúpula geodésica'
      )
      expect(parts.length).toBeGreaterThanOrEqual(3)
      expect(parts[0]).toContain('terreno topografico')
      expect(parts[1]).toContain('aplanar')
      expect(parts[2]).toContain('cupula geodesica')
    })
  })

  describe('2. Regla de Seguridad Obligatoria: 2 Pasos (PROPUESTA -> CONFIRMACIÓN)', () => {
    it('NO modifica la escena al recibir una orden; entra en PENDING_CONFIRMATION', async () => {
      const wallsBefore = scene.getWalls().length
      const reply = await astro.processNaturalLanguage('agrega una segunda planta a la construcción')

      expect(reply.kind).toBe('preview')
      expect(reply.preview).toBeDefined()
      expect(astro.getState()).toBe('PENDING_CONFIRMATION')
      expect(astro.getPendingPlan()).not.toBeNull()

      // La escena debe permanecer idéntica antes de la confirmación
      expect(scene.getWalls().length).toBe(wallsBefore)
      expect(scene.getLevels().length).toBe(1)
    })

    it('cancela la propuesta cuando el usuario dice "no" o "cancelar", sin tocar la escena', async () => {
      await astro.processNaturalLanguage('agrega una segunda planta a la construcción')
      expect(astro.getState()).toBe('PENDING_CONFIRMATION')

      const reply = await astro.processNaturalLanguage('cancelar')
      expect(astro.getState()).toBe('IDLE')
      expect(astro.getPendingPlan()).toBeNull()
      expect(reply.mensaje).toContain('cancelada')
      expect(scene.getLevels().length).toBe(1)
    })

    it('ejecuta la propuesta SOLO cuando el usuario dice "sí" o "confirmar" y registra en Undo', async () => {
      // 1. Crear 4 muros en planta baja primero
      const lvl = scene.getActiveLevel()
      scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-4, lvl.elevation, -3), new THREE.Vector3(4, lvl.elevation, -3), true, lvl.id)
      scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(4, lvl.elevation, -3), new THREE.Vector3(4, lvl.elevation, 3), true, lvl.id)
      scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(4, lvl.elevation, 3), new THREE.Vector3(-4, lvl.elevation, 3), true, lvl.id)
      scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-4, lvl.elevation, 3), new THREE.Vector3(-4, lvl.elevation, -3), true, lvl.id)
      expect(scene.getWalls().length).toBe(4)

      // 2. Proponer segunda planta
      await astro.processNaturalLanguage('agrega una segunda planta a la construcción')
      expect(astro.getState()).toBe('PENDING_CONFIRMATION')

      // 3. Confirmar por texto
      const reply = await astro.processNaturalLanguage('sí')
      expect(astro.getState()).toBe('IDLE')
      expect(reply.mensaje).toContain('éxito')

      // Verificamos que se crearon los muros clonados en el nivel superior y la losa
      expect(scene.getLevels().length).toBe(2)
      expect(scene.getWalls().length).toBe(8)
      expect(scene.getObjects().length).toBeGreaterThanOrEqual(1) // Losa / escalera

      // Verificamos que se puede Deshacer (Undo) completamente
      expect(history.canUndo()).toBe(true)
      history.undo()
      expect(scene.getLevels().length).toBe(1)
      expect(scene.getWalls().length).toBe(4)
    })
  })

  describe('3. Instalaciones Eléctricas y Cableado (MEP)', () => {
    it('genera plan y cablea casa con centro de carga, switch, foco y tomacorrientes', async () => {
      await astro.processNaturalLanguage('cablea toda la casa con focos, switches, tomas y tablero')
      expect(astro.getState()).toBe('PENDING_CONFIRMATION')

      // Confirmar ejecución
      const exec = await astro.confirmAndExecute()
      expect(exec.ok).toBe(true)

      const devices = electricalModel.getDevices()
      const wires = electricalModel.getWires()

      expect(devices.some((d) => d.type === 'panel')).toBe(true)
      expect(devices.some((d) => d.type === 'groundRod')).toBe(true)
      expect(devices.some((d) => d.type === 'switch')).toBe(true)
      expect(devices.some((d) => d.type === 'luminaire')).toBe(true)
      expect(devices.some((d) => d.type === 'outlet')).toBe(true)

      expect(wires.some((w) => w.circuit === 'lighting')).toBe(true)
      expect(wires.some((w) => w.circuit === 'power')).toBe(true)
      expect(wires.some((w) => w.circuit === 'ground')).toBe(true)
    })

    it('ejecuta verificación diagnóstica de la instalación eléctrica', async () => {
      // Agregar un tablero y foco sin switch
      const lvl = scene.getActiveLevel()
      electricalModel.addDevice({ type: 'panel', label: 'Tablero', levelId: lvl.id, x: 0, z: 0, height: 1.5, rotationY: 0 })
      electricalModel.addDevice({ type: 'luminaire', label: 'Luz', levelId: lvl.id, x: 2, z: 2, height: 2.5, rotationY: 0 })

      await astro.processNaturalLanguage('verifica si la instalación eléctrica está bien o tiene errores')
      const exec = await astro.confirmAndExecute()
      expect(exec.ok).toBe(true)
    })
  })

  describe('4. Topografía, Niveles y Explanación (Grading Pad)', () => {
    it('genera terreno topográfico 3D y aplana plataforma calculando corte y relleno', async () => {
      await astro.processNaturalLanguage('genera un terreno topográfico')
      await astro.confirmAndExecute()

      expect(scene.getTerrains().length).toBe(1)
      const terrain = scene.getTerrains()[0]
      expect(terrain.terrainData).toBeDefined()

      // Aplanar plataforma de 15x15m a nivel +2.00m
      await astro.processNaturalLanguage('aplana una plataforma de 15x15 metros a nivel +2.00m en el centro')
      const exec = await astro.confirmAndExecute()
      expect(exec.ok).toBe(true)
    })
  })

  describe('5. Los 13 Sistemas Estructurales, Formas Curvas y Techos', () => {
    it('ubica cúpula geodésica paramétrica con radio personalizado', async () => {
      await astro.processNaturalLanguage('coloca una cúpula geodésica de 12 metros de radio')
      const plan = astro.getPendingPlan()
      expect(plan?.titulo).toContain('Estructural')

      await astro.confirmAndExecute()
      const geodesica = scene.getObjects().find((o) => o.shapeId === 'struct.geodesica')
      expect(geodesica).toBeDefined()
      expect(geodesica?.size.x).toBe(24) // 12m radio = 24m diametro
    })

    it('ubica malla espacial / tridilosa 3D y techo a cuatro aguas', async () => {
      await astro.processNaturalLanguage('pon una estructura tridilosa de 10x15 metros y ponle techo a cuatro aguas')
      await astro.confirmAndExecute()

      expect(scene.getObjects().some((o) => o.shapeId === 'struct.espacial')).toBe(true)
      expect(scene.getObjects().some((o) => o.shapeId === 'roof.hip')).toBe(true)
    })
  })

  describe('6. Edición Masiva y Materiales', () => {
    it('elimina muebles sin borrar muros', async () => {
      const lvl = scene.getActiveLevel()
      scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, lvl.elevation, 0), new THREE.Vector3(4, lvl.elevation, 0), true, lvl.id)
      const chair = new SceneObject('Silla', 'furniture')
      scene.addObject(chair)

      expect(scene.getObjects().filter((o) => o.kind === 'furniture').length).toBe(1)
      expect(scene.getWalls().length).toBe(1)

      await astro.processNaturalLanguage('borra todos los muebles')
      await astro.confirmAndExecute()

      expect(scene.getObjects().filter((o) => o.kind === 'furniture').length).toBe(0)
      expect(scene.getWalls().length).toBe(1)
    })
  })
})
