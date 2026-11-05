import * as THREE from 'three'
import type { SceneObject } from '../models/SceneObject'
import type { TerrainData } from '../models/TerrainTypes'
import type { TopographyPoint3D } from '../import/topographyImport'

/**
 * Constructor y motor geométrico de terrenos topográficos 3D (`TerrainMesh`),
 * curvas de nivel por marching-squares, muestreo bilineal de cotas y
 * explanación / plataformas con cálculo volumétrico de corte y relleno (m³).
 */

function chooseContourInterval(relief: number): number {
  if (relief <= 1.5) return 0.25
  if (relief <= 5) return 0.5
  if (relief <= 15) return 1.0
  if (relief <= 40) return 2.0
  if (relief <= 100) return 5.0
  return 10.0
}

/**
 * Interpola una nube de puntos 3D `(x, y, z)` sobre una malla regular `cols × rows`
 * mediante ponderación por inverso de la distancia (IDW acelerado espacialmente).
 */
export function createTerrainDataFromPoints(
  points: ReadonlyArray<TopographyPoint3D>,
  options: {
    scale?: number
    gridResolution?: number
    contourInterval?: number
    sourceFormat?: string
  } = {}
): TerrainData {
  const scale = Number.isFinite(options.scale) && (options.scale as number) > 0 ? (options.scale as number) : 1
  const maxRes = Math.max(12, Math.min(80, Math.round(options.gridResolution ?? 56)))

  if (points.length === 0) {
    return createDemoTerrainData()
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  // Mapeo CAD (X Este, Y Norte, Z Cota) -> Espacio local Three.js (X, Z = -Y, altura = Z)
  const localPts = points.map((p) => {
    const lx = p.x * scale
    const lz = -p.y * scale
    const elev = p.z * scale
    if (lx < minX) minX = lx
    if (lx > maxX) maxX = lx
    if (lz < minY) minY = lz
    if (lz > maxY) maxY = lz
    return { x: lx, z: lz, elev }
  })

  const cx = (minX + maxX) / 2
  const cz = (minY + maxY) / 2
  const width = Math.max(8, maxX - minX)
  const depth = Math.max(8, maxY - minY)

  for (const pt of localPts) {
    pt.x -= cx
    pt.z -= cz
  }

  const aspect = width / depth
  const cols = aspect >= 1 ? maxRes : Math.max(12, Math.round(maxRes * aspect))
  const rows = aspect <= 1 ? maxRes : Math.max(12, Math.round(maxRes / aspect))

  // Si hay muchos puntos, submuestrear de forma determinista hasta 2500 muestras representativas para velocidad interactiva
  const maxSamples = 2500
  const stride = Math.max(1, Math.floor(localPts.length / maxSamples))
  const samples = stride > 1 ? localPts.filter((_, idx) => idx % stride === 0) : localPts

  const heights = new Array<number>(cols * rows)
  let minElev = Infinity
  let maxElev = -Infinity

  const halfW = width / 2
  const halfD = depth / 2

  for (let r = 0; r < rows; r++) {
    const gz = -halfD + (r / (rows - 1)) * depth
    for (let c = 0; c < cols; c++) {
      const gx = -halfW + (c / (cols - 1)) * width

      let weightSum = 0
      let weightedElev = 0
      let exactElev: number | null = null

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        const dx = gx - s.x
        const dz = gz - s.z
        const d2 = dx * dx + dz * dz
        if (d2 < 1e-6) {
          exactElev = s.elev
          break
        }
        // IDW potencia p = 2.2 con suavizado pequeño para evitar picos artificiales
        const w = 1 / Math.pow(d2 + 0.15, 1.15)
        weightSum += w
        weightedElev += w * s.elev
      }

      const h = exactElev !== null ? exactElev : weightSum > 0 ? weightedElev / weightSum : 0
      const roundedH = Math.round(h * 1000) / 1000
      heights[r * cols + c] = roundedH
      if (roundedH < minElev) minElev = roundedH
      if (roundedH > maxElev) maxElev = roundedH
    }
  }

  const relief = Math.max(0, maxElev - minElev)
  const contourInterval =
    options.contourInterval && options.contourInterval > 0
      ? options.contourInterval
      : chooseContourInterval(relief)

  return {
    cols,
    rows,
    width: Math.round(width * 100) / 100,
    depth: Math.round(depth * 100) / 100,
    heights,
    originalHeights: [...heights],
    minElev,
    maxElev,
    contourInterval,
    sourceFormat: options.sourceFormat ?? 'CAD',
    pointCount: points.length,
    gradingPads: [],
    cutVolumeM3: 0,
    fillVolumeM3: 0,
    spotElevations: []
  }
}

/**
 * Genera una parcela topográfica de demostración realista con colina suave,
 * vaguada natural y curvas de nivel claras lista para proyectar encima.
 */
export function createDemoTerrainData(width = 36, depth = 36): TerrainData {
  const cols = 56
  const rows = 56
  const heights = new Array<number>(cols * rows)
  let minElev = Infinity
  let maxElev = -Infinity

  for (let r = 0; r < rows; r++) {
    const nz = (r / (rows - 1)) * 2 - 1 // [-1, 1]
    for (let c = 0; c < cols; c++) {
      const nx = (c / (cols - 1)) * 2 - 1 // [-1, 1]
      const hill1 = 3.6 * Math.exp(-((nx + 0.35) ** 2 + (nz + 0.3) ** 2) / 0.55)
      const hill2 = 2.4 * Math.exp(-((nx - 0.45) ** 2 + (nz - 0.25) ** 2) / 0.45)
      const valley = -1.1 * Math.exp(-((nx - 0.1) ** 2 + (nz + 0.4) ** 2) / 0.4)
      const slope = -0.85 * nz + 0.45 * nx
      const h = Math.round((hill1 + hill2 + valley + slope) * 1000) / 1000
      heights[r * cols + c] = h
      if (h < minElev) minElev = h
      if (h > maxElev) maxElev = h
    }
  }

  return {
    cols,
    rows,
    width,
    depth,
    heights,
    originalHeights: [...heights],
    minElev,
    maxElev,
    contourInterval: 0.5,
    sourceFormat: 'Demo Topográfico',
    pointCount: cols * rows,
    gradingPads: [],
    cutVolumeM3: 0,
    fillVolumeM3: 0,
    spotElevations: []
  }
}

function hypsometricColor(t: number, out: THREE.Color): void {
  // Gradiente hipsométrico arquitectónico legible tanto en tema claro como oscuro
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped < 0.35) {
    const k = clamped / 0.35
    out.setRGB(0.28 + 0.16 * k, 0.49 + 0.12 * k, 0.34 - 0.02 * k)
  } else if (clamped < 0.72) {
    const k = (clamped - 0.35) / 0.37
    out.setRGB(0.44 + 0.22 * k, 0.61 - 0.05 * k, 0.32 + 0.06 * k)
  } else {
    const k = (clamped - 0.72) / 0.28
    out.setRGB(0.66 + 0.16 * k, 0.56 + 0.2 * k, 0.38 + 0.3 * k)
  }
}

function computeScaledElevation(data: TerrainData, rawH: number, targetRelief: number): number {
  const naturalRelief = data.maxElev - data.minElev
  if (naturalRelief < 1e-4 || Math.abs(targetRelief - naturalRelief) < 1e-2) {
    return rawH
  }
  const factor = targetRelief / naturalRelief
  return data.minElev + (rawH - data.minElev) * factor
}

/**
 * Construye la geometría 3D (`THREE.BufferGeometry`) de la superficie del terreno
 * con normales suaves, coordenadas UV métricas y colores hipsométricos por vértice.
 */
export function buildTerrainGeometry(data: TerrainData, size: THREE.Vector3): THREE.BufferGeometry {
  const cols = Math.max(2, data.cols)
  const rows = Math.max(2, data.rows)
  const w = Math.max(0.5, size.x)
  const d = Math.max(0.5, size.z)
  const targetRelief = Math.max(0.05, size.y)

  const vertexCount = cols * rows
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)

  const halfW = w / 2
  const halfD = d / 2
  const relief = Math.max(0.01, data.maxElev - data.minElev)
  const tmpColor = new THREE.Color()

  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1)
    const z = -halfD + v * d
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1)
      const x = -halfW + u * w
      const idx = r * cols + c
      const rawH = data.heights[idx] ?? 0
      const y = computeScaledElevation(data, rawH, targetRelief)

      positions[idx * 3] = x
      positions[idx * 3 + 1] = y
      positions[idx * 3 + 2] = z

      uvs[idx * 2] = (x + halfW) * 0.25
      uvs[idx * 2 + 1] = (z + halfD) * 0.25

      hypsometricColor((rawH - data.minElev) / relief, tmpColor)
      colors[idx * 3] = tmpColor.r
      colors[idx * 3 + 1] = tmpColor.g
      colors[idx * 3 + 2] = tmpColor.b
    }
  }

  const indices: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c
      const i10 = i00 + 1
      const i01 = (r + 1) * cols + c
      const i11 = i01 + 1
      indices.push(i00, i01, i10)
      indices.push(i10, i01, i11)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Genera las curvas de nivel 3D visibles (`THREE.Group` con curvas secundarias y
 * curvas maestras cada 5 intervalos) mediante interpolación marching-triangles.
 */
export function buildTerrainContourLines(data: TerrainData, size: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.name = 'TerrainContours'

  const cols = Math.max(2, data.cols)
  const rows = Math.max(2, data.rows)
  const w = Math.max(0.5, size.x)
  const d = Math.max(0.5, size.z)
  const targetRelief = Math.max(0.05, size.y)
  const halfW = w / 2
  const halfD = d / 2

  const interval = Math.max(0.1, data.contourInterval || chooseContourInterval(data.maxElev - data.minElev))
  const startLevel = Math.ceil(data.minElev / interval) * interval
  const endLevel = Math.floor(data.maxElev / interval) * interval

  if (endLevel < startLevel || (endLevel - startLevel) / interval > 160) {
    return group
  }

  const minorPts: number[] = []
  const majorPts: number[] = []

  const getVertex = (r: number, c: number): { x: number; y: number; z: number; rawH: number } => {
    const x = -halfW + (c / (cols - 1)) * w
    const z = -halfD + (r / (rows - 1)) * d
    const rawH = data.heights[r * cols + c] ?? 0
    const y = computeScaledElevation(data, rawH, targetRelief)
    return { x, y, z, rawH }
  }

  const intersectTriangleIso = (
    p0: { x: number; y: number; z: number; rawH: number },
    p1: { x: number; y: number; z: number; rawH: number },
    p2: { x: number; y: number; z: number; rawH: number },
    isoRaw: number,
    out: number[]
  ): void => {
    const minH = Math.min(p0.rawH, p1.rawH, p2.rawH)
    const maxH = Math.max(p0.rawH, p1.rawH, p2.rawH)
    if (isoRaw <= minH || isoRaw >= maxH) return

    const hits: Array<{ x: number; y: number; z: number }> = []
    const checkEdge = (
      a: { x: number; y: number; z: number; rawH: number },
      b: { x: number; y: number; z: number; rawH: number }
    ): void => {
      if ((a.rawH < isoRaw && b.rawH >= isoRaw) || (b.rawH < isoRaw && a.rawH >= isoRaw)) {
        const denom = b.rawH - a.rawH
        if (Math.abs(denom) < 1e-6) return
        const t = (isoRaw - a.rawH) / denom
        hits.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t + 0.018, // ligero offset sobre la malla para evitar z-fighting
          z: a.z + (b.z - a.z) * t
        })
      }
    }

    checkEdge(p0, p1)
    checkEdge(p1, p2)
    checkEdge(p2, p0)

    if (hits.length >= 2) {
      out.push(hits[0].x, hits[0].y, hits[0].z, hits[1].x, hits[1].y, hits[1].z)
    }
  }

  const levels: Array<{ iso: number; isMajor: boolean }> = []
  let idxLevel = Math.round(startLevel / interval)
  for (let iso = startLevel; iso <= endLevel + 1e-6; iso += interval, idxLevel++) {
    levels.push({ iso, isMajor: idxLevel % 5 === 0 })
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v00 = getVertex(r, c)
      const v10 = getVertex(r, c + 1)
      const v01 = getVertex(r + 1, c)
      const v11 = getVertex(r + 1, c + 1)

      const cellMin = Math.min(v00.rawH, v10.rawH, v01.rawH, v11.rawH)
      const cellMax = Math.max(v00.rawH, v10.rawH, v01.rawH, v11.rawH)

      for (const lv of levels) {
        if (lv.iso <= cellMin || lv.iso >= cellMax) continue
        const bucket = lv.isMajor ? majorPts : minorPts
        intersectTriangleIso(v00, v01, v10, lv.iso, bucket)
        intersectTriangleIso(v10, v01, v11, lv.iso, bucket)
      }
    }
  }

  if (minorPts.length >= 6) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(minorPts, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.42
    })
    const lines = new THREE.LineSegments(geo, mat)
    lines.raycast = () => {} // No interceptar el raycast de superficie del terreno
    group.add(lines)
  }

  if (majorPts.length >= 6) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(majorPts, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.82
    })
    const lines = new THREE.LineSegments(geo, mat)
    lines.raycast = () => {}
    group.add(lines)
  }

  return group
}

/**
 * Transforma un punto del mundo `(worldX, worldZ)` al espacio local XZ de un objeto terreno.
 */
export function worldToTerrainLocalXZ(
  terrainObj: SceneObject,
  worldX: number,
  worldZ: number
): { localX: number; localZ: number } {
  const dx = worldX - terrainObj.position.x
  const dz = worldZ - terrainObj.position.z
  const cos = Math.cos(-terrainObj.rotationY)
  const sin = Math.sin(-terrainObj.rotationY)
  return {
    localX: dx * cos - dz * sin,
    localZ: dx * sin + dz * cos
  }
}

/**
 * Evalúa por interpolación bilineal la cota exacta `Z` (altura `Y` en Three.js)
 * sobre un objeto terreno en las coordenadas de mundo `(worldX, worldZ)`.
 * Devuelve `null` si `(worldX, worldZ)` cae fuera de los límites del terreno.
 */
export function sampleTerrainElevation(
  terrainObj: SceneObject,
  worldX: number,
  worldZ: number
): number | null {
  const data = terrainObj.terrainData
  if (!data || data.cols < 2 || data.rows < 2) return null

  const { localX, localZ } = worldToTerrainLocalXZ(terrainObj, worldX, worldZ)
  const w = Math.max(0.5, terrainObj.size.x)
  const d = Math.max(0.5, terrainObj.size.z)
  const halfW = w / 2
  const halfD = d / 2

  if (localX < -halfW || localX > halfW || localZ < -halfD || localZ > halfD) {
    return null
  }

  const u = (localX + halfW) / w
  const v = (localZ + halfD) / d

  const fc = u * (data.cols - 1)
  const fr = v * (data.rows - 1)
  const c0 = Math.max(0, Math.min(data.cols - 2, Math.floor(fc)))
  const r0 = Math.max(0, Math.min(data.rows - 2, Math.floor(fr)))
  const tx = fc - c0
  const tz = fr - r0

  const h00 = data.heights[r0 * data.cols + c0] ?? 0
  const h10 = data.heights[r0 * data.cols + (c0 + 1)] ?? 0
  const h01 = data.heights[(r0 + 1) * data.cols + c0] ?? 0
  const h11 = data.heights[(r0 + 1) * data.cols + (c0 + 1)] ?? 0

  const h0 = h00 * (1 - tx) + h10 * tx
  const h1 = h01 * (1 - tx) + h11 * tx
  const rawH = h0 * (1 - tz) + h1 * tz

  const scaledLocalY = computeScaledElevation(data, rawH, Math.max(0.05, terrainObj.size.y))
  return terrainObj.position.y + scaledLocalY
}

/**
 * Busca la cota del terreno más alto/cercano bajo `(worldX, worldZ)` entre todos los terrenos de la escena.
 */
export function sampleAnyTerrainAt(
  terrains: ReadonlyArray<SceneObject>,
  worldX: number,
  worldZ: number
): { terrain: SceneObject; elevation: number } | null {
  for (let i = terrains.length - 1; i >= 0; i--) {
    const t = terrains[i]
    if (!t.visible) continue
    const elev = sampleTerrainElevation(t, worldX, worldZ)
    if (elev !== null) return { terrain: t, elevation: elev }
  }
  return null
}

function pointInPolygon2D(px: number, pz: number, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const zi = poly[i].z
    const xj = poly[j].x
    const zj = poly[j].z
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function distanceToPolygonBoundary2D(px: number, pz: number, poly: ReadonlyArray<{ x: number; z: number }>): number {
  let minDistSq = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const lenSq = abx * abx + abz * abz
    let t = 0
    if (lenSq > 1e-9) {
      t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / lenSq))
    }
    const cx = a.x + t * abx
    const cz = a.z + t * abz
    const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz)
    if (dSq < minDistSq) minDistSq = dSq
  }
  return Math.sqrt(minDistSq)
}

/**
 * Aplica una explanación / plataforma plana (`Grading Pad`) sobre un `SceneObject` terreno
 * a partir de un polígono en coordenadas de mundo XZ y una cota objetivo en metros (`targetWorldElevation`).
 * Modifica los vértices de la malla dejándola completamente plana dentro del polígono (con un talud suave perimetral)
 * y calcula el volumen aproximado de **Corte (desmonte)** y **Relleno (terraplén)** en m³.
 */
export function applyGradingPadToTerrain(
  terrainObj: SceneObject,
  worldPolygonXZ: ReadonlyArray<{ x: number; z: number }>,
  targetWorldElevation: number,
  transitionMargin = 1.2
): {
  updatedData: TerrainData
  newHeightSize: number
  cutVolumeM3: number
  fillVolumeM3: number
  modifiedVertices: number
} | null {
  const src = terrainObj.terrainData
  if (!src || worldPolygonXZ.length < 3) return null

  const localPoly = worldPolygonXZ.map((pt) => {
    const loc = worldToTerrainLocalXZ(terrainObj, pt.x, pt.z)
    return { x: loc.localX, z: loc.localZ }
  })

  const w = Math.max(0.5, terrainObj.size.x)
  const d = Math.max(0.5, terrainObj.size.z)
  const halfW = w / 2
  const halfD = d / 2
  const cols = src.cols
  const rows = src.rows

  // Cota objetivo expresada en el sistema local del terreno
  const targetLocalH = targetWorldElevation - terrainObj.position.y
  const nextHeights = [...src.heights]
  const origHeights = src.originalHeights?.length === src.heights.length ? [...src.originalHeights] : [...src.heights]
  const margin = Math.max(0, transitionMargin)

  let modifiedVertices = 0
  for (let r = 0; r < rows; r++) {
    const vz = -halfD + (r / (rows - 1)) * d
    for (let c = 0; c < cols; c++) {
      const vx = -halfW + (c / (cols - 1)) * w
      const idx = r * cols + c

      if (pointInPolygon2D(vx, vz, localPoly)) {
        nextHeights[idx] = Math.round(targetLocalH * 1000) / 1000
        modifiedVertices++
      } else if (margin > 0.01) {
        const dist = distanceToPolygonBoundary2D(vx, vz, localPoly)
        if (dist < margin) {
          // Interpolación suave cosinusoidal en el talud perimetral
          const t = dist / margin
          const blend = 0.5 - 0.5 * Math.cos(Math.PI * t) // 0 en el borde -> 1 afuera
          const cur = nextHeights[idx]
          nextHeights[idx] = Math.round((targetLocalH * (1 - blend) + cur * blend) * 1000) / 1000
          modifiedVertices++
        }
      }
    }
  }

  // Si el polígono era más pequeño que una celda de la malla, ajustar al menos el vértice más cercano al centroide
  if (modifiedVertices === 0) {
    const cx = localPoly.reduce((acc, p) => acc + p.x, 0) / localPoly.length
    const cz = localPoly.reduce((acc, p) => acc + p.z, 0) / localPoly.length
    const cIdx = Math.max(0, Math.min(cols - 1, Math.round(((cx + halfW) / w) * (cols - 1))))
    const rIdx = Math.max(0, Math.min(rows - 1, Math.round(((cz + halfD) / d) * (rows - 1))))
    nextHeights[rIdx * cols + cIdx] = Math.round(targetLocalH * 1000) / 1000
    modifiedVertices = 1
  }

  let minElev = Infinity
  let maxElev = -Infinity
  for (const h of nextHeights) {
    if (h < minElev) minElev = h
    if (h > maxElev) maxElev = h
  }

  // Integración volumétrica celda a celda respecto al terreno natural original (m³)
  const cellArea = (w / Math.max(1, cols - 1)) * (d / Math.max(1, rows - 1))
  let cutVolumeM3 = 0
  let fillVolumeM3 = 0

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c
      const i10 = i00 + 1
      const i01 = (r + 1) * cols + c
      const i11 = i01 + 1

      const origAvg = (origHeights[i00] + origHeights[i10] + origHeights[i01] + origHeights[i11]) * 0.25
      const curAvg = (nextHeights[i00] + nextHeights[i10] + nextHeights[i01] + nextHeights[i11]) * 0.25
      const diff = curAvg - origAvg // < 0 excavación (corte), > 0 relleno (terraplén)
      if (diff < -1e-4) {
        cutVolumeM3 += -diff * cellArea
      } else if (diff > 1e-4) {
        fillVolumeM3 += diff * cellArea
      }
    }
  }

  cutVolumeM3 = Math.round(cutVolumeM3 * 100) / 100
  fillVolumeM3 = Math.round(fillVolumeM3 * 100) / 100

  const padId = `pad-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const updatedData: TerrainData = {
    ...src,
    heights: nextHeights,
    originalHeights: origHeights,
    minElev,
    maxElev,
    gradingPads: [
      ...(src.gradingPads ?? []),
      {
        id: padId,
        points: localPoly,
        targetElevation: targetWorldElevation,
        transitionMargin: margin
      }
    ],
    cutVolumeM3,
    fillVolumeM3,
    spotElevations: src.spotElevations ? src.spotElevations.map((s) => ({ ...s })) : []
  }

  const newHeightSize = Math.max(0.2, maxElev - minElev)
  return {
    updatedData,
    newHeightSize,
    cutVolumeM3,
    fillVolumeM3,
    modifiedVertices
  }
}

