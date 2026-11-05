import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  buildWallTemplateSegments,
  resolveWallTemplateId,
  snapPointToWallsAndGrid,
  uniqueTemplateVertices,
  WALL_TEMPLATES
} from './WallTemplates'
import { SceneManager } from './SceneManager'
import { WallSegmentType } from '../models/Wall'
import { ACTION_CATALOG, ActionRegistry } from '../actions/ActionRegistry'
import { KeybindingManager, formatShortcut } from '../actions/KeybindingManager'
import { Viewport3DController } from './Viewport3DController'
import { Axis3D } from '../models/CameraState'
import { mountKeyboardCameraNavigator } from '../ui/KeyboardCameraNavigator'

function makeKeyEvent(
  key: string,
  mods: {
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    metaKey?: boolean
    code?: string
    repeat?: boolean
    preventDefault?: () => void
  } = {}
): KeyboardEvent {
  return {
    key,
    code: mods.code ?? key,
    ctrlKey: mods.ctrlKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false,
    metaKey: mods.metaKey ?? false,
    repeat: mods.repeat ?? false,
    preventDefault: mods.preventDefault ?? (() => undefined)
  } as unknown as KeyboardEvent
}

describe('WallTemplates — Generadores de Muros 2D Conectados', () => {
  it('define las 8 plantillas arquitectónicas con escala real (>= 2.5 m)', () => {
    expect(WALL_TEMPLATES.map((t) => t.id)).toEqual([
      'rect',
      'l',
      'u',
      'c',
      't',
      'cross',
      'ring',
      'arc'
    ])
    for (const tpl of WALL_TEMPLATES) {
      expect(tpl.defaultWidth).toBeGreaterThanOrEqual(4.0)
      expect(tpl.defaultDepth).toBeGreaterThanOrEqual(2.5)
    }
  })

  it('mapea las formas predefinidas heredadas (shape.*) a plantillas 2D y preserva shape.stairs', () => {
    expect(resolveWallTemplateId('shape.l')).toBe('l')
    expect(resolveWallTemplateId('shape.u')).toBe('u')
    expect(resolveWallTemplateId('shape.c')).toBe('c')
    expect(resolveWallTemplateId('shape.t')).toBe('t')
    expect(resolveWallTemplateId('shape.cross')).toBe('cross')
    expect(resolveWallTemplateId('shape.ring')).toBe('ring')
    expect(resolveWallTemplateId('shape.arc')).toBe('arc')
    expect(resolveWallTemplateId('shape.stairs')).toBeNull()
  })

  it('Habitación Rectangular genera 4 muros reales cerrados, independientes y compatibles con puertas y techos', () => {
    const scene = new SceneManager()
    const segments = buildWallTemplateSegments({
      templateId: 'rect',
      centerX: 2,
      centerZ: -1,
      width: 4,
      depth: 5
    })
    expect(segments).toHaveLength(4)

    const created = segments.map((s) =>
      scene.addWall(WallSegmentType.SimpleWall, s.start, s.end)
    )
    expect(scene.getWalls()).toHaveLength(4)
    expect(scene.getObjects()).toHaveLength(0)

    // Altura y espesor idénticos a Muro simple (2.5m x 0.2m)
    for (const w of created) {
      expect(w.height).toBeCloseTo(2.5)
      expect(w.thickness).toBeCloseTo(0.2)
    }

    // Contorno cerrado válido para trazado automático de techos en SceneManager
    const roofObj = scene.createRoof({ auto: true, type: 'gable' })
    expect(roofObj).not.toBeNull()
    expect(roofObj?.roofProps?.footprint).toHaveLength(4)

    // Admite insertar puerta/ventana en cualquiera de sus lados
    const opening = scene.addOpening(created[0].id, {
      wallId: created[0].id,
      x: 2.0,
      width: 0.9,
      height: 2.1,
      sill: 0,
      type: 'door',
      materialId: null
    })
    expect(opening.width).toBe(0.9)
    expect(created[0].openings).toHaveLength(1)

    // Cada lado es independiente: se puede estirar o borrar un solo muro sin destruir los otros 3
    scene.moveWall(created[1].id, created[1].start.clone(), new THREE.Vector3(4, 0, 2.5))
    expect(created[1].end.z).toBeCloseTo(2.5)
    scene.removeWall(created[2].id)
    expect(scene.getWalls()).toHaveLength(3)
  })

  it('Perfil L soporta habitación cerrada de 6 muros y esquina abierta de 2 muros a 90°', () => {
    const closedL = buildWallTemplateSegments({
      templateId: 'l',
      centerX: 0,
      centerZ: 0,
      width: 5,
      depth: 4,
      lVariant: 'room'
    })
    expect(closedL).toHaveLength(6)
    expect(uniqueTemplateVertices(closedL)).toHaveLength(6)

    const scene = new SceneManager()
    for (const s of closedL) scene.addWall(WallSegmentType.SimpleWall, s.start, s.end)
    const roofL = scene.createRoof({ auto: true, type: 'flat' })
    expect(roofL).not.toBeNull()
    expect(roofL?.roofProps?.footprint).toHaveLength(6)

    const cornerL = buildWallTemplateSegments({
      templateId: 'l',
      centerX: 0,
      centerZ: 0,
      width: 5,
      depth: 4,
      lVariant: 'corner'
    })
    expect(cornerL).toHaveLength(2)
    expect(cornerL[0].end.distanceTo(cornerL[1].start)).toBeLessThan(1e-6)
  })

  it('Perfil U, C, T, Cruz (+), Anillo y Arco generan segmentos conectados y rotan 90° exactamente', () => {
    const u0 = buildWallTemplateSegments({ templateId: 'u', centerX: 0, centerZ: 0, width: 6, depth: 4, rotationDeg: 0 })
    const u90 = buildWallTemplateSegments({ templateId: 'u', centerX: 0, centerZ: 0, width: 6, depth: 4, rotationDeg: 90 })
    expect(u0).toHaveLength(3)
    expect(u90).toHaveLength(3)
    // A 0°, el tramo central mide 6m en X; a 90°, mide 6m en Z
    expect(Math.abs(u0[1].end.x - u0[1].start.x)).toBeCloseTo(6)
    expect(Math.abs(u90[1].end.z - u90[1].start.z)).toBeCloseTo(6)

    const cSegs = buildWallTemplateSegments({ templateId: 'c', centerX: 0, centerZ: 0, width: 5, depth: 4 })
    expect(cSegs).toHaveLength(3)

    const tSegs = buildWallTemplateSegments({ templateId: 't', centerX: 0, centerZ: 0, width: 5, depth: 4 })
    expect(tSegs).toHaveLength(3)
    // El vástago de la T parte exactamente del nodo central unido de la barra superior
    expect(tSegs[0].end.distanceTo(tSegs[2].start)).toBeLessThan(1e-6)
    expect(tSegs[1].start.distanceTo(tSegs[2].start)).toBeLessThan(1e-6)

    const crossSegs = buildWallTemplateSegments({ templateId: 'cross', centerX: 0, centerZ: 0, width: 6, depth: 6 })
    expect(crossSegs).toHaveLength(4)
    expect(uniqueTemplateVertices(crossSegs)).toHaveLength(5)

    const ringSegs = buildWallTemplateSegments({ templateId: 'ring', centerX: 0, centerZ: 0, width: 6, depth: 6, segmentsCount: 12 })
    expect(ringSegs).toHaveLength(12)
    expect(ringSegs[11].end.distanceTo(ringSegs[0].start)).toBeLessThan(1e-6)

    const arcSegs = buildWallTemplateSegments({ templateId: 'arc', centerX: 0, centerZ: 0, width: 5, depth: 2.5, segmentsCount: 8 })
    expect(arcSegs).toHaveLength(8)
  })

  it('snapPointToWallsAndGrid engancha primero a vértices de muros, luego a tramos y finalmente a cuadrícula 0.5m', () => {
    const scene = new SceneManager()
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0))

    // 1. Imán a vértice existente (radio <= 0.38m)
    const vertexHit = snapPointToWallsAndGrid(
      new THREE.Vector3(3.82, 0, 0.12),
      scene.getWalls(),
      scene.getActiveLevelId()
    )
    expect(vertexHit.kind).toBe('wall-vertex')
    expect(vertexHit.point.x).toBeCloseTo(4)
    expect(vertexHit.point.z).toBeCloseTo(0)

    // 2. Imán a segmento de muro existente (radio <= 0.28m)
    const edgeHit = snapPointToWallsAndGrid(
      new THREE.Vector3(2.13, 0, 0.18),
      scene.getWalls(),
      scene.getActiveLevelId()
    )
    expect(edgeHit.kind).toBe('wall-edge')
    expect(edgeHit.point.z).toBeCloseTo(0)

    // 3. Imán a cuadrícula de 0.5m lejos de muros
    const gridHit = snapPointToWallsAndGrid(
      new THREE.Vector3(7.23, 0, -3.41),
      scene.getWalls(),
      scene.getActiveLevelId()
    )
    expect(gridHit.kind).toBe('grid')
    expect(gridHit.point.x).toBeCloseTo(7.0)
    expect(gridHit.point.z).toBeCloseTo(-3.5)
  })
})

describe('KeybindingManager — Sistema Global de Atajos de Teclado 2D/3D', () => {
  it('registra todos los atajos solicitados sin colisiones y se pausa al escribir en inputs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fired: string[] = []
    let blocked = false

    const handlers: Record<string, () => void> = Object.fromEntries(
      ACTION_CATALOG.map((meta) => [meta.id, () => fired.push(meta.id)])
    )
    const registry = new ActionRegistry(ACTION_CATALOG, handlers)
    const kb = new KeybindingManager(registry, {
      isBlocked: () => blocked
    })

    // Cero advertencias de atajos duplicados en ACTION_CATALOG
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()

    const press = (
      key: string,
      mods?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }
    ): string | undefined => {
      fired.length = 0
      kb.handle(makeKeyEvent(key, mods))
      return fired[0]
    }

    // [W] o [M] -> Muro simple
    expect(press('w')).toBe('tool.SimpleWall')
    expect(press('m')).toBe('tool.SimpleWall')

    // Plantillas de muros 2D: [R], [L], [U], [T], [P], [Y], [N], [B]
    expect(press('r')).toBe('template.rect')
    expect(press('l')).toBe('template.l')
    expect(press('u')).toBe('template.u')
    expect(press('t')).toBe('template.t')
    expect(press('p')).toBe('template.c')
    expect(press('y')).toBe('template.cross')
    expect(press('n')).toBe('template.ring')
    expect(press('b')).toBe('template.arc')

    // [C] o [Home] (y alias histórico Ctrl+Shift+E) -> Centrar estructura (Fit to View)
    expect(press('c')).toBe('aux.fit')
    expect(press('Home')).toBe('aux.fit')
    expect(press('E', { ctrlKey: true, shiftKey: true })).toBe('aux.fit')

    // [S] o [Esc] -> Seleccionar / Cancelar trazo
    expect(press('s')).toBe('tool.crosshair')
    expect(press('Escape')).toBe('tool.crosshair')

    // [V] -> Mover
    expect(press('v')).toBe('modify.move')

    // [Supr] / [Delete] / [Backspace] -> Borrar
    expect(press('Delete')).toBe('edit.delete')
    expect(press('Backspace')).toBe('edit.delete')

    // [Espacio] -> Alternar Vista 2D / 3D
    expect(press(' ')).toBe('view.toggle2d3d')
    expect(formatShortcut(kb.shortcutFor('view.toggle2d3d')!)).toBe('Espacio')

    // [G] -> Rotar 90°
    expect(press('g')).toBe('modify.rotate90')

    // [Ctrl+Z] / [Ctrl+Y] / [Ctrl+Shift+Z] -> Deshacer / Rehacer
    expect(press('z', { ctrlKey: true })).toBe('edit.undo')
    expect(press('y', { ctrlKey: true })).toBe('edit.redo')
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toBe('edit.redo')

    // [Ctrl+D] -> Duplicar
    expect(press('d', { ctrlKey: true })).toBe('edit.duplicate')

    // [X] -> Vaciar escena
    expect(press('x')).toBe('file.clear')

    // [?] / [Shift+?] / [H] -> Modal de Atajos
    expect(press('?', { shiftKey: true })).toBe('help.shortcuts')
    expect(press('h')).toBe('help.shortcuts')

    // Bloqueo automático cuando el foco está en un <input> o chat de IA
    blocked = true
    expect(press('w')).toBeUndefined()
    expect(press(' ')).toBeUndefined()
    expect(press('Backspace')).toBeUndefined()
  })
})

describe('KeyboardCameraNavigator — Navegación Fluida 2D/3D con Flechas y Zoom', () => {
  it('en Vista 3D rota azimutal/polar con Flechas, desplaza en XZ con Shift+Flechas y hace zoom suave con [+]/[-]/RePág/AvPág', () => {
    const controller = new Viewport3DController()
    controller.state.yaw = 0
    controller.state.pitch = 0.5
    controller.state.distance = 20
    controller.state.target.set(0, 0, 0)

    let viewMode: '2d' | '3d' = '3d'
    let blocked = false
    let framesSynced = 0
    let clockMs = 1000
    let queuedCb: ((ts: number) => void) | null = null

    const nav = mountKeyboardCameraNavigator({
      controller,
      getViewMode: () => viewMode,
      isBlocked: () => blocked,
      onFrame: () => {
        framesSynced++
      },
      now: () => clockMs,
      requestFrame: (cb) => {
        queuedCb = cb
        return 1
      },
      cancelFrame: () => {
        queuedCb = null
      },
      autoBindWindow: false
    })

    const advanceFrame = (deltaMs: number): void => {
      clockMs += deltaMs
      const cb = queuedCb
      queuedCb = null
      cb?.(clockMs)
    }

    // 1. Flecha Derecha + Flecha Arriba en 3D -> incrementa yaw (azimutal) y pitch (polar)
    const preventSpy = vi.fn()
    expect(nav.handleKeyDown(makeKeyEvent('ArrowRight', { preventDefault: preventSpy }))).toBe(true)
    expect(preventSpy).toHaveBeenCalledTimes(1)
    expect(nav.handleKeyDown(makeKeyEvent('ArrowUp'))).toBe(true)
    advanceFrame(32)
    expect(controller.state.yaw).toBeGreaterThan(0.05)
    expect(controller.state.pitch).toBeGreaterThan(0.54)
    expect(controller.state.target.length()).toBe(0) // Orbitar NO altera el target
    nav.handleKeyUp(makeKeyEvent('ArrowRight'))
    nav.handleKeyUp(makeKeyEvent('ArrowUp'))
    expect(nav.isNavigating()).toBe(false)

    // 2. Shift + Flecha Adelante (ArrowUp) y Derecha (ArrowRight) en 3D -> pan horizontal XZ
    controller.state.yaw = 0
    expect(nav.handleKeyDown(makeKeyEvent('ArrowRight', { shiftKey: true }))).toBe(true)
    expect(nav.handleKeyDown(makeKeyEvent('ArrowUp', { shiftKey: true }))).toBe(true)
    advanceFrame(40)
    expect(controller.state.target.x).toBeGreaterThan(0.5)
    expect(controller.state.target.z).toBeLessThan(-0.5)
    expect(controller.state.target.y).toBe(0) // Nunca levanta el target del suelo
    nav.clear()

    // 3. Vista 2D (Planta): Flechas desplazan suavemente el plano 2D
    viewMode = '2d'
    controller.snapToAxis(Axis3D.Y)
    controller.state.target.set(0, 0, 0)
    expect(nav.handleKeyDown(makeKeyEvent('ArrowLeft'))).toBe(true)
    expect(nav.handleKeyDown(makeKeyEvent('ArrowDown'))).toBe(true)
    advanceFrame(40)
    expect(controller.state.target.x).toBeLessThan(-0.5)
    expect(controller.state.target.z).toBeGreaterThan(0.5)
    nav.clear()

    // 4. Zoom continuo con [+], [-], PageUp (RePág) y PageDown (AvPág)
    const startDist = controller.state.distance
    expect(nav.handleKeyDown(makeKeyEvent('+'))).toBe(true)
    advanceFrame(40)
    expect(controller.state.distance).toBeLessThan(startDist)
    nav.handleKeyUp(makeKeyEvent('+'))

    const zoomedInDist = controller.state.distance
    expect(nav.handleKeyDown(makeKeyEvent('PageDown'))).toBe(true)
    advanceFrame(40)
    expect(controller.state.distance).toBeGreaterThan(zoomedInDist)
    nav.handleKeyUp(makeKeyEvent('PageDown'))

    // 5. No intercepta Ctrl++ ni se ejecuta cuando el foco está bloqueado en un <input>
    expect(nav.handleKeyDown(makeKeyEvent('+', { ctrlKey: true }))).toBe(false)
    blocked = true
    expect(nav.handleKeyDown(makeKeyEvent('ArrowLeft'))).toBe(false)
    expect(framesSynced).toBeGreaterThan(4)
    nav.dispose()
  })
})
