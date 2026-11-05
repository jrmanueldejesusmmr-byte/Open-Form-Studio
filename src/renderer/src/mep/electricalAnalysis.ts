import {
  CIRCUIT_SPECS,
  DEVICE_SPECS,
  type CircuitType,
  type ElectricalDevice,
  type ElectricalDeviceType,
  type ElectricalWire
} from './electricalTypes'

/**
 * Motor de análisis de la instalación (puro, sin Three.js ni DOM):
 *  - Propagación de energía para la simulación en vivo (interruptores, 3-way).
 *  - Detección de circuitos derivados desde el tablero.
 *  - Diagnóstico: huérfanos, falta de tierra, luminarias sin interruptor,
 *    sobrecarga, incompatibilidades de calibre/tensión.
 *  - Cuadro de cargas con breaker y calibre recomendados.
 *  - Presupuesto de materiales con metraje real 3D.
 */

/* ---------------- Grafo ---------------- */

interface Edge {
  wire: ElectricalWire
  other: string
}

function buildAdjacency(devices: readonly ElectricalDevice[], wires: readonly ElectricalWire[]): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>()
  for (const d of devices) adj.set(d.id, [])
  for (const w of wires) {
    if (!adj.has(w.from) || !adj.has(w.to)) continue
    adj.get(w.from)!.push({ wire: w, other: w.to })
    adj.get(w.to)!.push({ wire: w, other: w.from })
  }
  return adj
}

function isSwitch(type: ElectricalDeviceType): boolean {
  return type === 'switch' || type === 'switch3'
}

/* ---------------- Simulación de energía ---------------- */

export interface EnergyState {
  /** Dispositivos con tensión (incluye interruptores abiertos: tienen fase en la línea). */
  energized: Set<string>
  /** Tramos con corriente: id → dispositivo desde el que llega la energía. */
  liveWires: Map<string, string>
  /** Luminarias encendidas. */
  litLights: Set<string>
  /** Profundidad BFS (para animar el sentido del flujo). */
  depth: Map<string, number>
}

/**
 * Propaga la energía desde los tableros. Reglas:
 *  - Las líneas de tierra no conducen corriente de trabajo.
 *  - Un interruptor simple deja pasar si está en ON.
 *  - Dos conmutados (3-way) unidos por viajeros conducen si sus estados coinciden;
 *    un conmutado sin pareja se comporta como interruptor simple.
 *  - Cajas, tomas y luminarias permiten derivación (alimentación en cadena).
 */
export function computeEnergy(
  devices: readonly ElectricalDevice[],
  wires: readonly ElectricalWire[],
  options: { blocked?: ReadonlySet<string>; forceSwitchesOn?: boolean } = {}
): EnergyState {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const adj = buildAdjacency(devices, wires)
  const energized = new Set<string>()
  const liveWires = new Map<string, string>()
  const depth = new Map<string, number>()

  const hasThreeWayPartner = (id: string): boolean =>
    (adj.get(id) ?? []).some((e) => e.wire.circuit !== 'ground' && byId.get(e.other)?.type === 'switch3')

  const passes = (d: ElectricalDevice): boolean => {
    if (options.blocked?.has(d.id)) return false
    if (d.type === 'groundRod') return false
    if (d.type === 'switch') return options.forceSwitchesOn ? true : Boolean(d.on)
    if (d.type === 'switch3') return options.forceSwitchesOn || hasThreeWayPartner(d.id) ? true : Boolean(d.on)
    return true
  }

  const conducts = (w: ElectricalWire, u: ElectricalDevice, v: ElectricalDevice): boolean => {
    if (w.circuit === 'ground') return false
    if (!options.forceSwitchesOn && u.type === 'switch3' && v.type === 'switch3') return Boolean(u.on) === Boolean(v.on)
    return true
  }

  const queue: string[] = []
  for (const d of devices) {
    if (d.type === 'panel' && !options.blocked?.has(d.id)) {
      energized.add(d.id)
      depth.set(d.id, 0)
      queue.push(d.id)
    }
  }
  while (queue.length) {
    const uid = queue.shift()!
    const u = byId.get(uid)!
    if (!passes(u)) continue
    for (const { wire, other } of adj.get(uid) ?? []) {
      const v = byId.get(other)
      if (!v || !conducts(wire, u, v)) continue
      if (!liveWires.has(wire.id)) liveWires.set(wire.id, uid)
      if (!energized.has(other)) {
        energized.add(other)
        depth.set(other, (depth.get(uid) ?? 0) + 1)
        queue.push(other)
      }
    }
  }

  const litLights = new Set<string>()
  for (const id of energized) {
    const d = byId.get(id)
    if (d && DEVICE_SPECS[d.type].role === 'light') litLights.add(id)
  }
  return { energized, liveWires, litLights, depth }
}

/* ---------------- Circuitos y cuadro de cargas ---------------- */

export interface CircuitReport {
  id: string
  name: string
  type: CircuitType
  panelId: string
  deviceIds: string[]
  wireIds: string[]
  lights: number
  outlets: number
  outlets240: number
  watts: number
  volts: number
  amps: number
  breakerAmps: number
  poles: 1 | 2
  breakerLabel: string
  awg: string
  lengthM: number
  overloaded: boolean
  loadPercent: number
}

const STANDARD_BREAKERS = [15, 20, 30, 40, 50, 60, 70, 80, 100]
const MAIN_BREAKERS = [60, 70, 100, 125, 150, 200, 225, 400]
const AWG_BY_BREAKER: Record<number, string> = {
  15: '14',
  20: '12',
  30: '10',
  40: '8',
  50: '6',
  60: '6',
  70: '4',
  80: '4',
  100: '3'
}

export function recommendBreaker(type: CircuitType, watts: number): { amps: number; awg: string; poles: 1 | 2 } {
  const spec = CIRCUIT_SPECS[type]
  const amps = watts / spec.volts
  const design = amps * 1.25 // carga continua: 125 %
  const needed = Math.max(spec.minBreaker, design)
  const breaker = STANDARD_BREAKERS.find((b) => b >= needed) ?? STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1]
  return { amps: breaker, awg: AWG_BY_BREAKER[breaker] ?? spec.awg, poles: spec.poles }
}

export function detectCircuits(
  devices: readonly ElectricalDevice[],
  wires: readonly ElectricalWire[],
  lengths: ReadonlyMap<string, number> = new Map()
): CircuitReport[] {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const adj = buildAdjacency(devices, wires)
  const claimedWires = new Set<string>()
  const reports: CircuitReport[] = []

  for (const panel of devices.filter((d) => d.type === 'panel')) {
    for (const home of adj.get(panel.id) ?? []) {
      if (home.wire.circuit === 'ground' || claimedWires.has(home.wire.id)) continue
      const start = byId.get(home.other)
      if (!start || start.type === 'panel' || start.type === 'meter') continue

      const deviceIds = new Set<string>([start.id])
      const wireIds = new Set<string>([home.wire.id])
      claimedWires.add(home.wire.id)
      const queue = [start.id]
      while (queue.length) {
        const uid = queue.shift()!
        for (const { wire, other } of adj.get(uid) ?? []) {
          if (wire.circuit === 'ground') continue
          const v = byId.get(other)
          if (!v) continue
          if (v.type === 'panel' || v.type === 'meter') {
            // Una segunda llegada al tablero forma parte del mismo circuito (anillo).
            if (!claimedWires.has(wire.id)) {
              claimedWires.add(wire.id)
              wireIds.add(wire.id)
            }
            continue
          }
          if (!wireIds.has(wire.id)) {
            wireIds.add(wire.id)
            claimedWires.add(wire.id)
          }
          if (!deviceIds.has(other)) {
            deviceIds.add(other)
            queue.push(other)
          }
        }
      }

      const type = home.wire.circuit
      const spec = CIRCUIT_SPECS[type]
      let lights = 0
      let outlets = 0
      let outlets240 = 0
      let watts = 0
      for (const id of deviceIds) {
        const d = byId.get(id)!
        const ds = DEVICE_SPECS[d.type]
        if (ds.role === 'light') lights++
        if (ds.role === 'outlet') {
          if (d.type === 'outlet240') outlets240++
          else outlets++
        }
        watts += ds.watts
      }
      const rec = recommendBreaker(type, watts)
      const amps = watts / spec.volts
      const outletCount = lights + outlets + outlets240
      const loadPercent = rec.amps > 0 ? (amps / rec.amps) * 100 : 0
      const lengthM = [...wireIds].reduce((acc, id) => acc + (lengths.get(id) ?? 0), 0)
      reports.push({
        id: `C-${reports.length + 1}`,
        name: `C-${reports.length + 1} · ${spec.label}`,
        type,
        panelId: panel.id,
        deviceIds: [...deviceIds],
        wireIds: [...wireIds],
        lights,
        outlets,
        outlets240,
        watts,
        volts: spec.volts,
        amps,
        breakerAmps: rec.amps,
        poles: rec.poles,
        breakerLabel: `${rec.poles}x${rec.amps}A`,
        awg: rec.awg,
        lengthM,
        overloaded: outletCount > spec.maxOutlets || amps > rec.amps * 0.8,
        loadPercent
      })
    }
  }
  return reports
}

/* ---------------- Diagnóstico ---------------- */

export type IssueSeverity = 'error' | 'warning' | 'ok' | 'info'

export interface DiagnosticIssue {
  severity: IssueSeverity
  title: string
  detail: string
  deviceIds?: string[]
}

function deviceName(d: ElectricalDevice): string {
  return d.label?.trim() || DEVICE_SPECS[d.type].shortLabel
}

function reachesViaGround(startId: string, adj: Map<string, Edge[]>, byId: Map<string, ElectricalDevice>): boolean {
  const seen = new Set([startId])
  const queue = [startId]
  while (queue.length) {
    const uid = queue.shift()!
    if (byId.get(uid)?.type === 'groundRod') return true
    for (const { wire, other } of adj.get(uid) ?? []) {
      if (wire.circuit !== 'ground' || seen.has(other)) continue
      seen.add(other)
      queue.push(other)
    }
  }
  return false
}

export function diagnose(
  devices: readonly ElectricalDevice[],
  wires: readonly ElectricalWire[],
  circuits: readonly CircuitReport[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []
  const byId = new Map(devices.map((d) => [d.id, d]))
  const adj = buildAdjacency(devices, wires)
  const count = (t: ElectricalDeviceType): number => devices.filter((d) => d.type === t).length

  if (devices.length === 0) {
    issues.push({
      severity: 'info',
      title: 'Instalación vacía',
      detail: 'Coloca un tablero, interruptores, tomas y luminarias, y únelos con la herramienta de cableado [E].'
    })
    return issues
  }

  const panels = devices.filter((d) => d.type === 'panel')
  if (panels.length === 0) {
    issues.push({
      severity: 'error',
      title: 'Falta el Tablero / Centro de Carga',
      detail: 'Todos los circuitos deben nacer en un tablero con breakers. Sin él no hay origen de energía.'
    })
  }

  // Puesta a tierra del tablero.
  for (const p of panels) {
    if (!reachesViaGround(p.id, adj, byId)) {
      issues.push({
        severity: 'error',
        title: `${deviceName(p)} sin puesta a tierra física`,
        detail: 'Conecta el tablero a una varilla Copperweld con la «Línea de Tierra Física» (verde).',
        deviceIds: [p.id]
      })
    }
  }
  for (const rod of devices.filter((d) => d.type === 'groundRod')) {
    if ((adj.get(rod.id) ?? []).length === 0) {
      issues.push({
        severity: 'warning',
        title: 'Varilla de tierra sin conectar',
        detail: 'La varilla Copperweld no está unida a ningún tablero.',
        deviceIds: [rod.id]
      })
    }
  }

  // Acometida / medidor.
  const meters = devices.filter((d) => d.type === 'meter')
  if (meters.length === 0 && panels.length > 0) {
    issues.push({
      severity: 'warning',
      title: 'Sin medidor principal (acometida)',
      detail: 'Agrega el medidor en el exterior de la vivienda y conéctalo al tablero con el circuito especial 240V.'
    })
  }
  for (const m of meters) {
    const feedsPanel = (adj.get(m.id) ?? []).some((e) => e.wire.circuit !== 'ground' && byId.get(e.other)?.type === 'panel')
    if (!feedsPanel) {
      issues.push({
        severity: 'error',
        title: 'Medidor no alimenta al tablero',
        detail: 'Une el medidor con el tablero (alimentador principal 2 fases + neutro).',
        deviceIds: [m.id]
      })
    }
  }

  // Huérfanos.
  const inCircuit = new Set(circuits.flatMap((c) => c.deviceIds))
  const passive: ElectricalDeviceType[] = ['panel', 'meter', 'groundRod']
  const unconnected = devices.filter((d) => !passive.includes(d.type) && (adj.get(d.id) ?? []).length === 0)
  if (unconnected.length) {
    issues.push({
      severity: 'error',
      title: `${unconnected.length} elemento(s) huérfano(s) sin conectar`,
      detail: unconnected.map(deviceName).join(', '),
      deviceIds: unconnected.map((d) => d.id)
    })
  }
  const notToPanel = devices.filter(
    (d) => !passive.includes(d.type) && (adj.get(d.id) ?? []).length > 0 && !inCircuit.has(d.id)
  )
  if (notToPanel.length) {
    issues.push({
      severity: 'error',
      title: `${notToPanel.length} elemento(s) no llegan al centro de carga`,
      detail: `Tienen cableado pero ningún tramo regresa al tablero: ${notToPanel.map(deviceName).join(', ')}.`,
      deviceIds: notToPanel.map((d) => d.id)
    })
  }

  // Luminarias sin interruptor y interruptores sin carga.
  const allOn = computeEnergy(devices, wires, { forceSwitchesOn: true })
  const switches = devices.filter((d) => isSwitch(d.type))
  const unswitched = computeEnergy(devices, wires, {
    forceSwitchesOn: true,
    blocked: new Set(switches.map((s) => s.id))
  })
  const alwaysOn = [...allOn.litLights].filter((id) => unswitched.litLights.has(id)).map((id) => byId.get(id)!)
  if (alwaysOn.length) {
    issues.push({
      severity: 'warning',
      title: `${alwaysOn.length} luminaria(s) sin interruptor asignado`,
      detail: `Quedan encendidas siempre (fase directa): ${alwaysOn.map(deviceName).join(', ')}.`,
      deviceIds: alwaysOn.map((d) => d.id)
    })
  }
  for (const s of switches) {
    const without = computeEnergy(devices, wires, { forceSwitchesOn: true, blocked: new Set([s.id]) })
    const controls = [...allOn.litLights].filter((id) => !without.litLights.has(id))
    if (controls.length === 0 && allOn.energized.has(s.id)) {
      issues.push({
        severity: 'warning',
        title: `${deviceName(s)} no controla ninguna luminaria`,
        detail: 'Conecta el retorno del interruptor a una luminaria o aplique.',
        deviceIds: [s.id]
      })
    }
  }

  // Conmutados sin pareja.
  for (const c of circuits) {
    const threeWays = c.deviceIds.filter((id) => byId.get(id)?.type === 'switch3')
    if (threeWays.length === 1) {
      issues.push({
        severity: 'warning',
        title: `Conmutado 3-way sin pareja en ${c.id}`,
        detail: 'Un interruptor de escalera necesita otro conmutado unido con viajeros para controlar la luz desde dos puntos.',
        deviceIds: threeWays
      })
    }
  }

  // Compatibilidad calibre / tensión.
  for (const w of wires) {
    for (const id of [w.from, w.to]) {
      const d = byId.get(id)
      if (!d) continue
      if (d.type === 'outlet240' && w.circuit !== 'special' && w.circuit !== 'ground') {
        issues.push({
          severity: 'error',
          title: `${deviceName(d)} alimentado con circuito de 120V`,
          detail: 'Los tomacorrientes de 240V requieren circuito especial (2 fases, neutro y tierra, 10/8 AWG).',
          deviceIds: [d.id]
        })
      } else if ((d.type === 'outlet' || d.type === 'gfci') && w.circuit === 'lighting') {
        issues.push({
          severity: 'warning',
          title: `${deviceName(d)} en circuito de iluminación (14 AWG)`,
          detail: 'Los tomacorrientes deben ir en circuito de fuerza 12 AWG / 20A.',
          deviceIds: [d.id]
        })
      }
    }
  }
  for (const c of circuits) {
    if (c.type === 'special' && (c.lights > 0 || c.outlets > 0)) {
      issues.push({
        severity: 'warning',
        title: `${c.id}: circuito especial compartido`,
        detail: 'Los circuitos de 240V deben ser dedicados a un solo equipo (cocina, aire o secadora).',
        deviceIds: c.deviceIds
      })
    }
    if (c.overloaded) {
      const spec = CIRCUIT_SPECS[c.type]
      issues.push({
        severity: 'error',
        title: `Sobrecarga en ${c.id} (${c.breakerLabel})`,
        detail: `${c.lights + c.outlets + c.outlets240} salidas / ${c.watts} W (${c.amps.toFixed(1)} A, ${c.loadPercent.toFixed(0)} % del breaker). Máximo recomendado: ${spec.maxOutlets} salidas y 80 % de capacidad. Divide el circuito.`,
        deviceIds: c.deviceIds
      })
    }
  }

  if (count('outlet') + count('outlet240') > 0 && count('gfci') === 0) {
    issues.push({
      severity: 'warning',
      title: 'Sin tomacorrientes GFCI',
      detail: 'Baños, cocina, lavandería y exteriores requieren protección GFCI.'
    })
  }

  if (!issues.some((i) => i.severity === 'error' || i.severity === 'warning')) {
    issues.push({
      severity: 'ok',
      title: 'Instalación correcta',
      detail: 'Todas las salidas llegan al tablero, el tablero está aterrizado y no hay sobrecargas.'
    })
  }
  return issues
}

/* ---------------- Totales ---------------- */

export interface LoadSummary {
  totalWatts: number
  connectedWatts: number
  ampsAt120: number
  ampsAt240: number
  mainBreaker: number
}

export function summarizeLoads(devices: readonly ElectricalDevice[], circuits: readonly CircuitReport[]): LoadSummary {
  const totalWatts = devices.reduce((acc, d) => acc + DEVICE_SPECS[d.type].watts, 0)
  const connectedWatts = circuits.reduce((acc, c) => acc + c.watts, 0)
  const ampsAt240 = totalWatts / 240
  const mainBreaker = MAIN_BREAKERS.find((b) => b >= ampsAt240 * 1.25) ?? MAIN_BREAKERS[MAIN_BREAKERS.length - 1]
  return { totalWatts, connectedWatts, ampsAt120: totalWatts / 120, ampsAt240, mainBreaker }
}

/* ---------------- Presupuesto de materiales ---------------- */

export interface BomLine {
  group: 'Tubería' | 'Cable' | 'Dispositivos' | 'Cajas' | 'Protecciones' | 'Accesorios'
  item: string
  unit: 'm' | 'pza'
  qty: number
}

const WASTE = 1.1
const SLACK_PER_END = 0.3

export function buildBillOfMaterials(
  devices: readonly ElectricalDevice[],
  wires: readonly ElectricalWire[],
  routes: ReadonlyMap<string, { length: number; elbows: number }>,
  circuits: readonly CircuitReport[]
): BomLine[] {
  const lines: BomLine[] = []
  const wireById = new Map(wires.map((w) => [w.id, w]))

  // Tubería conduit por tipo de circuito.
  const conduitBy = new Map<CircuitType, number>()
  let elbows = 0
  for (const w of wires) {
    const r = routes.get(w.id)
    if (!r) continue
    conduitBy.set(w.circuit, (conduitBy.get(w.circuit) ?? 0) + r.length)
    elbows += r.elbows
  }
  for (const [type, len] of conduitBy) {
    lines.push({
      group: 'Tubería',
      item: type === 'ground' ? 'Tubo PVC 1/2" (tierra física)' : `Tubo conduit 1/2" — ${CIRCUIT_SPECS[type].label}`,
      unit: 'm',
      qty: len
    })
  }

  // Cable por calibre / color (usa el calibre recomendado del circuito si es mayor).
  const circuitAwg = new Map<string, string>()
  for (const c of circuits) for (const wid of c.wireIds) circuitAwg.set(wid, c.awg)
  const cableBy = new Map<string, number>()
  for (const [wid, r] of routes) {
    const w = wireById.get(wid)
    if (!w) continue
    const spec = CIRCUIT_SPECS[w.circuit]
    const awg = circuitAwg.get(wid) ?? spec.awg
    for (const cond of spec.conductors) {
      const key = `Cable THHN ${awg} AWG — ${cond.role} (${cond.color})`
      cableBy.set(key, (cableBy.get(key) ?? 0) + (r.length + SLACK_PER_END * 2) * WASTE)
    }
  }
  for (const [item, qty] of [...cableBy].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push({ group: 'Cable', item, unit: 'm', qty })
  }

  // Dispositivos.
  const counts = new Map<ElectricalDeviceType, number>()
  for (const d of devices) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  for (const [type, qty] of counts) {
    if (type === 'junction') continue
    lines.push({ group: 'Dispositivos', item: DEVICE_SPECS[type].label, unit: 'pza', qty })
  }

  // Cajas.
  const rectBoxes = devices.filter((d) =>
    ['switch', 'switch3', 'outlet', 'outlet240', 'gfci', 'sconce'].includes(d.type)
  ).length
  const octBoxes = devices.filter((d) => d.type === 'luminaire' || d.type === 'junction').length
  if (rectBoxes) lines.push({ group: 'Cajas', item: 'Caja rectangular 2"×4" (chalupa) empotrada', unit: 'pza', qty: rectBoxes })
  if (octBoxes) lines.push({ group: 'Cajas', item: 'Caja octagonal 4" (losa / registro)', unit: 'pza', qty: octBoxes })

  // Protecciones (breakers).
  const breakers = new Map<string, number>()
  for (const c of circuits) breakers.set(c.breakerLabel, (breakers.get(c.breakerLabel) ?? 0) + 1)
  for (const [label, qty] of breakers) {
    lines.push({ group: 'Protecciones', item: `Breaker termomagnético ${label}`, unit: 'pza', qty })
  }

  // Accesorios.
  const totalConduit = [...conduitBy.values()].reduce((a, b) => a + b, 0)
  if (elbows) lines.push({ group: 'Accesorios', item: 'Curva / codo conduit 90° 1/2"', unit: 'pza', qty: elbows })
  if (totalConduit > 0) {
    lines.push({ group: 'Accesorios', item: 'Abrazadera / grapa conduit (c/1.5 m)', unit: 'pza', qty: Math.ceil(totalConduit / 1.5) })
    lines.push({ group: 'Accesorios', item: 'Conector / cople conduit (c/3 m + extremos)', unit: 'pza', qty: Math.ceil(totalConduit / 3) + wires.length * 2 })
  }
  if (counts.get('groundRod')) {
    lines.push({ group: 'Accesorios', item: 'Conector de varilla (abrazadera de bronce)', unit: 'pza', qty: counts.get('groundRod')! })
  }
  return lines
}

