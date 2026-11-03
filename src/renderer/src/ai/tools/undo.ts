/** tools deshacer + rehacer (delegan en el HistoryManager). */
import type { ToolDef } from './types'
export const deshacer: ToolDef = {
  nombre: 'deshacer',
  descripcion: 'Deshace el último paso del historial.',
  esquema: { type: 'object', properties: {}, required: [] },
  dryRun(_params, ctx) {
    const etiqueta = ctx.history.peekUndoLabel()
    if (!etiqueta) return { valido: true, resumen: 'No hay nada que deshacer.', acciones: [], avisos: [] }
    return { valido: true, resumen: `Deshacer: ${etiqueta}.`, acciones: [{ accion: 'deshacer', detalle: etiqueta, ids_afectados: [] }], avisos: [] }
  },
  run(_params, ctx) {
    const etiqueta = ctx.history.peekUndoLabel()
    if (!etiqueta) return { ok: false, mensaje: 'No hay nada que deshacer.', ids_creados: [] }
    ctx.history.undo()
    return { ok: true, mensaje: `Deshecho: ${etiqueta}.`, ids_creados: [] }
  }
}
export const rehacer: ToolDef = {
  nombre: 'rehacer',
  descripcion: 'Rehace el último paso deshecho.',
  esquema: { type: 'object', properties: {}, required: [] },
  dryRun(_params, ctx) {
    const etiqueta = ctx.history.peekRedoLabel()
    if (!etiqueta) return { valido: true, resumen: 'No hay nada que rehacer.', acciones: [], avisos: [] }
    return { valido: true, resumen: `Rehacer: ${etiqueta}.`, acciones: [{ accion: 'rehacer', detalle: etiqueta, ids_afectados: [] }], avisos: [] }
  },
  run(_params, ctx) {
    const etiqueta = ctx.history.peekRedoLabel()
    if (!etiqueta) return { ok: false, mensaje: 'No hay nada que rehacer.', ids_creados: [] }
    ctx.history.redo()
    return { ok: true, mensaje: `Rehecho: ${etiqueta}.`, ids_creados: [] }
  }
}
