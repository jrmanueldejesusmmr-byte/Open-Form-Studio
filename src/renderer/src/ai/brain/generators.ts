/**
 * Generadores paramétricos (Fase 2).
 *
 * Convierten dimensiones y opciones en secuencias de pasos (`OrderStep`) que
 * llaman a las herramientas de la Fase 1. No crean geometría directamente:
 * solo planifican, para que todo pase por el dry-run y el deshacer único.
 */

import type { OrderStep } from '../tools/executor'

export interface RoomOptions {
  ancho: number
  largo: number
  alto?: number
  material?: string
  planta?: string
  x?: number
  z?: number
  /** Colocar una puerta en el primer muro. */
  puerta?: boolean
  /** Colocar una ventana en el segundo muro. */
  ventana?: boolean
}

export interface HouseOptions {
  ancho: number
  largo: number
  plantas: number
  material?: string
  roofType?: string
  x?: number
  z?: number
  /** Divisiones interiores fijas de la envolvente (tool `generar_casa`). Por defecto 1. */
  habitaciones?: number
}

/** Plan de una habitación rectangular, con puerta/ventana opcionales. */
export function planRoom(o: RoomOptions): OrderStep[] {
  const steps: OrderStep[] = []
  const habitacion: Record<string, unknown> = {
    x: o.x ?? 0, z: o.z ?? 0, ancho: o.ancho, largo: o.largo
  }
  if (o.alto !== undefined) habitacion['altura'] = o.alto
  if (o.material) habitacion['material'] = o.material
  if (o.planta) habitacion['planta'] = o.planta
  steps.push({ herramienta: 'crear_habitacion', parametros: habitacion })

  // Tras crear la habitación se conocen los ids (w0..w3) en el orden del
  // perímetro: [frente, derecha, fondo, izquierda]. La puerta va al muro 0
  // (frente) y la ventana al muro 1 (derecha), referenciando por marcador que
  // el ejecutor resuelve contra los ids creados en el paso anterior.
  if (o.puerta) {
    steps.push({
      herramienta: 'colocar_puerta',
      parametros: { muro_id: '{{crear_habitacion.0}}', posicion: Math.max(0.5, o.ancho / 2 - 0.45) }
    })
  }
  if (o.ventana) {
    steps.push({
      herramienta: 'colocar_ventana',
      parametros: { muro_id: '{{crear_habitacion.1}}', posicion: Math.max(0.5, o.largo / 2 - 0.6) }
    })
  }
  return steps
}

/**
 * Plan de una casa de 1–2 plantas con puerta, ventanas y techo.
 *
 * Para 1 planta reutiliza `generar_casa` (ya trae puerta, ventanas, piso y
 * techo). Para 2 plantas genera la planta baja con `generar_casa`, duplica la
 * planta y añade un techo sobre la superior.
 */
export function planHouse(o: HouseOptions): OrderStep[] {
  const steps: OrderStep[] = []
  // «Casa» usa generar_casa (1–4 plantas). Para más plantas el cerebro enruta a
  // «edificio» (create_building → generar_edificio), que no tiene ese tope.
  const plantas = Math.min(4, Math.max(1, o.plantas))
  const casa: Record<string, unknown> = {
    ancho: o.ancho, largo: o.largo, plantas, habitaciones: o.habitaciones ?? 1
  }
  if (o.material) casa['material_muros'] = o.material
  if (o.roofType) casa['techo'] = o.roofType
  if (o.x !== undefined) casa['x'] = o.x
  if (o.z !== undefined) casa['z'] = o.z
  steps.push({ herramienta: 'generar_casa', parametros: casa })
  return steps
}

/** Plan de un edificio de N pisos vía generar_edificio (sin tope fijo). */
/**
 * Plan provisional de casa por cuenta exacta (N habitaciones, N ventanas y
 * 1 puerta por habitación). Respeta los conteos entregados por el usuario en
 * lugar del generador fijo `generar_casa`, que solo distribuye 1 habitación y
 * 2 ventanas.
 *
 * Las N habitaciones se disponen en fila dentro de la huella (ancho × largo):
 * la banda i ocupa [x0 + i·ancho/N … x0 + (i+1)·ancho/N] con todo el largo.
 * Cada habitación se crea con `crear_habitacion` y encadena `colocar_puerta`
 * (muro 0) + `colocar_ventana` (muro 1) con los mismos marcadores que
 * `planRoom`; el ejecutor los resuelve contra los ids creados al aplicar.
 * Los módulos se reparten en la planta activa (o `o.planta` si se pasa). La
 * envolvente (muros exteriores, piso y techo) la aporta quien llama: en
 * `planner.ts` se encadena tras `planHouse` restando un hueco de 0,2 m
 * (espesor de muro) para que no se solapen los muros.
 *
 * Nota Fase 3: esta función es el cableado provisional. Cuando el procedimiento
 * `blueprintFromSpec` (`layout.ts`) esté listo, sustituye a esta función el
 * `BluePrint` que produce (`layout.ts`) convirtiéndolo a `OrderStep[]` en el
 * paso intermedio indicado.
 */
export function generarCasaPorCuenta(o: {
  ancho: number
  largo: number
  material?: string
  x?: number
  z?: number
  /** Id de planta destino (vacío = planta activa). */
  planta?: string
  habitaciones?: number
}): OrderStep[] {
  const steps: OrderStep[] = []
  // Cantidad exacta de habitaciones: viene de `order.habitaciones`
  // («casa … con N habitaciones»); sin dato se planifica 1.
  const cuenta = Math.max(1, Math.floor(o.habitaciones ?? 1))
  const x0 = o.x ?? 0
  const z0 = o.z ?? 0
  // Fila a lo largo del ancho: N módulos iguales dentro de la huella.
  const anchoHab = o.ancho / cuenta
  // `placeOnWall` falla si la posición supera la longitud del muro, así que la
  // idea (centro del muro) se ajusta al rango [0, largo − 0,05].
  const posEn = (largoMuro: number, ideal: number): number =>
    Math.max(0, Math.min(ideal, Math.max(0, largoMuro - 0.05)))

  for (let i = 0; i < cuenta; i++) {
    const habitacion: Record<string, unknown> = {
      x: x0 + i * anchoHab, z: z0, ancho: anchoHab, largo: o.largo
    }
    if (o.material) habitacion['material'] = o.material
    if (o.planta) habitacion['planta'] = o.planta
    steps.push({ herramienta: 'crear_habitacion', parametros: habitacion })

    // Igual que `planRoom`: el mapa de ids se sobrescribe con cada
    // `crear_habitacion`, así `.0`/`.1` siempre apuntan a los muros de ESTA
    // habitación (puerta al frente, ventana al muro derecho).
    steps.push({
      herramienta: 'colocar_puerta',
      parametros: {
        muro_id: '{{crear_habitacion.0}}',
        posicion: posEn(anchoHab, Math.max(0.5, anchoHab / 2 - 0.45))
      }
    })
    steps.push({
      herramienta: 'colocar_ventana',
      parametros: {
        muro_id: '{{crear_habitacion.1}}',
        posicion: posEn(o.largo, Math.max(0.5, o.largo / 2 - 0.6))
      }
    })
  }
  return steps
}

export function planBuilding(o: {
  ancho?: number
  largo?: number
  pisos?: number
  alturaPiso?: number
  habitaciones?: number
  material?: string
  roofType?: string
  fachada?: string
  x?: number
  z?: number
}): OrderStep[] {
  const p: Record<string, unknown> = {
    ancho: o.ancho ?? 12, largo: o.largo ?? 9, pisos: o.pisos ?? 1, altura_piso: o.alturaPiso ?? 3
  }
  if (o.habitaciones !== undefined) p['habitaciones_por_piso'] = o.habitaciones
  if (o.material) p['material'] = o.material
  if (o.roofType) p['techo'] = o.roofType
  if (o.fachada) p['fachada'] = o.fachada
  if (o.x !== undefined) p['x'] = o.x
  if (o.z !== undefined) p['z'] = o.z
  return [{ herramienta: 'generar_edificio', parametros: p }]
}

/** Plan de un muro suelto (requiere inicio y fin). */
export function planWall(o: { inicio: { x: number; z: number }; fin: { x: number; z: number }; altura?: number; material?: string; planta?: string }): OrderStep[] {
  const p: Record<string, unknown> = { inicio: o.inicio, fin: o.fin }
  if (o.altura !== undefined) p['altura'] = o.altura
  if (o.material) p['material'] = o.material
  if (o.planta) p['planta'] = o.planta
  return [{ herramienta: 'crear_muro', parametros: p }]
}
