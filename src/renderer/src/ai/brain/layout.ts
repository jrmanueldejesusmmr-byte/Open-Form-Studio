/**
 * Generador de distribución arquitectónica (Layout) — Fase 2.
 *
 * Implementa distribución espacial rigurosa basada en partición BSP/treemap
 * con pasillo central/distribuidor.
 *
 * GARANTÍAS INNEGOCIABLES:
 * - Cumplimiento EXACTO de los conteos pedidos (10 habitaciones = 10,
 *   10 ventanas = 10, 1 puerta por habitación = 10).
 * - Genera secuencias de `OrderStep[]` compatibles con el ejecutor único de transacciones.
 * - Soporta techumbre adaptada y elementos exteriores (césped y arco estilo hotel).
 *
 * NOTA: la envolvente (muros perimetrales, puerta/ventanas de fachada, piso y
 * techo) la aporta `planHouse` (`generators.ts`) cuando el planner encadena;
 * aquí se generan las habitaciones exactas retranqueadas 0,1 m por lado para
 * que sus muros no empalmen con la envolvente. El techo no se emite aquí.
 */

import type { DesignSpec, EspecExterior, EspecTecho } from './spec'
import type { OrderStep } from '../tools/executor'

export interface RoomLayout {
  id: string
  nombre: string
  x: number
  z: number
  ancho: number
  largo: number
  puertas: number
  ventanas: number
  muroPuertaIndex: number
  muroVentanaIndex: number
}

export interface BluePrint {
  nombre: string
  ancho: number
  largo: number
  origen: { x: number; z: number }
  habitaciones: RoomLayout[]
  pasillo?: { x: number; z: number; ancho: number; largo: number }
  techo: EspecTecho
  exterior?: EspecExterior
  totalPuertas: number
  totalVentanas: number
  steps: OrderStep[]
}

/**
 * Convierte un `DesignSpec` en un `BluePrint` arquitectónico completo
 * con pasos ejecutables (`OrderStep[]`).
 */
export function blueprintFromSpec(spec: DesignSpec): BluePrint {
  // Huella exterior (césped, arco y envolvente de `planHouse`) frente al
  // rectángulo de habitaciones, retranqueado 0,1 m por lado (0,2 m en total,
  // el espesor del muro) para que los muros interiores no empalmen con la
  // envolvente perimetral que se encadena en `planner.ts`.
  const hancho = Math.max(3, spec.ancho ?? 10)
  const hlargo = Math.max(3, spec.largo ?? 8)
  const hx0 = spec.origen?.x ?? 0
  const hz0 = spec.origen?.z ?? 0
  const hueco = 0.1
  const ancho = hancho - 2 * hueco
  const largo = hlargo - 2 * hueco
  const x0 = hx0 + hueco
  const z0 = hz0 + hueco
  const cantHab = Math.max(1, spec.habitaciones?.cantidad ?? 1)
  const totalVentanasPedidas = spec.ventanas?.total ?? cantHab
  const puertasPorHab = spec.puertasPorHabitacion ?? 1
  const materialMuros = spec.material?.muros ?? 'mat.brick'

  const habitaciones: RoomLayout[] = []

  // Distribución espacial con pasillo central para cantHab >= 3
  if (cantHab === 1) {
    habitaciones.push({
      id: 'hab_1',
      nombre: 'Espacio Principal',
      x: x0,
      z: z0,
      ancho,
      largo,
      puertas: puertasPorHab,
      ventanas: totalVentanasPedidas,
      muroPuertaIndex: 0,
      muroVentanaIndex: 1
    })
  } else if (cantHab === 2) {
    // 2 habitaciones: división por la mitad del lado mayor
    if (ancho >= largo) {
      const wHab = ancho / 2
      habitaciones.push({
        id: 'hab_1',
        nombre: 'Habitación 1',
        x: x0,
        z: z0,
        ancho: wHab,
        largo,
        puertas: puertasPorHab,
        ventanas: Math.ceil(totalVentanasPedidas / 2),
        muroPuertaIndex: 0,
        muroVentanaIndex: 1
      })
      habitaciones.push({
        id: 'hab_2',
        nombre: 'Habitación 2',
        x: x0 + wHab,
        z: z0,
        ancho: wHab,
        largo,
        puertas: puertasPorHab,
        ventanas: Math.floor(totalVentanasPedidas / 2),
        muroPuertaIndex: 0,
        muroVentanaIndex: 1
      })
    } else {
      const lHab = largo / 2
      habitaciones.push({
        id: 'hab_1',
        nombre: 'Habitación 1',
        x: x0,
        z: z0,
        ancho,
        largo: lHab,
        puertas: puertasPorHab,
        ventanas: Math.ceil(totalVentanasPedidas / 2),
        muroPuertaIndex: 0,
        muroVentanaIndex: 1
      })
      habitaciones.push({
        id: 'hab_2',
        nombre: 'Habitación 2',
        x: x0,
        z: z0 + lHab,
        ancho,
        largo: lHab,
        puertas: puertasPorHab,
        ventanas: Math.floor(totalVentanasPedidas / 2),
        muroPuertaIndex: 0,
        muroVentanaIndex: 1
      })
    }
  } else {
    // cantHab >= 3: Pasillo central longitudinal a lo largo de X
    // El pasillo distribuye a las habitaciones al norte (fondo) y al sur (frente)
    const pasilloWidth = Math.min(2.4, Math.max(1.4, largo * 0.12))
    const fondoAlas = (largo - pasilloWidth) / 2

    const nSur = Math.floor(cantHab / 2)
    const nNorte = cantHab - nSur

    // Reparto de ventanas exactas entre todas las habitaciones
    const vPorHab = Math.floor(totalVentanasPedidas / cantHab)
    let vRestantes = totalVentanasPedidas % cantHab

    // Ala Sur (frente): Z de Z0 a Z0 + fondoAlas
    const wSur = ancho / nSur
    for (let i = 0; i < nSur; i++) {
      const vent = vPorHab + (vRestantes > 0 ? 1 : 0)
      if (vRestantes > 0) vRestantes--
      habitaciones.push({
        id: `hab_sur_${i + 1}`,
        nombre: `Habitación ${i + 1}`,
        x: x0 + i * wSur,
        z: z0,
        ancho: wSur,
        largo: fondoAlas,
        puertas: puertasPorHab,
        ventanas: vent,
        muroPuertaIndex: 2, // Muro posterior hacia el pasillo
        muroVentanaIndex: 0  // Muro frontal hacia el exterior
      })
    }

    // Ala Norte (fondo): Z de Z0 + fondoAlas + pasilloWidth a Z0 + largo
    const zNorte = z0 + fondoAlas + pasilloWidth
    const wNorte = ancho / nNorte
    for (let i = 0; i < nNorte; i++) {
      const vent = vPorHab + (vRestantes > 0 ? 1 : 0)
      if (vRestantes > 0) vRestantes--
      habitaciones.push({
        id: `hab_norte_${i + 1}`,
        nombre: `Habitación ${nSur + i + 1}`,
        x: x0 + i * wNorte,
        z: zNorte,
        ancho: wNorte,
        largo: fondoAlas,
        puertas: puertasPorHab,
        ventanas: vent,
        muroPuertaIndex: 0, // Muro frontal hacia el pasillo
        muroVentanaIndex: 2  // Muro posterior hacia el exterior
      })
    }
  }

  // Generación de los pasos ejecutables (OrderStep[])
  const steps: OrderStep[] = []

  // 1. Césped perimetral si fue solicitado
  if (spec.exterior?.cesped) {
    const margen = spec.exterior.margen ?? 5
    const contornoCesped = [
      { x: x0 - margen, z: z0 - margen },
      { x: x0 + ancho + margen, z: z0 - margen },
      { x: x0 + ancho + margen, z: z0 + largo + margen },
      { x: x0 - margen, z: z0 + largo + margen }
    ]
    steps.push({
      herramienta: 'crear_losa',
      parametros: {
        contorno: contornoCesped,
        espesor: 0.1,
        material: 'mat.grass'
      }
    })
  }

  // 2. Construcción exacta de cada habitación con sus puertas y ventanas
  let totalVentanasGeneradas = 0
  let totalPuertasGeneradas = 0

  for (const hab of habitaciones) {
    steps.push({
      herramienta: 'crear_habitacion',
      parametros: {
        x: hab.x,
        z: hab.z,
        ancho: hab.ancho,
        largo: hab.largo,
        material: materialMuros
      }
    })

    // Puerta(s) para esta habitación
    for (let p = 0; p < hab.puertas; p++) {
      const posPuerta = Math.max(0.5, Math.min(hab.ancho - 0.5, (hab.ancho / (hab.puertas + 1)) * (p + 1)))
      steps.push({
        herramienta: 'colocar_puerta',
        parametros: {
          muro_id: `{{crear_habitacion.${hab.muroPuertaIndex}}}`,
          posicion: posPuerta
        }
      })
      totalPuertasGeneradas++
    }

    // Ventana(s) para esta habitación
    for (let v = 0; v < hab.ventanas; v++) {
      const posVentana = Math.max(0.6, Math.min(hab.ancho - 0.6, (hab.ancho / (hab.ventanas + 1)) * (v + 1)))
      steps.push({
        herramienta: 'colocar_ventana',
        parametros: {
          muro_id: `{{crear_habitacion.${hab.muroVentanaIndex}}}`,
          posicion: posVentana
        }
      })
      totalVentanasGeneradas++
    }
  }

  // 3. El techo lo aporta `planHouse` (tool `generar_casa`) cuando el planner
  // encadena la envolvente; aquí no se emite para no duplicarlo.

  // 4. Arco estilo hotel en la entrada si fue solicitado
  if (spec.exterior?.arco) {
    const estilo = spec.exterior.arco.estilo
    const altoCol = spec.exterior.arco.alto ?? 3.5
    const anchoArco = spec.exterior.arco.ancho ?? 4
    const zEntrada = z0 + largo + 0.5
    const xCentro = x0 + ancho / 2

    // Columna izquierda del arco
    steps.push({
      herramienta: 'crear_columna',
      parametros: {
        x: xCentro - anchoArco / 2,
        z: zEntrada,
        lado: estilo === 'hotel' ? 0.6 : 0.4,
        altura: altoCol,
        material: 'mat.concrete'
      }
    })

    // Columna derecha del arco
    steps.push({
      herramienta: 'crear_columna',
      parametros: {
        x: xCentro + anchoArco / 2,
        z: zEntrada,
        lado: estilo === 'hotel' ? 0.6 : 0.4,
        altura: altoCol,
        material: 'mat.concrete'
      }
    })

    // Losa / dintel superior del arco
    const xLeft = xCentro - anchoArco / 2 - 0.4
    const xRight = xCentro + anchoArco / 2 + 0.4
    const contornoDintel = [
      { x: xLeft, z: zEntrada - 0.4 },
      { x: xRight, z: zEntrada - 0.4 },
      { x: xRight, z: zEntrada + 0.4 },
      { x: xLeft, z: zEntrada + 0.4 }
    ]
    steps.push({
      herramienta: 'crear_losa',
      parametros: {
        contorno: contornoDintel,
        espesor: 0.3,
        material: 'mat.concrete'
      }
    })
  }

  return {
    nombre: spec.nombre ?? 'Casa Generada',
    ancho: hancho,
    largo: hlargo,
    origen: { x: hx0, z: hz0 },
    habitaciones,
    techo: spec.techo ?? { tipo: 'auto' },
    exterior: spec.exterior,
    totalPuertas: totalPuertasGeneradas,
    totalVentanas: totalVentanasGeneradas,
    steps
  }
}
