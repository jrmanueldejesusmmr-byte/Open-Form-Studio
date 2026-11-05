import {
  isCircuitType,
  isElectricalDeviceType,
  type CircuitType,
  type ElectricalDevice,
  type ElectricalDoc,
  type ElectricalWire
} from './electricalTypes'

/**
 * Almacén de la instalación eléctrica: dispositivos (nodos) + tramos de
 * cableado (aristas). Notifica cambios a los oyentes (renderer 2D/3D, panel
 * izquierdo, diagnóstico) y mantiene su propia pila de deshacer, porque la
 * instalación vive en paralelo a la escena arquitectónica.
 */
export type ElectricalChangeReason = 'structure' | 'state'

type Listener = (reason: ElectricalChangeReason) => void

let serial = 1
function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(serial++).toString(36)}`
}

const MAX_UNDO = 80

export class ElectricalModel {
  private devices = new Map<string, ElectricalDevice>()
  private wires = new Map<string, ElectricalWire>()
  private readonly listeners = new Set<Listener>()
  private readonly undoStack: string[] = []

  onChange(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(reason: ElectricalChangeReason): void {
    for (const fn of this.listeners) fn(reason)
  }

  private checkpoint(): void {
    this.undoStack.push(JSON.stringify(this.toJSON()))
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift()
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  undo(): boolean {
    const raw = this.undoStack.pop()
    if (!raw) return false
    this.load(JSON.parse(raw) as ElectricalDoc, false)
    return true
  }

  getDevices(): ElectricalDevice[] {
    return [...this.devices.values()]
  }

  getWires(): ElectricalWire[] {
    return [...this.wires.values()]
  }

  getDevice(id: string): ElectricalDevice | undefined {
    return this.devices.get(id)
  }

  getWire(id: string): ElectricalWire | undefined {
    return this.wires.get(id)
  }

  isEmpty(): boolean {
    return this.devices.size === 0
  }

  addDevice(device: Omit<ElectricalDevice, 'id'>): ElectricalDevice {
    this.checkpoint()
    const created: ElectricalDevice = { ...device, id: makeId('elec') }
    if (created.type === 'switch' || created.type === 'switch3') created.on ??= false
    this.devices.set(created.id, created)
    this.emit('structure')
    return created
  }

  /** Conecta dos dispositivos. Devuelve `null` si es el mismo nodo o el tramo ya existe. */
  addWire(from: string, to: string, circuit: CircuitType): ElectricalWire | null {
    if (from === to || !this.devices.has(from) || !this.devices.has(to)) return null
    const duplicate = [...this.wires.values()].some(
      (w) => w.circuit === circuit && ((w.from === from && w.to === to) || (w.from === to && w.to === from))
    )
    if (duplicate) return null
    this.checkpoint()
    const wire: ElectricalWire = { id: makeId('wire'), circuit, from, to }
    this.wires.set(wire.id, wire)
    this.emit('structure')
    return wire
  }

  /** Borra un dispositivo y todos los tramos que llegan a él. */
  removeDevice(id: string): boolean {
    if (!this.devices.has(id)) return false
    this.checkpoint()
    this.devices.delete(id)
    for (const [wid, w] of this.wires) if (w.from === id || w.to === id) this.wires.delete(wid)
    this.emit('structure')
    return true
  }

  removeWire(id: string): boolean {
    if (!this.wires.has(id)) return false
    this.checkpoint()
    this.wires.delete(id)
    this.emit('structure')
    return true
  }

  /** Conmuta un interruptor (no se apila en deshacer: es estado de simulación). */
  toggleSwitch(id: string): boolean | null {
    const device = this.devices.get(id)
    if (!device || (device.type !== 'switch' && device.type !== 'switch3')) return null
    device.on = !device.on
    this.emit('state')
    return device.on
  }

  clear(recordUndo = true): void {
    if (this.devices.size === 0 && this.wires.size === 0) return
    if (recordUndo) this.checkpoint()
    this.devices.clear()
    this.wires.clear()
    this.emit('structure')
  }

  toJSON(): ElectricalDoc {
    return {
      version: 1,
      devices: this.getDevices().map((d) => ({ ...d })),
      wires: this.getWires().map((w) => ({ ...w }))
    }
  }

  /** Carga un documento (tolerante a datos corruptos o de versiones previas). */
  load(doc: unknown, resetUndo = true): void {
    this.devices.clear()
    this.wires.clear()
    if (resetUndo) this.undoStack.length = 0
    const raw = (doc && typeof doc === 'object' ? doc : {}) as Partial<ElectricalDoc>
    for (const d of Array.isArray(raw.devices) ? raw.devices : []) {
      if (!d || typeof d.id !== 'string' || !isElectricalDeviceType(d.type)) continue
      if (![d.x, d.z, d.height, d.rotationY].every((n) => typeof n === 'number' && Number.isFinite(n))) continue
      this.devices.set(d.id, { ...d, levelId: typeof d.levelId === 'string' ? d.levelId : 'level-0' })
    }
    for (const w of Array.isArray(raw.wires) ? raw.wires : []) {
      if (!w || typeof w.id !== 'string' || !isCircuitType(w.circuit)) continue
      if (!this.devices.has(w.from) || !this.devices.has(w.to)) continue
      this.wires.set(w.id, { ...w })
    }
    this.emit('structure')
  }
}

