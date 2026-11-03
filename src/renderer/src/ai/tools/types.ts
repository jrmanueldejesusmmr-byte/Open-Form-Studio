/** FASE 1 — Capa de herramientas de la IA (tipos base). */
import type { HistoryManager } from '../../engine/HistoryManager'
import type { SceneManager } from '../../engine/SceneManager'
export interface ToolParamSchema {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object'
  description: string
  default?: unknown
  enum?: ReadonlyArray<string | number>
  minimum?: number
  maximum?: number
  items?: ToolParamSchema
  properties?: Record<string, ToolParamSchema>
  required?: ReadonlyArray<string>
}
export interface ToolSchema {
  type: 'object'
  properties: Record<string, ToolParamSchema>
  required: ReadonlyArray<string>
}
export interface PlannedAction {
  accion: string
  detalle: string
  ids_afectados: string[]
}
export interface DryRunResult {
  valido: boolean
  resumen: string
  acciones: PlannedAction[]
  avisos: string[]
  error?: string
}
export interface ToolResult {
  ok: boolean
  mensaje: string
  ids_creados: string[]
}
export interface ToolContext {
  scene: SceneManager
  history: HistoryManager
}
export interface ToolDef {
  nombre: string
  descripcion: string
  esquema: ToolSchema
  dryRun: (params: Record<string, unknown>, ctx: ToolContext) => DryRunResult
  run: (params: Record<string, unknown>, ctx: ToolContext) => ToolResult
}
export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolValidationError'
  }
}
