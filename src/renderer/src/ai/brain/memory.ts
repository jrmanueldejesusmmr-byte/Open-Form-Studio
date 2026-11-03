/**
 * Memoria de contexto del cerebro (Fase 2).
 *
 * Recuerda lo último que se creó/seleccionó para resolver referencias como
 * «ese muro», «eso» o «la habitación» en la orden siguiente. Vive en la sesión
 * (no se persiste) y se actualiza tras cada orden aplicada.
 */

import type { SceneManager } from '../../engine/SceneManager'

/** Tipo de las referencias que acepta `resolveReference`. */
export type ParsedRef = 'ese_muro' | 'ese_objeto' | 'la_habitacion' | 'la_casa' | 'seleccion'

export interface BrainMemory {
  /** Ids de muros creados en la última orden (para «ese muro»). */
  ultimosMuros: string[]
  /** Ids de objetos creados en la última orden (puertas, ventanas…). */
  ultimosObjetos: string[]
  /** Id del techo creado en la última orden. */
  ultimoTecho?: string
  /** Ids de plantas creadas. */
  ultimasPlantas: string[]
  /** Muros de cada habitación creada con `crear_habitacion` (4 ids por recinto, en orden). */
  habitaciones: string[][]
  /** Material aplicado/recordado por el usuario en la conversación. */
  ultimoMaterial?: string
  /** Última planta activa usada por el cerebro (id). */
  ultimaPlantaId?: string
}

export function createMemory(): BrainMemory {
  return { ultimosMuros: [], ultimosObjetos: [], ultimasPlantas: [], habitaciones: [] }
}

/** Resuelve una referencia de memoria a un id concreto de muro/objeto. */
export function resolveReference(ref: ParsedRef, scene: SceneManager, memory: BrainMemory): string | null {
  switch (ref) {
    case 'ese_muro': {
      const selected = scene.getSelected()
      if (selected) return selected.id
      return memory.ultimosMuros[memory.ultimosMuros.length - 1] ?? null
    }
    case 'ese_objeto': {
      const sel = scene.getSelectedObject()
      if (sel) return sel.id
      return memory.ultimosObjetos[memory.ultimosObjetos.length - 1] ?? null
    }
    case 'la_habitacion':
      return memory.ultimosMuros[0] ?? null
    case 'la_casa':
      return memory.ultimosMuros[0] ?? memory.ultimoTecho ?? null
    case 'seleccion':
      return scene.getSelected()?.id ?? scene.getSelectedObject()?.id ?? null
    default:
      return null
  }
}

/** Registra los muros de una habitación recién creada (índice «habitación N»). */
export function rememberRoom(memory: BrainMemory, ids: string[]): void {
  if (ids.length > 0) memory.habitaciones.push(ids)
}

/** Actualiza la memoria con los ids creados por una orden. */
export function rememberCreated(memory: BrainMemory, ids: string[], scene: SceneManager): void {
  memory.ultimosMuros = ids.filter((id) => scene.getWall(id))
  memory.ultimosObjetos = ids.filter((id) => {
    const o = scene.getObject(id)
    return o !== undefined && o.kind !== 'roof'
  })
  const techo = ids.map((id) => scene.getObject(id)).find((o) => o?.kind === 'roof')
  if (techo) memory.ultimoTecho = techo.id
}

