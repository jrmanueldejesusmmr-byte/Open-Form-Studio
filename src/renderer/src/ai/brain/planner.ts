/**
 * Planificador del cerebro (Fase 2).
 *
 * Convierte un `ParsedOrder` en una lista de pasos (`OrderStep`) que llaman a
 * las herramientas de la Fase 1, o en una pregunta de aclaración cuando falta
 * información. Nunca inventa valores obligatorios: si no están, pregunta.
 */

import type { SceneManager } from '../../engine/SceneManager'
import type { OrderStep } from '../tools/executor'
import type { ParsedOrder } from './parse'
import { planHouse, planRoom, planBuilding } from './generators'
import { resolveReference, type BrainMemory } from './memory'
import { parseDesignSpec, type EspecColocacion } from './spec'
import { blueprintFromSpec } from './layout'

export interface Plan {
  titulo: string
  resumen: string
  pasos: OrderStep[]
  avisos: string[]
  spec?: import('./spec').DesignSpec
}

export interface Clarification {
  pregunta: string
  falta: string[]
}

export type PlanResult =
  | { kind: 'plan'; plan: Plan }
  | { kind: 'clarify'; clarify: Clarification }
  | { kind: 'chat'; mensaje: string }

/** Calcula posición relativa basada en bounding boxes de muros existentes en la escena. */
function calcularOrigenRelativo(
  colocacion: EspecColocacion,
  ancho: number,
  largo: number,
  scene: SceneManager
): { x: number; z: number } {
  const walls = scene.getWalls()
  if (walls.length === 0) return { x: 0, z: 0 }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x)
    maxX = Math.max(maxX, w.start.x, w.end.x)
    minZ = Math.min(minZ, w.start.z, w.end.z)
    maxZ = Math.max(maxZ, w.start.z, w.end.z)
  }

  const margen = 4.0

  switch (colocacion.relativa) {
    case 'entre':
      return { x: (minX + maxX) / 2 - ancho / 2, z: (minZ + maxZ) / 2 - largo / 2 }
    case 'derecha':
      return { x: maxX + margen, z: minZ }
    case 'izquierda':
      return { x: minX - ancho - margen, z: minZ }
    case 'frente':
      return { x: minX, z: maxZ + margen }
    case 'detras':
      return { x: minX, z: minZ - largo - margen }
    default:
      return { x: maxX + margen, z: minZ }
  }
}

/** Construye el plan (o la aclaración) para una orden ya interpretada. */
export function plan(order: ParsedOrder, scene: SceneManager, memory: BrainMemory): PlanResult {
  switch (order.intent) {
    case 'undo':
      return { kind: 'plan', plan: { titulo: 'Deshacer', resumen: 'Deshacer el último cambio.', pasos: [{ herramienta: 'deshacer', parametros: {} }], avisos: [] } }
    case 'redo':
      return { kind: 'plan', plan: { titulo: 'Rehacer', resumen: 'Rehacer el último cambio deshecho.', pasos: [{ herramienta: 'rehacer', parametros: {} }], avisos: [] } }
    case 'describe':
      return { kind: 'plan', plan: { titulo: 'Describir la escena', resumen: 'Mostrar muros, objetos y plantas.', pasos: [{ herramienta: 'describir_escena', parametros: {} }], avisos: [] } }
    case 'list_materials':
      return { kind: 'plan', plan: { titulo: 'Materiales', resumen: 'Listar los materiales del catálogo.', pasos: [{ herramienta: 'listar_materiales', parametros: {} }], avisos: [] } }

    case 'create_room': {
      if (order.ancho === undefined || order.largo === undefined) {
        return { kind: 'clarify', clarify: { pregunta: '¿De qué medidas la habitación? Dime ancho y largo en metros (p. ej. «4 por 3»).', falta: order.missing } }
      }
      const quierePuerta = order.missing.includes('habitación con puerta') || /\bpuerta\b/.test(order.text)
      const quiereVentana = /\bventana\b/.test(order.text)
      const pasos = planRoom({
        ancho: order.ancho, largo: order.largo, alto: order.alto, material: order.material,
        planta: plantaId(order, scene), x: order.x, z: order.z, puerta: quierePuerta, ventana: quiereVentana
      })
      return {
        kind: 'plan',
        plan: {
          titulo: `Habitación ${fmt2(order.ancho)} × ${fmt2(order.largo)} m`,
          resumen: `Crear una habitación de ${fmt2(order.ancho)} × ${fmt2(order.largo)} m${order.material ? ` con ${order.material}` : ''}.`,
          pasos,
          avisos: []
        }
      }
    }

    case 'create_house': {
      const specResult = parseDesignSpec(order.text)
      const spec = specResult.spec

      if (spec.ancho === undefined && order.ancho !== undefined) spec.ancho = order.ancho
      if (spec.largo === undefined && order.largo !== undefined) spec.largo = order.largo
      if (spec.material === undefined && order.material !== undefined) spec.material = { muros: order.material }

      if (spec.ancho === undefined || spec.largo === undefined) {
        return { kind: 'clarify', clarify: { pregunta: '¿De qué medidas la casa? Dime ancho y largo en metros (p. ej. «10 por 8»).', falta: ['medidas'] } }
      }

      if (spec.colocacion?.relativa) {
        spec.origen = calcularOrigenRelativo(spec.colocacion, spec.ancho, spec.largo, scene)
      } else if (order.x !== undefined || order.z !== undefined) {
        spec.origen = { x: order.x ?? 0, z: order.z ?? 0 }
      }

      // Si la orden especifica habitaciones detalladas, ventanas, exterior o dimensiones grandes (> 15m), usamos el layout BSP:
      const esCompleja =
        (spec.habitaciones && spec.habitaciones.cantidad > 1) ||
        (spec.ventanas && spec.ventanas.total > 2) ||
        spec.exterior !== undefined ||
        spec.ancho > 15 ||
        spec.largo > 15

      if (esCompleja) {
        // Envolvente + plantas + piso + techo: `planHouse` (tool `generar_casa`).
        // Habitaciones exactas: layout BSP encadenado encima; `blueprintFromSpec`
        // retranquea 0,1 m por lado para no empalmar con la envolvente.
        const plantas = spec.pisos ?? order.plantas ?? 1
        const cantHab = spec.habitaciones?.cantidad ?? 1
        const techoPorTipo: Record<string, string> = { dosAguas: 'gable', cuatroAguas: 'hip', plano: 'flat', auto: 'gable' }
        const envolvente = planHouse({
          ancho: spec.ancho,
          largo: spec.largo,
          plantas,
          material: spec.material?.muros,
          roofType: order.roofType ?? techoPorTipo[spec.techo?.tipo ?? 'auto'],
          x: spec.origen?.x,
          z: spec.origen?.z
        })

        const bp = blueprintFromSpec(spec)
        // `generar_casa` deja activa la última planta creada; las habitaciones
        // del BSP se anclan a la planta baja para que queden habitables.
        const plantaBaja = scene.getLevels()[0]?.id
        const habitaciones = plantaBaja
          ? bp.steps.map((s) =>
              s.herramienta === 'crear_habitacion'
                ? { ...s, parametros: { ...s.parametros, planta: plantaBaja } }
                : s
            )
          : bp.steps

        const titulo = `Casa ${fmt2(spec.ancho)} × ${fmt2(spec.largo)} m (${plantas} planta${plantas > 1 ? 's' : ''}, ${cantHab} hab., ${bp.totalVentanas} vent., ${bp.totalPuertas} puertas)`
        const detalles: string[] = []
        if (spec.material?.muros) detalles.push(`muros de ${spec.material.muros}`)
        if (spec.exterior?.cesped) detalles.push('césped exterior')
        if (spec.exterior?.arco) detalles.push(`arco estilo ${spec.exterior.arco.estilo}`)

        const extra = detalles.length > 0 ? `, ${detalles.join(', ')}` : ''
        const resumen = `Generar casa de ${fmt2(spec.ancho)} × ${fmt2(spec.largo)} m con ${plantas} planta(s), envolvente con puerta, ventanas, piso y techo, y ${cantHab} habitación(es) (${bp.totalVentanas} ventanas y ${bp.totalPuertas} puertas interiores)${extra}.`
        const avisos = [...specResult.supuestos]
        if (plantas > 1 && cantHab > 1) avisos.push('Las habitaciones del BSP se crearon en la planta baja; la envolvente y el techo cubren todas las plantas.')

        return {
          kind: 'plan',
          plan: {
            titulo,
            resumen,
            pasos: [...envolvente, ...habitaciones],
            avisos,
            spec
          }
        }
      }

      const plantas = order.plantas ?? 1
      const pasos = planHouse({
        ancho: spec.ancho,
        largo: spec.largo,
        plantas,
        material: spec.material?.muros,
        roofType: order.roofType,
        x: spec.origen?.x,
        z: spec.origen?.z
      })
      const titulo = `Casa ${fmt2(spec.ancho)} × ${fmt2(spec.largo)} m (${plantas} planta${plantas > 1 ? 's' : ''})`
      const resumen = `Generar una casa de ${fmt2(spec.ancho)} × ${fmt2(spec.largo)} m con ${plantas} planta(s), puerta, ventanas y techo${order.roofType ? ` (${order.roofType})` : ''}.`
      return { kind: 'plan', plan: { titulo, resumen, pasos, avisos: [], spec } }
    }

    case 'create_building': {
      const pisos = order.pisos ?? 1
      const ancho = order.ancho ?? 12
      const largo = order.largo ?? 9
      const pasos = planBuilding({
        ancho, largo, pisos, alturaPiso: order.alturaPiso, habitaciones: order.habitaciones,
        material: order.material, roofType: order.roofType, fachada: order.fachada, x: order.x, z: order.z
      })
      const asumio: string[] = []
      if (order.ancho === undefined) asumio.push(`ancho ${ancho} m`)
      if (order.largo === undefined) asumio.push(`largo ${largo} m`)
      if (order.alturaPiso === undefined) asumio.push('altura de piso 3 m')
      const fachadaTxt = order.fachada === 'cortina_vidrio' ? ' con fachada de cortina vidrio y montantes de acero' : ''
      return {
        kind: 'plan',
        plan: {
          titulo: `Edificio de ${pisos} pisos`,
          resumen: `Generar un edificio de ${ancho} × ${largo} m con ${pisos} piso(s)${fachadaTxt}${asumio.length ? `. Asumí: ${asumio.join(', ')}.` : '.'}`,
          pasos,
          avisos: pisos > 12 ? [`${pisos} pisos crean muchos elementos; el rendimiento óptimo con instancing llegará en una fase aparte.`] : []
        }
      }
    }

    case 'create_wall': {
      if (order.x === undefined || order.z === undefined) {
        return { kind: 'clarify', clarify: { pregunta: '¿Dónde va el muro? Necesito el punto de inicio (x, z) y su longitud o el punto final.', falta: ['puntos inicio y fin'] } }
      }
      return { kind: 'clarify', clarify: { pregunta: '¿Hasta dónde llega el muro? Dame el punto final (x, z) o su longitud en metros.', falta: ['punto final'] } }
    }

    case 'create_roof': {
      const pasos: OrderStep[] = [{ herramienta: 'crear_techo', parametros: { tipo: order.roofType ?? 'gable', contorno: contornoDeEscena(scene), material: order.material } }]
      return { kind: 'plan', plan: { titulo: `Techo ${order.roofType ?? 'gable'}`, resumen: `Crear un techo (${order.roofType ?? 'gable'}) sobre la huella actual.`, pasos, avisos: [] } }
    }

    case 'create_floor':
      return { kind: 'plan', plan: { titulo: 'Nueva planta', resumen: 'Crear una planta encima de la actual.', pasos: [{ herramienta: 'crear_planta', parametros: order.alto ? { altura: order.alto } : {} }], avisos: [] } }

    case 'apply_material': {
      if (!order.material) return { kind: 'clarify', clarify: { pregunta: '¿Qué material aplico? (p. ej. ladrillo, madera, vidrio).', falta: ['material'] } }
      const ref = order.referencia
      let ids: string[] = []
      if (ref === 'la_casa' || ref === 'la_habitacion') {
        // «la casa»/«la habitación» = todos los muros creados en esa orden.
        ids = [...memory.ultimosMuros]
      } else if (ref) {
        const one = resolveReference(ref, scene, memory)
        if (one) ids = [one]
      }
      if (ids.length === 0) {
        // Sin destino explícito («aplica madera» sin selección): si hay muros
        // en la escena se aplican todos con aviso; si no, se pregunta.
        const n = scene.getWalls().length
        if (n > 0 && (ref === undefined || ref === 'seleccion')) {
          return {
            kind: 'plan',
            plan: {
              titulo: 'Aplicar material',
              resumen: `Aplicar ${order.material} a los ${n} muros de la escena (no había nada seleccionado).`,
              pasos: [{ herramienta: 'aplicar_material', parametros: { objetivo: 'todos', material: order.material } }],
              avisos: ['No había selección: se aplicó a todos los muros.']
            }
          }
        }
        return { kind: 'clarify', clarify: { pregunta: '¿A qué elemento le aplico el material? Selecciónalo en el lienzo o dime cuál.', falta: ['objetivo'] } }
      }
      const pasos: OrderStep[] = ids.map((id) => ({ herramienta: 'aplicar_material', parametros: { objetivo: id, material: order.material } }))
      const resumen = ids.length === 1 ? `Aplicar ${order.material} a ${ids[0]}.` : `Aplicar ${order.material} a los ${ids.length} muros.`
      return { kind: 'plan', plan: { titulo: 'Aplicar material', resumen, pasos, avisos: [] } }
    }

    case 'move': {
      const objetivo = order.referencia ? resolveReference(order.referencia, scene, memory) : null
      if (!objetivo) return { kind: 'clarify', clarify: { pregunta: '¿Qué muevo? Selecciónalo o dime cuál.', falta: ['objetivo'] } }
      if (order.x === undefined && order.z === undefined) return { kind: 'clarify', clarify: { pregunta: '¿A dónde lo muevo? Dame la nueva posición (x, z).', falta: ['destino'] } }
      const esMuro = scene.getWall(objetivo) !== undefined
      const nx = order.x ?? 0
      const nz = order.z ?? 0
      const parametros = esMuro
        ? { id: objetivo, inicio: { x: nx, z: nz }, fin: { x: nx + 1, z: nz } }
        : { id: objetivo, x: nx, z: nz }
      return { kind: 'plan', plan: { titulo: 'Mover', resumen: `Mover ${objetivo} a (${nx}, ${nz}).`, pasos: [{ herramienta: esMuro ? 'mover_muro' : 'mover_objeto', parametros }], avisos: [] } }
    }

    case 'delete': {
      const objetivo = order.referencia ? resolveReference(order.referencia, scene, memory) : null
      if (!objetivo) return { kind: 'clarify', clarify: { pregunta: '¿Qué borro? Selecciónalo o dime cuál.', falta: ['objetivo'] } }
      const esMuro = scene.getWall(objetivo) !== undefined
      return { kind: 'plan', plan: { titulo: 'Borrar', resumen: `Borrar ${objetivo}.`, pasos: [{ herramienta: esMuro ? 'borrar_muro' : 'borrar_objeto', parametros: { id: objetivo } }], avisos: ['Podrás deshacerlo con Ctrl+Z.'] } }
    }

    case 'delete_room': {
      const x = order.x ?? 0
      const z = order.z ?? 0
      const idx = order.habitacionIdx
      // «Borra la habitación N»: derriba los muros del recinto N-ésimo creado
      // antes (historial `memory.habitaciones`; 4 muros por crear_habitacion).
      if (idx !== undefined && idx >= 1) {
        const recinto = (memory.habitaciones[idx - 1] ?? []).filter((id) => scene.getWall(id))
        if (recinto.length > 0) {
          return {
            kind: 'plan',
            plan: {
              titulo: `Borrar habitación ${idx}`,
              resumen: `Demoler la habitación ${idx} (sus ${recinto.length} muros).`,
              pasos: recinto.map((id) => ({ herramienta: 'borrar_habitacion', parametros: { muro_id: id } })),
              avisos: ['Quedan sueltas las puertas y ventanas de esos muros. Todo se deshace con Ctrl+Z.']
            }
          }
        }
      }
      return {
        kind: 'plan',
        plan: {
          titulo: 'Borrar habitación',
          resumen: `Borrar habitación en (${fmt2(x)}, ${fmt2(z)}).`,
          pasos: [{ herramienta: 'borrar_habitacion', parametros: { x, z } }],
          avisos: ['Eliminará los muros del recinto más cercano. Podrás deshacerlo con Ctrl+Z.']
        }
      }
    }

    case 'merge_rooms': {
      const idxs = order.habitacionIdxs
      if (idxs) {
        // Centroides de los recintos N y M para que la herramienta encuentre
        // el muro divisor entre ambos.
        const centroDe = (n: number): { x: number; z: number } | null => {
          const muros = (memory.habitaciones[n - 1] ?? []).flatMap((id) => {
            const w = scene.getWall(id)
            return w ? [w] : []
          })
          if (muros.length === 0) return null
          let sx = 0
          let sz = 0
          for (const w of muros) {
            sx += (w.start.x + w.end.x) / 2
            sz += (w.start.z + w.end.z) / 2
          }
          return { x: sx / muros.length, z: sz / muros.length }
        }
        const a = centroDe(idxs[0])
        const b = centroDe(idxs[1])
        if (a && b) {
          return {
            kind: 'plan',
            plan: {
              titulo: `Unir habitación ${idxs[0]} con la ${idxs[1]}`,
              resumen: `Unir los recintos ${idxs[0]} y ${idxs[1]} demoliendo el muro divisor.`,
              pasos: [{ herramienta: 'unir_habitaciones', parametros: { x1: a.x, z1: a.z, x2: b.x, z2: b.z } }],
              avisos: ['El muro divisorio será eliminado.']
            }
          }
        }
      }
      const x = order.x ?? 0
      const z = order.z ?? 0
      return {
        kind: 'plan',
        plan: {
          titulo: 'Unir habitaciones',
          resumen: `Unir recintos contiguos demoliendo el muro divisor.`,
          pasos: [{ herramienta: 'unir_habitaciones', parametros: { x1: x, z1: z, x2: x + 4, z2: z } }],
          avisos: ['El muro divisorio será eliminado.']
        }
      }
    }

    case 'add_rooms': {
      const cant = order.habitaciones ?? 2
      const a = order.ancho ?? 4
      const l = order.largo ?? 3
      const x = order.x ?? 0
      const z = order.z ?? 0
      return {
        kind: 'plan',
        plan: {
          titulo: `Agregar ${cant} habitaciones`,
          resumen: `Agregar ${cant} habitaciones de ${a} × ${l} m.`,
          pasos: [{ herramienta: 'agregar_habitaciones', parametros: { x, z, ancho: a, largo: l, cantidad: cant, material: order.material } }],
          avisos: []
        }
      }
    }

    case 'place_door':
    case 'place_window': {
      const objetivo = resolveReference('seleccion', scene, memory) ?? memory.ultimosMuros[0] ?? null
      if (!objetivo) {
        const pregunta = order.intent === 'place_door' ? '¿En qué muro pongo la puerta? Selecciónalo primero.' : '¿En qué muro pongo la ventana? Selecciónalo primero.'
        return { kind: 'clarify', clarify: { pregunta, falta: ['muro'] } }
      }
      const herramienta = order.intent === 'place_door' ? 'colocar_puerta' : 'colocar_ventana'
      return { kind: 'plan', plan: { titulo: order.intent === 'place_door' ? 'Puerta' : 'Ventana', resumen: `${order.intent === 'place_door' ? 'Colocar puerta' : 'Colocar ventana'} en ${objetivo}.`, pasos: [{ herramienta, parametros: { muro_id: objetivo, posicion: 1 } }], avisos: [] } }
    }

    case 'exterior': {
      const ext = order.exterior
      if (!ext || (!ext.cesped && !ext.arco)) {
        return { kind: 'clarify', clarify: { pregunta: '¿Qué elemento exterior quieres añadir: césped o arco de entrada?', falta: ['exterior'] } }
      }
      if (scene.getWalls().length === 0) {
        return {
          kind: 'clarify',
          clarify: { pregunta: 'Todavía no hay nada construido a donde ponerlo. Crea primero la casa o la habitación y vuelve a pedirme el exterior.', falta: ['algo construido'] }
        }
      }

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of contornoDeEscena(scene)) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
      }
      const pasos: OrderStep[] = []
      const detalles: string[] = []

      if (ext.cesped) {
        const margen = ext.margen ?? 5
        pasos.push({
          herramienta: 'crear_losa',
          parametros: {
            contorno: [
              { x: minX - margen, z: minZ - margen },
              { x: maxX + margen, z: minZ - margen },
              { x: maxX + margen, z: maxZ + margen },
              { x: minX - margen, z: maxZ + margen }
            ],
            espesor: 0.1,
            material: 'mat.grass'
          }
        })
        detalles.push('césped')
      }

      if (ext.arco) {
        const estilo = ext.arco.estilo
        const altoCol = ext.arco.alto ?? 3.5
        const anchoArco = ext.arco.ancho ?? 4
        const xCentro = (minX + maxX) / 2
        const zEntrada = maxZ + 0.5
        const lado = estilo === 'hotel' ? 0.6 : 0.4
        pasos.push({ herramienta: 'crear_columna', parametros: { x: xCentro - anchoArco / 2, z: zEntrada, lado, altura: altoCol, material: 'mat.concrete' } })
        pasos.push({ herramienta: 'crear_columna', parametros: { x: xCentro + anchoArco / 2, z: zEntrada, lado, altura: altoCol, material: 'mat.concrete' } })
        const xIzq = xCentro - anchoArco / 2 - 0.4
        const xDer = xCentro + anchoArco / 2 + 0.4
        pasos.push({
          herramienta: 'crear_losa',
          parametros: {
            contorno: [
              { x: xIzq, z: zEntrada - 0.4 },
              { x: xDer, z: zEntrada - 0.4 },
              { x: xDer, z: zEntrada + 0.4 },
              { x: xIzq, z: zEntrada + 0.4 }
            ],
            espesor: 0.3,
            material: 'mat.concrete'
          }
        })
        detalles.push(`arco ${estilo}`)
      }

      return {
        kind: 'plan',
        plan: {
          titulo: 'Exterior',
          resumen: `Añadir ${detalles.join(' y ')} alrededor de lo construido.`,
          pasos,
          avisos: ['Se coloca según el contorno actual de los muros. Puedes deshacerlo con Ctrl+Z.']
        }
      }
    }

    case 'clarify':
      return { kind: 'clarify', clarify: { pregunta: 'No me queda claro. ¿Quieres crear, mover, borrar o describir algo?', falta: order.missing } }

    default:
      return { kind: 'chat', mensaje: 'No entendí la orden. Prueba con «haz una habitación de 4 por 3», «crea una casa de 10 por 8» o «aplica ladrillo».' }
  }
}

/** Planta activa a usar (id), o `undefined` si es la activa por defecto. */
function plantaId(order: ParsedOrder, scene: SceneManager): string | undefined {
  if (order.plantaIdx === undefined) return undefined
  const levels = scene.getLevels()
  const idx = Math.min(order.plantaIdx, levels.length - 1)
  return levels[idx]?.id
}

/** Huella rectangular aproximada de la escena para el techo. */
function contornoDeEscena(scene: SceneManager): Array<{ x: number; z: number }> {
  const walls = scene.getWalls()
  if (walls.length === 0) return [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }]
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x)
    maxX = Math.max(maxX, w.start.x, w.end.x)
    minZ = Math.min(minZ, w.start.z, w.end.z)
    maxZ = Math.max(maxZ, w.start.z, w.end.z)
  }
  return [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }]
}

function fmt2(n: number): string {
  return Number(n.toFixed(2)).toString()
}

