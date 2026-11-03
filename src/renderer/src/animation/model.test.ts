/*** Tests de Vitest para el modelo, motor, panel e historial de animación. ***/
import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import {
  Keyframe,
  Track,
  Animation,
  DEFAULT_ANIMATION,
  evaluateTrack,
  interpolateValue,
  toJSON,
  fromJSON
} from './model'
import { AnimationEngine, getSceneElementProperty } from './AnimationEngine'
import { TimelinePanel } from './TimelinePanel'
import { SceneManager } from '../engine/SceneManager'
import { HistoryManager } from '../engine/HistoryManager'
import { WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'

describe('Animation Model', () => {
  describe('Interpolation types', () => {
    it('should accept linear interpolation', () => {
      const kf: Keyframe = { t: 0, value: 0, interpolation: 'linear' }
      expect(kf.interpolation).toBe('linear')
    })

    it('should accept easeInOut interpolation', () => {
      const kf: Keyframe = { t: 0, value: 0, interpolation: 'easeInOut' }
      expect(kf.interpolation).toBe('easeInOut')
    })

    it('should accept constant interpolation', () => {
      const kf: Keyframe = { t: 0, value: 0, interpolation: 'constant' }
      expect(kf.interpolation).toBe('constant')
    })

    it('should default to undefined when no interpolation', () => {
      const kf: Keyframe = { t: 0, value: 0 }
      expect(kf.interpolation).toBeUndefined()
    })
  })

  describe('Keyframe values', () => {
    it('should support number values', () => {
      const kf: Keyframe = { t: 0, value: 42 }
      expect(kf.value).toBe(42)
    })

    it('should support Vector3 values', () => {
      const kf: Keyframe = { t: 0, value: new THREE.Vector3(1, 2, 3) }
      expect((kf.value as THREE.Vector3).x).toBe(1)
    })

    it('should support Quaternion values', () => {
      const kf: Keyframe = { t: 0, value: new THREE.Quaternion() }
      expect(kf.value instanceof THREE.Quaternion).toBe(true)
    })

    it('should support boolean values', () => {
      const kf: Keyframe = { t: 0, value: true }
      expect(kf.value).toBe(true)
    })

    it('should support string values', () => {
      const kf: Keyframe = { t: 0, value: 'door_angle' }
      expect(kf.value).toBe('door_angle')
    })
  })

  describe('Track', () => {
    it('should contain keyframes ordered by time', () => {
      const track: Track = {
        objectId: 'obj-1',
        property: 'position',
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 10 }
        ]
      }
      expect(track.keyframes.length).toBe(2)
      expect(track.keyframes[0].t).toBe(0)
      expect(track.keyframes[1].t).toBe(1)
    })

    it('should work with empty keyframes', () => {
      const track: Track = {
        objectId: 'obj-1',
        property: 'rotation',
        keyframes: []
      }
      expect(track.keyframes).toEqual([])
    })
  })

  describe('Animation', () => {
    it('should have default duration and fps', () => {
      expect(DEFAULT_ANIMATION.duration).toBe(10)
      expect(DEFAULT_ANIMATION.fps).toBe(30)
    })

    it('should initialize with empty tracks', () => {
      expect(DEFAULT_ANIMATION.tracks).toEqual([])
    })

    it('should accept custom tracks', () => {
      const animation: Animation = {
        ...DEFAULT_ANIMATION,
        tracks: [
          {
            objectId: 'obj-1',
            property: 'position',
            keyframes: [{ t: 0, value: 0 }]
          }
        ]
      }
      expect(animation.tracks.length).toBe(1)
    })
  })
})

describe('Keyframe Operations & TimelinePanel + HistoryManager (Undo/Redo)', () => {
  it('should insert, move, delete keyframes and change interpolation with full Undo/Redo support', () => {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const engine = new AnimationEngine({ scene })
    const panel = new TimelinePanel({ scene, history, engine })

    const obj = scene.createObject('Silla', 'furniture', new THREE.Vector3(0, 0, 0))
    history.clear()

    panel.setState({ isAnimating: true, selectedObjectId: obj.id, activeProperty: 'position', currentTime: 0 })

    // 1. Insertar fotograma en t = 0
    expect(panel.insertKeyframe(obj.id, 'position', 0, new THREE.Vector3(0, 0, 0))).toBe(true)
    expect(panel.getState().tracks.length).toBe(1)
    expect(panel.getState().tracks[0].keyframes.length).toBe(1)

    // 2. Insertar fotograma en t = 2
    expect(panel.insertKeyframe(obj.id, 'position', 2, new THREE.Vector3(10, 0, 0))).toBe(true)
    expect(panel.getState().tracks[0].keyframes.length).toBe(2)

    // Deshacer inserción del segundo fotograma (Ctrl+Z) y rehacer (Ctrl+Y)
    expect(history.undo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes.length).toBe(1)
    expect(history.redo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes.length).toBe(2)

    // 3. Mover fotograma de t = 2 a t = 4
    expect(panel.moveKeyframe(obj.id, 'position', 2, 4)).toBe(true)
    expect(panel.getState().tracks[0].keyframes[1].t).toBe(4)

    // Deshacer y rehacer movimiento de fotograma
    expect(history.undo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes[1].t).toBe(2)
    expect(history.redo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes[1].t).toBe(4)

    // 4. Cambiar interpolación a easeInOut y luego constant
    expect(panel.setKeyframeInterpolation(obj.id, 'position', 0, 'easeInOut')).toBe(true)
    expect(panel.getState().tracks[0].keyframes[0].interpolation).toBe('easeInOut')
    expect(history.undo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes[0].interpolation).toBe('linear')
    expect(history.redo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes[0].interpolation).toBe('easeInOut')

    // 5. Borrar fotograma en t = 4
    expect(panel.deleteKeyframe(obj.id, 'position', 4)).toBe(true)
    expect(panel.getState().tracks[0].keyframes.length).toBe(1)

    // Deshacer y rehacer borrado de fotograma
    expect(history.undo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes.length).toBe(2)
    expect(history.redo()).toBe(true)
    expect(panel.getState().tracks[0].keyframes.length).toBe(1)
  })

  it('should support Auto-key when an object is moved in the scene', () => {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const engine = new AnimationEngine({ scene })
    const panel = new TimelinePanel({ scene, history, engine })

    const wall = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0))
    scene.onWallChanged((w) => panel.handleSceneElementChanged(w.id))

    panel.setState({ isAnimating: true, isAutoKey: true, selectedObjectId: wall.id, currentTime: 2 })
    // Mover el muro en t = 2s dispara Auto-key (crea fotograma base en t=0 y nuevo en t=2)
    scene.moveWall(wall.id, new THREE.Vector3(0, 0, 6), new THREE.Vector3(4, 0, 6), false)

    const posTrack = panel.getState().tracks.find((t) => t.objectId === wall.id && t.property === 'position')
    expect(posTrack).toBeDefined()
    expect(posTrack?.keyframes.length).toBe(2)
    expect(posTrack?.keyframes[0].t).toBe(0)
    expect((posTrack?.keyframes[0].value as THREE.Vector3).z).toBeCloseTo(0)
    expect(posTrack?.keyframes[1].t).toBe(2)
    expect((posTrack?.keyframes[1].value as THREE.Vector3).z).toBeCloseTo(6)
  })

  it('should remove object tracks when the object or wall is deleted from the scene', () => {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const panel = new TimelinePanel({ scene, history })
    scene.onObjectRemoved((o) => {
      if (!history.isReplaying()) panel.removeTracksForObject(o.id)
    })

    const obj = scene.createObject('Mesa', 'furniture', new THREE.Vector3(1, 0, 1))
    panel.setState({ isAnimating: true, selectedObjectId: obj.id })
    panel.insertKeyframe(obj.id, 'position', 0, new THREE.Vector3(1, 0, 1))
    expect(panel.getState().tracks.length).toBe(1)

    scene.removeObject(obj.id)
    expect(panel.getState().tracks.length).toBe(0)
  })
})

describe('End-to-End Scenarios (Wall A->B, Door 90°, Save/Load, Play/Pause/Stop)', () => {
  it('1) should animate a wall moving from A to B in 2 seconds and interpolate on seek', () => {
    const scene = new SceneManager()
    const engine = new AnimationEngine({ scene })
    const panel = new TimelinePanel({ scene, engine })

    const wall = scene.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(-2, 0, 0),
      new THREE.Vector3(2, 0, 0)
    )
    panel.setState({ isAnimating: true, selectedObjectId: wall.id, activeProperty: 'position' })

    // t = 0s: centro en (0, 0, 0)
    panel.insertKeyframe(wall.id, 'position', 0, new THREE.Vector3(0, 0, 0), 'linear')
    // t = 2s: centro en (0, 0, 10)
    panel.insertKeyframe(wall.id, 'position', 2, new THREE.Vector3(0, 0, 10), 'linear')

    // Mover cabezal a t = 1s -> posición interpolada a mitad de camino (0, 0, 5)
    panel.seek(1)
    const midPos = getSceneElementProperty(scene, wall.id, 'position') as THREE.Vector3
    expect(midPos.x).toBeCloseTo(0)
    expect(midPos.z).toBeCloseTo(5)
    expect(wall.start.z).toBeCloseTo(5)
    expect(wall.end.z).toBeCloseTo(5)

    // Mover cabezal a t = 2s -> posición final (0, 0, 10)
    panel.seek(2)
    const endPos = getSceneElementProperty(scene, wall.id, 'position') as THREE.Vector3
    expect(endPos.z).toBeCloseTo(10)
  })

  it('2) should animate a door opening 90 degrees in 2 seconds', () => {
    const scene = new SceneManager()
    const engine = new AnimationEngine({ scene })
    const panel = new TimelinePanel({ scene, engine })

    const door = new SceneObject('Puerta principal', 'shape')
    door.shapeId = 'opening.door'
    door.openingVariant = 'simple'
    door.openingAngle = 0
    scene.addObject(door)

    panel.setState({ isAnimating: true, selectedObjectId: door.id, activeProperty: 'openingAngle' })
    panel.insertKeyframe(door.id, 'openingAngle', 0, 0, 'linear')
    panel.insertKeyframe(door.id, 'openingAngle', 2, 90, 'linear')

    panel.seek(1)
    expect(door.openingAngle).toBeCloseTo(45)

    panel.seek(2)
    expect(door.openingAngle).toBeCloseTo(90)
  })

  it('4) should serialize and deserialize animations (toJSON/fromJSON) and open projects without animation', () => {
    const anim: Animation = {
      duration: 12,
      fps: 30,
      tracks: [
        {
          objectId: 'wall-1',
          property: 'position',
          keyframes: [
            { t: 0, value: new THREE.Vector3(0, 0, 0), interpolation: 'linear' },
            { t: 2, value: new THREE.Vector3(4, 0, 8), interpolation: 'easeInOut' }
          ]
        },
        {
          objectId: 'obj-1',
          property: 'openingAngle',
          keyframes: [
            { t: 0, value: 0, interpolation: 'constant' },
            { t: 2, value: 90, interpolation: 'linear' }
          ]
        }
      ]
    }

    const serialized = JSON.stringify(toJSON(anim))
    const restored = fromJSON(serialized)

    expect(restored.duration).toBe(12)
    expect(restored.tracks.length).toBe(2)
    expect(restored.tracks[0].keyframes[1].value).toBeInstanceOf(THREE.Vector3)
    expect((restored.tracks[0].keyframes[1].value as THREE.Vector3).z).toBe(8)
    expect(restored.tracks[0].keyframes[1].interpolation).toBe('easeInOut')
    expect(restored.tracks[1].keyframes[1].value).toBe(90)

    // Proyectos sin animación siguen abriendo con DEFAULT_ANIMATION
    const emptyProjectAnim = fromJSON(null)
    expect(emptyProjectAnim.duration).toBe(10)
    expect(emptyProjectAnim.tracks).toEqual([])
  })

  it('5) should handle Play, Pause, and Stop states, restore original scene state on Stop, and keep HistoryManager clean', () => {
    const scene = new SceneManager()
    const history = new HistoryManager(scene)
    const engine = new AnimationEngine({ scene })

    const wall = scene.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0)
    )
    const door = new SceneObject('Puerta', 'shape')
    door.shapeId = 'opening.door'
    door.openingVariant = 'simple'
    door.openingAngle = 15 // Estado original de edición antes de reproducir
    scene.addObject(door)

    // Limpiar el historial tras configurar la escena de edición
    history.clear()
    expect(history.canUndo()).toBe(false)

    engine.setDuration(10)
    engine.setTracks([
      {
        objectId: wall.id,
        property: 'position',
        keyframes: [
          { t: 0, value: new THREE.Vector3(2, 0, 0), interpolation: 'linear' },
          { t: 2, value: new THREE.Vector3(2, 0, 10), interpolation: 'linear' }
        ]
      },
      {
        objectId: door.id,
        property: 'openingAngle',
        keyframes: [
          { t: 0, value: 0, interpolation: 'linear' },
          { t: 2, value: 90, interpolation: 'linear' }
        ]
      }
    ])

    expect(engine.getState().state).toBe('stopped')
    expect(engine.isEditingLocked()).toBe(false)

    // Play inicia desde el cabezal (0s) y bloquea la edición
    history.setPaused(true)
    engine.play()
    expect(engine.getState().state).toBe('playing')
    expect(engine.isEditingLocked()).toBe(true)

    // Avanzar 1 segundo (mitad de la animación de 2s)
    engine.step(1.0)
    expect(engine.getState().t).toBeCloseTo(1.0)
    expect(wall.start.z).toBeCloseTo(5)
    expect(door.openingAngle).toBeCloseTo(45)

    // Pausa congela en t = 1.0s
    engine.pause()
    expect(engine.getState().state).toBe('paused')
    expect(engine.isEditingLocked()).toBe(true)
    engine.step(1.0) // No debe avanzar estando en pausa
    expect(engine.getState().t).toBeCloseTo(1.0)

    // Reanudar con Play a velocidad 2x durante 0.5s -> llega a t = 2.0s
    engine.setSpeed(2)
    engine.play()
    expect(engine.getState().state).toBe('playing')
    engine.step(0.5)
    expect(engine.getState().t).toBeCloseTo(2.0)
    expect(wall.start.z).toBeCloseTo(10)
    expect(door.openingAngle).toBeCloseTo(90)

    // Detener vuelve a t = 0s, restaura la escena original (muro en z=0, puerta en 15°) y no ensucia el historial
    engine.stop()
    history.syncKnownSnapshots()
    history.setPaused(false)

    expect(engine.getState().state).toBe('stopped')
    expect(engine.getState().t).toBe(0)
    expect(engine.isEditingLocked()).toBe(false)
    expect(wall.start.z).toBeCloseTo(0)
    expect(wall.end.z).toBeCloseTo(0)
    expect(door.openingAngle).toBe(15)
    expect(history.canUndo()).toBe(false)
  })

  it('should support Quaternion slerp and constant/easeInOut interpolations', () => {
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0, 'XYZ'))
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'XYZ'))
    const result = interpolateValue(q1, q2, 0.5, 'linear')
    expect(result).toBeInstanceOf(THREE.Quaternion)

    const constantTrack: Track = {
      objectId: 'obj-1',
      property: 'visible',
      keyframes: [
        { t: 0, value: true, interpolation: 'constant' },
        { t: 2, value: false, interpolation: 'constant' }
      ]
    }
    expect(evaluateTrack(constantTrack, 1.5)).toBe(true)
    expect(evaluateTrack(constantTrack, 2.0)).toBe(false)
  })
})
