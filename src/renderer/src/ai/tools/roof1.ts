/** tools crear_techo + editar_techo (techo ajustado a contorno). */
import { isMaterialId } from '../../catalog/materials'
import { roofTypeLabel, type RoofType } from '../../models/Roof'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr } from './validate'
import { checkLevel } from './walls'
const TYPES = ['flat', 'gable', 'hip'] as const
function mustType(v: string): RoofType {
  if (!(TYPES as readonly string[]).includes(v)) throw new Error(`Tipo de techo desconocido «${v}» (plano, a dos aguas o a cuatro aguas).`)
  return v as RoofType
}
function mustContour(raw: unknown): Array<{ x: number; z: number }> {
  if (!Array.isArray(raw) || raw.length < 3) throw new Error('El contorno necesita al menos 3 puntos {x, z}.')
  if (raw.length > 64) throw new Error('El contorno admite como máximo 64 puntos.')
  return raw.map((p) => {
    const q = p as { x?: unknown; z?: unknown }
    const x = typeof q.x === 'number' ? q.x : Number(q.x)
    const z = typeof q.z === 'number' ? q.z : Number(q.z)
    if (!Number.isFinite(x) || x < LIMITS.COORD_MIN || x > LIMITS.COORD_MAX) throw new Error('Punto del contorno fuera de rango (±100 m).')
    if (!Number.isFinite(z) || z < LIMITS.COORD_MIN || z > LIMITS.COORD_MAX) throw new Error('Punto del contorno fuera de rango (±100 m).')
    return { x, z }
  })
}
export const crearTecho: ToolDef = {
  nombre: 'crear_techo',
  descripcion: 'Crea un techo por área: contorno manual [{x,z}…] o "auto" (contorno exterior de los muros del piso). Tipos: plano, a dos aguas, a cuatro aguas.',
  esquema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', description: 'flat (plano), gable (dos aguas) o hip (cuatro aguas).', enum: [...TYPES], default: 'gable' },
      contorno: { type: 'array', description: 'Contorno cerrado [{x, z}…] en metros, o la palabra "auto".', items: { type: 'object', description: 'Punto', properties: { x: { type: 'number', description: 'X' }, z: { type: 'number', description: 'Z' } }, required: ['x', 'z'] } },
      pendiente: { type: 'number', description: 'Pendiente en grados (0–60).', default: 30 },
      alero: { type: 'number', description: 'Voladizo en m (0–2).', default: 0.3 },
      espesor: { type: 'number', description: 'Espesor de la losa en m (0.02–1).', default: 0.15 },
      material: { type: 'string', description: 'Material opaco (mat.terracotta…).', default: 'mat.terracotta' },
      piso: { type: 'string', description: 'Piso origen; vacío = activo.' },
      planta: { type: 'string', description: 'Alias de piso (compatibilidad).' }
    },
    required: []
  },
  dryRun(params, ctx) {
    try {
      const tipo = mustType(optStr(params, 'tipo', 'gable'))
      const raw = params['contorno']
      const auto = raw === undefined || raw === null || raw === 'auto'
      const c = auto ? null : mustContour(raw)
      const p = optNum(params, 'pendiente', 30, LIMITS.SLOPE_MIN, LIMITS.SLOPE_MAX)
      const a = optNum(params, 'alero', 0.3, LIMITS.OVERHANG_MIN, LIMITS.OVERHANG_MAX)
      const m = optStr(params, 'material', 'mat.terracotta')
      if (!isMaterialId(m)) throw new Error(`El material «${m}» no está en el catálogo.`)
      const piso = optStr(params, 'piso', optStr(params, 'planta', ''))
      checkLevel(ctx, piso)
      const resumen = auto
        ? `Crear techo ${roofTypeLabel(tipo)} automático sobre los muros del piso (pendiente ${fmt(p)}°, alero ${fmt(a)} m).`
        : `Crear techo ${roofTypeLabel(tipo)} sobre ${c?.length ?? 0} puntos (pendiente ${fmt(p)}°, alero ${fmt(a)} m).`
      return { valido: true, resumen, acciones: [{ accion: 'crear_techo', detalle: resumen, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const tipo = mustType(optStr(params, 'tipo', 'gable'))
      const raw = params['contorno']
      const auto = raw === undefined || raw === null || raw === 'auto'
      const c = auto ? undefined : mustContour(raw)
      const p = optNum(params, 'pendiente', 30, LIMITS.SLOPE_MIN, LIMITS.SLOPE_MAX)
      const a = optNum(params, 'alero', 0.3, LIMITS.OVERHANG_MIN, LIMITS.OVERHANG_MAX)
      const e = optNum(params, 'espesor', 0.15, 0.02, 1)
      const m = optStr(params, 'material', 'mat.terracotta')
      if (!isMaterialId(m)) return { ok: false, mensaje: `El material «${m}» no está en el catálogo.`, ids_creados: [] }
      const piso = optStr(params, 'piso', optStr(params, 'planta', ''))
      checkLevel(ctx, piso)
      const obj = ctx.scene.createRoof({
        footprint: c,
        auto,
        type: tipo,
        slope: p,
        overhang: a,
        thickness: e,
        materialId: m,
        levelId: piso === '' ? undefined : piso
      })
      if (!obj) return { ok: false, mensaje: 'No hay un contorno cerrado de muros en el piso activo para el techo automático.', ids_creados: [] }
      return { ok: true, mensaje: `Techo ${roofTypeLabel(tipo)} creado sobre el piso «${ctx.scene.getLevel(obj.levelId)?.name ?? ''}».`, ids_creados: [obj.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
