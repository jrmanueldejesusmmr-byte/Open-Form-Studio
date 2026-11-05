export type StructuralMaterialType = 'concrete' | 'wood' | 'steel' | 'stone' | 'membrane' | 'glass'

export interface StructuralParams {
  /** Identificador del sistema estructural o figura (`struct.*` o `geo.*`). */
  systemType: string
  /** Subtipo opcional (ej. `'arco' | 'boveda' | 'cupula'` en abovedada, `'recto' | 'curvo'` en muros de carga). */
  subType?: string
  /** Número de divisiones, subdivisiones geodésicas, pliegues o lados del polígono. */
  divisions: number
  /** Cantidad de pilares, vanos o cerchas principales. */
  bays: number
  /** Cantidad de plantas/forjados (aplicable a estructura entramada). */
  floors?: number
  /** Altura de flecha del arco, bóveda, catenaria o cascarón (m). */
  archRise: number
  /** Espesor de barras, losas, cascarones o muros portantes (m). */
  thickness: number
  /** Radio principal en metros (para cúpulas, arcos, estructuras redondas, cilindros, esferas, conos, anillos). */
  radius: number
  /** Ángulo de barrido en grados (ej. muros curvos o sectores anulares, 30°–360°). */
  sweepAngle?: number
  /** Selector de material estructural visual. */
  materialType: StructuralMaterialType
}

export const STRUCTURAL_MATERIAL_TO_CATALOG: Record<StructuralMaterialType, string> = {
  concrete: 'mat.concrete',
  wood: 'mat.wood',
  steel: 'mat.steel',
  stone: 'mat.stone',
  membrane: 'mat.plaster',
  glass: 'mat.glass'
}

export const STRUCTURAL_MATERIAL_COLOR: Record<StructuralMaterialType, number> = {
  concrete: 0xcbd5e1,
  wood: 0xb77946,
  steel: 0x64748b,
  stone: 0xa8a29e,
  membrane: 0xf8fafc,
  glass: 0x93c5fd
}

/** Devuelve si un `shapeId` corresponde a una estructura/figura con radio paramétrico dominante. */
export function isRadialStructuralShape(shapeId: string | null | undefined, subType?: string): boolean {
  if (!shapeId) return false
  if (
    shapeId === 'struct.geodesica' ||
    shapeId === 'struct.neumatica' ||
    shapeId === 'geo.cilindro' ||
    shapeId === 'geo.anillo' ||
    shapeId === 'geo.muro_curvo' ||
    shapeId === 'geo.cono' ||
    shapeId === 'geo.esfera' ||
    shapeId === 'geo.prisma' ||
    shapeId === 'shape.cylinder' ||
    shapeId === 'shape.arch'
  ) {
    return true
  }
  if (shapeId === 'struct.abovedada' && (subType === 'cupula' || subType === 'arco')) return true
  if (shapeId === 'struct.muros_carga' && subType === 'curvo') return true
  return false
}

export function isParametricStructuralShape(shapeId: string | null | undefined): boolean {
  if (!shapeId) return false
  return shapeId.startsWith('struct.') || shapeId.startsWith('geo.')
}

export function defaultStructuralParamsFor(shapeId: string): {
  size: { width: number; height: number; depth: number }
  params: StructuralParams
} {
  switch (shapeId) {
    case 'struct.adintelada':
      return {
        size: { width: 8, height: 3.6, depth: 5 },
        params: {
          systemType: shapeId,
          divisions: 2,
          bays: 3,
          archRise: 0,
          thickness: 0.35,
          radius: 4,
          materialType: 'concrete'
        }
      }
    case 'struct.abovedada':
      return {
        size: { width: 7, height: 4.5, depth: 7 },
        params: {
          systemType: shapeId,
          subType: 'boveda',
          divisions: 20,
          bays: 3,
          archRise: 2.2,
          thickness: 0.35,
          radius: 3.5,
          materialType: 'stone'
        }
      }
    case 'struct.entramada':
      return {
        size: { width: 10, height: 6.4, depth: 8 },
        params: {
          systemType: shapeId,
          divisions: 2,
          bays: 3,
          floors: 2,
          archRise: 0,
          thickness: 0.3,
          radius: 5,
          materialType: 'concrete'
        }
      }
    case 'struct.triangulada':
      return {
        size: { width: 10, height: 3.2, depth: 6 },
        params: {
          systemType: shapeId,
          subType: 'pratt',
          divisions: 6,
          bays: 4,
          archRise: 1.8,
          thickness: 0.14,
          radius: 5,
          materialType: 'steel'
        }
      }
    case 'struct.colgante':
      return {
        size: { width: 14, height: 6.5, depth: 4.5 },
        params: {
          systemType: shapeId,
          divisions: 10,
          bays: 2,
          archRise: 2.8,
          thickness: 0.22,
          radius: 7,
          materialType: 'steel'
        }
      }
    case 'struct.tensada':
      return {
        size: { width: 10, height: 4.5, depth: 10 },
        params: {
          systemType: shapeId,
          divisions: 22,
          bays: 4,
          archRise: 2.6,
          thickness: 0.08,
          radius: 5,
          materialType: 'membrane'
        }
      }
    case 'struct.neumatica':
      return {
        size: { width: 10, height: 4.8, depth: 8 },
        params: {
          systemType: shapeId,
          divisions: 20,
          bays: 6,
          archRise: 4.8,
          thickness: 0.16,
          radius: 5,
          materialType: 'membrane'
        }
      }
    case 'struct.muros_carga':
      return {
        size: { width: 8, height: 3.4, depth: 6 },
        params: {
          systemType: shapeId,
          subType: 'recto',
          divisions: 16,
          bays: 3,
          archRise: 0.9,
          thickness: 0.45,
          radius: 4,
          sweepAngle: 210,
          materialType: 'stone'
        }
      }
    case 'struct.laminar':
      return {
        size: { width: 10, height: 4.2, depth: 10 },
        params: {
          systemType: shapeId,
          subType: 'hypar',
          divisions: 24,
          bays: 4,
          archRise: 2.4,
          thickness: 0.12,
          radius: 5,
          materialType: 'concrete'
        }
      }
    case 'struct.geodesica':
      return {
        size: { width: 9, height: 4.5, depth: 9 },
        params: {
          systemType: shapeId,
          subType: 'cupula',
          divisions: 2,
          bays: 5,
          archRise: 4.5,
          thickness: 0.1,
          radius: 4.5,
          materialType: 'steel'
        }
      }
    case 'struct.espacial':
      return {
        size: { width: 12, height: 4.2, depth: 10 },
        params: {
          systemType: shapeId,
          divisions: 6,
          bays: 5,
          archRise: 0.9,
          thickness: 0.09,
          radius: 6,
          materialType: 'steel'
        }
      }
    case 'struct.plegada':
      return {
        size: { width: 10, height: 3.8, depth: 7 },
        params: {
          systemType: shapeId,
          divisions: 5,
          bays: 5,
          archRise: 1.2,
          thickness: 0.16,
          radius: 5,
          materialType: 'concrete'
        }
      }
    case 'struct.voladizo':
      return {
        size: { width: 9, height: 4.4, depth: 4.5 },
        params: {
          systemType: shapeId,
          divisions: 5,
          bays: 4,
          archRise: 0.8,
          thickness: 0.35,
          radius: 4.5,
          materialType: 'concrete'
        }
      }
    case 'geo.cilindro':
      return {
        size: { width: 4, height: 3.5, depth: 4 },
        params: {
          systemType: shapeId,
          divisions: 32,
          bays: 1,
          archRise: 0,
          thickness: 0.25,
          radius: 2,
          materialType: 'concrete'
        }
      }
    case 'geo.anillo':
      return {
        size: { width: 6, height: 1.4, depth: 6 },
        params: {
          systemType: shapeId,
          divisions: 36,
          bays: 1,
          archRise: 0,
          thickness: 0.8,
          radius: 3,
          sweepAngle: 360,
          materialType: 'concrete'
        }
      }
    case 'geo.muro_curvo':
      return {
        size: { width: 6, height: 3, depth: 6 },
        params: {
          systemType: shapeId,
          divisions: 28,
          bays: 1,
          archRise: 0,
          thickness: 0.3,
          radius: 3,
          sweepAngle: 180,
          materialType: 'concrete'
        }
      }
    case 'geo.cono':
      return {
        size: { width: 4.4, height: 3.8, depth: 4.4 },
        params: {
          systemType: shapeId,
          divisions: 32,
          bays: 1,
          archRise: 0,
          thickness: 0.2,
          radius: 2.2,
          materialType: 'stone'
        }
      }
    case 'geo.esfera':
      return {
        size: { width: 4, height: 4, depth: 4 },
        params: {
          systemType: shapeId,
          divisions: 28,
          bays: 1,
          archRise: 2,
          thickness: 0.2,
          radius: 2,
          materialType: 'glass'
        }
      }
    case 'geo.prisma':
      return {
        size: { width: 4.4, height: 3.4, depth: 4.4 },
        params: {
          systemType: shapeId,
          divisions: 6,
          bays: 1,
          archRise: 0,
          thickness: 0.25,
          radius: 2.2,
          materialType: 'concrete'
        }
      }
    case 'geo.extrusion':
      return {
        size: { width: 6, height: 3.2, depth: 4.5 },
        params: {
          systemType: shapeId,
          divisions: 24,
          bays: 3,
          archRise: 0.8,
          thickness: 0.3,
          radius: 3,
          materialType: 'concrete'
        }
      }
    default:
      return {
        size: { width: 4, height: 3, depth: 4 },
        params: {
          systemType: shapeId,
          divisions: 12,
          bays: 2,
          archRise: 1,
          thickness: 0.25,
          radius: 2,
          materialType: 'concrete'
        }
      }
  }
}


export function cloneStructuralParams(
  params: StructuralParams | null | undefined
): StructuralParams | null {
  if (!params || typeof params !== 'object') return null
  return { ...params }
}
