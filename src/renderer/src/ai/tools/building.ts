/** tool generar_edificio: como generar_casa pero sin tope fijo de pisos y con altura de piso configurable. */
import * as THREE from 'three'
import { WallSegmentType } from '../../models/Wall'
import { SceneObject } from '../../models/SceneObject'
import { isMaterialId } from '../../catalog/materials'
import { DEFAULT_ROOF_THICKNESS, roofShapeId, type RoofType } from '../../models/Roof'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr, reqNum } from './validate'

/** Tope alto: no es límite arquitectónico, evita colgar por error. El rendimiento con muchos pisos se aborda con instancing (fase aparte). */
export const BUILDING_FLOORS_MAX = 200
const TECHOS = ['gable', 'hip', 'shed', 'flat'] as const
const FACHADAS = ['solida', 'cortina_vidrio'] as const
/** Espaciado (m) entre montantes de la cortina vidrio. */
const MULLION_SPACING = 3

/** Valida «fachada» (por defecto sólida). Lanza si el valor no es válido. */
function readFachada(params: Record<string, unknown>): string {
  const f = optStr(params, 'fachada', 'solida')
  if (!(FACHADAS as readonly string[]).includes(f)) throw new Error('Fachada: solida o cortina_vidrio.')
  return f
}

export const generarEdificio: ToolDef = {
  nombre: 'generar_edificio',
  descripcion: 'Genera un edificio de N pisos (sin tope fijo) con muros por piso, losa y techo en el último. Opción de fachada de cortina vidrio con montantes de acero. Altura de piso configurable.',
  esquema: {
    type: 'object',
    properties: {
      pisos: { type: 'number', description: 'Número de pisos.', default: 1 },
      ancho: { type: 'number', description: 'Ancho en m.' },
      largo: { type: 'number', description: 'Largo en m.' },
      altura_piso: { type: 'number', description: 'Altura de cada piso (m).', default: 3 },
      habitaciones_por_piso: { type: 'number', description: 'Divisiones interiores por piso (0–4).', default: 0 },
      techo: { type: 'string', description: 'gable, hip, shed o flat.', default: 'flat', enum: [...TECHOS] },
      fachada: { type: 'string', description: 'solida (muros opacos) o cortina_vidrio (piel de vidrio con montantes de acero).', default: 'solida', enum: ['solida', 'cortina_vidrio'] },
      x: { type: 'number', description: 'Esquina X.', default: 0 },
      z: { type: 'number', description: 'Esquina Z.', default: 0 },
      material: { type: 'string', description: 'Material de muros (en cortina_vidrio: muros interiores).', default: 'mat.concrete' }
    },
    required: ['ancho', 'largo']
  },
  dryRun(params, ctx) {
    try {
      const a = reqNum(params, 'ancho', 3, 120)
      const l = reqNum(params, 'largo', 3, 120)
      const p = optNum(params, 'pisos', 1, 1, BUILDING_FLOORS_MAX)
      const hp = optNum(params, 'altura_piso', 3, 2, 8)
      const hab = optNum(params, 'habitaciones_por_piso', 0, 0, 4)
      const t = optStr(params, 'techo', 'flat')
      if (!(TECHOS as readonly string[]).includes(t)) throw new Error('Techo: gable, hip, shed o flat.')
      const m = optStr(params, 'material', 'mat.concrete')
      if (!isMaterialId(m)) throw new Error(`El material «${m}» no está en el catálogo.`)
      const fach = readFachada(params)
      void ctx
      const avisos = p > 12 ? [`${p} pisos generarán muchos elementos; el rendimiento óptimo requiere instancing (fase pendiente).`] : []
      return { valido: true, resumen: `Edificio de ${fmt(a)}×${fmt(l)} m, ${p} pisos de ${fmt(hp)} m (alto total ~${fmt(p * hp)} m), techo ${t}${fach === 'cortina_vidrio' ? ', fachada de cortina vidrio' : ''}.`, acciones: [{ accion: 'generar_edificio', detalle: `${p} pisos, ${fmt(a)}×${fmt(l)} m, fachada ${fach}`, ids_afectados: [] }], avisos }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const a = reqNum(params, 'ancho', 3, 120)
      const l = reqNum(params, 'largo', 3, 120)
      const p = optNum(params, 'pisos', 1, 1, BUILDING_FLOORS_MAX)
      const hp = optNum(params, 'altura_piso', 3, 2, 8)
      const hab = optNum(params, 'habitaciones_por_piso', 0, 0, 4)
      const t = optStr(params, 'techo', 'flat') as RoofType
      if (!(TECHOS as readonly string[]).includes(t)) return { ok: false, mensaje: 'Techo: gable, hip, shed o flat.', ids_creados: [] }
      const m = optStr(params, 'material', 'mat.concrete')
      if (!isMaterialId(m)) return { ok: false, mensaje: `El material «${m}» no está en el catálogo.`, ids_creados: [] }
      const x0 = optNum(params, 'x', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z0 = optNum(params, 'z', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      let fach: string
      try { fach = readFachada(params) } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
      const cortina = fach === 'cortina_vidrio'
      const W = a
      const D = l
      const ids: string[] = []
      for (let f = 0; f < p; f++) {
        const lvl = f === 0 ? ctx.scene.getActiveLevel() : ctx.scene.addLevel()
        if (f !== 0) ctx.scene.updateLevel(lvl.id, { height: hp })
        ids.push(lvl.id)
        const perimeter: Array<[number, number, number, number]> = [
          [x0, z0, x0 + W, z0],
          [x0 + W, z0, x0 + W, z0 + D],
          [x0 + W, z0 + D, x0, z0 + D],
          [x0, z0 + D, x0, z0]
        ]
        const interior: Array<[number, number, number, number]> = []
        for (let d = 0; d < hab; d++) {
          const fx = x0 + (W * (d + 1)) / (hab + 1)
          interior.push([fx, z0, fx, z0 + D])
        }
        const seen = new Set<string>()
        let idx = 0
        for (const [x1, z1, x2, z2] of [...perimeter, ...interior]) {
          const hash = `${Math.round(x1 * 100)},${Math.round(z1 * 100)},${Math.round(x2 * 100)},${Math.round(z2 * 100)}`
          if (seen.has(hash)) continue
          seen.add(hash)
          const exterior = idx < perimeter.length
          idx++
          const w = ctx.scene.addWall(WallSegmentType.RoomWalls, new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2), true, lvl.id)
          w.height = hp
          // Cortina vidrio: piel exterior fina de vidrio; las divisiones
          // interiores conservan el material opaco pedido por el usuario.
          w.thickness = exterior && cortina ? 0.06 : 0.2
          ctx.scene.setWallMaterial(w.id, exterior && cortina ? 'mat.glass' : m)
          ids.push(w.id)
        }
        // Montantes de acero (marco de la cortina) cada ~3 m sobre el perímetro.
        if (cortina) {
          const seenM = new Set<string>()
          for (const [x1, z1, x2, z2] of perimeter) {
            const len = Math.hypot(x2 - x1, z2 - z1)
            const n = Math.max(1, Math.round(len / MULLION_SPACING))
            for (let i = 0; i <= n; i++) {
              const u = i / n
              const mx = x1 + (x2 - x1) * u
              const mz = z1 + (z2 - z1) * u
              const key = `${Math.round(mx * 100)},${Math.round(mz * 100)}`
              if (seenM.has(key)) continue
              seenM.add(key)
              const mont = ctx.scene.createObject('Montante', 'shape', new THREE.Vector3(mx, lvl.elevation + hp / 2, mz), 0, lvl.id)
              mont.size = new THREE.Vector3(0.12, hp, 0.12)
              mont.materialId = 'mat.steel'
              ids.push(mont.id)
            }
          }
        }
        const losa = new SceneObject('Losa', 'shape')
        losa.size = new THREE.Vector3(W, 0.2, D)
        losa.position = new THREE.Vector3(x0 + W / 2, lvl.elevation - 0.1, z0 + D / 2)
        losa.materialId = 'mat.concrete'
        losa.levelId = lvl.id
        ctx.scene.addObject(losa)
        ids.push(losa.id)
        if (f === p - 1) {
          const techo = ctx.scene.createObject('Techo', 'roof', new THREE.Vector3(x0 + W / 2, 0, z0 + D / 2), 0, lvl.id)
          techo.shapeId = roofShapeId(t)
          techo.materialId = 'mat.terracotta'
          techo.roofProps = { type: t, slope: 30, overhang: 0.3, thickness: DEFAULT_ROOF_THICKNESS, ridgeDir: 'x', footprint: [{ x: x0, z: z0 }, { x: x0 + W, z: z0 }, { x: x0 + W, z: z0 + D }, { x: x0, z: z0 + D }], sourceLevelId: lvl.id }
          techo.position.y = lvl.elevation + hp
          ids.push(techo.id)
        }
      }
      return { ok: true, mensaje: `Edificio generado (${fmt(a)}×${fmt(l)} m, ${p} pisos, ~${fmt(p * hp)} m de alto, ${ids.length} elementos).`, ids_creados: ids }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
