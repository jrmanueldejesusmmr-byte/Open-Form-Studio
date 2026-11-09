import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { SceneManager } from '../engine/SceneManager'
import { Viewport3DController } from '../engine/Viewport3DController'
import { buildWorkspaceGridSystem, type WorkspaceGridSystem } from '../engine/GridBuilder'
import { buildObjectMesh, buildWallMesh, SELECTED_COLOR } from '../engine/WallMeshBuilder'
import {
  disposeMaterialLibrary,
  getQuality as getMaterialQuality,
  materialTint,
  setQuality as setMaterialQuality,
  type QualityLevel
} from '../engine/MaterialSystem'
import { Layer } from '../models/Layer'
import { Wall, WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { isRadialStructuralShape } from '../models/StructuralTypes'
import { themeManager } from '../services/ThemeManager'

export type TransformGizmoMode = 'translate' | 'rotate' | 'scale'

/** Proyección del lienzo: `3d` = perspectiva orbital, `2d` = planta ortográfica. */
export type ViewMode = '2d' | '3d'

/** Opacidad de los pisos que no son el activo (atenuado «fantasma» al 40 %). */
const LEVEL_ATTENUATION = 0.4
/** Devuelve los materiales de una malla (una malla puede tener un array cuando usa varios materiales). */
function materialArray(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material]
}
/** Descarta un material o array de materiales de forma segura. */
function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  for (const m of materialArray(material)) m.dispose()
}
/** Libera geometrías y materiales de los hijos adjuntos (p. ej. curvas de nivel de un terreno). */
function disposeObjectChildren(root: THREE.Object3D): void {
  for (const child of [...root.children]) {
    child.traverse((node) => {
      const maybeMesh = node as THREE.Mesh
      if (maybeMesh.geometry) maybeMesh.geometry.dispose()
      if (maybeMesh.material) disposeMaterial(maybeMesh.material)
    })
    root.remove(child)
  }
}
/** Tiñe un material o array de materiales con el color indicado. */
function tintMaterial(material: THREE.Material | THREE.Material[], hex: number): void {
  for (const m of materialArray(material)) {
    const mm = m as THREE.MeshStandardMaterial
    if (mm.color) mm.color.setHex(hex)
  }
}


/**
 * Fondo en degradado suave (cierto azul-grisáceo arriba → casi negro abajo),
 * en lugar de un negro plano. Es una textura 2D tiny estirada a pantalla
 * completa: barata y sin descargas.
 */
function makeGradientBackground(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#1c2433')
    g.addColorStop(0.55, '#12161d')
    g.addColorStop(1, '#0a0c0f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface LayerState {
  visible: boolean
  color: number
}

/**
 * ¿Debe el material proyectar sombra del sol? El vidrio (transparente o con
 * transmission > 0) no: proyectaría una sombra opaca que delata la caja y
 * ruina la piel de una cortina vidrio.
 */
function sunCastsShadow(material: THREE.Material): boolean {
  const m = material as THREE.Material & { transmission?: number }
  if (m.transparent) return false
  return !(typeof m.transmission === 'number' && m.transmission > 0)
}

/**
 * "Pegamento" entre el motor (Engine/Models) y Three.js: crea la escena,
 * las cámaras y el loop de render, y traduce eventos de SceneManager en
 * THREE.Mesh concretos. Equivalente al code-behind de MainWindow.xaml.cs
 * de la versión WPF — deliberadamente sin lógica de negocio propia.
 */
export class ViewportRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly perspectiveCamera: THREE.PerspectiveCamera
  private readonly orthographicCamera: THREE.OrthographicCamera
  private readonly wallMeshes = new Map<string, THREE.Mesh>()
  private readonly objectMeshes = new Map<string, THREE.Mesh>()
  /** Previsualización de la herramienta activa (línea de trazo + punto enganchado). */
  private previewLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null
  private previewMarker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null
  /** Previsualización de polígono (contorno del techo en trazo). */
  private previewPolygon: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null
  /** Previsualización fantasma (ghost wireframe + volumen traslúcido) de plantillas de muros 2D. */
  private previewTemplateGroup: THREE.Group | null = null
  private previewTemplateLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null
  private previewTemplateFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null
  private previewSnapRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null
  /** Nodos de estiramiento en los extremos de un muro individual seleccionado. */
  private wallEndpointStartGrip: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null
  private wallEndpointEndGrip: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null
  private readonly wallTypes = new Map<string, WallSegmentType>()
  private readonly layerStates = new Map<WallSegmentType, LayerState>()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2()
  private readonly gridSystem: WorkspaceGridSystem
  private userGridVisible = true
  private shadowGround: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  private unsubscribeTheme: (() => void) | null = null
  private transformControls: TransformControls | null = null
  private readonly gizmoAnchor = new THREE.Object3D()
  private gizmoEnabled = true
  private gizmoBaseObjSize = new THREE.Vector3(1, 1, 1)
  private gizmoBaseWall: {
    start: THREE.Vector3
    end: THREE.Vector3
    height: number
    thickness: number
    mid: THREE.Vector3
    baseAngle: number
  } | null = null
  private gizmoLiveChangeListeners: Array<() => void> = []
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private aspect = 1
  private viewMode: ViewMode = '3d'
  private rafId: number | null = null
  private resizeObserver: ResizeObserver | null = null
  private disposed = false
  /** Sol única (fuente de sombras). Se guarda para poder activar/desactivar su sombra con la calidad. */
  private sun: THREE.DirectionalLight
  /** Entorno PMREM (reflejos). Solo se genera en calidad Alta. */
  private envTexture: THREE.Texture | null = null
  /** Referencia estable al handler de `resize`, para poder quitarlo en `dispose()`. */
  private readonly onWindowResize = (): void => this.resize()
  private readonly beforeRenderListeners: Array<(dt: number) => void> = []
  private lastFrameTime = performance.now()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sceneManager: SceneManager,
    private readonly cameraController: Viewport3DController
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    // Flujo de color físico: sRGB en salida + ACES Filmic (look cinematográfico)
    // para que materiales PBR y luces no se vean planos ni «lavados».
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.scene.background = makeGradientBackground()

    // `near` dinámico: se recalcula en `syncCamera()` según la distancia al
    // objetivo (0.03 × distancia, acotado) para que acercar la cámara a un
    // muro no lo recorte contra el plano cercano.
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000)
    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 2000)
    this.syncCamera()

    // Iluminación de relleno (punto B): con sólo hemisférica + sol, las caras
    // orientadas al fondo quedaban casi negras y los muros «desaparecían» al
    // entrar en una habitación. Ambient da lectura mínima a todas las caras;
    // el relleno y el contraluz desbloquean las orientaciones opuestas al sol.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const hemisphere = new THREE.HemisphereLight(0xdbeafe, 0x4b4237, 1.25)
    this.scene.add(hemisphere)
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.75)
    sun.position.set(15, 25, 10)
    // Sombra del sol: ortográfica y amplia para cubrir la obra (se activa según
    // calidad en applyRenderQuality). Bias suave (-0.0005) y mapa 2048x2048.
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
    const shadowCam = sun.shadow.camera as THREE.OrthographicCamera
    shadowCam.left = -160
    shadowCam.right = 160
    shadowCam.top = 220
    shadowCam.bottom = -60
    shadowCam.near = 1
    shadowCam.far = 500
    shadowCam.updateProjectionMatrix()
    this.sun = sun
    this.scene.add(sun)
    this.applyRenderQuality()
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.8)
    fill.position.set(-14, 12, -6)
    this.scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.5)
    rim.position.set(2, 8, -16)
    this.scene.add(rim)

    // Suelo que solo recoge sombras (transparente fuera de ellas): hace visibles
    // las sombras del edificio sin tapar el fondo del tema.
    this.shadowGround = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    )
    this.shadowGround.rotation.x = -Math.PI / 2
    this.shadowGround.position.y = 0
    this.shadowGround.receiveShadow = true
    this.scene.add(this.shadowGround)

    this.gridSystem = buildWorkspaceGridSystem(60, 1)
    this.scene.add(this.gridSystem.group)
    this.applySceneTheme()
    this.unsubscribeTheme = themeManager.subscribe(() => this.applySceneTheme())

    this.scene.add(this.gizmoAnchor)
    this.initTransformControls()

    sceneManager.onWallAdded((wall) => this.onWallAdded(wall))
    sceneManager.onWallRemoved((wall) => this.onWallRemoved(wall))
    // `onWallMoved` (no `onWallChanged`) también llega durante los arrastres
    // silenciosos, de modo que la malla sigue al cursor sin ensuciar el historial.
    sceneManager.onWallMoved((wall) => {
      this.onWallChanged(wall)
      this.syncWallEndpointGrips()
      if (!this.isTransformGizmoDragging()) this.syncTransformGizmoAnchor()
    })
    sceneManager.onObjectAdded((object) => this.onObjectAdded(object))
    sceneManager.onObjectRemoved((object) => this.onObjectRemoved(object))
    sceneManager.onObjectMoved((object) => {
      this.onObjectChanged(object)
      if (!this.isTransformGizmoDragging()) this.syncTransformGizmoAnchor()
    })
    sceneManager.onObjectChanged((object) => {
      this.onObjectChanged(object)
      if (!this.isTransformGizmoDragging()) this.syncTransformGizmoAnchor()
    })
    // La selección es un estado "visual" que vive en el modelo: al cambiar se
    // repintan los materiales en lugar de recrear geometría.
    sceneManager.onSelectionChanged(() => {
      this.paintSelection()
      this.syncTransformGizmoAnchor()
    })
    sceneManager.onObjectSelectionChanged(() => {
      this.paintSelection()
      this.syncTransformGizmoAnchor()
    })
    // Pisos: al cambiar la estructura, el activo o la visibilidad se repinta
    // la atenuación (40 %) y los ojos por piso en todas las mallas.
    sceneManager.onLevelsChanged(() => this.refreshLevelVisuals())

    this.resize()
    window.addEventListener('resize', this.onWindowResize)

    // Observador para redimensionar automáticamente el canvas si el contenedor
    // cambia de tamaño. Se guarda la instancia para poder desconectarla luego.
    if (this.canvas.parentElement && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(this.canvas.parentElement)
    }

    this.animate()
  }

  /** Cámara realmente en uso según el modo de proyección (2D/3D). */
  private get activeCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.viewMode === '2d' ? this.orthographicCamera : this.perspectiveCamera
  }

  getViewMode(): ViewMode {
    return this.viewMode
  }

  /** Relación de aspecto actual del lienzo (la usa el encuadre de la cámara). */
  getAspect(): number {
    return this.aspect
  }

  /** Campo de visión vertical de la cámara en perspectiva, en grados. */
  getVerticalFov(): number {
    return this.perspectiveCamera.fov
  }

  /**
   * Proyecta un punto del mundo a coordenadas de pantalla relativas al canvas
   * (píxeles CSS). Lo usan las etiquetas de cota del panel de Costos para
   * colocar el texto sobre cada muro. Devuelve `null` si el canvas aún no
   * tiene tamaño medible.
   */
  worldToScreen(point: THREE.Vector3): { x: number; y: number } | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return null
    const ndc = point.clone().project(this.activeCamera)
    return {
      x: (ndc.x * 0.5 + 0.5) * width,
      y: (-ndc.y * 0.5 + 0.5) * height
    }
  }

  /** Cambia entre la vista 3D (perspectiva) y la planta 2D (ortográfica). */
  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
    this.syncCamera()
    if (this.transformControls) {
      this.transformControls.camera = this.activeCamera
    }
  }

  /**
   * Sincroniza `scene.background`, `THREE.GridHelper` y la matriz de puntos 3D
   * con el tema activo y el estilo de fondo de trabajo (`grid`, `dots`, `solid`).
   */
  private applySceneTheme(): void {
    const cfg = themeManager.getConfig()
    const themeDef = themeManager.getThemeDef()
    this.scene.background = new THREE.Color(themeDef.sceneBg)
    this.shadowGround.material.opacity = themeDef.colorScheme === 'light' ? 0.2 : 0.38
    this.gridSystem.updateTheme(themeDef, cfg.workBgStyle, this.userGridVisible)
  }

  private initTransformControls(): void {
    try {
      const tc = new TransformControls(this.activeCamera, this.canvas)
      tc.setSize(0.85)
      tc.setMode('translate')
      this.transformControls = tc
      this.scene.add(tc)

      tc.addEventListener('objectChange', () => {
        this.applyGizmoAnchorTransform(true)
        this.gizmoLiveChangeListeners.forEach((fn) => fn())
      })

      tc.addEventListener('dragging-changed', (event) => {
        const isDragging = Boolean(event.value)
        if (isDragging) {
          this.captureGizmoBaseState()
        } else {
          this.applyGizmoAnchorTransform(false)
          this.syncTransformGizmoAnchor()
          this.gizmoLiveChangeListeners.forEach((fn) => fn())
        }
      })
    } catch {
      // En entornos headless sin DOM de eventos completos se degrada sin gizmo
      this.transformControls = null
    }
  }

  private captureGizmoBaseState(): void {
    const obj = this.sceneManager.getSelectedObject()
    if (obj) {
      this.gizmoBaseObjSize.copy(obj.size)
      this.gizmoBaseWall = null
      return
    }
    const wall = this.sceneManager.getSelected()
    if (wall) {
      const mid = new THREE.Vector3().addVectors(wall.start, wall.end).multiplyScalar(0.5)
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      this.gizmoBaseWall = {
        start: wall.start.clone(),
        end: wall.end.clone(),
        height: wall.height,
        thickness: wall.thickness,
        mid,
        baseAngle: -Math.atan2(dz, dx)
      }
    }
  }

  private applyGizmoAnchorTransform(silent: boolean): void {
    if (!this.transformControls) return
    const mode = this.transformControls.getMode()
    const obj = this.sceneManager.getSelectedObject()
    if (obj) {
      const nextPos = this.gizmoAnchor.position.clone()
      const euler = new THREE.Euler().setFromQuaternion(this.gizmoAnchor.quaternion, 'YXZ')
      const nextRotY = mode === 'rotate' ? euler.y : obj.rotationY
      const nextSize = obj.size.clone()

      if (mode === 'scale') {
        nextSize.set(
          Math.max(0.1, Math.round(this.gizmoBaseObjSize.x * Math.abs(this.gizmoAnchor.scale.x) * 100) / 100),
          Math.max(0.1, Math.round(this.gizmoBaseObjSize.y * Math.abs(this.gizmoAnchor.scale.y) * 100) / 100),
          Math.max(0.1, Math.round(this.gizmoBaseObjSize.z * Math.abs(this.gizmoAnchor.scale.z) * 100) / 100)
        )
      }

      let nextStructParams = obj.structuralParams ? { ...obj.structuralParams } : undefined
      if (mode === 'scale' && nextStructParams && isRadialStructuralShape(obj.shapeId, nextStructParams.subType)) {
        nextStructParams = {
          ...nextStructParams,
          radius: Math.round(((nextSize.x + nextSize.z) / 4) * 100) / 100
        }
      }

      this.sceneManager.updateObject(
        obj.id,
        {
          position: nextPos,
          rotationY: nextRotY,
          size: nextSize,
          ...(nextStructParams ? { structuralParams: nextStructParams } : {})
        },
        silent
      )
      return
    }

    const wall = this.sceneManager.getSelected()
    if (wall && this.gizmoBaseWall) {
      const base = this.gizmoBaseWall
      if (mode === 'translate') {
        const delta = new THREE.Vector3().subVectors(this.gizmoAnchor.position, base.mid)
        delta.y = 0 // Los muros mantienen la elevación de su piso salvo cambio de nivel
        this.sceneManager.moveWall(
          wall.id,
          base.start.clone().add(delta),
          base.end.clone().add(delta),
          silent
        )
      } else if (mode === 'rotate') {
        const euler = new THREE.Euler().setFromQuaternion(this.gizmoAnchor.quaternion, 'YXZ')
        const dAngle = euler.y - base.baseAngle
        const cos = Math.cos(-dAngle)
        const sin = Math.sin(-dAngle)
        const rotPt = (pt: THREE.Vector3): THREE.Vector3 => {
          const rx = pt.x - base.mid.x
          const rz = pt.z - base.mid.z
          return new THREE.Vector3(base.mid.x + rx * cos - rz * sin, pt.y, base.mid.z + rx * sin + rz * cos)
        }
        this.sceneManager.moveWall(wall.id, rotPt(base.start), rotPt(base.end), silent)
      } else if (mode === 'scale') {
        const sx = Math.max(0.15, Math.abs(this.gizmoAnchor.scale.x))
        const sy = Math.max(0.15, Math.abs(this.gizmoAnchor.scale.y))
        const sz = Math.max(0.25, Math.abs(this.gizmoAnchor.scale.z))
        const halfVec = new THREE.Vector3().subVectors(base.end, base.start).multiplyScalar(0.5 * sx)
        wall.height = Math.max(0.3, Math.round(base.height * sy * 100) / 100)
        wall.thickness = Math.max(0.05, Math.round(base.thickness * sz * 100) / 100)
        this.sceneManager.moveWall(
          wall.id,
          base.mid.clone().sub(halfVec),
          base.mid.clone().add(halfVec),
          silent
        )
      }
    }
  }

  syncTransformGizmoAnchor(): void {
    const tc = this.transformControls
    if (!tc) return
    if (!this.gizmoEnabled) {
      tc.detach()
      return
    }
    const obj = this.sceneManager.getSelectedObject()
    if (obj && obj.visible) {
      this.gizmoAnchor.position.copy(obj.position)
      this.gizmoAnchor.rotation.set(0, obj.rotationY, 0)
      this.gizmoAnchor.scale.set(1, 1, 1)
      this.gizmoAnchor.updateMatrixWorld()
      this.gizmoBaseObjSize.copy(obj.size)
      if (tc.object !== this.gizmoAnchor) tc.attach(this.gizmoAnchor)
      return
    }
    const wall = this.sceneManager.getSelected()
    if (wall && wall.visible) {
      const mid = new THREE.Vector3().addVectors(wall.start, wall.end).multiplyScalar(0.5)
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      this.gizmoAnchor.position.copy(mid)
      this.gizmoAnchor.rotation.set(0, -Math.atan2(dz, dx), 0)
      this.gizmoAnchor.scale.set(1, 1, 1)
      this.gizmoAnchor.updateMatrixWorld()
      if (tc.object !== this.gizmoAnchor) tc.attach(this.gizmoAnchor)
      return
    }
    tc.detach()
  }

  setTransformGizmoMode(mode: TransformGizmoMode): void {
    if (!this.transformControls) return
    this.transformControls.setMode(mode)
    if (mode === 'rotate') {
      this.transformControls.showX = false
      this.transformControls.showY = true
      this.transformControls.showZ = false
    } else {
      this.transformControls.showX = true
      this.transformControls.showY = true
      this.transformControls.showZ = true
    }
    this.syncTransformGizmoAnchor()
  }

  getTransformGizmoMode(): TransformGizmoMode {
    return this.transformControls?.getMode() ?? 'translate'
  }

  setTransformGizmoEnabled(enabled: boolean): void {
    this.gizmoEnabled = enabled
    this.syncTransformGizmoAnchor()
  }

  isTransformGizmoDragging(): boolean {
    return Boolean(this.transformControls?.dragging)
  }

  isPointerOverTransformGizmo(): boolean {
    return Boolean(this.transformControls && this.transformControls.object && this.transformControls.axis !== null)
  }

  onTransformGizmoChange(fn: () => void): () => void {
    this.gizmoLiveChangeListeners.push(fn)
    return () => {
      const idx = this.gizmoLiveChangeListeners.indexOf(fn)
      if (idx >= 0) this.gizmoLiveChangeListeners.splice(idx, 1)
    }
  }

  /**
   * Calidad del motor de materiales (baja / media / alta). Se aplica «en
   * caliente»: vacía la biblioteca (las próximas mallas regeneran las
   * texturas al tamaño nuevo: 512 / 1024 / 2048) y reconstruye todas las
   * mallas de la escena para que el cambio sea visible sin reiniciar nada.
   */
  setQuality(level: QualityLevel): void {
    if (getMaterialQuality() === level) return
    setMaterialQuality(level)
    disposeMaterialLibrary()
    for (const wall of this.sceneManager.getWalls()) this.onWallChanged(wall)
    for (const object of this.sceneManager.getObjects()) this.onObjectChanged(object)
    this.applyRenderQuality()
  }

  /**
   * Ajusta sombras y entorno según la calidad, «en caliente» y sin reconstruir
   * texturas: baja = sin sombras ni entorno; media = sombras PCF; alta =
   * PCFSoft + entorno PMREM (RoomEnvironment, generado en memoria, sin
   * descargas) para reflejos en metal y vidrio.
   */
  private applyRenderQuality(): void {
    const q = getMaterialQuality()
    const shadows = q !== 'baja'
    this.renderer.shadowMap.enabled = shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.sun.castShadow = shadows
    if (q !== 'baja') {
      if (!this.envTexture) {
        const pmrem = new THREE.PMREMGenerator(this.renderer)
        this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        pmrem.dispose()
      }
      this.scene.environment = this.envTexture
    } else {
      this.scene.environment = null
    }
  }

  getQuality(): QualityLevel {
    return getMaterialQuality()
  }

  setGridVisible(visible: boolean): void {
    this.userGridVisible = visible
    this.applySceneTheme()
  }

  private onWallAdded(wall: Wall): void {
    const mesh = buildWallMesh(wall)
    this.wallMeshes.set(wall.id, mesh)
    this.wallTypes.set(wall.id, wall.type)
    this.applyLayerStateToMesh(wall, mesh)
    mesh.castShadow = sunCastsShadow(mesh.material as THREE.Material)
    mesh.receiveShadow = true
    this.scene.add(mesh)
    this.applyLevelVisualToWall(wall, mesh)
  }

  private onWallRemoved(wall: Wall): void {
    const mesh = this.wallMeshes.get(wall.id)
    if (mesh) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      this.wallMeshes.delete(wall.id)
    }
    this.wallTypes.delete(wall.id)
  }

  private onWallChanged(wall: Wall): void {
    // Forma simple y robusta: reconstruir la malla del segmento modificado.
    this.onWallRemoved(wall)
    this.onWallAdded(wall)
  }

  /* ---------- Objetos colocados en el lienzo ---------- */

  private onObjectAdded(object: SceneObject): void {
    const mesh = buildObjectMesh(object)
    this.objectMeshes.set(object.id, mesh)
    mesh.castShadow = sunCastsShadow(mesh.material as THREE.Material)
    mesh.receiveShadow = true
    this.scene.add(mesh)
    this.applyLevelVisualToObject(object, mesh)
  }

  private onObjectRemoved(object: SceneObject): void {
    const mesh = this.objectMeshes.get(object.id)
    if (!mesh) return

    this.scene.remove(mesh)
    this.objectMeshes.delete(object.id)
    disposeObjectChildren(mesh)
    mesh.geometry.dispose()
    disposeMaterial(mesh.material)
  }

  private onObjectChanged(object: SceneObject): void {
    this.onObjectRemoved(object)
    this.onObjectAdded(object)
  }

  /** Vuelve a pintar los materiales según el estado de selección del modelo. */
  private paintSelection(): void {
    for (const [id, mesh] of this.wallMeshes) {
      const wall = this.sceneManager.getWall(id)
      if (!wall) continue
      // Con material de catálogo se tiñe con su tinte (o azul si está seleccionado);
      // sin material, con el color del muro como hasta ahora.
      const base = wall.isSelected ? SELECTED_COLOR : materialTint(wall.materialId, wall.color)
      ;(mesh.material as THREE.MeshStandardMaterial).color.setHex(base)
    }
    for (const [id, mesh] of this.objectMeshes) {
      const object = this.sceneManager.getObject(id)
      if (!object) continue
      if (mesh.userData.isOpeningMesh || mesh.userData.isTerrainMesh || mesh.userData.isCadBlock) {
        for (const m of materialArray(mesh.material)) {
          const std = m as THREE.MeshStandardMaterial
          if (std && std.emissive) {
            std.emissive.setHex(object.isSelected ? 0x1d4ed8 : 0x000000)
            std.emissiveIntensity = object.isSelected ? (mesh.userData.isTerrainMesh ? 0.24 : 0.28) : 0
          }
        }
        continue
      }
      const base = object.isSelected ? SELECTED_COLOR : materialTint(object.materialId, object.color)
      tintMaterial(mesh.material, base)
    }
    this.syncWallEndpointGrips()
  }

  /** Muestra nodos interactivos en `start` y `end` cuando hay un único muro seleccionado. */
  private syncWallEndpointGrips(): void {
    const selectedWall = this.sceneManager.getSelected()
    if (!selectedWall) {
      if (this.wallEndpointStartGrip) this.wallEndpointStartGrip.visible = false
      if (this.wallEndpointEndGrip) this.wallEndpointEndGrip.visible = false
      return
    }
    const elev = this.sceneManager.getLevel(selectedWall.levelId)?.elevation ?? 0
    const startGrip = (this.wallEndpointStartGrip ??= this.createEndpointGripMesh())
    const endGrip = (this.wallEndpointEndGrip ??= this.createEndpointGripMesh())
    startGrip.position.set(selectedWall.start.x, elev + 0.12, selectedWall.start.z)
    endGrip.position.set(selectedWall.end.x, elev + 0.12, selectedWall.end.z)
    startGrip.visible = true
    endGrip.visible = true
  }

  private createEndpointGripMesh(): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      })
    )
    mesh.renderOrder = 1002
    mesh.visible = false
    this.scene.add(mesh)
    return mesh
  }

  /* ---------- Picking (selección con el cursor) ---------- */

  /** Pared bajo el cursor, o null si no hay ninguna. */
  pickWall(clientX: number, clientY: number): Wall | null {
    if (!this.setupPointerRay(clientX, clientY)) return null
    const hit = this.raycaster.intersectObjects([...this.wallMeshes.values()], false)[0]
    const id = hit?.object?.userData?.wallId as string | undefined
    return id ? (this.sceneManager.getWall(id) ?? null) : null
  }

  /** Objeto colocado bajo el cursor, o null si no hay ninguno. */
  pickObject(clientX: number, clientY: number): SceneObject | null {
    if (!this.setupPointerRay(clientX, clientY)) return null
    const hit = this.raycaster.intersectObjects([...this.objectMeshes.values()], false)[0]
    const id = hit?.object?.userData?.objectId as string | undefined
    return id ? (this.sceneManager.getObject(id) ?? null) : null
  }

  /**
   * Impacto exacto sobre cualquier malla de terreno topográfico (`topo.terrain`).
   * Lo usan las herramientas de Sonda de Niveles/Cotas y Plataforma/Explanación.
   */
  pickTerrain(clientX: number, clientY: number): { object: SceneObject; point: THREE.Vector3 } | null {
    if (!this.setupPointerRay(clientX, clientY)) return null
    const terrainMeshes: THREE.Mesh[] = []
    for (const [id, mesh] of this.objectMeshes) {
      if (!mesh.visible) continue
      const obj = this.sceneManager.getObject(id)
      if (obj && (obj.shapeId === 'topo.terrain' || obj.terrainData)) {
        terrainMeshes.push(mesh)
      }
    }
    if (terrainMeshes.length === 0) return null
    const hit = this.raycaster.intersectObjects(terrainMeshes, false)[0]
    if (!hit) return null
    const id = hit.object.userData?.objectId as string | undefined
    const obj = id ? this.sceneManager.getObject(id) : undefined
    return obj ? { object: obj, point: hit.point.clone() } : null
  }

  /**
   * Raycast de superficie (muros + objetos, incluidas mallas hijas) para las
   * anotaciones: devuelve el elemento tocado y el punto 3D exacto del impacto.
   */
  pickSurface(
    clientX: number,
    clientY: number
  ): { kind: 'wall' | 'object'; id: string; point: THREE.Vector3 } | null {
    if (!this.setupPointerRay(clientX, clientY)) return null
    const targets: THREE.Object3D[] = [...this.wallMeshes.values(), ...this.objectMeshes.values()].filter(
      (mesh) => mesh.visible
    )
    const hits = this.raycaster.intersectObjects(targets, true)
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object
      while (node) {
        const wallId = node.userData?.wallId as string | undefined
        if (wallId) return { kind: 'wall', id: wallId, point: hit.point.clone() }
        const objectId = node.userData?.objectId as string | undefined
        if (objectId) return { kind: 'object', id: objectId, point: hit.point.clone() }
        node = node.parent
      }
    }
    return null
  }

  /** Punto del plano horizontal `y = elevation` bajo el cursor (cotas por piso). */
  pointerToPlane(clientX: number, clientY: number, elevation: number): THREE.Vector3 | null {
    if (!this.setupPointerRay(clientX, clientY)) return null
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation)
    const hit = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null
  }

  /**
   * Proyección a píxeles CSS del lienzo con la cámara activa (2D u 3D).
   * `behind = true` si el punto queda detrás de la cámara o fuera del frustum en profundidad.
   */
  projectPoint(point: THREE.Vector3): { x: number; y: number; behind: boolean } | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return null
    const camera = this.activeCamera
    camera.updateMatrixWorld()
    const ndc = point.clone().project(camera)
    return {
      x: (ndc.x * 0.5 + 0.5) * width,
      y: (-ndc.y * 0.5 + 0.5) * height,
      behind: ndc.z > 1 || ndc.z < -1
    }
  }

  /* ---------- Previsualización de la herramienta activa ---------- */

  /**
   * Dibuja (o oculta, con `null`) la guía interactiva de la herramienta: la línea
   * entre el origen del trazo y el punto actual, y opcionalmente el punto
   * enganchado a la rejilla bajo el cursor. No pertenece al modelo: se limpió
   * a mano y con `dispose()`.
   */
  setToolPreview(
    segment: { start: THREE.Vector3; end: THREE.Vector3 } | null,
    marker: THREE.Vector3 | null = null
  ): void {
    const line = (this.previewLine ??= this.createPreviewLine())
    if (segment) {
      const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute
      positions.setXYZ(0, segment.start.x, segment.start.y, segment.start.z)
      positions.setXYZ(1, segment.end.x, segment.end.y, segment.end.z)
      positions.needsUpdate = true
      line.geometry.computeBoundingSphere()
      line.visible = true
    } else {
      line.visible = false
    }

    const dot = (this.previewMarker ??= this.createPreviewMarker())
    if (marker) {
      // Elevado un poco sobre el plano para que nunca lo tape el suelo.
      dot.position.set(marker.x, marker.y + 0.06, marker.z)
      dot.visible = true
    } else {
      dot.visible = false
    }
  }

  /** Oculta cualquier previsualización (al cambiar de herramienta o deshacer). */
  clearToolPreview(): void {
    this.setToolPreview(null, null)
    if (this.previewPolygon) this.previewPolygon.visible = false
    if (this.previewTemplateGroup) this.previewTemplateGroup.visible = false
    if (this.previewSnapRing) this.previewSnapRing.visible = false
  }

  /**
   * Previsualización fantasma (ghost wireframe en doble línea de espesor 0.20 m +
   * volumen 3D semitransparente) para las plantillas de muros 2D interactivas.
   */
  setWallTemplatePreview(
    segments: ReadonlyArray<{ start: THREE.Vector3; end: THREE.Vector3 }> | null,
    opts?: {
      thickness?: number
      height?: number
      snapPoint?: THREE.Vector3 | null
      snapKind?: 'wall-vertex' | 'wall-edge' | 'grid' | 'none'
    }
  ): void {
    if (!segments || segments.length === 0) {
      if (this.previewTemplateGroup) this.previewTemplateGroup.visible = false
      if (this.previewSnapRing) this.previewSnapRing.visible = false
      return
    }

    const group = (this.previewTemplateGroup ??= (() => {
      const g = new THREE.Group()
      g.renderOrder = 997
      this.scene.add(g)
      return g
    })())

    const thickness = opts?.thickness ?? 0.2
    const halfT = thickness * 0.5
    const wallHeight = opts?.height ?? 2.5
    const isWallSnap = opts?.snapKind === 'wall-vertex' || opts?.snapKind === 'wall-edge'
    const strokeColor = isWallSnap ? 0x10b981 : 0x38bdf8

    // Construimos contornos 2D con espesor real + aristas superiores 3D (ghost wireframe)
    const lineVerts: number[] = []
    const fillVerts: number[] = []

    const pushLine = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number
    ): void => {
      lineVerts.push(ax, ay, az, bx, by, bz)
    }

    const pushQuad = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
      dx: number,
      dy: number,
      dz: number
    ): void => {
      fillVerts.push(ax, ay, az, bx, by, bz, cx, cy, cz)
      fillVerts.push(ax, ay, az, cx, cy, cz, dx, dy, dz)
    }

    for (const seg of segments) {
      const sx = seg.start.x
      const sz = seg.start.z
      const ex = seg.end.x
      const ez = seg.end.z
      const dx = ex - sx
      const dz = ez - sz
      const len = Math.hypot(dx, dz)
      if (len < 1e-4) continue

      const nx = (-dz / len) * halfT
      const nz = (dx / len) * halfT
      const yBase = seg.start.y + 0.04
      const yTop = seg.start.y + wallHeight

      const p1x = sx + nx
      const p1z = sz + nz
      const p2x = ex + nx
      const p2z = ez + nz
      const p3x = ex - nx
      const p3z = ez - nz
      const p4x = sx - nx
      const p4z = sz - nz

      // Contorno de planta (doble línea de espesor arquitectónico + tapas)
      pushLine(p1x, yBase, p1z, p2x, yBase, p2z)
      pushLine(p4x, yBase, p4z, p3x, yBase, p3z)
      pushLine(p1x, yBase, p1z, p4x, yBase, p4z)
      pushLine(p2x, yBase, p2z, p3x, yBase, p3z)
      // Eje central sutil
      pushLine(sx, yBase + 0.01, sz, ex, yBase + 0.01, ez)

      // Relleno traslúcido en planta
      pushQuad(p1x, yBase, p1z, p2x, yBase, p2z, p3x, yBase, p3z, p4x, yBase, p4z)

      // Si estamos en 3D, proyectar también el alzado fantasma del muro (2.5m)
      if (this.viewMode === '3d') {
        pushLine(p1x, yTop, p1z, p2x, yTop, p2z)
        pushLine(p4x, yTop, p4z, p3x, yTop, p3z)
        pushLine(p1x, yTop, p1z, p4x, yTop, p4z)
        pushLine(p2x, yTop, p2z, p3x, yTop, p3z)
        pushLine(sx, yBase, sz, sx, yTop, sz)
        pushLine(ex, yBase, ez, ex, yTop, ez)
        pushQuad(sx, yBase, sz, ex, yBase, ez, ex, yTop, ez, sx, yTop, sz)
      }
    }

    const linesObj = (this.previewTemplateLines ??= (() => {
      const geom = new THREE.BufferGeometry()
      const mat = new THREE.LineBasicMaterial({
        color: strokeColor,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      })
      const ls = new THREE.LineSegments(geom, mat)
      ls.frustumCulled = false
      ls.renderOrder = 999
      group.add(ls)
      return ls
    })())

    linesObj.material.color.setHex(strokeColor)
    linesObj.geometry.dispose()
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3))
    linesObj.geometry = lineGeo

    const fillObj = (this.previewTemplateFill ??= (() => {
      const geom = new THREE.BufferGeometry()
      const mat = new THREE.MeshBasicMaterial({
        color: strokeColor,
        depthTest: false,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide
      })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 997
      group.add(mesh)
      return mesh
    })())

    fillObj.material.color.setHex(strokeColor)
    fillObj.geometry.dispose()
    const fillGeo = new THREE.BufferGeometry()
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillVerts, 3))
    fillObj.geometry = fillGeo

    group.visible = true

    // Anillo magnético sobre el punto de snap (verde esmeralda si engancha a muro existente)
    if (opts?.snapPoint) {
      const ring = (this.previewSnapRing ??= (() => {
        const r = new THREE.Mesh(
          new THREE.RingGeometry(0.14, 0.24, 24),
          new THREE.MeshBasicMaterial({
            color: strokeColor,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true,
            opacity: 0.95
          })
        )
        r.rotation.x = -Math.PI / 2
        r.renderOrder = 1001
        this.scene.add(r)
        return r
      })())
      ring.material.color.setHex(strokeColor)
      ring.position.set(opts.snapPoint.x, opts.snapPoint.y + 0.06, opts.snapPoint.z)
      ring.visible = true
    } else if (this.previewSnapRing) {
      this.previewSnapRing.visible = false
    }
  }

  /**
   * Previsualización de un contorno poligonal (techo en trazo). Dibuja los
   * segmentos que unen los puntos en orden; `closed` une el último con el
   * primero. Es independiente de `setToolPreview` (que traza un solo segmento),
   * de modo que la herramienta de muro no se ve afectada.
   */
  setPolygonPreview(points: THREE.Vector3[], closed = true): void {
    const line = (this.previewPolygon ??= this.createPreviewPolygon())
    const pts = closed && points.length >= 3 ? [...points, points[0]] : points
    const count = pts.length
    if (count < 2) {
      line.visible = false
      return
    }
    let attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!attribute || attribute.count < count) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      line.geometry.dispose()
      line.geometry = geometry
      attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute
    }
    for (let i = 0; i < count; i++) {
      attribute.setXYZ(i, pts[i].x, pts[i].y, pts[i].z)
    }
    line.geometry.setDrawRange(0, count)
    attribute.needsUpdate = true
    line.geometry.computeBoundingSphere()
    line.visible = true
  }

  private createPreviewLine(): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: SELECTED_COLOR, depthTest: false, transparent: true, opacity: 0.95 })
    )
    line.frustumCulled = false
    line.renderOrder = 999
    line.visible = false
    this.scene.add(line)
    return line
  }

  private createPreviewPolygon(): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: SELECTED_COLOR, depthTest: false, transparent: true, opacity: 0.95 })
    )
    line.frustumCulled = false
    line.renderOrder = 999
    line.visible = false
    this.scene.add(line)
    return line
  }

  private createPreviewMarker(): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12),
      new THREE.MeshBasicMaterial({ color: SELECTED_COLOR, depthTest: false, transparent: true, opacity: 0.9 })
    )
    mesh.renderOrder = 1000
    mesh.visible = false
    this.scene.add(mesh)
    return mesh
  }

  /** Visibilidad/color de una capa: se guarda para mallas futuras y se aplica a las actuales. */
  applyLayer(layer: Layer): void {
    if (!layer.wallType) return

    this.layerStates.set(layer.wallType, { visible: layer.visible, color: layer.color })
    this.wallMeshes.forEach((mesh, id) => {
      if (this.wallTypes.get(id) !== layer.wallType) return
      // Si el muro lleva material de catálogo, su tinte manda sobre el color de capa.
      const wall = this.sceneManager.getWall(id)
      const tint = materialTint(wall?.materialId ?? null, layer.color)
      this.applyMaterialState(mesh, layer.visible, tint)
    })
    // El ojo por piso puede estar ocultando mallas de esta capa: se recombina.
    this.refreshLevelVisuals()
  }

  private applyLayerStateToMesh(wall: Wall, mesh: THREE.Mesh): void {
    const state = this.layerStates.get(wall.type)
    if (state) this.applyMaterialState(mesh, state.visible, materialTint(wall.materialId, state.color))
  }

  private applyMaterialState(mesh: THREE.Mesh, visible: boolean, color: number): void {
    mesh.visible = visible
    const material = mesh.material as THREE.MeshStandardMaterial
    material.color?.setHex(color)
  }

  /* ---------- Pisos: visibilidad (ojo) y atenuación del piso activo ---------- */

  /** Estado visual de render de un piso: oculto, normal (activo) o al 40 %. */
  private levelVisual(levelId: string): { visible: boolean; opacity: number } {
    const visible = this.sceneManager.isLevelVisible(levelId)
    // Con un solo piso no hay nada que atenuar: todo a opacidad plena.
    if (this.sceneManager.getLevels().length <= 1) return { visible, opacity: 1 }
    return {
      visible,
      opacity: levelId === this.sceneManager.getActiveLevelId() ? 1 : LEVEL_ATTENUATION
    }
  }

  private applyLevelVisualToWall(wall: Wall, mesh: THREE.Mesh): void {
    const layerVisible = this.layerStates.get(wall.type)?.visible ?? true
    const level = this.levelVisual(wall.levelId)
    mesh.visible = (wall.visible ?? true) && layerVisible && level.visible
    this.setMeshOpacity(mesh, level.opacity)
  }

  private applyLevelVisualToObject(object: SceneObject, mesh: THREE.Mesh): void {
    const level = this.levelVisual(object.levelId)
    mesh.visible = (object.visible ?? true) && level.visible
    this.setMeshOpacity(mesh, level.opacity)
  }

  /** Fija opacidad/transparencia de la malla (los materiales son clones por malla). */
  private setMeshOpacity(mesh: THREE.Mesh, opacity: number): void {
    for (const m of materialArray(mesh.material)) {
      const material = m as THREE.MeshStandardMaterial & { transmission?: number }
      const isPhysicalGlass = typeof material.transmission === 'number' && material.transmission > 0
      if (isPhysicalGlass) {
        const targetOpacity = opacity < 1 ? Math.min(0.35, opacity * 0.35) : 0.35
        if (material.opacity !== targetOpacity) {
          material.opacity = targetOpacity
          material.transparent = true
          material.needsUpdate = true
        }
        continue
      }
      const transparent = opacity < 1
      if (material.opacity === opacity && material.transparent === transparent) continue
      material.opacity = opacity
      material.transparent = transparent
      material.needsUpdate = true
    }
  }

  /** Repinta visibilidad + atenuación de todas las mallas (cambio de pisos). */
  private refreshLevelVisuals(): void {
    for (const [id, mesh] of this.wallMeshes) {
      const wall = this.sceneManager.getWall(id)
      if (wall) this.applyLevelVisualToWall(wall, mesh)
    }
    for (const [id, mesh] of this.objectMeshes) {
      const object = this.sceneManager.getObject(id)
      if (object) this.applyLevelVisualToObject(object, mesh)
    }
  }

  /** Aplica el estado del Viewport3DController a las dos cámaras del lienzo. */
  syncCamera(): void {
    const position = this.cameraController.cameraPosition
    const target = this.cameraController.state.target

    this.perspectiveCamera.position.copy(position)
    this.perspectiveCamera.lookAt(target)
    // `near` dinámico: proporcional a la distancia de órbita y acotado, para
    // que la cámara pueda entrar en una habitación sin recortar los muros
    // próximos (0.03 × distancia entre 0.05 y 1.5 m).
    const distance = this.cameraController.state.distance
    this.perspectiveCamera.near = Math.min(Math.max(distance * 0.03, 0.05), 1.5)
    this.perspectiveCamera.updateProjectionMatrix()
    this.orthographicCamera.position.copy(position)
    this.orthographicCamera.lookAt(target)
    this.updateOrthoFrustum()
  }

  /**
   * La planta 2D comparte el zoom del estado orbital: se traduce la distancia
   * a un frustum ortográfico equivalente al de la cámara en perspectiva, para
   * que el cambio 2D↔3D no dé un salto visual.
   */
  private updateOrthoFrustum(): void {
    const distance = this.cameraController.state.distance
    const halfHeight = distance * Math.tan((this.perspectiveCamera.fov * Math.PI) / 360)
    const halfWidth = halfHeight * this.aspect

    this.orthographicCamera.left = -halfWidth
    this.orthographicCamera.right = halfWidth
    this.orthographicCamera.top = halfHeight
    this.orthographicCamera.bottom = -halfHeight
    this.orthographicCamera.updateProjectionMatrix()
  }

  /**
   * Dirección (unitaria) del rayo que sale de la cámara y pasa por el píxel
   * indicado. La usa `ui/ViewportInteractions.ts` para hacer zoom hacia el
   * punto donde apunta el cursor. Devuelve null si el canvas aún no tiene
   * tamaño medible.
   */
  pointerRayDirection(clientX: number, clientY: number): THREE.Vector3 | null {
    return this.setupPointerRay(clientX, clientY)
      ? this.raycaster.ray.direction.clone().normalize()
      : null
  }

  /**
   * Punto del plano de trabajo (y = 0) bajo el cursor, para la lectura de
   * coordenadas del lienzo ("Status: x, z").
   */
  pointerToGround(clientX: number, clientY: number): THREE.Vector3 | null {
    if (!this.setupPointerRay(clientX, clientY)) return null

    const hit = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null
  }

  private setupPointerRay(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false

    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    this.activeCamera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.pointerNdc, this.activeCamera)
    return true
  }

  resize(): void {
    const parent = this.canvas.parentElement
    const width = parent ? parent.clientWidth : this.canvas.clientWidth
    const height = parent ? parent.clientHeight : this.canvas.clientHeight
    if (width === 0 || height === 0) return

    this.aspect = width / Math.max(height, 1)
    this.renderer.setSize(width, height, false)
    this.perspectiveCamera.aspect = this.aspect
    this.perspectiveCamera.updateProjectionMatrix()
    this.updateOrthoFrustum()
  }

  /**
   * Captura el lienzo 3D en PNG y devuelve los datos en base64.
   *
   * Se usa en la exportación de imágenes: fuerza un render con la cámara
   * activa y lee el `canvas` con `toDataURL`. El canvas se crea con
   * `preserveDrawingBuffer: false`, así que hay que renderizar justo antes
   * de leerlo o el búfer puede venir vacío.
   *
   * @param quality calidad JPEG/PNG (0–1). Si es `undefined`, se exporta PNG.
   */
  capturePng(
    mimeType: 'image/png' | 'image/jpeg' | Record<string, unknown> = 'image/png',
    quality?: number,
    options?: Record<string, unknown>
  ): string {
    // Permite llamar capturePng(options) directamente.
    let resolvedMimeType: 'image/png' | 'image/jpeg' = 'image/png'
    let resolvedQuality = quality
    let opts: Record<string, unknown> = options ?? {}
    if (typeof mimeType === 'object' && mimeType !== null) {
      opts = mimeType as Record<string, unknown>
      resolvedMimeType = 'image/png'
      resolvedQuality = undefined
    } else if (typeof mimeType === 'string') {
      resolvedMimeType = mimeType as 'image/png' | 'image/jpeg'
    }

    const rawScale = opts.scale ?? opts.resolution ?? opts.pixelRatio ?? 1
    const scaleCandidate = Number(rawScale)
    const scale = [1, 2, 4].includes(scaleCandidate) ? scaleCandidate : 1
    const transparent = Boolean(opts.transparent ?? opts.alpha ?? (opts.background === 'transparent'))
    const bg = opts.backgroundColor ?? opts.background
    const hideGrid = opts.hideGrid ?? opts.hideGridAndGizmos ?? true
    const hideGizmos = opts.hideGizmos ?? opts.hideHelpers ?? opts.hideGizmosAndGrid ?? true

    const originalWidth = this.renderer.domElement.width || this.canvas.clientWidth || 1280
    const originalHeight = this.renderer.domElement.height || this.canvas.clientHeight || 720
    const prevPixelRatio = this.renderer.getPixelRatio()
    const prevBackground = this.scene.background
    const prevClearColor = this.renderer.getClearColor(new THREE.Color())
    const prevClearAlpha = this.renderer.getClearAlpha()
    const prevGridVisible = this.gridSystem.group.visible
    const prevGizmoVisible = this.transformControls?.visible
    const prevPreviewLine = this.previewLine?.visible
    const prevPreviewMarker = this.previewMarker?.visible
    const prevPreviewPolygon = this.previewPolygon?.visible

    try {
      if (hideGrid) this.gridSystem.group.visible = false
      if (hideGizmos) {
        if (this.transformControls) this.transformControls.visible = false
        if (this.previewLine) this.previewLine.visible = false
        if (this.previewMarker) this.previewMarker.visible = false
        if (this.previewPolygon) this.previewPolygon.visible = false
      }
      if (transparent) {
        this.scene.background = null
        this.renderer.setClearColor(0x000000, 0)
      } else if (bg !== undefined && bg !== null && bg !== 'transparent') {
        const color = new THREE.Color(bg as string | number)
        this.scene.background = color
        this.renderer.setClearColor(color, 1)
      }
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(originalWidth * scale, originalHeight * scale, false)
      this.renderer.render(this.scene, this.activeCamera)
      const dataUrl = this.canvas.toDataURL(resolvedMimeType, resolvedQuality)
      const comma = dataUrl.indexOf(',')
      return comma >= 0 ? dataUrl.slice(comma + 1) : ''
    } finally {
      this.gridSystem.group.visible = prevGridVisible
      if (this.transformControls && prevGizmoVisible !== undefined) this.transformControls.visible = prevGizmoVisible
      if (this.previewLine && prevPreviewLine !== undefined) this.previewLine.visible = prevPreviewLine
      if (this.previewMarker && prevPreviewMarker !== undefined) this.previewMarker.visible = prevPreviewMarker
      if (this.previewPolygon && prevPreviewPolygon !== undefined) this.previewPolygon.visible = prevPreviewPolygon
      this.scene.background = prevBackground
      this.renderer.setClearColor(prevClearColor, prevClearAlpha)
      this.renderer.setPixelRatio(prevPixelRatio)
      this.renderer.setSize(originalWidth, originalHeight, false)
    }
  }

  /** Registra un callback que se ejecuta antes de cada fotograma (animaciones MEP, efectos, etc.). */
  onBeforeRender(fn: (deltaTime: number) => void): () => void {
    this.beforeRenderListeners.push(fn)
    return () => {
      const idx = this.beforeRenderListeners.indexOf(fn)
      if (idx >= 0) this.beforeRenderListeners.splice(idx, 1)
    }
  }

  /** Fuerza el renderizado inmediato de un fotograma en el lienzo WebGL (útil durante grabación a 60 FPS). */
  renderFrame(): void {
    if (this.disposed) return
    this.renderer.render(this.scene, this.activeCamera)
  }

  /**
   * Bucle de render del lienzo. Se reagenda a sí mismo, pero con una salida
   * explícita y alcanzable: si el lienzo deja de estar en el documento, el bucle
   * se detiene en lugar de quedarse renderizando para siempre una escena
   * huérfana; `dispose()` además lo cancela de inmediato.
   */
  private animate = (): void => {
    if (this.disposed) return
    if (!this.canvas.isConnected) {
      this.dispose()
      return
    }

    const now = performance.now()
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000)
    this.lastFrameTime = now

    for (const fn of this.beforeRenderListeners) {
      try {
        fn(dt)
      } catch (err) {
        console.error('[ViewportRenderer] Error en onBeforeRender:', err)
      }
    }

    this.rafId = requestAnimationFrame(this.animate)
    this.renderer.render(this.scene, this.activeCamera)
  }

  /** Detiene el bucle de render y libera el listener de resize y el observador. Idempotente. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.unsubscribeTheme?.()
    this.unsubscribeTheme = null
    if (this.transformControls) {
      this.transformControls.detach()
      this.scene.remove(this.transformControls)
      this.transformControls.dispose()
      this.transformControls = null
    }
    this.gridSystem.dispose()
    this.scene.remove(this.gridSystem.group)

    this.envTexture?.dispose()
    this.envTexture = null
    this.scene.environment = null
    window.removeEventListener('resize', this.onWindowResize)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null

    // Mallas de muros y objetos: cada una libera su geometría y su material.
    // Los clones comparten la textura cacheada del catálogo, así que el
    // `dispose()` del material no libera la textura (la lleva la biblioteca).
    for (const mesh of this.wallMeshes.values()) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.wallMeshes.clear()
    for (const mesh of this.objectMeshes.values()) {
      this.scene.remove(mesh)
      disposeObjectChildren(mesh)
      mesh.geometry.dispose()
      disposeMaterial(mesh.material)
    }
    this.objectMeshes.clear()

    // Libera la previsualización de la herramienta activa.
    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      this.previewLine.material.dispose()
      this.previewLine = null
    }
    if (this.previewMarker) {
      this.scene.remove(this.previewMarker)
      this.previewMarker.geometry.dispose()
      this.previewMarker.material.dispose()
      this.previewMarker = null
    }
    if (this.previewPolygon) {
      this.scene.remove(this.previewPolygon)
      this.previewPolygon.geometry.dispose()
      this.previewPolygon.material.dispose()
      this.previewPolygon = null
    }
    if (this.previewTemplateLines) {
      this.previewTemplateLines.geometry.dispose()
      this.previewTemplateLines.material.dispose()
      this.previewTemplateLines = null
    }
    if (this.previewTemplateFill) {
      this.previewTemplateFill.geometry.dispose()
      this.previewTemplateFill.material.dispose()
      this.previewTemplateFill = null
    }
    if (this.previewTemplateGroup) {
      this.scene.remove(this.previewTemplateGroup)
      this.previewTemplateGroup = null
    }
    if (this.previewSnapRing) {
      this.scene.remove(this.previewSnapRing)
      this.previewSnapRing.geometry.dispose()
      this.previewSnapRing.material.dispose()
      this.previewSnapRing = null
    }
    if (this.wallEndpointStartGrip) {
      this.scene.remove(this.wallEndpointStartGrip)
      this.wallEndpointStartGrip.geometry.dispose()
      this.wallEndpointStartGrip.material.dispose()
      this.wallEndpointStartGrip = null
    }
    if (this.wallEndpointEndGrip) {
      this.scene.remove(this.wallEndpointEndGrip)
      this.wallEndpointEndGrip.geometry.dispose()
      this.wallEndpointEndGrip.material.dispose()
      this.wallEndpointEndGrip = null
    }
  }
}
