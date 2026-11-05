import * as THREE from 'three'
import {
  DEVICE_SPECS,
  type CircuitType,
  type ElectricalDevice,
  type ElectricalDeviceType
} from './electricalTypes'
import type { ElectricalModel } from './ElectricalModel'
import type { ElectricalRenderer3D } from './ElectricalRenderer3D'
import type { SceneManager } from '../engine/SceneManager'
import type { ViewportRenderer } from '../engine/ViewportRenderer'
import type { Wall } from '../models/Wall'

export interface ElectricalToolOptions {
  canvas: HTMLCanvasElement
  model: ElectricalModel
  renderer: ElectricalRenderer3D
  scene: SceneManager
  viewport: ViewportRenderer
  onMessage: (msg: string) => void
  onToolChange?: (tool: string | null) => void
}

export class ElectricalToolController {
  private activeDeviceType: ElectricalDeviceType | null = null
  private wiringActive = false
  private activeCircuit: CircuitType = 'lighting'
  private wireSourceDeviceId: string | null = null

  private readonly canvas: HTMLCanvasElement
  private readonly model: ElectricalModel
  private readonly renderer: ElectricalRenderer3D
  private readonly scene: SceneManager
  private readonly viewport: ViewportRenderer
  private readonly onMessage: (msg: string) => void
  private readonly onToolChange?: (tool: string | null) => void

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2()

  constructor(options: ElectricalToolOptions) {
    this.canvas = options.canvas
    this.model = options.model
    this.renderer = options.renderer
    this.scene = options.scene
    this.viewport = options.viewport
    this.onMessage = options.onMessage
    this.onToolChange = options.onToolChange

    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this)

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('keydown', this.onKeyDown)
  }

  public setDevicePlacement(type: ElectricalDeviceType | null): void {
    this.activeDeviceType = type
    this.wiringActive = false
    this.wireSourceDeviceId = null
    this.viewport.clearToolPreview()

    if (type) {
      const spec = DEVICE_SPECS[type]
      this.onMessage(`Colocar ${spec.label}: haz clic en muro o techo (imán automático). Esc cancela.`)
      this.onToolChange?.(`place.${type}`)
    } else {
      this.onToolChange?.(null)
    }
  }

  public setWiringMode(active: boolean, circuit?: CircuitType): void {
    this.wiringActive = active
    this.activeDeviceType = null
    this.wireSourceDeviceId = null
    this.viewport.clearToolPreview()
    if (circuit) this.activeCircuit = circuit

    if (active) {
      this.onMessage(`Trazar cableado [E]: clic en elemento origen y luego en elemento destino.`)
      this.onToolChange?.('wire')
    } else {
      this.onToolChange?.(null)
    }
  }

  public isWiringActive(): boolean {
    return this.wiringActive
  }

  public setCircuit(circuit: CircuitType): void {
    this.activeCircuit = circuit
  }

  public getCircuit(): CircuitType {
    return this.activeCircuit
  }

  public isActive(): boolean {
    return this.activeDeviceType !== null || this.wiringActive
  }

  public cancel(): void {
    this.activeDeviceType = null
    this.wiringActive = false
    this.wireSourceDeviceId = null
    this.viewport.clearToolPreview()
    this.onToolChange?.(null)
  }

  private pickElectricalDevice(clientX: number, clientY: number): ElectricalDevice | null {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null

    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )

    const camera = (this.viewport as unknown as { activeCamera: THREE.Camera }).activeCamera
    if (!camera) return null

    this.raycaster.setFromCamera(this.pointerNdc, camera)
    const deviceRoot = this.renderer.getRoot().children[0]
    const intersects = this.raycaster.intersectObjects(deviceRoot.children, true)

    for (const hit of intersects) {
      let cur: THREE.Object3D | null = hit.object
      while (cur) {
        if (cur.userData && cur.userData.electricalDeviceId) {
          const dev = this.model.getDevice(cur.userData.electricalDeviceId)
          if (dev) return dev
        }
        cur = cur.parent
      }
    }

    // Proximidad en 2D al plano
    const groundHit = this.viewport.pointerToGround(clientX, clientY)
    if (groundHit) {
      for (const dev of this.model.getDevices()) {
        const dist = Math.hypot(dev.x - groundHit.x, dev.z - groundHit.z)
        if (dist < 0.45) return dev
      }
    }
    return null
  }

  private snapToWall(point: THREE.Vector3): {
    wall: Wall | null
    snappedPos: { x: number; z: number }
    rotationY: number
    anchor: { x: number; z: number }
  } {
    const walls = this.scene.getWalls()
    let closestWall: Wall | null = null
    let minDist = 1.2
    let bestProj = { x: point.x, z: point.z }
    let bestAnchor = { x: point.x, z: point.z }
    let bestAngle = 0

    for (const wall of walls) {
      const sx = wall.start.x
      const sz = wall.start.z
      const ex = wall.end.x
      const ez = wall.end.z
      const dx = ex - sx
      const dz = ez - sz
      const lenSq = dx * dx + dz * dz
      if (lenSq < 0.0001) continue

      const t = Math.max(0, Math.min(1, ((point.x - sx) * dx + (point.z - sz) * dz) / lenSq))
      const projX = sx + t * dx
      const projZ = sz + t * dz
      const dist = Math.hypot(point.x - projX, point.z - projZ)

      if (dist < minDist) {
        minDist = dist
        closestWall = wall
        const wallLen = Math.sqrt(lenSq)
        const nx = -dz / wallLen
        const nz = dx / wallLen
        const halfThick = (wall.thickness || 0.2) / 2 + 0.015

        const sign = (point.x - projX) * nx + (point.z - projZ) * nz >= 0 ? 1 : -1
        bestProj = {
          x: projX + nx * halfThick * sign,
          z: projZ + nz * halfThick * sign
        }
        bestAnchor = { x: projX, z: projZ }
        bestAngle = Math.atan2(dx * sign, dz * sign)
      }
    }

    return {
      wall: closestWall,
      snappedPos: bestProj,
      rotationY: bestAngle,
      anchor: bestAnchor
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return

    // Clic sobre dispositivo para interactuar (conmutar interruptor o seleccionar)
    const clickedDev = this.pickElectricalDevice(e.clientX, e.clientY)

    if (this.wiringActive) {
      if (!clickedDev) return
      e.stopPropagation()
      e.preventDefault()

      if (!this.wireSourceDeviceId) {
        this.wireSourceDeviceId = clickedDev.id
        const spec = DEVICE_SPECS[clickedDev.type]
        this.onMessage(`Conectar desde ${spec.shortLabel}: haz clic en el segundo dispositivo para completar el cableado.`)
      } else {
        const fromId = this.wireSourceDeviceId
        const toId = clickedDev.id
        if (fromId === toId) {
          this.wireSourceDeviceId = null
          this.viewport.clearToolPreview()
          this.onMessage('Cancelado: seleccionaste el mismo elemento.')
          return
        }

        const wire = this.model.addWire(fromId, toId, this.activeCircuit)
        this.wireSourceDeviceId = null
        this.viewport.clearToolPreview()
        if (wire) {
          const fromDev = this.model.getDevice(fromId)
          const toDev = this.model.getDevice(toId)
          this.onMessage(
            `Cableado trazado: ${DEVICE_SPECS[fromDev!.type].shortLabel} ➜ ${DEVICE_SPECS[toDev!.type].shortLabel} (${this.activeCircuit}).`
          )
        } else {
          this.onMessage('Ese tramo ya estaba conectado con este circuito.')
        }
      }
      return
    }

    if (clickedDev) {
      if (clickedDev.type === 'switch' || clickedDev.type === 'switch3') {
        const nextState = this.model.toggleSwitch(clickedDev.id)
        this.onMessage(
          `${DEVICE_SPECS[clickedDev.type].shortLabel} conmutado a: ${nextState ? 'ENCENDIDO (ON)' : 'APAGADO (OFF)'}.`
        )
        return
      }
    }

    if (this.activeDeviceType) {
      const spec = DEVICE_SPECS[this.activeDeviceType]
      const groundPt = this.viewport.pointerToGround(e.clientX, e.clientY)
      if (!groundPt) return

      let posX = groundPt.x
      let posZ = groundPt.z
      let rotY = 0
      let wallId: string | null = null
      let anchorX = posX
      let anchorZ = posZ

      if (spec.mount === 'wall') {
        const snap = this.snapToWall(groundPt)
        posX = snap.snappedPos.x
        posZ = snap.snappedPos.z
        rotY = snap.rotationY
        wallId = snap.wall?.id ?? null
        anchorX = snap.anchor.x
        anchorZ = snap.anchor.z
      }

      const activeLvl = this.scene.getActiveLevel()
      this.model.addDevice({
        type: this.activeDeviceType,
        levelId: activeLvl.id,
        x: Math.round(posX * 100) / 100,
        z: Math.round(posZ * 100) / 100,
        height: spec.defaultHeight,
        rotationY: rotY,
        wallId,
        anchorX: Math.round(anchorX * 100) / 100,
        anchorZ: Math.round(anchorZ * 100) / 100
      })

      this.onMessage(`Elemento agregado: ${spec.label}. Puedes seguir agregando o presionar Esc / [S].`)
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.wiringActive && this.wireSourceDeviceId) {
      const src = this.model.getDevice(this.wireSourceDeviceId)
      if (!src) return
      const ground = this.viewport.pointerToGround(e.clientX, e.clientY)
      if (ground) {
        const lvlElev = this.scene.getLevel(src.levelId)?.elevation ?? 0
        const start = new THREE.Vector3(src.x, lvlElev + src.height, src.z)
        const end = new THREE.Vector3(ground.x, lvlElev + 1.2, ground.z)
        this.viewport.setToolPreview({ start, end }, end)
      }
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return

    if (e.key === 'e' || e.key === 'E') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        this.setWiringMode(!this.wiringActive)
      }
    } else if (e.key === 'k' || e.key === 'K') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const isXRay = this.renderer.toggleXRay()
        this.onMessage(`Vista Rayos X ${isXRay ? 'ACTIVADA (cableado interno visible)' : 'DESACTIVADA'}.`)
      }
    } else if (e.key === 'Escape') {
      if (this.isActive()) {
        this.cancel()
        this.onMessage('Herramienta eléctrica cancelada.')
      }
    }
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('keydown', this.onKeyDown)
    this.viewport.clearToolPreview()
  }
}

