import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import { WallSegmentType } from '../models/Wall'

/**
 * Comando estructurado que el widget "Chat IA" recibe del backend/modelo y
 * que este servicio traduce en operaciones sobre SceneManager. Mismo
 * contrato que Services/AIChatService.cs de la versión WPF.
 *
 * Ejemplo de comando para crear una pared:
 * {
 *   "action": "add_wall",
 *   "wallType": "SimpleWall",
 *   "start": { "x": 0, "y": 0, "z": 0 },
 *   "end":   { "x": 4, "y": 0, "z": 0 }
 * }
 */
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

export interface AiCommandResult {
  success: boolean
  message: string
}

function toVector3(dto: XyzDto): THREE.Vector3 {
  return new THREE.Vector3(dto.x, dto.y, dto.z)
}

export class AIChatService {
  constructor(private readonly scene: SceneManager) {}

  /**
   * Punto de entrada único: recibe el texto JSON estructurado o una pregunta en
   * lenguaje natural y la procesa sobre la escena o genera una respuesta arquitectónica.
   */
  applyJsonCommand(input: string): AiCommandResult {
    const trimmed = input.trim()

    // Si comienza con '{', intentamos parsear como comando JSON estructurado
    if (trimmed.startsWith('{')) {
      try {
        const cmd = JSON.parse(trimmed) as AiCommand
        return this.executeStructuredCommand(cmd)
      } catch (err) {
        return {
          success: false,
          message: `Error al procesar el comando JSON: ${(err as Error).message}`
        }
      }
    }

    // Si es lenguaje natural o preguntas arquitectónicas:
    return this.answerNaturalLanguageQuery(trimmed)
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

  private answerNaturalLanguageQuery(query: string): AiCommandResult {
    const lower = query.toLowerCase()
    const wallsCount = this.scene.getWalls().length
    const objectsCount = this.scene.getObjects().length
    const activeLevel = this.scene.getActiveLevel()

    if (lower.includes('herramienta') || lower.includes('diseño') || lower.includes('casa moderna') || lower.includes('adecuada')) {
      return {
        success: true,
        message:
          '🏛️ **Herramientas recomendadas para diseño moderno:**\n' +
          '1. **Muros de habitación (`W`)**: Permite trazar estancias completas con encaje ortogonal limpio.\n' +
          '2. **Segmento estructural (`S`)**: Ideal para pórticos, columnas y muros maestros.\n' +
          '3. **Clic izquierdo**: Dibuja y coloca elementos.\n' +
          '4. **Clic derecho**: Mueve cualquier muro o elemento sin cambiar de herramienta.\n' +
          '💡 *Consejo:* Usa la vista 3D orbital (botón central del mouse o botón de la esfera) para verificar volúmenes y proporciones.'
      }
    }

    if (lower.includes('material') || lower.includes('acabado') || lower.includes('textura')) {
      return {
        success: true,
        message:
          '🎨 **Cómo aplicar materiales a tu espacio:**\n' +
          '1. Selecciona el muro u objeto que deseas modificar haciendo clic sobre él en el visor 3D o 2D.\n' +
          '2. Abre el panel **Herramientas AEC** desde la barra lateral izquierda y despliega la sección **Materiales**.\n' +
          '3. Haz clic en el acabado deseado (Hormigón pulido, Ladrillo cara vista, Madera noble, Cristal, etc.) y se aplicará al instante.\n' +
          '💡 También puedes usar `Ctrl+Z` para deshacer cualquier cambio de material.'
      }
    }

    if (lower.includes('explica') || lower.includes('dibujo') || lower.includes('resumen') || lower.includes('modelo') || lower.includes('escena')) {
      return {
        success: true,
        message:
          `📐 **Estado actual del modelo arquitectónico:**\n` +
          `• **Piso activo:** ${activeLevel.name} (Cota: ${activeLevel.elevation.toFixed(2)} m, Altura: ${activeLevel.height.toFixed(2)} m)\n` +
          `• **Muros construidos:** ${wallsCount}\n` +
          `• **Elementos y mobiliario:** ${objectsCount}\n` +
          (wallsCount === 0 && objectsCount === 0
            ? '💡 *El lienzo está vacío. Selecciona «Muro simple» o pulsa «Añadir un muro de ejemplo» para empezar.*'
            : '✨ *El modelo tiene geometría activa. Puedes rotar en 360° con el botón central del mouse o el gizmo.*')
      }
    }

    if (lower.includes('muro') && (lower.includes('crea') || lower.includes('añad') || lower.includes('pon'))) {
      const wall = this.scene.addWall(
        WallSegmentType.SimpleWall,
        new THREE.Vector3(-4, activeLevel.elevation, 0),
        new THREE.Vector3(4, activeLevel.elevation, 0),
        true,
        activeLevel.id
      )
      return {
        success: true,
        message: `✨ Muro creado con éxito en ${activeLevel.name} (ID: ${wall.id}). Puedes moverlo arrastrando con el botón derecho.`
      }
    }

    // Respuesta arquitectónica general de Astro AI
    return {
      success: true,
      message:
        `🤖 **Astro AI:** He recibido tu consulta: *«${query}»*.\n\n` +
        `Puedo ayudarte a diseñar tu proyecto CAD, trazar muros, calcular alturas de pisos, aplicar materiales y coordinar la estructura. Puedes probar los botones rápidos de abajo o comandos directos.`
    }
  }

  private handleAddWall(cmd: AiCommand): AiCommandResult {
    if (!cmd.start || !cmd.end) {
      return { success: false, message: "add_wall requiere 'start' y 'end'." }
    }
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
    if (!cmd.start || !cmd.end) {
      return { success: false, message: "move_wall requiere 'start' y 'end'." }
    }
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
    const orientFound = orientaciones.filter(o => lower.includes(o))

    if (lower.includes('muro') || lower.includes('pared')) {
      acciones.push('1. Crear muro(s) según descripción')
      if (medidas.length > 0) {
        acciones.push(`   - Dimensiones detectadas: ${medidas.slice(0, 3).join(', ')}`)
      }
      if (orientFound.length > 0) {
        acciones.push(`   - Orientación sugerida: ${orientFound.join(', ')}`)
      }
      if (medidas.length === 0 && orientFound.length === 0) {
        dudas.push('Faltan dimensiones u orientación para el muro')
      }
    }

    if (lower.includes('puerta')) {
      acciones.push('2. Añadir puerta(s) a los muros')
      dudas.push('¿Qué dimensiones tienen las puertas y en qué muro(s)?')
    }

    if (lower.includes('ventana')) {
      acciones.push('3. Añadir ventana(s) a los muros')
      dudas.push('¿Qué dimensiones y distribución de ventanas?')
    }

    if (lower.includes('techo') || lower.includes('azotea') || lower.includes('losa')) {
      acciones.push('4. Definir techo o losa')
      dudas.push('¿Pendiente, tipo de techo (a dos aguas, plana) y materiales?')
    }

    if (lower.includes('material') || lower.includes('tabla') || lower.includes('estuco') || lower.includes('madera')) {
      const materialPattern = /(tabla roca|estuco|madera|hormigón|cemento|ladrillo|pvc|vidrio)[^.,]*/gi
      const materiales = text.match(materialPattern) || []
      acciones.push('5. Aplicar materiales')
      if (materiales.length > 0) {
        acciones.push(`   - Materiales mencionados: ${materiales.slice(0, 3).join(', ')}`)
      }
    }

    if (acciones.length === 0) {
      return {
        success: true,
        plan: 'No se pudieron identificar comandos arquitectónicos específicos en el texto. Por favor, reformule con mayor claridad o use comandos directos como "crea muro de 5m".',
        dudas: ''
      }
    }

    const plan = [
      'PLAN DE TRABAJO ARQUITECTÓNICO - PDF DE INDICACIONES:',
      ...acciones,
      '',
      'DATOS PENDIENTES PARA COMPLETAR:',
      ...dudas,
      '',
      'INSTRUCCIONES: Seleccione "Ejecutar todo" para aplicar el plan, o "Editar plan" para modificar antes de ejecutar.'
    ].join('\n')

    return {
      success: true,
      plan: plan,
      dudas: dudas.join('\n')
    }
  }
}

