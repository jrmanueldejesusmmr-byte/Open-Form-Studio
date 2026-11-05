import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyMeterUVs } from './MaterialSystem'
import {
  defaultStructuralParamsFor,
  isParametricStructuralShape,
  STRUCTURAL_MATERIAL_COLOR,
  type StructuralParams
} from '../models/StructuralTypes'
import { buildStructuralOrGeometricGeometry } from './StructuralSystemsBuilder'
import { getCadBlock } from '../catalog/cadBlocksData'
import { buildCadBlock3DGeometry } from '../catalog/cadBlocks3D'

/**
 * Constructor de geometrías del catálogo (Fase 2 · punto C).
 *
 * Devuelve geometrías paramétricas reales —no cubos— para las formas, las
 * cubiertas y el mobiliario del toolbox:
 *
 *   - `prismFromProfile`: extrusión de un perfil (z, y) a lo largo de X con
 *     UVs de **longitud de arco** en las caras laterales: en una cubierta a dos
 *     aguas las filas de tejas quedan paralelas a la cumbrera y bajan siguiendo
 *     la pendiente exacta (sin compresión de proyección plana).
 *   - Perfiles 2D (L/U/C/T/cruz/anillo/arco) con `ExtrudeGeometry`.
 *   - Mobiliario a escala métrica fusionando primitivas con `mergeGeometries`.
 *
 * Toda la geometría se construye con la base en y = 0 (sobre el plano de
 * trabajo), igual que las cajas del motor anterior.
 */

/** Tamaño natural (x, y, z en metros) de un `shapeId` del catálogo, o null. */
export function naturalSizeForShape(shapeId: string): THREE.Vector3 | null {
  switch (shapeId) {
    case 'shape.l':
    case 'shape.u':
    case 'shape.c':
    case 'shape.t':
    case 'shape.cross':
      return new THREE.Vector3(1.2, 1.2, 0.24)
    case 'shape.ring':
      return new THREE.Vector3(1.4, 1.4, 0.25)
    case 'shape.arc':
      return new THREE.Vector3(1.6, 1.8, 0.3)
    case 'shape.stairs':
      return new THREE.Vector3(1, 1.5, 2)
    case 'shape.column':
      return new THREE.Vector3(0.4, 2.8, 0.4)
    case 'shape.beam':
      return new THREE.Vector3(3.0, 0.35, 0.3)
    case 'opening.slab':
      return new THREE.Vector3(3.0, 0.2, 3.0)
    case 'roof.gable':
      return new THREE.Vector3(5, 1.8, 4)
    case 'roof.hip':
      return new THREE.Vector3(5, 1.8, 4)
    case 'roof.shed':
      return new THREE.Vector3(5, 1.6, 4)
    case 'roof.flat':
      return new THREE.Vector3(5, 0.35, 4)
    case 'roof.mansard':
      return new THREE.Vector3(5, 2, 4)
    case 'roof.sawtooth':
      return new THREE.Vector3(5, 1.6, 4)
    case 'furn.armchair':
      return new THREE.Vector3(0.95, 0.85, 0.85)
    case 'furn.sofa':
      return new THREE.Vector3(1.9, 0.85, 0.85)
    case 'furn.table':
      return new THREE.Vector3(1.4, 0.81, 0.9)
    case 'furn.chair':
      return new THREE.Vector3(0.5, 0.9, 0.5)
    case 'furn.lamp':
      return new THREE.Vector3(0.42, 1.55, 0.42)
    case 'furn.plant':
      return new THREE.Vector3(0.65, 1.15, 0.65)
    case 'furn.desk':
      return new THREE.Vector3(1.3, 0.8, 0.72)
    case 'furn.bed':
      return new THREE.Vector3(1.5, 0.85, 2.1)
    case 'topo.terrain':
      return new THREE.Vector3(36, 5, 36)
    default: {
      const cadBlock = getCadBlock(shapeId)
      if (cadBlock) {
        return new THREE.Vector3(cadBlock.dimensions.width, cadBlock.dimensions.height, cadBlock.dimensions.depth)
      }
      if (isParametricStructuralShape(shapeId)) {
        const s = defaultStructuralParamsFor(shapeId).size
        return new THREE.Vector3(s.width, s.height, s.depth)
      }
      return null
    }
  }
}

/** Color por defecto de un `shapeId` (muebles = madera, cubiertas = teja). */
export function defaultColorForShape(shapeId: string): number {
  if (shapeId.startsWith('furn.')) return 0xb08968
  if (shapeId.startsWith('roof.')) return 0x9a5b41
  if (shapeId === 'topo.terrain') return 0x6b8f5e
  if (isParametricStructuralShape(shapeId)) {
    const def = defaultStructuralParamsFor(shapeId).params
    return STRUCTURAL_MATERIAL_COLOR[def.materialType] ?? 0xc9ccd3
  }
  return 0xc9ccd3
}

type ProfilePoint = readonly [number, number]

/**
 * Cierra un perfil (z, y) en un prisma extruido a lo largo de X.
 *
 * UVs: en las caras laterales `u` = posición a lo largo de la cumbrera (X) y
 * `v` = longitud de arco recorrida por el perfil (metros); en las tapas,
 * proyección plana (z, y). Así las texturas de teja siguen la pendiente real
 * de cada cara.
 */
function prismFromProfile(profile: ProfilePoint[], lengthX: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const half = lengthX / 2

  // Longitud de arco acumulada por vértice del perfil.
  const arc: number[] = [0]
  for (let i = 1; i <= profile.length; i++) {
    const prev = profile[i - 1]
    const curr = profile[i % profile.length]
    arc.push(arc[i - 1] + Math.hypot(curr[0] - prev[0], curr[1] - prev[1]))
  }

  const pushTri = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    ua: [number, number],
    ub: [number, number],
    uc: [number, number]
  ): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    uvs.push(...ua, ...ub, ...uc)
  }

  // Caras laterales (un quad por arista del perfil, en 2 triángulos).
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length
    const [zi, yi] = profile[i]
    const [zj, yj] = profile[j]
    const a = new THREE.Vector3(-half, yi, zi)
    const b = new THREE.Vector3(half, yi, zi)
    const c = new THREE.Vector3(half, yj, zj)
    const d = new THREE.Vector3(-half, yj, zj)
    pushTri(a, b, c, [-half, arc[i]], [half, arc[i]], [half, arc[i + 1]])
    pushTri(a, c, d, [-half, arc[i]], [half, arc[i + 1]], [-half, arc[i + 1]])
  }

  // Tapas: triangulación del polígono con UV plana (z, y).
  const contour = profile.map(([z, y]) => new THREE.Vector2(z, y))
  const tris = THREE.ShapeUtils.triangulateShape(contour, [])
  for (const [ia, ib, ic] of tris) {
    const pa = profile[ia]
    const pb = profile[ib]
    const pc = profile[ic]
    pushTri(
      new THREE.Vector3(-half, pa[1], pa[0]),
      new THREE.Vector3(-half, pc[1], pc[0]),
      new THREE.Vector3(-half, pb[1], pb[0]),
      [pa[0], pa[1]],
      [pc[0], pc[1]],
      [pb[0], pb[1]]
    )
    pushTri(
      new THREE.Vector3(half, pa[1], pa[0]),
      new THREE.Vector3(half, pb[1], pb[0]),
      new THREE.Vector3(half, pc[1], pc[0]),
      [pa[0], pa[1]],
      [pb[0], pb[1]],
      [pc[0], pc[1]]
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Contorno de un perfil estructural, centrado en X con la base en y = 0.
 * El espesor es un 22 % del lado menor.
 */
function profilePoints(kind: string, w: number, h: number): THREE.Vector2[] {
  const t = Math.min(w, h) * 0.22
  switch (kind) {
    case 'shape.l':
      return [
        new THREE.Vector2(-w / 2, 0),
        new THREE.Vector2(w / 2, 0),
        new THREE.Vector2(w / 2, t),
        new THREE.Vector2(-w / 2 + t, t),
        new THREE.Vector2(-w / 2 + t, h),
        new THREE.Vector2(-w / 2, h)
      ]
    case 'shape.u':
      return [
        new THREE.Vector2(-w / 2, 0),
        new THREE.Vector2(w / 2, 0),
        new THREE.Vector2(w / 2, h),
        new THREE.Vector2(w / 2 - t, h),
        new THREE.Vector2(w / 2 - t, t),
        new THREE.Vector2(-w / 2 + t, t),
        new THREE.Vector2(-w / 2 + t, h),
        new THREE.Vector2(-w / 2, h)
      ]
    case 'shape.c':
      return [
        new THREE.Vector2(-w / 2, 0),
        new THREE.Vector2(w / 2, 0),
        new THREE.Vector2(w / 2, t),
        new THREE.Vector2(-w / 2 + t, t),
        new THREE.Vector2(-w / 2 + t, h - t),
        new THREE.Vector2(w / 2, h - t),
        new THREE.Vector2(w / 2, h),
        new THREE.Vector2(-w / 2, h)
      ]
    case 'shape.t':
      return [
        new THREE.Vector2(-w / 2, h),
        new THREE.Vector2(w / 2, h),
        new THREE.Vector2(w / 2, h - t),
        new THREE.Vector2(t / 2, h - t),
        new THREE.Vector2(t / 2, 0),
        new THREE.Vector2(-t / 2, 0),
        new THREE.Vector2(-t / 2, h - t),
        new THREE.Vector2(-w / 2, h - t)
      ]
    case 'shape.cross': {
      const hx = w / 2
      const hy = h / 2
      const tx = t / 2
      return [
        new THREE.Vector2(-tx, h),
        new THREE.Vector2(tx, h),
        new THREE.Vector2(tx, hy + tx),
        new THREE.Vector2(hx, hy + tx),
        new THREE.Vector2(hx, hy - tx),
        new THREE.Vector2(tx, hy - tx),
        new THREE.Vector2(tx, 0),
        new THREE.Vector2(-tx, 0),
        new THREE.Vector2(-tx, hy - tx),
        new THREE.Vector2(-hx, hy - tx),
        new THREE.Vector2(-hx, hy + tx),
        new THREE.Vector2(-tx, hy + tx)
      ]
    }
    default:
      return [
        new THREE.Vector2(-w / 2, 0),
        new THREE.Vector2(w / 2, 0),
        new THREE.Vector2(w / 2, h),
        new THREE.Vector2(-w / 2, h)
      ]
  }
}

function extrudeProfileShape(kind: string, size: THREE.Vector3): THREE.BufferGeometry {
  const shape = new THREE.Shape(profilePoints(kind, size.x, size.y))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: size.z,
    bevelEnabled: false,
    curveSegments: 32
  })
  // La extrusión va de z = 0 a z = depth: se centra en el eje Z.
  geometry.translate(0, 0, -size.z / 2)
  applyMeterUVs(geometry)
  return geometry
}

/** Anillo (círculo con agujero) de pie, centrado en X y con base en y = 0. */
function buildRing(size: THREE.Vector3): THREE.BufferGeometry {
  const outer = Math.min(size.x, size.y) / 2
  const inner = outer * 0.55
  const shape = new THREE.Shape()
  shape.absarc(0, outer, outer, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, outer, inner, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: size.z,
    bevelEnabled: false,
    curveSegments: 48
  })
  geometry.translate(0, -outer, -size.z / 2)
  applyMeterUVs(geometry)
  return geometry
}

/** Arco de paso: marco con dovela semicircular, de pie. */
function buildArch(size: THREE.Vector3): THREE.BufferGeometry {
  const w = size.x
  const h = size.y
  const t = w * 0.16
  const outerR = w / 2
  const innerR = outerR - t
  const spring = h - outerR // altura del arranque de la dovela
  const pts: THREE.Vector2[] = []
  const seg = 24

  pts.push(new THREE.Vector2(-outerR, 0))
  pts.push(new THREE.Vector2(-outerR, spring))
  for (let i = 1; i <= seg; i++) {
    const angle = Math.PI - (i / seg) * Math.PI // π → 0 (izquierda → derecha)
    pts.push(new THREE.Vector2(Math.cos(angle) * outerR, spring + Math.sin(angle) * outerR))
  }
  pts.push(new THREE.Vector2(outerR, 0))
  pts.push(new THREE.Vector2(innerR, 0))
  pts.push(new THREE.Vector2(innerR, spring))
  for (let i = 1; i <= seg; i++) {
    const angle = (i / seg) * Math.PI // 0 → π (derecha → izquierda, hueco)
    pts.push(new THREE.Vector2(Math.cos(angle) * innerR, spring + Math.sin(angle) * innerR))
  }
  pts.push(new THREE.Vector2(-innerR, 0))

  const shape = new THREE.Shape(pts)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: size.z,
    bevelEnabled: false,
    curveSegments: 24
  })
  geometry.translate(0, 0, -size.z / 2)
  applyMeterUVs(geometry)
  return geometry
}

/** Escalera: perfil dentado (z, y) extruido a lo largo de X (anchura). */
function buildStairs(size: THREE.Vector3): THREE.BufferGeometry {
  const steps = 5
  const run = size.z / steps
  const rise = size.y / steps
  const profile: ProfilePoint[] = [[-size.z / 2, 0]]
  for (let i = 0; i < steps; i++) {
    const z0 = -size.z / 2 + i * run
    const y1 = (i + 1) * rise
    profile.push([z0, y1])
    profile.push([z0 + run, y1])
  }
  profile.push([size.z / 2, 0])
  return prismFromProfile(profile, size.x)
}

/** Columna estructural con basa, fuste y capitel. */
function buildColumn(size: THREE.Vector3): THREE.BufferGeometry {
  const w = size.x
  const h = size.y
  const d = size.z
  const baseH = Math.min(0.14, h * 0.06)
  const capH = Math.min(0.14, h * 0.06)
  const shaftH = Math.max(0.2, h - baseH - capH)
  return mergeParts([
    boxPart(w * 1.18, baseH, d * 1.18, 0, 0, 0),
    boxPart(w, shaftH, d, 0, baseH, 0),
    boxPart(w * 1.18, capH, d * 1.18, 0, baseH + shaftH, 0)
  ])
}

/** Viga estructural tipo I / concreto armado a cota superior. */
function buildBeam(size: THREE.Vector3): THREE.BufferGeometry {
  const w = size.x
  const h = size.y
  const d = size.z
  const flangeH = Math.max(0.05, h * 0.22)
  const webD = Math.max(0.08, d * 0.45)
  return mergeParts([
    boxPart(w, flangeH, d, 0, 0, 0),
    boxPart(w, Math.max(0.05, h - flangeH * 2), webD, 0, flangeH, 0),
    boxPart(w, flangeH, d, 0, h - flangeH, 0)
  ])
}

/**
 * Cubierta a dos aguas: perfil triangular (eave → cumbrera → eave) extruido
 * a lo largo de X. Las UVs laterales usan longitud de arco, así que las filas
 * de teja bajan pegadas a la pendiente real (sin compresión de proyección).
 */
function buildGable(size: THREE.Vector3): THREE.BufferGeometry {
  const half = size.z / 2
  return prismFromProfile(
    [
      [-half, 0],
      [0, size.y],
      [half, 0]
    ],
    size.x
  )
}

/** Cubierta a un agua: vertiente única desde el borde alto hasta el bajo. */
function buildShed(size: THREE.Vector3): THREE.BufferGeometry {
  const half = size.z / 2
  return prismFromProfile(
    [
      [-half, 0],
      [half, 0],
      [-half, size.y]
    ],
    size.x
  )
}

/** Cubierta plana: losa con pequeña altura. */
function buildFlat(size: THREE.Vector3): THREE.BufferGeometry {
  const half = size.z / 2
  return prismFromProfile(
    [
      [-half, 0],
      [half, 0],
      [half, size.y],
      [-half, size.y]
    ],
    size.x
  )
}

/** Mansarda: talud bajo + faldón superior corto (perfil de 6 vértices). */
function buildMansard(size: THREE.Vector3): THREE.BufferGeometry {
  const half = size.z / 2
  const low = size.y * 0.55
  const inset = size.z * 0.28
  return prismFromProfile(
    [
      [-half, 0],
      [half, 0],
      [half - inset * 0.4, low],
      [half - inset, size.y],
      [-half + inset, size.y],
      [-half + inset * 0.4, low]
    ],
    size.x
  )
}

/** Diente de sierra: dos dientes con vertiente y pared vertical. */
function buildSawtooth(size: THREE.Vector3): THREE.BufferGeometry {
  const half = size.z / 2
  const tooth = size.z / 2
  const valley = size.y * 0.25
  const profile: ProfilePoint[] = [
    [-half, 0],
    [-half, valley],
    [-half + tooth * 0.7, size.y],
    [-half + tooth, size.y],
    [-half + tooth, valley],
    [-half + tooth + tooth * 0.7, size.y],
    [half, size.y],
    [half, valley],
    [half, 0]
  ]
  return prismFromProfile(profile, size.x)
}

/**
 * Cuatro aguas (hip): pirámide truncada con quilla corta a lo largo de X.
 * Cada cara lleva su UV de pendiente (v = longitud desde el alero).
 */
function buildHip(size: THREE.Vector3): THREE.BufferGeometry {
  const hx = size.x / 2
  const hz = size.z / 2
  const h = size.y
  const ridgeHalf = Math.max(0.05, hx - hz)
  const positions: number[] = []
  const uvs: number[] = []

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    uvA: [number, number],
    uvB: [number, number],
    uvC: [number, number],
    uvD: [number, number]
  ): void => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d)
    uvs.push(...uvA, ...uvB, ...uvC, ...uvA, ...uvC, ...uvD)
  }

  // Vertientes largas (±Z): trapecio eave → quilla, v = longitud de pendiente.
  const slopeLen = Math.hypot(hz, h)
  quad(
    [-hx, 0, hz],
    [hx, 0, hz],
    [ridgeHalf, h, 0],
    [-ridgeHalf, h, 0],
    [-hx, 0],
    [hx, 0],
    [ridgeHalf, slopeLen],
    [-ridgeHalf, slopeLen]
  )
  quad(
    [hx, 0, -hz],
    [-hx, 0, -hz],
    [-ridgeHalf, h, 0],
    [ridgeHalf, h, 0],
    [hx, 0],
    [-hx, 0],
    [-ridgeHalf, slopeLen],
    [ridgeHalf, slopeLen]
  )
  // Empometes (±X): triángulos, u = Z, v = pendiente lateral.
  const hipLen = Math.hypot(hx - ridgeHalf, h)
  positions.push(hx, 0, hz, hx, 0, -hz, ridgeHalf, h, 0)
  uvs.push(hz, 0, -hz, 0, 0, hipLen)
  positions.push(-hx, 0, -hz, -hx, 0, hz, -ridgeHalf, h, 0)
  uvs.push(-hz, 0, hz, 0, 0, hipLen)
  // Faldón inferior (cierra el volumen).
  quad(
    [-hx, 0, -hz],
    [hx, 0, -hz],
    [hx, 0, hz],
    [-hx, 0, hz],
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz]
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

/** Caja con base en y = `y` (coordenada del suelo de la pieza). */
function boxPart(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d)
  geometry.translate(x, y + h / 2, z)
  return geometry
}

function cylinderPart(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, open = false): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(rTop, rBottom, h, 24, 1, open)
  geometry.translate(x, y + h / 2, z)
  return geometry
}

function spherePart(r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(r, 20, 14)
  geometry.translate(x, y, z)
  return geometry
}

/** Fusiona las piezas en una sola geometría (una malla = un solo dispose). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part))
  const merged = mergeGeometries(flat, false)
  flat.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('No se pudieron fusionar las piezas del mueble.')
  applyMeterUVs(merged)
  return merged
}

function buildChair(): THREE.BufferGeometry {
  const seatY = 0.45
  return mergeParts([
    boxPart(0.46, 0.05, 0.46, 0, seatY, 0),
    boxPart(0.46, 0.45, 0.05, 0, seatY + 0.05, -0.205),
    boxPart(0.05, seatY, 0.05, -0.19, 0, -0.19),
    boxPart(0.05, seatY, 0.05, 0.19, 0, -0.19),
    boxPart(0.05, seatY, 0.05, -0.19, 0, 0.19),
    boxPart(0.05, seatY, 0.05, 0.19, 0, 0.19)
  ])
}

function buildTable(): THREE.BufferGeometry {
  const topY = 0.75
  return mergeParts([
    boxPart(1.4, 0.06, 0.9, 0, topY, 0),
    boxPart(0.07, topY, 0.07, -0.63, 0, -0.38),
    boxPart(0.07, topY, 0.07, 0.63, 0, -0.38),
    boxPart(0.07, topY, 0.07, -0.63, 0, 0.38),
    boxPart(0.07, topY, 0.07, 0.63, 0, 0.38)
  ])
}

function buildDesk(): THREE.BufferGeometry {
  const topY = 0.74
  return mergeParts([
    boxPart(1.3, 0.05, 0.7, 0, topY, 0),
    boxPart(0.05, topY, 0.66, -0.625, 0, 0),
    boxPart(0.42, topY - 0.08, 0.6, 0.4, 0, 0),
    boxPart(1.2, 0.25, 0.04, 0, topY - 0.3, -0.32),
    boxPart(0.38, 0.02, 0.02, 0.4, topY - 0.12, 0.31),
    boxPart(0.38, 0.02, 0.02, 0.4, topY - 0.34, 0.31)
  ])
}

function buildBed(): THREE.BufferGeometry {
  // Somier, colchón, cabecero y almohada (cama de 1,5 × 2,1 m).
  return mergeParts([
    boxPart(1.5, 0.25, 2.1, 0, 0, 0),
    boxPart(1.44, 0.22, 2.0, 0, 0.25, 0),
    boxPart(1.5, 0.6, 0.08, 0, 0.25, -1.05),
    boxPart(0.6, 0.1, 0.4, 0, 0.47, -0.75)
  ])
}

function buildSofa(width: number): THREE.BufferGeometry {
  const armW = 0.18
  const inner = width / 2 - armW
  return mergeParts([
    boxPart(width, 0.4, 0.85, 0, 0, 0),
    boxPart(width, 0.45, 0.2, 0, 0.4, -0.325),
    boxPart(armW, 0.3, 0.85, -inner - armW / 2, 0.4, 0),
    boxPart(armW, 0.3, 0.85, inner + armW / 2, 0.4, 0),
    boxPart(inner - 0.04, 0.12, 0.75, -inner / 2, 0.4, 0.03),
    boxPart(inner - 0.04, 0.12, 0.75, inner / 2, 0.4, 0.03)
  ])
}

function buildLamp(): THREE.BufferGeometry {
  return mergeParts([
    cylinderPart(0.18, 0.2, 0.04, 0, 0, 0),
    cylinderPart(0.02, 0.02, 1.3, 0, 0.04, 0),
    cylinderPart(0.13, 0.21, 0.3, 0, 1.34, 0, true)
  ])
}

function buildPlant(): THREE.BufferGeometry {
  return mergeParts([
    cylinderPart(0.16, 0.12, 0.3, 0, 0, 0),
    cylinderPart(0.025, 0.035, 0.5, 0, 0.3, 0),
    spherePart(0.24, 0, 0.92, 0),
    spherePart(0.16, 0.17, 0.78, 0.08),
    spherePart(0.14, -0.15, 0.8, -0.06)
  ])
}

/**
 * Geometría paramétrica para un `shapeId` del catálogo. Devuelve `null` si el
 * id no es reconocido: el llamador cae a la caja histórica, que es lo que
 * necesitan los proyectos guardados con objetos antiguos sin `shapeId`.
 *
 * Las piezas de mobiliario usan su escala métrica natural; perfiles, cubiertas
 * y escalera son paramétricos a partir de `size`.
 */
export function buildShapeGeometry(
  shapeId: string,
  size: THREE.Vector3,
  structuralParams?: StructuralParams | null
): THREE.BufferGeometry | null {
  if (isParametricStructuralShape(shapeId)) {
    return buildStructuralOrGeometricGeometry(shapeId, size, structuralParams)
  }

  const cadBlockGeo = buildCadBlock3DGeometry(shapeId, size)
  if (cadBlockGeo) {
    applyMeterUVs(cadBlockGeo)
    return cadBlockGeo
  }

  let furnGeo: THREE.BufferGeometry | null = null
  switch (shapeId) {
    case 'shape.l':
    case 'shape.u':
    case 'shape.c':
    case 'shape.t':
    case 'shape.cross':
      return extrudeProfileShape(shapeId, size)
    case 'shape.ring':
      return buildRing(size)
    case 'shape.arc':
      return buildArch(size)
    case 'shape.stairs':
      return buildStairs(size)
    case 'shape.column':
      return buildColumn(size)
    case 'shape.beam':
      return buildBeam(size)
    case 'opening.slab':
      return buildFlat(size)
    case 'roof.gable':
      return buildGable(size)
    case 'roof.hip':
      return buildHip(size)
    case 'roof.shed':
      return buildShed(size)
    case 'roof.flat':
      return buildFlat(size)
    case 'roof.mansard':
      return buildMansard(size)
    case 'roof.sawtooth':
      return buildSawtooth(size)
    case 'furn.chair':
      furnGeo = buildChair()
      break
    case 'furn.table':
      furnGeo = buildTable()
      break
    case 'furn.desk':
      furnGeo = buildDesk()
      break
    case 'furn.bed':
      furnGeo = buildBed()
      break
    case 'furn.sofa':
      furnGeo = buildSofa(1.9)
      break
    case 'furn.armchair':
      furnGeo = buildSofa(0.95)
      break
    case 'furn.lamp':
      furnGeo = buildLamp()
      break
    case 'furn.plant':
      furnGeo = buildPlant()
      break
    default:
      return null
  }

  if (furnGeo) {
    const nat = naturalSizeForShape(shapeId)
    const isDefaultUnitBox =
      Math.abs(size.x - 1) < 1e-3 && Math.abs(size.y - 1) < 1e-3 && Math.abs(size.z - 1) < 1e-3
    if (
      nat &&
      !isDefaultUnitBox &&
      (Math.abs(size.x - nat.x) > 1e-2 || Math.abs(size.y - nat.y) > 1e-2 || Math.abs(size.z - nat.z) > 1e-2)
    ) {
      furnGeo.scale(
        Math.max(0.1, size.x / nat.x),
        Math.max(0.1, size.y / nat.y),
        Math.max(0.1, size.z / nat.z)
      )
      furnGeo.computeVertexNormals()
      applyMeterUVs(furnGeo)
    }
    return furnGeo
  }
  return null
}
