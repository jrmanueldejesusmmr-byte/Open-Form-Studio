import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import { WallSnapshot, wallToSnapshot } from '../models/Wall'
import { SceneObjectSnapshot, objectToSnapshot } from '../models/SceneObject'
import {
  Animation,
  DEFAULT_ANIMATION,
  KeyframeValue,
  SerializedAnimation,
  Track,
  cloneAnimation,
  evaluateTrack,
  fromJSON,
  toJSON
} from './model'

export type AnimationState = 'stopped' | 'playing' | 'paused'

export interface EngineState {
  t: number
  state: AnimationState
  finished: boolean
  duration: number
  speed: number
  loop: boolean
}

interface ScenePlaybackSnapshot {
  walls: WallSnapshot[]
  objects: SceneObjectSnapshot[]
}

/** Lee el valor actual de una propiedad animable de un muro u objeto de la escena. */
export function getSceneElementProperty(
  scene: SceneManager,
  objectId: string,
  property: string
): KeyframeValue | undefined {
  const obj = scene.getObject(objectId)
  if (obj) {
    switch (property) {
      case 'position':
        return obj.position.clone()
      case 'rotation':
        return obj.rotationY
      case 'scale':
        return obj.size.clone()
      case 'visible':
        return obj.visible
      case 'color':
        return obj.color
      case 'openingAngle':
        return obj.openingAngle
      default:
        return undefined
    }
  }

  const wall = scene.getWall(objectId)
  if (wall) {
    switch (property) {
      case 'position':
        return new THREE.Vector3(
          (wall.start.x + wall.end.x) / 2,
          (wall.start.y + wall.end.y) / 2,
          (wall.start.z + wall.end.z) / 2
        )
      case 'rotation':
        return Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x)
      case 'scale':
        return new THREE.Vector3(wall.length, wall.height, wall.thickness)
      case 'visible':
        return wall.visible
      case 'color':
        return wall.color
      case 'openingAngle': {
        const openingIds = new Set(wall.openings.map((o) => o.id))
        const hosted = scene
          .getObjects()
          .find((candidate) => candidate.openingId !== null && openingIds.has(candidate.openingId))
        return hosted ? hosted.openingAngle : 0
      }
      default:
        return undefined
    }
  }

  return undefined
}

/** Aplica un valor interpolado sobre un muro u objeto de la escena (`silent = true` no ensucia el historial). */
export function setSceneElementProperty(
  scene: SceneManager,
  objectId: string,
  property: string,
  value: KeyframeValue,
  silent = true
): void {
  const obj = scene.getObject(objectId)
  if (obj) {
    switch (property) {
      case 'position': {
        if (value instanceof THREE.Vector3) {
          scene.moveObject(obj.id, value.clone(), obj.rotationY, silent)
        }
        return
      }
      case 'rotation': {
        const rotY =
          typeof value === 'number'
            ? value
            : value instanceof THREE.Quaternion
              ? new THREE.Euler().setFromQuaternion(value, 'YXZ').y
              : obj.rotationY
        scene.moveObject(obj.id, obj.position.clone(), rotY, silent)
        return
      }
      case 'scale': {
        if (value instanceof THREE.Vector3) {
          obj.size.set(
            Math.max(0.05, value.x),
            Math.max(0.05, value.y),
            Math.max(0.05, value.z)
          )
        } else if (typeof value === 'number') {
          obj.size.setScalar(Math.max(0.05, value))
        }
        scene.moveObject(obj.id, obj.position.clone(), obj.rotationY, silent)
        return
      }
      case 'visible': {
        obj.visible = Boolean(value)
        scene.moveObject(obj.id, obj.position.clone(), obj.rotationY, silent)
        return
      }
      case 'color': {
        if (typeof value === 'string') {
          obj.color = new THREE.Color(value).getHex()
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          obj.color = Math.round(value)
        }
        scene.moveObject(obj.id, obj.position.clone(), obj.rotationY, silent)
        return
      }
      case 'openingAngle': {
        if (typeof value === 'number' && Number.isFinite(value)) {
          obj.openingAngle = Math.max(0, Math.min(90, value))
          scene.moveObject(obj.id, obj.position.clone(), obj.rotationY, silent)
        }
        return
      }
    }
    return
  }

  const wall = scene.getWall(objectId)
  if (wall) {
    switch (property) {
      case 'position': {
        if (value instanceof THREE.Vector3) {
          const cx = (wall.start.x + wall.end.x) / 2
          const cy = (wall.start.y + wall.end.y) / 2
          const dz = value.z - (wall.start.z + wall.end.z) / 2
          const dx = value.x - cx
          const dy = value.y - cy
          scene.moveWall(
            wall.id,
            new THREE.Vector3(wall.start.x + dx, wall.start.y + dy, wall.start.z + dz),
            new THREE.Vector3(wall.end.x + dx, wall.end.y + dy, wall.end.z + dz),
            silent
          )
        }
        return
      }
      case 'rotation': {
        const theta =
          typeof value === 'number'
            ? value
            : value instanceof THREE.Quaternion
              ? new THREE.Euler().setFromQuaternion(value, 'YXZ').y
              : Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x)
        const cx = (wall.start.x + wall.end.x) / 2
        const cz = (wall.start.z + wall.end.z) / 2
        const half = Math.max(0.05, wall.length / 2)
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        scene.moveWall(
          wall.id,
          new THREE.Vector3(cx - cos * half, wall.start.y, cz - sin * half),
          new THREE.Vector3(cx + cos * half, wall.end.y, cz + sin * half),
          silent
        )
        return
      }
      case 'scale': {
        if (value instanceof THREE.Vector3) {
          wall.height = Math.max(0.1, value.y)
          wall.thickness = Math.max(0.05, value.z)
          const targetLen = Math.max(0.1, value.x)
          const cx = (wall.start.x + wall.end.x) / 2
          const cz = (wall.start.z + wall.end.z) / 2
          const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x)
          const half = targetLen / 2
          scene.moveWall(
            wall.id,
            new THREE.Vector3(cx - Math.cos(angle) * half, wall.start.y, cz - Math.sin(angle) * half),
            new THREE.Vector3(cx + Math.cos(angle) * half, wall.end.y, cz + Math.sin(angle) * half),
            silent
          )
        }
        return
      }
      case 'visible': {
        wall.visible = Boolean(value)
        scene.moveWall(wall.id, wall.start.clone(), wall.end.clone(), silent)
        return
      }
      case 'color': {
        if (typeof value === 'string') {
          wall.color = new THREE.Color(value).getHex()
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          wall.color = Math.round(value)
        }
        scene.moveWall(wall.id, wall.start.clone(), wall.end.clone(), silent)
        return
      }
      case 'openingAngle': {
        if (typeof value === 'number' && Number.isFinite(value)) {
          const clamped = Math.max(0, Math.min(90, value))
          const openingIds = new Set(wall.openings.map((o) => o.id))
          for (const candidate of scene.getObjects()) {
            if (candidate.openingId !== null && openingIds.has(candidate.openingId)) {
              candidate.openingAngle = clamped
              scene.moveObject(candidate.id, candidate.position.clone(), candidate.rotationY, silent)
            }
          }
        }
        return
      }
    }
  }
}

/** Evalúa todas las pistas en el instante `t` y aplica los valores interpolados a la escena. */
export function applyTracksAtTime(
  scene: SceneManager,
  tracks: readonly Track[],
  t: number,
  silent = true
): void {
  for (const track of tracks) {
    if (track.keyframes.length === 0) continue
    const val = evaluateTrack(track, t)
    if (val !== undefined) {
      setSceneElementProperty(scene, track.objectId, track.property, val, silent)
    }
  }
}

export class AnimationEngine {
  private duration: number = DEFAULT_ANIMATION.duration
  private fps: number = DEFAULT_ANIMATION.fps
  private t: number = 0
  private state: AnimationState = 'stopped'
  private playing: boolean = false
  private loop: boolean = false
  private speed: number = 1
  private tracks: Track[] = []
  private scene: SceneManager | null = null
  private savedSceneSnapshot: ScenePlaybackSnapshot | null = null
  private onUpdate: (state: EngineState) => void
  private onFinished: () => void
  private rafId: number = 0
  private lastFrameTime: number | null = null

  constructor(
    options: {
      scene?: SceneManager
      onUpdate?: (state: EngineState) => void
      onFinished?: () => void
    } = {}
  ) {
    this.scene = options.scene ?? null
    this.onUpdate = options.onUpdate ?? (() => {})
    this.onFinished = options.onFinished ?? (() => {})
  }

  setScene(scene: SceneManager | null): void {
    this.scene = scene
  }

  setTracks(tracks: Track[]): void {
    this.tracks = tracks
  }

  getTracks(): Track[] {
    return this.tracks
  }

  setDuration(duration: number): void {
    if (Number.isFinite(duration) && duration > 0) {
      this.duration = duration
      if (this.t > this.duration) this.t = this.duration
    }
  }

  getDuration(): number {
    return this.duration
  }

  setFps(fps: number): void {
    if (Number.isFinite(fps) && fps > 0) {
      this.fps = fps
    }
  }

  getFps(): number {
    return this.fps
  }

  setLoop(loop: boolean): void {
    this.loop = loop
  }

  getLoop(): boolean {
    return this.loop
  }

  setSpeed(speed: number): void {
    if (Number.isFinite(speed) && speed > 0) {
      this.speed = speed
    }
  }

  getSpeed(): number {
    return this.speed
  }

  /** ¿Está la edición bloqueada porque hay una reproducción activa o en pausa? */
  isEditingLocked(): boolean {
    return this.state !== 'stopped'
  }

  private captureSceneSnapshot(): void {
    if (!this.scene || this.savedSceneSnapshot !== null) return
    this.savedSceneSnapshot = {
      walls: this.scene.getWalls().map((w) => wallToSnapshot(w)),
      objects: this.scene.getObjects().map((o) => objectToSnapshot(o))
    }
  }

  private restoreSceneSnapshot(): void {
    if (!this.scene || !this.savedSceneSnapshot) return
    const snapshot = this.savedSceneSnapshot
    this.savedSceneSnapshot = null

    for (const wSnap of snapshot.walls) {
      const wall = this.scene.getWall(wSnap.id)
      if (!wall) continue
      wall.height = wSnap.height
      wall.thickness = wSnap.thickness
      wall.color = wSnap.color
      wall.materialId = wSnap.materialId ?? null
      wall.visible = wSnap.visible ?? true
      this.scene.moveWall(wall.id, wSnap.start.clone(), wSnap.end.clone(), true)
    }

    for (const oSnap of snapshot.objects) {
      const obj = this.scene.getObject(oSnap.id)
      if (!obj) continue
      obj.size.set(oSnap.size.width, oSnap.size.height, oSnap.size.depth)
      obj.color = oSnap.color
      obj.materialId = oSnap.materialId ?? null
      obj.openingAngle = oSnap.openingAngle ?? 0
      obj.visible = oSnap.visible ?? true
      this.scene.moveObject(
        obj.id,
        new THREE.Vector3(oSnap.position.x, oSnap.position.y, oSnap.position.z),
        oSnap.rotationY,
        true
      )
    }
  }

  togglePlayPause(): void {
    if (this.state === 'stopped') this.play()
    else if (this.state === 'playing') this.pause()
    else if (this.state === 'paused') this.resume()
  }

  play(): void {
    if (this.state === 'paused') {
      this.resume()
      return
    }
    this.captureSceneSnapshot()
    if (this.t >= this.duration) {
      this.t = 0
    }
    this.state = 'playing'
    this.playing = true
    this.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0
    if (this.scene) {
      applyTracksAtTime(this.scene, this.tracks, this.t, true)
    }
    this.onUpdate(this.getState())
    this.scheduleFrame()
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.cancelFrame()
    this.state = 'paused'
    this.playing = false
    this.lastFrameTime = null
    this.onUpdate(this.getState())
  }

  resume(): void {
    if (this.state !== 'paused') {
      this.play()
      return
    }
    this.state = 'playing'
    this.playing = true
    this.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0
    this.onUpdate(this.getState())
    this.scheduleFrame()
  }

  stop(): void {
    this.cancelFrame()
    this.t = 0
    this.state = 'stopped'
    this.playing = false
    this.lastFrameTime = null
    this.restoreSceneSnapshot()
    this.onUpdate(this.getState())
  }

  private scheduleFrame(): void {
    this.cancelFrame()
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame((now) => this.onAnimationFrame(now))
    }
  }

  private cancelFrame(): void {
    if (this.rafId !== 0 && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  private onAnimationFrame(now: number): void {
    this.rafId = 0
    if (!this.playing || this.state !== 'playing') return
    const prev = this.lastFrameTime ?? now
    this.lastFrameTime = now
    const deltaMs = Math.max(0, now - prev)
    this.step(deltaMs / 1000)
    if (this.playing && this.state === 'playing') {
      this.scheduleFrame()
    }
  }

  /** Avanza el tiempo en `deltaSeconds` (escalado por `speed`) y aplica los valores interpolados. */
  step(deltaSeconds: number): void {
    if (!this.playing || this.state !== 'playing') return
    this.t += Math.max(0, deltaSeconds) * this.speed

    if (this.t >= this.duration) {
      if (this.loop && this.duration > 0) {
        this.t = this.t % this.duration
        if (this.scene) {
          applyTracksAtTime(this.scene, this.tracks, this.t, true)
        }
        this.onUpdate(this.getState())
        return
      }
      this.t = this.duration
      this.state = 'stopped'
      this.playing = false
      this.lastFrameTime = null
      if (this.scene) {
        applyTracksAtTime(this.scene, this.tracks, this.t, true)
      }
      this.onFinished()
      this.onUpdate(this.getState())
      return
    }

    if (this.scene) {
      applyTracksAtTime(this.scene, this.tracks, this.t, true)
    }
    this.onUpdate(this.getState())
  }

  /** Mueve el cabezal al instante `t` y aplica los valores interpolados a la escena. */
  seek(t: number): void {
    this.t = Math.max(0, Math.min(t, this.duration))
    if (this.scene) {
      applyTracksAtTime(this.scene, this.tracks, this.t, true)
    }
    this.onUpdate(this.getState())
  }

  /** Elimina todas las pistas asociadas a un objeto o muro borrado. */
  removeTracksForObject(objectId: string): boolean {
    const beforeLen = this.tracks.length
    this.tracks = this.tracks.filter((track) => track.objectId !== objectId)
    return this.tracks.length !== beforeLen
  }

  toAnimation(): Animation {
    return cloneAnimation({
      duration: this.duration,
      fps: this.fps,
      tracks: this.tracks
    })
  }

  loadAnimation(animation: Animation): void {
    const cloned = cloneAnimation(animation)
    this.duration = cloned.duration
    this.fps = cloned.fps
    this.tracks = cloned.tracks
    if (this.t > this.duration) this.t = 0
  }

  toJSON(): SerializedAnimation {
    return toJSON(this.toAnimation())
  }

  fromJSON(raw: unknown): Animation {
    const anim = fromJSON(raw)
    this.loadAnimation(anim)
    return anim
  }

  getState(): EngineState {
    return {
      t: this.t,
      state: this.state,
      finished: this.t >= this.duration && !this.playing && !this.loop,
      duration: this.duration,
      speed: this.speed,
      loop: this.loop
    }
  }
}
