/** Etiquetas de cota sobre cada muro (geometría pura, sin Three.js).
 *
 * La escala es fija: 1 cuadro de la cuadrícula = 1 metro (constante única
 * compartida con el panel). Aquí solo se calcula **qué** mostrar y **dónde**
 * anclarlo; el posicionamiento en pantalla lo hace `Panel.ts` proyectando el
 * ancla con `ViewportRenderer.worldToScreen`.
 */
import { SCALE_GRID_BOX_TO_METERS } from './types'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface WallDimLabel {
  wallId: string
  /** Punto de anclaje en el mundo (punto medio del muro, a media altura). */
  anchor: Vec3
  /** Longitud del muro en metros. */
  length: number
  /** Texto listo para mostrar (p. ej. «5.00 m»). */
  text: string
}

/** Longitud horizontal de un muro en metros (usa la escala fija). */
export function wallLengthMeters(start: Vec3, end: Vec3): number {
  const dx = (end.x - start.x) * SCALE_GRID_BOX_TO_METERS
  const dz = (end.z - start.z) * SCALE_GRID_BOX_TO_METERS
  return Math.hypot(dx, dz)
}

/** Construye la etiqueta de cota de un muro. */
export function makeWallLabel(
  wallId: string,
  start: Vec3,
  end: Vec3,
  height: number
): WallDimLabel {
  const length = wallLengthMeters(start, end)
  return {
    wallId,
    anchor: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 + height / 2,
      z: (start.z + end.z) / 2
    },
    length,
    text: `${length.toFixed(2)} m`
  }
}
