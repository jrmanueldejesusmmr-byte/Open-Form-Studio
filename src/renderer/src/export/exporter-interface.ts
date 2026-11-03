import * as THREE from 'three'

/** Interfaz común para todos los exportadores de escena 3D.
 * Garantiza una firma consistente y metadatos de formato en todo el sistema.
 */

export interface Exporter {
  /** Identificador único del formato (obj, glb, stl, etc.) */
  id: string
  /** Extensión de archivo sin el punto */
  extension: string
  /** Tipo MIME del formato */
  mimeType: string
  /** Exporta la escena a los datos del formato.
   *  options puede incluir: currentFloorOnly, allFloors, selectedOnly */
  export: (scene: THREE.Scene, options?: { currentFloorOnly?: boolean; allFloors?: boolean; selectedOnly?: boolean }) => Promise<Uint8Array | string>
}
