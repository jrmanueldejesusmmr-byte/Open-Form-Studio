/** Ejecutor: dry-run + transacción única de deshacer por orden. */
import type { HistoryManager } from '../../engine/HistoryManager'
import type { SceneManager } from '../../engine/SceneManager'
import { getTool } from './registry'
import type { DryRunResult, ToolResult } from './types'
export interface OrderStep {
  herramienta: string
  parametros: Record<string, unknown>
}
export interface OrderResult {
  ok: boolean
  mensaje: string
  ids_creados: string[]
  pasos: Array<{ herramienta: string; ok: boolean; mensaje: string; ids?: string[] }>
}
export function simulateStep(scene: SceneManager, history: HistoryManager, herramienta: string, parametros: Record<string, unknown>): DryRunResult {
  const tool = getTool(herramienta)
  if (!tool) return { valido: false, resumen: '', acciones: [], avisos: [], error: `Herramienta desconocida «${herramienta}».` }
  try {
    return tool.dryRun(parametros, { scene, history })
  } catch (e) {
    return { valido: false, resumen: '', acciones: [], avisos: [], error: (e as Error).message }
  }
}

/**
 * Resuelve marcadores `{{herramienta.indice}}` en los parámetros usando los ids
 * creados por pasos anteriores de la misma orden (permite encadenar, p. ej.
 * «coloca la puerta en el primer muro que acabamos de crear»).
 */
export function resolveMarkers(parametros: Record<string, unknown>, createdByTool: Map<string, string[]>): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const m = value.match(/^\{\{([\w.]+)\.(\d+)\}\}$/)
      if (m) {
        const ids = createdByTool.get(m[1])
        if (ids && ids[Number(m[2])] !== undefined) return ids[Number(m[2])]
      }
      return value
    }
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) out[k] = walk(v)
      return out
    }
    return value
  }
  return walk(parametros) as Record<string, unknown>
}

/**
 * Indica si un valor sigue conteniendo un marcador `{{herramienta.indice}}` sin
 * resolver. Lo usa la vista previa del cerebro: un paso que aún referencia un
 * marcador depende de geometría que creará un paso anterior de la misma orden,
 * así que no se puede validar por adelantado (se valida al aplicar).
 */
export function hasUnresolvedMarker(value: unknown): boolean {
  if (typeof value === 'string') return /\{\{[^}]+\}\}/.test(value)
  if (Array.isArray(value)) return value.some(hasUnresolvedMarker)
  if (value && typeof value === 'object') return Object.values(value).some(hasUnresolvedMarker)
  return false
}

export function runOrder(scene: SceneManager, history: HistoryManager, etiqueta: string, pasos: OrderStep[]): OrderResult {
  const out: OrderResult = { ok: true, mensaje: '', ids_creados: [], pasos: [] }
  const previos: string[] = []
  const createdByTool = new Map<string, string[]>()
  // Estado previo para detectar si la orden llegó a tocar la escena.
  const wallsAntes = scene.getWalls().length
  const objectsAntes = scene.getObjects().length
  const levelsAntes = scene.getLevels().length
  try {
    history.transaction(etiqueta, () => {
      for (const paso of pasos) {
        const tool = getTool(paso.herramienta)
        if (!tool) {
          out.pasos.push({ herramienta: paso.herramienta, ok: false, mensaje: `Herramienta desconocida «${paso.herramienta}».` })
          out.ok = false
          continue
        }
        const parametros = resolveMarkers(paso.parametros, createdByTool)
        let r: ToolResult
        try {
          r = tool.run(parametros, { scene, history })
        } catch (e) {
          r = { ok: false, mensaje: (e as Error).message, ids_creados: [] }
        }
        out.pasos.push({ herramienta: paso.herramienta, ok: r.ok, mensaje: r.mensaje, ids: r.ids_creados })
        if (r.ok) {
          previos.push(r.mensaje)
          out.ids_creados.push(...r.ids_creados)
          createdByTool.set(paso.herramienta, r.ids_creados)
        } else {
          out.ok = false
        }
      }
    })
  } catch (e) {
    out.ok = false
    previos.push((e as Error).message)
  }
  out.mensaje = previos.length > 0 ? previos.join(' ') : out.ok ? 'Orden ejecutada.' : 'La orden no pudo ejecutarse.'
  if (!out.ok && previos.length === 0) {
    const fallos = out.pasos.filter((p) => !p.ok).map((p) => `${p.herramienta}: ${p.mensaje}`)
    if (fallos.length > 0) out.mensaje = fallos.join(' ')
  }
  // Rollback: si algún paso falló y la escena cambió, revertir TODO el grupo en
  // un solo paso (muros, objetos y niveles) para no dejar elementos sueltos, y
  // descartar el redo resultante (una orden fallida nunca debe poder re-aplicarse).
  const tocoEscena =
    scene.getWalls().length !== wallsAntes ||
    scene.getObjects().length !== objectsAntes ||
    scene.getLevels().length !== levelsAntes
  if (!out.ok && tocoEscena && history.canUndo()) {
    history.undo()
    history.clearRedo()
  }
  return out
}

