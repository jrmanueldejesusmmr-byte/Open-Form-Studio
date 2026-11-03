import { createDefaultLayers, Layer, LineType } from '../models/Layer'
import { WallSegmentType } from '../models/Wall'

/**
 * Estado de las capas del dibujo (panel "Layers & Properties"). Es un modelo
 * de datos puro con notificación por callback: la UI pide mutaciones y el
 * `ViewportRenderer` aplica visibilidad/color a la geometría real.
 */
export class LayerManager {
  private readonly layers: Layer[] = createDefaultLayers()
  private readonly listeners: Array<(layer: Layer) => void> = []

  onLayerChanged(fn: (layer: Layer) => void): void {
    this.listeners.push(fn)
  }

  getLayers(): readonly Layer[] {
    return this.layers
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.find((layer) => layer.id === id)
  }

  /** Capa asociada a un tipo de muro (la que controla su visibilidad y color). */
  getLayerForWallType(type: WallSegmentType): Layer | undefined {
    return this.layers.find((layer) => layer.wallType === type)
  }

  setVisible(id: string, visible: boolean): void {
    this.mutate(id, (layer) => (layer.visible = visible))
  }

  toggleVisible(id: string): void {
    this.mutate(id, (layer) => (layer.visible = !layer.visible))
  }

  toggleLocked(id: string): void {
    this.mutate(id, (layer) => (layer.locked = !layer.locked))
  }

  setLocked(id: string, locked: boolean): void {
    this.mutate(id, (layer) => (layer.locked = locked))
  }

  setColor(id: string, color: number): void {
    this.mutate(id, (layer) => (layer.color = color))
  }

  setLineType(id: string, lineType: LineType): void {
    this.mutate(id, (layer) => (layer.lineType = lineType))
  }

  setProperty(id: string, property: 'material' | 'core' | 'zone', value: string): void {
    this.mutate(id, (layer) => (layer[property] = value))
  }

  private mutate(id: string, change: (layer: Layer) => void): void {
    const layer = this.getLayer(id)
    if (!layer) return
    change(layer)
    this.listeners.forEach((fn) => fn(layer))
  }
}
