import { MATERIAL_DEFS } from '../engine/MaterialSystem'

/**
 * Catálogo de materiales de la paleta (Fase 1).
 *
 * Los **ids y etiquetas** viven en `MATERIAL_DEFS` (punto único de verdad del
 * motor); aquí se añade únicamente la **categoría** de la paleta y los
 * accesos rápidos (`getMaterial`). Así un renombrado en `MaterialSystem.ts`
 * se propaga solo y no puede divergir entre la paleta y la escena.
 */

export type MaterialCategory =
  | 'ladrillo'
  | 'concreto'
  | 'estuco'
  | 'piedra'
  | 'madera'
  | 'ceramica'
  | 'teja'
  | 'lamina'
  | 'vidrio'
  | 'pintura'
  | 'pasto'
  | 'grava'
  | 'asfalto'

/** Orden y rótulos de las pestañas de la paleta. */
export const MATERIAL_CATEGORIES: ReadonlyArray<{ id: MaterialCategory; label: string }> = [
  { id: 'ladrillo', label: 'Ladrillo' },
  { id: 'concreto', label: 'Concreto' },
  { id: 'estuco', label: 'Estuco' },
  { id: 'piedra', label: 'Piedra' },
  { id: 'madera', label: 'Madera' },
  { id: 'ceramica', label: 'Cerámica' },
  { id: 'teja', label: 'Teja' },
  { id: 'lamina', label: 'Lámina' },
  { id: 'vidrio', label: 'Vidrio' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'pasto', label: 'Pasto' },
  { id: 'grava', label: 'Grava' },
  { id: 'asfalto', label: 'Asfalto' }
]

/** Categoría de cada `MaterialDef`; el orden del mapa es el orden de la paleta. */
const CATEGORY_BY_ID: Record<string, MaterialCategory> = {
  /* Ladrillo */
  'mat.brick': 'ladrillo',
  'mat.brick-old': 'ladrillo',
  'mat.brick-painted': 'ladrillo',

  /* Concreto */
  'mat.concrete': 'concreto',
  'mat.concrete-dark': 'concreto',
  'mat.concrete-smooth': 'concreto',

  /* Estuco */
  'mat.stucco': 'estuco',
  'mat.plaster': 'estuco',

  /* Piedra */
  'mat.stone': 'piedra',
  'mat.marble': 'piedra',
  'mat.marble-dark': 'piedra',
  'mat.marble-cream': 'piedra',

  /* Madera */
  'mat.wood': 'madera',
  'mat.oak': 'madera',
  'mat.walnut': 'madera',
  'mat.pine': 'madera',

  /* Cerámica */
  'mat.ceramic': 'ceramica',
  'mat.ceramic-terracotta': 'ceramica',

  /* Teja */
  'mat.terracotta': 'teja',
  'mat.terracotta-old': 'teja',
  'mat.roof-slate': 'teja',

  /* Lámina */
  'mat.metal-corrugated': 'lamina',
  'mat.steel': 'lamina',
  'mat.copper': 'lamina',
  'mat.brass': 'lamina',
  'mat.metal-ore': 'lamina',
  'mat.metal-pot': 'lamina',
  'mat.rust': 'lamina',
  'mat.gold': 'lamina',

  /* Vidrio */
  'mat.glass': 'vidrio',
  'mat.glass-frosted': 'vidrio',
  'mat.glass-tinted': 'vidrio',

  /* Pintura */
  'mat.paint-white': 'pintura',
  'mat.paint-gray': 'pintura',
  'mat.paint-warm': 'pintura',

  /* Pasto */
  'mat.grass': 'pasto',

  /* Grava */
  'mat.gravel': 'grava',

  /* Asfalto */
  'mat.asphalt': 'asfalto'
}

/** Fila visible de la paleta: id + etiqueta + categoría + tinte (miniatura). */
export interface MaterialCatalogItem {
  id: string
  label: string
  category: MaterialCategory
  /** Tinte hexadecimal para la miniatura de la paleta. */
  tint: number
  hint: string
}

/** Los 34 materiales del catálogo, en el orden del mapa de categorías. */
export const MATERIAL_CATALOG: ReadonlyArray<MaterialCatalogItem> = Object.keys(CATEGORY_BY_ID)
  .filter((id) => id in MATERIAL_DEFS)
  .map((id) => ({
    id,
    label: MATERIAL_DEFS[id].label,
    category: CATEGORY_BY_ID[id],
    tint: MATERIAL_DEFS[id].tint,
    hint: 'Se aplica a la selección'
  }))

const BY_ID = new Map<string, MaterialCatalogItem>(MATERIAL_CATALOG.map((item) => [item.id, item]))

/** Material por id (`'mat.brick'`); `undefined` si no existe. */
export function getMaterial(id?: string | null): MaterialCatalogItem | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** Materiales de una categoría, en orden de catálogo. */
export function materialsForCategory(category: MaterialCategory): readonly MaterialCatalogItem[] {
  return MATERIAL_CATALOG.filter((item) => item.category === category)
}

/** `true` si el id pertenece al catálogo de materiales (`mat.*`). */
export function isMaterialId(id?: string | null): boolean {
  return getMaterial(id) !== undefined
}