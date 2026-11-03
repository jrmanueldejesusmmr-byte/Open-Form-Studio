/** tools borrar_objeto + aplicar_material + listar_materiales. */
import type { ToolDef } from './types'
import { fmt, optStr, reqStr } from './validate'
import { MATERIAL_CATALOG, isMaterialId, materialsForCategory } from '../../catalog/materials'
export const borrarObjeto: ToolDef = {
  nombre: 'borrar_objeto',
  descripcion: 'Borra un objeto por su id.',
  esquema: { type: 'object', properties: { id: { type: 'string', description: 'Id del objeto.' } }, required: ['id'] },
  dryRun(params, ctx) {
    try {
      const id = reqStr(params, 'id')
      if (!ctx.scene.getObject(id)) throw new Error(`El objeto «${id}» no existe.`)
      return { valido: true, resumen: `Borrar el objeto ${id}.`, acciones: [{ accion: 'borrar_objeto', detalle: id, ids_afectados: [id] }], avisos: ['Se puede deshacer con Ctrl+Z.'] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const id = reqStr(params, 'id')
      if (!ctx.scene.getObject(id)) return { ok: false, mensaje: `El objeto «${id}» no existe.`, ids_creados: [] }
      ctx.scene.removeObject(id)
      return { ok: true, mensaje: `Objeto ${id} borrado.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
export const aplicarMaterial: ToolDef = {
  nombre: 'aplicar_material',
  descripcion: 'Aplica un material del catálogo a un muro o a un objeto.',
  esquema: {
    type: 'object',
    properties: {
      objetivo: { type: 'string', description: "Id del muro (wall-…), del objeto (obj-…) o 'todos' para todos los muros de la escena." },
      material: { type: 'string', description: 'Id del material (mat.brick…).' }
    },
    required: ['objetivo', 'material']
  },
  dryRun(params, ctx) {
    try {
      const t = reqStr(params, 'objetivo')
      const m = reqStr(params, 'material')
      if (!isMaterialId(m)) throw new Error(`El material «${m}» no está en el catálogo.`)
      if (t === 'todos') {
        const n = ctx.scene.getWalls().length
        if (n === 0) throw new Error('No hay muros en la escena.')
        return { valido: true, resumen: `Aplicar «${m}» a los ${n} muros de la escena.`, acciones: [{ accion: 'aplicar_material', detalle: `${m} → ${n} muros`, ids_afectados: [] }], avisos: ['Sin selección: se aplica a todos los muros.'] }
      }
      const esMuro = ctx.scene.getWall(t) !== undefined
      const esObj = ctx.scene.getObject(t) !== undefined
      if (!esMuro && !esObj) throw new Error(`No hay ningún muro ni objeto con id «${t}».`)
      return { valido: true, resumen: `Aplicar «${m}» a ${esMuro ? 'el muro' : 'el objeto'} ${t}.`, acciones: [{ accion: 'aplicar_material', detalle: `${m} → ${t}`, ids_afectados: [t] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const t = reqStr(params, 'objetivo')
      const m = reqStr(params, 'material')
      if (!isMaterialId(m)) return { ok: false, mensaje: `El material «${m}» no está en el catálogo.`, ids_creados: [] }
      if (t === 'todos') {
        const walls = ctx.scene.getWalls()
        if (walls.length === 0) return { ok: false, mensaje: 'No hay muros en la escena.', ids_creados: [] }
        for (const w of walls) ctx.scene.setWallMaterial(w.id, m)
        return { ok: true, mensaje: `Material «${m}» aplicado a los ${walls.length} muros de la escena.`, ids_creados: [] }
      }
      if (ctx.scene.getWall(t) !== undefined) {
        ctx.scene.setWallMaterial(t, m)
        return { ok: true, mensaje: `Material «${m}» aplicado al muro ${t}.`, ids_creados: [] }
      }
      if (ctx.scene.getObject(t) !== undefined) {
        ctx.scene.setObjectMaterial(t, m)
        return { ok: true, mensaje: `Material «${m}» aplicado al objeto ${t}.`, ids_creados: [] }
      }
      return { ok: false, mensaje: `No hay ningún muro ni objeto con id «${t}».`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
const CATS = ['ladrillo', 'concreto', 'estuco', 'piedra', 'madera', 'ceramica', 'teja', 'lamina', 'vidrio', 'pintura', 'pasto', 'grava', 'asfalto'] as const
export const listarMateriales: ToolDef = {
  nombre: 'listar_materiales',
  descripcion: 'Lista los materiales del catálogo, opcionalmente filtrados por categoría.',
  esquema: { type: 'object', properties: { categoria: { type: 'string', description: 'Categoría (madera, ladrillo…). Vacío = todas.', enum: [...CATS] } }, required: [] },
  dryRun(params) {
    try {
      const c = optStr(params, 'categoria', '')
      if (c !== '' && !(CATS as readonly string[]).includes(c)) throw new Error(`Categoría desconocida «${c}».`)
      const n = c === '' ? MATERIAL_CATALOG.length : materialsForCategory(c as (typeof CATS)[number]).length
      return { valido: true, resumen: `Listar ${fmt(n)} materiales${c ? ` de «${c}»` : ''}.`, acciones: [{ accion: 'listar_materiales', detalle: c === '' ? 'todas las categorías' : c, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params) {
    try {
      const c = optStr(params, 'categoria', '')
      if (c !== '' && !(CATS as readonly string[]).includes(c)) return { ok: false, mensaje: `Categoría desconocida «${c}».`, ids_creados: [] }
      const items = c === '' ? MATERIAL_CATALOG : materialsForCategory(c as (typeof CATS)[number])
      const lista = items.map((m) => `${m.id} («${m.label}»)`).join(', ')
      return { ok: true, mensaje: `${items.length} materiales${c ? ` en «${c}»` : ''}: ${lista}.`, ids_creados: [] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
