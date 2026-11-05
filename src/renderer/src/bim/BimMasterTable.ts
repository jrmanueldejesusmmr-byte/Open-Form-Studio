import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { ElectricalModel } from '../mep/ElectricalModel'
import { Wall } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { BimSanitizationEngine } from './BimSanitizationEngine'
import { getCadBlock } from '../catalog/cadBlocksData'
import type {
  BimDiscipline,
  BimElementType,
  BimMaterialBreakdown,
  BimRow,
  BimTotals,
  ClashReport
} from './types'

type BimTableListener = (rows: BimRow[], totals: BimTotals) => void

/**
 * Tabla Maestra BIM Reactiva (Single Source of Truth).
 * Centraliza, cuantifica y presupuesta todos los elementos del proyecto en tiempo real
 * con edición bidireccional (Tabla <-> Modelo 2D / 3D).
 */
export class BimMasterTable {
  private rowsCache: BimRow[] = []
  private totalsCache: BimTotals | null = null
  private listeners = new Set<BimTableListener>()
  private sanitizationEngine = BimSanitizationEngine.getInstance()
  private debounceTimer: number | null = null
  /** Precios unitarios personalizados guardados por el usuario (rowId -> USD) */
  private customUnitPrices = new Map<string, number>()

  constructor(
    private readonly scene: SceneManager,
    private readonly electricalModel?: ElectricalModel
  ) {
    this.attachListeners()
    this.recompute()
  }

  private attachListeners(): void {
    // Escuchar cambios en la escena de muros y objetos
    this.scene.onWallAdded(() => this.scheduleRecompute())
    this.scene.onWallRemoved(() => this.scheduleRecompute())
    this.scene.onWallChanged(() => this.scheduleRecompute())
    this.scene.onWallMoved(() => this.scheduleRecompute())

    this.scene.onObjectAdded(() => this.scheduleRecompute())
    this.scene.onObjectRemoved(() => this.scheduleRecompute())
    this.scene.onObjectChanged(() => this.scheduleRecompute())
    this.scene.onObjectMoved(() => this.scheduleRecompute())

    this.scene.onLevelsChanged(() => this.scheduleRecompute())
    this.scene.onLevelsStructureChanged(() => this.scheduleRecompute())

    // Escuchar cambios en el modelo MEP eléctrico
    if (this.electricalModel) {
      this.electricalModel.onChange(() => this.scheduleRecompute())
    }
  }

  private scheduleRecompute(): void {
    if (typeof window !== 'undefined') {
      if (this.debounceTimer !== null) {
        cancelAnimationFrame(this.debounceTimer)
      }
      this.debounceTimer = requestAnimationFrame(() => {
        this.recompute()
        this.debounceTimer = null
      })
    } else {
      this.recompute()
    }
  }

  public onChange(fn: BimTableListener): () => void {
    this.listeners.add(fn)
    // Emitir estado actual inmediatamente
    fn(this.getRows(), this.getTotals())
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    const rows = this.getRows()
    const totals = this.getTotals()
    for (const listener of this.listeners) {
      listener(rows, totals)
    }
  }

  public getRows(discipline?: BimDiscipline | 'Todas'): BimRow[] {
    if (!discipline || discipline === 'Todas') {
      return this.rowsCache
    }
    return this.rowsCache.filter((r) => r.discipline === discipline)
  }

  public getTotals(): BimTotals {
    if (!this.totalsCache) {
      this.totalsCache = this.computeTotals(this.rowsCache)
    }
    return this.totalsCache
  }

  public getClashes(): ClashReport[] {
    if (!this.electricalModel) return []
    return this.sanitizationEngine.detectClashes(this.scene, this.electricalModel)
  }

  /**
   * Obtiene el precio base real en USD por defecto (nunca $0.00).
   */
  public getDefaultUnitPrice(category: BimElementType, obj?: SceneObject, material?: string): number {
    switch (category) {
      case 'Muro':
        if (material?.toLowerCase().includes('ladrillo') || material?.toLowerCase().includes('brick')) return 32.0
        if (material?.toLowerCase().includes('hormigon') || material?.toLowerCase().includes('concrete')) return 45.0
        return 28.5 // USD por m² de muro
      case 'Techo':
        return 35.0 // USD por m² de cubierta
      case 'Losa':
        return 160.0 // USD por m³ de hormigón losa
      case 'Columna':
        return 180.0 // USD por m³
      case 'Viga':
        return 180.0 // USD por m³
      case 'Terreno':
        return 12.0 // USD por m²
      case 'Tubería':
        return 8.5 // USD por metro lineal conduit + cable
      case 'Dispositivo':
        return 25.0 // USD por salida / mecanismo
      case 'Puerta':
        return 145.0 // USD por puerta completa
      case 'Ventana':
        return 110.0 // USD por ventana completa
      default: {
        if (obj?.shapeId) {
          const cad = getCadBlock(obj.shapeId)
          if (cad) return cad.defaultPrice
        }
        if (category === 'Sanitario') return 185.0
        if (category === 'Cocina') return 320.0
        if (category === 'Oficina') return 260.0
        if (category === 'Vehículo') return 18000.0
        if (category === 'Vegetación') return 65.0
        if (category === 'Escala Humana') return 0.0
        return 150.0 // Mobiliario general
      }
    }
  }

  /**
   * Recalcula la tabla completa mapeando cada entidad viva del modelo.
   */
  public recompute(): void {
    const rows: BimRow[] = []
    const levels = this.scene.getLevels()
    const levelMap = new Map<string, { name: string; elevation: number }>()
    for (const l of levels) levelMap.set(l.id, { name: l.name, elevation: l.elevation })

    // Auto-Join & Clip: calcular deducciones de volumen por superposiciones
    const clippedMap = this.sanitizationEngine.computeWallClippedIntersections(this.scene)

    // Registro de aberturas de muros ya procesadas
    const handledOpeningIds = new Set<string>()

    // 1. Muros
    for (const wall of this.scene.getWalls()) {
      const lev = levelMap.get(wall.levelId) ?? { name: 'Piso 0', elevation: 0 }
      const clippedVol = clippedMap.get(wall.id) ?? 0

      // Área de aberturas
      let openingsArea = 0
      for (const op of wall.openings) {
        openingsArea += op.width * op.height
      }

      const grossArea = wall.length * wall.height
      const netArea = Math.max(0, grossArea - openingsArea)
      const grossVolume = netArea * wall.thickness
      // Volumen neto real descontando el recorte por losas o vigas
      const netVolume = Math.max(0, grossVolume - clippedVol)

      // Identificar material y disciplina
      const matId = wall.materialId || ''
      const isBrick = matId.includes('brick') || matId.includes('ladrillo')
      const isConcrete = matId.includes('concrete') || matId.includes('hormigon')
      const materialLabel = isBrick
        ? 'Ladrillo Rojo 7x14x28'
        : isConcrete
          ? "Hormigón Armado f'c=250"
          : 'Block de Concreto 15x20x40'

      // Cuantificación exacta
      const breakdown = this.calculateWallMaterials(netArea, netVolume, isBrick, isConcrete)

      const midX = (wall.start.x + wall.end.x) / 2
      const midZ = (wall.start.z + wall.end.z) / 2

      const warnings: string[] = []
      if (clippedVol > 0) {
        warnings.push(`Auto-Clip activo: -${clippedVol.toFixed(3)} m³ descontados por cruce con losa/viga.`)
      }

      const defaultPrice = this.getDefaultUnitPrice('Muro', undefined, materialLabel)
      const unitPrice = this.customUnitPrices.get(wall.id) ?? defaultPrice
      const subtotalCost = Number((netArea * unitPrice).toFixed(2))

      rows.push({
        id: wall.id,
        discipline: 'Arquitectura',
        category: 'Muro',
        name: wall.label || 'Muro arquitectónico',
        material: materialLabel,
        height: Number(wall.height.toFixed(3)),
        thickness: Number(wall.thickness.toFixed(3)),
        length: Number(wall.length.toFixed(3)),
        baseLevel: `${lev.name} (+${lev.elevation.toFixed(2)}m)`,
        levelId: wall.levelId,
        x: Number(midX.toFixed(3)),
        y: Number(lev.elevation.toFixed(2)),
        z: Number(midZ.toFixed(3)),
        netArea: Number(netArea.toFixed(2)),
        netVolume: Number(netVolume.toFixed(3)),
        materialCountSummary: breakdown.primary,
        materialBreakdown: breakdown,
        rawType: 'wall',
        rawId: wall.id,
        clippedVolume: clippedVol,
        warnings,
        unit: 'm²',
        billableQty: Number(netArea.toFixed(2)),
        unitPrice,
        subtotalCost
      })

      // Cuantificar aberturas (Puertas y Ventanas) del muro
      for (const op of wall.openings) {
        handledOpeningIds.add(op.id)
        const isDoor = op.type === 'door'
        const opCategory: BimElementType = isDoor ? 'Puerta' : 'Ventana'
        const opMaterial = op.materialId || (isDoor ? 'Madera / Aluminio' : 'Aluminio y Vidrio')
        const defOpPrice = this.getDefaultUnitPrice(opCategory)
        const opUnitPrice = this.customUnitPrices.get(op.id) ?? defOpPrice

        const wallLen = Math.max(0.01, wall.length)
        const t = Math.min(1, Math.max(0, op.x / wallLen))
        const opX = wall.start.x + (wall.end.x - wall.start.x) * t
        const opZ = wall.start.z + (wall.end.z - wall.start.z) * t
        const opArea = op.width * op.height
        const opVolume = opArea * wall.thickness

        rows.push({
          id: op.id,
          discipline: 'Arquitectura',
          category: opCategory,
          name: isDoor
            ? `Puerta ${op.style ?? 'estándar'} (${op.width.toFixed(2)}×${op.height.toFixed(2)}m)`
            : `Ventana ${op.style ?? 'estándar'} (${op.width.toFixed(2)}×${op.height.toFixed(2)}m)`,
          material: opMaterial,
          height: Number(op.height.toFixed(2)),
          thickness: Number(wall.thickness.toFixed(2)),
          length: Number(op.width.toFixed(2)),
          baseLevel: `${lev.name} (+${(lev.elevation + op.sill).toFixed(2)}m)`,
          levelId: wall.levelId,
          x: Number(opX.toFixed(2)),
          y: Number((lev.elevation + op.sill).toFixed(2)),
          z: Number(opZ.toFixed(2)),
          netArea: Number(opArea.toFixed(2)),
          netVolume: Number(opVolume.toFixed(3)),
          materialCountSummary: `1 pza (${op.width.toFixed(2)}×${op.height.toFixed(2)}m)`,
          materialBreakdown: {
            primary: `1 unidad vano`,
            items: [
              {
                label: isDoor ? 'Hoja y marco de puerta' : 'Ventana con marco y acristalamiento',
                amount: 1,
                unit: 'pza'
              },
              { label: 'Fijación y sellado perimetral', amount: 1, unit: 'global' }
            ]
          },
          rawType: 'opening',
          rawId: op.id,
          clippedVolume: 0,
          warnings: [],
          unit: 'pza',
          billableQty: 1,
          unitPrice: opUnitPrice,
          subtotalCost: Number(opUnitPrice.toFixed(2))
        })
      }
    }

    // 2. Objetos de la escena (Losas, Columnas, Vigas, Techos, Terreno, Mobiliario, Bloques CAD)
    for (const obj of this.scene.getObjects()) {
      // Si el objeto representa una abertura ya procesada arriba, omitir duplicado
      if (obj.openingId && handledOpeningIds.has(obj.openingId)) {
        continue
      }
      if (handledOpeningIds.has(obj.id)) {
        continue
      }

      const lev = levelMap.get(obj.levelId) ?? { name: 'Piso 0', elevation: obj.position.y }
      const classification = this.classifySceneObject(obj)

      const length = obj.size.x
      const height = obj.size.y
      const thickness = obj.size.z
      const area = length * thickness
      const volume = length * height * thickness

      const breakdown = this.calculateObjectMaterials(classification.category, volume, area, obj)

      // Determinar unidad y cantidad facturable según categoría
      let unit = 'pza'
      let billableQty = 1
      if (classification.category === 'Losa' || classification.category === 'Columna' || classification.category === 'Viga') {
        unit = 'm³'
        billableQty = Number(volume.toFixed(3))
      } else if (classification.category === 'Techo' || classification.category === 'Terreno') {
        unit = 'm²'
        billableQty = Number(area.toFixed(2))
      }

      const defaultPrice = this.getDefaultUnitPrice(classification.category, obj, classification.material)
      const unitPrice = this.customUnitPrices.get(obj.id) ?? defaultPrice
      const subtotalCost = Number((billableQty * unitPrice).toFixed(2))

      rows.push({
        id: obj.id,
        discipline: classification.discipline,
        category: classification.category,
        name: obj.name || classification.category,
        material: classification.material,
        height: Number(height.toFixed(3)),
        thickness: Number(thickness.toFixed(3)),
        length: Number(length.toFixed(3)),
        baseLevel: `${lev.name} (+${obj.position.y.toFixed(2)}m)`,
        levelId: obj.levelId,
        x: Number(obj.position.x.toFixed(3)),
        y: Number(obj.position.y.toFixed(2)),
        z: Number(obj.position.z.toFixed(3)),
        netArea: Number(area.toFixed(2)),
        netVolume: Number(volume.toFixed(3)),
        materialCountSummary: breakdown.primary,
        materialBreakdown: breakdown,
        rawType: 'object',
        rawId: obj.id,
        clippedVolume: 0,
        warnings: [],
        unit,
        billableQty,
        unitPrice,
        subtotalCost
      })
    }

    // 3. MEP Eléctrico (Tuberías conduit y Cableado)
    if (this.electricalModel) {
      const devices = this.electricalModel.getDevices()
      const devMap = new Map<string, { x: number; y: number; z: number; levelId: string }>()
      for (const d of devices) {
        const lev = levelMap.get(d.levelId) ?? { name: 'Piso 0', elevation: 0 }
        devMap.set(d.id, { x: d.x, y: lev.elevation + d.height, z: d.z, levelId: d.levelId })
      }

      for (const wire of this.electricalModel.getWires()) {
        const from = devMap.get(wire.from)
        const to = devMap.get(wire.to)
        if (!from || !to) continue

        const p1 = new THREE.Vector3(from.x, from.y, from.z)
        const p2 = new THREE.Vector3(to.x, to.y, to.z)
        const length = p1.distanceTo(p2)
        const mid = p1.clone().add(p2).multiplyScalar(0.5)
        const lev = levelMap.get(from.levelId) ?? { name: 'Piso 0', elevation: mid.y }

        const conduitLength = Number((length * 1.1).toFixed(2)) // 10% desperdicio
        const cableLength = Number((conduitLength * 3).toFixed(2)) // Fase + Neutro + Tierra
        const breakdown: BimMaterialBreakdown = {
          primary: `${conduitLength}m Tubo Conduit + ${cableLength}m Cable`,
          items: [
            { label: 'Tubería Conduit PVC 3/4"', amount: conduitLength, unit: 'm' },
            { label: 'Cable Cobre THHN Calibre 12 AWG', amount: cableLength, unit: 'm' },
            { label: 'Curvas y Conectores PVC', amount: Math.ceil(length * 0.4) + 2, unit: 'pzs' }
          ]
        }

        const defPrice = this.getDefaultUnitPrice('Tubería')
        const unitPrice = this.customUnitPrices.get(wire.id) ?? defPrice
        const subtotalCost = Number((conduitLength * unitPrice).toFixed(2))

        rows.push({
          id: wire.id,
          discipline: 'Eléctrica',
          category: 'Tubería',
          name: `Circuito Eléctrico (${wire.circuit})`,
          material: 'Conduit PVC 3/4" + Cable AWG 12',
          height: 0.02,
          thickness: 0.02,
          length: Number(length.toFixed(2)),
          baseLevel: `${lev.name} (+${mid.y.toFixed(2)}m)`,
          levelId: from.levelId,
          x: Number(mid.x.toFixed(3)),
          y: Number(mid.y.toFixed(2)),
          z: Number(mid.z.toFixed(3)),
          netArea: Number((length * 0.02).toFixed(2)),
          netVolume: Number((Math.PI * 0.01 * 0.01 * length).toFixed(3)),
          materialCountSummary: breakdown.primary,
          materialBreakdown: breakdown,
          rawType: 'wire',
          rawId: wire.id,
          clippedVolume: 0,
          warnings: [],
          unit: 'm',
          billableQty: conduitLength,
          unitPrice,
          subtotalCost
        })
      }

      // Dispositivos MEP
      for (const dev of devices) {
        const lev = levelMap.get(dev.levelId) ?? { name: 'Piso 0', elevation: 0 }
        const worldY = lev.elevation + dev.height
        const label = dev.label || `Dispositivo ${dev.type}`
        const breakdown: BimMaterialBreakdown = {
          primary: `1 pza ${label}`,
          items: [
            { label: 'Caja Registro / Chalupa Galvanizada', amount: 1, unit: 'pza' },
            { label: `Mecanismo ${label}`, amount: 1, unit: 'pza' }
          ]
        }

        const defPrice = this.getDefaultUnitPrice('Dispositivo')
        const unitPrice = this.customUnitPrices.get(dev.id) ?? defPrice
        const subtotalCost = Number((1 * unitPrice).toFixed(2))

        rows.push({
          id: dev.id,
          discipline: 'Eléctrica',
          category: 'Dispositivo',
          name: label,
          material: dev.type === 'panel' ? 'Tablero Metálico QO-8' : 'Mecanismo Eléctrico',
          height: 0.1,
          thickness: 0.05,
          length: 0.1,
          baseLevel: `${lev.name} (+${worldY.toFixed(2)}m)`,
          levelId: dev.levelId,
          x: Number(dev.x.toFixed(3)),
          y: Number(worldY.toFixed(2)),
          z: Number(dev.z.toFixed(3)),
          netArea: 0.01,
          netVolume: 0.001,
          materialCountSummary: breakdown.primary,
          materialBreakdown: breakdown,
          rawType: 'device',
          rawId: dev.id,
          clippedVolume: 0,
          warnings: [],
          unit: 'pza',
          billableQty: 1,
          unitPrice,
          subtotalCost
        })
      }
    }

    this.rowsCache = rows
    this.totalsCache = this.computeTotals(rows)
    this.emit()
  }

  private classifySceneObject(obj: SceneObject): {
    discipline: BimDiscipline
    category: BimElementType
    material: string
  } {
    const name = (obj.name || '').toLowerCase()
    const shape = (obj.shapeId || '').toLowerCase()
    const sys = obj.structuralParams?.systemType?.toLowerCase() || ''

    if (obj.kind === 'roof' || obj.roofProps || shape.includes('roof')) {
      return { discipline: 'Arquitectura', category: 'Techo', material: 'Cubierta Teja / Panel' }
    }
    if (obj.terrainData || shape.includes('topo') || name.includes('terreno')) {
      return { discipline: 'Topografía', category: 'Terreno', material: 'Terreno Natural y Relleno' }
    }
    if (shape.includes('losa') || name.includes('losa') || name.includes('forjado') || sys.includes('losa')) {
      return { discipline: 'Estructura', category: 'Losa', material: "Hormigón Armado f'c=250" }
    }
    if (shape.includes('columna') || name.includes('columna') || name.includes('castillo') || sys.includes('columna')) {
      return { discipline: 'Estructura', category: 'Columna', material: 'Hormigón Armado + Acero' }
    }
    if (shape.includes('viga') || name.includes('viga') || name.includes('trabe') || sys.includes('viga')) {
      return { discipline: 'Estructura', category: 'Viga', material: 'Hormigón Armado + Acero' }
    }
    if (shape.startsWith('struct.') || sys) {
      return { discipline: 'Estructura', category: 'Losa', material: 'Hormigón Estructural' }
    }

    // Aberturas como objetos
    if (obj.openingId || (shape.startsWith('opening.') && shape !== 'opening.slab')) {
      const isDoor = name.includes('puerta') || shape.includes('door')
      return {
        discipline: 'Arquitectura',
        category: isDoor ? 'Puerta' : 'Ventana',
        material: obj.materialId || (isDoor ? 'Madera / Aluminio' : 'Aluminio y Vidrio')
      }
    }

    // Bloques arquitectónicos (CAD Blocks)
    if (obj.shapeId) {
      const cad = getCadBlock(obj.shapeId)
      if (cad) {
        let discipline: BimDiscipline = 'Arquitectura'
        let category: BimElementType = 'Mobiliario'

        if (cad.category === 'bathrooms') {
          category = 'Sanitario'
        } else if (cad.category === 'kitchen') {
          category = 'Cocina'
        } else if (cad.category === 'office') {
          category = 'Oficina'
        } else if (cad.category === 'exterior') {
          discipline = 'Entorno'
          if (
            cad.blockType.startsWith('car') ||
            cad.blockType === 'motorcycle' ||
            cad.blockType === 'bicycle' ||
            cad.blockType === 'truck' ||
            cad.blockType === 'bus'
          ) {
            category = 'Vehículo'
          } else if (
            cad.blockType === 'tree' ||
            cad.blockType === 'palm' ||
            cad.blockType === 'shrub' ||
            cad.blockType === 'potPlant'
          ) {
            category = 'Vegetación'
          } else if (cad.blockType === 'human') {
            category = 'Escala Humana'
          }
        }
        return {
          discipline,
          category,
          material: obj.materialId || cad.defaultMaterialId
        }
      }
    }

    // Mobiliario genérico por defecto
    if (obj.kind === 'furniture' || shape.startsWith('furn.')) {
      return { discipline: 'Arquitectura', category: 'Mobiliario', material: obj.materialId || 'Mobiliario Madera / Metal' }
    }

    return { discipline: 'Arquitectura', category: 'Muro', material: 'Elemento Constructivo' }
  }

  private calculateWallMaterials(
    netArea: number,
    netVolume: number,
    isBrick: boolean,
    isConcrete: boolean
  ): BimMaterialBreakdown {
    if (isConcrete) {
      const cementSacks = netVolume * 7.5
      const sandM3 = netVolume * 0.55
      const gravelM3 = netVolume * 0.65
      const steelKg = netVolume * 90
      return {
        primary: `${netVolume.toFixed(2)} m³ Concreto f'c=250`,
        items: [
          { label: "Concreto f'c=250 kg/cm²", amount: Number(netVolume.toFixed(2)), unit: 'm³' },
          { label: 'Sacos Cemento (50kg)', amount: Math.ceil(cementSacks), unit: 'sacos' },
          { label: 'Arena de Río', amount: Number(sandM3.toFixed(2)), unit: 'm³' },
          { label: 'Grava Triturada 3/4"', amount: Number(gravelM3.toFixed(2)), unit: 'm³' },
          { label: 'Acero de Refuerzo #3/#4', amount: Number(steelKg.toFixed(1)), unit: 'kg' }
        ]
      }
    }

    if (isBrick) {
      // Ladrillo rojo recocido: ~55 pzs/m² + 5% desperdicio = 57.75 pzs/m²
      const pieces = Math.ceil(netArea * 55 * 1.05)
      const mortarM3 = Number((netArea * 0.025).toFixed(2))
      const cementSacks = Math.ceil(netArea * 0.28)
      return {
        primary: `${pieces} ladrillos (${cementSacks} sacos cemento)`,
        items: [
          { label: 'Ladrillo Rojo 7x14x28 cm (+5% desp.)', amount: pieces, unit: 'piezas' },
          { label: 'Mortero Cemento-Arena 1:4', amount: mortarM3, unit: 'm³' },
          { label: 'Sacos Cemento Gris 50kg', amount: cementSacks, unit: 'sacos' },
          { label: 'Arena Cernida', amount: mortarM3, unit: 'm³' }
        ]
      }
    }

    // Default: Block de concreto 15x20x40 cm (~12.5 pzs/m² + 5% desperdicio = 13.125 pzs/m²)
    const blockPieces = Math.ceil(netArea * 12.5 * 1.05)
    const mortarM3 = Number((netArea * 0.024).toFixed(2))
    const cementSacks = Math.ceil(netArea * 0.25)
    return {
      primary: `${blockPieces} bloques (${cementSacks} sacos cemento)`,
      items: [
        { label: 'Block Hueco de Concreto 15x20x40 cm (+5% desp.)', amount: blockPieces, unit: 'piezas' },
        { label: 'Mortero Junteo 1.5cm', amount: mortarM3, unit: 'm³' },
        { label: 'Sacos Cemento 50kg (juntas)', amount: cementSacks, unit: 'sacos' },
        { label: 'Arena Cernida', amount: mortarM3, unit: 'm³' }
      ]
    }
  }

  private calculateObjectMaterials(
    category: BimElementType,
    volume: number,
    area: number,
    obj: SceneObject
  ): BimMaterialBreakdown {
    switch (category) {
      case 'Losa': {
        const cementSacks = Math.ceil(volume * 7.5)
        const sandM3 = Number((volume * 0.55).toFixed(2))
        const gravelM3 = Number((volume * 0.65).toFixed(2))
        const steelKg = Number((volume * 80).toFixed(1))
        return {
          primary: `${volume.toFixed(2)} m³ Concreto Losa (${cementSacks} sacos)`,
          items: [
            { label: "Concreto Losa f'c=250", amount: Number(volume.toFixed(2)), unit: 'm³' },
            { label: 'Sacos Cemento 50kg', amount: cementSacks, unit: 'sacos' },
            { label: 'Arena', amount: sandM3, unit: 'm³' },
            { label: 'Grava 3/4"', amount: gravelM3, unit: 'm³' },
            { label: 'Malla / Varilla de Acero', amount: steelKg, unit: 'kg' }
          ]
        }
      }
      case 'Columna':
      case 'Viga': {
        const cementSacks = Math.ceil(volume * 7.5)
        const steelKg = Number((volume * 120).toFixed(1))
        return {
          primary: `${volume.toFixed(2)} m³ Estructura (${steelKg} kg Acero)`,
          items: [
            { label: "Concreto Estructural f'c=250", amount: Number(volume.toFixed(2)), unit: 'm³' },
            { label: 'Sacos Cemento 50kg', amount: cementSacks, unit: 'sacos' },
            { label: 'Acero de Refuerzo #4 con estribos', amount: steelKg, unit: 'kg' }
          ]
        }
      }
      case 'Techo': {
        const tilesCount = Math.ceil(area * 14 * 1.08)
        return {
          primary: `${area.toFixed(1)} m² Cubierta (${tilesCount} tejas)`,
          items: [
            { label: 'Superficie de Cubierta', amount: Number(area.toFixed(1)), unit: 'm²' },
            { label: 'Tejas Cerámicas / Placas (+8% desp.)', amount: tilesCount, unit: 'piezas' }
          ]
        }
      }
      case 'Terreno': {
        return {
          primary: `${area.toFixed(1)} m² de Suelo / Rasante`,
          items: [
            { label: 'Área Topográfica', amount: Number(area.toFixed(1)), unit: 'm²' },
            { label: 'Volumen Estimado de Desmonte', amount: Number((area * 0.3).toFixed(1)), unit: 'm³' }
          ]
        }
      }
      case 'Puerta':
        return {
          primary: `1 pza Puerta (${obj.size.x.toFixed(2)}×${obj.size.y.toFixed(2)}m)`,
          items: [
            { label: 'Hoja de Puerta + Marco', amount: 1, unit: 'pza' },
            { label: 'Herrajes, Bisagras y Cerradura', amount: 1, unit: 'juego' }
          ]
        }
      case 'Ventana':
        return {
          primary: `1 pza Ventana (${obj.size.x.toFixed(2)}×${obj.size.y.toFixed(2)}m)`,
          items: [
            { label: 'Marco de Aluminio + Vidrio', amount: 1, unit: 'pza' },
            { label: 'Sellado y Felpa Perimetral', amount: 1, unit: 'global' }
          ]
        }
      case 'Sanitario':
      case 'Cocina':
      case 'Oficina':
      case 'Vehículo':
      case 'Vegetación':
      case 'Escala Humana':
      case 'Mobiliario':
      default:
        return {
          primary: `1 unidad (${obj.name || category})`,
          items: [{ label: obj.name || category, amount: 1, unit: 'pza' }]
        }
    }
  }

  private computeTotals(rows: BimRow[]): BimTotals {
    let wallCount = 0
    let wallLengthTotal = 0
    let wallNetAreaTotal = 0
    let wallNetVolumeTotal = 0
    let blocksCountTotal = 0
    let mortarVolumeTotal = 0
    let wallCementSacksTotal = 0

    let concreteVolumeTotal = 0
    let concreteCementSacksTotal = 0
    let sandVolumeTotal = 0
    let gravelVolumeTotal = 0
    let waterLitersTotal = 0
    let rebarSteelKgTotal = 0

    let conduitMetersTotal = 0
    let wireConductorMetersTotal = 0
    let devicesCountTotal = 0
    let clippedOverlapsCount = 0

    let builtAreaTotal = 0
    let doorCountTotal = 0
    let windowCountTotal = 0
    let furnitureCountTotal = 0
    let totalBudgetCost = 0

    for (const r of rows) {
      if (r.clippedVolume > 0) clippedOverlapsCount++
      totalBudgetCost += r.subtotalCost

      if (r.category === 'Muro') {
        wallCount++
        wallLengthTotal += r.length
        wallNetAreaTotal += r.netArea
        wallNetVolumeTotal += r.netVolume

        for (const item of r.materialBreakdown.items) {
          if (item.label.includes('Block') || item.label.includes('Ladrillo')) {
            blocksCountTotal += item.amount
          } else if (item.label.includes('Mortero')) {
            mortarVolumeTotal += item.amount
          } else if (item.label.includes('Cemento')) {
            wallCementSacksTotal += item.amount
          }
        }
      } else if (r.category === 'Losa') {
        builtAreaTotal += r.netArea
        concreteVolumeTotal += r.netVolume
        concreteCementSacksTotal += r.netVolume * 7.5
        sandVolumeTotal += r.netVolume * 0.55
        gravelVolumeTotal += r.netVolume * 0.65
        waterLitersTotal += r.netVolume * 180
        rebarSteelKgTotal += r.netVolume * 80
      } else if (r.category === 'Columna' || r.category === 'Viga') {
        concreteVolumeTotal += r.netVolume
        concreteCementSacksTotal += r.netVolume * 7.5
        sandVolumeTotal += r.netVolume * 0.55
        gravelVolumeTotal += r.netVolume * 0.65
        waterLitersTotal += r.netVolume * 180
        rebarSteelKgTotal += r.netVolume * 120
      } else if (r.category === 'Tubería') {
        conduitMetersTotal += r.length
        wireConductorMetersTotal += r.length * 3
      } else if (r.category === 'Dispositivo') {
        devicesCountTotal++
      } else if (r.category === 'Puerta') {
        doorCountTotal++
      } else if (r.category === 'Ventana') {
        windowCountTotal++
      } else if (
        r.category === 'Mobiliario' ||
        r.category === 'Sanitario' ||
        r.category === 'Cocina' ||
        r.category === 'Oficina' ||
        r.category === 'Vehículo' ||
        r.category === 'Vegetación'
      ) {
        furnitureCountTotal++
      }
    }

    // Si no hay losas explícitas, el área construida se aproxima por huella de muros
    if (builtAreaTotal === 0 && wallCount > 0) {
      builtAreaTotal = Number((wallNetAreaTotal / 2.5).toFixed(2))
    }

    const clashes = this.getClashes()

    return {
      elementCount: rows.length,
      wallCount,
      wallLengthTotal: Number(wallLengthTotal.toFixed(2)),
      wallLinearLength: Number(wallLengthTotal.toFixed(2)),
      wallNetAreaTotal: Number(wallNetAreaTotal.toFixed(2)),
      wallNetVolumeTotal: Number(wallNetVolumeTotal.toFixed(3)),
      builtAreaTotal: Number(builtAreaTotal.toFixed(2)),
      doorCountTotal,
      windowCountTotal,
      openingsCountTotal: doorCountTotal + windowCountTotal,
      furnitureCountTotal,
      totalBudgetCost: Number(totalBudgetCost.toFixed(2)),
      blocksCountTotal: Math.ceil(blocksCountTotal),
      mortarVolumeTotal: Number(mortarVolumeTotal.toFixed(2)),
      wallCementSacksTotal: Math.ceil(wallCementSacksTotal),
      concreteVolumeTotal: Number(concreteVolumeTotal.toFixed(2)),
      concreteCementSacksTotal: Math.ceil(concreteCementSacksTotal),
      sandVolumeTotal: Number(sandVolumeTotal.toFixed(2)),
      gravelVolumeTotal: Number(gravelVolumeTotal.toFixed(2)),
      waterLitersTotal: Math.ceil(waterLitersTotal),
      rebarSteelKgTotal: Number(rebarSteelKgTotal.toFixed(1)),
      conduitMetersTotal: Number(conduitMetersTotal.toFixed(1)),
      wireConductorMetersTotal: Number(wireConductorMetersTotal.toFixed(1)),
      devicesCountTotal,
      clippedOverlapsCount,
      clashesCount: clashes.length,
      trashLinesPurged: 0
    }
  }

  /* ===================================================================
   * EDICIÓN BIDIRECCIONAL (TABLA -> MODELO EN VIVO)
   * =================================================================== */

  /**
   * Actualiza en tiempo real un campo modificado directamente en la tabla.
   * Dispara inmediatamente la reconstrucción geométrica en 2D, 3D y presupuesto.
   */
  public updateRow(
    rowId: string,
    field: 'height' | 'thickness' | 'length' | 'x' | 'z' | 'material' | 'levelId' | 'unitPrice',
    value: string | number
  ): boolean {
    // 1. Edición de Precio Unitario
    if (field === 'unitPrice') {
      const val = typeof value === 'number' ? value : parseFloat(String(value))
      if (!isNaN(val) && val >= 0) {
        this.customUnitPrices.set(rowId, val)
        const row = this.rowsCache.find((r) => r.id === rowId)
        if (row) {
          row.unitPrice = val
          row.subtotalCost = Number((row.billableQty * val).toFixed(2))
          this.totalsCache = this.computeTotals(this.rowsCache)
          this.emit()
        }
        return true
      }
      return false
    }

    // 2. Muros
    const wall = this.scene.getWall(rowId)
    if (wall) {
      switch (field) {
        case 'height': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val) && val > 0.1) {
            wall.height = val
            this.scene.moveWall(wall.id, wall.start, wall.end) // Dispara listeners de cambio
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'thickness': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val) && val > 0.05) {
            wall.thickness = val
            this.scene.moveWall(wall.id, wall.start, wall.end)
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'length': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val) && val > 0.1) {
            const dir = new THREE.Vector3().subVectors(wall.end, wall.start).normalize()
            const newEnd = wall.start.clone().addScaledVector(dir, val)
            this.scene.moveWall(wall.id, wall.start, newEnd)
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'x': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val)) {
            const currentMidX = (wall.start.x + wall.end.x) / 2
            const dx = val - currentMidX
            const newStart = wall.start.clone().add(new THREE.Vector3(dx, 0, 0))
            const newEnd = wall.end.clone().add(new THREE.Vector3(dx, 0, 0))
            this.scene.moveWall(wall.id, newStart, newEnd)
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'z': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val)) {
            const currentMidZ = (wall.start.z + wall.end.z) / 2
            const dz = val - currentMidZ
            const newStart = wall.start.clone().add(new THREE.Vector3(0, 0, dz))
            const newEnd = wall.end.clone().add(new THREE.Vector3(0, 0, dz))
            this.scene.moveWall(wall.id, newStart, newEnd)
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'material': {
          const str = String(value)
          this.scene.setWallMaterial(wall.id, str.trim() ? str : null)
          this.scheduleRecompute()
          return true
        }
        case 'levelId': {
          wall.levelId = String(value)
          this.scene.moveWall(wall.id, wall.start, wall.end)
          this.scheduleRecompute()
          return true
        }
      }
      return false
    }

    // 3. Objetos de la escena
    const obj = this.scene.getObject(rowId)
    if (obj) {
      switch (field) {
        case 'height': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val) && val > 0.05) {
            obj.size.y = val
            this.scene.updateObject(obj.id, { size: obj.size })
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'thickness': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val) && val > 0.05) {
            obj.size.z = val
            this.scene.updateObject(obj.id, { size: obj.size })
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'length': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val) && val > 0.05) {
            obj.size.x = val
            this.scene.updateObject(obj.id, { size: obj.size })
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'x': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val)) {
            obj.position.x = val
            this.scene.updateObject(obj.id, { position: obj.position })
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'z': {
          const val = typeof value === 'number' ? value : parseFloat(String(value))
          if (!isNaN(val)) {
            obj.position.z = val
            this.scene.updateObject(obj.id, { position: obj.position })
            this.scheduleRecompute()
            return true
          }
          break
        }
        case 'material': {
          const str = String(value)
          this.scene.setObjectMaterial(obj.id, str.trim() ? str : null)
          this.scheduleRecompute()
          return true
        }
      }
      return false
    }

    return false
  }

  public updateUnitPrice(rowId: string, price: number): void {
    this.updateRow(rowId, 'unitPrice', price)
  }

  /**
   * Resuelve automáticamente un choque detectado por el motor de auto-sanitización.
   */
  public resolveClash(clashId: string): { ok: boolean; message: string } {
    if (!this.electricalModel) {
      return { ok: false, message: 'Modelo eléctrico no disponible.' }
    }
    const res = this.sanitizationEngine.resolveClash(clashId, this.scene, this.electricalModel)
    if (res.ok) {
      this.scheduleRecompute()
    }
    return res
  }

  /**
   * Ejecuta la limpieza de elementos huérfanos o duplicados.
   */
  public autoSanitize(): { ok: boolean; message: string } {
    const res = this.sanitizationEngine.sanitizeScene(this.scene, this.electricalModel)
    this.scheduleRecompute()
    const parts: string[] = []
    if (res.purgedDegenerateWalls > 0) parts.push(`${res.purgedDegenerateWalls} líneas sueltas eliminadas`)
    if (res.mergedDuplicateWalls > 0) parts.push(`${res.mergedDuplicateWalls} muros duplicados fusionados`)
    if (res.clippedIntersections > 0) parts.push(`${res.clippedIntersections} cruces auto-recortados sin basura`)
    if (parts.length === 0) {
      return { ok: true, message: '🛡️ Modelo 100% limpio: No se encontraron líneas sueltas ni duplicados.' }
    }
    return { ok: true, message: `🛡️ Auto-Sanitización completada: ${parts.join(', ')}.` }
  }
}
