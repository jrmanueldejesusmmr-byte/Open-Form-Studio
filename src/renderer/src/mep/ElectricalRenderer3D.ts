import * as THREE from 'three'
import {
  CIRCUIT_SPECS,
  type CircuitType,
  type ElectricalDevice,
  type ElectricalWire
} from './electricalTypes'
import { routeBetween, type Vec3 } from './electricalRouting'
import { computeEnergy, type EnergyState } from './electricalAnalysis'
import type { ElectricalModel } from './ElectricalModel'
import type { SceneManager } from '../engine/SceneManager'
import type { ViewportRenderer } from '../engine/ViewportRenderer'

/**
 * Renderizador 3D y 2D de la Instalación Eléctrica:
 *  - Geometría física de cada dispositivo en su posición y altura real en Y.
 *  - Trazado tubular 3D (`THREE.TubeGeometry`) ortogonal con el color reglamentario.
 *  - Simbología eléctrica normalizada para vista en planta (plano 2D).
 *  - Luces físicas reales (`THREE.PointLight`) vinculadas a luminarias encendidas.
 *  - Animación de flujo de corriente (pulso y brillo dinámico en cables energizados).
 *  - Modo Rayos X (`[Tecla K]`): vuelve muros y losas semitransparentes (opacity 0.25).
 */

class PolylineCurve extends THREE.Curve<THREE.Vector3> {
  private readonly pts: THREE.Vector3[]
  private readonly lengths: number[]
  private readonly totalLength: number

  constructor(points: Vec3[]) {
    super()
    this.pts = points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
    this.lengths = [0]
    let total = 0
    for (let i = 1; i < this.pts.length; i++) {
      total += this.pts[i - 1].distanceTo(this.pts[i])
      this.lengths.push(total)
    }
    this.totalLength = Math.max(0.001, total)
  }

  getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const targetDist = t * this.totalLength
    if (targetDist <= 0) return optionalTarget.copy(this.pts[0])
    if (targetDist >= this.totalLength) return optionalTarget.copy(this.pts[this.pts.length - 1])

    let i = 1
    while (i < this.lengths.length && this.lengths[i] < targetDist) i++
    const segStart = this.lengths[i - 1]
    const segEnd = this.lengths[i]
    const segLen = Math.max(0.0001, segEnd - segStart)
    const factor = (targetDist - segStart) / segLen
    return optionalTarget.lerpVectors(this.pts[i - 1], this.pts[i], factor)
  }
}

export class ElectricalRenderer3D {
  private readonly root = new THREE.Group()
  private readonly deviceGroup = new THREE.Group()
  private readonly wireGroup = new THREE.Group()
  private readonly planSymGroup = new THREE.Group()
  private readonly lightGroup = new THREE.Group()

  private readonly deviceMeshes = new Map<string, THREE.Object3D>()
  private readonly wireMeshes = new Map<string, THREE.Mesh>()
  private readonly pointLights = new Map<string, THREE.PointLight>()

  private xrayActive = false
  private simulationActive = false
  private animTime = 0
  private lastEnergy: EnergyState = {
    energized: new Set(),
    liveWires: new Map(),
    litLights: new Set(),
    depth: new Map()
  }

  private originalWallMaterials = new Map<string, { opacity: number; transparent: boolean }>()

  constructor(
    private readonly model: ElectricalModel,
    private readonly sceneManager: SceneManager,
    private readonly viewport: ViewportRenderer
  ) {
    this.root.name = 'MEP_Electrical_System'
    this.root.add(this.deviceGroup)
    this.root.add(this.wireGroup)
    this.root.add(this.planSymGroup)
    this.root.add(this.lightGroup)

    const threeScene = (viewport as unknown as { scene: THREE.Scene }).scene
    if (threeScene) {
      threeScene.add(this.root)
    }

    this.model.onChange(() => {
      this.rebuild()
    })
  }

  public getRoot(): THREE.Group {
    return this.root
  }

  public setXRayMode(active: boolean): void {
    this.xrayActive = active
    this.applyXRayEffect()
  }

  public isXRayActive(): boolean {
    return this.xrayActive
  }

  public toggleXRay(): boolean {
    this.setXRayMode(!this.xrayActive)
    return this.xrayActive
  }

  public setSimulationActive(active: boolean): void {
    this.simulationActive = active
    this.updateEnergyState()
  }

  public isSimulationActive(): boolean {
    return this.simulationActive
  }

  public toggleSimulation(): boolean {
    this.setSimulationActive(!this.simulationActive)
    return this.simulationActive
  }

  public update(deltaTime: number): void {
    this.animTime += deltaTime

    const is2D = this.viewport.getViewMode() === '2d'
    this.planSymGroup.visible = is2D
    this.deviceGroup.visible = !is2D
    this.wireGroup.visible = true

    if (this.simulationActive) {
      const pulse = (Math.sin(this.animTime * 6) + 1) * 0.5
      for (const [wireId, mesh] of this.wireMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        const isLive = this.lastEnergy.liveWires.has(wireId)
        if (isLive) {
          mat.emissiveIntensity = 0.4 + pulse * 0.6
        } else {
          mat.emissiveIntensity = 0.08
        }
      }

      for (const [deviceId, light] of this.pointLights) {
        const isLit = this.lastEnergy.litLights.has(deviceId)
        light.intensity = isLit ? 1.6 + pulse * 0.2 : 0
      }
    } else {
      for (const [, mesh] of this.wireMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 0.15
      }
      for (const [, light] of this.pointLights) {
        light.intensity = 0
      }
    }
  }

  public rebuild(): void {
    this.clearThreeObjects(this.deviceGroup)
    this.clearThreeObjects(this.wireGroup)
    this.clearThreeObjects(this.planSymGroup)
    this.clearThreeObjects(this.lightGroup)

    this.deviceMeshes.clear()
    this.wireMeshes.clear()
    this.pointLights.clear()

    const devices = this.model.getDevices()
    const wires = this.model.getWires()

    const ctx = {
      levelElevation: (lvlId: string) => this.sceneManager.getLevel(lvlId)?.elevation ?? 0,
      levelHeight: (lvlId: string) => this.sceneManager.getLevel(lvlId)?.height ?? 2.8
    }

    for (const dev of devices) {
      const devMesh = this.createDeviceMesh(dev, ctx)
      devMesh.userData = { electricalDeviceId: dev.id, electricalType: dev.type }
      this.deviceMeshes.set(dev.id, devMesh)
      this.deviceGroup.add(devMesh)

      const sym = this.createPlanSymbol(dev, ctx)
      this.planSymGroup.add(sym)

      if (dev.type === 'luminaire' || dev.type === 'sconce') {
        const light = new THREE.PointLight(0xfff1cc, 0, 8, 1.8)
        const p = devMesh.position
        light.position.set(p.x, p.y - 0.1, p.z)
        light.castShadow = true
        light.shadow.bias = -0.001
        this.lightGroup.add(light)
        this.pointLights.set(dev.id, light)
      }
    }

    const devMap = new Map(devices.map((d) => [d.id, d]))
    for (const wire of wires) {
      const devA = devMap.get(wire.from)
      const devB = devMap.get(wire.to)
      if (!devA || !devB) continue

      const pts = routeBetween(devA, devB, ctx)
      if (pts.length < 2) continue

      const curve = new PolylineCurve(pts)
      const radius = wire.circuit === 'special' ? 0.024 : wire.circuit === 'ground' ? 0.015 : 0.02
      const geom = new THREE.TubeGeometry(curve, Math.max(16, pts.length * 8), radius, 8, false)

      const spec = CIRCUIT_SPECS[wire.circuit]
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.2,
        roughness: 0.35,
        metalness: 0.4
      })

      const tubeMesh = new THREE.Mesh(geom, mat)
      tubeMesh.userData = { electricalWireId: wire.id, circuit: wire.circuit }
      tubeMesh.castShadow = true
      this.wireMeshes.set(wire.id, tubeMesh)
      this.wireGroup.add(tubeMesh)
    }

    this.updateEnergyState()
    if (this.xrayActive) {
      this.applyXRayEffect()
    }
  }

  private updateEnergyState(): void {
    const devices = this.model.getDevices()
    const wires = this.model.getWires()
    this.lastEnergy = computeEnergy(devices, wires)

    for (const [devId, mesh] of this.deviceMeshes) {
      const dev = this.model.getDevice(devId)
      if (!dev) continue
      if (dev.type === 'luminaire' || dev.type === 'sconce') {
        const bulb = mesh.getObjectByName('bulb') as THREE.Mesh | undefined
        if (bulb && bulb.material instanceof THREE.MeshStandardMaterial) {
          const isLit = this.simulationActive && this.lastEnergy.litLights.has(devId)
          bulb.material.emissive.setHex(isLit ? 0xffea88 : 0x222222)
          bulb.material.emissiveIntensity = isLit ? 1.5 : 0
        }
      } else if (dev.type === 'switch' || dev.type === 'switch3') {
        const toggle = mesh.getObjectByName('toggle')
        if (toggle) {
          toggle.rotation.x = dev.on ? -0.3 : 0.3
        }
      }
    }
  }

  private createDeviceMesh(
    dev: ElectricalDevice,
    ctx: { levelElevation: (id: string) => number }
  ): THREE.Group {
    const group = new THREE.Group()
    const yPos = ctx.levelElevation(dev.levelId) + dev.height
    group.position.set(dev.x, yPos, dev.z)
    group.rotation.y = dev.rotationY

    switch (dev.type) {
      case 'panel': {
        const boxGeom = new THREE.BoxGeometry(0.38, 0.52, 0.12)
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.3 })
        const box = new THREE.Mesh(boxGeom, boxMat)
        const doorGeom = new THREE.BoxGeometry(0.36, 0.5, 0.015)
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.25 })
        const door = new THREE.Mesh(doorGeom, doorMat)
        door.position.z = 0.065
        group.add(box, door)
        break
      }
      case 'junction': {
        const octGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8)
        const octMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.4 })
        const oct = new THREE.Mesh(octGeom, octMat)
        group.add(oct)
        break
      }
      case 'switch':
      case 'switch3': {
        const plateGeom = new THREE.BoxGeometry(0.08, 0.12, 0.018)
        const plateMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 })
        const plate = new THREE.Mesh(plateGeom, plateMat)
        const toggleGeom = new THREE.BoxGeometry(0.02, 0.04, 0.02)
        const toggleMat = new THREE.MeshStandardMaterial({
          color: dev.on ? 0x22c55e : 0xd1d5db,
          emissive: dev.on ? 0x15803d : 0x000000,
          emissiveIntensity: dev.on ? 0.3 : 0
        })
        const toggle = new THREE.Mesh(toggleGeom, toggleMat)
        toggle.name = 'toggle'
        toggle.position.z = 0.012
        toggle.rotation.x = dev.on ? -0.3 : 0.3
        group.add(plate, toggle)
        break
      }
      case 'outlet':
      case 'outlet240':
      case 'gfci': {
        const plateGeom = new THREE.BoxGeometry(0.08, 0.12, 0.018)
        const color = dev.type === 'gfci' ? 0xe2e8f0 : dev.type === 'outlet240' ? 0xfecdd3 : 0xffffff
        const plateMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 })
        const plate = new THREE.Mesh(plateGeom, plateMat)
        const plugGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.005, 12)
        const plugMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
        const plug1 = new THREE.Mesh(plugGeom, plugMat)
        plug1.rotation.x = Math.PI / 2
        plug1.position.set(0, 0.025, 0.01)
        const plug2 = plug1.clone()
        plug2.position.set(0, -0.025, 0.01)
        group.add(plate, plug1, plug2)
        break
      }
      case 'luminaire': {
        const baseGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 24)
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5 })
        const base = new THREE.Mesh(baseGeom, baseMat)
        const bulbGeom = new THREE.SphereGeometry(0.1, 24, 16)
        const bulbMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x222222,
          roughness: 0.1
        })
        const bulb = new THREE.Mesh(bulbGeom, bulbMat)
        bulb.name = 'bulb'
        bulb.position.y = -0.05
        group.add(base, bulb)
        break
      }
      case 'sconce': {
        const armGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8)
        const armMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })
        const arm = new THREE.Mesh(armGeom, armMat)
        arm.rotation.x = Math.PI / 2
        arm.position.z = 0.06
        const shadeGeom = new THREE.ConeGeometry(0.09, 0.1, 16, 1, true)
        const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, side: THREE.DoubleSide })
        const shade = new THREE.Mesh(shadeGeom, shadeMat)
        shade.position.set(0, -0.05, 0.12)
        const bulbGeom = new THREE.SphereGeometry(0.04, 16, 12)
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfffbeb, emissive: 0x111111 })
        const bulb = new THREE.Mesh(bulbGeom, bulbMat)
        bulb.name = 'bulb'
        bulb.position.set(0, -0.05, 0.12)
        group.add(arm, shade, bulb)
        break
      }
      case 'groundRod': {
        const rodGeom = new THREE.CylinderGeometry(0.015, 0.015, 1.4, 12)
        const rodMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.25 })
        const rod = new THREE.Mesh(rodGeom, rodMat)
        rod.position.y = -0.6
        const clampGeom = new THREE.BoxGeometry(0.06, 0.04, 0.06)
        const clampMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.7 })
        const clamp = new THREE.Mesh(clampGeom, clampMat)
        clamp.position.y = 0.05
        group.add(rod, clamp)
        break
      }
      case 'meter': {
        const boxGeom = new THREE.BoxGeometry(0.24, 0.34, 0.12)
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5 })
        const box = new THREE.Mesh(boxGeom, boxMat)
        const glassGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 24)
        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.5,
          roughness: 0.1
        })
        const glass = new THREE.Mesh(glassGeom, glassMat)
        glass.rotation.x = Math.PI / 2
        glass.position.z = 0.08
        group.add(box, glass)
        break
      }
    }
    return group
  }

  private createPlanSymbol(
    dev: ElectricalDevice,
    ctx: { levelElevation: (id: string) => number }
  ): THREE.Group {
    const symGroup = new THREE.Group()
    const yPos = ctx.levelElevation(dev.levelId) + 0.04
    symGroup.position.set(dev.x, yPos, dev.z)
    symGroup.rotation.y = dev.rotationY

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const c = canvas.getContext('2d')
    if (!c) return symGroup

    c.clearRect(0, 0, 128, 128)
    c.lineWidth = 8
    c.strokeStyle = '#0f172a'
    c.fillStyle = '#ffffff'

    switch (dev.type) {
      case 'luminaire':
        c.beginPath()
        c.arc(64, 64, 46, 0, Math.PI * 2)
        c.fill()
        c.stroke()
        c.beginPath()
        c.moveTo(31, 31)
        c.lineTo(97, 97)
        c.moveTo(97, 31)
        c.lineTo(31, 97)
        c.stroke()
        break
      case 'sconce':
        c.beginPath()
        c.arc(74, 64, 38, 0, Math.PI * 2)
        c.fill()
        c.stroke()
        c.beginPath()
        c.moveTo(14, 20)
        c.lineTo(14, 108)
        c.moveTo(14, 64)
        c.lineTo(36, 64)
        c.stroke()
        break
      case 'switch':
      case 'switch3':
        c.font = 'bold 64px sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillStyle = '#0284c7'
        c.fillText(dev.type === 'switch3' ? 'S₃' : 'S', 64, 64)
        break
      case 'outlet':
      case 'outlet240':
      case 'gfci':
        c.beginPath()
        c.arc(64, 80, 40, Math.PI, 0)
        c.closePath()
        c.fill()
        c.stroke()
        c.beginPath()
        c.moveTo(34, 40)
        c.lineTo(34, 80)
        c.moveTo(94, 40)
        c.lineTo(94, 80)
        c.stroke()
        if (dev.type === 'gfci') {
          c.font = 'bold 24px sans-serif'
          c.fillStyle = '#ef4444'
          c.fillText('GFCI', 40, 115)
        } else if (dev.type === 'outlet240') {
          c.font = 'bold 26px sans-serif'
          c.fillStyle = '#d946ef'
          c.fillText('240', 44, 115)
        }
        break
      case 'panel':
        c.fillStyle = '#475569'
        c.fillRect(20, 20, 88, 88)
        c.strokeStyle = '#ffffff'
        c.lineWidth = 6
        c.strokeRect(20, 20, 88, 88)
        c.beginPath()
        c.moveTo(20, 20)
        c.lineTo(108, 108)
        c.moveTo(20, 108)
        c.lineTo(108, 20)
        c.stroke()
        break
      default:
        c.beginPath()
        c.arc(64, 64, 40, 0, Math.PI * 2)
        c.fill()
        c.stroke()
        break
    }

    const texture = new THREE.CanvasTexture(canvas)
    const planeGeom = new THREE.PlaneGeometry(0.65, 0.65)
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
    const plane = new THREE.Mesh(planeGeom, planeMat)
    plane.rotation.x = -Math.PI / 2
    plane.renderOrder = 999
    symGroup.add(plane)
    return symGroup
  }

  private applyXRayEffect(): void {
    const threeScene = (this.viewport as unknown as { scene: THREE.Scene }).scene
    if (!threeScene) return

    threeScene.traverse((obj) => {
      let isMep = false
      let cur: THREE.Object3D | null = obj
      while (cur) {
        if (cur === this.root) {
          isMep = true
          break
        }
        cur = cur.parent
      }
      if (isMep) return
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
          if (this.xrayActive) {
            if (!this.originalWallMaterials.has(obj.uuid)) {
              this.originalWallMaterials.set(obj.uuid, {
                opacity: mat.opacity,
                transparent: mat.transparent
              })
            }
            mat.transparent = true
            mat.opacity = 0.22
            mat.depthWrite = false
            mat.needsUpdate = true
          } else {
            const original = this.originalWallMaterials.get(obj.uuid)
            if (original) {
              mat.opacity = original.opacity
              mat.transparent = original.transparent
              mat.depthWrite = true
              mat.needsUpdate = true
            }
          }
        }
      }
    })

    if (!this.xrayActive) {
      this.originalWallMaterials.clear()
    }
  }

  private clearThreeObjects(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else if (child.material) {
          child.material.dispose()
        }
      }
    }
  }

  public dispose(): void {
    this.setXRayMode(false)
    this.clearThreeObjects(this.deviceGroup)
    this.clearThreeObjects(this.wireGroup)
    this.clearThreeObjects(this.planSymGroup)
    this.clearThreeObjects(this.lightGroup)
    if (this.root.parent) {
      this.root.parent.remove(this.root)
    }
  }
}
