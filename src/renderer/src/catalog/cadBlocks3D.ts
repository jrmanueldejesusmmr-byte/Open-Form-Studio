import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getCadBlock } from './cadBlocksData'

/**
 * ===================================================================
 * ARQSTUDIO 3D - ADVANCED PROCEDURAL 3D ARCHITECTURAL ASSET GENERATOR
 * ===================================================================
 * 
 * Reemplaza los bloques primitivos y monocromáticos por modelos 3D detallados,
 * construidos con geometrías paramétricas avanzadas y materiales PBR físicos
 * (MeshPhysicalMaterial y MeshStandardMaterial) con propiedades de roughness,
 * metalness, clearcoat, transparencia y emisión realistas.
 */

export interface CadBlock3DResult {
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
}

export interface CadPart {
  geo: THREE.BufferGeometry
  mat: THREE.Material
}

/* ===================================================================
 * 1. SISTEMA DE MATERIALES PBR REALISTAS
 * =================================================================== */

export interface CadMaterialLibrary {
  carPaint: THREE.MeshPhysicalMaterial
  carGlass: THREE.MeshStandardMaterial
  tireRubber: THREE.MeshStandardMaterial
  rimAlloy: THREE.MeshStandardMaterial
  headlight: THREE.MeshStandardMaterial
  taillight: THREE.MeshStandardMaterial
  darkPlastic: THREE.MeshStandardMaterial
  chrome: THREE.MeshStandardMaterial

  fabric: THREE.MeshStandardMaterial
  fabricAccent: THREE.MeshStandardMaterial
  fabricDark: THREE.MeshStandardMaterial
  pillow: THREE.MeshStandardMaterial

  woodFine: THREE.MeshStandardMaterial
  woodOak: THREE.MeshStandardMaterial
  woodDark: THREE.MeshStandardMaterial

  mattress: THREE.MeshStandardMaterial
  duvet: THREE.MeshStandardMaterial

  ceramic: THREE.MeshPhysicalMaterial
  stainlessSteel: THREE.MeshStandardMaterial
  blackMetal: THREE.MeshStandardMaterial
  glassClear: THREE.MeshStandardMaterial
  mirror: THREE.MeshStandardMaterial

  tvScreen: THREE.MeshStandardMaterial
  pianoBody: THREE.MeshPhysicalMaterial
  pianoKeyWhite: THREE.MeshStandardMaterial
  pianoKeyBlack: THREE.MeshStandardMaterial

  bark: THREE.MeshStandardMaterial
  foliage1: THREE.MeshStandardMaterial
  foliage2: THREE.MeshStandardMaterial
  foliage3: THREE.MeshStandardMaterial
  potClay: THREE.MeshStandardMaterial

  humanSkin: THREE.MeshStandardMaterial
  humanHair: THREE.MeshStandardMaterial
  humanShirt: THREE.MeshStandardMaterial
  humanPants: THREE.MeshStandardMaterial
  humanShoes: THREE.MeshStandardMaterial
}

export function createCadMaterialLibrary(customColor?: number | string | null): CadMaterialLibrary {
  let primaryColor = 0xdc2626 // Rojo metálico por defecto
  if (customColor !== undefined && customColor !== null) {
    if (typeof customColor === 'number' && Number.isFinite(customColor)) {
      primaryColor = customColor
    } else if (typeof customColor === 'string' && customColor.trim()) {
      primaryColor = parseInt(customColor.replace('#', ''), 16)
    }
  }

  return {
    // Vehículos & Carrocería
    carPaint: new THREE.MeshPhysicalMaterial({
      color: primaryColor,
      metalness: 0.7,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    }),
    carGlass: new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.65,
      roughness: 0.05,
      metalness: 0.9,
      depthWrite: false
    }),
    tireRubber: new THREE.MeshStandardMaterial({
      color: 0x171717,
      roughness: 0.9,
      metalness: 0.05
    }),
    rimAlloy: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.15
    }),
    headlight: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xfef08a),
      emissiveIntensity: 0.85,
      roughness: 0.1,
      metalness: 0.1
    }),
    taillight: new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.1
    }),
    darkPlastic: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.75,
      metalness: 0.15
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.95,
      roughness: 0.1
    }),

    // Tapicería y Telas
    fabric: new THREE.MeshStandardMaterial({
      color: customColor ? primaryColor : 0x334155, // Gris Oxford o personalizado
      roughness: 0.85,
      metalness: 0.05
    }),
    fabricAccent: new THREE.MeshStandardMaterial({
      color: 0xd6d3d1, // Beige Cálido
      roughness: 0.85,
      metalness: 0.05
    }),
    fabricDark: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.05
    }),
    pillow: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
      metalness: 0.02
    }),

    // Maderas arquitectónicas
    woodFine: new THREE.MeshStandardMaterial({
      color: 0x451a03, // Nogal Oscuro
      roughness: 0.45,
      metalness: 0.08
    }),
    woodOak: new THREE.MeshStandardMaterial({
      color: 0x92400e, // Roble Miel
      roughness: 0.5,
      metalness: 0.05
    }),
    woodDark: new THREE.MeshStandardMaterial({
      color: 0x27272a, // Wengué / Patas oscuras
      roughness: 0.55,
      metalness: 0.15
    }),

    // Ropa de cama
    mattress: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0
    }),
    duvet: new THREE.MeshStandardMaterial({
      color: customColor ? primaryColor : 0x3b82f6, // Azul elegante o personalizado
      roughness: 0.8,
      metalness: 0.05
    }),

    // Baño y sanitarios
    ceramic: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1
    }),
    stainlessSteel: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.85,
      roughness: 0.25
    }),
    blackMetal: new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.8,
      metalness: 0.35
    }),
    glassClear: new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.1,
      depthWrite: false
    }),
    mirror: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.04
    }),

    // Multimedia y Piano
    tvScreen: new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.2,
      metalness: 0.8
    }),
    pianoBody: new THREE.MeshPhysicalMaterial({
      color: 0x111827,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      roughness: 0.1,
      metalness: 0.1
    }),
    pianoKeyWhite: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.05
    }),
    pianoKeyBlack: new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.3,
      metalness: 0.1
    }),

    // Vegetación
    bark: new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.95,
      metalness: 0.0
    }),
    foliage1: new THREE.MeshStandardMaterial({
      color: 0x15803d, // Verde natural medio
      roughness: 0.8,
      metalness: 0.0
    }),
    foliage2: new THREE.MeshStandardMaterial({
      color: 0x166534, // Verde bosque oscuro
      roughness: 0.85,
      metalness: 0.0
    }),
    foliage3: new THREE.MeshStandardMaterial({
      color: 0x22c55e, // Verde brote luminoso
      roughness: 0.75,
      metalness: 0.0
    }),
    potClay: new THREE.MeshStandardMaterial({
      color: 0x9a3412, // Terracota cálido
      roughness: 0.7,
      metalness: 0.05
    }),

    // Escala humana
    humanSkin: new THREE.MeshStandardMaterial({
      color: 0xe0a97a,
      roughness: 0.6,
      metalness: 0.0
    }),
    humanHair: new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.9,
      metalness: 0.0
    }),
    humanShirt: new THREE.MeshStandardMaterial({
      color: customColor ? primaryColor : 0xf8fafc,
      roughness: 0.8,
      metalness: 0.0
    }),
    humanPants: new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Pantalón Oxford / Azul petróleo
      roughness: 0.85,
      metalness: 0.0
    }),
    humanShoes: new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
      metalness: 0.1
    })
  }
}

/* ===================================================================
 * HELPER GEOMETRIES (Transformaciones directas en BufferGeometry)
 * =================================================================== */

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d)
  if (rx !== 0) geo.rotateX(rx)
  if (ry !== 0) geo.rotateY(ry)
  if (rz !== 0) geo.rotateZ(rz)
  geo.translate(x, y + h / 2, z)
  return geo
}

function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  segs = 16
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segs)
  if (rx !== 0) geo.rotateX(rx)
  if (ry !== 0) geo.rotateY(ry)
  if (rz !== 0) geo.rotateZ(rz)
  geo.translate(x, y + h / 2, z)
  return geo
}

function sphere(
  r: number,
  x: number,
  y: number,
  z: number,
  segs = 16,
  rings = 12
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, segs, rings)
  geo.translate(x, y, z)
  return geo
}

function torus(
  r: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  segs = 16,
  tubeSegs = 12
): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(r, tube, segs, tubeSegs)
  if (rx !== 0) geo.rotateX(rx)
  if (ry !== 0) geo.rotateY(ry)
  if (rz !== 0) geo.rotateZ(rz)
  geo.translate(x, y, z)
  return geo
}

/**
 * Ensambla una lista de piezas agrupando aquellas que comparten material
 * y genera una única BufferGeometry con grupos y un array de materiales correspondientes.
 */
function assembleParts(parts: CadPart[]): CadBlock3DResult {
  if (parts.length === 0) {
    return {
      geometry: new THREE.BoxGeometry(1, 1, 1),
      materials: [new THREE.MeshStandardMaterial({ color: 0x94a3b8 })]
    }
  }

  const matMap = new Map<THREE.Material, THREE.BufferGeometry[]>()
  for (const part of parts) {
    let list = matMap.get(part.mat)
    if (!list) {
      list = []
      matMap.set(part.mat, list)
    }
    list.push(part.geo)
  }

  const materials: THREE.Material[] = []
  const groupedGeos: THREE.BufferGeometry[] = []

  for (const [mat, geos] of matMap.entries()) {
    materials.push(mat)
    if (geos.length === 1) {
      const g = geos[0].index ? geos[0].toNonIndexed() : geos[0]
      if (!g.getAttribute('normal')) g.computeVertexNormals()
      groupedGeos.push(g)
    } else {
      const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g))
      const merged = mergeGeometries(flat, false)
      flat.forEach((g) => g.dispose())
      if (merged) {
        if (!merged.getAttribute('normal')) merged.computeVertexNormals()
        groupedGeos.push(merged)
      }
    }
  }

  const finalGeo = mergeGeometries(groupedGeos, true)
  groupedGeos.forEach((g) => g.dispose())

  if (!finalGeo) {
    return {
      geometry: new THREE.BoxGeometry(1, 1, 1),
      materials: [new THREE.MeshStandardMaterial({ color: 0x94a3b8 })]
    }
  }

  finalGeo.computeVertexNormals()
  return {
    geometry: finalGeo,
    materials
  }
}

/** Crea un conjunto rueda completa: Neumático negro + Rin cromado con rayos */
function createWheelAssembly(
  tireR: number,
  tireW: number,
  rimR: number,
  cx: number,
  cy: number,
  cz: number,
  mats: CadMaterialLibrary,
  parts: CadPart[]
): void {
  // Neumático de caucho rotado para rodar a lo largo del eje Z (eje del cilindro en X)
  const tireGeo = new THREE.CylinderGeometry(tireR, tireR, tireW, 20)
  tireGeo.rotateZ(Math.PI / 2)
  tireGeo.translate(cx, cy, cz)
  parts.push({ geo: tireGeo, mat: mats.tireRubber })

  // Rin de aluminio cromado
  const rimGeo = new THREE.CylinderGeometry(rimR, rimR, tireW + 0.01, 16)
  rimGeo.rotateZ(Math.PI / 2)
  rimGeo.translate(cx, cy, cz)
  parts.push({ geo: rimGeo, mat: mats.rimAlloy })

  // Tapa central / centro de rueda
  const capGeo = new THREE.CylinderGeometry(rimR * 0.35, rimR * 0.35, tireW + 0.02, 12)
  capGeo.rotateZ(Math.PI / 2)
  capGeo.translate(cx, cy, cz)
  parts.push({ geo: capGeo, mat: mats.chrome })
}

/* ===================================================================
 * 2. CONSTRUCTORES DE VEHÍCULOS REALISTAS
 * =================================================================== */

function buildCarSedan(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tireR = 0.32
  const tireW = 0.22
  const rimR = 0.21
  const axleY = tireR
  const frontZ = -d * 0.3
  const rearZ = d * 0.3
  const wheelX = w / 2 - tireW / 2 + 0.02

  // 1. 4 Ruedas completas (neumático + rin cromado)
  createWheelAssembly(tireR, tireW, rimR, -wheelX, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, wheelX, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, -wheelX, axleY, rearZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, wheelX, axleY, rearZ, mats, parts)

  // 2. Chasis inferior / piso negro
  parts.push({
    geo: box(w * 0.88, 0.12, d * 0.85, 0, 0.12, 0),
    mat: mats.darkPlastic
  })

  // 3. Parachoques delantero y trasero oscuros
  parts.push({
    geo: box(w * 0.96, 0.22, 0.26, 0, 0.15, -d / 2 + 0.13),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(w * 0.96, 0.24, 0.26, 0, 0.16, d / 2 - 0.13),
    mat: mats.darkPlastic
  })

  // 4. Parrilla frontal cromada
  parts.push({
    geo: box(w * 0.52, 0.16, 0.06, 0, 0.28, -d / 2 + 0.04),
    mat: mats.chrome
  })

  // 5. Faros delanteros blancos emisivos y traseros rojos
  parts.push({
    geo: box(0.24, 0.11, 0.06, -w * 0.34, 0.38, -d / 2 + 0.06),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.24, 0.11, 0.06, w * 0.34, 0.38, -d / 2 + 0.06),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.28, 0.12, 0.06, -w * 0.33, 0.46, d / 2 - 0.04),
    mat: mats.taillight
  })
  parts.push({
    geo: box(0.28, 0.12, 0.06, w * 0.33, 0.46, d / 2 - 0.04),
    mat: mats.taillight
  })

  // 6. Carrocería principal (Capó, puertas, cajuela) en carPaint
  parts.push({
    geo: box(w * 0.96, 0.38, d * 0.88, 0, 0.22, -0.05),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(w * 0.9, 0.16, d * 0.32, 0, 0.54, -d * 0.25),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(w * 0.88, 0.18, d * 0.22, 0, 0.56, d * 0.32),
    mat: mats.carPaint
  })

  // 7. Cabina estilizada: Techo de pintura y ventanas de cristal polarizado
  const cabinW = w * 0.82
  const cabinH = h - 0.65
  const cabinD = d * 0.48
  const cabinZ = 0.02
  const cabinY = 0.62

  parts.push({
    geo: box(cabinW * 0.95, cabinH * 0.9, cabinD * 0.98, 0, cabinY, cabinZ),
    mat: mats.carGlass
  })
  parts.push({
    geo: box(cabinW, 0.06, cabinD * 0.72, 0, cabinY + cabinH - 0.06, cabinZ + 0.02),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(0.06, cabinH, 0.08, -cabinW / 2 + 0.03, cabinY, cabinZ),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(0.06, cabinH, 0.08, cabinW / 2 - 0.03, cabinY, cabinZ),
    mat: mats.carPaint
  })

  // 8. Espejos retrovisores exteriores
  parts.push({
    geo: box(0.14, 0.08, 0.12, -w / 2 - 0.04, 0.72, -0.45),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(0.14, 0.08, 0.12, w / 2 + 0.04, 0.72, -0.45),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(0.02, 0.06, 0.09, -w / 2 - 0.04, 0.73, -0.44),
    mat: mats.mirror
  })
  parts.push({
    geo: box(0.02, 0.06, 0.09, w / 2 + 0.04, 0.73, -0.44),
    mat: mats.mirror
  })

  return assembleParts(parts)
}

function buildCarSuv(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tireR = 0.39
  const tireW = 0.28
  const rimR = 0.24
  const axleY = tireR
  const frontZ = -d * 0.32
  const rearZ = d * 0.31
  const wheelX = w / 2 - tireW / 2 + 0.03

  // Ruedas grandes 4x4
  createWheelAssembly(tireR, tireW, rimR, -wheelX, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, wheelX, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, -wheelX, axleY, rearZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, wheelX, axleY, rearZ, mats, parts)

  // Chasis y estribos laterales
  parts.push({
    geo: box(w * 0.86, 0.16, d * 0.88, 0, 0.2, 0),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(0.12, 0.04, d * 0.55, -w / 2 + 0.02, 0.26, 0),
    mat: mats.chrome
  })
  parts.push({
    geo: box(0.12, 0.04, d * 0.55, w / 2 - 0.02, 0.26, 0),
    mat: mats.chrome
  })

  // Parachoques todoterreno con protector inferior
  parts.push({
    geo: box(w * 0.98, 0.3, 0.3, 0, 0.22, -d / 2 + 0.15),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(w * 0.5, 0.15, 0.05, 0, 0.22, -d / 2 + 0.02),
    mat: mats.chrome
  })
  parts.push({
    geo: box(w * 0.98, 0.3, 0.28, 0, 0.25, d / 2 - 0.14),
    mat: mats.darkPlastic
  })

  // Parrilla frontal imponente y faros
  parts.push({
    geo: box(w * 0.65, 0.22, 0.06, 0, 0.48, -d / 2 + 0.06),
    mat: mats.chrome
  })
  parts.push({
    geo: box(0.26, 0.14, 0.06, -w * 0.36, 0.54, -d / 2 + 0.08),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.26, 0.14, 0.06, w * 0.36, 0.54, -d / 2 + 0.08),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.24, 0.28, 0.06, -w * 0.38, 0.65, d / 2 - 0.05),
    mat: mats.taillight
  })
  parts.push({
    geo: box(0.24, 0.28, 0.06, w * 0.38, 0.65, d / 2 - 0.05),
    mat: mats.taillight
  })

  // Carrocería de SUV / Pickup
  parts.push({
    geo: box(w * 0.98, 0.5, d * 0.88, 0, 0.32, -0.05),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(w * 0.92, 0.22, d * 0.32, 0, 0.72, -d * 0.26),
    mat: mats.carPaint
  })

  // Cabina Pickup / SUV (Doble cabina)
  const cabW = w * 0.86
  const cabH = h - 0.88
  const cabD = d * 0.44
  const cabZ = -0.15
  const cabY = 0.82

  parts.push({
    geo: box(cabW * 0.96, cabH * 0.92, cabD * 0.98, 0, cabY, cabZ),
    mat: mats.carGlass
  })
  parts.push({
    geo: box(cabW, 0.08, cabD * 0.88, 0, cabY + cabH - 0.08, cabZ),
    mat: mats.carPaint
  })

  // Batea trasera hueca de pickup con paredes laterales
  const bedY = 0.72
  const bedD = d * 0.38
  const bedZ = d * 0.28
  parts.push({
    geo: box(w * 0.86, 0.06, bedD, 0, bedY, bedZ),
    mat: mats.darkPlastic
  })
  // Barras antivuelco tubulares en la batea
  parts.push({
    geo: cylinder(0.035, 0.035, 0.65, -cabW / 2 + 0.08, bedY + 0.06, cabZ + cabD / 2 + 0.08),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.035, 0.035, 0.65, cabW / 2 - 0.08, bedY + 0.06, cabZ + cabD / 2 + 0.08),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.03, 0.03, cabW - 0.16, 0, bedY + 0.68, cabZ + cabD / 2 + 0.08, 0, 0, Math.PI / 2),
    mat: mats.chrome
  })

  // Rieles en el techo
  parts.push({
    geo: box(0.04, 0.04, cabD * 0.7, -cabW * 0.38, cabY + cabH + 0.02, cabZ),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(0.04, 0.04, cabD * 0.7, cabW * 0.38, cabY + cabH + 0.02, cabZ),
    mat: mats.darkPlastic
  })

  // Espejos retrovisores
  parts.push({
    geo: box(0.18, 0.12, 0.14, -w / 2 - 0.06, 0.98, -0.65),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(0.18, 0.12, 0.14, w / 2 + 0.06, 0.98, -0.65),
    mat: mats.carPaint
  })

  return assembleParts(parts)
}

function buildTruck(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tireR = 0.44
  const tireW = 0.28
  const rimR = 0.28
  const axleY = tireR
  const frontZ = -d / 2 + 1.1
  const rearZ1 = d / 2 - 1.6
  const rearZ2 = d / 2 - 0.9

  // 6 Ruedas: 2 delanteras + 4 traseras dobles
  createWheelAssembly(tireR, tireW, rimR, -w / 2, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, w / 2, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, -w / 2, axleY, rearZ1, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, w / 2, axleY, rearZ1, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, -w / 2, axleY, rearZ2, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, w / 2, axleY, rearZ2, mats, parts)

  // Chasis de vigas de acero negro
  parts.push({
    geo: box(w * 0.6, 0.22, d * 0.95, 0, 0.32, 0),
    mat: mats.darkPlastic
  })
  // Tanque de combustible cilíndrico en el chasis
  parts.push({
    geo: cylinder(0.24, 0.24, 1.2, -w * 0.42, 0.28, -0.2, 0, 0, Math.PI / 2),
    mat: mats.chrome
  })

  // Cabina del camión (frontal pintada)
  const cabD = 1.9
  const cabZ = -d / 2 + cabD / 2 + 0.1
  const cabH = h * 0.8
  parts.push({
    geo: box(w, cabH * 0.5, cabD, 0, 0.42, cabZ),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(w * 0.94, cabH * 0.5, cabD * 0.88, 0, 0.42 + cabH * 0.5, cabZ),
    mat: mats.carGlass
  })
  // Techo de cabina
  parts.push({
    geo: box(w, 0.08, cabD * 0.88, 0, 0.42 + cabH, cabZ),
    mat: mats.carPaint
  })
  // Parabrisas panorámico, faros y parrilla
  parts.push({
    geo: box(w * 0.7, 0.32, 0.06, 0, 0.58, -d / 2 + 0.08),
    mat: mats.chrome
  })
  parts.push({
    geo: box(w * 0.98, 0.24, 0.22, 0, 0.3, -d / 2 + 0.12),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(0.32, 0.16, 0.06, -w * 0.35, 0.52, -d / 2 + 0.1),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.32, 0.16, 0.06, w * 0.35, 0.52, -d / 2 + 0.1),
    mat: mats.headlight
  })

  // Caja de carga trasera metálica acanalada
  const boxD = d - cabD - 0.4
  const boxZ = d / 2 - boxD / 2
  parts.push({
    geo: box(w + 0.1, h, boxD, 0, 0.5, boxZ),
    mat: mats.stainlessSteel
  })
  // Puertas traseras y barras de cierre
  parts.push({
    geo: box(w + 0.08, h * 0.95, 0.04, 0, 0.52, d / 2 + 0.01),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: cylinder(0.015, 0.015, h * 0.9, -0.2, 0.52, d / 2 + 0.03),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.015, 0.015, h * 0.9, 0.2, 0.52, d / 2 + 0.03),
    mat: mats.chrome
  })

  return assembleParts(parts)
}

function buildBus(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tireR = 0.46
  const tireW = 0.3
  const rimR = 0.3
  const axleY = tireR
  const frontZ = -d * 0.34
  const rearZ = d * 0.3

  // 6 Ruedas de autobús
  createWheelAssembly(tireR, tireW, rimR, -w / 2 + 0.05, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, w / 2 - 0.05, axleY, frontZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, -w / 2 + 0.05, axleY, rearZ, mats, parts)
  createWheelAssembly(tireR, tireW, rimR, w / 2 - 0.05, axleY, rearZ, mats, parts)

  // Zócalo inferior
  parts.push({
    geo: box(w, 0.45, d, 0, 0.2, 0),
    mat: mats.darkPlastic
  })

  // Carrocería principal de autobús (Pintura corporativa)
  parts.push({
    geo: box(w, h * 0.35, d, 0, 0.65, 0),
    mat: mats.carPaint
  })
  // Franja corporativa lateral decorativa
  parts.push({
    geo: box(w + 0.02, 0.16, d * 0.98, 0, 0.85, 0),
    mat: mats.rimAlloy
  })

  // Ventanales laterales y parabrisas panorámicos
  parts.push({
    geo: box(w * 0.98, h * 0.42, d * 0.94, 0, 0.65 + h * 0.35, 0),
    mat: mats.carGlass
  })
  // Techo aerodinámico con unidades de aire acondicionado
  parts.push({
    geo: box(w, 0.12, d, 0, h - 0.12, 0),
    mat: mats.carPaint
  })
  parts.push({
    geo: box(w * 0.65, 0.22, 2.2, 0, h, -1.5),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(w * 0.65, 0.22, 2.2, 0, h, 2.0),
    mat: mats.darkPlastic
  })

  // Luces delanteras y traseras
  parts.push({
    geo: box(0.35, 0.14, 0.05, -w * 0.35, 0.45, -d / 2 - 0.01),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.35, 0.14, 0.05, w * 0.35, 0.45, -d / 2 - 0.01),
    mat: mats.headlight
  })
  parts.push({
    geo: box(0.25, 0.45, 0.05, -w * 0.38, 0.8, d / 2 + 0.01),
    mat: mats.taillight
  })
  parts.push({
    geo: box(0.25, 0.45, 0.05, w * 0.38, 0.8, d / 2 + 0.01),
    mat: mats.taillight
  })

  return assembleParts(parts)
}

function buildMotorcycle(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tireR = 0.31
  const tubeR = 0.065
  const frontZ = -d / 2 + 0.35
  const rearZ = d / 2 - 0.35

  // Ruedas con llanta toroide y rines
  parts.push({
    geo: torus(tireR, tubeR, 0, tireR + 0.02, frontZ, 0, Math.PI / 2, 0),
    mat: mats.tireRubber
  })
  parts.push({
    geo: cylinder(tireR * 0.75, tireR * 0.75, 0.08, 0, 0.08, frontZ, 0, 0, Math.PI / 2),
    mat: mats.rimAlloy
  })

  parts.push({
    geo: torus(tireR, tubeR, 0, tireR + 0.02, rearZ, 0, Math.PI / 2, 0),
    mat: mats.tireRubber
  })
  parts.push({
    geo: cylinder(tireR * 0.75, tireR * 0.75, 0.12, 0, 0.08, rearZ, 0, 0, Math.PI / 2),
    mat: mats.rimAlloy
  })

  // Horquilla delantera cromada inclinada
  parts.push({
    geo: cylinder(0.025, 0.025, 0.75, -0.06, 0.3, frontZ + 0.12, -0.35, 0, 0),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.025, 0.025, 0.75, 0.06, 0.3, frontZ + 0.12, -0.35, 0, 0),
    mat: mats.chrome
  })

  // Manillar con puños
  parts.push({
    geo: cylinder(0.015, 0.015, w * 0.9, 0, h * 0.82, frontZ + 0.32, 0, 0, Math.PI / 2),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.022, 0.022, 0.12, -w * 0.38, h * 0.82, frontZ + 0.32, 0, 0, Math.PI / 2),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: cylinder(0.022, 0.022, 0.12, w * 0.38, h * 0.82, frontZ + 0.32, 0, 0, Math.PI / 2),
    mat: mats.darkPlastic
  })
  // Faro delantero
  parts.push({
    geo: sphere(0.09, 0, h * 0.75, frontZ + 0.22),
    mat: mats.headlight
  })

  // Tanque de gasolina curvo pintado
  parts.push({
    geo: box(0.28, 0.24, 0.55, 0, 0.65, -0.1),
    mat: mats.carPaint
  })

  // Asiento ergonómico negro
  parts.push({
    geo: box(0.24, 0.12, 0.58, 0, 0.62, 0.32),
    mat: mats.darkPlastic
  })

  // Motor metálico y tubo de escape cromado
  parts.push({
    geo: box(0.28, 0.34, 0.45, 0, 0.26, 0),
    mat: mats.stainlessSteel
  })
  parts.push({
    geo: cylinder(0.035, 0.035, 0.95, 0.15, 0.22, 0.2, 0.2, 0, 0),
    mat: mats.chrome
  })
  // Luz trasera
  parts.push({
    geo: box(0.12, 0.06, 0.04, 0, 0.72, rearZ + 0.1),
    mat: mats.taillight
  })

  return assembleParts(parts)
}

function buildBicycle(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tireR = 0.32
  const frontZ = -d / 2 + 0.35
  const rearZ = d / 2 - 0.35

  // Ruedas delgadas
  parts.push({
    geo: torus(tireR, 0.025, 0, tireR + 0.02, frontZ, 0, Math.PI / 2, 0),
    mat: mats.tireRubber
  })
  parts.push({
    geo: torus(tireR, 0.025, 0, tireR + 0.02, rearZ, 0, Math.PI / 2, 0),
    mat: mats.tireRubber
  })

  // Cuadro / Tubos pintados
  parts.push({
    geo: cylinder(0.016, 0.016, 0.58, 0, 0.32, 0, 0.6, 0, 0),
    mat: mats.carPaint
  })
  parts.push({
    geo: cylinder(0.016, 0.016, 0.54, 0, 0.35, 0.15, -0.3, 0, 0),
    mat: mats.carPaint
  })
  parts.push({
    geo: cylinder(0.016, 0.016, 0.55, 0, 0.62, 0, 0, 0, 0),
    mat: mats.carPaint
  })

  // Manubrio y sillín
  parts.push({
    geo: cylinder(0.014, 0.014, w * 0.85, 0, h - 0.06, frontZ + 0.2, 0, 0, Math.PI / 2),
    mat: mats.chrome
  })
  parts.push({
    geo: box(0.16, 0.06, 0.26, 0, h * 0.75, 0.1),
    mat: mats.darkPlastic
  })

  return assembleParts(parts)
}

/* ===================================================================
 * 3. MOBILIARIO INTERIOR, COCINA, BAÑO Y ENTORNO
 * =================================================================== */

function buildSofaPiece(
  w: number,
  h: number,
  d: number,
  cushionCount: number,
  mats: CadMaterialLibrary
): CadBlock3DResult {
  const parts: CadPart[] = []
  const legH = 0.09
  const legR = 0.025
  const armW = 0.16
  const backD = 0.22
  const seatH = 0.44

  // 1. Patas de madera oscura / metal negro
  parts.push({ geo: cylinder(legR, legR * 0.7, legH, -w / 2 + 0.08, 0, -d / 2 + 0.08), mat: mats.woodDark })
  parts.push({ geo: cylinder(legR, legR * 0.7, legH, w / 2 - 0.08, 0, -d / 2 + 0.08), mat: mats.woodDark })
  parts.push({ geo: cylinder(legR, legR * 0.7, legH, -w / 2 + 0.08, 0, d / 2 - 0.08), mat: mats.woodDark })
  parts.push({ geo: cylinder(legR, legR * 0.7, legH, w / 2 - 0.08, 0, d / 2 - 0.08), mat: mats.woodDark })

  // 2. Base tapizada
  parts.push({
    geo: box(w, 0.16, d, 0, legH, 0),
    mat: mats.fabric
  })

  // 3. Respaldo acolchado
  const innerW = w - armW * 2
  parts.push({
    geo: box(innerW, h - legH - 0.16, backD, 0, legH + 0.16, -d / 2 + backD / 2),
    mat: mats.fabric
  })

  // 4. Brazos tapizados confortables
  parts.push({
    geo: box(armW, h * 0.68, d, -w / 2 + armW / 2, legH + 0.05, 0),
    mat: mats.fabric
  })
  parts.push({
    geo: box(armW, h * 0.68, d, w / 2 - armW / 2, legH + 0.05, 0),
    mat: mats.fabric
  })

  // 5. Cojines individuales de asiento
  const cW = innerW / cushionCount
  const cD = d - backD - 0.04
  for (let i = 0; i < cushionCount; i++) {
    const cx = -innerW / 2 + cW * (i + 0.5)
    parts.push({
      geo: box(cW - 0.03, 0.16, cD, cx, seatH - 0.06, 0.06),
      mat: mats.fabric
    })
  }

  // 6. Cojines decorativos de acento en las esquinas
  if (cushionCount >= 2) {
    parts.push({
      geo: box(0.36, 0.36, 0.12, -innerW / 2 + 0.16, seatH + 0.06, -d / 2 + backD + 0.1, 0.2, 0.2, 0),
      mat: mats.fabricAccent
    })
    parts.push({
      geo: box(0.36, 0.36, 0.12, innerW / 2 - 0.16, seatH + 0.06, -d / 2 + backD + 0.1, 0.2, -0.2, 0),
      mat: mats.fabricAccent
    })
  }

  return assembleParts(parts)
}

function buildSofaL(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const legH = 0.08
  const chaiseW = w * 0.42
  const mainD = d * 0.52

  // Base y patas
  parts.push({ geo: box(w, 0.2, mainD, 0, legH, -d / 2 + mainD / 2), mat: mats.fabric })
  parts.push({ geo: box(chaiseW, 0.2, d - mainD, -w / 2 + chaiseW / 2, legH, mainD / 2), mat: mats.fabric })

  // Cojines asiento
  parts.push({ geo: box(w * 0.54, 0.16, mainD - 0.18, w * 0.2, 0.38, -d / 2 + mainD / 2 + 0.06), mat: mats.fabric })
  parts.push({ geo: box(chaiseW - 0.04, 0.16, d - 0.2, -w / 2 + chaiseW / 2, 0.38, 0.08), mat: mats.fabric })

  // Respaldos
  parts.push({ geo: box(w, h - 0.38, 0.2, 0, 0.38, -d / 2 + 0.1), mat: mats.fabric })
  parts.push({ geo: box(0.2, h - 0.38, d - mainD, -w / 2 + 0.1, 0.38, mainD / 2), mat: mats.fabric })

  // Cojines de contraste
  parts.push({ geo: box(0.35, 0.35, 0.12, w / 2 - 0.22, 0.5, -d / 2 + 0.28, 0.1, -0.2, 0), mat: mats.fabricAccent })
  parts.push({ geo: box(0.35, 0.35, 0.12, -w / 2 + chaiseW * 0.5, 0.5, -d / 2 + 0.28, 0.1, 0.2, 0), mat: mats.pillow })

  return assembleParts(parts)
}

function buildTvUnit(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const consoleH = 0.48
  const legH = 0.12

  // Patas de metal
  parts.push({ geo: cylinder(0.02, 0.015, legH, -w / 2 + 0.1, 0, -d / 2 + 0.08), mat: mats.darkPlastic })
  parts.push({ geo: cylinder(0.02, 0.015, legH, w / 2 - 0.1, 0, -d / 2 + 0.08), mat: mats.darkPlastic })
  parts.push({ geo: cylinder(0.02, 0.015, legH, -w / 2 + 0.1, 0, d / 2 - 0.08), mat: mats.darkPlastic })
  parts.push({ geo: cylinder(0.02, 0.015, legH, w / 2 - 0.1, 0, d / 2 - 0.08), mat: mats.darkPlastic })

  // Consola baja de madera nogal con puertas
  parts.push({
    geo: box(w, consoleH, d, 0, legH, 0),
    mat: mats.woodFine
  })
  // Tiradores metálicos
  parts.push({
    geo: box(0.08, 0.02, 0.03, -w * 0.25, legH + consoleH * 0.5, d / 2 + 0.01),
    mat: mats.chrome
  })
  parts.push({
    geo: box(0.08, 0.02, 0.03, w * 0.25, legH + consoleH * 0.5, d / 2 + 0.01),
    mat: mats.chrome
  })

  // Televisor plano OLED
  const tvW = w * 0.78
  const tvH = h * 0.54
  const tvY = legH + consoleH + 0.02
  parts.push({ geo: box(0.42, 0.02, 0.24, 0, tvY, 0), mat: mats.chrome })
  parts.push({ geo: box(0.08, 0.08, 0.04, 0, tvY + 0.02, 0), mat: mats.chrome })
  parts.push({ geo: box(tvW, tvH, 0.04, 0, tvY + 0.1, 0), mat: mats.tvScreen })

  return assembleParts(parts)
}

function buildPiano(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const bodyH = 0.45
  const legH = 0.72

  // Patas con ruedas cromadas
  parts.push({ geo: cylinder(0.05, 0.03, legH, -w / 2 + 0.16, 0, -d / 2 + 0.16), mat: mats.pianoBody })
  parts.push({ geo: cylinder(0.05, 0.03, legH, w / 2 - 0.16, 0, -d / 2 + 0.16), mat: mats.pianoBody })
  parts.push({ geo: cylinder(0.05, 0.03, legH, 0, 0, d / 2 - 0.2), mat: mats.pianoBody })

  // Cuerpo negro brillante lacado
  parts.push({
    geo: box(w, bodyH, d * 0.85, 0, legH, -0.05),
    mat: mats.pianoBody
  })
  parts.push({
    geo: box(w * 0.95, 0.04, d * 0.78, 0, legH + bodyH, -0.05),
    mat: mats.pianoBody
  })

  // Teclado (Base, teclas blancas y negras)
  const keyY = legH + 0.02
  const keyZ = d / 2 - 0.14
  parts.push({
    geo: box(w - 0.22, 0.04, 0.16, 0, keyY, keyZ),
    mat: mats.pianoKeyWhite
  })
  parts.push({
    geo: box(w - 0.32, 0.06, 0.1, 0, keyY + 0.02, keyZ - 0.02),
    mat: mats.pianoKeyBlack
  })

  // Banco acolchado
  parts.push({
    geo: box(0.65, 0.45, 0.32, 0, 0, d / 2 + 0.35),
    mat: mats.woodDark
  })
  parts.push({
    geo: box(0.63, 0.08, 0.3, 0, 0.45, d / 2 + 0.35),
    mat: mats.fabricDark
  })

  return assembleParts(parts)
}

function buildBedPiece(
  w: number,
  h: number,
  d: number,
  pillowCount: number,
  mats: CadMaterialLibrary
): CadBlock3DResult {
  const parts: CadPart[] = []
  const baseH = 0.26
  const mattrH = 0.22
  const headboardH = h
  const bedW = pillowCount === 1 ? w * 0.68 : w * 0.72

  // 1. Somier y estructura de madera nogal/roble
  parts.push({
    geo: box(bedW, baseH, d, 0, 0, 0),
    mat: mats.woodFine
  })

  // 2. Cabecero alto de madera
  parts.push({
    geo: box(bedW, headboardH, 0.1, 0, 0, -d / 2 + 0.05),
    mat: mats.woodFine
  })

  // 3. Colchón blanco grueso
  parts.push({
    geo: box(bedW - 0.04, mattrH, d - 0.12, 0, baseH, 0.04),
    mat: mats.mattress
  })

  // 4. Edredón / cobija en tonos elegantes cubriendo dos tercios
  const duvetD = d * 0.66
  parts.push({
    geo: box(bedW, mattrH + 0.04, duvetD, 0, baseH + 0.02, d / 2 - duvetD / 2),
    mat: mats.duvet
  })

  // 5. Almohadas mullidas
  const pillowW = (bedW - 0.18) / Math.max(1, pillowCount)
  for (let i = 0; i < pillowCount; i++) {
    const px = -bedW / 2 + 0.09 + pillowW * (i + 0.5)
    parts.push({
      geo: box(pillowW - 0.04, 0.12, 0.38, px, baseH + mattrH, -d / 2 + 0.3),
      mat: mats.pillow
    })
  }

  // 6. Mesitas de noche / burós laterales
  const nightstandW = (w - bedW) / 2 - 0.05
  if (nightstandW > 0.3) {
    parts.push({
      geo: box(nightstandW, 0.5, 0.42, -w / 2 + nightstandW / 2, 0, -d / 2 + 0.25),
      mat: mats.woodOak
    })
    parts.push({
      geo: cylinder(0.08, 0.1, 0.25, -w / 2 + nightstandW / 2, 0.5, -d / 2 + 0.25),
      mat: mats.ceramic
    })

    parts.push({
      geo: box(nightstandW, 0.5, 0.42, w / 2 - nightstandW / 2, 0, -d / 2 + 0.25),
      mat: mats.woodOak
    })
    parts.push({
      geo: cylinder(0.08, 0.1, 0.25, w / 2 - nightstandW / 2, 0.5, -d / 2 + 0.25),
      mat: mats.ceramic
    })
  }

  return assembleParts(parts)
}

function buildBedBunk(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const postW = 0.08

  // 4 Postes esquineros de madera
  parts.push({ geo: box(postW, h, postW, -w / 2 + postW / 2, 0, -d / 2 + postW / 2), mat: mats.woodOak })
  parts.push({ geo: box(postW, h, postW, w / 2 - postW / 2, 0, -d / 2 + postW / 2), mat: mats.woodOak })
  parts.push({ geo: box(postW, h, postW, -w / 2 + postW / 2, 0, d / 2 - postW / 2), mat: mats.woodOak })
  parts.push({ geo: box(postW, h, postW, w / 2 - postW / 2, 0, d / 2 - postW / 2), mat: mats.woodOak })

  // Cama inferior
  parts.push({ geo: box(w - 0.1, 0.18, d - 0.1, 0, 0.25, 0), mat: mats.mattress })
  parts.push({ geo: box(w - 0.1, 0.2, d * 0.65, 0, 0.26, d * 0.15), mat: mats.duvet })
  parts.push({ geo: box(w * 0.6, 0.12, 0.35, 0, 0.44, -d / 2 + 0.3), mat: mats.pillow })

  // Cama superior
  const topY = h * 0.62
  parts.push({ geo: box(w - 0.1, 0.18, d - 0.1, 0, topY, 0), mat: mats.mattress })
  parts.push({ geo: box(w - 0.1, 0.2, d * 0.65, 0, topY + 0.01, d * 0.15), mat: mats.duvet })
  parts.push({ geo: box(w * 0.6, 0.12, 0.35, 0, topY + 0.19, -d / 2 + 0.3), mat: mats.pillow })
  parts.push({ geo: box(w * 0.7, 0.25, 0.04, w * 0.1, topY + 0.15, d / 2 - 0.02), mat: mats.woodOak })

  return assembleParts(parts)
}

function buildDiningSet(
  w: number,
  h: number,
  d: number,
  chairCount: number,
  isRound: boolean,
  mats: CadMaterialLibrary
): CadBlock3DResult {
  const parts: CadPart[] = []
  const topY = 0.74

  if (isRound) {
    const r = Math.min(w, d) * 0.36
    // Mesa redonda
    parts.push({ geo: cylinder(r, r, 0.04, 0, topY, 0, 0, 0, 0, 24), mat: mats.woodFine })
    parts.push({ geo: cylinder(0.08, 0.14, topY, 0, 0, 0, 0, 0, 0, 16), mat: mats.woodDark })
    parts.push({ geo: cylinder(r * 0.65, r * 0.65, 0.03, 0, 0, 0, 0, 0, 0, 24), mat: mats.woodDark })

    // Sillas distribuidas circularmente
    for (let i = 0; i < chairCount; i++) {
      const a = (i * 2 * Math.PI) / chairCount
      const dist = r + 0.3
      const cx = Math.cos(a) * dist
      const cz = Math.sin(a) * dist
      parts.push({ geo: cylinder(0.02, 0.015, 0.45, cx, 0, cz), mat: mats.woodDark })
      parts.push({ geo: box(0.42, 0.06, 0.42, cx, 0.45, cz), mat: mats.fabricAccent })
      parts.push({ geo: box(0.42, 0.4, 0.04, cx, 0.51, cz + (cz >= 0 ? 0.18 : -0.18)), mat: mats.fabricAccent })
    }
  } else {
    // Mesa rectangular
    const tableW = w * 0.82
    const tableD = d * 0.68
    parts.push({ geo: box(tableW, 0.05, tableD, 0, topY, 0), mat: mats.woodFine })
    parts.push({ geo: cylinder(0.035, 0.025, topY, -tableW / 2 + 0.1, 0, -tableD / 2 + 0.1), mat: mats.woodDark })
    parts.push({ geo: cylinder(0.035, 0.025, topY, tableW / 2 - 0.1, 0, -tableD / 2 + 0.1), mat: mats.woodDark })
    parts.push({ geo: cylinder(0.035, 0.025, topY, -tableW / 2 + 0.1, 0, tableD / 2 - 0.1), mat: mats.woodDark })
    parts.push({ geo: cylinder(0.035, 0.025, topY, tableW / 2 - 0.1, 0, tableD / 2 - 0.1), mat: mats.woodDark })

    // Sillas enfrentadas
    const half = Math.floor(chairCount / 2)
    const step = tableW / (half + 1)
    for (let i = 1; i <= half; i++) {
      const cx = -tableW / 2 + i * step
      // Silla lado A
      parts.push({ geo: box(0.42, 0.05, 0.4, cx, 0.45, -d / 2 + 0.22), mat: mats.fabricAccent })
      parts.push({ geo: box(0.42, 0.42, 0.04, cx, 0.5, -d / 2 + 0.04), mat: mats.fabricAccent })
      parts.push({ geo: cylinder(0.02, 0.015, 0.45, cx - 0.18, 0, -d / 2 + 0.1), mat: mats.woodDark })
      parts.push({ geo: cylinder(0.02, 0.015, 0.45, cx + 0.18, 0, -d / 2 + 0.1), mat: mats.woodDark })

      // Silla lado B
      parts.push({ geo: box(0.42, 0.05, 0.4, cx, 0.45, d / 2 - 0.22), mat: mats.fabricAccent })
      parts.push({ geo: box(0.42, 0.42, 0.04, cx, 0.5, d / 2 - 0.04), mat: mats.fabricAccent })
      parts.push({ geo: cylinder(0.02, 0.015, 0.45, cx - 0.18, 0, d / 2 - 0.1), mat: mats.woodDark })
      parts.push({ geo: cylinder(0.02, 0.015, 0.45, cx + 0.18, 0, d / 2 - 0.1), mat: mats.woodDark })
    }
  }

  return assembleParts(parts)
}

function buildDeskPc(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const topY = 0.73

  // Tablero de escritorio y laterales
  parts.push({ geo: box(w, 0.04, d * 0.75, 0, topY, -d * 0.1), mat: mats.woodOak })
  parts.push({ geo: box(0.04, topY, d * 0.7, -w / 2 + 0.04, 0, -d * 0.1), mat: mats.darkPlastic })
  parts.push({ geo: box(0.38, topY - 0.08, d * 0.65, w / 2 - 0.22, 0, -d * 0.1), mat: mats.woodFine })

  // Monitor panorámico encendido
  parts.push({ geo: box(0.68, 0.38, 0.04, -0.05, topY + 0.12, -d * 0.25), mat: mats.tvScreen })
  parts.push({ geo: cylinder(0.02, 0.02, 0.12, -0.05, topY + 0.04, -d * 0.25), mat: mats.chrome })
  parts.push({ geo: box(0.24, 0.02, 0.18, -0.05, topY + 0.04, -d * 0.25), mat: mats.chrome })

  // Teclado y mouse
  parts.push({ geo: box(0.44, 0.015, 0.14, -0.05, topY + 0.04, 0.02), mat: mats.darkPlastic })
  parts.push({ geo: box(0.08, 0.018, 0.12, 0.26, topY + 0.04, 0.02), mat: mats.darkPlastic })

  // Silla de oficina ergonómica
  const chairZ = d * 0.25
  parts.push({ geo: cylinder(0.28, 0.28, 0.05, 0, 0.08, chairZ, 0, 0, 0, 5), mat: mats.darkPlastic })
  parts.push({ geo: cylinder(0.025, 0.025, 0.36, 0, 0.08, chairZ), mat: mats.chrome })
  parts.push({ geo: box(0.48, 0.08, 0.46, 0, 0.44, chairZ), mat: mats.fabricDark })
  parts.push({ geo: box(0.45, 0.48, 0.06, 0, 0.52, chairZ + 0.2), mat: mats.fabricDark })

  return assembleParts(parts)
}

function buildToilet(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const tankD = 0.24

  // Tanque de agua cerámico blanco
  parts.push({
    geo: box(w, h, tankD, 0, 0, -d / 2 + tankD / 2),
    mat: mats.ceramic
  })
  // Pulsador de descarga doble cromado
  parts.push({
    geo: cylinder(0.03, 0.03, 0.02, 0, h, -d / 2 + tankD / 2),
    mat: mats.chrome
  })
  // Taza ovalada y pie
  parts.push({
    geo: cylinder(w * 0.42, w * 0.36, 0.4, 0, 0, 0.12, 0, 0, 0, 20),
    mat: mats.ceramic
  })
  // Asiento / tapa de inodoro
  parts.push({
    geo: box(w * 0.88, 0.04, d * 0.55, 0, 0.4, 0.14),
    mat: mats.ceramic
  })

  return assembleParts(parts)
}

function buildPedestalSink(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Pedestal cerámico
  parts.push({
    geo: cylinder(0.12, 0.16, h - 0.22, 0, 0, 0),
    mat: mats.ceramic
  })
  // Poza de lavamanos
  parts.push({
    geo: box(w, 0.22, d, 0, h - 0.22, 0),
    mat: mats.ceramic
  })
  // Grifo cisne y manijas cromadas
  parts.push({
    geo: cylinder(0.018, 0.018, 0.16, 0, h, -d / 2 + 0.08),
    mat: mats.chrome
  })
  parts.push({
    geo: box(0.08, 0.02, 0.02, 0, h + 0.12, -d / 2 + 0.08),
    mat: mats.chrome
  })

  return assembleParts(parts)
}

function buildShower(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Plato de ducha blanco antideslizante
  parts.push({
    geo: box(w, 0.08, d, 0, 0, 0),
    mat: mats.ceramic
  })
  // Mamparas de vidrio templado transparente
  parts.push({
    geo: box(w - 0.02, h - 0.08, 0.015, 0, 0.08, d / 2 - 0.02),
    mat: mats.glassClear
  })
  parts.push({
    geo: box(0.015, h - 0.08, d - 0.02, w / 2 - 0.02, 0.08, 0),
    mat: mats.glassClear
  })
  // Perfiles cromados de mampara
  parts.push({
    geo: box(0.04, h - 0.08, 0.04, w / 2 - 0.02, 0.08, d / 2 - 0.02),
    mat: mats.chrome
  })
  // Rociador de ducha superior y monomando
  parts.push({
    geo: cylinder(0.1, 0.1, 0.03, 0, h * 0.9, -d / 2 + 0.2),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.03, 0.03, 0.08, 0, 1.1, -d / 2 + 0.04, Math.PI / 2, 0, 0),
    mat: mats.chrome
  })

  return assembleParts(parts)
}

function buildBathtub(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Tina exterior cerámica blanca esmaltada
  parts.push({
    geo: box(w, h, d, 0, 0, 0),
    mat: mats.ceramic
  })
  // Borde ergonómico superior
  parts.push({
    geo: box(w + 0.06, 0.05, d + 0.06, 0, h - 0.05, 0),
    mat: mats.ceramic
  })
  // Grifo monomando y rebosadero
  parts.push({
    geo: cylinder(0.02, 0.02, 0.15, 0, h, -d / 2 + 0.08),
    mat: mats.chrome
  })

  return assembleParts(parts)
}

function buildFridge(w: number, h: number, d: number, isDouble: boolean, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Cuerpo del frigorífico en acero inoxidable
  parts.push({
    geo: box(w, h, d, 0, 0, 0),
    mat: mats.stainlessSteel
  })

  if (isDouble) {
    // Frigorífico americano Side-by-Side
    const doorW = w * 0.48
    parts.push({
      geo: box(doorW, h * 0.97, 0.04, -w * 0.25, 0.02, d / 2 + 0.02),
      mat: mats.stainlessSteel
    })
    parts.push({
      geo: box(doorW, h * 0.97, 0.04, w * 0.25, 0.02, d / 2 + 0.02),
      mat: mats.stainlessSteel
    })
    // Tiradores alargados de acero
    parts.push({ geo: cylinder(0.015, 0.015, 0.65, -0.06, h * 0.45, d / 2 + 0.06), mat: mats.chrome })
    parts.push({ geo: cylinder(0.015, 0.015, 0.65, 0.06, h * 0.45, d / 2 + 0.06), mat: mats.chrome })
    // Dispensador de agua/hielo
    parts.push({ geo: box(0.24, 0.32, 0.02, -w * 0.25, h * 0.58, d / 2 + 0.04), mat: mats.darkPlastic })
  } else {
    // Nevera de 1 puerta
    parts.push({
      geo: box(w * 0.98, h * 0.97, 0.04, 0, 0.02, d / 2 + 0.02),
      mat: mats.stainlessSteel
    })
    parts.push({ geo: cylinder(0.018, 0.018, 0.5, w / 2 - 0.08, h * 0.5, d / 2 + 0.06), mat: mats.chrome })
  }

  return assembleParts(parts)
}

function buildStove(w: number, h: number, d: number, burnerCount: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Estructura en acero inoxidable
  parts.push({
    geo: box(w, h, d, 0, 0, 0),
    mat: mats.stainlessSteel
  })

  // Puerta de horno con ventanilla de cristal oscuro y manija
  parts.push({
    geo: box(w * 0.82, 0.42, 0.02, 0, 0.16, d / 2 + 0.01),
    mat: mats.darkPlastic
  })
  parts.push({
    geo: box(w * 0.65, 0.025, 0.04, 0, 0.52, d / 2 + 0.04),
    mat: mats.chrome
  })

  // Quemadores superiores en hierro negro
  const rows = 2
  const cols = burnerCount / rows
  const stepX = (w * 0.65) / Math.max(1, cols - 1)
  const stepZ = (d * 0.5) / Math.max(1, rows - 1)
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const bx = cols === 1 ? 0 : -w * 0.325 + c * stepX
      const bz = rows === 1 ? 0 : -d * 0.25 + r * stepZ
      parts.push({
        geo: cylinder(0.08, 0.08, 0.02, bx, h, bz),
        mat: mats.blackMetal
      })
    }
  }

  return assembleParts(parts)
}

function buildKitchenSink(w: number, h: number, d: number, bowls: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Mueble bajo
  parts.push({
    geo: box(w, h - 0.05, d, 0, 0, 0),
    mat: mats.woodFine
  })

  // Encimera y pozas de fregadero en acero inoxidable
  parts.push({
    geo: box(w + 0.02, 0.05, d + 0.02, 0, h - 0.05, 0),
    mat: mats.stainlessSteel
  })

  // Grifo monomando de cuello alto
  parts.push({
    geo: cylinder(0.018, 0.018, 0.28, 0, h, -d / 2 + 0.1),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(0.016, 0.016, 0.14, 0, h + 0.26, -d / 2 + 0.16, Math.PI / 4, 0, 0),
    mat: mats.chrome
  })

  return assembleParts(parts)
}

function buildWasherDryer(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Gabinete electrodoméstico blanco / acero
  parts.push({
    geo: box(w, h, d, 0, 0, 0),
    mat: mats.stainlessSteel
  })

  // Ojo de buey / puerta circular de cristal con aro cromado
  const doorR = w * 0.34
  parts.push({
    geo: torus(doorR, 0.035, 0, h * 0.46, d / 2 + 0.02),
    mat: mats.chrome
  })
  parts.push({
    geo: cylinder(doorR * 0.9, doorR * 0.9, 0.02, 0, h * 0.46 - doorR * 0.9, d / 2 + 0.01, Math.PI / 2, 0, 0),
    mat: mats.darkPlastic
  })

  // Rueda de programas y cajetín de detergente
  parts.push({
    geo: cylinder(0.04, 0.04, 0.03, w * 0.2, h * 0.88 - 0.04, d / 2 + 0.01, Math.PI / 2, 0, 0),
    mat: mats.chrome
  })

  return assembleParts(parts)
}

function buildTree(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const trunkR = Math.min(w, d) * 0.09
  const trunkH = h * 0.42
  const canopyR = Math.min(w, d) * 0.42

  // 1. Tronco orgánico con conicidad
  parts.push({
    geo: cylinder(trunkR * 0.75, trunkR * 1.15, trunkH, 0, 0, 0, 0, 0, 0, 16),
    mat: mats.bark
  })
  // Ramas principales
  parts.push({
    geo: cylinder(trunkR * 0.5, trunkR * 0.7, trunkH * 0.45, trunkR * 0.5, trunkH * 0.75, 0, 0.35, 0, 0.35),
    mat: mats.bark
  })
  parts.push({
    geo: cylinder(trunkR * 0.5, trunkR * 0.7, trunkH * 0.45, -trunkR * 0.5, trunkH * 0.75, 0, -0.35, 0, -0.35),
    mat: mats.bark
  })

  // 2. Copa orgánica frondosa formada por un racimo de 6 esferas/icosaedros en múltiples tonos de verde
  const cY = trunkH + canopyR * 0.75
  parts.push({ geo: sphere(canopyR, 0, cY, 0, 18, 14), mat: mats.foliage1 })
  parts.push({ geo: sphere(canopyR * 0.78, canopyR * 0.45, cY + canopyR * 0.25, canopyR * 0.2, 16, 12), mat: mats.foliage2 })
  parts.push({ geo: sphere(canopyR * 0.75, -canopyR * 0.45, cY + canopyR * 0.2, -canopyR * 0.25, 16, 12), mat: mats.foliage3 })
  parts.push({ geo: sphere(canopyR * 0.7, canopyR * 0.2, cY - canopyR * 0.25, -canopyR * 0.38, 16, 12), mat: mats.foliage1 })
  parts.push({ geo: sphere(canopyR * 0.72, -canopyR * 0.25, cY - canopyR * 0.2, canopyR * 0.35, 16, 12), mat: mats.foliage2 })
  parts.push({ geo: sphere(canopyR * 0.65, 0, cY + canopyR * 0.5, 0, 14, 10), mat: mats.foliage3 })

  return assembleParts(parts)
}

function buildPalm(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []
  const trunkR = 0.16
  const trunkH = h * 0.82

  // Tronco curvo / anillado de palmera
  parts.push({
    geo: cylinder(trunkR * 0.72, trunkR * 1.1, trunkH, 0.1, 0, 0, 0, 0, -0.04, 16),
    mat: mats.bark
  })

  // Corona de 8 hojas arqueadas verdes en la cima
  const leafCount = 8
  const leafLen = w * 0.48
  for (let i = 0; i < leafCount; i++) {
    const angle = (i * 2 * Math.PI) / leafCount
    const lx = Math.cos(angle) * (leafLen * 0.48) + 0.1
    const lz = Math.sin(angle) * (leafLen * 0.48)
    const folMat = i % 2 === 0 ? mats.foliage1 : mats.foliage3
    parts.push({
      geo: box(0.18, 0.04, leafLen, lx, trunkH - 0.08, lz, 0.4, angle, 0),
      mat: folMat
    })
  }
  // Cogollo superior
  parts.push({
    geo: sphere(0.32, 0.1, trunkH + 0.1, 0),
    mat: mats.foliage2
  })

  return assembleParts(parts)
}

function buildPotPlant(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Maceta de terracota cónica
  parts.push({
    geo: cylinder(w * 0.42, w * 0.3, 0.45, 0, 0, 0, 0, 0, 0, 16),
    mat: mats.potClay
  })
  // Planta de interior frondosa
  parts.push({
    geo: sphere(w * 0.45, 0, 0.68, 0),
    mat: mats.foliage1
  })
  parts.push({
    geo: sphere(w * 0.36, 0.08, 0.95, -0.06),
    mat: mats.foliage3
  })

  return assembleParts(parts)
}

function buildHumanScale(w: number, h: number, d: number, mats: CadMaterialLibrary): CadBlock3DResult {
  const parts: CadPart[] = []

  // Zapatos
  parts.push({ geo: box(0.1, 0.06, 0.22, -0.11, 0, 0.02), mat: mats.humanShoes })
  parts.push({ geo: box(0.1, 0.06, 0.22, 0.11, 0, 0.02), mat: mats.humanShoes })

  // Pantalones (2 Piernas)
  parts.push({ geo: cylinder(0.065, 0.055, 0.8, -0.11, 0.06, 0, 0, 0, 0, 12), mat: mats.humanPants })
  parts.push({ geo: cylinder(0.065, 0.055, 0.8, 0.11, 0.06, 0, 0, 0, 0, 12), mat: mats.humanPants })

  // Camisa / Torso
  parts.push({ geo: box(0.42, 0.54, 0.22, 0, 0.86, 0), mat: mats.humanShirt })

  // Brazos y manos
  parts.push({ geo: cylinder(0.045, 0.04, 0.48, -0.25, 0.9, 0, 0, 0, 0, 12), mat: mats.humanShirt })
  parts.push({ geo: cylinder(0.045, 0.04, 0.48, 0.25, 0.9, 0, 0, 0, 0, 12), mat: mats.humanShirt })
  parts.push({ geo: sphere(0.04, -0.25, 0.86, 0), mat: mats.humanSkin })
  parts.push({ geo: sphere(0.04, 0.25, 0.86, 0), mat: mats.humanSkin })

  // Cabeza y cuello
  parts.push({ geo: cylinder(0.05, 0.05, 0.1, 0, 1.4, 0), mat: mats.humanSkin })
  parts.push({ geo: sphere(0.12, 0, 1.56, 0), mat: mats.humanSkin })
  parts.push({ geo: sphere(0.125, 0, 1.6, -0.02), mat: mats.humanHair })

  return assembleParts(parts)
}

/* ===================================================================
 * 4. ROUTER PRINCIPAL DE GEOMETRÍAS Y MATERIALES (buildCadBlock3D)
 * =================================================================== */

export function buildCadBlock3D(
  shapeId: string,
  size: THREE.Vector3,
  options?: { customColor?: number | string | null; isSelected?: boolean }
): CadBlock3DResult | null {
  const blockDef = getCadBlock(shapeId)
  const blockType = blockDef?.blockType ?? shapeId.replace(/^furn\./, '')
  const w = size.x
  const h = size.y
  const d = size.z
  const mats = createCadMaterialLibrary(options?.customColor)

  switch (blockType) {
    /* 1. 🛋️ Sala y Estar */
    case 'sofa3':
      return buildSofaPiece(w, h, d, 3, mats)
    case 'sofa2':
      return buildSofaPiece(w, h, d, 2, mats)
    case 'armchair':
      return buildSofaPiece(w, h, d, 1, mats)
    case 'sofaL':
      return buildSofaL(w, h, d, mats)
    case 'coffeeRect': {
      const parts: CadPart[] = [
        { geo: box(w, 0.04, d, 0, h - 0.04, 0), mat: mats.woodFine },
        { geo: box(w * 0.88, 0.02, d * 0.88, 0, h * 0.35, 0), mat: mats.woodFine },
        { geo: cylinder(0.025, 0.018, h - 0.04, -w / 2 + 0.08, 0, -d / 2 + 0.08), mat: mats.woodDark },
        { geo: cylinder(0.025, 0.018, h - 0.04, w / 2 - 0.08, 0, -d / 2 + 0.08), mat: mats.woodDark },
        { geo: cylinder(0.025, 0.018, h - 0.04, -w / 2 + 0.08, 0, d / 2 - 0.08), mat: mats.woodDark },
        { geo: cylinder(0.025, 0.018, h - 0.04, w / 2 - 0.08, 0, d / 2 - 0.08), mat: mats.woodDark }
      ]
      return assembleParts(parts)
    }
    case 'coffeeRound': {
      const r = Math.min(w, d) / 2
      const parts: CadPart[] = [
        { geo: cylinder(r, r, 0.04, 0, h - 0.04, 0, 0, 0, 0, 24), mat: mats.woodFine },
        { geo: cylinder(0.04, 0.06, h - 0.04, 0, 0, 0), mat: mats.woodDark },
        { geo: cylinder(r * 0.6, r * 0.6, 0.03, 0, 0, 0, 0, 0, 0, 24), mat: mats.woodDark }
      ]
      return assembleParts(parts)
    }
    case 'tvUnit':
      return buildTvUnit(w, h, d, mats)
    case 'piano':
      return buildPiano(w, h, d, mats)
    case 'carpet': {
      const parts: CadPart[] = [
        { geo: box(w, 0.02, d, 0, 0, 0), mat: mats.fabric },
        { geo: box(w * 0.92, 0.022, d * 0.92, 0, 0, 0), mat: mats.fabricAccent }
      ]
      return assembleParts(parts)
    }
    case 'floorLamp': {
      const parts: CadPart[] = [
        { geo: cylinder(w * 0.45, w * 0.45, 0.03, 0, 0, 0), mat: mats.chrome },
        { geo: cylinder(0.02, 0.02, h - 0.35, 0, 0.03, 0), mat: mats.chrome },
        { geo: cylinder(w * 0.4, w * 0.55, 0.32, 0, h - 0.32, 0), mat: mats.fabricAccent }
      ]
      return assembleParts(parts)
    }

    /* 2. 🍽️ Comedor y Desayunador */
    case 'diningRect4':
      return buildDiningSet(w, h, d, 4, false, mats)
    case 'diningRect6':
      return buildDiningSet(w, h, d, 6, false, mats)
    case 'diningRect8':
      return buildDiningSet(w, h, d, 8, false, mats)
    case 'diningRect10':
      return buildDiningSet(w, h, d, 10, false, mats)
    case 'diningRound4':
      return buildDiningSet(w, h, d, 4, true, mats)
    case 'diningRound6':
      return buildDiningSet(w, h, d, 6, true, mats)
    case 'breakfastBar': {
      const parts: CadPart[] = [
        { geo: box(w, h, d * 0.55, 0, 0, -d * 0.22), mat: mats.woodFine },
        { geo: box(w + 0.08, 0.06, d, 0, h - 0.06, 0), mat: mats.woodFine },
        { geo: cylinder(0.02, 0.02, 0.72, -w * 0.3, 0, d * 0.25), mat: mats.chrome },
        { geo: cylinder(0.18, 0.18, 0.06, -w * 0.3, 0.72, d * 0.25), mat: mats.fabricAccent },
        { geo: cylinder(0.02, 0.02, 0.72, 0, 0, d * 0.25), mat: mats.chrome },
        { geo: cylinder(0.18, 0.18, 0.06, 0, 0.72, d * 0.25), mat: mats.fabricAccent },
        { geo: cylinder(0.02, 0.02, 0.72, w * 0.3, 0, d * 0.25), mat: mats.chrome },
        { geo: cylinder(0.18, 0.18, 0.06, w * 0.3, 0.72, d * 0.25), mat: mats.fabricAccent }
      ]
      return assembleParts(parts)
    }

    /* 3. 🛏️ Dormitorios */
    case 'bedSingle':
      return buildBedPiece(w, h, d, 1, mats)
    case 'bedQueen':
      return buildBedPiece(w, h, d, 2, mats)
    case 'bedKing':
      return buildBedPiece(w, h, d, 4, mats)
    case 'bedBunk':
      return buildBedBunk(w, h, d, mats)
    case 'closet': {
      const parts: CadPart[] = [
        { geo: box(w, h, d, 0, 0, 0), mat: mats.woodFine },
        { geo: box(w * 0.95, h * 0.95, 0.02, 0, 0.05, d / 2 + 0.01), mat: mats.woodOak },
        { geo: cylinder(0.012, 0.012, 0.6, -0.06, h * 0.5, d / 2 + 0.03), mat: mats.chrome },
        { geo: cylinder(0.012, 0.012, 0.6, 0.06, h * 0.5, d / 2 + 0.03), mat: mats.chrome }
      ]
      return assembleParts(parts)
    }
    case 'vanityDresser': {
      const parts: CadPart[] = [
        { geo: box(w, 0.75, d, 0, 0, 0), mat: mats.woodFine },
        { geo: box(w * 0.8, h - 0.75, 0.04, 0, 0.75, -d / 2 + 0.04), mat: mats.woodFine },
        { geo: box(w * 0.72, h - 0.85, 0.01, 0, 0.8, -d / 2 + 0.06), mat: mats.mirror }
      ]
      return assembleParts(parts)
    }

    /* 4. 🚿 Baños y Accesorios Sanitarios */
    case 'toilet':
      return buildToilet(w, h, d, mats)
    case 'sinkPedestal':
      return buildPedestalSink(w, h, d, mats)
    case 'vanitySingle': {
      const parts: CadPart[] = [
        { geo: box(w, h * 0.88, d, 0, 0, 0), mat: mats.woodFine },
        { geo: box(w + 0.02, 0.04, d + 0.02, 0, h * 0.88, 0), mat: mats.ceramic },
        { geo: cylinder(0.016, 0.016, 0.14, 0, h * 0.88 + 0.04, -d / 2 + 0.12), mat: mats.chrome }
      ]
      return assembleParts(parts)
    }
    case 'vanityDouble': {
      const parts: CadPart[] = [
        { geo: box(w, h * 0.88, d, 0, 0, 0), mat: mats.woodFine },
        { geo: box(w + 0.02, 0.04, d + 0.02, 0, h * 0.88, 0), mat: mats.ceramic },
        { geo: cylinder(0.016, 0.016, 0.14, -w * 0.25, h * 0.88 + 0.04, -d / 2 + 0.12), mat: mats.chrome },
        { geo: cylinder(0.016, 0.016, 0.14, w * 0.25, h * 0.88 + 0.04, -d / 2 + 0.12), mat: mats.chrome }
      ]
      return assembleParts(parts)
    }
    case 'urinal': {
      const parts: CadPart[] = [
        { geo: box(w, h, d, 0, 0.35, 0), mat: mats.ceramic },
        { geo: cylinder(0.015, 0.015, 0.18, 0, 0.35 + h, 0), mat: mats.chrome }
      ]
      return assembleParts(parts)
    }
    case 'shower':
      return buildShower(w, h, d, mats)
    case 'bathtub':
    case 'jacuzzi':
      return buildBathtub(w, h, d, mats)
    case 'bathAccessories': {
      const parts: CadPart[] = [
        { geo: cylinder(0.01, 0.01, w, 0, h * 0.7, 0, 0, 0, Math.PI / 2), mat: mats.chrome },
        { geo: box(w * 0.65, 0.35, 0.02, 0, h * 0.7 - 0.35, 0), mat: mats.pillow }
      ]
      return assembleParts(parts)
    }

    /* 5. 🍳 Cocina y Lavandería */
    case 'kitchenSink1':
      return buildKitchenSink(w, h, d, 1, mats)
    case 'kitchenSink2':
      return buildKitchenSink(w, h, d, 2, mats)
    case 'stove4':
      return buildStove(w, h, d, 4, mats)
    case 'stove6':
      return buildStove(w, h, d, 6, mats)
    case 'fridge1':
      return buildFridge(w, h, d, false, mats)
    case 'fridge2':
      return buildFridge(w, h, d, true, mats)
    case 'kitchenIsland': {
      const parts: CadPart[] = [
        { geo: box(w, h - 0.06, d * 0.7, 0, 0, -d * 0.15), mat: mats.woodFine },
        { geo: box(w + 0.08, 0.06, d, 0, h - 0.06, 0), mat: mats.ceramic },
        { geo: cylinder(0.18, 0.18, 0.05, -w * 0.25, 0.65, d * 0.25), mat: mats.woodDark },
        { geo: cylinder(0.18, 0.18, 0.05, w * 0.25, 0.65, d * 0.25), mat: mats.woodDark }
      ]
      return assembleParts(parts)
    }
    case 'microwave': {
      const parts: CadPart[] = [
        { geo: box(w, h, d, 0, 0, 0), mat: mats.stainlessSteel },
        { geo: box(w * 0.65, h * 0.75, 0.02, -w * 0.12, h * 0.12, d / 2 + 0.01), mat: mats.darkPlastic },
        { geo: cylinder(0.012, 0.012, h * 0.5, w / 2 - 0.08, h * 0.25, d / 2 + 0.03), mat: mats.chrome }
      ]
      return assembleParts(parts)
    }
    case 'washer':
    case 'dryer':
      return buildWasherDryer(w, h, d, mats)
    case 'washTub': {
      const parts: CadPart[] = [
        { geo: box(w, h, d, 0, 0, 0), mat: mats.ceramic },
        { geo: box(w * 0.45, 0.35, d * 0.75, -w * 0.22, h - 0.35, 0), mat: mats.ceramic },
        { geo: cylinder(0.015, 0.015, 0.15, 0, h, -d / 2 + 0.1), mat: mats.chrome }
      ]
      return assembleParts(parts)
    }

    /* 6. 💻 Oficina y Estudio */
    case 'deskPc':
      return buildDeskPc(w, h, d, mats)
    case 'deskL': {
      const parts: CadPart[] = [
        { geo: box(w, 0.05, 0.75, 0, 0.72, -d / 2 + 0.375), mat: mats.woodFine },
        { geo: box(0.8, 0.05, d - 0.75, -w / 2 + 0.4, 0.72, 0.375), mat: mats.woodFine },
        { geo: box(0.05, 0.72, 0.75, w / 2 - 0.025, 0, -d / 2 + 0.375), mat: mats.darkPlastic },
        { geo: box(0.05, 0.72, 0.75, -w / 2 + 0.025, 0, -d / 2 + 0.375), mat: mats.darkPlastic },
        { geo: box(0.8, 0.72, 0.05, -w / 2 + 0.4, 0, d / 2 - 0.025), mat: mats.darkPlastic }
      ]
      return assembleParts(parts)
    }
    case 'meetingTable':
      return buildDiningSet(w, h, d, 8, false, mats)
    case 'bookcase': {
      const parts: CadPart[] = [
        { geo: box(w, h, d, 0, 0, 0), mat: mats.woodFine },
        { geo: box(w - 0.08, 0.03, d - 0.04, 0, h * 0.25, 0.02), mat: mats.woodOak },
        { geo: box(w - 0.08, 0.03, d - 0.04, 0, h * 0.5, 0.02), mat: mats.woodOak },
        { geo: box(w - 0.08, 0.03, d - 0.04, 0, h * 0.75, 0.02), mat: mats.woodOak },
        { geo: box(0.35, 0.22, d * 0.6, -w * 0.2, h * 0.28, 0.02), mat: mats.carPaint },
        { geo: box(0.28, 0.2, d * 0.6, w * 0.2, h * 0.53, 0.02), mat: mats.fabric }
      ]
      return assembleParts(parts)
    }
    case 'fileCabinet': {
      const parts: CadPart[] = [
        { geo: box(w, h, d, 0, 0, 0), mat: mats.stainlessSteel },
        { geo: box(w * 0.85, h * 0.2, 0.02, 0, h * 0.05, d / 2 + 0.01), mat: mats.darkPlastic },
        { geo: box(w * 0.85, h * 0.2, 0.02, 0, h * 0.28, d / 2 + 0.01), mat: mats.darkPlastic },
        { geo: box(w * 0.85, h * 0.2, 0.02, 0, h * 0.51, d / 2 + 0.01), mat: mats.darkPlastic },
        { geo: box(w * 0.85, h * 0.2, 0.02, 0, h * 0.74, d / 2 + 0.01), mat: mats.darkPlastic }
      ]
      return assembleParts(parts)
    }

    /* 7. 🚗 Vehículos, Vegetación y Escala Humana */
    case 'carSedan':
      return buildCarSedan(w, h, d, mats)
    case 'carSuv':
      return buildCarSuv(w, h, d, mats)
    case 'truck':
      return buildTruck(w, h, d, mats)
    case 'bus':
      return buildBus(w, h, d, mats)
    case 'motorcycle':
      return buildMotorcycle(w, h, d, mats)
    case 'bicycle':
      return buildBicycle(w, h, d, mats)
    case 'tree':
      return buildTree(w, h, d, mats)
    case 'palm':
      return buildPalm(w, h, d, mats)
    case 'shrub': {
      const r = Math.min(w, d) / 2
      const parts: CadPart[] = [
        { geo: sphere(r, -w * 0.18, h * 0.48, 0), mat: mats.foliage1 },
        { geo: sphere(r * 0.9, w * 0.18, h * 0.45, 0.05), mat: mats.foliage2 },
        { geo: sphere(r * 0.85, 0, h * 0.58, -0.05), mat: mats.foliage3 }
      ]
      return assembleParts(parts)
    }
    case 'potPlant':
      return buildPotPlant(w, h, d, mats)
    case 'human':
      return buildHumanScale(w, h, d, mats)

    default:
      return null
  }
}

/**
 * Función pública de compatibilidad que devuelve la geometría BufferGeometry resultante.
 */
export function buildCadBlock3DGeometry(shapeId: string, size: THREE.Vector3): THREE.BufferGeometry | null {
  const result = buildCadBlock3D(shapeId, size)
  return result ? result.geometry : null
}
