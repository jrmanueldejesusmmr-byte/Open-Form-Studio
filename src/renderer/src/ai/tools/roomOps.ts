/**
 * Herramientas de edición arquitectónica de recintos (Fase 2).
 *
 * Implementa:
 * - borrar_habitacion
 * - unir_habitaciones
 * - agregar_habitaciones
 * - redimensionar_habitacion
 *
 * Todas diseñadas para ejecutarse dentro del ejecutor transaccional único (un solo Ctrl+Z).
 */

import * as THREE from 'three'
import { WallSegmentType } from '../../models/Wall'
import type { ToolDef } from './types'
import { LIMITS, fmt, optNum, optStr, reqNum } from './validate'
import { checkLevel, checkMaterial } from './walls'

export const borrarHabitacion: ToolDef = {
  nombre: 'borrar_habitacion',
  descripcion: 'Borra una habitación completa (sus 4 muros y aberturas) ubicada en (x, z) o por id de referencia.',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Coordenada X interior de la habitación.' },
      z: { type: 'number', description: 'Coordenada Z interior de la habitación.' },
      muro_id: { type: 'string', description: 'Id de cualquiera de los muros de la habitación.' }
    },
    required: []
  },
  dryRun(params, ctx) {
    try {
      const muroId = optStr(params, 'muro_id', '')
      const x = optNum(params, 'x', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = optNum(params, 'z', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      return {
        valido: true,
        resumen: `Borrar habitación ${muroId ? `con muro ${muroId}` : `en (${fmt(x)}, ${fmt(z)})`}.`,
        acciones: [{ accion: 'borrar_habitacion', detalle: 'Eliminará los muros perimetrales del recinto', ids_afectados: [] }],
        avisos: ['Podrás deshacer la eliminación completa con un solo Ctrl+Z.']
      }
    } catch (e) {
      return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message }
    }
  },
  run(params, ctx) {
    try {
      const muroId = optStr(params, 'muro_id', '')
      const walls = ctx.scene.getWalls()
      const idsBorrados: string[] = []

      if (muroId) {
        const targetWall = ctx.scene.getWall(muroId)
        if (targetWall) {
          ctx.scene.removeWall(targetWall.id)
          idsBorrados.push(targetWall.id)
        }
      } else {
        const x = optNum(params, 'x', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
        const z = optNum(params, 'z', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
        // Busca muros en un radio de proximidad al punto indicado
        const radio = 3.5
        for (const w of walls) {
          const cx = (w.start.x + w.end.x) / 2
          const cz = (w.start.z + w.end.z) / 2
          const dist = Math.hypot(cx - x, cz - z)
          if (dist <= radio) {
            ctx.scene.removeWall(w.id)
            idsBorrados.push(w.id)
          }
        }
      }

      if (idsBorrados.length === 0) {
        return { ok: false, mensaje: 'No se encontraron muros de habitación para borrar en la ubicación indicada.', ids_creados: [] }
      }

      return {
        ok: true,
        mensaje: `Habitación borrada (${idsBorrados.length} elementos eliminados).`,
        ids_creados: idsBorrados
      }
    } catch (e) {
      return { ok: false, mensaje: (e as Error).message, ids_creados: [] }
    }
  }
}

export const unirHabitaciones: ToolDef = {
  nombre: 'unir_habitaciones',
  descripcion: 'Une dos habitaciones contiguas eliminando el tabique o muro divisorio entre ellas.',
  esquema: {
    type: 'object',
    properties: {
      muro_divisor_id: { type: 'string', description: 'Id del muro divisorio a demoler.' },
      x1: { type: 'number', description: 'Coordenada X interior de la primera habitación.' },
      z1: { type: 'number', description: 'Coordenada Z interior de la primera habitación.' },
      x2: { type: 'number', description: 'Coordenada X interior de la segunda habitación.' },
      z2: { type: 'number', description: 'Coordenada Z interior de la segunda habitación.' }
    },
    required: []
  },
  dryRun(params, ctx) {
    try {
      const muroId = optStr(params, 'muro_divisor_id', '')
      return {
        valido: true,
        resumen: `Unir habitaciones demoliendo muro divisorio${muroId ? ` ${muroId}` : ''}.`,
        acciones: [{ accion: 'unir_habitaciones', detalle: 'Fusión de recintos mediante eliminación de partición', ids_afectados: [] }],
        avisos: []
      }
    } catch (e) {
      return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message }
    }
  },
  run(params, ctx) {
    try {
      const muroId = optStr(params, 'muro_divisor_id', '')
      if (muroId) {
        const wall = ctx.scene.getWall(muroId)
        if (!wall) return { ok: false, mensaje: `El muro divisorio ${muroId} no existe.`, ids_creados: [] }
        ctx.scene.removeWall(wall.id)
        return { ok: true, mensaje: `Habitaciones unidas demoliendo el muro divisorio ${muroId}.`, ids_creados: [] }
      }

      // Buscar el muro ubicado entre (x1, z1) y (x2, z2)
      const x1 = optNum(params, 'x1', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z1 = optNum(params, 'z1', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const x2 = optNum(params, 'x2', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z2 = optNum(params, 'z2', 0, LIMITS.COORD_MIN, LIMITS.COORD_MAX)

      const midX = (x1 + x2) / 2
      const midZ = (z1 + z2) / 2

      const walls = ctx.scene.getWalls()
      let mejorMuro: import('../../models/Wall').Wall | null = null
      let menorDist = Infinity

      for (const w of walls) {
        const cx = (w.start.x + w.end.x) / 2
        const cz = (w.start.z + w.end.z) / 2
        const dist = Math.hypot(cx - midX, cz - midZ)
        if (dist < menorDist) {
          menorDist = dist
          mejorMuro = w
        }
      }

      if (mejorMuro && menorDist < 3.0) {
        ctx.scene.removeWall(mejorMuro.id)
        return { ok: true, mensaje: `Habitaciones unidas demoliendo el muro intermedio (${mejorMuro.id}).`, ids_creados: [] }
      }

      return { ok: false, mensaje: 'No se detectó un muro divisorio entre las habitaciones indicadas.', ids_creados: [] }
    } catch (e) {
      return { ok: false, mensaje: (e as Error).message, ids_creados: [] }
    }
  }
}

export const agregarHabitaciones: ToolDef = {
  nombre: 'agregar_habitaciones',
  descripcion: 'Agrega una o más habitaciones con medidas específicas a partir de una posición dada.',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Esquina X inicial.' },
      z: { type: 'number', description: 'Esquina Z inicial.' },
      ancho: { type: 'number', description: 'Ancho de cada habitación en m.' },
      largo: { type: 'number', description: 'Largo de cada habitación en m.' },
      cantidad: { type: 'number', description: 'Número de habitaciones a agregar.', default: 1 },
      material: { type: 'string', description: 'Material de muros.', default: 'mat.brick' }
    },
    required: ['x', 'z', 'ancho', 'largo']
  },
  dryRun(params, ctx) {
    try {
      const a = reqNum(params, 'ancho', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const l = reqNum(params, 'largo', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const c = optNum(params, 'cantidad', 1, 1, 20)
      return {
        valido: true,
        resumen: `Agregar ${c} habitación(es) de ${fmt(a)} × ${fmt(l)} m.`,
        acciones: [{ accion: 'agregar_habitaciones', detalle: `${c} módulos de ${fmt(a)} × ${fmt(l)} m`, ids_afectados: [] }],
        avisos: []
      }
    } catch (e) {
      return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message }
    }
  },
  run(params, ctx) {
    try {
      const x0 = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z0 = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const a = reqNum(params, 'ancho', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const l = reqNum(params, 'largo', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const c = optNum(params, 'cantidad', 1, 1, 20)
      const mat = optStr(params, 'material', 'mat.brick')
      checkMaterial(mat)

      const ids: string[] = []
      const lvl = ctx.scene.getActiveLevel()

      for (let i = 0; i < c; i++) {
        const x = x0 + i * a
        const z = z0
        const pts = [
          [x, z, x + a, z],
          [x + a, z, x + a, z + l],
          [x + a, z + l, x, z + l],
          [x, z + l, x, z]
        ]
        for (const [x1, z1, x2, z2] of pts) {
          const w = ctx.scene.addWall(WallSegmentType.RoomWalls, new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2), true, lvl.id)
          w.height = 2.8
          if (mat) ctx.scene.setWallMaterial(w.id, mat)
          ids.push(w.id)
        }
      }

      return {
        ok: true,
        mensaje: `${c} habitación(es) agregada(s) correctamente (${ids.length} muros creados).`,
        ids_creados: ids
      }
    } catch (e) {
      return { ok: false, mensaje: (e as Error).message, ids_creados: [] }
    }
  }
}

export const redimensionarHabitacion: ToolDef = {
  nombre: 'redimensionar_habitacion',
  descripcion: 'Redimensiona una habitación existente ajustando su ancho y largo.',
  esquema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Coordenada X interior de la habitación.' },
      z: { type: 'number', description: 'Coordenada Z interior de la habitación.' },
      nuevo_ancho: { type: 'number', description: 'Nuevo ancho en m.' },
      nuevo_largo: { type: 'number', description: 'Nuevo largo en m.' }
    },
    required: ['x', 'z', 'nuevo_ancho', 'nuevo_largo']
  },
  dryRun(params, ctx) {
    try {
      const na = reqNum(params, 'nuevo_ancho', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const nl = reqNum(params, 'nuevo_largo', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      return {
        valido: true,
        resumen: `Redimensionar habitación a ${fmt(na)} × ${fmt(nl)} m.`,
        acciones: [{ accion: 'redimensionar_habitacion', detalle: `Ajuste dimensional a ${fmt(na)} × ${fmt(nl)} m`, ids_afectados: [] }],
        avisos: []
      }
    } catch (e) {
      return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message }
    }
  },
  run(params, ctx) {
    try {
      const x = reqNum(params, 'x', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const z = reqNum(params, 'z', LIMITS.COORD_MIN, LIMITS.COORD_MAX)
      const na = reqNum(params, 'nuevo_ancho', LIMITS.WALL_MIN, LIMITS.WALL_MAX)
      const nl = reqNum(params, 'nuevo_largo', LIMITS.WALL_MIN, LIMITS.WALL_MAX)

      // Borramos los muros viejos próximos y recreamos con las nuevas dimensiones
      const walls = ctx.scene.getWalls()
      const radio = 3.5
      let mat = 'mat.brick'
      for (const w of walls) {
        const cx = (w.start.x + w.end.x) / 2
        const cz = (w.start.z + w.end.z) / 2
        if (Math.hypot(cx - x, cz - z) <= radio) {
          if (w.materialId) mat = w.materialId
          ctx.scene.removeWall(w.id)
        }
      }

      const lvl = ctx.scene.getActiveLevel()
      const pts = [
        [x, z, x + na, z],
        [x + na, z, x + na, z + nl],
        [x + na, z + nl, x, z + nl],
        [x, z + nl, x, z]
      ]
      const ids: string[] = []
      for (const [x1, z1, x2, z2] of pts) {
        const w = ctx.scene.addWall(WallSegmentType.RoomWalls, new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2), true, lvl.id)
        w.height = 2.8
        ctx.scene.setWallMaterial(w.id, mat)
        ids.push(w.id)
      }

      return {
        ok: true,
        mensaje: `Habitación redimensionada a ${fmt(na)} × ${fmt(nl)} m.`,
        ids_creados: ids
      }
    } catch (e) {
      return { ok: false, mensaje: (e as Error).message, ids_creados: [] }
    }
  }
}
