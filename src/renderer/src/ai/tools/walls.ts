/** tools de muros 1/3: helpers + crear_muro. */
import * as THREE from 'three'
import { WallSegmentType } from '../../models/Wall'
import { isMaterialId } from '../../catalog/materials'
import type { ToolContext, ToolDef } from './types'
import { ToolValidationError } from './types'
import { LIMITS, fmt, optNum, optStr, reqPunto } from './validate'
export function wallKind(v: unknown): WallSegmentType {
  if (v === 'StructuralSegment') return WallSegmentType.StructuralSegment
  if (v === 'RoomWalls') return WallSegmentType.RoomWalls
  return WallSegmentType.SimpleWall
}
export function checkLevel(ctx: ToolContext, id: string): void {
  if (id === '') return
  if (!ctx.scene.getLevel(id)) throw new ToolValidationError(`La planta «${id}» no existe.`)
}
export function checkMaterial(id: string): void {
  if (id === '') return
  if (!isMaterialId(id)) throw new ToolValidationError(`El material «${id}» no está en el catálogo.`)
}
export function pt(desc: string): { type: 'object'; description: string; properties: Record<string, { type: 'number'; description: string }>; required: ['x', 'z'] } {
  return { type: 'object', description: desc, properties: { x: { type: 'number', description: 'X en m' }, z: { type: 'number', description: 'Z en m' } }, required: ['x', 'z'] }
}
export function mustWall(ctx: ToolContext, id: string): { id: string; sx: number; sz: number; ex: number; ez: number; len: number } {
  const w = ctx.scene.getWall(id)
  if (!w) throw new ToolValidationError(`El muro «${id}» no existe. Usa describir_escena para ver los ids.`)
  return { id: w.id, sx: w.start.x, sz: w.start.z, ex: w.end.x, ez: w.end.z, len: w.start.distanceTo(w.end) }
}
export const crearMuro: ToolDef = {
  nombre: 'crear_muro',
  descripcion: 'Crea un muro recto entre dos puntos XZ (metros), con altura, espesor y material opcionales.',
  esquema: {
    type: 'object',
    properties: {
      inicio: pt('Punto inicial {x, z} en metros.'),
      fin: pt('Punto final {x, z} en metros.'),
      altura: { type: 'number', description: 'Altura en m (0.3–12).', default: 2.8 },
      espesor: { type: 'number', description: 'Espesor en m (0.05–1).', default: 0.2 },
      material: { type: 'string', description: 'Id del catálogo (mat.brick…).' },
      tipo: { type: 'string', description: 'SimpleWall, StructuralSegment o RoomWalls.', default: 'SimpleWall', enum: ['SimpleWall', 'StructuralSegment', 'RoomWalls'] },
      planta: { type: 'string', description: 'Id de planta; vacío = activa.' }
    },
    required: ['inicio', 'fin']
  },
  dryRun(params, ctx) {
    try {
      const a = reqPunto(params, 'inicio')
      const b = reqPunto(params, 'fin')
      const h = optNum(params, 'altura', 2.8, LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const t = optNum(params, 'espesor', 0.2, LIMITS.THICK_MIN, LIMITS.THICK_MAX)
      const mat = optStr(params, 'material', '')
      checkMaterial(mat)
      checkLevel(ctx, optStr(params, 'planta', ''))
      const L = Math.hypot(b.x - a.x, b.z - a.z)
      if (L < LIMITS.WALL_MIN || L > LIMITS.WALL_MAX) return { valido: false, resumen: '', acciones: [], avisos: [], error: `El muro mediría ${fmt(L)} m; debe estar entre ${LIMITS.WALL_MIN} y ${LIMITS.WALL_MAX} m.` }
      return { valido: true, resumen: `Crear muro de ${fmt(L)} m, altura ${fmt(h)} m${mat ? `, material ${mat}` : ''}.`, acciones: [{ accion: 'crear_muro', detalle: `(${fmt(a.x)}, ${fmt(a.z)}) → (${fmt(b.x)}, ${fmt(b.z)}), h=${fmt(h)} e=${fmt(t)}`, ids_afectados: [] }], avisos: L > 20 ? ['Muro largo: verifica que sea lo que quieres.'] : [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const a = reqPunto(params, 'inicio')
      const b = reqPunto(params, 'fin')
      const h = optNum(params, 'altura', 2.8, LIMITS.HEIGHT_MIN, LIMITS.HEIGHT_MAX)
      const t = optNum(params, 'espesor', 0.2, LIMITS.THICK_MIN, LIMITS.THICK_MAX)
      const matRaw = optStr(params, 'material', '')
      checkMaterial(matRaw)
      const planta = optStr(params, 'planta', '')
      checkLevel(ctx, planta)
      const L = Math.hypot(b.x - a.x, b.z - a.z)
      if (L < LIMITS.WALL_MIN || L > LIMITS.WALL_MAX) return { ok: false, mensaje: `El muro mediría ${fmt(L)} m; debe estar entre ${LIMITS.WALL_MIN} y ${LIMITS.WALL_MAX} m.`, ids_creados: [] }
      const wall = ctx.scene.addWall(wallKind(params['tipo']), new THREE.Vector3(a.x, 0, a.z), new THREE.Vector3(b.x, 0, b.z), true, planta === '' ? undefined : planta)
      wall.height = h
      wall.thickness = t
      if (matRaw !== '') ctx.scene.setWallMaterial(wall.id, matRaw)
      return { ok: true, mensaje: `Muro creado (${fmt(L)} m, altura ${fmt(h)} m).`, ids_creados: [wall.id] }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
