import * as THREE from 'three'
import { CameraState, Axis3D } from '../models/CameraState'

/**
 * Controlador de cámara puro (sin dependencias del DOM más allá de tipos
 * de Three.js). Traduce gestos de entrada -delta de ratón, rueda- en
 * cambios sobre un CameraState, y expone la posición/mirada resultante
 * para que el renderer las aplique a la THREE.PerspectiveCamera.
 *
 * Se mantiene separado de la UI a propósito, igual que en la versión WPF
 * (Engine/Viewport3DController.cs).
 */
export class Viewport3DController {
  state: CameraState

  orbitSensitivity = 0.0075
  panSensitivity = 0.0025
  zoomSensitivity = 0.0015
  is2DMode = false

  constructor(initialState?: CameraState) {
    this.state = initialState ?? new CameraState()
  }

  setIs2DMode(is2D: boolean): void {
    this.is2DMode = is2D
  }

  /** Órbita la cámara alrededor de target según el desplazamiento del ratón. */
  orbit(deltaX: number, deltaY: number): void {
    this.state.yaw -= deltaX * this.orbitSensitivity
    this.state.pitch += deltaY * this.orbitSensitivity
    this.state.clampPitch(this.is2DMode)
  }

  /**
   * Órbita la cámara directamente en radianes (azimutal `deltaYaw` y polar `deltaPitch`),
   * usado por el bucle fluido `requestAnimationFrame` de navegación por teclado.
   */
  orbitAngles(deltaYaw: number, deltaPitch: number): void {
    this.state.yaw += deltaYaw
    this.state.pitch += deltaPitch
    this.state.clampPitch(this.is2DMode)
  }

  /** Desplaza el punto target en el plano de la pantalla (pan). */
  pan(deltaX: number, deltaY: number): void {
    const camPos = this.state.computePosition()
    const forward = new THREE.Vector3().subVectors(this.state.target, camPos).normalize()
    const worldUp = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward)

    const scale = this.state.distance * this.panSensitivity
    const offset = right
      .multiplyScalar(-deltaX * scale)
      .add(up.multiplyScalar(deltaY * scale))

    this.state.target.add(offset)
  }

  /**
   * Desplaza `target` (y con él la cámara) sobre el plano horizontal XZ
   * según el ángulo azimutal actual (`yaw`), escalado por `distance`.
   *
   * - `rightStep > 0`: desplaza lateralmente a la derecha (+X con `yaw = 0`).
   * - `forwardStep > 0`: desplaza hacia adelante en 3D o hacia arriba en Planta 2D (−Z con `yaw = 0`).
   */
  panPlanar(rightStep: number, forwardStep: number): void {
    const sinY = Math.sin(this.state.yaw)
    const cosY = Math.cos(this.state.yaw)
    const scale = Math.max(this.state.distance, 1)
    this.state.target.x += (cosY * rightStep - sinY * forwardStep) * scale
    this.state.target.z += (-sinY * rightStep - cosY * forwardStep) * scale
  }

  /**
   * Aplica zoom multiplicando la distancia cámara→target (rueda del ratón,
   * pellizco táctil). Si se pasa `focusDirection` (dirección unitaria del rayo
   * que sale de la cámara hacia el cursor), el target -y con él la cámara- se
   * desplazan a lo largo de ese rayo lo mismo que se acercó/alejó el dolly,
   * de modo que el zoom se siente "hacia el punto donde apunta el cursor"
   * (mismo criterio que `zoomToCursor` de OrbitControls).
   *
   * @param factor           >1 aleja la cámara, <1 la acerca.
   * @param focusDirection   Dirección normalizada del rayo del cursor (opcional).
   */
  zoomByFactor(factor: number, focusDirection?: THREE.Vector3 | null): void {
    if (!Number.isFinite(factor) || factor <= 0) return

    const previousDistance = this.state.distance
    // Dirección de vista y posición de cámara *antes* de tocar la distancia:
    // se necesitan para reproducir el "zoom hacia el cursor" de OrbitControls.
    const previousPosition = this.state.computePosition()
    const forward = new THREE.Vector3().subVectors(this.state.target, previousPosition).normalize()

    this.state.distance = previousDistance * factor
    this.state.clampDistance()

    const radiusDelta = previousDistance - this.state.distance
    if (focusDirection && radiusDelta !== 0) {
      // La cámara se desplaza a lo largo del rayo del cursor y el target se
      // recoloca para conservar la distancia y la orientación, de forma que el
      // punto bajo el cursor se queda en el mismo píxel de la pantalla.
      const direction = focusDirection.clone().normalize().sub(forward)
      this.state.target.addScaledVector(direction, radiusDelta)
    }
  }

  /**
   * Zoom continuo con la rueda del ratón. `wheelDelta` es el `deltaY` del
   * evento: por defecto rueda hacia abajo acerca (comportamiento histórico
   * del proyecto); el signo se invierte con `wheelDirection: -1` en
   * `ui/ViewportInteractions.ts`.
   */
  zoom(wheelDelta: number, focusDirection?: THREE.Vector3 | null): void {
    const factor = Math.exp(-wheelDelta * this.zoomSensitivity)
    this.zoomByFactor(factor, focusDirection)
  }

  /** Fija el zoom a una fracción 0..1 (0 = más cerca, 1 = más lejos), para el slider de la UI. */
  setZoomFraction(fraction01: number): void {
    const f = Math.min(1, Math.max(0, fraction01))
    this.state.distance = this.state.minDistance + f * (this.state.maxDistance - this.state.minDistance)
  }

  /** Fracción 0..1 actual del zoom, para reflejar el estado en el slider. */
  getZoomFraction(): number {
    return (this.state.distance - this.state.minDistance) / (this.state.maxDistance - this.state.minDistance)
  }

  /**
   * Encuadra la cámara para ver todo el contenido dado.
   *
   * Se ajusta a la **esfera envolvente** y al campo de visión más restrictivo
   * entre el vertical y el horizontal (`aspect`), de modo que el modelo entra
   * completo tanto en lienzos apaisados como verticales.
   */
  frameBounds(box: THREE.Box3, aspect = 1, verticalFovDegrees = 45): void {
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1)

    const fovV = (verticalFovDegrees * Math.PI) / 180
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * Math.max(aspect, 1e-4))
    const fitFov = Math.max(Math.min(fovV, fovH), 1e-4)

    this.state.target.copy(center)
    this.state.distance = (radius / Math.sin(fitFov / 2)) * 1.12
    this.state.clampDistance()
  }

  /**
   * Ángulos (yaw, pitch) que sitúan la cámara *mirando desde* la dirección de
   * un eje. `negative` = cara opuesta (−X, −Y, −Z), usada por los extremos de
   * la esfera de navegación. El polo Y se acerca 0.001 rad al ecuador para
   * evitar el gimbal lock exacto (mismo criterio histórico de snapToAxis).
   */
  viewAnglesForAxis(axis: Axis3D, negative = false): { yaw: number; pitch: number } {
    if (axis === Axis3D.X) return { yaw: negative ? -Math.PI / 2 : Math.PI / 2, pitch: 0 }
    if (axis === Axis3D.Y) {
      const polar = Math.PI / 2 - 0.001
      return { yaw: 0, pitch: negative ? -polar : polar }
    }
    return { yaw: negative ? Math.PI : 0, pitch: 0 }
  }

  /** Alinea la vista a uno de los ejes principales (clic en el gizmo X/Y/Z). */
  snapToAxis(axis: Axis3D, negative = false): void {
    const { yaw, pitch } = this.viewAnglesForAxis(axis, negative)
    this.state.yaw = yaw
    this.state.pitch = pitch
  }

  get cameraPosition(): THREE.Vector3 {
    return this.state.computePosition()
  }
}
