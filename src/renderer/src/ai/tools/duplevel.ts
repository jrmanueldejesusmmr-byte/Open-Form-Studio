/** tool duplicar_planta (copia muros/objetos del piso origen al nuevo). */
import { SceneObject } from '../../models/SceneObject'
import type { ToolDef } from './types'
import { optStr } from './validate'
export const duplicarPlanta: ToolDef = {
  nombre: 'duplicar_planta',
  descripcion: 'Duplica una planta: crea un piso nuevo con copias de sus muros y objetos.',
  esquema: {
    type: 'object',
    properties: { planta: { type: 'string', description: 'Id de la planta a duplicar; vacío = activa.' } },
    required: []
  },
  dryRun(params, ctx) {
    try {
      const id = optStr(params, 'planta', '')
      const src = id === '' ? ctx.scene.getActiveLevel() : ctx.scene.getLevel(id)
      if (!src) throw new Error(`La planta «${id}» no existe.`)
      const nW = ctx.scene.getWalls().filter((w) => w.levelId === src.id).length
      const nO = ctx.scene.getObjects().filter((o) => o.levelId === src.id).length
      return { valido: true, resumen: `Duplicar «${src.name}» en un piso nuevo (${nW} muros, ${nO} objetos).`, acciones: [{ accion: 'duplicar_planta', detalle: `${src.name}: ${nW} muros + ${nO} objetos`, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = optStr(params, 'planta', '')
      const src = id === '' ? ctx.scene.getActiveLevel() : ctx.scene.getLevel(id)
      if (!src) return { ok: false, mensaje: `La planta «${id}» no existe.`, ids_creados: [] }
      const dst = ctx.scene.addLevel()
      ctx.scene.updateLevel(dst.id, { height: src.height })
      const ids: string[] = [dst.id]
      for (const w of ctx.scene.getWalls().filter((x) => x.levelId === src.id)) {
        const c = ctx.scene.addWall(w.type, w.start.clone(), w.end.clone(), w.aiControlled, dst.id)
        c.height = w.height
        c.thickness = w.thickness
        c.color = w.color
        c.materialId = w.materialId
        ids.push(c.id)
      }
      for (const o of ctx.scene.getObjects().filter((x) => x.levelId === src.id)) {
        const c = ctx.scene.addObject(new SceneObject(o.name, o.kind))
        c.position.copy(o.position)
        c.rotationY = o.rotationY
        c.size.copy(o.size)
        c.color = o.color
        c.shapeId = o.shapeId
        c.materialId = o.materialId
        c.levelId = dst.id
        // Los techos pertenecen a un piso: la copia apunta al piso nuevo y
        // recoloca su cota (elevación + altura del destino), no la del origen.
        if (o.roofProps) {
          c.roofProps = {
            ...o.roofProps,
            footprint: o.roofProps.footprint.map((p) => ({ x: p.x, z: p.z })),
            sourceLevelId: dst.id
          }
          const lvl = ctx.scene.getLevel(dst.id)
          if (lvl) c.position.y = lvl.elevation + lvl.height
        } else {
          c.position.y = ctx.scene.getLevel(dst.id)?.elevation ?? c.position.y
        }
        ids.push(c.id)
      }
      return { ok: true, mensaje: `Planta «${dst.name}» creada como copia de «${src.name}».`, ids_creados: ids }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
