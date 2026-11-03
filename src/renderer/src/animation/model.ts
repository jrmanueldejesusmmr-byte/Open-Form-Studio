/**
 * Modelos de datos para animación 3D.
 *
 * Estilo Blender: el usuario decide qué, cómo y dónde animar.
 *
 * - Animation: duración y pistas.
 * - Track: objeto y propiedad con sus keyframes.
 * - Keyframe: instante (t), valor e interpolación.
 */
import * as THREE from 'three'

/** Tipo de interpolación por fotograma */
export type Interpolation = 'linear' | 'easeInOut' | 'constant'

/** Propiedades animables soportadas por ArqStudio 3D */
export type AnimatableProperty =
  | 'position'
  | 'rotation'
  | 'scale'
  | 'visible'
  | 'color'
  | 'openingAngle'

export const ANIMATABLE_PROPERTIES: readonly {
  id: AnimatableProperty
  label: string
}[] = [
  { id: 'position', label: 'Posición' },
  { id: 'rotation', label: 'Rotación' },
  { id: 'scale', label: 'Escala' },
  { id: 'visible', label: 'Visibilidad' },
  { id: 'color', label: 'Color' },
  { id: 'openingAngle', label: 'Ángulo de apertura' }
] as const

export type KeyframeValue = number | THREE.Vector3 | THREE.Quaternion | boolean | string

/** Un fotograma en la línea de tiempo */
export interface Keyframe {
  /** Tiempo en segundos (basado en el FPS) */
  t: number
  /** Valor en el espacio de la propiedad */
  value: KeyframeValue
  /** Interpolación elegible por fotograma */
  interpolation?: Interpolation
}

/** Una pista por objeto: qué propiedad de ese objeto se anima */
export interface Track {
  /** Id del objeto 3D animado */
  objectId: string
  /** Nombre de la propiedad animable */
  property: string
  /** Keyframes ordenados por tiempo */
  keyframes: Keyframe[]
}

/** Datos completos de una animación */
export interface Animation {
  /** Duración en segundos (por defecto 10) */
  duration: number
  /** Referencia de FPS (por defecto 30) */
  fps: number
  /** Pistas de animación */
  tracks: Track[]
}

/** Animación por defecto: 10 s a 30 FPS sin pistas */
export const DEFAULT_ANIMATION: Animation = {
  duration: 10,
  fps: 30,
  tracks: []
}

/** Clona un valor de fotograma sin compartir referencias mutables (Vector3 / Quaternion). */
export function cloneKeyframeValue(value: KeyframeValue): KeyframeValue {
  if (value instanceof THREE.Vector3) return value.clone()
  if (value instanceof THREE.Quaternion) return value.clone()
  return value
}

/** Clona una pista completa. */
export function cloneTrack(track: Track): Track {
  return {
    objectId: track.objectId,
    property: track.property,
    keyframes: track.keyframes.map((kf) => ({
      t: kf.t,
      value: cloneKeyframeValue(kf.value),
      ...(kf.interpolation ? { interpolation: kf.interpolation } : {})
    }))
  }
}

/** Clona una animación completa. */
export function cloneAnimation(animation: Animation): Animation {
  return {
    duration: animation.duration,
    fps: animation.fps,
    tracks: animation.tracks.map(cloneTrack)
  }
}

/** Compara si dos valores de fotograma son equivalentes. */
export function keyframeValuesEqual(a: KeyframeValue, b: KeyframeValue): boolean {
  if (a instanceof THREE.Vector3 && b instanceof THREE.Vector3) {
    return a.distanceToSquared(b) < 1e-8
  }
  if (a instanceof THREE.Quaternion && b instanceof THREE.Quaternion) {
    return (
      Math.abs(a.x - b.x) < 1e-5 &&
      Math.abs(a.y - b.y) < 1e-5 &&
      Math.abs(a.z - b.z) < 1e-5 &&
      Math.abs(a.w - b.w) < 1e-5
    )
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-5
  }
  return a === b
}

/** Curva de interpolación normalizada en [0, 1]. */
export function applyEasing(u: number, interpolation: Interpolation = 'linear'): number {
  const clamped = Math.max(0, Math.min(1, u))
  if (interpolation === 'constant') return 0
  if (interpolation === 'easeInOut') {
    return clamped < 0.5
      ? 2 * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 2) / 2
  }
  return clamped
}

/** Interpola entre dos valores según el tipo de dato y la propiedad. */
export function interpolateValue(
  v0: KeyframeValue,
  v1: KeyframeValue,
  rawAlpha: number,
  interpolation: Interpolation = 'linear',
  property?: string
): KeyframeValue {
  if (interpolation === 'constant') {
    return rawAlpha >= 1 ? cloneKeyframeValue(v1) : cloneKeyframeValue(v0)
  }

  const alpha = applyEasing(rawAlpha, interpolation)

  if (v0 instanceof THREE.Vector3 && v1 instanceof THREE.Vector3) {
    return v0.clone().lerp(v1, alpha)
  }

  if (v0 instanceof THREE.Quaternion && v1 instanceof THREE.Quaternion) {
    return v0.clone().slerp(v1, alpha)
  }

  if (property === 'color') {
    const c0 = new THREE.Color(typeof v0 === 'number' || typeof v0 === 'string' ? v0 : 0xffffff)
    const c1 = new THREE.Color(typeof v1 === 'number' || typeof v1 === 'string' ? v1 : 0xffffff)
    c0.lerp(c1, alpha)
    return typeof v0 === 'string' ? `#${c0.getHexString()}` : c0.getHex()
  }

  if (typeof v0 === 'number' && typeof v1 === 'number') {
    return v0 + (v1 - v0) * alpha
  }

  if (typeof v0 === 'boolean' && typeof v1 === 'boolean') {
    return alpha < 1 ? v0 : v1
  }

  return alpha < 1 ? cloneKeyframeValue(v0) : cloneKeyframeValue(v1)
}

/** Evalúa una pista en el instante `t` (en segundos). */
export function evaluateTrack(track: Track, t: number): KeyframeValue | undefined {
  const kfs = track.keyframes
  if (kfs.length === 0) return undefined
  const sorted = [...kfs].sort((a, b) => a.t - b.t)

  if (t <= sorted[0].t) {
    return cloneKeyframeValue(sorted[0].value)
  }
  const last = sorted[sorted.length - 1]
  if (t >= last.t) {
    return cloneKeyframeValue(last.value)
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const kf0 = sorted[i]
    const kf1 = sorted[i + 1]
    if (t >= kf0.t && t <= kf1.t) {
      const span = kf1.t - kf0.t
      if (span <= 1e-9) return cloneKeyframeValue(kf1.value)
      const rawAlpha = (t - kf0.t) / span
      return interpolateValue(
        kf0.value,
        kf1.value,
        rawAlpha,
        kf0.interpolation ?? 'linear',
        track.property
      )
    }
  }

  return cloneKeyframeValue(last.value)
}

/* ---------- Serialización JSON (toJSON / fromJSON) ---------- */

export interface SerializedVector3 {
  __type: 'Vector3'
  x: number
  y: number
  z: number
}

export interface SerializedQuaternion {
  __type: 'Quaternion'
  x: number
  y: number
  z: number
  w: number
}

export type SerializedKeyframeValue =
  | number
  | boolean
  | string
  | SerializedVector3
  | SerializedQuaternion

export interface SerializedKeyframe {
  t: number
  value: SerializedKeyframeValue
  interpolation?: Interpolation
}

export interface SerializedTrack {
  objectId: string
  property: string
  keyframes: SerializedKeyframe[]
}

export interface SerializedAnimation {
  duration: number
  fps: number
  tracks: SerializedTrack[]
}

function serializeValue(value: KeyframeValue): SerializedKeyframeValue {
  if (value instanceof THREE.Vector3) {
    return { __type: 'Vector3', x: value.x, y: value.y, z: value.z }
  }
  if (value instanceof THREE.Quaternion) {
    return { __type: 'Quaternion', x: value.x, y: value.y, z: value.z, w: value.w }
  }
  return value
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function deserializeValue(raw: unknown): KeyframeValue {
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string') {
    return raw
  }
  if (raw instanceof THREE.Vector3) return raw.clone()
  if (raw instanceof THREE.Quaternion) return raw.clone()
  if (isRecord(raw)) {
    if (
      raw.__type === 'Quaternion' ||
      (typeof raw.x === 'number' &&
        typeof raw.y === 'number' &&
        typeof raw.z === 'number' &&
        typeof raw.w === 'number')
    ) {
      return new THREE.Quaternion(
        Number(raw.x) || 0,
        Number(raw.y) || 0,
        Number(raw.z) || 0,
        typeof raw.w === 'number' ? raw.w : 1
      )
    }
    if (
      raw.__type === 'Vector3' ||
      (typeof raw.x === 'number' && typeof raw.y === 'number' && typeof raw.z === 'number')
    ) {
      return new THREE.Vector3(Number(raw.x) || 0, Number(raw.y) || 0, Number(raw.z) || 0)
    }
  }
  return 0
}

/** Convierte una `Animation` a un objeto serializable en JSON. */
export function toJSON(animation: Animation): SerializedAnimation {
  return {
    duration: Number.isFinite(animation.duration) && animation.duration > 0 ? animation.duration : DEFAULT_ANIMATION.duration,
    fps: Number.isFinite(animation.fps) && animation.fps > 0 ? animation.fps : DEFAULT_ANIMATION.fps,
    tracks: (animation.tracks ?? []).map((track) => ({
      objectId: String(track.objectId),
      property: String(track.property),
      keyframes: (track.keyframes ?? [])
        .map((kf) => {
          const item: SerializedKeyframe = {
            t: Number(kf.t) || 0,
            value: serializeValue(kf.value)
          }
          if (
            kf.interpolation === 'linear' ||
            kf.interpolation === 'easeInOut' ||
            kf.interpolation === 'constant'
          ) {
            item.interpolation = kf.interpolation
          }
          return item
        })
        .sort((a, b) => a.t - b.t)
    }))
  }
}

/** Reconstruye una `Animation` desde JSON (objeto o cadena). Si no hay datos válidos, devuelve la animación por defecto. */
export function fromJSON(raw: unknown): Animation {
  if (raw === null || raw === undefined || raw === '') {
    return cloneAnimation(DEFAULT_ANIMATION)
  }
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return cloneAnimation(DEFAULT_ANIMATION)
    }
  }
  if (!isRecord(parsed)) {
    return cloneAnimation(DEFAULT_ANIMATION)
  }
  const duration =
    typeof parsed.duration === 'number' && Number.isFinite(parsed.duration) && parsed.duration > 0
      ? parsed.duration
      : DEFAULT_ANIMATION.duration
  const fps =
    typeof parsed.fps === 'number' && Number.isFinite(parsed.fps) && parsed.fps > 0
      ? parsed.fps
      : DEFAULT_ANIMATION.fps
  const rawTracks = Array.isArray(parsed.tracks) ? parsed.tracks : []
  const tracks: Track[] = []

  for (const tItem of rawTracks) {
    if (!isRecord(tItem)) continue
    if (typeof tItem.objectId !== 'string' || typeof tItem.property !== 'string') continue
    const rawKfs = Array.isArray(tItem.keyframes) ? tItem.keyframes : []
    const keyframes: Keyframe[] = []
    for (const kItem of rawKfs) {
      if (!isRecord(kItem) || typeof kItem.t !== 'number' || !Number.isFinite(kItem.t)) continue
      const kf: Keyframe = {
        t: Math.max(0, kItem.t),
        value: deserializeValue(kItem.value)
      }
      if (
        kItem.interpolation === 'linear' ||
        kItem.interpolation === 'easeInOut' ||
        kItem.interpolation === 'constant'
      ) {
        kf.interpolation = kItem.interpolation
      }
      keyframes.push(kf)
    }
    keyframes.sort((a, b) => a.t - b.t)
    tracks.push({
      objectId: tItem.objectId,
      property: tItem.property,
      keyframes
    })
  }

  return { duration, fps, tracks }
}
