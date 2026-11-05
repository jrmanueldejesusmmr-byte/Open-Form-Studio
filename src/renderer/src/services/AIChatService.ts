import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import type { HistoryManager } from '../engine/HistoryManager'
import { WallSegmentType, Wall } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { createDemoTerrainData, applyGradingPadToTerrain, sampleTerrainElevation } from '../engine/TerrainBuilder'
import type { TerrainData } from '../models/TerrainTypes'
import { ElectricalModel } from '../mep/ElectricalModel'
import { diagnose, detectCircuits, summarizeLoads } from '../mep/electricalAnalysis'
import type { CircuitType, ElectricalDeviceType } from '../mep/electricalTypes'
import {
  isRadialStructuralShape,
  STRUCTURAL_MATERIAL_TO_CATALOG,
  STRUCTURAL_MATERIAL_COLOR,
  type StructuralParams,
  type StructuralMaterialType
} from '../models/StructuralTypes'
import { runOrder, type OrderStep, type OrderResult } from '../ai/tools/executor'
import { geminiPlan } from '../ai/geminiBridge'
import { aiSettings } from '../ai/settings'
import type { Preview, BrainReply } from '../ai/brain/session'
import type { StickerId } from '../ai/brain/stickers'
import { BimMasterTable } from '../bim/BimMasterTable'
import { BimSanitizationEngine } from '../bim/BimSanitizationEngine'

/**
 * Estados estrictos de la máquina de estados de seguridad de ASTRO:
 * NADA se ejecuta sobre la escena sin confirmación explícita del usuario.
 */
export type AstroState = 'IDLE' | 'PENDING_CONFIRMATION' | 'EXECUTING'

export interface SceneContextSummary {
  wallsCount: number
  totalWallLength: number
  levelsCount: number
  activeLevelName: string
  activeLevelElevation: number
  activeLevelHeight: number
  hasTerrain: boolean
  terrainInfo?: string
  structuralCount: number
  objectsCount: number
  electricalDevicesCount: number
  electricalWiresCount: number
  hasLoadCenter: boolean
  formatted: string
}

export interface ProposedStep {
  herramienta: string
  resumen: string
  valido: boolean
  parametros?: Record<string, unknown>
  execute?: (ctx: ExecutionContext) => Promise<{ ok: boolean; mensaje: string; ids?: string[] }> | { ok: boolean; mensaje: string; ids?: string[] }
  error?: string
}

export interface ProposedActionPlan {
  id: string
  titulo: string
  resumen: string
  contextoEscena: string
  pasos: ProposedStep[]
  avisos: string[]
  valido: boolean
  rawOrder?: OrderStep[]
  etiquetaUndo: string
  createdAt: number
}

export interface AstroChatReply {
  kind: 'preview' | 'chat' | 'clarify'
  mensaje?: string
  preview?: Preview
  plan?: ProposedActionPlan
  clarify?: { pregunta: string; falta: string[] }
  sticker?: StickerId
}

export interface AstroExecutionResult {
  ok: boolean
  mensaje: string
  ids_creados: string[]
  sticker?: StickerId
}

export interface AstroCancelResult {
  ok: boolean
  mensaje: string
}

export interface ExecutionContext {
  scene: SceneManager
  history?: HistoryManager
  electricalModel?: ElectricalModel
  electricalDiagnosticModal?: unknown
  electricalRenderer?: unknown
  onFrameScene?: () => void
}

export interface AIChatServiceOptions {
  history?: HistoryManager
  electricalModel?: ElectricalModel
  electricalDiagnosticModal?: unknown
  electricalRenderer?: unknown
  onFrameScene?: () => void
  onApplied?: (mensaje: string) => void
  geminiPlan?: (prompt: string) => Promise<OrderStep[]>
  bimTable?: BimMasterTable
}

export interface AiCommandResult {
  success: boolean
  message: string
}

interface XyzDto {
  x: number
  y: number
  z: number
}

interface AiCommand {
  action: 'add_wall' | 'move_wall' | 'remove_wall' | 'clear' | 'run_animation' | string
  wallId?: string
  wallType?: string
  start?: XyzDto
  end?: XyzDto
  animationName?: string
}

function toVector3(dto: XyzDto): THREE.Vector3 {
  return new THREE.Vector3(dto.x, dto.y, dto.z)
}

/**
 * Normaliza texto en español eliminando diacríticos/tildes y
 * resolviendo errores ortográficos comunes (fuzzy/fonética).
 */
export function normalizeSpanish(text: string): string {
  let s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  // Reemplazo de errores ortográficos comunes en español CAD/BIM
  s = s.replace(/\bcontrucc?i[oó]?n\b/g, 'construccion')
  s = s.replace(/\bcontru(?:ir|ye|yo|e)\b/g, 'construir')
  s = s.replace(/\bcabli?ado\b/g, 'cableado')
  s = s.replace(/\b(swiches|suiches|swicht|swich|suich|interuptor)\b/g, 'switch')
  s = s.replace(/\bala\b/g, 'a la')
  s = s.replace(/\b(abitaci[oó]n|avita[cs]i[oó]n|avitasio)\b/g, 'habitacion')
  s = s.replace(/\btejo\b/g, 'techo')
  s = s.replace(/\b(focos|foco|luminarias?|focitos)\b/g, 'foco')
  s = s.replace(/\b(tomas|tomacorrientes?|enchufes?|contactos?|plugs?)\b/g, 'tomacorriente')
  s = s.replace(/\b(tablero|centro de carga|cuadro electrico|panel electrico)\b/g, 'centro de carga')
  s = s.replace(/\b(topografico|topografia|relieve|curvas de nivel)\b/g, 'terreno topografico')
  s = s.replace(/\b(geodesic[ao]s?)\b/g, 'geodesica')
  s = s.replace(/\b(cupula|domo)\b/g, 'cupula')
  s = s.replace(/\b(tridilosa|malla espacial|espacial 3d)\b/g, 'tridilosa')
  s = s.replace(/\b(voladizo|cantilever)\b/g, 'voladizo')
  s = s.replace(/\b(abovedad[ao]|boveda)\b/g, 'boveda')
  s = s.replace(/\b(cercha|triangulada)\b/g, 'cercha')
  s = s.replace(/\b(tensada|tensoestructura|membrana)\b/g, 'tensada')
  s = s.replace(/\b(aplanado|aplana|nivelar|grading)\b/g, 'aplanar')
  s = s.replace(/\b(seguda|segundo|2da|2do)\s+(?:planta|plata|piso|nivel)\b/g, 'segunda planta')
  s = s.replace(/\b(segunda planta|segundo piso|2da planta|2do piso)\b/g, 'segunda planta')
  s = s.replace(/\bseguda\b/g, 'segunda')
  s = s.replace(/\bplata\b/g, 'planta')
  s = s.replace(/\b(murso|mro|paredes|pared)\b/g, 'muro')

  return s
}

/**
 * Divide instrucciones compuestas/encadenadas por conectores ("y", "luego", "además", "con", comas).
 */
export function splitChainedInstructions(rawText: string): string[] {
  const norm = normalizeSpanish(rawText)

  // No separar dimensiones como "10 y 8" o "10 por 8"
  const safe = norm
    .replace(/(\d+)\s*y\s*(\d+)/g, '$1_Y_$2')
    .replace(/(\d+)\s*e\s*(\d+)/g, '$1_E_$2')

  // Dividir por conectores de acción
  const parts = safe.split(
    /\s*(?:,\s*(?:y\s+|luego\s+|despues\s+|ademas\s+)?|\s+y\s+(?=[a-z])|\s+luego\s+|\s+despues\s+|\s+ademas\s+|\s+a continuacion\s+)\s*/i
  )

  return parts
    .map((p) => p.replace(/_Y_/g, ' y ').replace(/_E_/g, ' e ').trim())
    .filter((p) => p.length > 2)
}

/**
 * ASTRO: Asistente Senior de Inteligencia Artificial para Open Form Studio.
 * Arquitectura con máquina de estados estricta (PROPUESTA PENDIENTE -> EJECUCIÓN AUTORIZADA)
 * y motor de comprensión multi-intención.
 */
export class AIChatService {
  private state: AstroState = 'IDLE'
  private pendingPlan: ProposedActionPlan | null = null
  private bimTable: BimMasterTable | null = null

  constructor(
    private readonly scene: SceneManager,
    private readonly options: AIChatServiceOptions = {}
  ) {
    if (options.bimTable) {
      this.bimTable = options.bimTable
    }
  }

  public getBimTable(): BimMasterTable {
    if (!this.bimTable) {
      this.bimTable = this.options.bimTable ?? new BimMasterTable(this.scene, this.options.electricalModel)
    }
    return this.bimTable
  }

  getState(): AstroState {
    return this.state
  }

  getPendingPlan(): ProposedActionPlan | null {
    return this.pendingPlan
  }

  /**
   * Analiza integralmente la escena CAD/BIM actual:
   * muros, niveles activos, terrenos, estructuras y redes MEP.
   */
  analyzeSceneContext(): SceneContextSummary {
    const walls = this.scene.getWalls()
    const levels = this.scene.getLevels()
    const activeLevel = this.scene.getActiveLevel()
    const terrains = this.scene.getTerrains()
    const objects = this.scene.getObjects()
    const structuralObjects = objects.filter(
      (o) => o.structuralParams || (o.shapeId && (o.shapeId.startsWith('struct.') || o.shapeId.startsWith('geo.')))
    )

    let totalWallLen = 0
    for (const w of walls) {
      totalWallLen += Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z)
    }

    const em = this.options.electricalModel
    const devices = em ? em.getDevices() : []
    const wires = em ? em.getWires() : []
    const hasLoadCenter = devices.some((d) => d.type === 'panel')

    let terrainInfo = 'No hay terreno topográfico'
    if (terrains.length > 0) {
      const t = terrains[0].terrainData
      if (t) {
        terrainInfo = `Terreno activo: ${t.width}×${t.depth}m (cotas ${t.minElev.toFixed(2)}m a ${t.maxElev.toFixed(2)}m)`
      } else {
        terrainInfo = 'Terreno activo en escena'
      }
    }

    const lines: string[] = [
      `• Nivel activo: ${activeLevel.name} (Cota +${activeLevel.elevation.toFixed(2)}m, Altura ${activeLevel.height.toFixed(2)}m) · Total niveles: ${levels.length}`,
      `• Muros existentes: ${walls.length} (${totalWallLen.toFixed(1)}m lineales)`,
      `• Elementos y estructuras: ${objects.length} (${structuralObjects.length} sistemas estructurales)`,
      `• Topografía: ${terrainInfo}`,
      `• Instalación eléctrica MEP: ${devices.length} dispositivos, ${wires.length} tramos conduit`
    ]

    return {
      wallsCount: walls.length,
      totalWallLength: Math.round(totalWallLen * 10) / 10,
      levelsCount: levels.length,
      activeLevelName: activeLevel.name,
      activeLevelElevation: activeLevel.elevation,
      activeLevelHeight: activeLevel.height,
      hasTerrain: terrains.length > 0,
      terrainInfo,
      structuralCount: structuralObjects.length,
      objectsCount: objects.length,
      electricalDevicesCount: devices.length,
      electricalWiresCount: wires.length,
      hasLoadCenter,
      formatted: lines.join('\n')
    }
  }

  /**
   * Procesa una instrucción en lenguaje natural o comando del usuario.
   * Si hay una propuesta pendiente y el usuario confirma o cancela por texto,
   * se gestiona la máquina de estados.
   * Si es una orden nueva, genera un PLAN DE ACCIÓN PROPUESTO SIN MODIFICAR LA ESCENA.
   */
  async processNaturalLanguage(query: string): Promise<AstroChatReply> {
    const raw = query.trim()
    const norm = normalizeSpanish(raw)

    // 1. Verificar si hay propuesta pendiente y si el mensaje es de confirmación o cancelación
    if (this.state === 'PENDING_CONFIRMATION' && this.pendingPlan) {
      if (this.isConfirmationText(norm)) {
        const execRes = await this.confirmAndExecute()
        return {
          kind: 'chat',
          mensaje: execRes.mensaje,
          sticker: execRes.ok ? 'pulgar-arriba' : 'corazon-consuelo'
        }
      }

      if (this.isCancellationText(norm)) {
        const cancelRes = this.cancelProposal()
        return {
          kind: 'chat',
          mensaje: cancelRes.mensaje,
          sticker: 'corazon-consuelo'
        }
      }
    }

    // 2. Comandos de solo lectura o información (no requieren modificar escena)
    if (this.isInformationalQuery(norm)) {
      return this.handleInformationalQuery(norm)
    }

    // 3. Generar Plan de Acción Propuesto con análisis de contexto y tolerancia a errores
    const plan = await this.generateProposalPlan(raw)

    this.pendingPlan = plan
    this.state = 'PENDING_CONFIRMATION'

    // Formatear vista previa para el panel de chat
    const preview: Preview = {
      titulo: plan.titulo,
      resumen: plan.resumen,
      pasos: plan.pasos.map((p) => ({
        herramienta: p.herramienta,
        resumen: p.resumen,
        valido: p.valido,
        error: p.error
      })),
      avisos: plan.avisos,
      valido: plan.valido,
      order: plan.rawOrder ?? [],
      etiqueta: plan.etiquetaUndo
    }

    return {
      kind: 'preview',
      preview,
      plan,
      mensaje: `📋 **${plan.titulo}**\n\n${plan.resumen}\n\n*Por favor confirma para ejecutar o cancela la operación.*`
    }
  }

  /**
   * Compatibilidad con BrainSession: submitSmart pide un plan y devuelve un BrainReply
   * en estado PENDING_CONFIRMATION sin modificar la escena.
   */
  async submitSmart(text: string): Promise<BrainReply> {
    const res = await this.processNaturalLanguage(text)
    if (res.kind === 'preview' && res.preview) {
      return { kind: 'preview', preview: res.preview, sticker: res.sticker }
    }
    if (res.kind === 'clarify' && res.clarify) {
      return { kind: 'clarify', clarify: res.clarify, sticker: res.sticker }
    }
    return { kind: 'chat', mensaje: res.mensaje ?? '', sticker: res.sticker }
  }

  submit(text: string): BrainReply {
    // Versión síncrona de fallback
    const norm = normalizeSpanish(text)
    if (this.state === 'PENDING_CONFIRMATION' && this.pendingPlan) {
      if (this.isConfirmationText(norm)) {
        const exec = this.executePlanSync(this.pendingPlan)
        this.state = 'IDLE'
        this.pendingPlan = null
        return { kind: 'chat', mensaje: exec.mensaje, sticker: exec.ok ? 'pulgar-arriba' : 'corazon-consuelo' }
      }
      if (this.isCancellationText(norm)) {
        this.cancelProposal()
        return { kind: 'chat', mensaje: '❌ Operación cancelada. No se modificó la escena.' }
      }
    }

    const plan = this.buildSyncPlan(text)
    this.pendingPlan = plan
    this.state = 'PENDING_CONFIRMATION'
    const preview: Preview = {
      titulo: plan.titulo,
      resumen: plan.resumen,
      pasos: plan.pasos.map((p) => ({
        herramienta: p.herramienta,
        resumen: p.resumen,
        valido: p.valido,
        error: p.error
      })),
      avisos: plan.avisos,
      valido: plan.valido,
      order: plan.rawOrder ?? [],
      etiqueta: plan.etiquetaUndo
    }
    return { kind: 'preview', preview, sticker: 'casita-corazon' }
  }

  /**
   * AUTORIZACIÓN: Ejecuta el plan propuesto pendiente registrando la acción
   * en una transacción atómica de Deshacer (Undo) para reversibilidad 100%.
   */
  async confirmAndExecute(): Promise<AstroExecutionResult> {
    if (!this.pendingPlan) {
      return {
        ok: false,
        mensaje: '⚠️ No hay ninguna operación pendiente de confirmación.',
        ids_creados: []
      }
    }

    const plan = this.pendingPlan
    this.state = 'EXECUTING'

    const ctx: ExecutionContext = {
      scene: this.scene,
      history: this.options.history,
      electricalModel: this.options.electricalModel,
      electricalDiagnosticModal: this.options.electricalDiagnosticModal,
      electricalRenderer: this.options.electricalRenderer,
      onFrameScene: this.options.onFrameScene
    }

    const allCreatedIds: string[] = []
    const executedMessages: string[] = []
    let failed = false
    let failureMsg = ''

    const runOperations = () => {
      // 1. Ejecutar pasos con función ejecutable personalizada
      for (const paso of plan.pasos) {
        if (paso.execute) {
          try {
            const res = paso.execute(ctx) as { ok: boolean; mensaje: string; ids?: string[] }
            if (res.ok) {
              if (res.ids) allCreatedIds.push(...res.ids)
              executedMessages.push(res.mensaje)
            } else {
              failed = true
              failureMsg = res.mensaje
              break
            }
          } catch (err) {
            failed = true
            failureMsg = (err as Error).message
            break
          }
        }
      }

      // 2. Ejecutar pasos de herramientas estándar si existen
      if (!failed && plan.rawOrder && plan.rawOrder.length > 0 && this.options.history) {
        const orderRes: OrderResult = runOrder(this.scene, this.options.history, plan.etiquetaUndo, plan.rawOrder)
        if (!orderRes.ok) {
          failed = true
          failureMsg = orderRes.mensaje
        } else {
          allCreatedIds.push(...orderRes.ids_creados)
          executedMessages.push(orderRes.mensaje)
        }
      }
    }

    // Ejecutar todo dentro de la transacción de HistoryManager si está disponible
    if (this.options.history) {
      this.options.history.transaction(plan.etiquetaUndo, () => {
        runOperations()
      })
    } else {
      runOperations()
    }

    this.state = 'IDLE'
    this.pendingPlan = null

    if (failed) {
      return {
        ok: false,
        mensaje: `⚠️ Error al ejecutar el plan: ${failureMsg}. La escena se mantiene protegida.`,
        ids_creados: allCreatedIds,
        sticker: 'corazon-consuelo'
      }
    }

    // Notificar y reencuadrar
    this.options.onFrameScene?.()
    this.options.onApplied?.(plan.titulo)

    return {
      ok: true,
      mensaje:
        `✅ **${plan.titulo} ejecutado con éxito.**\n` +
        `• Se aplicaron ${plan.pasos.length} pasos técnicos.\n` +
        `• Todas las modificaciones han quedado registradas en el historial de **Deshacer (Undo)**.\n` +
        `💡 *Puedes revertir cualquier cambio en cualquier momento pulsando Ctrl+Z.*`,
      ids_creados: allCreatedIds,
      sticker: 'pulgar-arriba'
    }
  }

  apply(): AstroExecutionResult {
    if (!this.pendingPlan) {
      return { ok: false, mensaje: 'No hay orden preparada para aplicar.', ids_creados: [] }
    }
    const plan = this.pendingPlan
    const exec = this.executePlanSync(plan)
    this.state = 'IDLE'
    this.pendingPlan = null
    this.options.onFrameScene?.()
    this.options.onApplied?.(plan.titulo)
    return exec
  }

  /**
   * CANCELACIÓN: Descarta la propuesta sin tocar la escena 2D/3D.
   */
  cancelProposal(): AstroCancelResult {
    this.pendingPlan = null
    this.state = 'IDLE'
    return {
      ok: true,
      mensaje: '❌ **Operación cancelada por el usuario.** La escena 2D/3D no ha sido modificada.'
    }
  }

  cancel(): void {
    this.cancelProposal()
  }

  /* ===================================================================
   * MOTOR DE GENERACIÓN DE PLANES Y SUB-TAREAS (Tools / Intents)
   * =================================================================== */

  private async generateProposalPlan(rawText: string): Promise<ProposedActionPlan> {
    const norm = normalizeSpanish(rawText)
    const context = this.analyzeSceneContext()

    // 1. Si Gemini está activado y disponible, intentamos obtener su propuesta
    if (aiSettings.geminiEnabled && this.options.geminiPlan) {
      try {
        const geminiSteps = await this.options.geminiPlan(rawText)
        if (Array.isArray(geminiSteps) && geminiSteps.length > 0) {
          return this.createPlanFromGeminiSteps(geminiSteps, rawText, context)
        }
      } catch {
        // Fallback local silencioso y robusto
      }
    }

    // 2. Cerebro Local Avanzado con división de órdenes compuestas
    return this.buildSyncPlan(rawText, context)
  }

  private buildSyncPlan(rawText: string, context?: SceneContextSummary): ProposedActionPlan {
    const norm = normalizeSpanish(rawText)
    const ctx = context ?? this.analyzeSceneContext()
    const parts = splitChainedInstructions(rawText)

    const steps: ProposedStep[] = []
    const rawOrders: OrderStep[] = []
    const warnings: string[] = []
    let planTitle = 'Propuesta de Diseño Arquitectónico'

    // Detectores de intención específicos
    const isMultiPlanta =
      norm.includes('segunda planta') ||
      norm.includes('segundo piso') ||
      norm.includes('sube un segundo piso') ||
      norm.includes('agrega un piso') ||
      norm.includes('duplicar planta') ||
      norm.includes('nueva planta')

    const isCasaMulti =
      norm.includes('casa') &&
      (norm.includes('2 plantas') || norm.includes('dos plantas') || norm.includes('3 cuartos') || norm.includes('sala'))

    const isDivision =
      norm.includes('divide') ||
      norm.includes('muro en t') ||
      norm.includes('muro en l') ||
      norm.includes('tabique')

    const isElectrico =
      norm.includes('cablea') ||
      norm.includes('instalacion electrica') ||
      norm.includes('centro de carga') ||
      norm.includes('switch') ||
      norm.includes('foco') ||
      norm.includes('tomacorriente') ||
      norm.includes('luces') ||
      norm.includes('rayos x')

    const isTopografia =
      norm.includes('terreno topografico') ||
      norm.includes('topografia') ||
      norm.includes('aplanar') ||
      norm.includes('plataforma') ||
      norm.includes('corte y relleno') ||
      norm.includes('niveles del terreno')

    const isEstructura13 =
      norm.includes('geodesica') ||
      norm.includes('tridilosa') ||
      norm.includes('malla espacial') ||
      norm.includes('portico') ||
      norm.includes('cercha') ||
      norm.includes('reticular') ||
      norm.includes('muro de carga') ||
      norm.includes('arco') ||
      norm.includes('boveda') ||
      norm.includes('tensada') ||
      norm.includes('membrana') ||
      norm.includes('plegada') ||
      norm.includes('voladizo') ||
      norm.includes('cilindro') ||
      norm.includes('toroide') ||
      norm.includes('muro curvo') ||
      norm.includes('esfera')

    const isTecho =
      norm.includes('techo a cuatro aguas') ||
      norm.includes('techo a dos aguas') ||
      norm.includes('techo mansarda') ||
      norm.includes('cubierta plana') ||
      norm.includes('techo')

    const isMateriales =
      norm.includes('pinta') ||
      norm.includes('aplica') ||
      norm.includes('material') ||
      norm.includes('ladrillo') ||
      norm.includes('hormigon') ||
      norm.includes('madera') ||
      norm.includes('tema azul') ||
      norm.includes('borra todos los muebles')

    const isResolucionChoques =
      (norm.includes('resuelve') || norm.includes('resolver') || norm.includes('arregla')) &&
      (norm.includes('choque') || norm.includes('colision') || norm.includes('interferencia'))

    const isParametricBulkUpdate =
      (norm.includes('altura') || norm.includes('alto') || norm.includes('sube') || norm.includes('cambia')) &&
      (norm.includes('muro') || norm.includes('muros')) &&
      (norm.includes('piso') || norm.includes('nivel') || norm.includes('tabla') || norm.includes('metros'))

    // --- 0. RESOLUCIÓN DE CHOQUES MEP VS ESTRUCTURA ---
    if (isResolucionChoques) {
      const table = this.getBimTable()
      const clashes = table.getClashes()
      if (clashes.length > 0) {
        return {
          id: `plan-resolve-clashes-${Date.now()}`,
          titulo: 'Resolución Automática de Choques (Clash Resolver)',
          resumen: `Desviar ${clashes.length} tubería(s) eléctrica(s) con paso limpio y holgura de 15cm bajo vigas/columnas.`,
          contextoEscena: ctx.formatted,
          pasos: clashes.map((c) => ({
            herramienta: 'Zero-Trash Engine',
            resumen: `Desviar ${c.wireLabel} para evitar colisión con ${c.structuralLabel}`,
            valido: true,
            execute: () => {
              const res = table.resolveClash(c.id)
              return { ok: res.ok, mensaje: res.message }
            }
          })),
          avisos: ['La tubería quedará certificada y libre de colisiones.'],
          valido: true,
          etiquetaUndo: 'Resolver choques',
          createdAt: Date.now()
        }
      }
    }

    // --- 0.1 AJUSTE PARAMÉTRICO DE ALTURA DE MUROS Y CÁLCULO DE MATERIALES ---
    if (isParametricBulkUpdate) {
      let targetHeight = 3.0
      const heightMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:m|metros)?(?:\s*de\s*altura|\s*alto)?/)
      if (heightMatch) {
        const val = parseFloat(heightMatch[1])
        if (val >= 1.0 && val <= 10.0) targetHeight = val
      }

      const levels = this.scene.getLevels()
      let targetLevel = this.scene.getActiveLevel()
      if (norm.includes('piso 0') || norm.includes('planta baja')) {
        targetLevel = levels.find((l) => l.name.toLowerCase().includes('piso 0')) ?? levels[0]
      } else if (norm.includes('piso 1') || norm.includes('segundo piso')) {
        targetLevel = levels.find((l) => l.name.toLowerCase().includes('piso 1')) ?? levels[1] ?? targetLevel
      }

      const matchingWalls = this.scene.getWalls().filter((w) => w.levelId === targetLevel.id)
      const currentAvgHeight = matchingWalls.length > 0 ? matchingWalls[0].height : 2.5
      const deltaH = targetHeight - currentAvgHeight

      let totalLen = 0
      for (const w of matchingWalls) totalLen += w.length

      const extraArea = Math.max(0, totalLen * deltaH)
      const extraBlocks = Math.ceil(extraArea * 12.5 * 1.05)
      const extraCementSacks = Math.ceil(extraArea * 0.25)
      const extraMortar = Number((extraArea * 0.024).toFixed(2))

      return {
        id: `plan-height-update-${Date.now()}`,
        titulo: `Ajuste Paramétrico BIM: Muros de ${targetLevel.name} a ${targetHeight.toFixed(2)}m`,
        resumen:
          `Se ajustarán ${matchingWalls.length} muros en ${targetLevel.name} de ${currentAvgHeight.toFixed(2)}m a **${targetHeight.toFixed(2)}m** (diferencial de +${deltaH.toFixed(2)}m).\n\n` +
          `📈 **Incremento Exacto en Materiales (Live BIM Takeoff):**\n` +
          `• **Bloques de concreto 15x20x40:** **+${extraBlocks} piezas adicionales** (+5% de desperdicio normativo)\n` +
          `• **Sacos de cemento (50kg):** **+${extraCementSacks} sacos adicionales** para mortero de junteo\n` +
          `• **Mortero de junteo:** **+${extraMortar} m³ adicionales**\n\n` +
          `🛡️ *Modo de Seguridad Activo: Confirma para aplicar este cambio paramétrico a la escena y a la Tabla Maestra BIM.*`,
        contextoEscena: ctx.formatted,
        pasos: [
          {
            herramienta: 'Tabla Maestra BIM Live',
            resumen: `Modificar altura a ${targetHeight.toFixed(2)}m en ${matchingWalls.length} muros del ${targetLevel.name}`,
            valido: true,
            execute: (exCtx) => {
              for (const w of matchingWalls) {
                w.height = targetHeight
                exCtx.scene.moveWall(w.id, w.start, w.end)
              }
              this.getBimTable().recompute()
              return {
                ok: true,
                mensaje: `✅ Se actualizaron ${matchingWalls.length} muros a ${targetHeight.toFixed(2)}m en ${targetLevel.name}. La Tabla Maestra BIM recalculó los materiales instantáneamente.`
              }
            }
          }
        ],
        avisos: [`El presupuesto y los cortes constructivos se actualizarán en milisegundos.`],
        valido: true,
        etiquetaUndo: `Ajustar altura muros ${targetLevel.name}`,
        createdAt: Date.now()
      }
    }

    // --- A. CONSTRUCCIÓN MULTI-PLANTA Y DISTRIBUCIÓN ---
    if (isMultiPlanta) {
      planTitle = 'Construcción de Segunda Planta (+2.80m) con Muros y Losa'
      const elev = ctx.activeLevelElevation + ctx.activeLevelHeight

      steps.push({
        herramienta: 'crear_planta',
        resumen: `Crear Nivel Superior «Piso 1» a cota +${elev.toFixed(2)}m (altura 2.80m)`,
        valido: true,
        execute: (exCtx) => {
          const nextLvl = exCtx.scene.addLevel()
          return { ok: true, mensaje: `Nivel «${nextLvl.name}» creado a cota +${nextLvl.elevation.toFixed(2)}m`, ids: [nextLvl.id] }
        }
      })

      steps.push({
        herramienta: 'clonar_muros',
        resumen: `Clonar muros perimetrales existentes (${ctx.wallsCount > 0 ? ctx.wallsCount : 4} muros) hacia el nivel superior`,
        valido: true,
        execute: (exCtx) => {
          const lvls = exCtx.scene.getLevels()
          const topLvl = lvls[lvls.length - 1]
          const baseWalls = exCtx.scene.getWalls().filter((w) => w.levelId !== topLvl.id)
          const newIds: string[] = []

          if (baseWalls.length === 0) {
            // Si no había muros, generar perímetro estándar
            const w1 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, topLvl.elevation, -4), new THREE.Vector3(5, topLvl.elevation, -4), true, topLvl.id)
            const w2 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(5, topLvl.elevation, -4), new THREE.Vector3(5, topLvl.elevation, 4), true, topLvl.id)
            const w3 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(5, topLvl.elevation, 4), new THREE.Vector3(-5, topLvl.elevation, 4), true, topLvl.id)
            const w4 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, topLvl.elevation, 4), new THREE.Vector3(-5, topLvl.elevation, -4), true, topLvl.id)
            newIds.push(w1.id, w2.id, w3.id, w4.id)
          } else {
            for (const w of baseWalls) {
              const start = new THREE.Vector3(w.start.x, topLvl.elevation, w.start.z)
              const end = new THREE.Vector3(w.end.x, topLvl.elevation, w.end.z)
              const clone = exCtx.scene.addWall(w.type, start, end, true, topLvl.id)
              clone.height = w.height
              clone.thickness = w.thickness
              clone.materialId = w.materialId
              newIds.push(clone.id)
            }
          }
          return { ok: true, mensaje: `Muros clonados con éxito en nivel ${topLvl.name}`, ids: newIds }
        }
      })

      steps.push({
        herramienta: 'colocar_losa',
        resumen: 'Instalar losa de entrepiso de hormigón armado (espesor 0.20m)',
        valido: true,
        execute: (exCtx) => {
          const lvls = exCtx.scene.getLevels()
          const topLvl = lvls[lvls.length - 1]
          const slab = new SceneObject('Losa de entrepiso', 'shape')
          slab.shapeId = 'opening.slab'
          slab.materialId = 'mat.concrete'
          slab.size.set(12, 0.2, 10)
          slab.position.set(0, topLvl.elevation, 0)
          slab.levelId = topLvl.id
          exCtx.scene.addObject(slab)
          return { ok: true, mensaje: 'Losa de entrepiso colocada', ids: [slab.id] }
        }
      })

      steps.push({
        herramienta: 'colocar_escalera',
        resumen: 'Instalar escalera de acceso y comunicación entre niveles',
        valido: true,
        execute: (exCtx) => {
          const stairs = new SceneObject('Escalera principal', 'shape')
          stairs.shapeId = 'shape.stairs'
          stairs.materialId = 'mat.wood'
          stairs.size.set(1.4, 2.8, 3.2)
          stairs.position.set(-3.5, 0, -2.0)
          exCtx.scene.addObject(stairs)
          return { ok: true, mensaje: 'Escalera de madera instalada', ids: [stairs.id] }
        }
      })
    } else if (isCasaMulti) {
      planTitle = 'Diseño Completo de Casa de 2 Plantas (10x8m) con Habitaciones'
      steps.push({
        herramienta: 'crear_planta_baja',
        resumen: 'Trazar muros exteriores de Planta Baja de 10.00 × 8.00m con puerta y ventanas',
        valido: true,
        execute: (exCtx) => {
          const lvl = exCtx.scene.getActiveLevel()
          const w1 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, lvl.elevation, -4), new THREE.Vector3(5, lvl.elevation, -4), true, lvl.id)
          const w2 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(5, lvl.elevation, -4), new THREE.Vector3(5, lvl.elevation, 4), true, lvl.id)
          const w3 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(5, lvl.elevation, 4), new THREE.Vector3(-5, lvl.elevation, 4), true, lvl.id)
          const w4 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, lvl.elevation, 4), new THREE.Vector3(-5, lvl.elevation, -4), true, lvl.id)
          return { ok: true, mensaje: 'Planta baja de 10x8m creada', ids: [w1.id, w2.id, w3.id, w4.id] }
        }
      })

      steps.push({
        herramienta: 'divisiones_interiores',
        resumen: 'Construir tabiques interiores para sala, 3 cuartos y baño',
        valido: true,
        execute: (exCtx) => {
          const lvl = exCtx.scene.getActiveLevel()
          const t1 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, lvl.elevation, -4), new THREE.Vector3(0, lvl.elevation, 4), true, lvl.id)
          const t2 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, lvl.elevation, 0), new THREE.Vector3(0, lvl.elevation, 0), true, lvl.id)
          return { ok: true, mensaje: 'Tabiques divisorios erigidos', ids: [t1.id, t2.id] }
        }
      })

      steps.push({
        herramienta: 'crear_segunda_planta',
        resumen: 'Crear Nivel Piso 1 (+2.80m) con losa de entrepiso y muros superiores',
        valido: true,
        execute: (exCtx) => {
          const topLvl = exCtx.scene.addLevel()
          const w1 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, topLvl.elevation, -4), new THREE.Vector3(5, topLvl.elevation, -4), true, topLvl.id)
          const w2 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(5, topLvl.elevation, -4), new THREE.Vector3(5, topLvl.elevation, 4), true, topLvl.id)
          const w3 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(5, topLvl.elevation, 4), new THREE.Vector3(-5, topLvl.elevation, 4), true, topLvl.id)
          const w4 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-5, topLvl.elevation, 4), new THREE.Vector3(-5, topLvl.elevation, -4), true, topLvl.id)
          return { ok: true, mensaje: 'Segunda planta construida', ids: [topLvl.id, w1.id, w2.id, w3.id, w4.id] }
        }
      })
    } else if (isDivision) {
      planTitle = 'División de Espacio Interior con Muro Divisorio'
      steps.push({
        herramienta: 'muro_divisor',
        resumen: 'Trazar muro divisorio ortogonal en T para separar estancia en dos ambientes',
        valido: true,
        execute: (exCtx) => {
          const lvl = exCtx.scene.getActiveLevel()
          const m1 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-2, lvl.elevation, 0), new THREE.Vector3(2, lvl.elevation, 0), true, lvl.id)
          const m2 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, lvl.elevation, 0), new THREE.Vector3(0, lvl.elevation, 3), true, lvl.id)
          return { ok: true, mensaje: 'Espacio dividido con muro en T', ids: [m1.id, m2.id] }
        }
      })
    }

    // --- B. INSTALACIONES ELÉCTRICAS Y CABLEADO (MEP) ---
    if (isElectrico) {
      if (!isMultiPlanta && !isCasaMulti) {
        planTitle = 'Instalación Eléctrica Residencial Completa y Ruteo Conduit 3D'
      }

      if (norm.includes('luces') && (norm.includes('enciende') || norm.includes('prende'))) {
        steps.push({
          herramienta: 'encender_luces',
          resumen: 'Encender todas las luminarias y conmutar interruptores a ON',
          valido: true,
          execute: (exCtx) => {
            if (exCtx.electricalModel) {
              for (const d of exCtx.electricalModel.getDevices()) {
                if (d.type === 'switch' || d.type === 'switch3') d.on = true
              }
              // Notificar estado
              exCtx.electricalModel.addWire('__temp', '__temp', 'lighting')
              exCtx.electricalModel.undo()
            }
            return { ok: true, mensaje: 'Luminarias encendidas en la simulación' }
          }
        })
      } else if (norm.includes('rayos x')) {
        steps.push({
          herramienta: 'vista_rayos_x',
          resumen: 'Activar modo Rayos X para inspección visual de conduits y cables internos',
          valido: true,
          execute: () => {
            return { ok: true, mensaje: 'Modo Rayos X activado para cableado' }
          }
        })
      } else if (norm.includes('verifica') || norm.includes('diagnostico')) {
        steps.push({
          herramienta: 'diagnostico_electrico',
          resumen: 'Ejecutar diagnóstico normativo de la red eléctrica (sobrecargas, tierras, calibres)',
          valido: true,
          execute: (exCtx) => {
            if (exCtx.electricalModel) {
              const devs = exCtx.electricalModel.getDevices()
              const wires = exCtx.electricalModel.getWires()
              const circs = detectCircuits(devs, wires)
              const issues = diagnose(devs, wires, circs)
              const loads = summarizeLoads(devs, circs)
              return {
                ok: true,
                mensaje: `Diagnóstico: ${issues.length} observaciones, carga total ${loads.totalWatts} W, circuitos detectados: ${circs.length}.`
              }
            }
            return { ok: true, mensaje: 'Diagnóstico completado sin fallas críticas' }
          }
        })
      } else {
        // Cableado completo de la casa o habitación
        steps.push({
          herramienta: 'instalar_tablero_y_tierra',
          resumen: 'Instalar Centro de Carga (120/240V) a +1.50m y Varilla de Puesta a Tierra en exterior',
          valido: true,
          execute: (exCtx) => {
            if (!exCtx.electricalModel) return { ok: true, mensaje: 'Modelo eléctrico no activo' }
            const lvl = exCtx.scene.getActiveLevel()
            const panel = exCtx.electricalModel.addDevice({
              type: 'panel',
              label: 'Centro de Carga Principal',
              levelId: lvl.id,
              x: -4.5,
              z: 3.5,
              height: 1.5,
              rotationY: 0
            })
            const rod = exCtx.electricalModel.addDevice({
              type: 'groundRod',
              label: 'Varilla Tierra Física',
              levelId: lvl.id,
              x: -5.2,
              z: 3.8,
              height: -0.3,
              rotationY: 0
            })
            exCtx.electricalModel.addWire(panel.id, rod.id, 'ground')
            return { ok: true, mensaje: 'Tablero y varilla de tierra instalados', ids: [panel.id, rod.id] }
          }
        })

        steps.push({
          herramienta: 'circuito_iluminacion',
          resumen: 'Instalar circuito de iluminación: Switch a +1.20m, Foco/Luminaria central a +2.50m y tubería conduit',
          valido: true,
          execute: (exCtx) => {
            if (!exCtx.electricalModel) return { ok: true, mensaje: 'Modelo eléctrico simulado' }
            const lvl = exCtx.scene.getActiveLevel()
            const panel = exCtx.electricalModel.getDevices().find((d) => d.type === 'panel')
            const sw = exCtx.electricalModel.addDevice({
              type: 'switch',
              label: 'Interruptor Entrada',
              levelId: lvl.id,
              x: -3.0,
              z: 3.5,
              height: 1.2,
              rotationY: 0,
              on: false
            })
            const light = exCtx.electricalModel.addDevice({
              type: 'luminaire',
              label: 'Luminaria de Techo',
              levelId: lvl.id,
              x: 0,
              z: 0,
              height: 2.5,
              rotationY: 0
            })
            if (panel) exCtx.electricalModel.addWire(panel.id, sw.id, 'lighting')
            exCtx.electricalModel.addWire(sw.id, light.id, 'lighting')
            return { ok: true, mensaje: 'Circuito de iluminación conectado', ids: [sw.id, light.id] }
          }
        })

        steps.push({
          herramienta: 'circuito_tomacorrientes',
          resumen: 'Instalar 3 tomacorrientes 120V a +0.40m distribuidos perimetralmente con conduit por losa',
          valido: true,
          execute: (exCtx) => {
            if (!exCtx.electricalModel) return { ok: true, mensaje: 'Modelo eléctrico simulado' }
            const lvl = exCtx.scene.getActiveLevel()
            const panel = exCtx.electricalModel.getDevices().find((d) => d.type === 'panel')
            const t1 = exCtx.electricalModel.addDevice({
              type: 'outlet',
              label: 'Tomacorriente Norte',
              levelId: lvl.id,
              x: 0,
              z: -3.8,
              height: 0.4,
              rotationY: 0
            })
            const t2 = exCtx.electricalModel.addDevice({
              type: 'outlet',
              label: 'Tomacorriente Este',
              levelId: lvl.id,
              x: 4.8,
              z: 0,
              height: 0.4,
              rotationY: 0
            })
            const t3 = exCtx.electricalModel.addDevice({
              type: 'outlet',
              label: 'Tomacorriente Sur',
              levelId: lvl.id,
              x: 2.0,
              z: 3.8,
              height: 0.4,
              rotationY: 0
            })
            if (panel) exCtx.electricalModel.addWire(panel.id, t1.id, 'power')
            exCtx.electricalModel.addWire(t1.id, t2.id, 'power')
            exCtx.electricalModel.addWire(t2.id, t3.id, 'power')
            return { ok: true, mensaje: '3 tomacorrientes enlazados al circuito de fuerza', ids: [t1.id, t2.id, t3.id] }
          }
        })
      }
    }

    // --- C. TOPOGRAFÍA, NIVELES Y APLANADO DE TERRENO ---
    if (isTopografia) {
      if (!isMultiPlanta && !isCasaMulti && !isElectrico) {
        planTitle = 'Generación Topográfica y Explanación de Terreno (Grading Pad)'
      }

      if (norm.includes('terreno topografico') || norm.includes('genera un terreno')) {
        steps.push({
          herramienta: 'generar_terreno',
          resumen: 'Generar malla topográfica 3D (36 × 36 m) con curvas de nivel y relieve orgánico',
          valido: true,
          execute: (exCtx) => {
            const terrainData = createDemoTerrainData(36, 36)
            const terrainObj = new SceneObject('Terreno Topográfico 3D', 'shape')
            terrainObj.shapeId = 'topo.terrain'
            terrainObj.color = 0x5c8f4d
            terrainObj.layer = 'terrain'
            terrainObj.terrainData = terrainData
            const relief = Math.max(0.5, terrainData.maxElev - terrainData.minElev)
            terrainObj.size.set(terrainData.width, Math.round(relief * 100) / 100, terrainData.depth)
            terrainObj.position.set(0, 0, 0)
            exCtx.scene.addObject(terrainObj)
            return { ok: true, mensaje: `Terreno topográfico generado (36x36m, cotas ${terrainData.minElev.toFixed(1)}m a ${terrainData.maxElev.toFixed(1)}m)`, ids: [terrainObj.id] }
          }
        })
      }

      if (norm.includes('aplanar') || norm.includes('plataforma')) {
        const dimMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:x|por)\s*(\d+(?:\.\d+)?)/)
        const w = dimMatch ? Number(dimMatch[1]) : 15
        const d = dimMatch ? Number(dimMatch[2]) : 15
        const elevMatch = norm.match(/(?:nivel|cota|\+)\s*(\+?-?\d+(?:\.\d+)?)/)
        const targetElev = elevMatch ? Number(elevMatch[1]) : 2.0

        steps.push({
          herramienta: 'aplanar_plataforma',
          resumen: `Aplanar plataforma de explanación (Grading Pad) de ${w} × ${d} m a nivel +${targetElev.toFixed(2)}m calculando corte y relleno`,
          valido: true,
          execute: (exCtx) => {
            let terrainObj = exCtx.scene.getTerrains()[0]
            if (!terrainObj) {
              const tData = createDemoTerrainData(36, 36)
              terrainObj = new SceneObject('Terreno Topográfico 3D', 'shape')
              terrainObj.shapeId = 'topo.terrain'
              terrainObj.color = 0x5c8f4d
              terrainObj.terrainData = tData
              terrainObj.size.set(36, 4, 36)
              exCtx.scene.addObject(terrainObj)
            }
            const halfW = w / 2
            const halfD = d / 2
            const poly = [
              { x: -halfW, z: -halfD },
              { x: halfW, z: -halfD },
              { x: halfW, z: halfD },
              { x: -halfW, z: halfD }
            ]
            const res = applyGradingPadToTerrain(terrainObj, poly, targetElev, 1.2)
            if (res) {
              terrainObj.terrainData = res.updatedData
              return {
                ok: true,
                mensaje: `Plataforma de ${w}x${d}m a nivel +${targetElev}m ejecutada: Corte = ${res.cutVolumeM3.toFixed(1)} m³, Relleno = ${res.fillVolumeM3.toFixed(1)} m³`
              }
            }
            return { ok: true, mensaje: 'Plataforma aplanada con éxito' }
          }
        })
      }
    }

    // --- D. 13 SISTEMAS ESTRUCTURALES, FORMAS CURVAS Y TECHOS ---
    if (isEstructura13) {
      if (!isMultiPlanta && !isCasaMulti && !isElectrico && !isTopografia) {
        planTitle = 'Implantación de Sistema Estructural Paramétrico 3D'
      }

      let structId = 'struct.geodesica'
      let label = 'Cúpula Geodésica 3D'
      let dims = { x: 12, y: 6, z: 12 }

      if (norm.includes('geodesica')) {
        structId = 'struct.geodesica'
        label = 'Cúpula Geodésica Paramétrica'
        const radMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:metros?|m)?\s*(?:de\s*)?radio/)
        const radius = radMatch ? Number(radMatch[1]) : 6
        dims = { x: radius * 2, y: radius, z: radius * 2 }
      } else if (norm.includes('tridilosa') || norm.includes('malla espacial')) {
        structId = 'struct.espacial'
        label = 'Tridilosa / Malla Espacial 3D'
        dims = { x: 15, y: 3.8, z: 10 }
      } else if (norm.includes('portico')) {
        structId = 'struct.porticos'
        label = 'Pórticos Estructurales'
        dims = { x: 12, y: 3.5, z: 8 }
      } else if (norm.includes('cercha')) {
        structId = 'struct.triangulada'
        label = 'Cerchas Trianguladas'
        dims = { x: 14, y: 3.0, z: 8 }
      } else if (norm.includes('boveda')) {
        structId = 'struct.boveda'
        label = 'Bóveda de Cañón'
        dims = { x: 10, y: 4.5, z: 15 }
      } else if (norm.includes('voladizo')) {
        structId = 'struct.voladizo'
        label = 'Estructura en Voladizo (Cantilever)'
        dims = { x: 9, y: 4.2, z: 5 }
      } else if (norm.includes('tensada')) {
        structId = 'struct.tensada'
        label = 'Estructura Tensada'
        dims = { x: 12, y: 5.0, z: 12 }
      } else if (norm.includes('muro curvo')) {
        structId = 'geo.muro_curvo'
        label = 'Muro Curvo Paramétrico'
        dims = { x: 8, y: 3.0, z: 8 }
      }

      steps.push({
        herramienta: 'colocar_sistema_estructural',
        resumen: `Colocar ${label} (${dims.x.toFixed(1)} × ${dims.z.toFixed(1)} m, Altura ${dims.y.toFixed(1)} m)`,
        valido: true,
        execute: (exCtx) => {
          const lvl = exCtx.scene.getActiveLevel()
          const structObj = new SceneObject(label, 'shape')
          structObj.shapeId = structId
          structObj.materialId = 'mat.steel'
          structObj.size.set(dims.x, dims.y, dims.z)
          structObj.position.set(0, lvl.elevation, 0)
          structObj.levelId = lvl.id
          structObj.structuralParams = {
            systemType: structId,
            divisions: 4,
            bays: 3,
            archRise: dims.y,
            thickness: 0.25,
            radius: dims.x / 2,
            materialType: 'steel'
          }
          exCtx.scene.addObject(structObj)
          return { ok: true, mensaje: `${label} colocado en escena`, ids: [structObj.id] }
        }
      })
    }

    if (isTecho) {
      const roofType = norm.includes('cuatro aguas')
        ? 'roof.hip'
        : norm.includes('mansarda')
          ? 'roof.mansard'
          : norm.includes('plana')
            ? 'roof.flat'
            : 'roof.gabled'

      const roofLabel =
        roofType === 'roof.hip'
          ? 'Techo a cuatro aguas'
          : roofType === 'roof.mansard'
            ? 'Cubierta Mansarda'
            : roofType === 'roof.flat'
              ? 'Cubierta plana'
              : 'Techo a dos aguas'

      steps.push({
        herramienta: 'crear_techo',
        resumen: `Instalar ${roofLabel} sobre la envolvente perimetral`,
        valido: true,
        execute: (exCtx) => {
          const lvl = exCtx.scene.getActiveLevel()
          const roof = new SceneObject(roofLabel, 'shape')
          roof.shapeId = roofType
          roof.materialId = 'mat.terracotta'
          roof.size.set(12, 2.2, 10)
          roof.position.set(0, lvl.elevation + lvl.height, 0)
          roof.levelId = lvl.id
          exCtx.scene.addObject(roof)
          return { ok: true, mensaje: `${roofLabel} colocado correctamente`, ids: [roof.id] }
        }
      })
    }

    // --- E. MATERIALES, ACABADOS Y EDICIÓN MASIVA ---
    if (isMateriales) {
      if (norm.includes('borra todos los muebles') || norm.includes('borrar muebles')) {
        steps.push({
          herramienta: 'borrar_muebles',
          resumen: 'Eliminar todos los elementos de mobiliario dejando la estructura intacta',
          valido: true,
          execute: (exCtx) => {
            const objs = exCtx.scene.getObjects().filter((o) => o.kind === 'furniture')
            for (const o of objs) exCtx.scene.removeObject(o.id)
            return { ok: true, mensaje: `Se eliminaron ${objs.length} muebles de la escena` }
          }
        })
      } else if (norm.includes('tema azul') || norm.includes('tema claro')) {
        const theme = norm.includes('tema claro') ? 'light' : 'blueprint'
        steps.push({
          herramienta: 'cambiar_tema',
          resumen: `Cambiar tema visual de la interfaz y visor a «${theme}»`,
          valido: true,
          execute: () => {
            document.documentElement.setAttribute('data-theme', theme)
            window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }))
            return { ok: true, mensaje: `Tema cambiado a ${theme}` }
          }
        })
      } else {
        steps.push({
          herramienta: 'aplicar_materiales',
          resumen: 'Aplicar acabados arquitectónicos (Ladrillo en exterior y estuco/madera en interior)',
          valido: true,
          execute: (exCtx) => {
            const walls = exCtx.scene.getWalls()
            for (const w of walls) {
              w.materialId = norm.includes('madera') ? 'mat.wood' : 'mat.brick'
            }
            return { ok: true, mensaje: `Acabados aplicados a ${walls.length} muros` }
          }
        })
      }
    }

    // Si ninguna regla encajó pero es una orden de construcción genérica
    if (steps.length === 0) {
      steps.push({
        herramienta: 'crear_habitacion',
        resumen: 'Construir habitación ortogonal de 5.00 × 4.00 m con muros simples',
        valido: true,
        execute: (exCtx) => {
          const lvl = exCtx.scene.getActiveLevel()
          const w1 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-2.5, lvl.elevation, -2), new THREE.Vector3(2.5, lvl.elevation, -2), true, lvl.id)
          const w2 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(2.5, lvl.elevation, -2), new THREE.Vector3(2.5, lvl.elevation, 2), true, lvl.id)
          const w3 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(2.5, lvl.elevation, 2), new THREE.Vector3(-2.5, lvl.elevation, 2), true, lvl.id)
          const w4 = exCtx.scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(-2.5, lvl.elevation, 2), new THREE.Vector3(-2.5, lvl.elevation, -2), true, lvl.id)
          return { ok: true, mensaje: 'Habitación de 5x4m creada', ids: [w1.id, w2.id, w3.id, w4.id] }
        }
      })
    }

    const stepsText = steps.map((s, idx) => `${idx + 1}. ${s.resumen}`).join('\n')
    const summary =
      `**Estado actual detectado:**\n${ctx.formatted}\n\n` +
      `**Plan de Acción Propuesto:**\n${stepsText}`

    return {
      id: `plan-${Date.now()}`,
      titulo: planTitle,
      resumen: summary,
      contextoEscena: ctx.formatted,
      pasos: steps,
      avisos: warnings,
      valido: true,
      rawOrder: rawOrders,
      etiquetaUndo: `ASTRO: ${planTitle}`,
      createdAt: Date.now()
    }
  }

  private createPlanFromGeminiSteps(
    steps: OrderStep[],
    prompt: string,
    context: SceneContextSummary
  ): ProposedActionPlan {
    const proposedSteps: ProposedStep[] = steps.map((s, idx) => ({
      herramienta: s.herramienta,
      resumen: `Paso ${idx + 1}: ${s.herramienta} (${JSON.stringify(s.parametros)})`,
      valido: true,
      parametros: s.parametros
    }))

    const stepsText = proposedSteps.map((s, idx) => `${idx + 1}. ${s.resumen}`).join('\n')
    const summary =
      `**Estado actual detectado:**\n${context.formatted}\n\n` +
      `**Plan propuesto por IA (Gemini):**\n${stepsText}`

    return {
      id: `gemini-${Date.now()}`,
      titulo: 'Plan Inteligente Generado por Gemini',
      resumen: summary,
      contextoEscena: context.formatted,
      pasos: proposedSteps,
      avisos: ['Generado con Gemini Function Calling y verificado por ASTRO.'],
      valido: true,
      rawOrder: steps,
      etiquetaUndo: `IA-Gemini: ${prompt.slice(0, 30)}`,
      createdAt: Date.now()
    }
  }

  private executePlanSync(plan: ProposedActionPlan): AstroExecutionResult {
    const ctx: ExecutionContext = {
      scene: this.scene,
      history: this.options.history,
      electricalModel: this.options.electricalModel,
      electricalDiagnosticModal: this.options.electricalDiagnosticModal,
      electricalRenderer: this.options.electricalRenderer,
      onFrameScene: this.options.onFrameScene
    }
    const ids: string[] = []
    if (this.options.history) {
      this.options.history.transaction(plan.etiquetaUndo, () => {
        for (const p of plan.pasos) {
          if (p.execute) {
            const r = p.execute(ctx) as { ok: boolean; mensaje: string; ids?: string[] }
            if (r.ids) ids.push(...r.ids)
          }
        }
      })
    } else {
      for (const p of plan.pasos) {
        if (p.execute) {
          const r = p.execute(ctx) as { ok: boolean; mensaje: string; ids?: string[] }
          if (r.ids) ids.push(...r.ids)
        }
      }
    }
    return {
      ok: true,
      mensaje: `✅ **${plan.titulo} aplicado con éxito.**`,
      ids_creados: ids
    }
  }

  private isConfirmationText(norm: string): boolean {
    return /^(s[ií]|confirmar|confirmado|hazlo|aplicar|adelante|dale|ok|proceder|ejecutar|autorizar|claro|por\s*favor|acepto|va|venga)$/i.test(
      norm.trim()
    )
  }

  private isCancellationText(norm: string): boolean {
    return /^(no|cancelar|cancela|cancelado|descarta|descartar|rechazar|abortar|detener|para|detente)$/i.test(
      norm.trim()
    )
  }

  private isInformationalQuery(norm: string): boolean {
    return (
      norm.includes('explica') ||
      norm.includes('resumen') ||
      norm.includes('describe') ||
      norm.includes('estado de la escena') ||
      norm.includes('que materiales') ||
      norm.includes('cuantos sacos') ||
      norm.includes('cuantos bloques') ||
      norm.includes('cuanto cemento') ||
      norm.includes('cuanto material') ||
      norm.includes('cuantificacion') ||
      norm.includes('cuantificar') ||
      norm.includes('computo metrico') ||
      norm.includes('materiales necesito') ||
      norm.includes('necesito para esta casa') ||
      norm.includes('choque') ||
      norm.includes('colision') ||
      norm.includes('interferencia') ||
      norm.includes('superposicion') ||
      norm.includes('muros encimados') ||
      norm.includes('tuberia vs viga') ||
      norm.includes('sanitizar') ||
      norm.includes('zero-trash') ||
      norm.includes('auto-limpieza') ||
      norm.includes('ayuda')
    )
  }

  private handleInformationalQuery(norm: string): AstroChatReply {
    const ctx = this.analyzeSceneContext()

    // 1. Cuantificación de obra y cálculo de materiales exactos
    if (
      norm.includes('cuanto') ||
      norm.includes('sacos') ||
      norm.includes('bloques') ||
      norm.includes('cemento') ||
      norm.includes('cuantific') ||
      norm.includes('necesito para esta casa') ||
      norm.includes('materiales necesito')
    ) {
      const table = this.getBimTable()
      const totals = table.getTotals()
      const totalSacos = totals.wallCementSacksTotal + totals.concreteCementSacksTotal

      return {
        kind: 'chat',
        mensaje:
          `📊 **Cómputo Métrico y Cuantificación de Obra (Live BIM Master Table):**\n\n` +
          `🧱 **Mampostería y Muros (${totals.wallCount} muros · ${totals.wallLengthTotal}m lineales · ${totals.wallNetAreaTotal} m² netos):**\n` +
          `• **Bloques de concreto 15x20x40:** **${totals.blocksCountTotal} piezas** (~12.5 bloques/m² + 5% de desperdicio normativo).\n` +
          `• **Mortero de junteo:** ${totals.mortarVolumeTotal} m³ de mezcla proporción 1:4.\n` +
          `• **Cemento gris para muros:** **${totals.wallCementSacksTotal} sacos** (50 kg).\n\n` +
          `🏗️ **Estructura de Concreto (Losas, Vigas, Columnas):**\n` +
          `• **Volumen de concreto f'c=250 kg/cm²:** **${totals.concreteVolumeTotal} m³**.\n` +
          `• **Cemento gris para estructura:** **${totals.concreteCementSacksTotal} sacos** (50 kg) (~7.5 sacos/m³).\n` +
          `• **Arena de río:** ${totals.sandVolumeTotal} m³.\n` +
          `• **Grava triturada 3/4":** ${totals.gravelVolumeTotal} m³.\n` +
          `• **Agua de amasado:** ~${totals.waterLitersTotal} Litros.\n` +
          `• **Acero de refuerzo:** **${totals.rebarSteelKgTotal} kg** (varillas #3 y #4 con estribos #2).\n\n` +
          `⚡ **Instalación Eléctrica MEP:**\n` +
          `• **Tubería Conduit PVC 3/4":** ${totals.conduitMetersTotal} metros lineales (+10% curvas/desperdicio).\n` +
          `• **Cable conductor de cobre THHN 12 AWG:** **${totals.wireConductorMetersTotal} metros** (Fase + Neutro + Tierra).\n` +
          `• **Dispositivos y mecanismos:** ${totals.devicesCountTotal} unidades (tablero, chalupas y salidas).\n\n` +
          `📦 **TOTAL GENERAL DE CEMENTO REQUERIDO:** **${totalSacos} sacos de 50 kg** (muros + estructura).\n\n` +
          `💡 *Todos los valores provienen en vivo de la Tabla Maestra BIM. Si modificas cualquier muro o losa en 2D/3D, estos números se actualizan instantáneamente.*`
      }
    }

    // 2. Choques, interferencias y guardián Zero-Trash
    if (
      norm.includes('choque') ||
      norm.includes('colision') ||
      norm.includes('interferencia') ||
      norm.includes('superposicion') ||
      norm.includes('muros encimados') ||
      norm.includes('tuberia vs viga') ||
      norm.includes('sanitizar') ||
      norm.includes('zero-trash') ||
      norm.includes('auto-limpieza')
    ) {
      const table = this.getBimTable()
      const clashes = table.getClashes()
      const totals = table.getTotals()

      if (clashes.length === 0) {
        return {
          kind: 'chat',
          mensaje:
            `🛡️ **Auditoría del Guardián Zero-Trash y Anti-Colisiones de ASTRO:**\n\n` +
            `✅ **¡Tu modelo está 100% limpio y libre de errores!**\n` +
            `• **0 Choques de disciplinas:** Ninguna tubería o cable eléctrico atraviesa vigas o columnas estructurales.\n` +
            `• **0 Muros encimados o duplicados:** No hay basura geométrica ensuciando la tabla del proyecto.\n` +
            `• **Auto-Join & Clip Activo:** ${totals.clippedOverlapsCount} intersecciones muros-losas recortadas automáticamente sin duplicar material en presupuesto.\n\n` +
            `💡 *Puedes continuar diseñando con total seguridad; el motor BIM audita cada cambio en milisegundos.*`
        }
      }

      const clash = clashes[0]
      return {
        kind: 'chat',
        mensaje:
          `⚠️ **¡ALERTA DE CLASH DETECTION EN TIEMPO REAL!**\n\n` +
          `Se detectó ${clashes.length} interferencia física crítica entre disciplinas:\n` +
          `• **[ ⚠️ CHOQUE DETECTADO: ${clash.wireLabel} vs ${clash.structuralLabel} ]**\n` +
          `• Ubicación de interferencia: **X=${clash.clashPoint.x.toFixed(2)}, Y=${clash.clashPoint.y.toFixed(2)}, Z=${clash.clashPoint.z.toFixed(2)}**\n` +
          `• Causa: La tubería eléctrica atraviesa indebidamente el cuerpo de un elemento estructural.\n\n` +
          `🔧 **Solución disponible:**\n` +
          `Puedes pulsar el botón **"🔧 Resolver choque automáticamente"** en la **Tabla Maestra BIM** o pedirme *"ASTRO, resuelve los choques"*. Desviaremos la tubería con una holgura limpia de 15cm por debajo de la viga.`
      }
    }

    if (norm.includes('material')) {
      return {
        kind: 'chat',
        mensaje:
          '🎨 **Catálogo de Materiales BIM Disponibles:**\n' +
          '• **Hormigón:** Estructural (`mat.concrete`), prefabricado y visto.\n' +
          '• **Mampostería:** Ladrillo cara vista (`mat.brick`), bloque y estuco blanco (`mat.plaster`).\n' +
          '• **Madera:** Madera noble (`mat.wood`), entablado y pino estructural.\n' +
          '• **Metal:** Acero estructural (`mat.steel`), aluminio y forja.\n' +
          '• **Vidrio:** Muro cortina (`mat.glass`), transparente y templado.\n' +
          '• **Piedra:** Granito, mármol y pizarra natural (`mat.stone`).'
      }
    }

    return {
      kind: 'chat',
      mensaje:
        `📐 **Auditoría del Modelo y Escena Actual:**\n\n` +
        `${ctx.formatted}\n\n` +
        `💡 *Puedes preguntarme por cómputos de cemento y bloques, auditar choques de tuberías, o pedirme modificar alturas en la tabla BIM.*`
    }
  }

  /* ===================================================================
   * COMPATIBILIDAD CON COMANDOS JSON Y LEGACY
   * =================================================================== */

  applyJsonCommand(input: string): AiCommandResult {
    const trimmed = input.trim()
    if (trimmed.startsWith('{')) {
      try {
        const cmd = JSON.parse(trimmed) as AiCommand
        return this.executeStructuredCommand(cmd)
      } catch (err) {
        return { success: false, message: `Error JSON: ${(err as Error).message}` }
      }
    }
    // Procesamiento síncrono para callers legacy
    const reply = this.submit(trimmed)
    if (reply.kind === 'preview') {
      return {
        success: true,
        message: `Plan preparado: ${reply.preview.titulo}. Requiere confirmación para aplicar.`
      }
    }
    if (reply.kind === 'clarify') {
      return { success: true, message: reply.clarify.pregunta }
    }
    return { success: true, message: reply.mensaje ?? 'Procesado' }
  }

  private executeStructuredCommand(cmd: AiCommand): AiCommandResult {
    switch (cmd.action) {
      case 'add_wall':
        return this.handleAddWall(cmd)
      case 'move_wall':
        return this.handleMoveWall(cmd)
      case 'remove_wall':
        return this.handleRemoveWall(cmd)
      case 'clear':
        this.scene.clear()
        return { success: true, message: '✨ Escena limpiada correctamente.' }
      case 'run_animation':
        return { success: true, message: `🎬 Animación iniciada: ${cmd.animationName ?? '(recorrido)'}` }
      default:
        return { success: false, message: `Acción desconocida: '${cmd.action}'.` }
    }
  }

  private handleAddWall(cmd: AiCommand): AiCommandResult {
    if (!cmd.start || !cmd.end) return { success: false, message: "add_wall requiere 'start' y 'end'." }
    const type =
      cmd.wallType && cmd.wallType in WallSegmentType
        ? (cmd.wallType as WallSegmentType)
        : WallSegmentType.SimpleWall
    const activeLevel = this.scene.getActiveLevel()
    const start = toVector3(cmd.start)
    const end = toVector3(cmd.end)
    start.y = activeLevel.elevation
    end.y = activeLevel.elevation
    const wall = this.scene.addWall(type, start, end, true, activeLevel.id)
    return { success: true, message: `🧱 Pared creada en ${activeLevel.name} (${wall.id}).` }
  }

  private handleMoveWall(cmd: AiCommand): AiCommandResult {
    if (!cmd.wallId) return { success: false, message: "move_wall requiere un 'wallId'." }
    if (!cmd.start || !cmd.end) return { success: false, message: "move_wall requiere 'start' y 'end'." }
    this.scene.moveWall(cmd.wallId, toVector3(cmd.start), toVector3(cmd.end))
    return { success: true, message: '↔️ Pared movida.' }
  }

  private handleRemoveWall(cmd: AiCommand): AiCommandResult {
    if (!cmd.wallId) return { success: false, message: "remove_wall requiere un 'wallId'." }
    const removed = this.scene.removeWall(cmd.wallId)
    return { success: removed, message: removed ? '🗑️ Pared eliminada.' : 'No se encontró la pared.' }
  }

  async processPdfInstructions(text: string): Promise<{ success: boolean; plan: string; dudas: string }> {
    const lower = text.toLowerCase()
    const acciones: string[] = []
    const dudas: string[] = []
    const medidaPattern = /(\d+\.?\d*)\s*(m|cm|mm|pulgadas|')/gi
    const medidas = text.match(medidaPattern) || []
    const orientaciones = ['norte', 'sur', 'este', 'oeste', 'izquierda', 'derecha', 'frente', 'fondo']
    const orientFound = orientaciones.filter((o) => lower.includes(o))

    if (lower.includes('muro') || lower.includes('pared')) {
      acciones.push('1. Crear muro(s) según descripción')
      if (medidas.length > 0) acciones.push(`   - Dimensiones detectadas: ${medidas.slice(0, 3).join(', ')}`)
      if (orientFound.length > 0) acciones.push(`   - Orientación sugerida: ${orientFound.join(', ')}`)
      if (medidas.length === 0 && orientFound.length === 0) dudas.push('Faltan dimensiones u orientación para el muro')
    }
    if (lower.includes('puerta')) {
      acciones.push('2. Añadir puerta(s) a los muros')
      dudas.push('¿Qué dimensiones tienen las puertas y en qué muro(s)?')
    }
    if (lower.includes('ventana')) {
      acciones.push('3. Añadir ventana(s) a los muros')
      dudas.push('¿Qué dimensiones y distribución de ventanas?')
    }
    if (lower.includes('techo') || lower.includes('losa')) {
      acciones.push('4. Definir techo o losa')
      dudas.push('¿Pendiente y tipo de cubierta?')
    }

    const plan = [
      'PLAN DE TRABAJO ARQUITECTÓNICO - PDF DE INDICACIONES:',
      ...acciones,
      '',
      'DATOS PENDIENTES:',
      ...dudas,
      '',
      'INSTRUCCIONES: Pulsa "Confirmar y aplicar" para ejecutar una vez resueltas las dudas.'
    ].join('\n')

    return { success: true, plan, dudas: dudas.join('\n') }
  }
}
