import * as THREE from 'three'
import type { ExportContext } from './index'
import { computeLevelFootprint } from './index'
import type { Wall } from '../models/Wall'
import type { SceneObject } from '../models/SceneObject'
import type { Level } from '../models/Level'
import type { Opening } from '../models/Opening'

const IFC_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function ifcGuid(seed: number): string {
  let value = BigInt(Math.max(0, Math.floor(seed)))
  let out = ''
  for (let i = 0; i < 22; i++) {
    out = IFC_B64[Number(value % 64n)] + out
    value /= 64n
  }
  return out
}

class StepFile {
  private readonly lines: string[] = []
  private nextId = 1
  add(body: string): number {
    const id = this.nextId++
    this.lines.push(`#${id}=${body};`)
    return id
  }
  toString(): string {
    return this.lines.join('\n')
  }
}

function num(value: number): string {
  if (!Number.isFinite(value)) return '0.'
  const rounded = Math.round(value * 1000000) / 1000000
  return Object.is(rounded, -0) ? '0.' : `${rounded}.`
}

function str(value: string): string {
  const BS = '\\'
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === BS) out += BS + BS
    else if (ch === '"') out += BS + '"'
    else if (code > 127) {
      if (code <= 0xffff) {
        out += BS + 'X2\\' + code.toString(16).toUpperCase().padStart(4, '0') + BS + 'X0\\'
      } else {
        out += BS + 'X4\\' + code.toString(16).toUpperCase().padStart(8, '0') + BS + 'X0\\'
      }
    } else {
      out += ch
    }
  }
  return out
}

function point3(x: number, y: number, z: number): string {
  return `CARTESIAN_POINT('',(${num(x)},${num(y)},${num(z)}))`
}

function dir3(x: number, y: number, z: number): string {
  return `DIRECTION('',(${num(x)},${num(y)},${num(z)}))`
}

function dir2(x: number, y: number): string {
  return `DIRECTION('',(${num(x)},${num(y)}))`
}

function localAxis(file: StepFile): number {
  const p = file.add(point3(0, 0, 0))
  const z = file.add(dir3(0, 0, 1))
  const x = file.add(dir2(1, 0))
  return file.add(`IFCAXIS2PLACEMENT3D($,#${p},#${z},#${x})`)
}

function placementIn(file: StepFile, parentId: number, x: number, y: number, z: number, angle = 0): number {
  const p = file.add(point3(x, y, z))
  const zAxis = file.add(dir3(0, 0, 1))
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const xAxis = file.add(dir2(c, s))
  const axis = file.add(`IFCAXIS2PLACEMENT3D($,#${p},#${zAxis},#${xAxis})`)
  return file.add(`IFCLOCALPLACEMENT(#${parentId},#${axis})`)
}

function extrudedBox(file: StepFile, length: number, width: number, depth: number): number {
  const axis = localAxis(file)
  const profile = file.add(`IFCRECTANGLEPROFILEDEF(.AREA.,'Perfil',$,#${axis},${num(length)},${num(width)})`)
  const pos = file.add(point3(0, 0, 0))
  const dir = file.add(dir3(0, 0, 1))
  return file.add(`IFCEXTRUDEDAREASOLID($,#${profile},#${pos},#${dir},${num(depth)})`)
}

interface IfcStorey {
  level: Level
  guid: string
  entityId: number
  placementId: number
}

function storeyFor(context: ExportContext, levelId: string, storeys: IfcStorey[]): IfcStorey {
  const found = storeys.find((s) => s.level.id === levelId)
  if (found) return found
  const first = storeys[0]
  if (first) return first
  return {
    level: { id: levelId, name: 'Piso 0', elevation: 0, height: 2.8, initialElevation: 0 } as Level,
    guid: ifcGuid(9),
    entityId: 0,
    placementId: 0
  }
}

function openingKind(object: SceneObject): 'door' | 'window' | null {
  const name = (object.name ?? '').toLowerCase()
  const shape = (object.shapeId ?? '').toLowerCase()
  if (name.includes('puerta') || shape.includes('door')) return 'door'
  if (name.includes('ventana') || shape.includes('window')) return 'window'
  return null
}

function isRoofObject(obj: SceneObject): boolean {
  if (obj.roofProps) return true
  const shape = (obj.shapeId ?? '').toLowerCase()
  if (shape.startsWith('roof.')) return true
  const name = (obj.name ?? '').toLowerCase()
  return name.includes('techo') || name.includes('roof')
}

function colorRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
}

function addSurfaceStyle(file: StepFile, name: string, hex: number): number {
  const [r, g, b] = colorRgb(hex)
  const colour = file.add(`IFCCOLOURRGB($,${num(r)},${num(g)},${num(b)})`)
  const rendering = file.add(`IFCSURFACESTYLERENDERING(#${colour},0.,$,$,$,$,$,$,.NOTDEFINED.)`)
  const surfaceStyle = file.add(`IFCSURFACESTYLE('${str(name)}',.BOTH.,(#${rendering}))`)
  return file.add(`IFCPRESENTATIONSTYLEASSIGNMENT((#${surfaceStyle}))`)
}

function addStyledItem(file: StepFile, solidId: number, styleId: number): void {
  file.add(`IFCSTYLEDITEM(#${solidId},(#${styleId}),$)`)
}

function addMaterial(file: StepFile, materialId: string): number {
  return file.add(`IFCMATERIAL('${str(materialId)}',$,'${str(materialId)}')`)
}

export interface IfcOptions {
  projectName?: string
  author?: string
}




export function buildIfc(context: ExportContext, options: IfcOptions = {}): string {
  const file = new StepFile()
  const projectName = options.projectName ?? context.projectName ?? 'Proyecto ArqStudio'

  const lengthUnit = file.add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')
  const areaUnit = file.add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')
  const volumeUnit = file.add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')
  const angleUnit = file.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')
  const units = file.add(`IFCUNITASSIGNMENT((#${lengthUnit},#${areaUnit},#${volumeUnit},#${angleUnit}))`)

  const originAxis = localAxis(file)
  const projectPlacement = file.add(`IFCLOCALPLACEMENT($,#${originAxis})`)

  const person = file.add(`IFCPERSON($,'${str(options.author ?? 'ArqStudio 3D')}',$,$,$,$,$,$)`)
  const organization = file.add(`IFCORGANIZATION($,'ArqStudio 3D',$,$,$)`)
  const personAndOrg = file.add(`IFCPERSONANDORGANIZATION(#${person},#${organization},$)`)
  const application = file.add(`IFCAPPLICATION(#${organization},'1.0','ArqStudio 3D','ARQSTUDIO')`)
  const ownerHistory = file.add(`IFCOWNERHISTORY(#${personAndOrg},#${application},$,.ADDED.,$,$,$,0)`)

  const project = file.add(`IFCPROJECT('${str(projectName)}',#${ifcGuid(1)},$,$,$,$,$,$,(#${projectPlacement}),#${units})`)
  const site = file.add(`IFCSITE('${str(projectName)}',#${ifcGuid(2)},$,$,$,#${projectPlacement},$,$,.ELEMENT.,$,$,$,$,$)`)
  const building = file.add(`IFCBUILDING('${str(projectName)}',#${ifcGuid(3)},$,$,$,#${projectPlacement},$,$,.ELEMENT.,$,$,$)`)

  let guidSeed = 10
  const storeys: IfcStorey[] = []
  for (const level of context.levels) {
    const guid = ifcGuid(guidSeed++)
    const p = file.add(point3(0, 0, level.elevation))
    const zAxis = file.add(dir3(0, 0, 1))
    const xAxis = file.add(dir2(1, 0))
    const axis = file.add(`IFCAXIS2PLACEMENT3D($,#${p},#${zAxis},#${xAxis})`)
    const placement = file.add(`IFCLOCALPLACEMENT(#${projectPlacement},#${axis})`)
    const storeyId = file.add(`IFCBUILDINGSTOREY('${str(level.name)}',#${guid},$,$,$,#${placement},$,$,.ELEMENT.,${num(level.elevation)})`)
    storeys.push({ level, guid, entityId: storeyId, placementId: placement })
  }
  if (storeys.length === 0) {
    const guid = ifcGuid(9)
    const placement = file.add(`IFCLOCALPLACEMENT(#${projectPlacement},#${originAxis})`)
    const storeyId = file.add(`IFCBUILDINGSTOREY('Piso 0',#${guid},$,$,$,#${placement},$,$,.ELEMENT.,0.)`)
    storeys.push({
      level: { id: 'level-0', name: 'Piso 0', elevation: 0, height: 2.8, initialElevation: 0 } as Level,
      guid,
      entityId: storeyId,
      placementId: placement
    })
  }

  file.add(`IFCRELAGGREGATES('${str(projectName)}',#${ifcGuid(4)},$,$,$,#${project},(#${site}))`)
  file.add(`IFCRELAGGREGATES('${str(projectName)}',#${ifcGuid(5)},$,$,$,#${site},(#${building}))`)
  file.add(`IFCRELAGGREGATES('${str(projectName)}',#${ifcGuid(6)},$,$,$,#${building},(${storeys.map((s) => `#${s.entityId}`).join(',')}))`)
  void ownerHistory

  const wallEntityIds = new Map<string, number>()

  for (const wall of context.walls) {
    const storey = storeyFor(context, wall.levelId, storeys)
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const length = Math.hypot(dx, dz)
    const midX = (wall.start.x + wall.end.x) / 2
    const midZ = (wall.start.z + wall.end.z) / 2
    const angle = Math.atan2(dz, dx)
    const solidId = extrudedBox(file, Math.max(length, 0.01), wall.thickness, wall.height)
    const placementId = placementIn(file, storey.placementId, midX, 0, midZ, angle)
    const guid = ifcGuid(guidSeed++)
    const elementId = file.add(`IFCWALLSTANDARDCASE('${str('Muro')}',#${guid},$,$,$,#${placementId},$,#${solidId},$,$)`)
    wallEntityIds.set(wall.id, elementId)
    file.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('Muro',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${storey.entityId})`)
    const styleId = addSurfaceStyle(file, 'Muro', wall.color)
    addStyledItem(file, solidId, styleId)
    if (wall.materialId) {
      const materialId = addMaterial(file, wall.materialId)
      file.add(`IFCRELASSOCIATESMATERIAL('Muro',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${materialId})`)
    }

    for (const opening of wall.openings ?? []) {
      const ux = dx / Math.max(length, 1e-9)
      const uz = dz / Math.max(length, 1e-9)
      const cx = wall.start.x + ux * opening.x
      const cz = wall.start.z + uz * opening.x
      const cy = opening.sill + opening.height / 2
      const openingAngle = angle
      const openingSolid = extrudedBox(file, Math.max(opening.width, 0.01), wall.thickness, Math.max(opening.height, 0.01))
      const openingPlacement = placementIn(file, storey.placementId, cx, cy, cz, openingAngle)
      const openingGuid = ifcGuid(guidSeed++)
      const openingId = file.add(`IFCOPENINGELEMENT('${str(opening.type === 'door' ? 'Hueco puerta' : 'Hueco ventana')}',#${openingGuid},$,$,$,#${openingPlacement},$,$,.OPENING.,${opening.type === 'door' ? '.DOORWAY.' : '.WINDOW.'})`)
      const ifcType = opening.type === 'door' ? 'IFCDOOR' : 'IFCWINDOW'
      const doorGuid = ifcGuid(guidSeed++)
      const doorId = file.add(`${ifcType}('${str(opening.type === 'door' ? 'Puerta' : 'Ventana')}',#${doorGuid},$,$,$,#${openingPlacement},$,#${openingSolid},$,$)`)
      file.add(`IFCRELVOIDSELEMENT('Hueco',#${ifcGuid(guidSeed++)},$,$,$,#${elementId},#${openingId})`)
      file.add(`IFCRELFILLSELEMENT('Relleno',#${ifcGuid(guidSeed++)},$,$,$,#${openingId},#${doorId})`)
      file.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${str(opening.type === 'door' ? 'Puerta' : 'Ventana')}',#${ifcGuid(guidSeed++)},$,$,$,(#${doorId}),#${storey.entityId})`)
      const styleId2 = addSurfaceStyle(file, opening.type === 'door' ? 'Puerta' : 'Ventana', 0xaaaaaa)
      addStyledItem(file, openingSolid, styleId2)
      if (opening.materialId) {
        const materialId = addMaterial(file, opening.materialId)
        file.add(`IFCRELASSOCIATESMATERIAL('${str(opening.materialId)}',#${ifcGuid(guidSeed++)},$,$,$,(#${doorId}),#${materialId})`)
      }
    }
  }

  for (const storey of storeys) {
    const footprint = computeLevelFootprint(storey.level, context)
    if (!footprint) continue
    const width = Math.max(footprint.maxX - footprint.minX, 0.1)
    const depth = Math.max(footprint.maxZ - footprint.minZ, 0.1)
    const centerX = (footprint.minX + footprint.maxX) / 2
    const centerZ = (footprint.minZ + footprint.maxZ) / 2
    const solidId = extrudedBox(file, width, depth, 0.2)
    const placementId = placementIn(file, storey.placementId, centerX, 0, centerZ)
    const guid = ifcGuid(guidSeed++)
    const elementId = file.add(`IFCSLAB('Losa ${str(storey.level.name)}',#${guid},$,$,$,#${placementId},$,#${solidId},$,$)`)
    file.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('Losa',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${storey.entityId})`)
    const styleId = addSurfaceStyle(file, 'Losa', 0x9c9689)
    addStyledItem(file, solidId, styleId)
  }

  for (const obj of context.objects) {
    if (obj.openingId) continue
    const storey = storeyFor(context, obj.levelId, storeys)

    if (isRoofObject(obj)) {
      let length = obj.size.x
      let depth = obj.size.z
      let cx = obj.position.x
      let cz = obj.position.z
      let thickness = obj.size.y
      if (obj.roofProps) {
        const fp = obj.roofProps.footprint
        if (fp && fp.length > 0) {
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
          for (const p of fp) {
            minX = Math.min(minX, p.x)
            maxX = Math.max(maxX, p.x)
            minZ = Math.min(minZ, p.z)
            maxZ = Math.max(maxZ, p.z)
          }
          length = Math.max(maxX - minX, 0.1)
          depth = Math.max(maxZ - minZ, 0.1)
          cx = (minX + maxX) / 2
          cz = (minZ + maxZ) / 2
        }
        thickness = obj.roofProps.thickness
      }
      const solidId = extrudedBox(file, length, depth, Math.max(thickness, 0.05))
      const placementId = placementIn(file, storey.placementId, cx, obj.position.y, cz, obj.rotationY)
      const guid = ifcGuid(guidSeed++)
      const elementId = file.add(`IFCROOF('${str(obj.name)}',#${guid},$,$,$,#${placementId},$,#${solidId},$,$)`)
      file.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${str(obj.name)}',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${storey.entityId})`)
      const styleId = addSurfaceStyle(file, obj.name, obj.color)
      addStyledItem(file, solidId, styleId)
      if (obj.materialId) {
        const materialId = addMaterial(file, obj.materialId)
        file.add(`IFCRELASSOCIATESMATERIAL('${str(obj.materialId)}',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${materialId})`)
      }
      continue
    }

    const kind = openingKind(obj)
    if (kind) {
      const solidId = extrudedBox(file, obj.size.x, obj.size.z, obj.size.y)
      const placementId = placementIn(file, storey.placementId, obj.position.x, obj.position.y, obj.position.z, obj.rotationY)
      const guid = ifcGuid(guidSeed++)
      const ifcType = kind === 'door' ? 'IFCDOOR' : 'IFCWINDOW'
      const elementId = file.add(`${ifcType}('${str(obj.name)}',#${guid},$,$,$,#${placementId},$,#${solidId},$,$)`)
      file.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${str(obj.name)}',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${storey.entityId})`)
      const styleId = addSurfaceStyle(file, obj.name, obj.color)
      addStyledItem(file, solidId, styleId)
      if (obj.materialId) {
        const materialId = addMaterial(file, obj.materialId)
        file.add(`IFCRELASSOCIATESMATERIAL('${str(obj.materialId)}',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${materialId})`)
      }
      continue
    }

    const solidId = extrudedBox(file, obj.size.x, obj.size.z, obj.size.y)
    const placementId = placementIn(file, storey.placementId, obj.position.x, obj.position.y, obj.position.z, obj.rotationY)
    const guid = ifcGuid(guidSeed++)
    const elementId = file.add(`IFCFURNISHINGELEMENT('${str(obj.name)}',#${guid},$,$,$,#${placementId},$,#${solidId},$)`)
    file.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${str(obj.name)}',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${storey.entityId})`)
    const styleId = addSurfaceStyle(file, obj.name, obj.color)
    addStyledItem(file, solidId, styleId)
    if (obj.materialId) {
      const materialId = addMaterial(file, obj.materialId)
      file.add(`IFCRELASSOCIATESMATERIAL('${str(obj.materialId)}',#${ifcGuid(guidSeed++)},$,$,$,(#${elementId}),#${materialId})`)
    }
  }

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');",
    `FILE_NAME('${str('modelo.ifc')}','2026-01-01T00:00:00',('${str(options.author ?? 'ArqStudio 3D')}'),('${str('ArqStudio 3D')}'),'ArqStudio 3D','ArqStudio 3D','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;'
  ]
  const footer = ['ENDSEC;', 'END-ISO-10303-21;']
  return [...header, file.toString(), ...footer].join('\n')
}

export async function exportIfc(_scene: THREE.Scene, context?: ExportContext): Promise<string> {
  try {
    const ctx = context ?? { walls: [], objects: [], levels: [] }
    return buildIfc(ctx, { projectName: ctx.projectName, author: ctx.author })
  } catch (err) {
    return ''
  }
}
