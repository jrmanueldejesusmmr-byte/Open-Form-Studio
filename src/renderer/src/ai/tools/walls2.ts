/** tools de muros 2/3: crear_habitacion + alargar_o_acortar_muro. */
import * as THREE from 'three'
import { WallSegmentType } from '../../models/Wall'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr, reqNum } from './validate'
import { checkLevel, checkMaterial, mustWall } from './walls'
export const crearHabitacion: ToolDef = {
  nombre: 'crear_habitacion',
  descripcion: 'Crea 4 muros formando una habitación rectangular (ancho × largo en m) con esquina en (x, z).',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Esquina X en m.' },
      z: { type: 'number', description: 'Esquina Z en m.' },
      ancho: { type: 'number', description: 'Ancho en m (0.2–60).' },
      largo: { type: 'number', description: 'Largo en m (0.2–60).' },
      altura: { type: 'number', description: 'Altura en m.', default: 2.8 },
      material: { type: 'string', description: 'Material de los 4 muros.' },
      planta: { type: 'string', description: 'Id de planta; vacío = activa.' }
    },
    required: ['x', 'z', 'ancho', 'largo']
  },
  dryRun(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const a = reqNum(params, 'ancho', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const l = reqNum(params, 'largo', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const h = optNum(params, 'altura', 2.8, LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const mat = optStr(params, 'material', '')
      checkMaterial(mat)
      checkLevel(ctx, optStr(params, 'planta', ''))
      return {
        valido: true,
        resumen: `Crear habitación de ${fmt(a)} × ${fmt(l)} m (4 muros, altura ${fmt(h)} m).`,
        acciones: [
          {
            accion: 'crear_habitacion',
            detalle: `esquina (${fmt(x)}, ${fmt(z)}), ${fmt(a)} × ${fmt(l)} m, h=${fmt(h)}${mat ? `, ${mat}` : ''}`,
            ids_afectados: []
          }
        ],
        avisos: [] as string[]
      }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const a = reqNum(params, 'ancho', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const l = reqNum(params, 'largo', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const h = optNum(params, 'altura', 2.8, LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const matRaw = optStr(params, 'material', '')
      checkMaterial(matRaw)
      const planta = optStr(params, 'planta', '')
      checkLevel(ctx, planta)
      const lvl = planta === '' ? undefined : planta
      const pts = [[x, z, x + a, z], [x + a, z, x + a, z + l], [x + a, z + l, x, z + l], [x, z + l, x, z]]
      const ids: string[] = []
      for (const [x1, z1, x2, z2] of pts) {
        const w = ctx.scene.addWall(WallSegmentType.RoomWalls, new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2), true, lvl)
        w.height = h
        if (matRaw !== '') ctx.scene.setWallMaterial(w.id, matRaw)
        ids.push(w.id)
      }
      return { ok: true, mensaje: `Habitación creada (${fmt(a)} × ${fmt(l)} m, 4 muros).`, ids_creados: ids }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
export const alargarMuro: ToolDef = {
  nombre: 'alargar_o_acortar_muro',
  descripcion: 'Alarga (delta positivo) o acorta (delta negativo, en m) un muro desde su extremo final.',
  esquema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Id del muro (ver describir_escena).' },
      delta: { type: 'number', description: 'Metros a alargar (+) o acortar (−), máx ±30.' }
    },
    required: ['id', 'delta']
  },
  dryRun(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') throw new Error('Falta el parámetro obligatorio «id».')
      const w = mustWall(ctx, id)
      const d = reqNum(params, 'delta', -LIMITS.DELTA_MAX, LIMITS.DELTA_MAX)
      const L = w.len + d
      if (L < LIMITS.WALL_MIN || L > LIMITS.WALL_MAX) return { valido: false, resumen: '', acciones: [], avisos: [], error: `El muro quedaría en ${fmt(L)} m; debe estar entre ${LIMITS.WALL_MIN} y ${LIMITS.WALL_MAX} m.` }
      const verbo = d >= 0 ? 'Alargar' : 'Acortar'
      return { valido: true, resumen: `${verbo} el muro ${id} en ${fmt(Math.abs(d))} m (de ${fmt(w.len)} a ${fmt(L)} m).`, acciones: [{ accion: 'alargar_o_acortar_muro', detalle: `${id}: ${fmt(w.len)} → ${fmt(L)} m`, ids_afectados: [id] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = params['id']
      if (typeof id !== 'string' || id === '') return { ok: false, mensaje: 'Falta el parámetro obligatorio «id».', ids_creados: [] }
      const w = mustWall(ctx, id)
      const d = reqNum(params, 'delta', -LIMITS.DELTA_MAX, LIMITS.DELTA_MAX)
      const L = w.len + d
      if (L < LIMITS.WALL_MIN || L > LIMITS.WALL_MAX) return { ok: false, mensaje: `El muro quedaría en ${fmt(L)} m; debe estar entre ${LIMITS.WALL_MIN} y ${LIMITS.WALL_MAX} m.`, ids_creados: [] }
      const dx = w.ex - w.sx
      const dz = w.ez - w.sz
      const ux = dx / w.len
      const uz = dz / w.len
      ctx.scene.moveWall(id, new THREE.Vector3(w.sx, 0, w.sz), new THREE.Vector3(w.ex + ux * d, 0, w.ez + uz * d))
      return { ok: true, mensaje: `Muro ${id} ahora mide ${fmt(L)} m.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
