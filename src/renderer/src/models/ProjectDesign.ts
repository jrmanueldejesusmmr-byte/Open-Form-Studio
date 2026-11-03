import * as THREE from 'three'
import { Wall, WallSegmentType } from './Wall'

/**
 * Representa un diseño predeterminado del navegador de proyecto ("Plantas"):
 * un plano en miniatura que, al seleccionarse, se carga como conjunto de Wall
 * sobre la cuadrícula principal.
 */
export class ProjectDesign {
  constructor(
    public name: string,
    public walls: Wall[] = []
  ) {}
}

/** Planta rectangular con tabiques interiores, base de los diseños de ejemplo. */
function createFloorPlan(width: number, depth: number, partitions: number[]): Wall[] {
  const corners = [
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, 0, depth / 2),
    new THREE.Vector3(-width / 2, 0, depth / 2)
  ]

  const walls: Wall[] = corners.map(
    (corner, index) => new Wall(corner.clone(), corners[(index + 1) % corners.length].clone())
  )

  partitions.forEach((offset, index) => {
    const type = index === 0 ? WallSegmentType.StructuralSegment : WallSegmentType.RoomWalls
    walls.push(
      new Wall(
        new THREE.Vector3(offset, 0, -depth / 2),
        new THREE.Vector3(offset, 0, depth / 2),
        type
      )
    )
  })

  return walls
}

/**
 * Diseños de ejemplo que alimentan las plantas del Navegador del Proyecto
 * y las miniaturas de las tarjetas de «Mis proyectos».
 */
const SAMPLE_SPECS: Array<{ name: string; width: number; depth: number; partitions: number[] }> = [
  { name: 'Casa moderna A', width: 8, depth: 6, partitions: [2] },
  { name: 'Casa modular B', width: 10, depth: 5, partitions: [3.5, 7] },
  { name: 'Departamento C', width: 6, depth: 7, partitions: [1.5, 4] }
]

/** Número de diseños de ejemplo (lo usa el Dashboard para elegir miniatura). */
export const SAMPLE_DESIGN_COUNT = SAMPLE_SPECS.length

export function createSampleDesigns(): ProjectDesign[] {
  return SAMPLE_SPECS.map(
    (spec) => new ProjectDesign(spec.name, createFloorPlan(spec.width, spec.depth, spec.partitions))
  )
}
