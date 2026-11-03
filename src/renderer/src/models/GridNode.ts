import * as THREE from 'three'

/**
 * Representa una intersección "atrapable" (snap point) de la cuadrícula
 * CAD del Viewport. Se usa para el snapping al colocar/mover paredes, para
 * que los objetos siempre queden alineados a la grilla como en un editor
 * tipo AutoCAD.
 */
export class GridNode {
  constructor(
    public readonly column: number,
    public readonly row: number,
    public readonly cellSize: number
  ) {}

  /** Posición en el mundo 3D (el plano de la cuadrícula es X-Z, Y es la altura). */
  get worldPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.column * this.cellSize, 0, this.row * this.cellSize)
  }

  /**
   * Devuelve el nodo de cuadrícula más cercano a una posición de mundo dada.
   * Usado por el motor de snapping al arrastrar objetos.
   */
  static nearestTo(worldPosition: THREE.Vector3, cellSize: number): GridNode {
    const col = Math.round(worldPosition.x / cellSize)
    const row = Math.round(worldPosition.z / cellSize)
    return new GridNode(col, row, cellSize)
  }
}
