/** tools describir_escena + seleccionar. */
import type { ToolDef } from './types'
import { fmt } from './validate'
export const describirEscena: ToolDef = {
  nombre: 'describir_escena',
  descripcion: 'Devuelve la lista compacta de muros, objetos y plantas con ids y medidas.',
  esquema: { type: 'object', properties: {}, required: [] },
  dryRun(_params, ctx) {
    const nW = ctx.scene.getWalls().length
    const nO = ctx.scene.getObjects().length
    return { valido: true, resumen: `Describir la escena (${nW} muros, ${nO} objetos).`, acciones: [{ accion: 'describir_escena', detalle: `${nW} muros + ${nO} objetos`, ids_afectados: [] }], avisos: [] }
  },
  run(_params, ctx) {
    const lvls = ctx.scene.getLevels().map((l) => `${l.id} («${l.name}», cota ${fmt(l.elevation)} m, altura ${fmt(l.height)} m)`).join('; ')
    const walls = ctx.scene.getWalls().map((w) => `${w.id} [${w.type}] (${fmt(w.start.x)}, ${fmt(w.start.z)}) → (${fmt(w.end.x)}, ${fmt(w.end.z)}), L=${fmt(w.start.distanceTo(w.end))} m, h=${fmt(w.height)} m${w.materialId ? `, ${w.materialId}` : ''}, planta ${w.levelId}`).join('\n')
    const objs = ctx.scene.getObjects().map((o) => `${o.id} «${o.name}» [${o.kind}] en (${fmt(o.position.x)}, ${fmt(o.position.z)}), planta ${o.levelId}${o.materialId ? `, ${o.materialId}` : ''}`).join('\n')
    const texto = `Plantas: ${lvls || '(ninguna)'}\nMuros (${ctx.scene.getWalls().length}):\n${walls || '(ninguno)'}\nObjetos (${ctx.scene.getObjects().length}):\n${objs || '(ninguno)'}\nPlanta activa: ${ctx.scene.getActiveLevel().name}.`
    return { ok: true, mensaje: texto, ids_creados: [] }
  }
}
export const seleccionar: ToolDef = {
  nombre: 'seleccionar',
  descripcion: 'Selecciona muros/objetos por ids (limpia la selección anterior).',
  esquema: { type: 'object', properties: { ids: { type: 'array', description: 'Ids a seleccionar.', items: { type: 'string', description: 'Id' } } }, required: ['ids'] },
  dryRun(params, ctx) {
    try {
      const raw = params['ids']
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Indica al menos un id.')
      const ids = raw.map(String)
      const mal = ids.filter((id) => !ctx.scene.getWall(id) && !ctx.scene.getObject(id))
      if (mal.length > 0) throw new Error(`Ids inexistentes: ${mal.join(', ')}.`)
      return { valido: true, resumen: `Seleccionar ${ids.length} elemento(s).`, acciones: [{ accion: 'seleccionar', detalle: ids.join(', '), ids_afectados: ids }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const raw = params['ids']
      if (!Array.isArray(raw) || raw.length === 0) return { ok: false, mensaje: 'Indica al menos un id.', ids_creados: [] }
      const ids = raw.map(String)
      const mal = ids.filter((id) => !ctx.scene.getWall(id) && !ctx.scene.getObject(id))
      if (mal.length > 0) return { ok: false, mensaje: `Ids inexistentes: ${mal.join(', ')}.`, ids_creados: [] }
      ctx.scene.select(null)
      for (const id of ids) {
        const w = ctx.scene.getWall(id)
        if (w) { ctx.scene.select(w); continue }
        const o = ctx.scene.getObject(id)
        if (o) {
          for (const c of ctx.scene.getObjects()) c.isSelected = false
          for (const c of ctx.scene.getWalls()) c.isSelected = false
          o.isSelected = true
        }
      }
      const first = ctx.scene.getWall(ids[0])
      if (first) ctx.scene.select(first)
      return { ok: true, mensaje: `${ids.length} elemento(s) seleccionado(s).`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
