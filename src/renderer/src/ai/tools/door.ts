/** tool colocar_puerta. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { fmt, optNum, optStr, reqNum } from './validate'
import { mustEntry, placeOnWall } from './place'

const VARIANTES_PUERTA: ReadonlyArray<string> = ['simple', 'doble', 'corrediza', 'vidrio']

export const colocarPuerta: ToolDef = {
  nombre: 'colocar_puerta',
  descripcion: 'Coloca una puerta realista sobre un muro existente, a N metros de su inicio, cortando un hueco real en el muro. Soporta variantes simple, doble, corrediza y de vidrio, con ángulo de apertura editable.',
  esquema: {
    type: 'object',
    properties: {
      muro_id: { type: 'string', description: 'Id del muro (ver describir_escena).' },
      posicion: { type: 'number', description: 'Metros desde el inicio del muro.' },
      ancho: { type: 'number', description: 'Ancho en m.', default: 0.9 },
      alto: { type: 'number', description: 'Alto en m.', default: 2.1 },
      variante: { type: 'string', description: 'simple, doble, corrediza o vidrio.', default: 'simple', enum: VARIANTES_PUERTA },
      angulo_apertura: { type: 'number', description: 'Ángulo de apertura en grados (0 cerrado, 90 abierto).', default: 0, minimum: 0, maximum: 90 },
      planta: { type: 'string', description: 'Id de planta; vacío = activa.' }
    },
    required: ['muro_id', 'posicion']
  },
  dryRun(params, ctx) {
    try {
      const id = params['muro_id']
      if (typeof id !== 'string' || id === '') throw new Error('Falta el parámetro obligatorio «muro_id».')
      const pos = reqNum(params, 'posicion', 0, 60)
      const ancho = optNum(params, 'ancho', 0.9, 0.5, 2.5)
      const alto = optNum(params, 'alto', 2.1, 1.5, 3)
      const variante = optStr(params, 'variante', 'simple')
      if (!VARIANTES_PUERTA.includes(variante)) throw new Error(`Variante desconocida «${variante}».`)
      const angulo = optNum(params, 'angulo_apertura', 0, 0, 90)
      mustEntry('opening.door')
      const wall = ctx.scene.getWall(id)
      if (!wall) throw new Error(`El muro «${id}» no existe.`)
      ctx.scene.validateOpening(id, pos, ancho, alto, 0)
      const at = placeOnWall(ctx, id, pos, optStr(params, 'planta', ''))
      return {
        valido: true,
        resumen: `Colocar puerta ${variante} de ${fmt(ancho)} × ${fmt(alto)} m sobre el muro ${id} a ${fmt(pos)} m del inicio (hueco real, apertura ${fmt(angulo)}°).`,
        acciones: [{
          accion: 'colocar_puerta',
          detalle: `opening.door en (${fmt(at.x)}, ${fmt(at.z)}), ${fmt(ancho)} × ${fmt(alto)} m, variante ${variante}`,
          ids_afectados: [id]
        }],
        avisos: []
      }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = params['muro_id']
      if (typeof id !== 'string' || id === '') return { ok: false, mensaje: 'Falta el parámetro obligatorio «muro_id».', ids_creados: [] }
      const pos = reqNum(params, 'posicion', 0, 60)
      const ancho = optNum(params, 'ancho', 0.9, 0.5, 2.5)
      const alto = optNum(params, 'alto', 2.1, 1.5, 3)
      const variante = optStr(params, 'variante', 'simple')
      if (!VARIANTES_PUERTA.includes(variante)) return { ok: false, mensaje: `Variante desconocida «${variante}».`, ids_creados: [] }
      const angulo = optNum(params, 'angulo_apertura', 0, 0, 90)
      const planta = optStr(params, 'planta', '')
      const level = planta ? ctx.scene.getLevel(planta) : ctx.scene.getActiveLevel()
      const elevation = level?.elevation ?? 0
      const entry = mustEntry('opening.door')
      const wall = ctx.scene.getWall(id)
      if (!wall) return { ok: false, mensaje: `El muro «${id}» no existe.`, ids_creados: [] }

      let createdId = ''
      ctx.history.transaction('Colocar puerta', () => {
        ctx.scene.addOpening(id, { wallId: id, x: pos, width: ancho, height: alto, sill: 0, type: 'door', materialId: entry.materialId ?? null })
        const at = placeOnWall(ctx, id, pos, planta)
        const obj = ctx.scene.createObject(entry.name, entry.kind, new THREE.Vector3(at.x, elevation + alto / 2, at.z), at.rot, planta === '' ? undefined : planta)
        obj.shapeId = entry.shapeId
        if (entry.materialId) obj.materialId = entry.materialId
        obj.size.set(ancho, alto, Math.min(0.12, Math.max(0.02, wall.thickness * 0.9)))
        obj.openingVariant = variante
        obj.openingAngle = angulo
        createdId = obj.id
      })
      return { ok: true, mensaje: `Puerta ${variante} colocada sobre el muro ${id} (hueco real).`, ids_creados: [createdId] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
