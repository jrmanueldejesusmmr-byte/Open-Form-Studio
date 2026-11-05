import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { Wall } from '../models/Wall'
import type { SceneObject } from '../models/SceneObject'
import type { ElectricalModel } from '../mep/ElectricalModel'
import type { ElectricalWire, ElectricalDevice } from '../mep/electricalTypes'
import type { ClashReport, SanitizationResult } from './types'

/**
 * Motor de Auto-Sanitización BIM (Zero-Trash Engine).
 *
 * Soluciona de raíz los problemas tradicionales de Revit:
 * 1. Prevención y recorte de superposiciones (Auto-Join & Clip): descuenta el volumen
 *    de intersección cuando un muro se cruza o encisa con una losa, viga o columna.
 * 2. Fusión automática de muros duplicados / encimados.
 * 3. Detección y depuración de líneas sueltas y segmentos degenerados.
 * 4. Detector de choques en tiempo real (Clash Detection: MEP vs Estructura).
 * 5. Resolución automática de choques desviando tuberías limpiamente.
 */
export class BimSanitizationEngine {
  private static instance: BimSanitizationEngine | null = null

  static getInstance(): BimSanitizationEngine {
    if (!this.instance) {
      this.instance = new BimSanitizationEngine()
    }
    return this.instance
  }

  /**
   * Ejecuta una sanitización integral de la escena.
   */
  sanitizeScene(scene: SceneManager, electricalModel?: ElectricalModel): SanitizationResult {
    const messages: string[] = []
    let purgedDegenerateWalls = 0
    let mergedDuplicateWalls = 0

    // 1. Limpieza de líneas sueltas / degeneradas (< 0.05m)
    const walls = [...scene.getWalls()]
    for (const wall of walls) {
      if (wall.length < 0.05 || isNaN(wall.start.x) || isNaN(wall.end.x)) {
        scene.removeWall(wall.id)
        purgedDegenerateWalls++
        messages.push(`Línea suelta o muro degenerado (${wall.id}, L=${wall.length.toFixed(2)}m) eliminado.`)
      }
    }

    // 2. Detección y fusión de muros duplicados / superpuestos
    const activeWalls = [...scene.getWalls()]
    const mergedIds = new Set<string>()

    for (let i = 0; i < activeWalls.length; i++) {
      const w1 = activeWalls[i]
      if (mergedIds.has(w1.id)) continue

      for (let j = i + 1; j < activeWalls.length; j++) {
        const w2 = activeWalls[j]
        if (mergedIds.has(w2.id)) continue
        if (w1.levelId !== w2.levelId) continue

        if (this.areWallsCollinearAndOverlapping(w1, w2)) {
          // Fusionar w2 dentro de w1
          const mergedCoords = this.mergeCollinearWallCoordinates(w1, w2)
          if (mergedCoords) {
            scene.moveWall(w1.id, mergedCoords.start, mergedCoords.end)
            scene.removeWall(w2.id)
            mergedIds.add(w2.id)
            mergedDuplicateWalls++
            messages.push(`Muros superpuestos fusionados en un único elemento limpio (${w1.id} absorbió ${w2.id}).`)
          }
        }
      }
    }

    // 3. Auto-recorte de intersecciones (Wall vs Slab/Beam)
    const clippedIntersections = this.computeWallClippedIntersections(scene)

    // 4. Choques MEP vs Estructura
    const activeClashes = electricalModel ? this.detectClashes(scene, electricalModel) : []

    return {
      purgedDegenerateWalls,
      mergedDuplicateWalls,
      clippedIntersections: clippedIntersections.size,
      activeClashes,
      messages
    }
  }

  /**
   * Determina si dos muros son colineales y se superponen.
   */
  private areWallsCollinearAndOverlapping(w1: Wall, w2: Wall): boolean {
    const v1 = new THREE.Vector2(w1.end.x - w1.start.x, w1.end.z - w1.start.z)
    const v2 = new THREE.Vector2(w2.end.x - w2.start.x, w2.end.z - w2.start.z)
    const len1 = v1.length()
    const len2 = v2.length()
    if (len1 < 0.05 || len2 < 0.05) return false

    // Comprobar paralelismo
    const dir1 = v1.clone().normalize()
    const dir2 = v2.clone().normalize()
    const dot = Math.abs(dir1.dot(dir2))
    if (dot < 0.99) return false // No son paralelos

    // Comprobar distancia perpendicular entre líneas
    const p1 = new THREE.Vector2(w1.start.x, w1.start.z)
    const p2Start = new THREE.Vector2(w2.start.x, w2.start.z)
    const p2End = new THREE.Vector2(w2.end.x, w2.end.z)

    const normal = new THREE.Vector2(-dir1.y, dir1.x)
    const distStart = Math.abs(p2Start.clone().sub(p1).dot(normal))
    const distEnd = Math.abs(p2End.clone().sub(p1).dot(normal))
    const maxAllowedDist = Math.max(w1.thickness, w2.thickness) * 0.5 + 0.05
    if (distStart > maxAllowedDist || distEnd > maxAllowedDist) return false

    // Proyección escalar sobre dir1
    const t1Start = 0
    const t1End = len1
    const t2Start = p2Start.clone().sub(p1).dot(dir1)
    const t2End = p2End.clone().sub(p1).dot(dir1)

    const minT2 = Math.min(t2Start, t2End)
    const maxT2 = Math.max(t2Start, t2End)

    // ¿Hay solapamiento en el rango 1D?
    const overlapMin = Math.max(t1Start, minT2)
    const overlapMax = Math.min(t1End, maxT2)
    return overlapMax - overlapMin > 0.05
  }

  private mergeCollinearWallCoordinates(
    w1: Wall,
    w2: Wall
  ): { start: THREE.Vector3; end: THREE.Vector3 } | null {
    const v1 = new THREE.Vector2(w1.end.x - w1.start.x, w1.end.z - w1.start.z)
    const len1 = v1.length()
    if (len1 < 0.05) return null
    const dir1 = v1.clone().normalize()
    const p1 = new THREE.Vector2(w1.start.x, w1.start.z)

    const p2Start = new THREE.Vector2(w2.start.x, w2.start.z)
    const p2End = new THREE.Vector2(w2.end.x, w2.end.z)

    const t0 = 0
    const t1 = len1
    const t2 = p2Start.clone().sub(p1).dot(dir1)
    const t3 = p2End.clone().sub(p1).dot(dir1)

    const minT = Math.min(t0, t1, t2, t3)
    const maxT = Math.max(t0, t1, t2, t3)

    const startX = p1.x + dir1.x * minT
    const startZ = p1.y + dir1.y * minT
    const endX = p1.x + dir1.x * maxT
    const endZ = p1.y + dir1.y * maxT

    return {
      start: new THREE.Vector3(startX, w1.start.y, startZ),
      end: new THREE.Vector3(endX, w1.end.y, endZ)
    }
  }

  /**
   * Calcula el volumen recortado de cada muro debido a superposiciones con losas,
   * vigas o columnas estructurales (Auto-Join & Clip).
   * Devuelve un mapa de wallId -> volumenRecortado (m³).
   */
  computeWallClippedIntersections(scene: SceneManager): Map<string, number> {
    const deductions = new Map<string, number>()
    const walls = scene.getWalls()
    const objects = scene.getObjects()
    const levels = scene.getLevels()

    const getLevelElev = (id: string): number => {
      const lev = levels.find((l) => l.id === id)
      return lev?.elevation ?? 0
    }

    // Filtrar elementos estructurales con los que un muro puede colisionar o encisarse
    const structuralObjects = objects.filter((o) => {
      const name = (o.name || '').toLowerCase()
      const shape = (o.shapeId || '').toLowerCase()
      const sys = o.structuralParams?.systemType?.toLowerCase() || ''
      return (
        shape.includes('struct.') ||
        shape.includes('losa') ||
        shape.includes('viga') ||
        shape.includes('columna') ||
        name.includes('losa') ||
        name.includes('forjado') ||
        name.includes('viga') ||
        name.includes('columna') ||
        sys.includes('losa') ||
        sys.includes('viga') ||
        sys.includes('columna') ||
        o.kind === 'roof'
      )
    })

    for (const wall of walls) {
      let totalClippedVolume = 0
      const wallBaseElev = getLevelElev(wall.levelId)
      const wallTopElev = wallBaseElev + wall.height

      // Bounding Box del muro
      const minX = Math.min(wall.start.x, wall.end.x) - wall.thickness / 2
      const maxX = Math.max(wall.start.x, wall.end.x) + wall.thickness / 2
      const minZ = Math.min(wall.start.z, wall.end.z) - wall.thickness / 2
      const maxZ = Math.max(wall.start.z, wall.end.z) + wall.thickness / 2
      const wallBox = new THREE.Box3(
        new THREE.Vector3(minX, wallBaseElev, minZ),
        new THREE.Vector3(maxX, wallTopElev, maxZ)
      )

      for (const obj of structuralObjects) {
        const objBaseElev = obj.position.y
        const objBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(obj.position.x, objBaseElev + obj.size.y / 2, obj.position.z),
          obj.size
        )

        if (wallBox.intersectsBox(objBox)) {
          const intersectionBox = wallBox.clone().intersect(objBox)
          const intersectionSize = new THREE.Vector3()
          intersectionBox.getSize(intersectionSize)

          if (
            intersectionSize.x > 0.01 &&
            intersectionSize.y > 0.01 &&
            intersectionSize.z > 0.01
          ) {
            // El volumen de la intersección se descuenta para que la tabla nunca cobre material doble
            const overlapVolume = intersectionSize.x * intersectionSize.y * intersectionSize.z
            totalClippedVolume += overlapVolume
          }
        }
      }

      if (totalClippedVolume > 0) {
        deductions.set(wall.id, totalClippedVolume)
      }
    }

    return deductions
  }

  /**
   * Detector de choques en tiempo real entre MEP (cables/tuberías eléctricas) y
   * elementos estructurales (vigas, columnas).
   */
  detectClashes(scene: SceneManager, electricalModel: ElectricalModel): ClashReport[] {
    const clashes: ClashReport[] = []
    const wires = electricalModel.getWires()
    const devices = electricalModel.getDevices()
    const objects = scene.getObjects()
    const levels = scene.getLevels()

    const deviceMap = new Map<string, ElectricalDevice>()
    for (const d of devices) deviceMap.set(d.id, d)

    // Elementos estructurales que no deben ser atravesados indebidamente sin paso de camisa
    const structuralObstacles = objects.filter((o) => {
      const name = (o.name || '').toLowerCase()
      const shape = (o.shapeId || '').toLowerCase()
      const sys = o.structuralParams?.systemType?.toLowerCase() || ''
      return (
        shape.includes('struct.viga') ||
        shape.includes('struct.columna') ||
        shape.includes('struct.adintelada') ||
        shape.includes('struct.entramada') ||
        name.includes('viga') ||
        name.includes('columna') ||
        name.includes('castillo') ||
        sys.includes('viga') ||
        sys.includes('columna')
      )
    })

    if (structuralObstacles.length === 0 || wires.length === 0) return clashes

    const getLevelElev = (id: string): number => levels.find((l) => l.id === id)?.elevation ?? 0

    for (const wire of wires) {
      const fromDev = deviceMap.get(wire.from)
      const toDev = deviceMap.get(wire.to)
      if (!fromDev || !toDev) continue

      const p1 = new THREE.Vector3(fromDev.x, getLevelElev(fromDev.levelId) + fromDev.height, fromDev.z)
      const p2 = new THREE.Vector3(toDev.x, getLevelElev(toDev.levelId) + toDev.height, toDev.z)
      const lineSeg = new THREE.Line3(p1, p2)

      for (const obj of structuralObstacles) {
        const objBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(obj.position.x, obj.position.y + obj.size.y / 2, obj.position.z),
          obj.size
        )

        // Comprobar intersección segmento de línea vs Box3
        const closestPoint = new THREE.Vector3()
        objBox.clampPoint(lineSeg.getCenter(new THREE.Vector3()), closestPoint)

        if (objBox.containsPoint(p1) || objBox.containsPoint(p2) || this.lineIntersectsBox(lineSeg, objBox)) {
          clashes.push({
            id: `clash-${wire.id}-${obj.id}`,
            wireId: wire.id,
            structuralId: obj.id,
            wireLabel: `Circuito ${wire.circuit} (${wire.id})`,
            structuralLabel: `${obj.name || 'Elemento Estructural'} (${obj.id})`,
            clashPoint: { x: closestPoint.x, y: closestPoint.y, z: closestPoint.z },
            description: `⚠️ CHOQUE DETECTADO: Tubería Eléctrica (${wire.id}) atraviesa ${obj.name || 'Viga/Columna'} (${obj.id})`,
            severity: 'critical'
          })
        }
      }
    }

    return clashes
  }

  /**
   * Resuelve automáticamente el choque detectado desviando la tubería / circuito
   * por debajo o alrededor de la viga o columna con 15 cm de despeje reglamentario.
   */
  resolveClash(
    clashId: string,
    scene: SceneManager,
    electricalModel: ElectricalModel
  ): { ok: boolean; message: string } {
    const clashes = this.detectClashes(scene, electricalModel)
    const clash = clashes.find((c) => c.id === clashId)
    if (!clash) {
      return { ok: false, message: 'El choque especificado ya no existe o ya fue resuelto.' }
    }

    const wire = electricalModel.getWire(clash.wireId)
    const obstacle = scene.getObject(clash.structuralId)
    if (!wire || !obstacle) {
      return { ok: false, message: 'No se encontraron las entidades del choque.' }
    }

    const fromDev = electricalModel.getDevice(wire.from)
    const toDev = electricalModel.getDevice(wire.to)
    if (!fromDev || !toDev) {
      return { ok: false, message: 'No se encontraron los dispositivos extremos.' }
    }

    // Crear un paso limpio: bajar la tubería por debajo del fondo de la viga (-0.15m)
    const lev = scene.getLevels().find((l) => l.id === fromDev.levelId)
    const levelElev = lev?.elevation ?? 0
    const obstacleBottom = obstacle.position.y - 0.15
    const midWorldY = Math.min(obstacleBottom, levelElev + fromDev.height, levelElev + toDev.height)
    const relativeHeight = Math.max(0.1, midWorldY - levelElev)

    const midpoint = new THREE.Vector3(
      (fromDev.x + toDev.x) / 2,
      midWorldY,
      (fromDev.z + toDev.z) / 2
    )

    // Agregamos una caja de paso / registro técnico para desviar la ruta limpiamente
    const junction = electricalModel.addDevice({
      type: 'junction',
      levelId: fromDev.levelId,
      x: midpoint.x,
      z: midpoint.z,
      height: relativeHeight,
      rotationY: 0,
      label: 'Caja Bypass Estructural'
    })

    // Reconectar la tubería a través del paso limpio
    electricalModel.removeWire(wire.id)
    electricalModel.addWire(fromDev.id, junction.id, wire.circuit)
    electricalModel.addWire(junction.id, toDev.id, wire.circuit)

    return {
      ok: true,
      message: `🔧 Choque resuelto: Tubería desviada con paso limpio por debajo de ${obstacle.name} (${obstacle.id}) con 15cm de holgura.`
    }
  }

  private lineIntersectsBox(line: THREE.Line3, box: THREE.Box3): boolean {
    const dir = line.delta(new THREE.Vector3())
    const length = dir.length()
    if (length < 1e-4) return box.containsPoint(line.start)
    const ray = new THREE.Ray(line.start, dir.normalize())
    const target = new THREE.Vector3()
    const hit = ray.intersectBox(box, target)
    if (!hit) return false
    return hit.distanceTo(line.start) <= length
  }
}
