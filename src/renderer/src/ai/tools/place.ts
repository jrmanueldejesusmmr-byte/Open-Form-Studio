/** Helpers de colocación sobre muros y catálogo. */
import { getCatalogEntry } from '../../catalog/catalog'
import type { ToolContext } from './types'
import { fmt } from './validate'
import { checkLevel, mustWall } from './walls'
export function placeOnWall(ctx: ToolContext, muroId: string, posicion: number, planta: string): { x: number; z: number; rot: number } {
  const w = mustWall(ctx, muroId)
  if (posicion < 0 || posicion > w.len) throw new Error(`La posición debe estar entre 0 y ${fmt(w.len)} m sobre el muro.`)
  checkLevel(ctx, planta)
  const dx = w.ex - w.sx
  const dz = w.ez - w.sz
  const ux = dx / w.len
  const uz = dz / w.len
  return { x: w.sx + ux * posicion, z: w.sz + uz * posicion, rot: Math.atan2(dx, dz) }
}
export function mustEntry(id: string): { name: string; kind: 'furniture' | 'shape' | 'roof' | 'material' | 'modifier'; shapeId: string | null; materialId: string | null } {
  const e = getCatalogEntry(id)
  if (!e) throw new Error(`El elemento «${id}» no está en el catálogo.`)
  return { name: e.label, kind: e.kind, shapeId: e.shapeId, materialId: e.materialId }
}
