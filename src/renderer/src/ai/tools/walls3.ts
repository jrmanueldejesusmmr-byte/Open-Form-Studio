/** tools de muros 3/3: mover_muro, borrar_muro, cambiar_altura_muro. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { LIMITS, fmt, reqNum, reqPunto } from './validate'
import { mustWall } from './walls'
export const moverMuro: ToolDef = {
  nombre: 'mover_muro',
  descripcion: 'Mueve un muro a una nueva posición (nuevos puntos inicio/fin en m).',
  esquema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Id del muro.' },
      inicio: { type: 'object', description: 'Nuevo inicio {x, z}.', properties: { x: { type: 'number', description: 'X' }, z: { type: 'number', description: 'Z' } }, required: ['x', 'z'] },
      fin: { type: 'object', description: 'Nuevo fin {x, z}.', properties: { x: { type: 'number', description: 'X' }, z: { type: 'number', description: 'Z' } }, required: ['x', 'z'] }
    },
    required: ['id', 'inicio', 'fin']
  },
  dryRun(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') throw new Error('Falta el parámetro obligatorio «id».')
      mustWall(ctx, id)
      const a = reqPunto(params, 'inicio')
      const b = reqPunto(params, 'fin')
      return { valido: true, resumen: `Mover el muro ${id} a (${fmt(a.x)}, ${fmt(a.z)}) → (${fmt(b.x)}, ${fmt(b.z)}).`, acciones: [{ accion: 'mover_muro', detalle: `${id} → (${fmt(a.x)}, ${fmt(a.z)}) → (${fmt(b.x)}, ${fmt(b.z)})`, ids_afectados: [id] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') return { ok: false, mensaje: 'Falta el parámetro obligatorio «id».', ids_creados: [] }
      mustWall(ctx, id)
      const a = reqPunto(params, 'inicio')
      const b = reqPunto(params, 'fin')
      ctx.scene.moveWall(id, new THREE.Vector3(a.x, 0, a.z), new THREE.Vector3(b.x, 0, b.z))
      return { ok: true, mensaje: `Muro ${id} movido.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
export const borrarMuro: ToolDef = {
  nombre: 'borrar_muro',
  descripcion: 'Borra un muro por su id.',
  esquema: { type: 'object', properties: { id: { type: 'string', description: 'Id del muro.' } }, required: ['id'] },
  dryRun(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') throw new Error('Falta el parámetro obligatorio «id».')
      mustWall(ctx, id)
      return { valido: true, resumen: `Borrar el muro ${id}.`, acciones: [{ accion: 'borrar_muro', detalle: id, ids_afectados: [id] }], avisos: ['Se puede deshacer con Ctrl+Z.'] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') return { ok: false, mensaje: 'Falta el parámetro obligatorio «id».', ids_creados: [] }
      mustWall(ctx, id)
      ctx.scene.removeWall(id)
      return { ok: true, mensaje: `Muro ${id} borrado.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
export const alturaMuro: ToolDef = {
  nombre: 'cambiar_altura_muro',
  descripcion: 'Cambia la altura de un muro (0.3–12 m).',
  esquema: { type: 'object', properties: { id: { type: 'string', description: 'Id del muro.' }, altura: { type: 'number', description: 'Nueva altura en m.' } }, required: ['id', 'altura'] },
  dryRun(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') throw new Error('Falta el parámetro obligatorio «id».')
      mustWall(ctx, id)
      const h = reqNum(params, 'altura', LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      return { valido: true, resumen: `Cambiar la altura del muro ${id} a ${fmt(h)} m.`, acciones: [{ accion: 'cambiar_altura_muro', detalle: `${id} → h=${fmt(h)} m`, ids_afectados: [id] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') return { ok: false, mensaje: 'Falta el parámetro obligatorio «id».', ids_creados: [] }
      const w = ctx.scene.getWall(id)
      if (!w) return { ok: false, mensaje: `El muro «${id}» no existe. Usa describir_escena para ver los ids.`, ids_creados: [] }
      const h = reqNum(params, 'altura', LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const before = { sx: w.start.x, sz: w.start.z, ex: w.end.x, ez: w.end.z }
      w.height = h
      ctx.scene.moveWall(id, new THREE.Vector3(before.sx, 0, before.sz), new THREE.Vector3(before.ex, 0, before.ez))
      return { ok: true, mensaje: `Altura del muro ${id} → ${fmt(h)} m.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
