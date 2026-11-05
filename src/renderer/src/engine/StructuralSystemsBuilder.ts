import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyMeterUVs } from './MaterialSystem'
import { defaultStructuralParamsFor, type StructuralParams } from '../models/StructuralTypes'

/**
 * Normaliza una geometría parcial a `position` + `normal` no indexados para que
 * `mergeGeometries` nunca falle por discrepancia de atributos (`uv`, índices, etc.).
 */
function normalizePart(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') {
      g.deleteAttribute(name)
    }
  }
  if (!g.getAttribute('normal')) {
    g.computeVertexNormals()
  }
  return g
}

function finalizeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = parts
    .map((p) => {
      const n = normalizePart(p)
      p.dispose()
      return n
    })
    .filter((p) => {
      const pos = p.getAttribute('position')
      return Boolean(pos && pos.count >= 3)
    })

  if (valid.length === 0) {
    const fallback = new THREE.BoxGeometry(1, 1, 1)
    fallback.translate(0, 0.5, 0)
    const out = fallback.toNonIndexed()
    fallback.dispose()
    out.computeVertexNormals()
    applyMeterUVs(out)
    return out
  }

  const merged = valid.length === 1 ? valid[0] : mergeGeometries(valid, false)
  if (valid.length > 1) valid.forEach((v) => v.dispose())
  merged.computeVertexNormals()
  applyMeterUVs(merged)
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

const UP = new THREE.Vector3(0, 1, 0)

/** Crea una barra cilíndrica o prismática entre dos puntos 3D `a` y `b`. */
function makeStrut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  radialSegments = 6
): THREE.BufferGeometry | null {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  if (len < 1e-4) return null
  const cyl = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1)
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize())
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1))
  cyl.applyMatrix4(mat)
  return cyl
}

function makeBoxAt(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number
): THREE.BufferGeometry {
  const b = new THREE.BoxGeometry(Math.max(0.02, w), Math.max(0.02, h), Math.max(0.02, d))
  b.translate(cx, cy, cz)
  return b
}

/** Construye una superficie gruesa doble cara (extradós + intradós + bordes perimetrales) a partir de una malla `nu × nv`. */
function makeThickGridShell(
  nu: number,
  nv: number,
  evalPoint: (u: number, v: number) => THREE.Vector3,
  thickness: number
): THREE.BufferGeometry {
  const U = Math.max(2, nu)
  const V = Math.max(2, nv)
  const halfT = Math.max(0.02, thickness) * 0.5

  const topGrid: THREE.Vector3[][] = []
  const botGrid: THREE.Vector3[][] = []

  // Primero muestreamos puntos medios
  const midGrid: THREE.Vector3[][] = []
  for (let iu = 0; iu <= U; iu++) {
    const row: THREE.Vector3[] = []
    for (let iv = 0; iv <= V; iv++) {
      row.push(evalPoint(iu / U, iv / V))
    }
    midGrid.push(row)
  }

  // Normales aproximadas por diferencias finitas para desplazar ±halfT
  for (let iu = 0; iu <= U; iu++) {
    const topRow: THREE.Vector3[] = []
    const botRow: THREE.Vector3[] = []
    for (let iv = 0; iv <= V; iv++) {
      const pPrevU = midGrid[Math.max(0, iu - 1)][iv]
      const pNextU = midGrid[Math.min(U, iu + 1)][iv]
      const pPrevV = midGrid[iu][Math.max(0, iv - 1)]
      const pNextV = midGrid[iu][Math.min(V, iv + 1)]
      const du = new THREE.Vector3().subVectors(pNextU, pPrevU)
      const dv = new THREE.Vector3().subVectors(pNextV, pPrevV)
      const n = new THREE.Vector3().crossVectors(dv, du)
      if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
      else n.normalize()
      if (n.y < 0) n.negate()

      const mid = midGrid[iu][iv]
      topRow.push(mid.clone().addScaledVector(n, halfT))
      botRow.push(mid.clone().addScaledVector(n, -halfT))
    }
    topGrid.push(topRow)
    botGrid.push(botRow)
  }

  const positions: number[] = []
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
  }

  for (let iu = 0; iu < U; iu++) {
    for (let iv = 0; iv < V; iv++) {
      // Cara superior
      pushQuad(topGrid[iu][iv], topGrid[iu][iv + 1], topGrid[iu + 1][iv + 1], topGrid[iu + 1][iv])
      // Cara inferior (orden inverso)
      pushQuad(botGrid[iu][iv], botGrid[iu + 1][iv], botGrid[iu + 1][iv + 1], botGrid[iu][iv + 1])
    }
  }

  // Costados de cierre perimetral
  for (let iu = 0; iu < U; iu++) {
    pushQuad(botGrid[iu][0], topGrid[iu][0], topGrid[iu + 1][0], botGrid[iu + 1][0])
    pushQuad(topGrid[iu][V], botGrid[iu][V], botGrid[iu + 1][V], topGrid[iu + 1][V])
  }
  for (let iv = 0; iv < V; iv++) {
    pushQuad(topGrid[0][iv], botGrid[0][iv], botGrid[0][iv + 1], topGrid[0][iv + 1])
    pushQuad(botGrid[U][iv], topGrid[U][iv], topGrid[U][iv + 1], botGrid[U][iv + 1])
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

/* ========================================================================== */
/* 1. ADINTELADA O ARQUITRABADA                                               */
/* ========================================================================== */
function buildAdintelada(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(1, size.x)
  const H = Math.max(1, size.y)
  const D = Math.max(0.8, size.z)
  const baysX = Math.max(1, Math.min(12, Math.round(p.bays || 3)))
  const baysZ = Math.max(1, Math.min(8, Math.round(p.divisions || 1)))
  const colT = Math.max(0.14, Math.min(0.9, p.thickness || 0.35))
  const beamH = Math.min(H * 0.22, Math.max(0.22, colT * 1.15))
  const colH = Math.max(0.3, H - beamH)
  const plinthH = Math.min(0.16, colH * 0.1)

  const parts: THREE.BufferGeometry[] = []

  // Columnas verticales + basas + ábacos
  for (let ix = 0; ix <= baysX; ix++) {
    const x = -W / 2 + colT / 2 + (ix / baysX) * Math.max(0, W - colT)
    for (let iz = 0; iz <= baysZ; iz++) {
      const z = baysZ === 0 ? 0 : -D / 2 + colT / 2 + (iz / baysZ) * Math.max(0, D - colT)
      parts.push(makeBoxAt(colT * 1.28, plinthH, colT * 1.28, x, plinthH / 2, z))
      parts.push(makeBoxAt(colT, colH, colT, x, colH / 2, z))
    }
  }

  // Arquitrabes / dinteles longitudinales (eje X)
  for (let iz = 0; iz <= baysZ; iz++) {
    const z = -D / 2 + colT / 2 + (iz / baysZ) * Math.max(0, D - colT)
    parts.push(makeBoxAt(W, beamH, colT * 1.05, 0, colH + beamH / 2, z))
  }

  // Vigas transversales (eje Z) y viguetas secundarias
  const joistCount = baysX * 2 + 1
  const joistH = beamH * 0.72
  for (let j = 0; j < joistCount; j++) {
    const x = -W / 2 + colT / 2 + (j / Math.max(1, joistCount - 1)) * Math.max(0, W - colT)
    const isMain = j % 2 === 0
    parts.push(
      makeBoxAt(
        isMain ? colT * 0.95 : colT * 0.5,
        isMain ? beamH * 0.9 : joistH,
        D,
        x,
        colH + (isMain ? beamH * 0.45 : beamH - joistH / 2),
        0
      )
    )
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 2. ABOVEDADA (Arco de medio punto, Bóveda de cañón, Cúpula semiesférica)   */
/* ========================================================================== */
function buildAbovedada(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const sub = p.subType || 'boveda'
  const W = Math.max(1, size.x)
  const H = Math.max(1, size.y)
  const D = Math.max(0.6, size.z)
  const segs = Math.max(10, Math.min(48, Math.round(p.divisions || 20)))
  const T = Math.max(0.14, Math.min(W * 0.25, p.thickness || 0.35))

  if (sub === 'cupula') {
    const R = Math.max(0.6, Math.min(W, D) * 0.5)
    const domeRise = Math.max(0.4, Math.min(H * 0.78, p.archRise > 0 ? p.archRise : R))
    const drumH = Math.max(0.2, H - domeRise)
    const parts: THREE.BufferGeometry[] = []

    // Tambor cilíndrico portante inferior
    const outerDrum = new THREE.Shape()
    outerDrum.absarc(0, 0, R, 0, Math.PI * 2, false)
    const innerR = Math.max(0.15, R - T)
    const hole = new THREE.Path()
    hole.absarc(0, 0, innerR, 0, Math.PI * 2, true)
    outerDrum.holes.push(hole)
    const drumGeo = new THREE.ExtrudeGeometry(outerDrum, { depth: drumH, bevelEnabled: false, curveSegments: segs })
    drumGeo.rotateX(-Math.PI / 2)
    parts.push(drumGeo)

    // Casquete esférico con espesor real (perfil girado con LatheGeometry)
    const pts: THREE.Vector2[] = []
    const oculusAngle = 0.14
    const halfSegs = Math.max(8, Math.round(segs * 0.65))
    for (let i = 0; i <= halfSegs; i++) {
      const a = (i / halfSegs) * (Math.PI / 2 - oculusAngle)
      pts.push(new THREE.Vector2(R * Math.cos(a), drumH + domeRise * Math.sin(a)))
    }
    for (let i = halfSegs; i >= 0; i--) {
      const a = (i / halfSegs) * (Math.PI / 2 - oculusAngle)
      const rIn = Math.max(0.1, (R - T) * Math.cos(a))
      const yIn = drumH + Math.max(0.15, domeRise - T) * Math.sin(a)
      pts.push(new THREE.Vector2(rIn, yIn))
    }
    pts.push(pts[0].clone())
    const domeLathe = new THREE.LatheGeometry(pts, segs)
    parts.push(domeLathe)

    return finalizeParts(parts)
  }

  // Arco de medio punto ('arco') o Bóveda de cañón ('boveda')
  const extrudeDepth = sub === 'arco' ? Math.min(D, Math.max(0.4, T * 2.2)) : D
  const halfW = W / 2
  const innerHalfW = Math.max(0.2, halfW - T)
  const rise = Math.max(0.35, Math.min(H - T - 0.2, p.archRise > 0 ? p.archRise : innerHalfW))
  const springY = Math.max(0.25, H - rise - T)

  const shape = new THREE.Shape()
  shape.moveTo(-halfW, 0)
  shape.lineTo(-halfW, springY)
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI - (i / segs) * Math.PI
    shape.lineTo(Math.cos(a) * halfW, springY + Math.sin(a) * (rise + T))
  }
  shape.lineTo(halfW, 0)
  shape.lineTo(innerHalfW, 0)
  shape.lineTo(innerHalfW, springY)
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI
    shape.lineTo(Math.cos(a) * innerHalfW, springY + Math.sin(a) * rise)
  }
  shape.lineTo(-innerHalfW, 0)
  shape.closePath()

  const vault = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: false,
    curveSegments: segs
  })
  vault.translate(0, 0, -extrudeDepth / 2)

  const parts: THREE.BufferGeometry[] = [vault]

  // Contrafuertes laterales en bóveda de cañón según `bays`
  if (sub === 'boveda') {
    const buttressCount = Math.max(2, Math.min(8, Math.round(p.bays || 3) + 1))
    const bW = T * 0.55
    const bD = Math.min(0.45, D / (buttressCount * 2.2))
    for (let i = 0; i < buttressCount; i++) {
      const z = -D / 2 + bD / 2 + (i / Math.max(1, buttressCount - 1)) * (D - bD)
      parts.push(makeBoxAt(bW, springY * 0.92, bD, -halfW - bW * 0.35, (springY * 0.92) / 2, z))
      parts.push(makeBoxAt(bW, springY * 0.92, bD, halfW + bW * 0.35, (springY * 0.92) / 2, z))
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 3. ENTRAMADA O DE ARMAZÓN (Pilares, vigas y forjados 3D)                   */
/* ========================================================================== */
function buildEntramada(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(1.2, size.x)
  const H = Math.max(1.5, size.y)
  const D = Math.max(1.2, size.z)
  const baysX = Math.max(1, Math.min(8, Math.round(p.bays || 3)))
  const baysZ = Math.max(1, Math.min(8, Math.round(p.divisions || 2)))
  const floors = Math.max(1, Math.min(8, Math.round(p.floors ?? 2)))
  const colT = Math.max(0.14, Math.min(0.6, p.thickness || 0.3))
  const slabH = Math.max(0.12, colT * 0.55)
  const beamH = Math.max(0.16, colT * 0.9)

  const parts: THREE.BufferGeometry[] = []

  // Pilares continuos en cada intersección de ejes
  for (let ix = 0; ix <= baysX; ix++) {
    const x = -W / 2 + colT / 2 + (ix / baysX) * (W - colT)
    for (let iz = 0; iz <= baysZ; iz++) {
      const z = -D / 2 + colT / 2 + (iz / baysZ) * (D - colT)
      parts.push(makeBoxAt(colT, H, colT, x, H / 2, z))
    }
  }

  // Losa de cimentación inferior sutil
  parts.push(makeBoxAt(W, slabH * 0.65, D, 0, (slabH * 0.65) / 2, 0))

  // Forjados y retícula de vigas por planta
  for (let f = 1; f <= floors; f++) {
    const yTop = (f / floors) * H
    const ySlabCenter = yTop - slabH / 2
    const yBeamCenter = yTop - slabH - beamH / 2

    // Losa / forjado
    parts.push(makeBoxAt(W, slabH, D, 0, ySlabCenter, 0))

    // Vigas en X
    for (let iz = 0; iz <= baysZ; iz++) {
      const z = -D / 2 + colT / 2 + (iz / baysZ) * (D - colT)
      parts.push(makeBoxAt(W, beamH, colT * 0.85, 0, yBeamCenter, z))
    }
    // Vigas en Z
    for (let ix = 0; ix <= baysX; ix++) {
      const x = -W / 2 + colT / 2 + (ix / baysX) * (W - colT)
      parts.push(makeBoxAt(colT * 0.85, beamH, D, x, yBeamCenter, 0))
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 4. TRIANGULADA (Cerchas, armaduras de techo y celosías)                    */
/* ========================================================================== */
function buildTriangulada(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(1.5, size.x)
  const H = Math.max(0.8, size.y)
  const D = Math.max(0.8, size.z)
  const trussCount = Math.max(2, Math.min(8, Math.round(p.bays || 4)))
  const panels = Math.max(4, Math.min(14, Math.round(p.divisions || 6)))
  const evenPanels = panels % 2 === 0 ? panels : panels + 1
  const rMain = Math.max(0.035, Math.min(0.22, (p.thickness || 0.14) * 0.5))
  const rWeb = rMain * 0.72

  const rise = Math.max(0.4, Math.min(H * 0.65, p.archRise > 0 ? p.archRise : H * 0.48))
  const colH = Math.max(0.05, H - rise)

  const parts: THREE.BufferGeometry[] = []

  const trussZPositions: number[] = []
  for (let it = 0; it < trussCount; it++) {
    const z = trussCount === 1 ? 0 : -D / 2 + rMain + (it / (trussCount - 1)) * Math.max(0, D - rMain * 2)
    trussZPositions.push(z)

    // Pilares de apoyo laterales si colH > 0.25
    if (colH > 0.25) {
      parts.push(makeBoxAt(rMain * 2.4, colH, rMain * 2.4, -W / 2 + rMain, colH / 2, z))
      parts.push(makeBoxAt(rMain * 2.4, colH, rMain * 2.4, W / 2 - rMain, colH / 2, z))
    }

    const bottomNodes: THREE.Vector3[] = []
    const topNodes: THREE.Vector3[] = []

    for (let i = 0; i <= evenPanels; i++) {
      const u = i / evenPanels // 0..1
      const x = -W / 2 + rMain + u * (W - rMain * 2)
      const roofFactor = 1 - Math.abs(u * 2 - 1) // 0 en extremos -> 1 en cumbrera
      const topY = colH + Math.max(rMain * 2.2, roofFactor * rise)
      bottomNodes.push(new THREE.Vector3(x, colH, z))
      topNodes.push(new THREE.Vector3(x, topY, z))
    }

    for (let i = 0; i < evenPanels; i++) {
      // Cordón inferior, cordón superior, montantes y diagonales Pratt
      const sBot = makeStrut(bottomNodes[i], bottomNodes[i + 1], rMain)
      const sTop = makeStrut(topNodes[i], topNodes[i + 1], rMain)
      const sVert = makeStrut(bottomNodes[i], topNodes[i], rWeb)
      if (sBot) parts.push(sBot)
      if (sTop) parts.push(sTop)
      if (sVert) parts.push(sVert)

      const diag =
        i < evenPanels / 2
          ? makeStrut(topNodes[i], bottomNodes[i + 1], rWeb)
          : makeStrut(bottomNodes[i], topNodes[i + 1], rWeb)
      if (diag) parts.push(diag)
    }
    const lastVert = makeStrut(bottomNodes[evenPanels], topNodes[evenPanels], rWeb)
    if (lastVert) parts.push(lastVert)
  }

  // Correas longitudinales y arriostramiento entre cerchas
  if (trussZPositions.length >= 2) {
    const zMin = trussZPositions[0]
    const zMax = trussZPositions[trussZPositions.length - 1]
    for (let i = 0; i <= evenPanels; i += Math.max(1, Math.floor(evenPanels / 4))) {
      const u = i / evenPanels
      const x = -W / 2 + rMain + u * (W - rMain * 2)
      const roofFactor = 1 - Math.abs(u * 2 - 1)
      const topY = colH + Math.max(rMain * 2.2, roofFactor * rise)
      const purlin = makeStrut(new THREE.Vector3(x, topY, zMin), new THREE.Vector3(x, topY, zMax), rWeb * 0.85)
      if (purlin) parts.push(purlin)
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 5. COLGANTE O SUSPENDIDA (Mástiles, catenarias y tirantes)                 */
/* ========================================================================== */
function buildColgante(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(3, size.x)
  const H = Math.max(2, size.y)
  const D = Math.max(1.2, size.z)
  const hangerCount = Math.max(6, Math.min(28, Math.round(p.divisions || 12)))
  const pylonCount = Math.max(2, Math.min(4, Math.round(p.bays || 2)))
  const pylonT = Math.max(0.18, Math.min(0.65, p.thickness || 0.26))
  const cableR = Math.max(0.035, pylonT * 0.22)
  const hangerR = Math.max(0.02, cableR * 0.6)

  const deckY = H * 0.28
  const deckH = Math.max(0.16, pylonT * 0.7)
  const zSide = D / 2 - pylonT * 0.65

  const parts: THREE.BufferGeometry[] = []

  // Tablero / pasarela estructural suspendida
  parts.push(makeBoxAt(W * 0.94, deckH, D * 0.82, 0, deckY, 0))
  // Bloques de anclaje en ambos extremos
  parts.push(makeBoxAt(pylonT * 2.2, deckY + deckH, D * 0.92, -W / 2 + pylonT * 1.1, (deckY + deckH) / 2, 0))
  parts.push(makeBoxAt(pylonT * 2.2, deckY + deckH, D * 0.92, W / 2 - pylonT * 1.1, (deckY + deckH) / 2, 0))

  // Posiciones X de los pilonos principales
  const pylonXs: number[] = []
  const spanZone = W * 0.64
  for (let i = 0; i < pylonCount; i++) {
    const px =
      pylonCount === 1
        ? 0
        : -spanZone / 2 + (i / (pylonCount - 1)) * spanZone
    pylonXs.push(px)

    // Pórtico en H de cada mástil/pilar principal
    parts.push(makeBoxAt(pylonT, H, pylonT, px, H / 2, -zSide))
    parts.push(makeBoxAt(pylonT, H, pylonT, px, H / 2, zSide))
    parts.push(makeBoxAt(pylonT * 0.85, pylonT * 0.85, zSide * 2, px, H * 0.92, 0))
    parts.push(makeBoxAt(pylonT * 0.85, pylonT * 0.85, zSide * 2, px, deckY - deckH * 0.6, 0))
  }

  // Función de altura de la catenaria entre anclajes y pilonos
  const sagDepth = Math.max(0.3, Math.min(H - deckY - 0.35, p.archRise > 0 ? p.archRise : (H - deckY) * 0.68))
  const minCableY = Math.max(deckY + deckH + 0.18, H - sagDepth)
  const anchorsX = [-W / 2 + pylonT, ...pylonXs, W / 2 - pylonT]
  const anchorsY = [deckY + deckH * 0.6, ...pylonXs.map(() => H * 0.96), deckY + deckH * 0.6]

  const evalCableY = (x: number): number => {
    for (let s = 0; s < anchorsX.length - 1; s++) {
      const x0 = anchorsX[s]
      const x1 = anchorsX[s + 1]
      if (x >= x0 - 1e-4 && x <= x1 + 1e-4) {
        const u = Math.max(0, Math.min(1, (x - x0) / Math.max(1e-4, x1 - x0)))
        const linearY = anchorsY[s] * (1 - u) + anchorsY[s + 1] * u
        const isMainSpan = s > 0 && s < anchorsX.length - 2
        const localSag = isMainSpan ? (H * 0.96 - minCableY) : (H * 0.96 - minCableY) * 0.35
        return linearY - 4 * u * (1 - u) * localSag
      }
    }
    return deckY + deckH
  }

  // Cables portantes principales + péndolas verticales en ambos lados (-zSide y +zSide)
  const totalSamples = hangerCount * 2
  for (const z of [-zSide, zSide]) {
    let prevPt: THREE.Vector3 | null = null
    for (let i = 0; i <= totalSamples; i++) {
      const x = anchorsX[0] + (i / totalSamples) * (anchorsX[anchorsX.length - 1] - anchorsX[0])
      const cy = evalCableY(x)
      const pt = new THREE.Vector3(x, cy, z)
      if (prevPt) {
        const seg = makeStrut(prevPt, pt, cableR, 6)
        if (seg) parts.push(seg)
      }
      if (i > 0 && i < totalSamples && i % 2 === 0) {
        const hanger = makeStrut(new THREE.Vector3(x, deckY + deckH / 2, z), pt, hangerR, 5)
        if (hanger) parts.push(hanger)
      }
      prevPt = pt
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 6. TENSADA O DE TRACCIÓN (Velaria hiperbólica / membrana textil)           */
/* ========================================================================== */
function buildTensada(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(2, size.x)
  const H = Math.max(1.5, size.y)
  const D = Math.max(2, size.z)
  const segs = Math.max(10, Math.min(36, Math.round(p.divisions || 20)))
  const T = Math.max(0.05, Math.min(0.25, p.thickness || 0.08))
  const mastR = Math.max(0.05, T * 0.95)

  const highY = H * 0.96
  const lowY = Math.max(0.45, H - Math.max(0.6, Math.min(H * 0.82, p.archRise > 0 ? p.archRise : H * 0.62)))
  const halfW = W * 0.46
  const halfD = D * 0.46

  // Superficie silla de montar con festón catenario perimetral
  const evalMembrane = (u: number, v: number): THREE.Vector3 => {
    const su = u * 2 - 1 // [-1, 1]
    const sv = v * 2 - 1 // [-1, 1]
    // Esquinas (-1,-1) y (+1,+1) altas; (-1,+1) y (+1,-1) bajas
    const baseY = (highY + lowY) * 0.5 + ((highY - lowY) * 0.5) * su * sv
    const edgeScallop = 0.08 * (1 - su * su) + 0.08 * (1 - sv * sv)
    const x = su * halfW * (1 - 0.07 * (1 - sv * sv))
    const z = sv * halfD * (1 - 0.07 * (1 - su * su))
    return new THREE.Vector3(x, Math.max(0.2, baseY - edgeScallop * (highY - lowY) * 0.35), z)
  }

  const parts: THREE.BufferGeometry[] = [makeThickGridShell(segs, segs, evalMembrane, T)]

  // Mástiles inclinados en los puntos altos y dados/tensores en los puntos bajos
  const cHigh1 = evalMembrane(0, 0)
  const cHigh2 = evalMembrane(1, 1)
  const cLow1 = evalMembrane(0, 1)
  const cLow2 = evalMembrane(1, 0)

  const m1 = makeStrut(new THREE.Vector3(-W * 0.48, 0, -D * 0.48), cHigh1.clone().add(new THREE.Vector3(0, 0.15, 0)), mastR, 8)
  const m2 = makeStrut(new THREE.Vector3(W * 0.48, 0, D * 0.48), cHigh2.clone().add(new THREE.Vector3(0, 0.15, 0)), mastR, 8)
  const t1 = makeStrut(new THREE.Vector3(-W * 0.49, 0, D * 0.49), cLow1, mastR * 0.45, 6)
  const t2 = makeStrut(new THREE.Vector3(W * 0.49, 0, -D * 0.49), cLow2, mastR * 0.45, 6)
  if (m1) parts.push(m1)
  if (m2) parts.push(m2)
  if (t1) parts.push(t1)
  if (t2) parts.push(t2)

  // Postes centrales adicionales si `bays >= 5`
  if ((p.bays || 4) >= 5) {
    const centerTop = evalMembrane(0.5, 0.5)
    const mc = makeStrut(new THREE.Vector3(0, 0, 0), centerTop, mastR * 0.85, 8)
    if (mc) parts.push(mc)
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 7. NEUMÁTICA O INFLABLE (Domo / pabellón presurizado con costillas)        */
/* ========================================================================== */
function buildNeumatica(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(2, size.x)
  const H = Math.max(1.4, size.y)
  const D = Math.max(2, size.z)
  const segs = Math.max(12, Math.min(36, Math.round(p.divisions || 20)))
  const ribCount = Math.max(3, Math.min(12, Math.round(p.bays || 6)))
  const rx = W * 0.48
  const rz = D * 0.45

  // Envolvente inflada con abombamiento neumático por gajos (almohadillado)
  const evalInflatable = (u: number, v: number): THREE.Vector3 => {
    const theta = u * Math.PI * 2
    const phi = v * (Math.PI * 0.5) // 0 en base -> pi/2 en cúspide
    // Ligero perfil bulboso presurizado cerca de la base + ondas de costillas
    const pillow = 1 + 0.045 * Math.abs(Math.sin(ribCount * theta)) * Math.cos(phi)
    const radialBulge = Math.pow(Math.cos(phi), 0.85) * pillow
    const x = rx * radialBulge * Math.cos(theta)
    const z = rz * radialBulge * Math.sin(theta)
    const y = H * Math.pow(Math.sin(phi), 0.82)
    return new THREE.Vector3(x, Math.max(0, y), z)
  }

  const parts: THREE.BufferGeometry[] = [
    makeThickGridShell(segs * 2, Math.max(8, Math.round(segs * 0.65)), evalInflatable, Math.max(0.08, p.thickness || 0.14))
  ]

  // Anillo de anclaje perimetral lastrado
  const ringPts: THREE.Vector2[] = [
    new THREE.Vector2(0.88, 0),
    new THREE.Vector2(1.02, 0),
    new THREE.Vector2(1.02, Math.min(0.28, H * 0.08)),
    new THREE.Vector2(0.88, Math.min(0.28, H * 0.08)),
    new THREE.Vector2(0.88, 0)
  ]
  const ring = new THREE.LatheGeometry(ringPts, segs * 2)
  ring.scale(rx, 1, rz)
  parts.push(ring)

  // Esclusa presurizada de acceso frontal (+Z)
  const airlockW = Math.min(W * 0.24, 2.2)
  const airlockH = Math.min(H * 0.52, 2.5)
  const airlockD = Math.min(D * 0.18, 1.8)
  parts.push(makeBoxAt(airlockW, airlockH, airlockD, 0, airlockH / 2, D * 0.44))

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 8. MUROS DE CARGA (Rectos y curvos/cilíndricos con aberturas)              */
/* ========================================================================== */
function buildMurosCarga(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(1.5, size.x)
  const H = Math.max(1.2, size.y)
  const D = Math.max(1.2, size.z)
  const T = Math.max(0.22, Math.min(Math.min(W, D) * 0.35, p.thickness || 0.45))
  const openingsCount = Math.max(1, Math.min(8, Math.round(p.bays || 3)))
  const sub = p.subType || 'recto'

  const parts: THREE.BufferGeometry[] = []

  if (sub === 'curvo') {
    const R = Math.max(0.8, Math.min(W, D) * 0.48)
    const sweepDeg = Math.max(60, Math.min(350, p.sweepAngle ?? 210))
    const sweepRad = (sweepDeg * Math.PI) / 180
    const startA = -sweepRad / 2
    const segs = Math.max(16, Math.min(64, Math.round(p.divisions || 28)))

    const sillH = H * 0.25
    const lintelBottom = H * 0.78

    // Dividir el barrido en machones sólidos y tramos con vano
    const totalSlots = openingsCount * 2 + 1
    const slotAngle = sweepRad / totalSlots

    for (let s = 0; s < totalSlots; s++) {
      const a0 = startA + s * slotAngle
      const a1 = a0 + slotAngle
      const isOpening = s % 2 === 1
      const subSegs = Math.max(2, Math.ceil(segs / totalSlots))

      const buildArcBand = (y0: number, y1: number): THREE.BufferGeometry => {
        const arcShape = new THREE.Shape()
        for (let k = 0; k <= subSegs; k++) {
          const a = a0 + (k / subSegs) * (a1 - a0)
          const x = Math.cos(a) * R
          const y = Math.sin(a) * R
          if (k === 0) arcShape.moveTo(x, y)
          else arcShape.lineTo(x, y)
        }
        const rIn = Math.max(0.15, R - T)
        for (let k = subSegs; k >= 0; k--) {
          const a = a0 + (k / subSegs) * (a1 - a0)
          arcShape.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn)
        }
        arcShape.closePath()
        const g = new THREE.ExtrudeGeometry(arcShape, { depth: y1 - y0, bevelEnabled: false })
        g.rotateX(-Math.PI / 2)
        g.translate(0, y0, 0)
        return g
      }

      if (!isOpening) {
        parts.push(buildArcBand(0, H))
      } else {
        if (sillH > 0.05) parts.push(buildArcBand(0, sillH))
        parts.push(buildArcBand(lintelBottom, H))
      }
    }
    return finalizeParts(parts)
  }

  // Muros de carga rectos perimetrales con huecos reales y cadena de coronación
  const buildPerforatedWallAlongX = (zPos: number, isFront: boolean): void => {
    const slots = openingsCount * 2 + 1
    const slotW = W / slots
    const lintelY = H * 0.76
    const sillY = H * 0.28

    for (let s = 0; s < slots; s++) {
      const cx = -W / 2 + slotW * (s + 0.5)
      const isHole = s % 2 === 1
      if (!isHole) {
        parts.push(makeBoxAt(slotW + 0.005, H, T, cx, H / 2, zPos))
      } else {
        // Puerta central en fachada frontal, ventanas en los demás vanos
        const isCenterDoor = isFront && s === Math.floor(slots / 2)
        if (!isCenterDoor && sillY > 0.05) {
          parts.push(makeBoxAt(slotW + 0.005, sillY, T, cx, sillY / 2, zPos))
        }
        parts.push(makeBoxAt(slotW + 0.005, H - lintelY, T, cx, lintelY + (H - lintelY) / 2, zPos))
      }
    }
  }

  buildPerforatedWallAlongX(D / 2 - T / 2, true)
  buildPerforatedWallAlongX(-D / 2 + T / 2, false)

  const innerD = Math.max(0.1, D - T * 2)
  if (innerD > 0.2) {
    parts.push(makeBoxAt(T, H, innerD, -W / 2 + T / 2, H / 2, 0))
    parts.push(makeBoxAt(T, H, innerD, W / 2 - T / 2, H / 2, 0))
  }
  // Cadena / cornisa superior de remate
  parts.push(makeBoxAt(W + 0.12, Math.min(0.22, H * 0.08), D + 0.12, 0, H - Math.min(0.11, H * 0.04), 0))

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 9. LAMINAR O DE CASCARÓN (Paraboloides / cascarón tipo Félix Candela)      */
/* ========================================================================== */
function buildLaminar(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(2, size.x)
  const H = Math.max(1.2, size.y)
  const D = Math.max(2, size.z)
  const segs = Math.max(14, Math.min(44, Math.round(p.divisions || 24)))
  const T = Math.max(0.06, Math.min(0.35, p.thickness || 0.12))
  const sub = p.subType || 'hypar'

  if (sub === 'candela') {
    // Cascarón lobulado tipo Félix Candela (8 paraboloides / bóveda por arista sobre apoyos puntuales)
    const lobes = Math.max(4, Math.min(10, Math.round(p.bays || 6)))
    const rx = W * 0.5
    const rz = D * 0.5
    const crownH = H * 0.62
    const tipH = Math.min(H, crownH + Math.max(0.4, p.archRise || H * 0.35))

    const evalCandela = (u: number, v: number): THREE.Vector3 => {
      const theta = u * Math.PI * 2
      const r = v // 0 en el centro -> 1 en el borde lobulado
      const lobeWave = Math.abs(Math.cos((lobes * theta) / 2)) // 1 en las crestas -> 0 en los apoyos
      const radiusFactor = 0.72 + 0.28 * lobeWave
      const x = rx * r * radiusFactor * Math.cos(theta)
      const z = rz * r * radiusFactor * Math.sin(theta)
      // En r=1 y lobeWave=0 los apoyos bajan a y=0; en las crestas suben a tipH
      const yCenter = crownH * (1 - r * r * 0.45)
      const yEdge = tipH * lobeWave
      const y = yCenter * (1 - r) + yEdge * r
      return new THREE.Vector3(x, Math.max(0, y), z)
    }
    return finalizeParts([makeThickGridShell(segs * 2, Math.max(10, Math.round(segs * 0.6)), evalCandela, T)])
  }

  // Paraboloide hiperbólico clásico apoyado en 2 esquinas opuestas (y = 0) y elevado en las otras 2 (y = H)
  const halfW = W * 0.5
  const halfD = D * 0.5
  const rise = Math.max(0.4, Math.min(H * 0.95, p.archRise > 0 ? p.archRise : H * 0.55))

  const evalHypar = (u: number, v: number): THREE.Vector3 => {
    const su = u * 2 - 1 // [-1, 1]
    const sv = v * 2 - 1 // [-1, 1]
    // Con t = (su * sv + 1) / 2 ∈ [0, 1]: esquinas (-1,+1) y (+1,-1) tocan el suelo (y = 0),
    // esquinas (-1,-1) y (+1,+1) se elevan hasta H, centro en H * 0.5 + curvatura
    const normalized = (su * sv + 1) * 0.5
    const y = Math.max(0, normalized * Math.max(rise, H - T))
    return new THREE.Vector3(su * halfW, y, sv * halfD)
  }

  return finalizeParts([makeThickGridShell(segs, segs, evalHypar, T)])
}

/* ========================================================================== */
/* 10. GEODÉSICA (Cúpula / esfera de IcosahedronGeometry subdividida + nodos) */
/* ========================================================================== */
function buildGeodesica(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const rx = Math.max(0.8, size.x * 0.5)
  const rz = Math.max(0.8, size.z * 0.5)
  const H = Math.max(0.8, size.y)
  const detail = Math.max(1, Math.min(3, Math.round(p.divisions || 2)))
  const fullSphere = p.subType === 'esfera'
  const strutR = Math.max(0.025, Math.min(0.18, (p.thickness || 0.1) * 0.5))
  const nodeR = strutR * 1.65

  const ico = new THREE.IcosahedronGeometry(1, detail)
  const posAttr = ico.getAttribute('position') as THREE.BufferAttribute

  // Deduplicar vértices proyectados en la esfera unitaria
  const uniqueVerts: THREE.Vector3[] = []
  const vertKeyMap = new Map<string, number>()

  const getVertIndex = (idx: number): number => {
    const vx = posAttr.getX(idx)
    const vy = posAttr.getY(idx)
    const vz = posAttr.getZ(idx)
    const key = `${Math.round(vx * 10000)}_${Math.round(vy * 10000)}_${Math.round(vz * 10000)}`
    const found = vertKeyMap.get(key)
    if (found !== undefined) return found
    const v = new THREE.Vector3(vx, vy, vz).normalize()
    const mapped = fullSphere
      ? new THREE.Vector3(v.x * rx, (v.y + 1) * 0.5 * H, v.z * rz)
      : new THREE.Vector3(v.x * rx, Math.max(0, v.y) * H, v.z * rz)
    const newId = uniqueVerts.length
    uniqueVerts.push(mapped)
    vertKeyMap.set(key, newId)
    return newId
  }

  const edgeSet = new Set<string>()
  const usedNodes = new Set<number>()
  const parts: THREE.BufferGeometry[] = []

  const triCount = posAttr.count / 3
  for (let t = 0; t < triCount; t++) {
    const rawY0 = posAttr.getY(t * 3)
    const rawY1 = posAttr.getY(t * 3 + 1)
    const rawY2 = posAttr.getY(t * 3 + 2)
    // En modo cúpula descartamos los triángulos situados íntegramente bajo el ecuador
    if (!fullSphere && rawY0 < -0.08 && rawY1 < -0.08 && rawY2 < -0.08) continue

    const i0 = getVertIndex(t * 3)
    const i1 = getVertIndex(t * 3 + 1)
    const i2 = getVertIndex(t * 3 + 2)

    const pairs: Array<[number, number]> = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ]
    for (const [a, b] of pairs) {
      if (a === b) continue
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      if (edgeSet.has(key)) continue
      edgeSet.add(key)
      usedNodes.add(a)
      usedNodes.add(b)
      const s = makeStrut(uniqueVerts[a], uniqueVerts[b], strutR, 5)
      if (s) parts.push(s)
    }
  }
  ico.dispose()

  // Nodos esféricos (icosaedros ligeros) en cada intersección geodésica
  for (const nIdx of usedNodes) {
    const pt = uniqueVerts[nIdx]
    const node = new THREE.IcosahedronGeometry(nodeR, 0)
    node.translate(pt.x, Math.max(nodeR * 0.5, pt.y), pt.z)
    parts.push(node)
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 11. ESPACIAL / MALLA ESPACIAL (Tridilosa 3D de barras y nodos esféricos)   */
/* ========================================================================== */
function buildEspacial(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(2, size.x)
  const H = Math.max(1.2, size.y)
  const D = Math.max(2, size.z)
  const nx = Math.max(2, Math.min(12, Math.round(p.bays || 5)))
  const nz = Math.max(2, Math.min(12, Math.round(p.divisions || 5)))
  const trussDepth = Math.max(0.45, Math.min(H * 0.45, p.archRise > 0 ? p.archRise : 0.9))
  const barR = Math.max(0.025, Math.min(0.14, (p.thickness || 0.09) * 0.5))
  const nodeR = barR * 1.75
  const colR = barR * 2.4

  const yTop = H - nodeR
  const yBot = Math.max(nodeR, yTop - trussDepth)

  const parts: THREE.BufferGeometry[] = []

  const topNodes: THREE.Vector3[][] = []
  for (let ix = 0; ix <= nx; ix++) {
    const row: THREE.Vector3[] = []
    const x = -W / 2 + nodeR + (ix / nx) * (W - nodeR * 2)
    for (let iz = 0; iz <= nz; iz++) {
      const z = -D / 2 + nodeR + (iz / nz) * (D - nodeR * 2)
      const pt = new THREE.Vector3(x, yTop, z)
      row.push(pt)
      const sphere = new THREE.IcosahedronGeometry(nodeR, 0)
      sphere.translate(pt.x, pt.y, pt.z)
      parts.push(sphere)
    }
    topNodes.push(row)
  }

  // Barras de capa superior
  for (let ix = 0; ix <= nx; ix++) {
    for (let iz = 0; iz <= nz; iz++) {
      if (ix < nx) {
        const s = makeStrut(topNodes[ix][iz], topNodes[ix + 1][iz], barR, 5)
        if (s) parts.push(s)
      }
      if (iz < nz) {
        const s = makeStrut(topNodes[ix][iz], topNodes[ix][iz + 1], barR, 5)
        if (s) parts.push(s)
      }
    }
  }

  // Nodos de capa inferior desplazados media celda + pirámides diagonales
  const botNodes: THREE.Vector3[][] = []
  for (let ix = 0; ix < nx; ix++) {
    const row: THREE.Vector3[] = []
    for (let iz = 0; iz < nz; iz++) {
      const cx = (topNodes[ix][iz].x + topNodes[ix + 1][iz].x) * 0.5
      const cz = (topNodes[ix][iz].z + topNodes[ix][iz + 1].z) * 0.5
      const pt = new THREE.Vector3(cx, yBot, cz)
      row.push(pt)

      const sphere = new THREE.IcosahedronGeometry(nodeR, 0)
      sphere.translate(pt.x, pt.y, pt.z)
      parts.push(sphere)

      // 4 diagonales espaciales hacia los nodos superiores circundantes
      for (const topNeighbor of [
        topNodes[ix][iz],
        topNodes[ix + 1][iz],
        topNodes[ix][iz + 1],
        topNodes[ix + 1][iz + 1]
      ]) {
        const diag = makeStrut(pt, topNeighbor, barR * 0.85, 5)
        if (diag) parts.push(diag)
      }
    }
    botNodes.push(row)
  }

  // Barras de capa inferior
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      if (ix + 1 < nx) {
        const s = makeStrut(botNodes[ix][iz], botNodes[ix + 1][iz], barR, 5)
        if (s) parts.push(s)
      }
      if (iz + 1 < nz) {
        const s = makeStrut(botNodes[ix][iz], botNodes[ix][iz + 1], barR, 5)
        if (s) parts.push(s)
      }
    }
  }

  // Columnas tubulares de gran luz en las 4 esquinas si la malla está elevada
  if (yBot > 0.35) {
    const corners = [
      botNodes[0][0],
      botNodes[nx - 1][0],
      botNodes[0][nz - 1],
      botNodes[nx - 1][nz - 1]
    ]
    for (const cNode of corners) {
      const col = makeStrut(new THREE.Vector3(cNode.x, 0, cNode.z), cNode, colR, 8)
      if (col) parts.push(col)
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 12. PLEGADA (Láminas planas en zigzag / origami estructural)               */
/* ========================================================================== */
function buildPlegada(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(1.5, size.x)
  const H = Math.max(1.2, size.y)
  const D = Math.max(1.2, size.z)
  const folds = Math.max(2, Math.min(14, Math.round(p.divisions || 5)))
  const T = Math.max(0.08, Math.min(0.4, p.thickness || 0.16))
  const amp = Math.max(0.35, Math.min(H * 0.48, p.archRise > 0 ? p.archRise : 1.1))
  const wallH = Math.max(0.2, H - amp - T)

  const parts: THREE.BufferGeometry[] = []

  // Perfil en zigzag extruido a lo largo de la profundidad Z
  const numVerts = folds * 2 + 1
  const shape = new THREE.Shape()
  const halfW = W / 2

  for (let i = 0; i < numVerts; i++) {
    const x = -halfW + (i / (numVerts - 1)) * W
    const y = wallH + (i % 2 === 1 ? amp : 0) + T
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  for (let i = numVerts - 1; i >= 0; i--) {
    const x = -halfW + (i / (numVerts - 1)) * W
    const y = wallH + (i % 2 === 1 ? amp : 0)
    shape.lineTo(x, y)
  }
  shape.closePath()

  const roofFold = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false })
  roofFold.translate(0, 0, -D / 2)
  parts.push(roofFold)

  // Muros plegados portantes laterales (origami vertical en los valles de borde)
  if (wallH > 0.25) {
    const pleatZ = Math.max(3, folds + 1)
    for (const side of [-1, 1]) {
      const baseX = side * (halfW - T * 0.8)
      const wallShape = new THREE.Shape()
      const offsetAmp = Math.min(0.35, W * 0.05)
      for (let k = 0; k <= pleatZ * 2; k++) {
        const z = -D / 2 + (k / (pleatZ * 2)) * D
        const x = baseX + (k % 2 === 1 ? -side * offsetAmp : 0)
        if (k === 0) wallShape.moveTo(x, z)
        else wallShape.lineTo(x, z)
      }
      for (let k = pleatZ * 2; k >= 0; k--) {
        const z = -D / 2 + (k / (pleatZ * 2)) * D
        const x = baseX + (k % 2 === 1 ? -side * offsetAmp : 0) - side * T
        wallShape.lineTo(x, z)
      }
      wallShape.closePath()
      const wGeo = new THREE.ExtrudeGeometry(wallShape, { depth: wallH + T * 0.5, bevelEnabled: false })
      wGeo.rotateX(Math.PI / 2)
      wGeo.translate(0, wallH + T * 0.5, 0)
      parts.push(wGeo)
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 13. EN VOLADIZO / CANTILEVER (Empotrada en un extremo sin apoyo frontal)   */
/* ========================================================================== */
function buildVoladizo(size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const W = Math.max(2, size.x)
  const H = Math.max(1.5, size.y)
  const D = Math.max(1.2, size.z)
  const T = Math.max(0.18, Math.min(0.75, p.thickness || 0.35))
  const panels = Math.max(2, Math.min(10, Math.round(p.divisions || 5)))

  const coreW = W * 0.26
  const coreX = -W / 2 + coreW / 2
  const cantStart = -W / 2 + coreW * 0.75
  const cantEnd = W / 2
  const cantLen = cantEnd - cantStart

  const cantBottomRoot = H * 0.46
  const cantBottomTip = Math.min(H * 0.66, cantBottomRoot + Math.max(0.15, p.archRise || H * 0.16))
  const cantTop = H * 0.94

  const parts: THREE.BufferGeometry[] = []

  // Zapata de contrapeso y núcleo estructural empotrado a la izquierda (-X)
  parts.push(makeBoxAt(coreW * 1.45, T * 0.9, D * 0.96, coreX + coreW * 0.12, (T * 0.9) / 2, 0))
  parts.push(makeBoxAt(coreW, H, D * 0.76, coreX, H / 2, 0))

  // Losa superior e inferior acartelada del volumen en voladizo
  const slabShape = new THREE.Shape()
  slabShape.moveTo(cantStart, cantBottomRoot)
  slabShape.lineTo(cantEnd, cantBottomTip)
  slabShape.lineTo(cantEnd, cantBottomTip + T * 0.75)
  slabShape.lineTo(cantStart, cantBottomRoot + T)
  slabShape.closePath()
  const bottomCantSlab = new THREE.ExtrudeGeometry(slabShape, { depth: D, bevelEnabled: false })
  bottomCantSlab.translate(0, 0, -D / 2)
  parts.push(bottomCantSlab)

  // Losa de cubierta superior en voladizo
  parts.push(makeBoxAt(cantLen + coreW * 0.5, T * 0.75, D, (cantStart - coreW * 0.5 + cantEnd) / 2, cantTop, 0))

  // Celosías laterales acarteladas en voladizo (sin ningún apoyo frontal)
  const rDiag = Math.max(0.05, T * 0.24)
  for (const zSide of [-D / 2 + T * 0.35, D / 2 - T * 0.35]) {
    for (let i = 0; i < panels; i++) {
      const u0 = i / panels
      const u1 = (i + 1) / panels
      const x0 = cantStart + u0 * cantLen
      const x1 = cantStart + u1 * cantLen
      const yBot0 = cantBottomRoot + u0 * (cantBottomTip - cantBottomRoot) + T * 0.5
      const yBot1 = cantBottomRoot + u1 * (cantBottomTip - cantBottomRoot) + T * 0.5

      const post = makeStrut(new THREE.Vector3(x1, yBot1, zSide), new THREE.Vector3(x1, cantTop, zSide), rDiag, 6)
      const diag = makeStrut(new THREE.Vector3(x0, cantTop, zSide), new THREE.Vector3(x1, yBot1, zSide), rDiag, 6)
      if (post) parts.push(post)
      if (diag) parts.push(diag)
    }
  }

  return finalizeParts(parts)
}

/* ========================================================================== */
/* 14. FIGURAS GEOMÉTRICAS Y REDONDAS BASE (`geo.*`)                          */
/* ========================================================================== */
function buildBaseGeometric(shapeId: string, size: THREE.Vector3, p: StructuralParams): THREE.BufferGeometry {
  const rx = Math.max(0.15, size.x / 2)
  const rz = Math.max(0.15, size.z / 2)
  const H = Math.max(0.15, size.y)
  const segs = Math.max(3, Math.min(72, Math.round(p.divisions || 28)))
  const T = Math.max(0.08, Math.min(Math.min(rx, rz) * 0.85, p.thickness || 0.28))

  switch (shapeId) {
    case 'geo.cilindro': {
      const cylSegs = Math.max(12, segs)
      if (p.subType === 'hueco') {
        const shape = new THREE.Shape()
        shape.absarc(0, 0, 1, 0, Math.PI * 2, false)
        const innerRatio = Math.max(0.15, 1 - T / Math.max(0.2, Math.min(rx, rz)))
        const hole = new THREE.Path()
        hole.absarc(0, 0, innerRatio, 0, Math.PI * 2, true)
        shape.holes.push(hole)
        const g = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: cylSegs })
        g.rotateX(-Math.PI / 2)
        g.scale(rx, 1, rz)
        return finalizeParts([g])
      }
      const g = new THREE.CylinderGeometry(1, 1, H, cylSegs)
      g.scale(rx, 1, rz)
      g.translate(0, H / 2, 0)
      return finalizeParts([g])
    }

    case 'geo.anillo': {
      const ringSegs = Math.max(16, segs)
      const shape = new THREE.Shape()
      shape.absarc(0, 0, 1, 0, Math.PI * 2, false)
      const innerRatio = Math.max(0.18, Math.min(0.92, 1 - T / Math.max(0.25, Math.min(rx, rz))))
      const hole = new THREE.Path()
      hole.absarc(0, 0, innerRatio, 0, Math.PI * 2, true)
      shape.holes.push(hole)
      const g = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: ringSegs })
      g.rotateX(-Math.PI / 2)
      g.scale(rx, 1, rz)
      return finalizeParts([g])
    }

    case 'geo.muro_curvo': {
      const arcSegs = Math.max(12, segs)
      const sweepDeg = Math.max(25, Math.min(355, p.sweepAngle ?? 180))
      const sweepRad = (sweepDeg * Math.PI) / 180
      const startA = -sweepRad / 2
      const innerRatio = Math.max(0.15, Math.min(0.94, 1 - T / Math.max(0.25, Math.min(rx, rz))))

      const shape = new THREE.Shape()
      for (let i = 0; i <= arcSegs; i++) {
        const a = startA + (i / arcSegs) * sweepRad
        const x = Math.cos(a)
        const y = Math.sin(a)
        if (i === 0) shape.moveTo(x, y)
        else shape.lineTo(x, y)
      }
      for (let i = arcSegs; i >= 0; i--) {
        const a = startA + (i / arcSegs) * sweepRad
        shape.lineTo(Math.cos(a) * innerRatio, Math.sin(a) * innerRatio)
      }
      shape.closePath()
      const g = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      g.scale(rx, 1, rz)
      return finalizeParts([g])
    }

    case 'geo.cono': {
      const coneSegs = Math.max(12, segs)
      const topRatio = p.subType === 'truncado' ? 0.35 : 0
      const g = new THREE.CylinderGeometry(topRatio, 1, H, coneSegs)
      g.scale(rx, 1, rz)
      g.translate(0, H / 2, 0)
      return finalizeParts([g])
    }

    case 'geo.esfera': {
      const sphSegs = Math.max(14, segs)
      const g = new THREE.SphereGeometry(1, sphSegs, Math.max(10, Math.round(sphSegs * 0.7)))
      g.scale(rx, H / 2, rz)
      g.translate(0, H / 2, 0)
      return finalizeParts([g])
    }

    case 'geo.prisma': {
      const sides = Math.max(3, Math.min(24, Math.round(p.divisions || 6)))
      const g = new THREE.CylinderGeometry(1, 1, H, sides)
      g.scale(rx, 1, rz)
      g.translate(0, H / 2, 0)
      return finalizeParts([g])
    }

    case 'geo.extrusion':
    default: {
      // Extrusión libre curvilínea orgánica (planta lobulada / sinuosa paramétrica)
      const extSegs = Math.max(18, segs * 2)
      const lobes = Math.max(2, Math.min(8, Math.round(p.bays || 3)))
      const waveAmp = Math.max(0.05, Math.min(0.32, (p.archRise || 0.8) * 0.18))
      const shape = new THREE.Shape()
      for (let i = 0; i <= extSegs; i++) {
        const a = (i / extSegs) * Math.PI * 2
        const rMod = (1 - waveAmp) + waveAmp * Math.cos(lobes * a)
        const x = Math.cos(a) * rx * rMod
        const y = Math.sin(a) * rz * rMod
        if (i === 0) shape.moveTo(x, y)
        else shape.lineTo(x, y)
      }
      shape.closePath()
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: H,
        bevelEnabled: true,
        bevelThickness: Math.min(0.08, H * 0.04),
        bevelSize: Math.min(0.08, Math.min(rx, rz) * 0.05),
        bevelSegments: 2
      })
      g.rotateX(-Math.PI / 2)
      g.computeBoundingBox()
      const bb = g.boundingBox
      if (bb) {
        const rawH = Math.max(1e-4, bb.max.y - bb.min.y)
        g.scale(1, H / rawH, 1)
        g.computeBoundingBox()
        g.translate(0, -g.boundingBox!.min.y, 0)
      }
      return finalizeParts([g])
    }
  }
}

/**
 * Construye la geometría 3D procedural de cualquiera de los 13 sistemas
 * estructurales arquitectónicos (`struct.*`) o las figuras geométricas y
 * redondas base (`geo.*`). Devuelve `null` si `shapeId` no pertenece a este módulo.
 */
export function buildStructuralOrGeometricGeometry(
  shapeId: string,
  size: THREE.Vector3,
  customParams?: StructuralParams | null
): THREE.BufferGeometry | null {
  if (!shapeId.startsWith('struct.') && !shapeId.startsWith('geo.')) {
    return null
  }
  const defaults = defaultStructuralParamsFor(shapeId).params
  const params: StructuralParams = customParams ? { ...defaults, ...customParams } : defaults

  switch (shapeId) {
    case 'struct.adintelada':
      return buildAdintelada(size, params)
    case 'struct.abovedada':
      return buildAbovedada(size, params)
    case 'struct.entramada':
      return buildEntramada(size, params)
    case 'struct.triangulada':
      return buildTriangulada(size, params)
    case 'struct.colgante':
      return buildColgante(size, params)
    case 'struct.tensada':
      return buildTensada(size, params)
    case 'struct.neumatica':
      return buildNeumatica(size, params)
    case 'struct.muros_carga':
      return buildMurosCarga(size, params)
    case 'struct.laminar':
      return buildLaminar(size, params)
    case 'struct.geodesica':
      return buildGeodesica(size, params)
    case 'struct.espacial':
      return buildEspacial(size, params)
    case 'struct.plegada':
      return buildPlegada(size, params)
    case 'struct.voladizo':
      return buildVoladizo(size, params)
    default:
      if (shapeId.startsWith('geo.')) {
        return buildBaseGeometric(shapeId, size, params)
      }
      return null
  }
}

