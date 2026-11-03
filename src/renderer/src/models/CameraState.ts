import * as THREE from 'three'

/**
 * Estado esférico de la cámara orbital del Viewport 3D, alrededor de un
 * punto de interés (target). Es la forma estándar de modelar una cámara
 * de "órbita" estilo CAD/Blender/AutoCAD, y es la misma representación
 * usada en la versión WPF (Models/CameraState.cs).
 */
export class CameraState {
  target = new THREE.Vector3(0, 0, 0)
  distance = 18
  yaw = Math.PI / 4
  pitch = Math.PI / 6

  // Antes 2 m: impedía entrar en una habitación para comprobar que los muros
  // se ven desde dentro (punto B). 0.3 m permite el recorrido interior real.
  minDistance = 0.3
  maxDistance = 120

  private static readonly PITCH_LIMIT = 1.45 // ~83°, evita gimbal lock en los polos

  clampPitch(): void {
    if (this.pitch > CameraState.PITCH_LIMIT) this.pitch = CameraState.PITCH_LIMIT
    if (this.pitch < -CameraState.PITCH_LIMIT) this.pitch = -CameraState.PITCH_LIMIT
  }

  clampDistance(): void {
    if (this.distance < this.minDistance) this.distance = this.minDistance
    if (this.distance > this.maxDistance) this.distance = this.maxDistance
  }

  /** Calcula la posición cartesiana de la cámara a partir del estado esférico actual. */
  computePosition(): THREE.Vector3 {
    const x = this.target.x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw)
    const y = this.target.y + this.distance * Math.sin(this.pitch)
    const z = this.target.z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)
    return new THREE.Vector3(x, y, z)
  }
}

export enum Axis3D {
  X = 'X',
  Y = 'Y',
  Z = 'Z'
}
