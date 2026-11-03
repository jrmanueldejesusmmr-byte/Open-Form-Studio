/** tools colocar_objeto + mover_objeto. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr, reqNum, reqStr } from './validate'
import { checkLevel } from './walls'
import { mustEntry } from './place'
export const colocarObjeto: ToolDef = {
  nombre: 'colocar_objeto',
  descripcion: 'Coloca un elemento del catálogo (mueble, forma, losa…) en una posición XZ con rotación.',
  esquema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', description: 'Id del catálogo (furn.sofa, shape.l, opening.slab…).' },
      x: { type: 'number', description: 'X en m.' },
      z: { type: 'number', description: 'Z en m.' },
      rotacion: { type: 'number', description: 'Rotación en grados.', default: 0 },
      planta: { type: 'string', description: 'Id de planta; vacío = activa.' }
    },
    required: ['tipo', 'x', 'z']
  },
  dryRun(params, ctx) {
    try {
      const tipo = reqStr(params, 'tipo')
      mustEntry(tipo)
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const rot = optNum(params, 'rotacion', 0, -360, 360)
      checkLevel(ctx, optStr(params, 'planta', ''))
      return { valido: true, resumen: `Colocar «${tipo}» en (${fmt(x)}, ${fmt(z)}), rotación ${fmt(rot)}°.`, acciones: [{ accion: 'colocar_objeto', detalle: `${tipo} en (${fmt(x)}, ${fmt(z)})`, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const tipo = reqStr(params, 'tipo')
      const entry = mustEntry(tipo)
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const rot = optNum(params, 'rotacion', 0, -360, 360)
      const planta = optStr(params, 'planta', '')
      checkLevel(ctx, planta)
      const obj = ctx.scene.createObject(entry.name, entry.kind, new THREE.Vector3(x, 0, z), (rot * Math.PI) / 180, planta === '' ? undefined : planta)
      obj.shapeId = entry.shapeId
      if (entry.materialId) obj.materialId = entry.materialId
      return { ok: true, mensaje: `«${entry.name}» colocado.`, ids_creados: [obj.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
function mustObj(ctx: import('./types').ToolContext, id: string): { id: string } {
  const o = ctx.scene.getObject(id)
  if (!o) throw new Error(`El objeto «${id}» no existe. Usa describir_escena para ver los ids.`)
  return { id: o.id }
}
export const moverObjeto: ToolDef = {
  nombre: 'mover_objeto',
  descripcion: 'Mueve un objeto a una nueva posición XZ con rotación opcional.',
  esquema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Id del objeto.' },
      x: { type: 'number', description: 'Nueva X en m.' },
      z: { type: 'number', description: 'Nueva Z en m.' },
      rotacion: { type: 'number', description: 'Rotación en grados (opcional).' }
    },
    required: ['id', 'x', 'z']
  },
  dryRun(params, ctx) {
    try {
      const id = reqStr(params, 'id')
      mustObj(ctx, id)
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      return { valido: true, resumen: `Mover el objeto ${id} a (${fmt(x)}, ${fmt(z)}).`, acciones: [{ accion: 'mover_objeto', detalle: `${id} → (${fmt(x)}, ${fmt(z)})`, ids_afectados: [id] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = reqStr(params, 'id')
      mustObj(ctx, id)
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const o = ctx.scene.getObject(id)
      if (!o) return { ok: false, mensaje: `El objeto «${id}» no existe.`, ids_creados: [] }
      const rot = params['rotacion'] === undefined ? o.rotationY : (optNum(params, 'rotacion', 0, -360, 360) * Math.PI) / 180
      ctx.scene.moveObject(id, new THREE.Vector3(x, o.position.y, z), rot)
      return { ok: true, mensaje: `Objeto ${id} movido.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
