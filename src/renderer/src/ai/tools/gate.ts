/** tool colocar_porton. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { LIMITS, fmt, optStr, reqNum } from './validate'
import { checkLevel } from './walls'
import { mustEntry } from './place'
export const colocarPorton: ToolDef = {
  nombre: 'colocar_porton',
  descripcion: 'Coloca un portón en una posición XZ con rotación.',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X en m.' },
      z: { type: 'number', description: 'Z en m.' },
      rotacion: { type: 'number', description: 'Rotación en grados.', default: 0 },
      ancho: { type: 'number', description: 'Ancho en m.', default: 3 },
      planta: { type: 'string', description: 'Id de planta; vacío = activa.' }
    },
    required: ['x', 'z']
  },
  dryRun(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      checkLevel(ctx, optStr(params, 'planta', ''))
      return { valido: true, resumen: `Colocar portón en (${fmt(x)}, ${fmt(z)}).`, acciones: [{ accion: 'colocar_porton', detalle: `(${fmt(x)}, ${fmt(z)})`, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const rot = params['rotacion'] === undefined ? 0 : reqNum(params, 'rotacion', -360, 360)
      const ancho = params['ancho'] === undefined ? 3 : reqNum(params, 'ancho', 1, 8)
      const planta = optStr(params, 'planta', '')
      checkLevel(ctx, planta)
      const entry = mustEntry('opening.door')
      const o = ctx.scene.createObject('Portón', entry.kind, new THREE.Vector3(x, 0, z), (rot * Math.PI) / 180, planta === '' ? undefined : planta)
      o.shapeId = entry.shapeId
      o.materialId = 'mat.metal-pot'
      o.size.set(ancho, 2, 0.12)
      return { ok: true, mensaje: 'Portón colocado.', ids_creados: [o.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
