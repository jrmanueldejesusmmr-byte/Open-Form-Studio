/** tool colocar_ventana. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { fmt, optNum, optStr, reqNum } from './validate'
import { mustEntry, placeOnWall } from './place'

const VARIANTES_VENTANA: ReadonlyArray<string> = ['fija', 'corrediza', 'abatible', 'dosHojas', 'cuatroHojas']

export const colocarVentana: ToolDef = {
  nombre: 'colocar_ventana',
  descripcion: 'Coloca una ventana realista sobre un muro existente, a N metros de su inicio y cierta altura, cortando un hueco real en el muro. Soporta variantes fija, corrediza, abatible, dos hojas y cuatro hojas, con ángulo de apertura editable.',
  esquema: {
    type: 'object',
    properties: {
      muro_id: { type: 'string', description: 'Id del muro.' },
      posicion: { type: 'number', description: 'Metros desde el inicio del muro.' },
      ancho: { type: 'number', description: 'Ancho en m.', default: 1.2 },
      alto: { type: 'number', description: 'Alto en m.', default: 1.2 },
      altura_antepecho: { type: 'number', description: 'Altura del antepecho en m.', default: 0.9 },
      variante: { type: 'string', description: 'fija, corrediza, abatible, dosHojas o cuatroHojas.', default: 'fija', enum: VARIANTES_VENTANA },
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
      const ancho = optNum(params, 'ancho', 1.2, 0.3, 4)
      const alto = optNum(params, 'alto', 1.2, 0.3, 2.5)
      const ant = optNum(params, 'altura_antepecho', 0.9, 0, 2)
      const variante = optStr(params, 'variante', 'fija')
      if (!VARIANTES_VENTANA.includes(variante)) throw new Error(`Variante desconocida «${variante}».`)
      const angulo = optNum(params, 'angulo_apertura', 0, 0, 90)
      const wall = ctx.scene.getWall(id)
      if (!wall) throw new Error(`El muro «${id}» no existe.`)
      ctx.scene.validateOpening(id, pos, ancho, alto, ant)
      placeOnWall(ctx, id, pos, optStr(params, 'planta', ''))
      return {
        valido: true,
        resumen: `Colocar ventana ${variante} de ${fmt(ancho)} × ${fmt(alto)} m sobre el muro ${id} (antepecho ${fmt(ant)} m, hueco real, apertura ${fmt(angulo)}°).`,
        acciones: [{
          accion: 'colocar_ventana',
          detalle: `opening.window en (${fmt(pos)} m), ${fmt(ancho)} × ${fmt(alto)} m, variante ${variante}`,
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
      const ancho = optNum(params, 'ancho', 1.2, 0.3, 4)
      const alto = optNum(params, 'alto', 1.2, 0.3, 2.5)
      const ant = optNum(params, 'altura_antepecho', 0.9, 0, 2)
      const variante = optStr(params, 'variante', 'fija')
      if (!VARIANTES_VENTANA.includes(variante)) return { ok: false, mensaje: `Variante desconocida «${variante}».`, ids_creados: [] }
      const angulo = optNum(params, 'angulo_apertura', 0, 0, 90)
      const planta = optStr(params, 'planta', '')
      const level = planta ? ctx.scene.getLevel(planta) : ctx.scene.getActiveLevel()
      const elevation = level?.elevation ?? 0
      const entry = mustEntry('opening.window')
      const wall = ctx.scene.getWall(id)
      if (!wall) return { ok: false, mensaje: `El muro «${id}» no existe.`, ids_creados: [] }

      let createdId = ''
      ctx.history.transaction('Colocar ventana', () => {
        ctx.scene.addOpening(id, { wallId: id, x: pos, width: ancho, height: alto, sill: ant, type: 'window', materialId: entry.materialId ?? null })
        const at = placeOnWall(ctx, id, pos, planta)
        const obj = ctx.scene.createObject(entry.name, entry.kind, new THREE.Vector3(at.x, elevation + ant + alto / 2, at.z), at.rot, planta === '' ? undefined : planta)
        obj.shapeId = entry.shapeId
        if (entry.materialId) obj.materialId = entry.materialId
        obj.size.set(ancho, alto, Math.min(0.1, Math.max(0.02, wall.thickness * 0.9)))
        obj.position.y = elevation + ant + alto / 2
        obj.openingVariant = variante
        obj.openingAngle = angulo
        createdId = obj.id
      })
      return { ok: true, mensaje: `Ventana ${variante} colocada sobre el muro ${id} (hueco real).`, ids_creados: [createdId] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
