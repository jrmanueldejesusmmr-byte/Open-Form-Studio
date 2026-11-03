import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyMeterUVs, createMeshMaterial, materialTint } from './MaterialSystem'
import { wallOpeningMeasures, type OpeningMeasures } from './OpeningMeasures'
import type { Opening, OpeningPartRole } from '../models/Opening'

export { wallOpeningMeasures }
export type { OpeningMeasures }

export type WindowVariant = 'fija' | 'corrediza' | 'abatible' | 'dosHojas' | 'cuatroHojas' | 'panoramica'

export type DoorVariant = import('../models/Opening').DoorVariant
export type { Opening, OpeningPartRole }

export interface DoorOptions {
  variant: DoorVariant
  /** Ángulo de apertura de la hoja, en grados (0 cerrado, 90 abierto). */
  openingAngle: number
  /** Material del catálogo para el marco (jambas y dintel). */
  frameMaterialId: string | null
  /** Material del catálogo para la hoja. */
  leafMaterialId: string | null
  /** Material del catálogo para herrajes (bisagras, manija, cerradura). */
  metalMaterialId: string | null
  /** Grosor visible del marco (m). */
  frameWidth: number
  /** Grosor de la hoja (m). */
  leafThickness: number
}

export interface WindowOptions {
  variant: WindowVariant
  /** Ángulo de apertura de la hoja, en grados (0 cerrado, 90 abierto). */
  openingAngle: number
  /** Material del catálogo para el marco. */
  frameMaterialId: string | null
  /** Grosor visible del marco (m). */
  frameWidth: number
  /** ¿Dibuja alféizar/repisa en el hueco? */
  sillShelf: boolean
  /** Profundidad del alféizar hacia fuera del muro (m). */
  shelfDepth: number
  /** Altura del alféizar (m). */
  shelfHeight: number
}

interface OpeningPart {
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  role: OpeningPartRole
}

/**
 * Crea un material PBR para marco o hoja respetando el catálogo de texturas PBR
 * (madera, aluminio, acero) o generando un `MeshStandardMaterial` calibrado.
 */
function resolvePartMaterial(
  defId: string | null | undefined,
  defaultDefId: string | null,
  fallbackColor: number,
  fallbackRoughness: number,
  fallbackMetalness: number,
  polygonOffset = false
): THREE.MeshStandardMaterial {
  const id = defId ?? defaultDefId ?? null
  const m =
    createMeshMaterial(id) ??
    new THREE.MeshStandardMaterial({
      color: fallbackColor,
      roughness: fallbackRoughness,
      metalness: fallbackMetalness,
      side: THREE.DoubleSide
    })
  if (!id) {
    m.color.setHex(fallbackColor)
    m.roughness = fallbackRoughness
    m.metalness = fallbackMetalness
  } else {
    m.color.setHex(materialTint(id, fallbackColor))
  }
  if (polygonOffset) {
    m.polygonOffset = true
    m.polygonOffsetFactor = 1
    m.polygonOffsetUnits = 1
  }
  return m
}

/**
 * Cristal realista con `MeshPhysicalMaterial`:
 * - `transparent: true`, `opacity: 0.35`, `roughness: 0.05`
 * - `transmission: 0.9`, `ior: 1.5`, `reflectivity: 0.9`
 * - Tinte celeste/cian arquitectónico (`#e0f2fe`)
 */
export function createRealisticGlassMaterial(polygonOffset = false): THREE.MeshPhysicalMaterial {
  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e0f2fe'),
    transparent: true,
    opacity: 0.35,
    roughness: 0.05,
    metalness: 0.05,
    transmission: 0.9,
    ior: 1.5,
    reflectivity: 0.9,
    thickness: 0.012,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  if (polygonOffset) {
    glass.polygonOffset = true
    glass.polygonOffsetFactor = 1
    glass.polygonOffsetUnits = 1
  }
  return glass
}

/**
 * Material metálico para marcos de aluminio / perfilería de ventana:
 * `MeshStandardMaterial` con `roughness: 0.4`, `metalness: 0.8`.
 */
function createAluminumFrameMaterial(frameMaterialId?: string | null): THREE.MeshStandardMaterial {
  if (frameMaterialId && frameMaterialId.startsWith('mat.')) {
    return resolvePartMaterial(frameMaterialId, null, 0x334155, 0.4, 0.8)
  }
  return new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.8,
    side: THREE.DoubleSide
  })
}

/**
 * Material cromado / dorado metálico para manijas, pomos, cerraduras y bisagras:
 * `metalness: 0.9`, `roughness: 0.2`.
 */
function createHardwareMetalMaterial(metalMaterialId?: string | null, gold = false): THREE.MeshStandardMaterial {
  if (metalMaterialId && metalMaterialId.startsWith('mat.')) {
    return resolvePartMaterial(metalMaterialId, null, gold ? 0xd4af37 : 0xe2e8f0, 0.2, 0.9)
  }
  return new THREE.MeshStandardMaterial({
    color: gold ? 0xd4af37 : 0xe2e8f0,
    roughness: 0.2,
    metalness: 0.9,
    side: THREE.DoubleSide
  })
}

/**
 * Fusiona varias piezas asignando a cada una su material correspondiente
 * y calcula UVs en metros reales (`applyMeterUVs`).
 */
function mergeParts(parts: OpeningPart[]): { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } {
  if (parts.length === 0) return { geometry: new THREE.BufferGeometry(), materials: [] }
  const flat = parts.map((p) => {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone()
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    applyMeterUVs(g)
    return g
  })
  const materials = parts.map((p) => p.material)
  const merged = mergeGeometries(flat, true)
  flat.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('No se pudieron fusionar las piezas de la abertura.')
  return { geometry: merged, materials }
}

/** Gira los vértices de una geometría alrededor del eje Y que pasa por `(pivotX, pivotZ)`. */
function swingAroundY(geometry: THREE.BufferGeometry, angleDeg: number, pivotX: number, pivotZ: number): void {
  if (Math.abs(angleDeg) < 1e-4) return
  const angle = (angleDeg * Math.PI) / 180
  const s = Math.sin(angle)
  const c = Math.cos(angle)
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - pivotX
    const z = pos.getZ(i) - pivotZ
    pos.setXYZ(i, x * c + z * s + pivotX, pos.getY(i), -x * s + z * c + pivotZ)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
}

/** Crea una caja posicionada por su centro `(cx, cy, cz)` y dimensiones `(sx, sy, sz)`. */
function makeBox(sx: number, sy: number, sz: number, cx: number, cy: number, cz: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  g.translate(cx, cy, cz)
  return g
}

/**
 * Construye el marco perimetral de una puerta (jambas laterales + cabezal superior + tapajuntas/chambranas)
 * ajustado al vano real del muro:
 * - Eje X: ancho del vano `[-w/2, +w/2]`
 * - Eje Y: altura desde el suelo `[0, h]`
 * - Eje Z: espesor del muro `[-wt/2, +wt/2]`
 */
function buildDoorFrameGeometry(w: number, h: number, wt: number, frameWidth: number): THREE.BufferGeometry {
  const f = Math.min(frameWidth, w * 0.18)
  const depth = wt + 0.028 // sobresale 1.4 cm por cada cara del muro (tapajuntas realista)
  const trimW = f + 0.025
  const trimDepth = 0.014

  const boxes: THREE.BufferGeometry[] = [
    // Jamba izquierda
    makeBox(f, h, depth, -w / 2 + f / 2, h / 2, 0),
    // Jamba derecha
    makeBox(f, h, depth, w / 2 - f / 2, h / 2, 0),
    // Dintel / cabezal superior
    makeBox(w, f, depth, 0, h - f / 2, 0),
    // Tapajuntas (chambrana) cara frontal (+Z) y posterior (-Z)
    makeBox(trimW, h + trimW * 0.5, trimDepth, -w / 2 + f / 2, (h + trimW * 0.5) / 2, wt / 2 + trimDepth / 2),
    makeBox(trimW, h + trimW * 0.5, trimDepth, w / 2 - f / 2, (h + trimW * 0.5) / 2, wt / 2 + trimDepth / 2),
    makeBox(w + trimW, trimW, trimDepth, 0, h + trimW * 0.25, wt / 2 + trimDepth / 2),
    makeBox(trimW, h + trimW * 0.5, trimDepth, -w / 2 + f / 2, (h + trimW * 0.5) / 2, -wt / 2 - trimDepth / 2),
    makeBox(trimW, h + trimW * 0.5, trimDepth, w / 2 - f / 2, (h + trimW * 0.5) / 2, -wt / 2 - trimDepth / 2),
    makeBox(w + trimW, trimW, trimDepth, 0, h + trimW * 0.25, -wt / 2 - trimDepth / 2)
  ]

  const merged = mergeGeometries(boxes, false)
  boxes.forEach((b) => b.dispose())
  merged.computeVertexNormals()
  return merged
}

/**
 * Construye una hoja de puerta arquitectónica con relieve de plafones/molduras
 * centrada en `xCenter`, con ancho `leafW`, alto `leafH` y espesor `lt`.
 */
function buildPanelDoorLeafGeometry(leafW: number, leafH: number, lt: number, xCenter: number): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = []
  // Núcleo principal de la hoja
  pieces.push(makeBox(leafW, leafH, lt, xCenter, leafH / 2, 0))

  // Molduras perimetrales (montantes y travesaños) en ambas caras para relieve 3D real
  const stileW = Math.min(0.11, leafW * 0.2)
  const railH = Math.min(0.14, leafH * 0.1)
  const reliefDepth = 0.008
  const totalZ = lt + reliefDepth * 2

  // Montante izquierdo y derecho
  pieces.push(makeBox(stileW, leafH, totalZ, xCenter - leafW / 2 + stileW / 2, leafH / 2, 0))
  pieces.push(makeBox(stileW, leafH, totalZ, xCenter + leafW / 2 - stileW / 2, leafH / 2, 0))
  // Travesaño inferior, intermedio y superior
  pieces.push(makeBox(leafW - stileW * 2, railH * 1.3, totalZ, xCenter, railH * 0.65, 0))
  pieces.push(makeBox(leafW - stileW * 2, railH, totalZ, xCenter, leafH * 0.42, 0))
  pieces.push(makeBox(leafW - stileW * 2, railH, totalZ, xCenter, leafH - railH / 2, 0))

  // Plafones centrales biselados (inferior y superior)
  const innerW = Math.max(0.08, leafW - stileW * 2.6)
  const lowerPanelH = Math.max(0.1, leafH * 0.42 - railH * 2.1)
  const upperPanelH = Math.max(0.1, leafH * 0.58 - railH * 1.9)
  pieces.push(makeBox(innerW, lowerPanelH, lt + reliefDepth * 1.1, xCenter, railH * 1.3 + lowerPanelH / 2 + 0.02, 0))
  pieces.push(makeBox(innerW, upperPanelH, lt + reliefDepth * 1.1, xCenter, leafH * 0.42 + railH / 2 + upperPanelH / 2 + 0.02, 0))

  const merged = mergeGeometries(pieces, false)
  pieces.forEach((p) => p.dispose())
  merged.computeVertexNormals()
  return merged
}

/**
 * Construye el conjunto completo de manija / pomo cromado o dorado en AMBAS caras
 * de la hoja (`+Z` y `-Z`), más el cilindro de cerradura y la placa de canto.
 */
function buildDoorHandleAssembly(
  handleX: number,
  handleY: number,
  lt: number,
  inwardDirX: number
): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = []
  const rosetteR = 0.026
  const rosetteT = 0.008
  const neckLen = 0.038
  const leverLen = 0.115

  for (const side of [-1, 1]) {
    const zFace = side * (lt / 2)
    // Roseta circular sobre la cara de la hoja
    const rosette = new THREE.CylinderGeometry(rosetteR, rosetteR, rosetteT, 18)
    rosette.rotateX(Math.PI / 2)
    rosette.translate(handleX, handleY, zFace + side * (rosetteT / 2))
    pieces.push(rosette)

    // Bocallave inferior (escudo de cerradura)
    const escutcheon = new THREE.CylinderGeometry(rosetteR * 0.72, rosetteR * 0.72, rosetteT, 16)
    escutcheon.rotateX(Math.PI / 2)
    escutcheon.translate(handleX, handleY - 0.068, zFace + side * (rosetteT / 2))
    pieces.push(escutcheon)

    // Cuello cilíndrico del pomo/manija
    const neck = new THREE.CylinderGeometry(0.009, 0.011, neckLen, 14)
    neck.rotateX(Math.PI / 2)
    neck.translate(handleX, handleY, zFace + side * (rosetteT + neckLen / 2))
    pieces.push(neck)

    // Manija / palanca ergonómica horizontal
    const lever = makeBox(
      leverLen,
      0.018,
      0.014,
      handleX + inwardDirX * (leverLen / 2 - 0.01),
      handleY,
      zFace + side * (rosetteT + neckLen + 0.004)
    )
    pieces.push(lever)
  }

  // Placa de resbalón en el canto de la hoja
  const latchPlate = makeBox(0.004, 0.14, lt * 0.65, handleX - inwardDirX * 0.055, handleY - 0.02, 0)
  pieces.push(latchPlate)

  const merged = mergeGeometries(pieces, false)
  pieces.forEach((p) => p.dispose())
  merged.computeVertexNormals()
  return merged
}

/** Construye 3 bisagras cilíndricas en el borde de giro de la hoja. */
function buildDoorHingesGeometry(hingeX: number, leafH: number, lt: number): THREE.BufferGeometry {
  const ys = [leafH * 0.16, leafH * 0.5, leafH * 0.84]
  const pieces: THREE.BufferGeometry[] = []
  for (const y of ys) {
    const barrel = new THREE.CylinderGeometry(0.008, 0.008, 0.09, 12)
    barrel.translate(hingeX, y, lt / 2 + 0.006)
    pieces.push(barrel)
  }
  const merged = mergeGeometries(pieces, false)
  pieces.forEach((p) => p.dispose())
  merged.computeVertexNormals()
  return merged
}

/**
 * Construye la geometría 3D multi-material de una puerta realista:
 * - Marco perimetral con tapajuntas ajustado al vano perforado del muro.
 * - Hoja texturizada (madera PBR, panel metálico o cristal templado).
 * - Manija/pomo metálico cromado o dorado (`metalness: 0.9`, `roughness: 0.2`) en ambas caras y bisagras.
 */
export function buildDoor(
  opening: Opening,
  wallThickness: number,
  options: Partial<DoorOptions> = {}
): { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } {
  const variant: DoorVariant = (options.variant ?? 'simple') as DoorVariant
  const angle = Math.max(0, Math.min(90, options.openingAngle ?? 0))
  const w = Math.max(0.4, opening.width)
  const h = Math.max(0.8, opening.height)
  const wt = Math.max(0.08, wallThickness)
  const f = Math.min(options.frameWidth ?? 0.065, w * 0.16)
  const lt = Math.min(options.leafThickness ?? 0.045, Math.max(0.035, wt * 0.45))

  const isMetalDoor = variant === 'garaje' || opening.materialId === 'mat.metal-pot' || opening.materialId === 'mat.steel'
  const frameMat = isMetalDoor
    ? createAluminumFrameMaterial(options.frameMaterialId)
    : resolvePartMaterial(options.frameMaterialId, 'mat.walnut', 0x4a321f, 0.45, 0.1)

  const leafMat = resolvePartMaterial(
    options.leafMaterialId ?? opening.materialId,
    isMetalDoor ? 'mat.steel' : 'mat.wood',
    isMetalDoor ? 0x64748b : 0x8b5a2b,
    isMetalDoor ? 0.35 : 0.55,
    isMetalDoor ? 0.8 : 0.05
  )

  const handleMat = createHardwareMetalMaterial(options.metalMaterialId, !isMetalDoor)
  const glassMat = createRealisticGlassMaterial(false)

  const parts: OpeningPart[] = []

  // 1. Marco perimetral ajustado al vano del muro
  parts.push({
    geometry: buildDoorFrameGeometry(w, h, wt, f),
    material: frameMat,
    role: 'frame'
  })

  const innerW = w - f * 2
  const innerH = h - f

  const addSwingingLeaf = (
    xMin: number,
    xMax: number,
    hingeX: number,
    swingDeg: number,
    withGlassInsert: boolean
  ): void => {
    const lw = xMax - xMin
    const xCenter = (xMin + xMax) / 2
    const inwardDirX = hingeX <= xCenter ? 1 : -1
    const handleX = hingeX <= xCenter ? xMax - 0.065 : xMin + 0.065
    const handleY = Math.min(innerH * 0.48, 1.0)

    if (withGlassInsert) {
      // Hoja con bastidor perimetral y gran cristal central (vidrio / puerta-ventana)
      const stile = Math.min(0.09, lw * 0.18)
      const bottomRail = variant === 'puerta-ventana' ? innerH * 0.32 : stile
      const topRail = stile
      const framePieces: THREE.BufferGeometry[] = [
        makeBox(stile, innerH, lt, xMin + stile / 2, innerH / 2, 0),
        makeBox(stile, innerH, lt, xMax - stile / 2, innerH / 2, 0),
        makeBox(lw - stile * 2, bottomRail, lt, xCenter, bottomRail / 2, 0),
        makeBox(lw - stile * 2, topRail, lt, xCenter, innerH - topRail / 2, 0)
      ]
      const leafFrameGeo = mergeGeometries(framePieces, false)
      framePieces.forEach((p) => p.dispose())
      if (swingDeg !== 0) swingAroundY(leafFrameGeo, swingDeg, hingeX, 0)
      parts.push({ geometry: leafFrameGeo, material: leafMat, role: 'leaf' })

      const glassW = Math.max(0.05, lw - stile * 2)
      const glassH = Math.max(0.05, innerH - bottomRail - topRail)
      const glassY = bottomRail + glassH / 2
      const glassGeo = makeBox(glassW, glassH, 0.01, xCenter, glassY, 0)
      if (swingDeg !== 0) swingAroundY(glassGeo, swingDeg, hingeX, 0)
      parts.push({ geometry: glassGeo, material: glassMat, role: 'glass' })
    } else {
      const leafGeo = buildPanelDoorLeafGeometry(lw, innerH, lt, xCenter)
      if (swingDeg !== 0) swingAroundY(leafGeo, swingDeg, hingeX, 0)
      parts.push({ geometry: leafGeo, material: leafMat, role: 'leaf' })
    }

    const hingesGeo = buildDoorHingesGeometry(hingeX, innerH, lt)
    parts.push({ geometry: hingesGeo, material: handleMat, role: 'handle' })

    const handleGeo = buildDoorHandleAssembly(handleX, handleY, lt, inwardDirX)
    if (swingDeg !== 0) swingAroundY(handleGeo, swingDeg, hingeX, 0)
    parts.push({ geometry: handleGeo, material: handleMat, role: 'handle' })
  }

  if (variant === 'doble') {
    addSwingingLeaf(-innerW / 2, 0, -innerW / 2, angle, false)
    addSwingingLeaf(0, innerW / 2, innerW / 2, -angle, false)
  } else if (variant === 'corrediza') {
    // Dos hojas corredizas (una fija acristalada/madera y una móvil traslapada)
    const halfW = innerW * 0.52
    const leftLeaf = buildPanelDoorLeafGeometry(halfW, innerH, lt * 0.85, -innerW * 0.24)
    leftLeaf.translate(0, 0, -lt * 0.45)
    const rightLeaf = buildPanelDoorLeafGeometry(halfW, innerH, lt * 0.85, innerW * 0.24)
    rightLeaf.translate(0, 0, lt * 0.45)
    parts.push({ geometry: leftLeaf, material: leafMat, role: 'leaf' })
    parts.push({ geometry: rightLeaf, material: leafMat, role: 'leaf' })
    const handleGeo = buildDoorHandleAssembly(innerW * 0.42, 1.0, lt, -1)
    handleGeo.translate(0, 0, lt * 0.45)
    parts.push({ geometry: handleGeo, material: handleMat, role: 'handle' })
  } else if (variant === 'garaje') {
    // Puerta seccional de garaje con lamas horizontales y manija central
    const sections = 5
    const secH = innerH / sections
    const secPieces: THREE.BufferGeometry[] = []
    for (let s = 0; s < sections; s++) {
      secPieces.push(makeBox(innerW, secH - 0.012, lt, 0, s * secH + secH / 2, 0))
    }
    const secGeo = mergeGeometries(secPieces, false)
    secPieces.forEach((p) => p.dispose())
    parts.push({ geometry: secGeo, material: leafMat, role: 'leaf' })
    const handleGeo = buildDoorHandleAssembly(0, 0.95, lt, 1)
    parts.push({ geometry: handleGeo, material: handleMat, role: 'handle' })
  } else if (variant === 'vidrio' || variant === 'puerta-ventana') {
    addSwingingLeaf(-innerW / 2, innerW / 2, -innerW / 2, angle, true)
  } else {
    // Puerta simple estándar con hoja plafonada, marco y manija metálica
    addSwingingLeaf(-innerW / 2, innerW / 2, -innerW / 2, angle, false)
  }

  return mergeParts(parts)
}

/**
 * Construye la geometría 3D multi-material de una ventana realista:
 * - Marco perimetral y perfilería de aluminio o madera oscura (`MeshStandardMaterial`, `roughness: 0.4`, `metalness: 0.8`).
 * - Alféizar / vierteaguas inferior que sobresale del espesor del muro.
 * - Cristal transparente con `MeshPhysicalMaterial` (`opacity: 0.35`, `roughness: 0.05`,
 *   `transmission: 0.9`, `ior: 1.5`, `reflectivity: 0.9`, color `#e0f2fe`).
 * - Manilla/cremona cromada en la carpintería interior.
 *
 * Sistema de coordenadas local:
 * - Eje X: `[-w/2, +w/2]` (a lo largo del muro)
 * - Eje Y: `[0, h]` (desde el antepecho hasta el dintel de la ventana)
 * - Eje Z: `[-wt/2, +wt/2]` (espesor del muro)
 */
export function buildWindow(
  opening: Opening,
  wallThickness: number,
  options: Partial<WindowOptions> = {}
): { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } {
  const variant: WindowVariant = (options.variant ?? 'fija') as WindowVariant
  const angle = Math.max(0, Math.min(90, options.openingAngle ?? 0))
  const w = Math.max(0.35, opening.width)
  const h = Math.max(0.35, opening.height)
  const wt = Math.max(0.08, wallThickness)
  const f = Math.min(options.frameWidth ?? 0.06, w * 0.16, h * 0.16)
  const frameDepth = wt + 0.02

  const frameMat = createAluminumFrameMaterial(options.frameMaterialId)
  const hardwareMat = createHardwareMetalMaterial(null, false)
  const glassMat = createRealisticGlassMaterial(true)

  const parts: OpeningPart[] = []

  // 1. Marco perimetral exterior (4 lados ajustados al hueco perforado del muro)
  const outerFrameBoxes: THREE.BufferGeometry[] = [
    // Jamba izquierda
    makeBox(f, h, frameDepth, -w / 2 + f / 2, h / 2, 0),
    // Jamba derecha
    makeBox(f, h, frameDepth, w / 2 - f / 2, h / 2, 0),
    // Cabezal superior
    makeBox(w - f * 2, f, frameDepth, 0, h - f / 2, 0),
    // Base inferior del marco
    makeBox(w - f * 2, f, frameDepth, 0, f / 2, 0)
  ]
  const outerFrameGeo = mergeGeometries(outerFrameBoxes, false)
  outerFrameBoxes.forEach((b) => b.dispose())
  outerFrameGeo.computeVertexNormals()
  parts.push({ geometry: outerFrameGeo, material: frameMat, role: 'frame' })

  // 2. Alféizar / repisa inferior (sobresale hacia el exterior e interior)
  if (options.sillShelf !== false) {
    const sillW = w + 0.06
    const sillH = options.shelfHeight ?? 0.03
    const sillD = wt + (options.shelfDepth ?? 0.06)
    const sillGeo = makeBox(sillW, sillH, sillD, 0, sillH / 2 - 0.01, 0)
    parts.push({ geometry: sillGeo, material: frameMat, role: 'sill' })
  }

  const innerW = w - f * 2
  const innerH = h - f * 2
  const sashProfile = Math.min(0.042, innerW * 0.1, innerH * 0.1)
  const sashDepth = Math.min(0.045, wt * 0.45)
  const glassThickness = 0.01

  /** Añade una hoja de ventana (con su sub-marco de perfilería y su panel de cristal físico). */
  const addWindowSash = (
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    zOffset: number,
    swingDeg: number
  ): void => {
    const sw = xMax - xMin
    const sh = yMax - yMin
    const cx = (xMin + xMax) / 2
    const cy = (yMin + yMax) / 2

    // Sub-marco (hoja de carpintería)
    const sashBoxes: THREE.BufferGeometry[] = [
      makeBox(sashProfile, sh, sashDepth, xMin + sashProfile / 2, cy, zOffset),
      makeBox(sashProfile, sh, sashDepth, xMax - sashProfile / 2, cy, zOffset),
      makeBox(sw - sashProfile * 2, sashProfile, sashDepth, cx, yMax - sashProfile / 2, zOffset),
      makeBox(sw - sashProfile * 2, sashProfile, sashDepth, cx, yMin + sashProfile / 2, zOffset)
    ]
    const sashGeo = mergeGeometries(sashBoxes, false)
    sashBoxes.forEach((b) => b.dispose())
    if (swingDeg !== 0) swingAroundY(sashGeo, swingDeg, xMin, zOffset)
    parts.push({ geometry: sashGeo, material: frameMat, role: 'muntin' })

    // Cristal físico transparente (`MeshPhysicalMaterial`)
    const gw = Math.max(0.04, sw - sashProfile * 2)
    const gh = Math.max(0.04, sh - sashProfile * 2)
    const glassGeo = makeBox(gw, gh, glassThickness, cx, cy, zOffset)
    if (swingDeg !== 0) swingAroundY(glassGeo, swingDeg, xMin, zOffset)
    parts.push({ geometry: glassGeo, material: glassMat, role: 'glass' })
  }

  const y0 = f
  const y1 = h - f

  if (variant === 'corrediza' || variant === 'dosHojas') {
    // Dos hojas con parteluz central y manilla cromada
    addWindowSash(-innerW / 2, 0.01, y0, y1, -0.012, 0)
    addWindowSash(-0.01, innerW / 2, y0, y1, 0.012, 0)
    // Manilla / cierre central cromado
    const latch = makeBox(0.016, 0.08, 0.035, 0, h / 2, sashDepth * 0.7)
    parts.push({ geometry: latch, material: hardwareMat, role: 'handle' })
  } else if (variant === 'cuatroHojas') {
    const midY = f + innerH / 2
    addWindowSash(-innerW / 2, 0, y0, midY, 0, 0)
    addWindowSash(0, innerW / 2, y0, midY, 0, 0)
    addWindowSash(-innerW / 2, 0, midY, y1, 0, 0)
    addWindowSash(0, innerW / 2, midY, y1, 0, 0)
    const latch = makeBox(0.018, 0.08, 0.035, 0, midY, sashDepth * 0.7)
    parts.push({ geometry: latch, material: hardwareMat, role: 'handle' })
  } else if (variant === 'abatible') {
    addWindowSash(-innerW / 2, innerW / 2, y0, y1, 0, angle)
    const latch = makeBox(0.016, 0.08, 0.035, innerW / 2 - sashProfile * 0.5, h / 2, sashDepth * 0.7)
    if (angle !== 0) swingAroundY(latch, angle, -innerW / 2, 0)
    parts.push({ geometry: latch, material: hardwareMat, role: 'handle' })
  } else {
    // Ventana fija o panorámica
    addWindowSash(-innerW / 2, innerW / 2, y0, y1, 0, 0)
  }

  return mergeParts(parts)
}
