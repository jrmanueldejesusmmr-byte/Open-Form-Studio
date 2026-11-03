/** tool generar_casa (estructura compuesta con reglas arquitectónicas). */
import * as THREE from 'three'
import { Wall, WallSegmentType } from '../../models/Wall'
import { SceneObject } from '../../models/SceneObject'
import { isMaterialId } from '../../catalog/materials'
import { DEFAULT_ROOF_THICKNESS, type RoofType } from '../../models/Roof'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr, reqNum } from './validate'
import { checkLevel } from './walls'
import { mustEntry, placeOnWall } from './place'
const TECHOS = ['gable', 'hip', 'shed', 'flat'] as const
export const generarCasa: ToolDef = {
  nombre: 'generar_casa',
  descripcion: 'Genera una casa: muros perimetrales, puerta, ventanas, piso y techo, con reglas (altura 2.8 m, espesor 0.2 m).',
  esquema: {
    type: 'object',
    properties: {
      ancho: { type: 'number', description: 'Ancho en m (3–200).' },
      largo: { type: 'number', description: 'Largo en m (3–200).' },
      plantas: { type: 'number', description: 'Plantas a generar (1–4).', default: 1 },
      x: { type: 'number', description: 'Esquina X.', default: 0 },
      z: { type: 'number', description: 'Esquina Z.', default: 0 },
      techo: { type: 'string', description: 'gable, hip, shed o flat.', default: 'gable', enum: [...TECHOS] },
      material_muros: { type: 'string', description: 'Material de muros.', default: 'mat.brick' },
      habitaciones: { type: 'number', description: 'Divisiones interiores (0–50).', default: 1 }
    },
    required: ['ancho', 'largo']
  },
  dryRun(params, ctx) {
    try {
      const a = reqNum(params, 'ancho', 3, 200)
      const l = reqNum(params, 'largo', 3, 200)
      const p = optNum(params, 'plantas', 1, 1, LIMITS.HOUSE_FLOORS_MAX)
      const t = optStr(params, 'techo', 'gable')
      if (!(TECHOS as readonly string[]).includes(t)) throw new Error('Techo: gable, hip, shed o flat.')
      const m = optStr(params, 'material_muros', 'mat.brick')
      if (!isMaterialId(m)) throw new Error(`El material «${m}» no está en el catálogo.`)
      const hab = optNum(params, 'habitaciones', 1, 0, 50)
      checkLevel(ctx, '')
      return { valido: true, resumen: `Generar casa de ${fmt(a)} × ${fmt(l)} m, ${p} planta(s), techo ${t}, ${hab} habitación(es).`, acciones: [{ accion: 'generar_casa', detalle: `${fmt(a)} × ${fmt(l)} m, ${p} planta(s), techo ${t}`, ids_afectados: [] }], avisos: p > 2 ? ['Más de 2 plantas: verifica la estructura.'] : [] }
    } catch (e) { return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message } }
  },
  run(params, ctx) {
    try {
      const a = reqNum(params, 'ancho', 3, 200)
      const l = reqNum(params, 'largo', 3, 200)
      const p = optNum(params, 'plantas', 1, 1, LIMITS.HOUSE_FLOORS_MAX)
      const x0 = optNum(params, 'x', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z0 = optNum(params, 'z', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const t = optStr(params, 'techo', 'gable') as RoofType
      if (!(TECHOS as readonly string[]).includes(t)) return { ok: false, mensaje: 'Techo: gable, hip, shed o flat.', ids_creados: [] }
      const m = optStr(params, 'material_muros', 'mat.brick')
      if (!isMaterialId(m)) return { ok: false, mensaje: `El material «${m}» no está en el catálogo.`, ids_creados: [] }
      const hab = optNum(params, 'habitaciones', 1, 0, 50)
      const ids: string[] = []
      const H = 2.8
      const W = a
      const D = l
      const X0 = x0
      const Z0 = z0
      let nMuros = 0
      let nObjetos = 0
      let nAbiertas = 0
      for (let f = 0; f < p; f++) {
        const lvl = f === 0 ? ctx.scene.getActiveLevel() : ctx.scene.addLevel()
        if (f !== 0) ctx.scene.updateLevel(lvl.id, { height: H })
        ids.push(lvl.id)
        const corners = [
          [X0, Z0],
          [X0 + W, Z0],
          [X0 + W, Z0 + D],
          [X0, Z0 + D]
        ] as Array<[number, number]>
        const wallPts: Array<[number, number, number, number]> = []
        for (let i = 0; i < 4; i++) {
          const a = corners[i]
          const b = corners[(i + 1) % 4]
          wallPts.push([a[0], a[1], b[0], b[1]])
        }
        const wallIds = new Set<string>()
        const walls: Wall[] = []
        for (const [x1, z1, x2, z2] of wallPts) {
          const hash = `${Math.round(x1 * 100)},${Math.round(z1 * 100)},${Math.round(x2 * 100)},${Math.round(z2 * 100)}`
          if (wallIds.has(hash)) continue
          wallIds.add(hash)
          const w = ctx.scene.addWall(WallSegmentType.RoomWalls, new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2), true, lvl.id)
          w.height = H
          w.thickness = 0.2
          ctx.scene.setWallMaterial(w.id, m)
          ids.push(w.id)
          walls.push(w)
        }
        const doors: Wall[] = []
        const windows: Wall[] = []
        for (const w of walls) {
          const [ax, az] = [w.start.x, w.start.z]
          const [bx, bz] = [w.end.x, w.end.z]
          const len = w.length
          if (len < 1.5) continue
          // Muro derecho: x = X0 + W, z creciente (frente); puerta centrada.
          if (ax === X0 + W && az === Z0 && bz === Z0 + D) {
            doors.push(w)
          }
          // Muro izquierdo: x = X0, z creciente (fondo); ventana centrada.
          if (ax === X0 && bx === X0) {
            windows.push(w)
          }
        }
        const addOpeningOn = (wall: Wall, x: number, width: number, height: number, sill: number, type: 'door' | 'window', materialId: string, variant: string, name: string) => {
          try {
            const opening = ctx.scene.addOpening(wall.id, { wallId: wall.id, x, width, height, sill, type, materialId })
            const at = placeOnWall(ctx, wall.id, x, lvl.id)
            const elevation = ctx.scene.getLevel(lvl.id)?.elevation ?? 0
            const entry = mustEntry(type === 'door' ? 'opening.door' : 'opening.window')
            const obj = ctx.scene.createObject(entry.name, entry.kind, new THREE.Vector3(at.x, elevation + sill + height / 2, at.z), 0, lvl.id)
            obj.size.set(width, height, Math.min(0.12, Math.max(0.02, wall.thickness * 0.9)))
            obj.shapeId = entry.shapeId
            if (entry.materialId) obj.materialId = entry.materialId
            obj.openingVariant = variant
            obj.openingAngle = 0
            ids.push(obj.id)
            nAbiertas++
            return opening.id
          } catch {
            return null
          }
        }
        // Puerta en el muro frontal (derecho), centrada.
        if (doors.length > 0) {
          addOpeningOn(doors[0], doors[0].length / 2, 0.9, 2.1, 0, 'door', 'mat.wood', 'simple', 'Puerta principal')
        }
        // Ventana 1 en el muro frontal (derecho), a 1/4 de largo.
        if (doors.length > 0) {
          const w1Pos = Math.max(0.7, Math.min(doors[0].length / 4, doors[0].length / 2 - 1.15))
          addOpeningOn(doors[0], w1Pos, 1.2, 1.2, 0.9, 'window', 'mat.glass', 'fija', 'Ventana frontal')
        }
        // Ventana 2 en el muro fondo (izquierdo), centrada.
        if (windows.length > 0) {
          addOpeningOn(windows[0], windows[0].length / 2, 1.2, 1.2, 0.9, 'window', 'mat.glass', 'fija', 'Ventana fondo')
        }
        const piso = new SceneObject('Piso', 'furniture')
        piso.size = new THREE.Vector3(W, 0.1, D)
        piso.position = new THREE.Vector3(X0 + W / 2, ctx.scene.getLevel(lvl.id)?.elevation ?? 0, Z0 + D / 2)
        piso.materialId = 'mat.wood'
        piso.levelId = lvl.id
        ctx.scene.addObject(piso)
        ids.push(piso.id)
        if (f === p - 1) {
          const footprint = [{ x: X0, z: Z0 }, { x: X0 + W, z: Z0 }, { x: X0 + W, z: Z0 + D }, { x: X0, z: Z0 + D }]
          const techo = ctx.scene.createRoof({
            footprint,
            type: t,
            slope: 30,
            overhang: 0.3,
            thickness: DEFAULT_ROOF_THICKNESS,
            materialId: 'mat.terracotta',
            levelId: lvl.id,
            ridgeDir: 'x'
          })
          if (!techo) return { ok: false, mensaje: 'No se pudo crear el techo sobre la planta.', ids_creados: ids }
          ids.push(techo.id)
        }
        nMuros += walls.length
        nObjetos += 1

      }
      return { ok: true, mensaje: `Casa generada (${fmt(a)} × ${fmt(l)} m, ${p} planta(s), ${nMuros} muro(s), ${nObjetos} elemento(s), ${nAbiertas} abertura(s)).`, ids_creados: ids }
    } catch (e) { return { ok: false, mensaje: (e as Error).message, ids_creados: [] } }
  }
}
