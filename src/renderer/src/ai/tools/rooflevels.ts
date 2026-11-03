/** tools editar_techo + crear_planta + duplicar_planta + cambiar_planta_activa. */
import type { ToolDef } from './types'
import { fmt, optNum, optStr, reqStr } from './validate'
import { LIMITS } from './validate'
function mustRoofObj(ctx: import('./types').ToolContext, id: string): { id: string } {
  const o = ctx.scene.getObject(id)
  if (!o || o.kind !== 'roof') throw new Error(`El techo «${id}» no existe (usa describir_escena).`)
  return { id: o.id }
}
export const editarTecho: ToolDef = {
  nombre: 'editar_techo',
  descripcion: 'Edita pendiente, alero o material de un techo existente.',
  esquema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Id del techo.' },
      pendiente: { type: 'number', description: 'Nueva pendiente en grados.' },
      alero: { type: 'number', description: 'Nuevo voladizo en m.' },
      material: { type: 'string', description: 'Nuevo material.' }
    },
    required: ['id']
  },
  dryRun(params, ctx) {
    try {
      const id = reqStr(params, 'id')
      mustRoofObj(ctx, id)
      const parts: string[] = []
      if (params['pendiente'] !== undefined) parts.push(`pendiente ${fmt(optNum(params, 'pendiente', 30, LIMITS.SLOPE_MIN, LIMITS.SLOPE_MAX))}°`)
      if (params['alero'] !== undefined) parts.push(`alero ${fmt(optNum(params, 'alero', 0.3, LIMITS.OVERHANG_MIN, LIMITS.OVERHANG_MAX))} m`)
      if (params['material'] !== undefined) parts.push(`material ${optStr(params, 'material', '')}`)
      if (parts.length === 0) throw new Error('Indica al menos pendiente, alero o material.')
      return { valido: true, resumen: `Editar el techo ${id}: ${parts.join(', ')}.`, acciones: [{ accion: 'editar_techo', detalle: `${id}: ${parts.join(', ')}`, ids_afectados: [id] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = reqStr(params, 'id')
      mustRoofObj(ctx, id)
      const o = ctx.scene.getObject(id)
      if (!o) return { ok: false, mensaje: `El techo «${id}» no existe.`, ids_creados: [] }
      const parts: string[] = []
      if (params['pendiente'] !== undefined) {
        const p = optNum(params, 'pendiente', 30, LIMITS.SLOPE_MIN, LIMITS.SLOPE_MAX)
        if (o.roofProps) o.roofProps.slope = p
        parts.push(`pendiente ${fmt(p)}°`)
      }
      if (params['alero'] !== undefined) {
        const a = optNum(params, 'alero', 0.3, LIMITS.OVERHANG_MIN, LIMITS.OVERHANG_MAX)
        if (o.roofProps) o.roofProps.overhang = a
        parts.push(`alero ${fmt(a)} m`)
      }
      if (params['material'] !== undefined) {
        const m = optStr(params, 'material', '')
        ctx.scene.setObjectMaterial(id, m)
        parts.push(`material ${m}`)
      }
      if (parts.length === 0) return { ok: false, mensaje: 'Indica al menos pendiente, alero o material.', ids_creados: [] }
      ctx.scene.moveObject(id, o.position.clone(), o.rotationY)
      return { ok: true, mensaje: `Techo ${id} editado (${parts.join(', ')}).`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
export const crearPlanta: ToolDef = {
  nombre: 'crear_planta',
  descripcion: 'Crea un piso nuevo encima del anterior y lo deja activo.',
  esquema: { type: 'object', properties: { altura: { type: 'number', description: 'Altura en m.', default: 2.8 } }, required: [] },
  dryRun(params, ctx) {
    try {
      const h = optNum(params, 'altura', 2.8, 1.5, 6)
      const n = ctx.scene.getLevels().length
      return { valido: true, resumen: `Crear la planta ${n} (altura ${fmt(h)} m).`, acciones: [{ accion: 'crear_planta', detalle: `planta ${n}, h=${fmt(h)} m`, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const h = optNum(params, 'altura', 2.8, 1.5, 6)
      const lvl = ctx.scene.addLevel()
      ctx.scene.updateLevel(lvl.id, { height: h })
      return { ok: true, mensaje: `Planta «${lvl.name}» creada.`, ids_creados: [lvl.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
export const cambiarPlanta: ToolDef = {
  nombre: 'cambiar_planta_activa',
  descripcion: 'Cambia la planta activa (donde se dibuja).',
  esquema: { type: 'object', properties: { planta: { type: 'string', description: 'Id de la planta.' } }, required: ['planta'] },
  dryRun(params, ctx) {
    try {
      const id = reqStr(params, 'planta')
      const lvl = ctx.scene.getLevel(id)
      if (!lvl) throw new Error(`La planta «${id}» no existe.`)
      return { valido: true, resumen: `Activar la planta «${lvl.name}».`, acciones: [{ accion: 'cambiar_planta_activa', detalle: lvl.name, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = reqStr(params, 'planta')
      if (!ctx.scene.getLevel(id)) return { ok: false, mensaje: `La planta «${id}» no existe.`, ids_creados: [] }
      ctx.scene.setActiveLevel(id)
      return { ok: true, mensaje: `Planta activa: «${ctx.scene.getActiveLevel().name}».`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
