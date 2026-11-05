import { describe, it, expect } from 'vitest'
import { ElectricalModel } from './ElectricalModel'
import {
  routeBetween,
  polylineLength,
  elbowCount,
  runHeightFor
} from './electricalRouting'
import {
  computeEnergy,
  detectCircuits,
  diagnose,
  summarizeLoads,
  buildBillOfMaterials,
  recommendBreaker
} from './electricalAnalysis'
import {
  CIRCUIT_SPECS,
  DEVICE_SPECS,
  type ElectricalDevice,
  type ElectricalWire
} from './electricalTypes'

describe('MEP — Módulo de Instalación Eléctrica Residencial', () => {
  const ctx = {
    levelElevation: () => 0,
    levelHeight: () => 2.8
  }

  it('permite registrar y manipular dispositivos y tramos de cableado en el modelo', () => {
    const model = new ElectricalModel()
    expect(model.isEmpty()).toBe(true)

    const panel = model.addDevice({
      type: 'panel',
      levelId: 'level-0',
      x: 2,
      z: 2,
      height: 1.6,
      rotationY: 0
    })

    const switchDev = model.addDevice({
      type: 'switch',
      levelId: 'level-0',
      x: 4,
      z: 2,
      height: 1.2,
      rotationY: 0
    })

    const light = model.addDevice({
      type: 'luminaire',
      levelId: 'level-0',
      x: 4,
      z: 4,
      height: 2.5,
      rotationY: 0
    })

    expect(model.getDevices().length).toBe(3)

    const wire1 = model.addWire(panel.id, switchDev.id, 'lighting')
    const wire2 = model.addWire(switchDev.id, light.id, 'lighting')

    expect(wire1).not.toBeNull()
    expect(wire2).not.toBeNull()
    expect(model.getWires().length).toBe(2)

    // Previene cables duplicados entre los mismos nodos
    const duplicate = model.addWire(switchDev.id, panel.id, 'lighting')
    expect(duplicate).toBeNull()

    // Conmutación de interruptores
    expect(switchDev.on).toBe(false)
    model.toggleSwitch(switchDev.id)
    expect(model.getDevice(switchDev.id)?.on).toBe(true)

    // Deshacer
    expect(model.canUndo()).toBe(true)
    model.undo()
    // El último cable debe haber sido deshecho
    expect(model.getWires().length).toBe(1)
  })

  it('calcula el recorrido ortogonal 3D con subidas y bajadas por los muros', () => {
    const devA: ElectricalDevice = {
      id: 'd1',
      type: 'switch',
      levelId: 'level-0',
      x: 1,
      z: 2,
      height: 1.2,
      rotationY: 0,
      anchorX: 1,
      anchorZ: 2
    }

    const devB: ElectricalDevice = {
      id: 'd2',
      type: 'luminaire',
      levelId: 'level-0',
      x: 3,
      z: 5,
      height: 2.5,
      rotationY: 0,
      anchorX: 3,
      anchorZ: 5
    }

    const pts = routeBetween(devA, devB, ctx)
    expect(pts.length).toBeGreaterThanOrEqual(4)

    // El primer punto debe estar a la altura del switch (1.2m)
    expect(pts[0].y).toBeCloseTo(1.2, 2)
    // El último punto debe estar a la altura de la luminaria (2.5m)
    expect(pts[pts.length - 1].y).toBeCloseTo(2.5, 2)

    // Los puntos intermedios viajan por la losa/cielo a 2.40m
    const ceilingY = runHeightFor(devA, devB, ctx)
    expect(ceilingY).toBeCloseTo(2.4, 2)

    const len = polylineLength(pts)
    expect(len).toBeGreaterThan(0)
    // La longitud ortogonal con subidas y bajadas debe ser estrictamente mayor que la distancia euclidiana en diagonal
    const directDist = Math.hypot(devB.x - devA.x, devB.height - devA.height, devB.z - devA.z)
    expect(len).toBeGreaterThan(directDist)

    const elbows = elbowCount(pts)
    expect(elbows).toBeGreaterThanOrEqual(2)
  })

  it('simula el flujo de energía y el encendido de luminarias en tiempo real', () => {
    const panel: ElectricalDevice = {
      id: 'panel-1',
      type: 'panel',
      levelId: 'level-0',
      x: 0,
      z: 0,
      height: 1.6,
      rotationY: 0
    }

    const sw: ElectricalDevice = {
      id: 'sw-1',
      type: 'switch',
      levelId: 'level-0',
      x: 2,
      z: 0,
      height: 1.2,
      rotationY: 0,
      on: false
    }

    const lum: ElectricalDevice = {
      id: 'lum-1',
      type: 'luminaire',
      levelId: 'level-0',
      x: 2,
      z: 2,
      height: 2.5,
      rotationY: 0
    }

    const wires: ElectricalWire[] = [
      { id: 'w1', circuit: 'lighting', from: 'panel-1', to: 'sw-1' },
      { id: 'w2', circuit: 'lighting', from: 'sw-1', to: 'lum-1' }
    ]

    // Switch en OFF: el switch está energizado en la entrada pero la luminaria está apagada
    const energyOff = computeEnergy([panel, sw, lum], wires)
    expect(energyOff.energized.has('panel-1')).toBe(true)
    expect(energyOff.energized.has('sw-1')).toBe(true)
    expect(energyOff.litLights.has('lum-1')).toBe(false)
    expect(energyOff.liveWires.has('w1')).toBe(true)
    expect(energyOff.liveWires.has('w2')).toBe(false)

    // Switch en ON: la energía fluye y enciende la luminaria
    sw.on = true
    const energyOn = computeEnergy([panel, sw, lum], wires)
    expect(energyOn.litLights.has('lum-1')).toBe(true)
    expect(energyOn.liveWires.has('w2')).toBe(true)
  })

  it('diagnostica huérfanos, tablero sin tierra y sobrecarga en circuitos', () => {
    const panel: ElectricalDevice = {
      id: 'p1',
      type: 'panel',
      levelId: 'level-0',
      x: 0,
      z: 0,
      height: 1.6,
      rotationY: 0
    }

    const orphanOutlet: ElectricalDevice = {
      id: 'out-orphan',
      type: 'outlet',
      levelId: 'level-0',
      x: 5,
      z: 5,
      height: 0.4,
      rotationY: 0
    }

    // 15 luminarias en un mismo circuito (sobrecarga > 12 salidas)
    const lights: ElectricalDevice[] = []
    const wires: ElectricalWire[] = []
    let prevId = 'p1'
    for (let i = 1; i <= 15; i++) {
      const lid = `l-${i}`
      lights.push({
        id: lid,
        type: 'luminaire',
        levelId: 'level-0',
        x: i,
        z: 1,
        height: 2.5,
        rotationY: 0
      })
      wires.push({
        id: `w-${i}`,
        circuit: 'lighting',
        from: prevId,
        to: lid
      })
      prevId = lid
    }

    const allDevices = [panel, orphanOutlet, ...lights]
    const circuits = detectCircuits(allDevices, wires)
    const issues = diagnose(allDevices, wires, circuits)

    // Alerta de falta de tierra en el tablero
    expect(issues.some((i) => i.title.includes('sin puesta a tierra física'))).toBe(true)

    // Alerta de elemento huérfano
    expect(issues.some((i) => i.title.includes('huérfano'))).toBe(true)

    // Alerta de sobrecarga
    expect(issues.some((i) => i.title.includes('Sobrecarga'))).toBe(true)
  })

  it('recomienda breakers adecuados y genera el metraje y cómputo de materiales', () => {
    const rec15 = recommendBreaker('lighting', 1200)
    expect(rec15.amps).toBe(15)
    expect(rec15.awg).toBe('14')

    const recSpecial = recommendBreaker('special', 4500)
    expect(recSpecial.amps).toBeGreaterThanOrEqual(30)
    expect(recSpecial.poles).toBe(2)

    const devices: ElectricalDevice[] = [
      { id: 'p', type: 'panel', levelId: 'level-0', x: 0, z: 0, height: 1.6, rotationY: 0 },
      { id: 'o1', type: 'outlet', levelId: 'level-0', x: 2, z: 0, height: 0.4, rotationY: 0 },
      { id: 'o2', type: 'outlet', levelId: 'level-0', x: 4, z: 0, height: 0.4, rotationY: 0 }
    ]

    const wires: ElectricalWire[] = [
      { id: 'w1', circuit: 'power', from: 'p', to: 'o1' },
      { id: 'w2', circuit: 'power', from: 'o1', to: 'o2' }
    ]

    const routes = new Map([
      ['w1', { length: 3.5, elbows: 3 }],
      ['w2', { length: 2.8, elbows: 2 }]
    ])

    const circuits = detectCircuits(devices, wires, new Map([['w1', 3.5], ['w2', 2.8]]))
    const summary = summarizeLoads(devices, circuits)
    expect(summary.totalWatts).toBe(360) // 180W * 2 tomas

    const bom = buildBillOfMaterials(devices, wires, routes, circuits)
    expect(bom.length).toBeGreaterThan(0)
    expect(bom.some((b) => b.group === 'Tubería')).toBe(true)
    expect(bom.some((b) => b.group === 'Cable')).toBe(true)
    expect(bom.some((b) => b.group === 'Cajas')).toBe(true)
    expect(bom.some((b) => b.group === 'Protecciones')).toBe(true)
  })
})

