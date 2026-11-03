import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Wall } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import type { Opening } from '../models/Opening'
import { applyMeterUVs, createMeshMaterial, materialTint } from './MaterialSystem'
import { buildShapeGeometry } from './ShapeMeshBuilder'
import { buildDoor, buildWindow, type DoorVariant, type WindowVariant } from './OpeningMeshBuilder'
import { buildFittedRoofGeometry } from './RoofBuilder'

/** Color de resaltado del objeto/pared seleccionado (lo comparten motor y renderer). */
export const SELECTED_COLOR = 0x3d8bff

/**
 * Material de una malla de muro: clon del material PBR cacheado del catálogo si
 * el muro tiene `materialId`; si no, un `MeshStandardMaterial` con su color base.
 */
function resolveWallMaterial(wall: Wall): THREE.MeshStandardMaterial {
  const material =
    createMeshMaterial(wall.materialId) ??
    new THREE.MeshStandardMaterial({
      color: wall.isSelected ? SELECTED_COLOR : wall.color,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide
    })
  material.color.setHex(wall.isSelected ? SELECTED_COLOR : materialTint(wall.materialId, wall.color))
  return material
}

/**
 * Operación Booleana de Sustracción Exacta (CSG 2D/3D por descomposición de prismas):
 * Dado un segmento de muro `[0, wallLength] × [0, wallHeight] × [-thickness/2, +thickness/2]`
 * y una lista de vanos (`openings`), sustrae la caja exacta de cada puerta/ventana
 * (`[x - width/2, x + width/2] × [sill, sill + height] × [-thickness/2, +thickness/2]`)
 * generando sub-prismas limpios para los machones laterales, antepechos (bajo ventana)
 * y dinteles (sobre puertas y ventanas), con normales y UVs métricas exactas en todas
 * las caras e intradoses (jambas interiores del vano).
 */
export function subtractOpeningsFromWallBox(
  wallLength: number,
  wallHeight: number,
  wallThickness: number,
  openings: ReadonlyArray<Opening>
): THREE.BufferGeometry {
  const L = Math.max(0.05, wallLength)
  const H = Math.max(0.05, wallHeight)
  const T = Math.max(0.02, wallThickness)

  // Filtrar y ordenar aberturas válidas a lo largo del eje X del muro
  const valid = openings
    .map((o) => {
      const x0 = Math.max(0, Math.min(L, o.x - o.width / 2))
      const x1 = Math.max(0, Math.min(L, o.x + o.width / 2))
      const y0 = Math.max(0, Math.min(H, o.sill))
      const y1 = Math.max(0, Math.min(H, o.sill + o.height))
      return { x0, x1, y0, y1 }
    })
    .filter((o) => o.x1 - o.x0 > 0.01 && o.y1 - o.y0 > 0.01)
    .sort((a, b) => a.x0 - b.x0)

  if (valid.length === 0) {
    const solid = new THREE.BoxGeometry(L, H, T)
    solid.translate(L / 2, H / 2, 0)
    const nonIdx = solid.toNonIndexed()
    solid.dispose()
    nonIdx.computeVertexNormals()
    applyMeterUVs(nonIdx)
    return nonIdx
  }

  const boxes: THREE.BufferGeometry[] = []
  const addSubBox = (x0: number, x1: number, y0: number, y1: number): void => {
    const w = x1 - x0
    const h = y1 - y0
    if (w <= 1e-4 || h <= 1e-4) return
    const g = new THREE.BoxGeometry(w, h, T)
    g.translate(x0 + w / 2, y0 + h / 2, 0)
    boxes.push(g.toNonIndexed())
    g.dispose()
  }

  let cursorX = 0
  for (const op of valid) {
    const ox0 = Math.max(cursorX, op.x0)
    const ox1 = Math.max(ox0, op.x1)

    // 1. Machón completo del muro antes del vano
    if (ox0 > cursorX + 1e-4) {
      addSubBox(cursorX, ox0, 0, H)
    }

    if (ox1 > ox0 + 1e-4) {
      // 2. Antepecho (muro debajo del vano, p. ej. en ventanas donde sill > 0)
      if (op.y0 > 1e-4) {
        addSubBox(ox0, ox1, 0, op.y0)
      }
      // 3. Dintel (muro encima del vano hasta la coronación H)
      if (op.y1 < H - 1e-4) {
        addSubBox(ox0, ox1, op.y1, H)
      }
    }

    cursorX = Math.max(cursorX, ox1)
  }

  // 4. Machón final después del último vano hasta el extremo del muro
  if (cursorX < L - 1e-4) {
    addSubBox(cursorX, L, 0, H)
  }

  if (boxes.length === 0) {
    // Caso extremo en que el vano ocupa el 100% del segmento
    const fallback = new THREE.BufferGeometry()
    fallback.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    fallback.setAttribute('normal', new THREE.Float32BufferAttribute([], 3))
    fallback.setAttribute('uv', new THREE.Float32BufferAttribute([], 2))
    return fallback
  }

  const merged = mergeGeometries(boxes, false)
  boxes.forEach((b) => b.dispose())
  merged.computeVertexNormals()
  applyMeterUVs(merged)
  return merged
}

/**
 * Convierte un objeto de datos `Wall` en un `THREE.Mesh` con perforación booleana
 * real en cada puerta y ventana (`wall.openings`) y mapeo UV métrico.
 */
export function buildWallMesh(wall: Wall): THREE.Mesh {
  const geometry = subtractOpeningsFromWallBox(wall.length, wall.height, wall.thickness, wall.openings)

  const material = resolveWallMaterial(wall)
  const mesh = new THREE.Mesh(geometry, material)

  const direction = new THREE.Vector3().subVectors(wall.end, wall.start)
  const angle = Math.atan2(direction.z, direction.x)

  mesh.position.copy(wall.start)
  mesh.rotation.y = -angle
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.wallId = wall.id

  return mesh
}

/**
 * Determina si un `SceneObject` corresponde a una puerta o ventana y resuelve
 * su tipo (`door` | `window`) y su variante de carpintería.
 */
export function resolveObjectOpeningSpec(object: SceneObject): {
  type: 'door' | 'window'
  variant: string
} | null {
  const shapeId = (object.shapeId ?? '').toLowerCase()
  const name = object.name.toLowerCase()

  if (shapeId === 'opening.slab' || name.includes('losa') || name.includes('forjado')) {
    return null
  }

  const isDoor =
    shapeId.startsWith('opening.door') ||
    name.includes('puerta') ||
    name.includes('door') ||
    object.openingVariant === 'simple' ||
    object.openingVariant === 'doble' ||
    object.openingVariant === 'garaje' ||
    object.openingVariant === 'puerta-ventana' ||
    object.openingVariant === 'vidrio'

  const isWindow =
    !isDoor &&
    (shapeId.startsWith('opening.window') ||
      name.includes('ventana') ||
      name.includes('window') ||
      object.openingVariant === 'fija' ||
      object.openingVariant === 'abatible' ||
      object.openingVariant === 'dosHojas' ||
      object.openingVariant === 'cuatroHojas' ||
      object.openingVariant === 'panoramica')

  if (!isDoor && !isWindow) return null

  if (object.openingVariant) {
    return { type: isDoor ? 'door' : 'window', variant: object.openingVariant }
  }

  if (isDoor) {
    if (shapeId.includes('double') || name.includes('doble')) return { type: 'door', variant: 'doble' }
    if (shapeId.includes('sliding') || name.includes('corrediza')) return { type: 'door', variant: 'corrediza' }
    if (shapeId.includes('garage') || name.includes('garaje')) return { type: 'door', variant: 'garaje' }
    if (shapeId.includes('patio') || name.includes('ventana')) return { type: 'door', variant: 'puerta-ventana' }
    if (shapeId.includes('glass') || name.includes('vidrio')) return { type: 'door', variant: 'vidrio' }
    return { type: 'door', variant: 'simple' }
  }

  if (shapeId.includes('sliding') || name.includes('corrediza')) return { type: 'window', variant: 'corrediza' }
  if (shapeId.includes('casement') || name.includes('abatible')) return { type: 'window', variant: 'abatible' }
  if (shapeId.includes('four') || name.includes('cuatro') || name.includes('4')) return { type: 'window', variant: 'cuatroHojas' }
  if (shapeId.includes('panoramic') || name.includes('panor')) return { type: 'window', variant: 'panoramica' }
  return { type: 'window', variant: 'dosHojas' }
}

/**
 * Convierte un `SceneObject` en un `THREE.Mesh`.
 * - Si es una puerta o ventana, genera su carpintería 3D completa (marco, hoja,
 *   manijas metálicas y cristal físico transparente).
 * - Si trae `importedGeometry` (modelos personalizados GLB/OBJ), clona y escala la malla.
 * - Si trae `shapeId` paramétrico, construye la geometría de `ShapeMeshBuilder`.
 */
export function buildObjectMesh(object: SceneObject): THREE.Mesh {
  const openingSpec = resolveObjectOpeningSpec(object)
  if (openingSpec) {
    const isDoor = openingSpec.type === 'door'
    const wallThickness = Math.max(0.12, object.size.z)
    const opening: Opening = {
      id: object.id,
      wallId: '',
      x: 0,
      width: Math.max(0.4, object.size.x),
      height: Math.max(0.4, object.size.y),
      sill: isDoor ? 0 : Math.max(0, object.position.y),
      type: openingSpec.type,
      materialId: object.materialId
    }

    const result = isDoor
      ? buildDoor(opening, wallThickness, {
          variant: openingSpec.variant as DoorVariant,
          openingAngle: object.openingAngle,
          frameMaterialId: object.frameMaterialId ?? null,
          leafMaterialId: object.leafMaterialId ?? object.materialId,
          metalMaterialId: null
        })
      : buildWindow(opening, wallThickness, {
          variant: openingSpec.variant as WindowVariant,
          openingAngle: object.openingAngle,
          frameMaterialId: object.frameMaterialId ?? null,
          frameWidth: 0.06,
          sillShelf: true
        })

    if (result) {
      const { geometry, materials } = result
      if (object.isSelected) {
        for (const m of materials) {
          m.emissive = new THREE.Color(SELECTED_COLOR)
          m.emissiveIntensity = 0.28
        }
      }
      const mesh = new THREE.Mesh(geometry, materials)
      mesh.position.copy(object.position)
      mesh.rotation.y = object.rotationY
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.objectId = object.id
      mesh.userData.isOpeningMesh = true
      return mesh
    }
  }

  const fitted = fittedRoofGeometry(object)
  const parametric = fitted ?? (object.shapeId ? buildShapeGeometry(object.shapeId, object.size) : null)
  let geometry: THREE.BufferGeometry

  if (object.importedGeometry) {
    // Geometría 3D real importada (GLB/OBJ), escalada a `object.size` y apoyada en y = 0.
    geometry = object.importedGeometry.clone()
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox
    if (bb) {
      const rawW = Math.max(1e-4, bb.max.x - bb.min.x)
      const rawH = Math.max(1e-4, bb.max.y - bb.min.y)
      const rawD = Math.max(1e-4, bb.max.z - bb.min.z)
      geometry.scale(object.size.x / rawW, object.size.y / rawH, object.size.z / rawD)
      geometry.computeBoundingBox()
      const scaledBb = geometry.boundingBox!
      geometry.translate(
        -(scaledBb.min.x + scaledBb.max.x) / 2,
        -scaledBb.min.y,
        -(scaledBb.min.z + scaledBb.max.z) / 2
      )
    }
  } else if (parametric) {
    geometry = parametric
  } else {
    geometry = new THREE.BoxGeometry(object.size.x, object.size.y, object.size.z)
    geometry.translate(0, object.size.y / 2, 0)
    applyMeterUVs(geometry)
  }

  const material =
    createMeshMaterial(object.materialId) ??
    (!object.isSelected && object.importedMaterial instanceof THREE.MeshStandardMaterial
      ? object.importedMaterial.clone()
      : new THREE.MeshStandardMaterial({
          color: object.isSelected ? SELECTED_COLOR : object.color,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide
        }))
  // Regla del proyecto: techos siempre opacos, sin transparencia.
  if (object.kind === 'roof') {
    material.transparent = false
    material.opacity = 1
  }
  if (object.isSelected || !object.importedMaterial || object.materialId) {
    material.color.setHex(object.isSelected ? SELECTED_COLOR : materialTint(object.materialId, object.color))
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(object.position)
  mesh.rotation.y = object.rotationY
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.objectId = object.id

  return mesh
}

/**
 * Geometría ajustada al contorno cuando el objeto es un techo por área
 * (`roofProps.footprint` con ≥3 puntos).
 */
function fittedRoofGeometry(object: SceneObject): THREE.BufferGeometry | null {
  if (object.kind !== 'roof' || !object.roofProps || object.roofProps.footprint.length < 3) return null
  const props = object.roofProps
  const fitted = buildFittedRoofGeometry({
    footprint: props.footprint,
    type: props.type,
    slope: props.slope,
    overhang: props.overhang,
    thickness: props.thickness,
    ridgeDir: props.ridgeDir
  })
  if (!fitted) return null
  return fitted.geometry
}
