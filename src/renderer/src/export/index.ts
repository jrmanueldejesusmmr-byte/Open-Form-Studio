/**
 * Exportación/importación de planos para ArqStudio 3D — Fases 1–6.
 *
 * Registro central de formatos, contexto de exportación y construcción de la
 * escena (muros, pisos, objetos) que consumen los exportadores. Las fases
 * siguientes (DXF, PDF, IFC) se van añadiendo al registro `EXPORT_FORMATS`.
 *
 * Unidades: metros (1 cuadro = 1 m), escala 1:1. Los colores son RGB 0–255.
 */

import * as THREE from 'three'
import { Wall } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { Level } from '../models/Level'
import { buildObjectMesh, buildWallMesh } from '../engine/WallMeshBuilder'
import { exportDxf } from './dxf'
import { exportGlb } from './glb'
import { exportObj, exportMtl } from './obj'
import { exportPdf } from './pdf'
import { exportStl } from './stl'
import { exportSvg } from './svg'
import { exportIfc } from './ifc'
import { exportPng, type PngSource } from './png'
import { fromBase64 } from './base64'
import type { IconName } from '../ui/icons'

export type ExportFormatId = 'obj' | 'mtl' | 'glb' | 'stl' | 'dxf' | 'pdf' | 'svg' | 'png' | 'ifc'

export type ExportCategoryId = '3d' | '2d' | 'bim'

export interface ExportCategory {
  id: ExportCategoryId
  title: string
  subtitle: string
  formats: readonly ExportFormatId[]
}

/**
 * Hoja de la lámina PDF: A4/A3/A2 en horizontal (H) o vertical (V).
 * Se declara aquí (no en pdf.ts) para que el diálogo la liste sin
 * importar el generador PDF. Medidas en puntos (1 pt = 1/72").
 */
export type PdfSheetId = 'A4-H' | 'A4-V' | 'A3-H' | 'A3-V' | 'A2-H' | 'A2-V'

export interface ExportFormat {
  id: ExportFormatId
  shortName: string
  label: string
  description: string
  extension: string
  category: ExportCategoryId
  icon: IconName
  mimeType: string
  /** true = disponible hoy; false = se habilita al completar su fase. */
  available: boolean
  /** true = el contenido devuelto es base64 (GLB/PDF/STL/PNG); false = texto plano (OBJ/MTL/DXF/SVG/IFC). */
  binary: boolean
  /**
   * Devuelve el contenido del archivo: texto plano (OBJ/DXF/MTL/SVG/IFC) o base64
   * (GLB/PDF/STL/PNG). En caso de fallo rellena `error.message` y devuelve ''.
   */
  export: (scene: THREE.Scene, context?: ExportContext, error?: { message?: string }) => Promise<string>
}

export interface ExportContext {
  walls: readonly Wall[]
  objects: readonly SceneObject[]
  levels: readonly Level[]
  /** Nombre del proyecto (opcional; usado como nombre sugerido del archivo). */
  projectName?: string
  /** Autor del archivo (opcional). */
  author?: string
  /**
   * Hoja de la lámina PDF (A4/A3/A2 + orientación). Si se omite, A3
   * horizontal (comportamiento de la Fase 3).
   */
  sheet?: PdfSheetId
  /**
   * Escala forzada 1:N para el PDF (debe estar en STANDARD_SCALES).
   * Si se omite, la lámina elige la comercial más grande que quepa.
   */
  scale?: number
  /** Fecha del cajetín (AAAA-MM-DD); por defecto, la de hoy. */
  sheetDate?: string
  /** Número de lámina del cajetín (p. ej. "A-01"); por defecto "A-01". */
  sheetNumber?: string
  /**
   * Visor 3D activo. Solo lo usa el exportador PNG, que captura el lienzo
   * real (con la vista y el encuadre del usuario) en vez de una escena aparte.
   */
  viewport?: PngSource
}

export interface BuildExportSceneOptions {
  /**
   * Solo muros (sin pisos ni objetos): geometría mínima para pruebas de
   * DXF/PDF y para exportaciones rápidas.
   */
  onlyWalls?: boolean
}

/**
 * Construye una escena Three.js limpia con solo la geometría que se va a
 * exportar: muros, suelos por piso y objetos (los techos viajan como objetos).
 *
 * No se aplica ningún resaltado de selección: cada malla usa el material propio
 * del motor (catálogo o color plano). La escala es 1:1 en metros y cada malla
 * conserva en `userData` su identidad (`wallId`, `objectId`, `levelId`,
 * `kind`) para que los exportadores de planos (DXF/PDF) puedan dibujarla.
 */
export function buildExportScene(context: ExportContext, options: BuildExportSceneOptions = {}): THREE.Scene {
  const scene = new THREE.Scene()
  scene.name = context.projectName ?? 'Exportación ArqStudio'
  // Metadatos útiles para quien reciba el archivo (el GLB los incluye en userData).
  scene.userData = { units: 'm', scale: 1 }

  for (const wall of context.walls) {
    const mesh = buildWallMesh(wall)
    mesh.name = `muro: ${wall.id}`
    mesh.userData = { ...mesh.userData, kind: 'wall', levelId: wall.levelId }
    scene.add(mesh)
  }

  if (!options.onlyWalls) {
    for (const object of context.objects) {
      const mesh = buildObjectMesh(object)
      mesh.name = `objeto: ${object.kind} / ${object.id}`
      mesh.userData = { ...mesh.userData, kind: 'object', levelId: object.levelId }
      scene.add(mesh)
    }

    for (const level of context.levels) {
      const floor = buildFloorMesh(level, context)
      if (floor) scene.add(floor)
    }
  }

  return scene
}

/** Grosor de la losa exportada por piso (metros). */
const FLOOR_THICKNESS = 0.1

/**
 * Huella XZ (en metros, coordenadas de mundo) de un piso: el bounding de los
 * muros y objetos que pertenecen a él. Devuelve `null` si el piso está vacío.
 * La usan la losa 3D (`buildFloorMesh`) y el plano del DXF.
 */
export function computeLevelFootprint(
  level: Level,
  context: ExportContext
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let found = false

  const grow = (x: number, z: number): void => {
    found = true
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  for (const wall of context.walls) {
    if (wall.levelId !== level.id) continue
    grow(wall.start.x, wall.start.z)
    grow(wall.end.x, wall.end.z)
  }
  for (const object of context.objects) {
    if (object.levelId !== level.id) continue
    grow(object.position.x - object.size.x / 2, object.position.z - object.size.z / 2)
    grow(object.position.x + object.size.x / 2, object.position.z + object.size.z / 2)
  }
  return found ? { minX, maxX, minZ, maxZ } : null
}

/**
 * Losa delgada del piso ajustada a la huella XZ de los muros y objetos de ese
 * piso. Devuelve `null` si el piso está vacío (no se exporta una losa flotando
 * sin nada encima).
 */
function buildFloorMesh(level: Level, context: ExportContext): THREE.Mesh | null {
  const footprint = computeLevelFootprint(level, context)
  if (!footprint) return null

  const { minX, maxX, minZ, maxZ } = footprint
  const width = Math.max(maxX - minX, FLOOR_THICKNESS)
  const depth = Math.max(maxZ - minZ, FLOOR_THICKNESS)
  const geometry = new THREE.BoxGeometry(width, FLOOR_THICKNESS, depth)
  const material = new THREE.MeshStandardMaterial({ color: 0x9c9689, roughness: 0.95, metalness: 0 })
  const mesh = new THREE.Mesh(geometry, material)
  // La losa se apoya justo debajo de la cota del piso (no la atraviesa).
  mesh.position.set((minX + maxX) / 2, level.elevation - FLOOR_THICKNESS / 2, (minZ + maxZ) / 2)
  mesh.name = `piso: ${level.name}`
  mesh.userData = { kind: 'floor', levelId: level.id }
  return mesh
}

export const EXPORT_CATEGORIES: readonly ExportCategory[] = [
  {
    id: '3d',
    title: 'Modelos 3D y Materiales',
    subtitle: 'Mallas poligonales, materiales PBR e impresión 3D',
    formats: ['obj', 'mtl', 'glb', 'stl']
  },
  {
    id: '2d',
    title: 'Documentación y Planos 2D',
    subtitle: 'Planos CAD por capas, láminas PDF a escala y vectores',
    formats: ['dxf', 'pdf', 'svg']
  },
  {
    id: 'bim',
    title: 'Presentación e Interoperabilidad BIM',
    subtitle: 'Capturas en alta resolución y estándar abierto IFC4',
    formats: ['png', 'ifc']
  }
]

/**
 * Registro central de los 9 formatos de exportación CAD/BIM.
 */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  {
    id: 'obj',
    shortName: 'OBJ',
    label: 'OBJ (Wavefront)',
    description: 'Geometría 3D Wavefront',
    extension: 'obj',
    category: '3d',
    icon: 'cube',
    mimeType: 'model/obj',
    available: true,
    binary: false,
    export: exportObj
  },
  {
    id: 'mtl',
    shortName: 'MTL',
    label: 'MTL (materiales para OBJ)',
    description: 'Materiales y colores PBR',
    extension: 'mtl',
    category: '3d',
    icon: 'palette',
    mimeType: 'model/mtl',
    available: true,
    binary: false,
    export: exportMtl
  },
  {
    id: 'glb',
    shortName: 'GLB',
    label: 'GLB (glTF binario)',
    description: 'Escena 3D glTF 2.0 binaria',
    extension: 'glb',
    category: '3d',
    icon: 'box',
    mimeType: 'model/gltf-binary',
    available: true,
    binary: true,
    export: exportGlb
  },
  {
    id: 'stl',
    shortName: 'STL',
    label: 'STL (malla para impresión 3D)',
    description: 'Malla sólida para impresión 3D',
    extension: 'stl',
    category: '3d',
    icon: 'layers',
    mimeType: 'model/stl',
    available: true,
    binary: true,
    export: exportStl
  },
  {
    id: 'dxf',
    shortName: 'DXF',
    label: 'DXF (AutoCAD R12)',
    description: 'Plano CAD 2D por capas R12',
    extension: 'dxf',
    category: '2d',
    icon: 'ruler',
    mimeType: 'application/dxf',
    available: true,
    binary: false,
    export: exportDxf
  },
  {
    id: 'pdf',
    shortName: 'PDF',
    label: 'PDF (lámina de plano)',
    description: 'Lámina arquitectónica a escala',
    extension: 'pdf',
    category: '2d',
    icon: 'fileText',
    mimeType: 'application/pdf',
    available: true,
    binary: true,
    export: exportPdf
  },
  {
    id: 'svg',
    shortName: 'SVG',
    label: 'SVG (planta vectorial)',
    description: 'Planta vectorial XML escalable',
    extension: 'svg',
    category: '2d',
    icon: 'fileCode',
    mimeType: 'image/svg+xml',
    available: true,
    binary: false,
    export: exportSvg
  },
  {
    id: 'png',
    shortName: 'PNG',
    label: 'PNG (captura del visor 3D)',
    description: 'Captura del visor 3D en alta resolución',
    extension: 'png',
    category: 'bim',
    icon: 'camera',
    mimeType: 'image/png',
    available: true,
    binary: true,
    export: exportPng
  },
  {
    id: 'ifc',
    shortName: 'IFC',
    label: 'IFC (OpenBIM IFC4)',
    description: 'Modelo OpenBIM estándar IFC4',
    extension: 'ifc',
    category: 'bim',
    icon: 'building',
    mimeType: 'application/x-step',
    available: true,
    binary: false,
    export: exportIfc
  }
]

/** Formato del registro por identificador (`undefined` si no existe). */
export function getExportFormat(id: ExportFormatId): ExportFormat | undefined {
  return EXPORT_FORMATS.find((format) => format.id === id)
}

/**
 * Convierte la salida de un exportador (texto UTF-8 o base64 binario) en un
 * objeto `Blob` tipado listo para descargarse o guardarse.
 */
export function contentToBlob(
  content: string,
  format: Pick<ExportFormat, 'binary' | 'mimeType'>
): Blob {
  if (format.binary) {
    const bytes = fromBase64(content)
    return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: format.mimeType
    })
  }
  return new Blob([content], { type: `${format.mimeType};charset=utf-8` })
}

/**
 * Dispara la descarga inmediata en el navegador / WebView de un `Blob`,
 * `ArrayBuffer`, `Uint8Array` o cadena de texto con el nombre y extensión
 * elegidos por el usuario.
 */
export function triggerDownload(
  data: Blob | ArrayBuffer | Uint8Array | string,
  filename: string,
  mimeType = 'application/octet-stream'
): void {
  if (typeof document === 'undefined') return
  let blob: Blob
  if (data instanceof Blob) {
    blob = data
  } else if (data instanceof ArrayBuffer) {
    blob = new Blob([data], { type: mimeType })
  } else if (data instanceof Uint8Array) {
    blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], {
      type: mimeType
    })
  } else {
    blob = new Blob([String(data)], { type: `${mimeType};charset=utf-8` })
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }, 1500)
}
