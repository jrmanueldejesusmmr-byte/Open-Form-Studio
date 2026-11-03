/** tools crear_cerca + colocar_porton. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr, reqNum } from './validate'
import { checkLevel } from './walls'
import { mustEntry } from './place'
function mustPuntos(raw: unknown): Array<{ x: number; z: number }> {
  if (!Array.isArray(raw) || raw.length < 2) throw new Error('La cerca necesita al menos 2 puntos {x, z}.')
  if (raw.length > 32) throw new Error('La cerca admite como máximo 32 puntos.')
  return raw.map((p) => {
    const q = p as { x?: unknown; z?: unknown }
    const x = reqNum({ v: q.x }, 'v', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
    const z = reqNum({ v: q.z }, 'v', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
    return { x, z }
  })
}
export const crearCerca: ToolDef = {
  nombre: 'crear_cerca',
  descripcion: 'Crea una cerca por tramos rectos entre puntos XZ, con estilo y altura.',
  esquema: {
    type: 'object',
    properties: {
      puntos: { type: 'array', description: 'Puntos [{x, z}…] en metros.', items: { type: 'object', description: 'Punto', properties: { x: { type: 'number', description: 'X' }, z: { type: 'number', description: 'Z' } }, required: ['x', 'z'] } },
      estilo: { type: 'string', description: 'Id del catálogo (muro bajo por defecto).', default: 'furn.desk' },
      altura: { type: 'number', description: 'Altura en m (0.3–3).', default: 1.2 },
      planta: { type: 'string', description: 'Id de planta; vacío = activa.' }
    },
    required: ['puntos']
  },
  dryRun(params, ctx) {
    try {
      const pts = mustPuntos(params['puntos'])
      const h = optNum(params, 'altura', 1.2, LIMITS.FENCE_H_MIN, LIMITS.FENCE_H_MAX)
      mustEntry(optStr(params, 'estilo', 'furn.desk'))
      checkLevel(ctx, optStr(params, 'planta', ''))
      let L = 0
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
      return { valido: true, resumen: `Crear cerca de ${pts.length - 1} tramos (${fmt(L)} m, altura ${fmt(h)} m).`, acciones: [{ accion: 'crear_cerca', detalle: `${pts.length - 1} tramos, ${fmt(L)} m, h=${fmt(h)} m`, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const pts = mustPuntos(params['puntos'])
      const h = optNum(params, 'altura', 1.2, LIMITS.FENCE_H_MIN, LIMITS.FENCE_H_MAX)
      const entry = mustEntry(optStr(params, 'estilo', 'furn.desk'))
      const planta = optStr(params, 'planta', '')
      checkLevel(ctx, planta)
      const lvl = planta === '' ? undefined : planta
      const ids: string[] = []
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        const L = Math.hypot(b.x - a.x, b.z - a.z)
        if (L < 0.1) continue
        const o = ctx.scene.createObject('Cerca', entry.kind, new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2), Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, lvl)
        o.shapeId = entry.shapeId
        o.materialId = 'mat.wood'
        o.size.set(L, h, 0.08)
        ids.push(o.id)
      }
      return { ok: true, mensaje: `Cerca creada (${ids.length} tramos).`, ids_creados: ids }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
