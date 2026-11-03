/** Primitivas constructivas: columna, losa por contorno y escalera recta. */
import * as THREE from 'three'
import type { ToolDef } from './types'
import { fmt, optNum, optStr, reqNum } from './validate'
import { LIMITS } from './validate'
import { isMaterialId } from '../../catalog/materials'

/** Cota base (m) de la planta indicada; por defecto la activa. */
function baseElevation(ctx: import('./types').ToolContext, planta?: unknown): number {
  if (typeof planta === 'string' && planta.length > 0) {
    const lvl = ctx.scene.getLevel(planta)
    if (lvl) return lvl.elevation
  }
  return ctx.scene.getActiveLevel().elevation
}

/** Id de planta válida (la indicada o la activa). */
function resolveLevelId(ctx: import('./types').ToolContext, planta?: unknown): string {
  if (typeof planta === 'string' && planta.length > 0 && ctx.scene.getLevel(planta)) return planta
  return ctx.scene.getActiveLevelId()
}

export const crearColumna: ToolDef = {
  nombre: 'crear_columna',
  descripcion: 'Crea una columna cuadrada o rectangular en x,z con altura y material.',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Centro X (m).' },
      z: { type: 'number', description: 'Centro Z (m).' },
      lado: { type: 'number', description: 'Lado de la sección (m).', default: 0.3 },
      altura: { type: 'number', description: 'Altura (m).', default: 2.8 },
      material: { type: 'string', description: 'Material (id del catálogo).', default: 'mat.concrete' },
      planta: { type: 'string', description: 'Id de planta (opcional; por defecto la activa).' }
    },
    required: ['x', 'z']
  },
  dryRun(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const lado = optNum(params, 'lado', 0.3, 0.1, 2)
      const altura = optNum(params, 'altura', 2.8, LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const material = optStr(params, 'material', 'mat.concrete')
      if (!isMaterialId(material)) throw new Error(`El material «${material}» no está en el catálogo.`)
      void ctx
      return { valido: true, resumen: `Columna de ${fmt(lado)}×${fmt(lado)} m y ${fmt(altura)} m de alto en (${fmt(x)}, ${fmt(z)}).`, acciones: [{ accion: 'crear_columna', detalle: `${fmt(lado)}×${fmt(lado)}×${fmt(altura)} m en (${fmt(x)},${fmt(z)})`, ids_afectados: [] }], avisos: [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const lado = optNum(params, 'lado', 0.3, 0.1, 2)
      const altura = optNum(params, 'altura', 2.8, LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const material = optStr(params, 'material', 'mat.concrete')
      if (!isMaterialId(material)) return { ok: false, mensaje: `El material «${material}» no está en el catálogo.`, ids_creados: [] }
      const levelId = resolveLevelId(ctx, params['planta'])
      const y = baseElevation(ctx, params['planta']) + altura / 2
      const col = ctx.scene.createObject('Columna', 'shape', new THREE.Vector3(x, y, z), 0, levelId)
      col.size = new THREE.Vector3(lado, altura, lado)
      col.materialId = material
      return { ok: true, mensaje: `Columna creada en (${fmt(x)}, ${fmt(z)}), ${fmt(altura)} m de alto.`, ids_creados: [col.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}

export const crearLosa: ToolDef = {
  nombre: 'crear_losa',
  descripcion: 'Crea una losa/forjado a partir de un contorno cerrado (polígono en XZ), con espesor y material.',
  esquema: {
    type: 'object',
    properties: {
      contorno: {
        type: 'array',
        description: 'Puntos [{x,z},…] del contorno cerrado (mínimo 3).',
        items: { type: 'object', description: 'Punto {x,z} en metros.', properties: { x: { type: 'number', description: 'X.' }, z: { type: 'number', description: 'Z.' } } }
      },
      espesor: { type: 'number', description: 'Espesor (m).', default: 0.2 },
      material: { type: 'string', description: 'Material (id).', default: 'mat.concrete' },
      planta: { type: 'string', description: 'Id de planta (opcional).' }
    },
    required: ['contorno']
  },
  dryRun(params, ctx) {
    try {
      const contorno = params['contorno']
      if (!Array.isArray(contorno) || contorno.length < 3) throw new Error('El contorno necesita al menos 3 puntos.')
      const espesor = optNum(params, 'espesor', 0.2, 0.05, 1)
      const material = optStr(params, 'material', 'mat.concrete')
      if (!isMaterialId(material)) throw new Error(`El material «${material}» no está en el catálogo.`)
      const xs = contorno.map((p) => Number((p as { x: number }).x))
      const zs = contorno.map((p) => Number((p as { z: number }).z))
      const ancho = Math.max(...xs) - Math.min(...xs)
      const largo = Math.max(...zs) - Math.min(...zs)
      void ctx
      return { valido: true, resumen: `Losa de ${fmt(ancho)}×${fmt(largo)} m, ${fmt(espesor)} m de espesor (aproximada al rectángulo del contorno).`, acciones: [{ accion: 'crear_losa', detalle: `${fmt(ancho)}×${fmt(largo)} m, e=${fmt(espesor)} m`, ids_afectados: [] }], avisos: ['La losa se aproxima al rectángulo que encierra el contorno; el polígono exacto llegará en una fase siguiente.'] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const contorno = params['contorno']
      if (!Array.isArray(contorno) || contorno.length < 3) return { ok: false, mensaje: 'El contorno necesita al menos 3 puntos.', ids_creados: [] }
      const espesor = optNum(params, 'espesor', 0.2, 0.05, 1)
      const material = optStr(params, 'material', 'mat.concrete')
      if (!isMaterialId(material)) return { ok: false, mensaje: `El material «${material}» no está en el catálogo.`, ids_creados: [] }
      const xs = contorno.map((p) => Number((p as { x: number }).x))
      const zs = contorno.map((p) => Number((p as { z: number }).z))
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2
      const ancho = Math.max(...xs) - Math.min(...xs)
      const largo = Math.max(...zs) - Math.min(...zs)
      const levelId = resolveLevelId(ctx, params['planta'])
      const y = baseElevation(ctx, params['planta']) - espesor / 2
      const losa = ctx.scene.createObject('Losa', 'shape', new THREE.Vector3(cx, y, cz), 0, levelId)
      losa.size = new THREE.Vector3(ancho, espesor, largo)
      losa.materialId = material
      return { ok: true, mensaje: `Losa de ${fmt(ancho)}×${fmt(largo)} m creada.`, ids_creados: [losa.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}

export const crearEscalera: ToolDef = {
  nombre: 'crear_escalera',
  descripcion: 'Crea una escalera recta que salva una altura entre plantas, con huella y contrahuella calculadas.',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Centro X del arranque (m).' },
      z: { type: 'number', description: 'Centro Z del arranque (m).' },
      ancho: { type: 'number', description: 'Ancho (m).', default: 1 },
      altura: { type: 'number', description: 'Altura a salvar (m).', default: 2.8 },
      direccion: { type: 'string', description: 'x o z.', default: 'x', enum: ['x', 'z'] },
      planta: { type: 'string', description: 'Id de planta (opcional).' }
    },
    required: ['x', 'z']
  },
  dryRun(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const ancho = optNum(params, 'ancho', 1, 0.6, 3)
      const altura = optNum(params, 'altura', 2.8, 0.5, 6)
      const dir = optStr(params, 'direccion', 'x')
      if (dir !== 'x' && dir !== 'z') throw new Error('dirección debe ser «x» o «z».')
      const contra = 0.18
      const pasos = Math.max(2, Math.round(altura / contra))
      const huella = 0.28
      const run = pasos * huella
      void ctx
      return { valido: true, resumen: `Escalera recta de ${fmt(altura)} m: ${pasos} pasos (huella ${fmt(huella)} m, contrahuella ${fmt(contra)} m), largo ${fmt(run)} m en ${dir}.`, acciones: [{ accion: 'crear_escalera', detalle: `${pasos} pasos, largo ${fmt(run)} m`, ids_afectados: [] }], avisos: ['Geometría simplificada (prismaje macizo); el mallado escalonado llegará en una fase siguiente.'] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const ancho = optNum(params, 'ancho', 1, 0.6, 3)
      const altura = optNum(params, 'altura', 2.8, 0.5, 6)
      const dir = optStr(params, 'direccion', 'x')
      if (dir !== 'x' && dir !== 'z') return { ok: false, mensaje: 'dirección debe ser «x» o «z».', ids_creados: [] }
      const contra = 0.18
      const pasos = Math.max(2, Math.round(altura / contra))
      const huella = 0.28
      const run = pasos * huella
      const levelId = resolveLevelId(ctx, params['planta'])
      const base = baseElevation(ctx, params['planta'])
      const cx = dir === 'x' ? x + run / 2 : x
      const cz = dir === 'z' ? z + run / 2 : z
      const sx = dir === 'x' ? run : ancho
      const sz = dir === 'z' ? run : ancho
      const esc = ctx.scene.createObject('Escalera', 'shape', new THREE.Vector3(cx, base + altura / 2, cz), 0, levelId)
      esc.size = new THREE.Vector3(sx, altura, sz)
      esc.materialId = 'mat.concrete'
      return { ok: true, mensaje: `Escalera de ${fmt(altura)} m creada (${pasos} pasos, largo ${fmt(run)} m).`, ids_creados: [esc.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
