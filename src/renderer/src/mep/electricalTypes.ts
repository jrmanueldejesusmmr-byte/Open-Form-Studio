/**
 * Módulo MEP — Instalación Eléctrica Residencial.
 *
 * Tipos de datos puros (sin Three.js) del sistema de cableado: catálogo de
 * dispositivos con su altura de montaje real, tipos de circuito con su
 * calibre/color/conductores, y las estructuras serializables que se guardan
 * con el proyecto. Toda la geometría 3D y la simbología 2D se derivan de
 * estos datos (fuente única de verdad compartida entre planta y visor 3D).
 */

/** Tipos de dispositivo eléctrico (nodos del grafo de la instalación). */
export type ElectricalDeviceType =
  | 'panel'
  | 'junction'
  | 'switch'
  | 'switch3'
  | 'outlet'
  | 'outlet240'
  | 'gfci'
  | 'luminaire'
  | 'sconce'
  | 'groundRod'
  | 'meter'

/** Dónde se monta el dispositivo: imán a muro, techo/losa o libre (exterior). */
export type MountKind = 'wall' | 'ceiling' | 'free'

/** Familia funcional, usada por el diagnóstico y el cuadro de cargas. */
export type DeviceRole = 'source' | 'box' | 'switch' | 'outlet' | 'light' | 'ground' | 'service'

export interface DeviceSpec {
  type: ElectricalDeviceType
  label: string
  shortLabel: string
  /** Altura por defecto del eje del dispositivo sobre el piso (m). */
  defaultHeight: number
  mount: MountKind
  role: DeviceRole
  /** Potencia de cálculo por salida (W). 0 = no es carga. */
  watts: number
  /** Tensión nominal de la salida (V). */
  volts: 120 | 240
  /** Circuito recomendado para alimentarlo. */
  preferredCircuit: CircuitType
  /** Miniatura SVG (viewBox 0 0 48 48) para el panel izquierdo. */
  preview: string
}

/** Tipos de circuito / cableado trazable con la herramienta [E]. */
export type CircuitType = 'lighting' | 'power' | 'special' | 'ground'

export interface CircuitSpec {
  type: CircuitType
  label: string
  shortLabel: string
  /** Calibre por defecto (AWG). */
  awg: string
  /** Conductores dentro de la tubería (para el metraje de cable). */
  conductors: Array<{ role: string; color: string }>
  /** Color del cable / tubería en planta y en 3D. */
  color: number
  cssColor: string
  volts: 120 | 240
  /** Breaker mínimo de diseño (A) y número de polos. */
  minBreaker: number
  poles: 1 | 2
  /** Máximo recomendado de salidas por circuito (sobrecarga). */
  maxOutlets: number
}

export const CIRCUIT_SPECS: Readonly<Record<CircuitType, CircuitSpec>> = {
  lighting: {
    type: 'lighting',
    label: 'Circuito de Iluminación',
    shortLabel: 'Iluminación 14 AWG',
    awg: '14',
    conductors: [
      { role: 'Fase', color: 'Negro' },
      { role: 'Neutro', color: 'Blanco' },
      { role: 'Retorno', color: 'Rojo' }
    ],
    color: 0xf59e0b,
    cssColor: '#f59e0b',
    volts: 120,
    minBreaker: 15,
    poles: 1,
    maxOutlets: 12
  },
  power: {
    type: 'power',
    label: 'Circuito de Fuerza / Tomacorrientes',
    shortLabel: 'Tomas 12 AWG',
    awg: '12',
    conductors: [
      { role: 'Fase', color: 'Negro' },
      { role: 'Neutro', color: 'Blanco' },
      { role: 'Tierra', color: 'Verde' }
    ],
    color: 0x06b6d4,
    cssColor: '#06b6d4',
    volts: 120,
    minBreaker: 20,
    poles: 1,
    maxOutlets: 10
  },
  special: {
    type: 'special',
    label: 'Circuito Especial 240V',
    shortLabel: 'Especial 240V 10 AWG',
    awg: '10',
    conductors: [
      { role: 'Fase L1', color: 'Negro' },
      { role: 'Fase L2', color: 'Rojo' },
      { role: 'Neutro', color: 'Blanco' },
      { role: 'Tierra', color: 'Verde' }
    ],
    color: 0xe11d74,
    cssColor: '#e11d74',
    volts: 240,
    minBreaker: 30,
    poles: 2,
    maxOutlets: 1
  },
  ground: {
    type: 'ground',
    label: 'Línea de Tierra Física',
    shortLabel: 'Tierra desnudo/verde',
    awg: '8',
    conductors: [{ role: 'Tierra física', color: 'Desnudo/Verde' }],
    color: 0x22c55e,
    cssColor: '#22c55e',
    volts: 120,
    minBreaker: 0,
    poles: 1,
    maxOutlets: Number.POSITIVE_INFINITY
  }
}

export const CIRCUIT_ORDER: readonly CircuitType[] = ['lighting', 'power', 'special', 'ground']

export const DEVICE_SPECS: Readonly<Record<ElectricalDeviceType, DeviceSpec>> = {
  panel: {
    type: 'panel',
    label: 'Tablero / Centro de Carga',
    shortLabel: 'Tablero',
    defaultHeight: 1.6,
    mount: 'wall',
    role: 'source',
    watts: 0,
    volts: 240,
    preferredCircuit: 'power',
    preview:
      '<rect x="12" y="6" width="24" height="36" rx="2"/><path d="M12 6l24 36M18 6l18 27M12 15l18 27M24 6l12 18M12 24l12 18"/>'
  },
  junction: {
    type: 'junction',
    label: 'Caja de Registro / Octagonal',
    shortLabel: 'Caja registro',
    defaultHeight: 2.4,
    mount: 'ceiling',
    role: 'box',
    watts: 0,
    volts: 120,
    preferredCircuit: 'lighting',
    preview: '<polygon points="18,8 30,8 40,18 40,30 30,40 18,40 8,30 8,18"/><circle cx="24" cy="24" r="4"/>'
  },
  switch: {
    type: 'switch',
    label: 'Interruptor Simple (1 vía)',
    shortLabel: 'Interruptor',
    defaultHeight: 1.2,
    mount: 'wall',
    role: 'switch',
    watts: 0,
    volts: 120,
    preferredCircuit: 'lighting',
    preview: '<circle cx="24" cy="24" r="14"/><path d="M28 18c-2-2-9-2-9 2s9 3 9 7-7 4-9 2"/>'
  },
  switch3: {
    type: 'switch3',
    label: 'Interruptor Conmutado (3-Way / Escalera)',
    shortLabel: 'Conmutado 3W',
    defaultHeight: 1.2,
    mount: 'wall',
    role: 'switch',
    watts: 0,
    volts: 120,
    preferredCircuit: 'lighting',
    preview:
      '<circle cx="24" cy="24" r="14"/><path d="M24 18c-2-2-8-2-8 2s8 3 8 7-6 4-8 2"/><path d="M28 18h5l-3 4c3 0 3 7-2 6"/>'
  },
  outlet: {
    type: 'outlet',
    label: 'Tomacorriente Doble 120V (NEMA 5-15R)',
    shortLabel: 'Toma 120V',
    defaultHeight: 0.4,
    mount: 'wall',
    role: 'outlet',
    watts: 180,
    volts: 120,
    preferredCircuit: 'power',
    preview: '<circle cx="24" cy="26" r="12"/><path d="M6 20h6M6 32h6M36 26h8"/><path d="M20 22v4M28 22v4M24 30v2"/>'
  },
  outlet240: {
    type: 'outlet240',
    label: 'Tomacorriente 240V (Cocina / Aire / Secadora)',
    shortLabel: 'Toma 240V',
    defaultHeight: 0.4,
    mount: 'wall',
    role: 'outlet',
    watts: 3000,
    volts: 240,
    preferredCircuit: 'special',
    preview:
      '<circle cx="24" cy="26" r="12"/><path d="M12 26h-6M36 26h6"/><path d="M19 21l3 4M29 21l-3 4M24 30v3"/><path d="M18 26l12 0" stroke-dasharray="2 2"/>'
  },
  gfci: {
    type: 'gfci',
    label: 'Tomacorriente GFCI (Baños / Cocina)',
    shortLabel: 'Toma GFCI',
    defaultHeight: 0.4,
    mount: 'wall',
    role: 'outlet',
    watts: 180,
    volts: 120,
    preferredCircuit: 'power',
    preview:
      '<rect x="12" y="12" width="24" height="28" rx="3"/><path d="M19 18v4M29 18v4"/><rect x="18" y="26" width="12" height="4" rx="1"/><path d="M19 34v3M29 34v3"/>'
  },
  luminaire: {
    type: 'luminaire',
    label: 'Luminaria de Techo (Foco LED / Plafón)',
    shortLabel: 'Luminaria',
    defaultHeight: 2.5,
    mount: 'ceiling',
    role: 'light',
    watts: 100,
    volts: 120,
    preferredCircuit: 'lighting',
    preview: '<circle cx="24" cy="24" r="14"/><path d="M14 14l20 20M34 14 14 34"/>'
  },
  sconce: {
    type: 'sconce',
    label: 'Aplique de Pared',
    shortLabel: 'Aplique',
    defaultHeight: 2.2,
    mount: 'wall',
    role: 'light',
    watts: 100,
    volts: 120,
    preferredCircuit: 'lighting',
    preview: '<path d="M10 10v28"/><path d="M10 24h6"/><circle cx="26" cy="24" r="10"/><path d="M19 17l14 14M33 17 19 31"/>'
  },
  groundRod: {
    type: 'groundRod',
    label: 'Puesta a Tierra (Varilla Copperweld)',
    shortLabel: 'Varilla tierra',
    defaultHeight: 0,
    mount: 'free',
    role: 'ground',
    watts: 0,
    volts: 120,
    preferredCircuit: 'ground',
    preview: '<path d="M24 6v24"/><path d="M12 30h24M16 35h16M20 40h8"/>'
  },
  meter: {
    type: 'meter',
    label: 'Medidor Principal (Acometida)',
    shortLabel: 'Medidor',
    defaultHeight: 1.5,
    mount: 'wall',
    role: 'service',
    watts: 0,
    volts: 240,
    preferredCircuit: 'special',
    preview: '<circle cx="24" cy="24" r="15"/><text x="24" y="29" font-size="14" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">M</text>'
  }
}

export const DEVICE_ORDER: readonly ElectricalDeviceType[] = [
  'panel',
  'junction',
  'switch',
  'switch3',
  'outlet',
  'outlet240',
  'gfci',
  'luminaire',
  'sconce',
  'groundRod',
  'meter'
]

export function isElectricalDeviceType(value: unknown): value is ElectricalDeviceType {
  return typeof value === 'string' && value in DEVICE_SPECS
}

export function isCircuitType(value: unknown): value is CircuitType {
  return typeof value === 'string' && value in CIRCUIT_SPECS
}

/** Dispositivo colocado en el proyecto. Coordenadas en metros (mundo). */
export interface ElectricalDevice {
  id: string
  type: ElectricalDeviceType
  levelId: string
  /** Posición en planta de la cara visible del dispositivo. */
  x: number
  z: number
  /** Altura de montaje sobre el piso del nivel (m). */
  height: number
  /** Orientación (rad, eje Y): la placa mira hacia +Z local girado. */
  rotationY: number
  /** Muro al que está adosado (imán), si lo hay. */
  wallId?: string | null
  /** Punto del eje del muro (dentro de la pared) por donde sube la tubería. */
  anchorX?: number
  anchorZ?: number
  /** Estado del interruptor (solo switch / switch3). */
  on?: boolean
  /** Etiqueta opcional (p. ej. «Cocina»). */
  label?: string
}

/** Tramo de cableado/tubería entre dos dispositivos. */
export interface ElectricalWire {
  id: string
  circuit: CircuitType
  from: string
  to: string
}

export interface ElectricalDoc {
  version: 1
  devices: ElectricalDevice[]
  wires: ElectricalWire[]
}

/** Alturas de referencia de la instalación (relativas al piso del nivel). */
export const CEILING_RUN_HEIGHT = 2.4
export const UNDERGROUND_RUN_DEPTH = -0.3
/** Altura alternativa de tomacorrientes sobre mesón de cocina/baño. */
export const COUNTER_OUTLET_HEIGHT = 1.1

