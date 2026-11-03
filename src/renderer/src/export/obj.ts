import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'

import type { ExportContext } from './index'
import { buildExportScene } from './index'

const RELEVANT_KINDS = new Set(['wall', 'floor', 'roof', 'object', 'furniture', 'shape'])

/**
 * Resuelve la escena 3D limpia a exportar: si hay contexto paramétrico con
 * elementos construye la escena desde el modelo; si se recibe un `THREE.Scene`
 * poblado filtra solo las mallas relevantes (muros, pisos, techos, mobiliario).
 */
export function resolveCleanScene(scene: THREE.Scene, context?: ExportContext): THREE.Scene {
  if (context && (context.walls.length > 0 || context.objects.length > 0 || context.levels.length > 0)) {
    return buildExportScene(context, {})
  }
  const clean = new THREE.Scene()
  clean.name = scene?.name || context?.projectName || 'Exportación ArqStudio'
  clean.userData = { units: 'm', scale: 1 }

  if (scene) {
    scene.updateMatrixWorld(true)
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      const kind = mesh.userData?.kind as string | undefined
      if (kind && !RELEVANT_KINDS.has(kind)) return
      const clone = mesh.clone()
      clone.geometry = mesh.geometry.clone()
      clone.applyMatrix4(mesh.matrixWorld)
      clone.position.set(0, 0, 0)
      clone.rotation.set(0, 0, 0)
      clone.scale.set(1, 1, 1)
      clone.updateMatrix()
      clean.add(clone)
    })
  }
  return clean
}

export async function exportObj(
  scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const exportScene = resolveCleanScene(scene, context)
    exportScene.updateMatrixWorld(true)
    const exporter = new OBJExporter()
    const raw = exporter.parse(exportScene)
    const body = typeof raw === 'string' ? raw : String(raw)
    const header = [
      '# ArqStudio 3D - Exportación Wavefront OBJ',
      '# Unidades: metros (1 unidad = 1 m)'
    ].join('\n')
    return body.trim().length > 0 ? `${header}\n${body}` : `${header}\n`
  } catch (err) {
    if (error) error.message = `OBJ: ${(err as Error).message}`
    return ''
  }
}

/**
 * Material MTL de un `MeshStandardMaterial` o `MeshPhongMaterial` de la escena
 * de exportación. Los valores se copian tal cual (sRGB → lineal no se aplica:
 * el visor objetivo espera el color tal y como lo ve el usuario en ArqStudio).
 */
export interface MtlMaterial {
  name: string
  /** Color difuso en RGB 0–1. */
  kd: [number, number, number]
  /** Color especular en RGB 0–1. */
  ks: [number, number, number]
  /** Rugosidad (0 = espejo, 1 = mate). */
  ns: number
  /** Opacidad 0–1 (1 = opaco). */
  d: number
}

/**
 * Genera el archivo MTL (materiales) que acompaña al OBJ.
 *
 * Se recorre la escena de exportación por materiales: cada `MeshStandardMaterial`
 * o `MeshPhongMaterial` con nombre recibe una entrada `newmtl`. Los materiales sin
 * nombre reciben uno derivado de su malla o color, de forma que ningún mesh quede
 * sin material.
 */
export function buildMtl(scene: THREE.Scene): string {
  const lines: string[] = ['# Materiales exportados desde ArqStudio 3D']
  lines.push('# Units: metros (1 unidad = 1 m)')
  lines.push('')

  const emitted = new Set<string>()
  const meshes: THREE.Mesh[] = []
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
  })

  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      const name = mtlName(material, mesh)
      if (emitted.has(name)) continue
      emitted.add(name)
      const matAny = material as THREE.MeshStandardMaterial & THREE.MeshPhongMaterial
      const color = matAny?.color ?? new THREE.Color(0xffffff)
      lines.push(`newmtl ${name}`)
      lines.push(`Ka ${(color.r * 0.2).toFixed(6)} ${(color.g * 0.2).toFixed(6)} ${(color.b * 0.2).toFixed(6)}`)
      lines.push(`Kd ${color.r.toFixed(6)} ${color.g.toFixed(6)} ${color.b.toFixed(6)}`)
      if (matAny?.specular instanceof THREE.Color) {
        lines.push(`Ks ${matAny.specular.r.toFixed(6)} ${matAny.specular.g.toFixed(6)} ${matAny.specular.b.toFixed(6)}`)
      } else {
        const gloss = 1 - (typeof matAny?.roughness === 'number' ? matAny.roughness : 0.8)
        const specular = 0.04 + gloss * 0.96
        lines.push(`Ks ${(specular * 0.5).toFixed(6)} ${(specular * 0.5).toFixed(6)} ${(specular * 0.5).toFixed(6)}`)
      }
      const ns =
        typeof matAny?.shininess === 'number' && typeof matAny?.roughness !== 'number'
          ? Math.min(1000, Math.max(1, matAny.shininess))
          : (typeof matAny?.roughness === 'number' ? matAny.roughness : 0.8) * 1000
      lines.push(`Ns ${ns.toFixed(3)}`)
      const opacity = typeof matAny?.opacity === 'number' ? matAny.opacity : 1
      lines.push(`d ${opacity.toFixed(6)}`)
      lines.push('illum 2')
      lines.push('')
    }
  }

  if (emitted.size === 0) {
    lines.push('newmtl mat.default')
    lines.push('Ka 0.160000 0.160000 0.160000')
    lines.push('Kd 0.800000 0.800000 0.800000')
    lines.push('Ks 0.100000 0.100000 0.100000')
    lines.push('Ns 800.000')
    lines.push('d 1.000000')
    lines.push('illum 2')
    lines.push('')
  }

  return lines.join('\n')
}

/** Nombre de material para el MTL: el del material si existe, si no el del mesh. */
function mtlName(material: THREE.Material, mesh: THREE.Mesh): string {
  const base = material?.name?.trim() || mesh?.name?.trim() || 'material'
  return base.replace(/\s+/g, '_').replace(/[^\w.-]/g, '_')
}

/**
 * Exportador MTL: el archivo de materiales que acompaña al OBJ.
 */
export async function exportMtl(
  scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const exportScene = resolveCleanScene(scene, context)
    return buildMtl(exportScene)
  } catch (err) {
    if (error) error.message = `MTL: ${(err as Error).message}`
    return ''
  }
}
