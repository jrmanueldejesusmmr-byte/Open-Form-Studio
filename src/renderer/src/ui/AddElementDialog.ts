import type { CatalogEntry } from '../catalog/catalog'
import { openAddElementModal } from './AddElementModal'

/**
 * Diálogo «Añadir elemento» (`tool.add`): delega en el modal rediseñado
 * `AddElementModal.tsx` con pestañas separadas, previsualizaciones 3D y
 * soporte de modelos personalizados (.glb / .gltf / .obj).
 */
export function promptAddElement(container: HTMLElement): Promise<CatalogEntry | null> {
  return openAddElementModal(container)
}
