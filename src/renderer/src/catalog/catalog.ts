import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { IconName } from '../ui/icons'
import type { SceneObjectKind } from '../models/SceneObject'
import { MATERIAL_CATALOG } from './materials'
import { base64ToBytes, loadModel, type Model3DFormat } from '../import/modelImport'
import { CAD_BLOCKS, getCadBlock } from './cadBlocksData'

/**
 * Catálogo compartido de elementos colocables y modelos personalizados 3D.
 * El toolbox y el modal «Añadir elemento» consultan estas listas como única fuente de verdad.
 */

export type CatalogKind = SceneObjectKind

export type ModalElementCategory = 'furniture' | 'openings' | 'structural' | 'custom'

export interface CatalogEntry {
  id: string
  label: string
  kind: CatalogKind
  icon: IconName
  shapeId: string | null
  materialId: string | null
  hint: string
  /** Dimensiones base en metros (ancho, alto, fondo) para mostrar en tarjeta y escalar. */
  dimensions?: { width: number; height: number; depth: number }
  /** Categoría en el modal «Añadir elemento». */
  modalCategory?: ModalElementCategory
  /** Indica si fue subido por el usuario (GLB / glTF / OBJ). */
  isCustom?: boolean
  /** Formato del archivo 3D personalizado. */
  format?: Model3DFormat
  /** Contenido en base64 para persistencia en SQLite / localStorage. */
  modelBase64?: string
  /** Geometría 3D compilada lista para instanciar en la escena. */
  importedGeometry?: THREE.BufferGeometry | null
  /** Material compilado del modelo personalizado. */
  importedMaterial?: THREE.Material | null
}

export type CatalogCategory = 'roofs' | 'shapes' | 'furniture' | 'openings' | 'materials' | 'custom'

export const CATALOG_CATEGORIES: ReadonlyArray<{ id: CatalogCategory; label: string }> = [
  { id: 'roofs', label: 'Cubiertas' },
  { id: 'shapes', label: 'Formas' },
  { id: 'furniture', label: 'Mobiliario' },
  { id: 'openings', label: 'Huecos' },
  { id: 'materials', label: 'Materiales' },
  { id: 'custom', label: 'Personalizados' }
]

const PLACEABLE_ENTRIES: readonly CatalogEntry[] = [
  /* Estructural / Cubiertas */
  {
    id: 'roof.gable',
    label: 'Techo a dos aguas',
    kind: 'roof',
    icon: 'roof',
    shapeId: 'roof.gable',
    materialId: 'mat.terracotta',
    hint: 'Techo a dos aguas - 5.00 × 4.00m',
    dimensions: { width: 5.0, height: 1.8, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'roof.hip',
    label: 'Techo a cuatro aguas',
    kind: 'roof',
    icon: 'roof',
    shapeId: 'roof.hip',
    materialId: 'mat.terracotta',
    hint: 'Techo a cuatro aguas - 5.00 × 4.00m',
    dimensions: { width: 5.0, height: 1.8, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'roof.shed',
    label: 'Techo a un agua',
    kind: 'roof',
    icon: 'roof',
    shapeId: 'roof.shed',
    materialId: 'mat.terracotta',
    hint: 'Techo a un agua - 5.00 × 4.00m',
    dimensions: { width: 5.0, height: 1.6, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'roof.mansard',
    label: 'Cubierta Mansarda',
    kind: 'roof',
    icon: 'roof',
    shapeId: 'roof.mansard',
    materialId: 'mat.terracotta',
    hint: 'Mansarda - 5.00 × 4.00m',
    dimensions: { width: 5.0, height: 2.0, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'roof.flat',
    label: 'Cubierta plana / terraza',
    kind: 'roof',
    icon: 'roof',
    shapeId: 'roof.flat',
    materialId: 'mat.concrete',
    hint: 'Cubierta plana - 5.00 × 4.00m',
    dimensions: { width: 5.0, height: 0.35, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'roof.sawtooth',
    label: 'Cubierta diente de sierra',
    kind: 'roof',
    icon: 'roof',
    shapeId: 'roof.sawtooth',
    materialId: 'mat.metal-pot',
    hint: 'Diente de sierra - 5.00 × 4.00m',
    dimensions: { width: 5.0, height: 1.6, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.column',
    label: 'Columna estructural',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.column',
    materialId: 'mat.concrete',
    hint: 'Columna - 0.40 × 2.80m',
    dimensions: { width: 0.4, height: 2.8, depth: 0.4 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.beam',
    label: 'Viga estructural',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.beam',
    materialId: 'mat.concrete',
    hint: 'Viga - 3.00 × 0.35m',
    dimensions: { width: 3.0, height: 0.35, depth: 0.3 },
    modalCategory: 'structural'
  },
  {
    id: 'opening.slab',
    label: 'Losa / forjado',
    kind: 'shape',
    icon: 'table',
    shapeId: 'opening.slab',
    materialId: 'mat.concrete',
    hint: 'Losa - 3.00 × 3.00m',
    dimensions: { width: 3.0, height: 0.2, depth: 3.0 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.stairs',
    label: 'Escalera recta',
    kind: 'shape',
    icon: 'stairs',
    shapeId: 'shape.stairs',
    materialId: 'mat.concrete',
    hint: 'Tramo recto - 1.00 × 2.00m',
    dimensions: { width: 1.0, height: 1.5, depth: 2.0 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.arc',
    label: 'Arco estructural',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.arc',
    materialId: 'mat.stone',
    hint: 'Arco de paso - 1.60 × 1.80m',
    dimensions: { width: 1.6, height: 1.8, depth: 0.3 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.l',
    label: 'Perfil L',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.l',
    materialId: 'mat.steel',
    hint: 'Perfil en L - 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.24 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.u',
    label: 'Perfil U',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.u',
    materialId: 'mat.steel',
    hint: 'Perfil en U - 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.24 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.c',
    label: 'Perfil C',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.c',
    materialId: 'mat.steel',
    hint: 'Perfil en C - 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.24 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.t',
    label: 'Perfil T',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.t',
    materialId: 'mat.steel',
    hint: 'Perfil en T - 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.24 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.cross',
    label: 'Columna Cruz',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.cross',
    materialId: 'mat.steel',
    hint: 'Perfil en cruz - 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.24 },
    modalCategory: 'structural'
  },
  {
    id: 'shape.ring',
    label: 'Anillo circular',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'shape.ring',
    materialId: 'mat.concrete',
    hint: 'Anillo - Ø 1.40m',
    dimensions: { width: 1.4, height: 1.4, depth: 0.25 },
    modalCategory: 'structural'
  },

  /* 13 Sistemas Estructurales Arquitectónicos + Figuras Geométricas y Redondas Base */
  {
    id: 'struct.adintelada',
    label: '1. Adintelada / Arquitrabada',
    kind: 'shape',
    icon: 'building',
    shapeId: 'struct.adintelada',
    materialId: 'mat.concrete',
    hint: 'Pórticos de postes/columnas y vigas horizontales',
    dimensions: { width: 8.0, height: 3.6, depth: 5.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.abovedada',
    label: '2. Abovedada (Arco / Bóveda / Cúpula)',
    kind: 'shape',
    icon: 'building',
    shapeId: 'struct.abovedada',
    materialId: 'mat.stone',
    hint: 'Arcos de medio punto, bóvedas de cañón y cúpulas',
    dimensions: { width: 7.0, height: 4.5, depth: 7.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.entramada',
    label: '3. Entramada / Armazón 3D',
    kind: 'shape',
    icon: 'building',
    shapeId: 'struct.entramada',
    materialId: 'mat.concrete',
    hint: 'Retícula 3D de pilares, vigas y losas/forjados',
    dimensions: { width: 10.0, height: 6.4, depth: 8.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.triangulada',
    label: '4. Triangulada (Cerchas / Celosías)',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'struct.triangulada',
    materialId: 'mat.steel',
    hint: 'Cerchas metálicas o de madera y armaduras de techo',
    dimensions: { width: 10.0, height: 3.2, depth: 6.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.colgante',
    label: '5. Colgante / Suspendida',
    kind: 'shape',
    icon: 'building',
    shapeId: 'struct.colgante',
    materialId: 'mat.steel',
    hint: 'Mástiles principales, cables catenarios y tirantes',
    dimensions: { width: 14.0, height: 6.5, depth: 4.5 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.tensada',
    label: '6. Tensada / Tracción (Velaria)',
    kind: 'shape',
    icon: 'roof',
    shapeId: 'struct.tensada',
    materialId: 'mat.plaster',
    hint: 'Velaria hiperbólica textil con mástiles tensores',
    dimensions: { width: 10.0, height: 4.5, depth: 10.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.neumatica',
    label: '7. Neumática / Inflable',
    kind: 'shape',
    icon: 'orbit',
    shapeId: 'struct.neumatica',
    materialId: 'mat.plaster',
    hint: 'Domo y pabellón presurizado de geometría curva',
    dimensions: { width: 10.0, height: 4.8, depth: 8.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.muros_carga',
    label: '8. Muros de Carga (Rectos / Curvos)',
    kind: 'shape',
    icon: 'wall',
    shapeId: 'struct.muros_carga',
    materialId: 'mat.concrete',
    hint: 'Paredes portantes continuas con grosor y aberturas',
    dimensions: { width: 8.0, height: 3.4, depth: 6.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.laminar',
    label: '9. Laminar / Cascarón (Candela)',
    kind: 'shape',
    icon: 'roof',
    shapeId: 'struct.laminar',
    materialId: 'mat.concrete',
    hint: 'Paraboloide y cascarón delgado continuo de hormigón',
    dimensions: { width: 11.0, height: 4.2, depth: 11.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.geodesica',
    label: '10. Cúpula Geodésica',
    kind: 'shape',
    icon: 'globe',
    shapeId: 'struct.geodesica',
    materialId: 'mat.steel',
    hint: 'Red geodésica triangulada subdividida con barras y nodos',
    dimensions: { width: 9.0, height: 4.5, depth: 9.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.espacial',
    label: '11. Espacial / Tridilosa 3D',
    kind: 'shape',
    icon: 'grid',
    shapeId: 'struct.espacial',
    materialId: 'mat.steel',
    hint: 'Malla espacial 3D de barras y nodos esféricos para grandes luces',
    dimensions: { width: 12.0, height: 3.8, depth: 9.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.plegada',
    label: '12. Plegada (Origami Estructural)',
    kind: 'shape',
    icon: 'layers',
    shapeId: 'struct.plegada',
    materialId: 'mat.concrete',
    hint: 'Cubierta y muros de láminas planas plegadas en zigzag',
    dimensions: { width: 10.0, height: 3.8, depth: 7.0 },
    modalCategory: 'structural'
  },
  {
    id: 'struct.voladizo',
    label: '13. En Voladizo (Cantilever)',
    kind: 'shape',
    icon: 'building',
    shapeId: 'struct.voladizo',
    materialId: 'mat.concrete',
    hint: 'Núcleo empotrado con volumen/losa sobresaliente sin apoyo frontal',
    dimensions: { width: 9.0, height: 4.2, depth: 5.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.cilindro',
    label: 'Cilindro 3D',
    kind: 'shape',
    icon: 'cube',
    shapeId: 'geo.cilindro',
    materialId: 'mat.concrete',
    hint: 'Volumen cilíndrico paramétrico',
    dimensions: { width: 3.0, height: 3.5, depth: 3.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.anillo',
    label: 'Anillo / Toroide 3D',
    kind: 'shape',
    icon: 'orbit',
    shapeId: 'geo.anillo',
    materialId: 'mat.concrete',
    hint: ' corona anular cilíndrica paramétrica',
    dimensions: { width: 5.0, height: 1.2, depth: 5.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.muro_curvo',
    label: 'Muro Curvo / Arco en Planta',
    kind: 'shape',
    icon: 'wall',
    shapeId: 'geo.muro_curvo',
    materialId: 'mat.concrete',
    hint: 'Muro cilíndrico curvo con radio y ángulo configurables',
    dimensions: { width: 6.0, height: 3.0, depth: 6.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.cono',
    label: 'Cono / Chapitel',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'geo.cono',
    materialId: 'mat.stone',
    hint: 'Geometría cónica paramétrica',
    dimensions: { width: 4.0, height: 4.2, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.esfera',
    label: 'Esfera / Domo Esférico',
    kind: 'shape',
    icon: 'globe',
    shapeId: 'geo.esfera',
    materialId: 'mat.glass',
    hint: 'Volumen esférico paramétrico',
    dimensions: { width: 4.0, height: 4.0, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.prisma',
    label: 'Prisma Poligonal (Hex / Oct)',
    kind: 'shape',
    icon: 'cube',
    shapeId: 'geo.prisma',
    materialId: 'mat.concrete',
    hint: 'Prisma regular de N lados configurable',
    dimensions: { width: 4.0, height: 3.5, depth: 4.0 },
    modalCategory: 'structural'
  },
  {
    id: 'geo.extrusion',
    label: 'Extrusión Libre Curva',
    kind: 'shape',
    icon: 'shapes',
    shapeId: 'geo.extrusion',
    materialId: 'mat.concrete',
    hint: 'Volumen orgánico extruido con contorno bezier/poligonal',
    dimensions: { width: 5.0, height: 3.0, depth: 4.0 },
    modalCategory: 'structural'
  },

  /* Mobiliario */
  {
    id: 'furn.sofa',
    label: 'Sofá 3 plazas',
    kind: 'furniture',
    icon: 'sofa',
    shapeId: 'furn.sofa',
    materialId: 'mat.wood',
    hint: 'Sofá 3 plazas - 1.90m',
    dimensions: { width: 1.9, height: 0.85, depth: 0.85 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.armchair',
    label: 'Sillón individual',
    kind: 'furniture',
    icon: 'armchair',
    shapeId: 'furn.armchair',
    materialId: 'mat.wood',
    hint: 'Sillón 1 plaza - 0.95m',
    dimensions: { width: 0.95, height: 0.85, depth: 0.85 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.table',
    label: 'Mesa de comedor',
    kind: 'furniture',
    icon: 'table',
    shapeId: 'furn.table',
    materialId: 'mat.wood',
    hint: 'Mesa comedor - 1.40 × 0.90m',
    dimensions: { width: 1.4, height: 0.81, depth: 0.9 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.desk',
    label: 'Escritorio de estudio',
    kind: 'furniture',
    icon: 'table',
    shapeId: 'furn.desk',
    materialId: 'mat.oak',
    hint: 'Escritorio - 1.30 × 0.72m',
    dimensions: { width: 1.3, height: 0.8, depth: 0.72 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.chair',
    label: 'Silla ergonómica',
    kind: 'furniture',
    icon: 'chair',
    shapeId: 'furn.chair',
    materialId: 'mat.walnut',
    hint: 'Silla - 0.50 × 0.50m',
    dimensions: { width: 0.5, height: 0.9, depth: 0.5 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.bed',
    label: 'Cama matrimonial',
    kind: 'furniture',
    icon: 'bed',
    shapeId: 'furn.bed',
    materialId: 'mat.wood',
    hint: 'Cama - 1.50 × 2.10m',
    dimensions: { width: 1.5, height: 0.85, depth: 2.1 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.lamp',
    label: 'Lámpara de pie',
    kind: 'furniture',
    icon: 'lamp',
    shapeId: 'furn.lamp',
    materialId: 'mat.metal-pot',
    hint: 'Lámpara - 1.55m alto',
    dimensions: { width: 0.42, height: 1.55, depth: 0.42 },
    modalCategory: 'furniture'
  },
  {
    id: 'furn.plant',
    label: 'Planta decorativa',
    kind: 'furniture',
    icon: 'plant',
    shapeId: 'furn.plant',
    materialId: 'mat.grass',
    hint: 'Planta interior - 1.15m',
    dimensions: { width: 0.65, height: 1.15, depth: 0.65 },
    modalCategory: 'furniture'
  },

  /* Carpintería / Huecos (Puertas y Ventanas con perforación booleana) */
  {
    id: 'opening.door',
    label: 'Puerta simple',
    kind: 'shape',
    icon: 'door',
    shapeId: 'opening.door',
    materialId: 'mat.wood',
    hint: 'Puerta simple - 0.90 × 2.10m',
    dimensions: { width: 0.9, height: 2.1, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.door.double',
    label: 'Puerta doble',
    kind: 'shape',
    icon: 'door',
    shapeId: 'opening.door.double',
    materialId: 'mat.wood',
    hint: 'Puerta doble - 1.60 × 2.10m',
    dimensions: { width: 1.6, height: 2.1, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.door.sliding',
    label: 'Puerta corrediza',
    kind: 'shape',
    icon: 'door',
    shapeId: 'opening.door.sliding',
    materialId: 'mat.oak',
    hint: 'Puerta corrediza - 0.90 × 2.10m',
    dimensions: { width: 0.9, height: 2.1, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.door.glass',
    label: 'Puerta de vidrio',
    kind: 'shape',
    icon: 'door',
    shapeId: 'opening.door.glass',
    materialId: 'mat.glass',
    hint: 'Puerta de vidrio - 0.90 × 2.10m',
    dimensions: { width: 0.9, height: 2.1, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.door.patio',
    label: 'Puerta-ventana',
    kind: 'shape',
    icon: 'door',
    shapeId: 'opening.door.patio',
    materialId: 'mat.glass',
    hint: 'Puerta-ventana - 1.50 × 2.10m',
    dimensions: { width: 1.5, height: 2.1, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.door.garage',
    label: 'Puerta de garaje',
    kind: 'shape',
    icon: 'door',
    shapeId: 'opening.door.garage',
    materialId: 'mat.steel',
    hint: 'Puerta de garaje - 2.40 × 2.15m',
    dimensions: { width: 2.4, height: 2.15, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.window',
    label: 'Ventana estándar',
    kind: 'shape',
    icon: 'window',
    shapeId: 'opening.window',
    materialId: 'mat.glass',
    hint: 'Ventana estándar - 1.20 × 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.window.panoramic',
    label: 'Ventana panorámica',
    kind: 'shape',
    icon: 'window',
    shapeId: 'opening.window.panoramic',
    materialId: 'mat.glass',
    hint: 'Ventana panorámica - 2.00 × 1.40m',
    dimensions: { width: 2.0, height: 1.4, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.window.sliding',
    label: 'Ventana corrediza',
    kind: 'shape',
    icon: 'window',
    shapeId: 'opening.window.sliding',
    materialId: 'mat.glass',
    hint: 'Ventana corrediza - 1.20 × 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.window.casement',
    label: 'Ventana abatible',
    kind: 'shape',
    icon: 'window',
    shapeId: 'opening.window.casement',
    materialId: 'mat.glass',
    hint: 'Ventana abatible - 1.20 × 1.20m',
    dimensions: { width: 1.2, height: 1.2, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.window.double',
    label: 'Ventana dos hojas',
    kind: 'shape',
    icon: 'window',
    shapeId: 'opening.window.double',
    materialId: 'mat.glass',
    hint: 'Ventana 2 hojas - 1.40 × 1.20m',
    dimensions: { width: 1.4, height: 1.2, depth: 0.15 },
    modalCategory: 'openings'
  },
  {
    id: 'opening.window.four',
    label: 'Ventana cuatro hojas',
    kind: 'shape',
    icon: 'window',
    shapeId: 'opening.window.four',
    materialId: 'mat.glass',
    hint: 'Ventana 4 hojas - 1.80 × 1.30m',
    dimensions: { width: 1.8, height: 1.3, depth: 0.15 },
    modalCategory: 'openings'
  }
]

const MATERIAL_ENTRIES: readonly CatalogEntry[] = MATERIAL_CATALOG.map((material) => ({
  id: material.id,
  label: material.label,
  kind: 'material',
  icon: 'palette',
  shapeId: null,
  materialId: material.id,
  hint: material.hint
}))

/** Modelos 3D personalizados cargados por el usuario. */
const customEntries: CatalogEntry[] = []
const CUSTOM_CATALOG_STORAGE_KEY = 'arqstudio.customCatalog.v1'
let customCatalogLoaded = false

interface PersistedCustomCatalogRecord {
  id: string
  label: string
  modalCategory: ModalElementCategory
  format: Model3DFormat
  dimensions: { width: number; height: number; depth: number }
  modelBase64: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return typeof btoa === 'function' ? btoa(binary) : ''
}

/**
 * Compila un archivo 3D (GLB/glTF/OBJ) en una única `BufferGeometry` centrada
 * en X/Z con la base apoyada en `y = 0` y escalada a `dimensions`.
 */
async function buildCustomEntryGeometry(
  buffer: ArrayBuffer,
  format: Model3DFormat,
  dimensions: { width: number; height: number; depth: number }
): Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material | null }> {
  const imported = await loadModel(buffer, format)
  if (imported.meshes.length === 0) {
    throw new Error('El archivo 3D no contiene mallas válidas.')
  }

  const parts: THREE.BufferGeometry[] = []
  let primaryMaterial: THREE.Material | null = null

  for (const m of imported.meshes) {
    if (!primaryMaterial && m.material) {
      primaryMaterial = m.material
    }
    const g = m.geometry.clone()
    if (m.center) {
      g.translate(m.center.x, m.center.y, m.center.z)
    }
    const nonIdx = g.index ? g.toNonIndexed() : g
    parts.push(nonIdx)
  }

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
  if (!merged) {
    throw new Error('No se pudieron combinar las mallas del modelo 3D.')
  }

  merged.computeBoundingBox()
  const box = merged.boundingBox
  if (box && !box.isEmpty()) {
    const rawSize = new THREE.Vector3()
    const rawCenter = new THREE.Vector3()
    box.getSize(rawSize)
    box.getCenter(rawCenter)
    merged.translate(-rawCenter.x, -box.min.y, -rawCenter.z)
    const sx = rawSize.x > 1e-4 ? dimensions.width / rawSize.x : 1
    const sy = rawSize.y > 1e-4 ? dimensions.height / rawSize.y : 1
    const sz = rawSize.z > 1e-4 ? dimensions.depth / rawSize.z : 1
    merged.scale(sx, sy, sz)
  }
  merged.computeVertexNormals()

  return { geometry: merged, material: primaryMaterial }
}

/** Persiste la lista de modelos personalizados en SQLite (si está disponible) y localStorage. */
async function saveCustomCatalogToStorage(): Promise<void> {
  const records: PersistedCustomCatalogRecord[] = customEntries
    .filter((e) => Boolean(e.modelBase64 && e.format && e.dimensions))
    .map((e) => ({
      id: e.id,
      label: e.label,
      modalCategory: e.modalCategory ?? 'custom',
      format: e.format!,
      dimensions: e.dimensions!,
      modelBase64: e.modelBase64!
    }))

  const json = JSON.stringify(records)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_CATALOG_STORAGE_KEY, json)
    }
  } catch {
    /* ignore quota errors */
  }

  try {
    const dbBridge = (
      window as unknown as {
        arqStudio?: { db?: { setSetting?: (key: string, value: string) => Promise<unknown> } }
      }
    ).arqStudio?.db
    if (dbBridge?.setSetting) {
      await dbBridge.setSetting(CUSTOM_CATALOG_STORAGE_KEY, json)
    }
  } catch {
    /* ignore bridge errors in browser-only tests */
  }
}

/** Carga los modelos personalizados guardados en SQLite / localStorage. */
export async function loadPersistedCustomCatalog(): Promise<readonly CatalogEntry[]> {
  if (customCatalogLoaded) return customEntries
  customCatalogLoaded = true

  let rawJson: string | null = null
  try {
    const dbBridge = (
      window as unknown as {
        arqStudio?: { db?: { getSetting?: (key: string) => Promise<string | null> } }
      }
    ).arqStudio?.db
    if (dbBridge?.getSetting) {
      rawJson = await dbBridge.getSetting(CUSTOM_CATALOG_STORAGE_KEY)
    }
  } catch {
    /* fallback to localStorage */
  }

  if (!rawJson && typeof localStorage !== 'undefined') {
    try {
      rawJson = localStorage.getItem(CUSTOM_CATALOG_STORAGE_KEY)
    } catch {
      rawJson = null
    }
  }

  if (!rawJson) return customEntries

  try {
    const parsed = JSON.parse(rawJson) as PersistedCustomCatalogRecord[]
    if (!Array.isArray(parsed)) return customEntries

    for (const rec of parsed) {
      if (!rec.id || !rec.modelBase64 || !rec.format) continue
      if (customEntries.some((e) => e.id === rec.id)) continue
      try {
        const bytes = base64ToBytes(rec.modelBase64)
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        const { geometry, material } = await buildCustomEntryGeometry(buffer, rec.format, rec.dimensions)
        const dims = rec.dimensions
        const entry: CatalogEntry = {
          id: rec.id,
          label: rec.label,
          kind: rec.modalCategory === 'structural' ? 'shape' : 'furniture',
          icon: 'cube',
          shapeId: rec.id,
          materialId: null,
          hint: `${rec.label} (${rec.format.toUpperCase()}) - ${dims.width.toFixed(2)} × ${dims.height.toFixed(2)}m`,
          dimensions: dims,
          modalCategory: rec.modalCategory,
          isCustom: true,
          format: rec.format,
          modelBase64: rec.modelBase64,
          importedGeometry: geometry,
          importedMaterial: material
        }
        customEntries.push(entry)
      } catch {
        /* ignore corrupted model */
      }
    }
  } catch {
    /* ignore JSON parse error */
  }

  return customEntries
}

/**
 * Registra un nuevo modelo 3D personalizado (.glb, .gltf, .obj) en el catálogo
 * y lo guarda permanentemente en SQLite / localStorage.
 */
export async function registerCustomCatalogEntry(input: {
  name: string
  modalCategory: ModalElementCategory
  dimensions: { width: number; height: number; depth: number }
  buffer: ArrayBuffer
  format: Model3DFormat
}): Promise<CatalogEntry> {
  const cleanName = input.name.trim() || 'Modelo 3D personalizado'
  const dims = {
    width: Math.max(0.1, Number(input.dimensions.width) || 1.0),
    height: Math.max(0.1, Number(input.dimensions.height) || 1.0),
    depth: Math.max(0.1, Number(input.dimensions.depth) || 1.0)
  }

  const { geometry, material } = await buildCustomEntryGeometry(input.buffer, input.format, dims)
  const id = `custom.model.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`
  const modelBase64 = arrayBufferToBase64(input.buffer)

  const entry: CatalogEntry = {
    id,
    label: cleanName,
    kind: input.modalCategory === 'structural' ? 'shape' : 'furniture',
    icon: 'cube',
    shapeId: id,
    materialId: null,
    hint: `${cleanName} (${input.format.toUpperCase()}) - ${dims.width.toFixed(2)} × ${dims.height.toFixed(2)}m`,
    dimensions: dims,
    modalCategory: input.modalCategory,
    isCustom: true,
    format: input.format,
    modelBase64,
    importedGeometry: geometry,
    importedMaterial: material
  }

  customEntries.unshift(entry)
  await saveCustomCatalogToStorage()
  return entry
}

/** Elimina un modelo personalizado del catálogo y actualiza la base de datos local. */
export async function removeCustomCatalogEntry(id: string): Promise<boolean> {
  const idx = customEntries.findIndex((e) => e.id === id)
  if (idx === -1) return false
  const [removed] = customEntries.splice(idx, 1)
  removed.importedGeometry?.dispose()
  if (removed.importedMaterial) removed.importedMaterial.dispose()
  await saveCustomCatalogToStorage()
  return true
}

export function getCustomCatalogEntries(): readonly CatalogEntry[] {
  return customEntries
}

const CAD_BLOCK_CATALOG_ENTRIES: readonly CatalogEntry[] = CAD_BLOCKS.map((block) => ({
  id: block.id,
  label: block.label,
  kind: 'furniture',
  icon: (block.category === 'bathrooms'
    ? 'layers'
    : block.category === 'bedrooms'
      ? 'bed'
      : block.category === 'office'
        ? 'desk'
        : block.category === 'exterior'
          ? 'plant'
          : block.category === 'dining'
            ? 'table'
            : 'sofa') as IconName,
  shapeId: block.id,
  materialId: block.defaultMaterialId,
  hint: block.hint,
  dimensions: block.dimensions,
  modalCategory: 'furniture'
}))

function allEntries(): readonly CatalogEntry[] {
  return [...PLACEABLE_ENTRIES, ...CAD_BLOCK_CATALOG_ENTRIES, ...customEntries, ...MATERIAL_ENTRIES]
}

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  const found = allEntries().find((e) => e.id === id)
  if (found) return found
  const cad = getCadBlock(id)
  if (cad) {
    return {
      id: cad.id,
      label: cad.label,
      kind: 'furniture',
      icon: 'sofa',
      shapeId: cad.id,
      materialId: cad.defaultMaterialId,
      hint: cad.hint,
      dimensions: cad.dimensions,
      modalCategory: 'furniture'
    }
  }
  return undefined
}

export function entriesForCategory(c: CatalogCategory): readonly CatalogEntry[] {
  const entries = allEntries()
  switch (c) {
    case 'roofs':
      return entries.filter((e) => e.id.startsWith('roof.'))
    case 'shapes':
      return entries.filter(
        (e) => e.id.startsWith('shape.') || e.id.startsWith('struct.') || e.id.startsWith('geo.')
      )
    case 'furniture':
      return entries.filter((e) => e.id.startsWith('furn.') || (e.isCustom && e.modalCategory === 'furniture'))
    case 'openings':
      return entries.filter((e) => e.id.startsWith('opening.') || (e.isCustom && e.modalCategory === 'openings'))
    case 'materials':
      return entries.filter((e) => e.id.startsWith('mat.'))
    case 'custom':
      return customEntries
  }
}

/** Entradas filtradas según las 4 pestañas principales del modal «Añadir elemento». */
export function entriesForModalCategory(cat: ModalElementCategory): readonly CatalogEntry[] {
  switch (cat) {
    case 'furniture':
      return [
        ...PLACEABLE_ENTRIES.filter((e) => e.modalCategory === 'furniture'),
        ...CAD_BLOCK_CATALOG_ENTRIES,
        ...customEntries.filter((e) => e.modalCategory === 'furniture')
      ]
    case 'openings':
      return [
        ...PLACEABLE_ENTRIES.filter((e) => e.modalCategory === 'openings'),
        ...customEntries.filter((e) => e.modalCategory === 'openings')
      ]
    case 'structural':
      return [
        ...PLACEABLE_ENTRIES.filter((e) => e.modalCategory === 'structural'),
        ...customEntries.filter((e) => e.modalCategory === 'structural')
      ]
    case 'custom':
      return [...customEntries]
  }
}

export function placeableEntries(): readonly CatalogEntry[] {
  return [...PLACEABLE_ENTRIES, ...customEntries]
}
