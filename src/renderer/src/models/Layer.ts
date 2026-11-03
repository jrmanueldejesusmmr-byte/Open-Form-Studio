import { WallSegmentType } from './Wall'

/**
 * Tipo de línea de una capa (equivalente al "Linea de Tipo" del panel
 * Layers & Properties). Hoy es información de dibujo: se guarda en el modelo
 * y la usarán las vistas 2D/planos; en 3D no altera la malla.
 */
export enum LineType {
  Continuous = 'Continuous',
  Dashed = 'Dashed',
  Dotted = 'Dotted',
  Center = 'Center',
  Hidden = 'Hidden'
}

/**
 * Capa del dibujo (Layers & Properties). Es un objeto de datos puro; el
 * motor de render (`engine/ViewportRenderer`) aplica visibilidad y color a
 * las mallas del tipo de muro asociado, y `engine/LayerManager` notifica los
 * cambios a la UI.
 */
export class Layer {
  visible = true
  locked = false
  material = 'Hormigón'
  core = 'Núcleo 0.20 m'
  zone = 'Malla'

  constructor(
    public readonly id: string,
    public name: string,
    public color: number,
    public lineType: LineType = LineType.Continuous,
    /** Tipo de muro del motor asociado a esta capa; undefined = capa sin geometría todavía. */
    public readonly wallType?: WallSegmentType
  ) {}
}

/** Capas iniciales del proyecto: las tres de muros están conectadas al motor 3D. */
export function createDefaultLayers(): Layer[] {
  return [
    new Layer('walls-simple', 'Muros simples', 0xe0dace, LineType.Continuous, WallSegmentType.SimpleWall),
    new Layer(
      'walls-structural',
      'Segmentos estructurales',
      0xcfd6dd,
      LineType.Continuous,
      WallSegmentType.StructuralSegment
    ),
    new Layer('walls-room', 'Muros de habitación', 0xd6cbb4, LineType.Continuous, WallSegmentType.RoomWalls),
    new Layer('furniture', 'Mobiliario', 0x9aa4b2, LineType.Dashed),
    new Layer('dimensions', 'Cotas', 0x8ab4f8, LineType.Dashed),
    new Layer('annotations', 'Anotaciones / Texto', 0xf0c674, LineType.Continuous),
    new Layer('grid', 'Cuadrícula / Rejilla', 0x5b6270, LineType.Dotted)
  ]
}

/** Paleta corta para el selector de color de capa del panel de propiedades. */
export const LAYER_PALETTE: ReadonlyArray<{ name: string; color: number }> = [
  { name: 'Negro', color: 0x1b1b1f },
  { name: 'Blanco', color: 0xf2f2f2 },
  { name: 'Gris', color: 0x9aa4b2 },
  { name: 'Azul', color: 0x3d8bff },
  { name: 'Verde', color: 0x4ade80 },
  { name: 'Amarillo', color: 0xf0c674 },
  { name: 'Naranja', color: 0xe08a4a },
  { name: 'Rojo', color: 0xf87171 },
  { name: 'Morado', color: 0xa78bfa },
  { name: 'Hueso', color: 0xe0dace }
]

/** Convierte el color numérico de capa al `#rrggbb` que espera el DOM. */
export function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}
