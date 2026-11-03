/** Importación de modelos 3D (GLB / glTF / OBJ+MTL / STL) mediante los loaders oficiales de Three.js.
 *
 * El resultado es una colección de mallas listas para convertirse en
 * `SceneObject` de la capa «importado». No depende del DOM: solo lee un
 * `ArrayBuffer` (GLB/STL) o un texto (glTF/OBJ/MTL) que ya el llamante obtuvo del puente
 * de archivos o de un File arrastrado.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { SceneObject } from '../models/SceneObject'

/** Una malla extraída de un archivo importado, con su geometría ya centrada. */
export interface ImportedMesh {
  readonly name: string
  readonly geometry: THREE.BufferGeometry
  readonly material?: THREE.Material
  readonly bbox: THREE.Box3
  readonly center?: THREE.Vector3
}

/** Formatos de modelos 3D admitidos. */
export type Model3DFormat = 'glb' | 'gltf' | 'obj' | 'stl'

/** Resultado de cargar un archivo GLB, glTF, OBJ o STL. */
export interface ImportedModel {
  readonly format: Model3DFormat
  readonly meshes: ImportedMesh[]
  /** Caja delimitadora que agrupa todas las mallas (en unidades del archivo). */
  readonly bbox: THREE.Box3
  /** Cuántos nodos mesh se encontraron. */
  readonly meshCount: number
}

/** Opciones para convertir un modelo importado en objetos de escena. */
export interface ImportModelOptions {
  /** Factor de escala aplicado a ejes X, Y, Z. */
  readonly scale: THREE.Vector3
  /** Posición donde se coloca el modelo (X, Y, Z en metros). */
  readonly position: THREE.Vector3
  /** Rotación en el eje Y en radianes (por defecto 0). */
  readonly rotationY?: number
  /** Centrar automáticamente el conjunto de mallas en el punto de inserción (por defecto true). */
  readonly centerAtOrigin?: boolean
  /** Si los objetos importados cuentan para el panel de Costos. */
  readonly includeInCosts: boolean
  /** Nombre base para los objetos creados (por defecto, el nombre del archivo). */
  readonly objectName?: string
}

/** Opciones adicionales al parsear el modelo 3D (p. ej. archivo de materiales .mtl para .obj). */
export interface LoadModelExtraOptions {
  /** Contenido texto de un archivo .mtl acompañante para modelos .obj. */
  mtlText?: string
}

/** Decodifica base64 a un array de bytes (para archivos binarios como GLB). */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Clona una geometría, la transforma a espacio mundo si hace falta y la centra
 *  en su origen. Devuelve también el centro original para preservar la posición
 *  relativa al importar modelos con varias mallas. */
function centerGeometry(
  geometry: THREE.BufferGeometry,
  matrixWorld?: THREE.Matrix4
): { geometry: THREE.BufferGeometry; bbox: THREE.Box3; center: THREE.Vector3 } {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  const clone = geometry.clone()
  if (matrixWorld) clone.applyMatrix4(matrixWorld)
  if (!clone.getAttribute('normal')) {
    clone.computeVertexNormals()
  }
  const bbox = position
    ? new THREE.Box3().setFromBufferAttribute(clone.getAttribute('position') as THREE.BufferAttribute)
    : new THREE.Box3()
  const center = bbox.getCenter(new THREE.Vector3())
  clone.translate(-center.x, -center.y, -center.z)
  const centeredPosition = clone.getAttribute('position') as THREE.BufferAttribute | undefined
  const centeredBbox = centeredPosition
    ? new THREE.Box3().setFromBufferAttribute(centeredPosition)
    : new THREE.Box3()
  return { geometry: clone, bbox: centeredBbox, center }
}

/** Convierte o normaliza un material a MeshStandardMaterial neutro si no existe. */
function normalizeStandardMaterial(
  material: THREE.Material | THREE.Material[] | undefined
): THREE.MeshStandardMaterial {
  const first = Array.isArray(material) ? material[0] : material
  if (first instanceof THREE.MeshStandardMaterial) {
    const cloned = first.clone()
    cloned.side = THREE.DoubleSide
    return cloned
  }
  const anyMat = first as (THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null }) | undefined
  const color = anyMat?.color instanceof THREE.Color ? anyMat.color.getHex() : 0x9aa4b2
  return new THREE.MeshStandardMaterial({
    color,
    map: anyMat?.map ?? null,
    roughness: 0.65,
    metalness: 0.1,
    side: THREE.DoubleSide
  })
}

/**
 * Carga un buffer de archivo GLB, glTF, OBJ (+ MTL opcional) o STL y devuelve
 * las mallas extraídas, cada una con su geometría centrada en el origen y su BoundingBox.
 */
export function loadModel(
  buffer: ArrayBuffer,
  format: Model3DFormat,
  extra?: LoadModelExtraOptions
): Promise<ImportedModel> {
  if (format === 'stl') {
    return new Promise((resolve, reject) => {
      try {
        if (!buffer || buffer.byteLength === 0) {
          reject(new Error('STLLoader: el archivo STL está vacío.'))
          return
        }
        const loader = new STLLoader()
        const geometry = loader.parse(buffer)
        const posAttr = geometry.getAttribute('position')
        if (!posAttr || posAttr.count === 0) {
          resolve({
            format: 'stl',
            meshes: [],
            bbox: new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()),
            meshCount: 0
          })
          return
        }
        const { geometry: centered, bbox, center } = centerGeometry(geometry)
        const defaultMaterial = normalizeStandardMaterial(undefined)
        const mesh: ImportedMesh = {
          name: 'Malla STL',
          geometry: centered,
          material: defaultMaterial,
          bbox,
          center
        }
        const overall = new THREE.Box3()
        overall.min.copy(center.clone().add(bbox.min))
        overall.max.copy(center.clone().add(bbox.max))
        resolve({ format: 'stl', meshes: [mesh], bbox: overall, meshCount: 1 })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  if (format === 'glb' || format === 'gltf') {
    return new Promise((resolve, reject) => {
      if (!buffer || buffer.byteLength === 0) {
        reject(new Error('GLTFLoader: el archivo está vacío.'))
        return
      }
      const loader = new GLTFLoader()
      let parseInput: ArrayBuffer | string = buffer
      if (format === 'gltf') {
        parseInput =
          typeof TextDecoder !== 'undefined'
            ? new TextDecoder('utf-8').decode(new Uint8Array(buffer))
            : ''
      }
      loader.parse(
        parseInput,
        '',
        (gltf: unknown) => {
          try {
            const gltfScene = (gltf as { scene?: THREE.Scene | null }).scene ?? new THREE.Scene()
            const meshes: ImportedMesh[] = []
            gltfScene.updateMatrixWorld(true)
            gltfScene.traverse((child: unknown) => {
              const mesh = child as THREE.Mesh
              if (!(mesh instanceof THREE.Mesh)) return
              mesh.castShadow = true
              mesh.receiveShadow = true
              if (!mesh.geometry || !mesh.geometry.attributes.position) return
              mesh.updateMatrixWorld(true)
              const { geometry, bbox, center } = centerGeometry(
                mesh.geometry as THREE.BufferGeometry,
                mesh.matrixWorld
              )
              meshes.push({
                name: mesh.name || `mesh-${meshes.length + 1}`,
                geometry,
                material: normalizeStandardMaterial(
                  mesh.material as THREE.Material | THREE.Material[] | undefined
                ),
                bbox,
                center
              })
            })
            const overall = new THREE.Box3()
            for (const m of meshes) {
              const center = m.center ?? new THREE.Vector3(0, 0, 0)
              overall.expandByPoint(center.clone().add(m.bbox.min))
              overall.expandByPoint(center.clone().add(m.bbox.max))
            }
            if (meshes.length === 0) {
              overall.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0))
            }
            resolve({ format, meshes, bbox: overall, meshCount: meshes.length })
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        },
        (event: ErrorEvent) => {
          reject(event.error ?? new Error(`GLTFLoader: error al parsear ${format.toUpperCase()}`))
        }
      )
    })
  }

  // OBJ (+ MTL opcional): texto plano.
  const text =
    typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(new Uint8Array(buffer)) : ''
  return new Promise((resolve, reject) => {
    try {
      const loader = new OBJLoader()
      if (extra?.mtlText && extra.mtlText.trim().length > 0) {
        try {
          const mtlLoader = new MTLLoader()
          const materials = mtlLoader.parse(extra.mtlText, '')
          materials.preload()
          loader.setMaterials(materials)
        } catch {
          // Si el MTL falla, continuamos con material estándar neutro por defecto.
        }
      }
      const root = loader.parse(text)
      const meshes: ImportedMesh[] = []
      root.updateMatrixWorld(true)
      root.traverse((child: unknown) => {
        const mesh = child as THREE.Mesh
        if (!(mesh instanceof THREE.Mesh)) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        if (!mesh.geometry || !mesh.geometry.attributes.position) return
        mesh.updateMatrixWorld(true)
        const { geometry, bbox, center } = centerGeometry(
          mesh.geometry as THREE.BufferGeometry,
          mesh.matrixWorld
        )
        meshes.push({
          name: mesh.name || `mesh-${meshes.length + 1}`,
          geometry,
          material: normalizeStandardMaterial(
            mesh.material as THREE.Material | THREE.Material[] | undefined
          ),
          bbox,
          center
        })
      })
      const overall = new THREE.Box3()
      for (const m of meshes) {
        const center = m.center ?? new THREE.Vector3(0, 0, 0)
        overall.expandByPoint(center.clone().add(m.bbox.min))
        overall.expandByPoint(center.clone().add(m.bbox.max))
      }
      if (meshes.length === 0) overall.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0))
      resolve({ format: 'obj', meshes, bbox: overall, meshCount: meshes.length })
    } catch (err) {
      reject(err instanceof Error ? err : new Error('OBJLoader: error al parsear OBJ'))
    }
  })
}

/**
 * Convierte un `ImportedModel` en `SceneObject` de la capa «importado».
 * Cada mesh se convierte en un objeto independiente para conservar su
 * geometría, material, escala, rotación en Y y posición de inserción.
 */
export function createImportedObjects(model: ImportedModel, options: ImportModelOptions): SceneObject[] {
  const {
    scale,
    position,
    rotationY = 0,
    centerAtOrigin = true,
    includeInCosts,
    objectName
  } = options
  const objects: SceneObject[] = []
  const modelCenter = model.bbox.getCenter(new THREE.Vector3())
  const rotAxisY = new THREE.Vector3(0, 1, 0)

  for (const mesh of model.meshes) {
    const size = new THREE.Vector3()
    mesh.bbox.getSize(size)
    size.multiply(scale)

    const meshCenter = mesh.center ?? new THREE.Vector3()
    const relative = centerAtOrigin
      ? meshCenter.clone().sub(modelCenter).multiply(scale)
      : meshCenter.clone().multiply(scale)
    if (rotationY !== 0) {
      relative.applyAxisAngle(rotAxisY, rotationY)
    }

    const scaledGeo = mesh.geometry.clone()
    if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
      scaledGeo.scale(scale.x, scale.y, scale.z)
    }

    const object = new SceneObject(objectName ?? mesh.name, 'furniture')
    object.layer = 'importado'
    object.includeInCosts = includeInCosts
    object.position.copy(position).add(relative)
    object.rotationY = rotationY
    object.size = size
    object.importedGeometry = scaledGeo
    object.importedMaterial = mesh.material ?? null
    object.materialId = null
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      object.color = mesh.material.color.getHex()
    } else {
      object.color = 0x9aa4b2
    }
    objects.push(object)
  }

  return objects
}
