/**
 * Biblioteca de materiales de puerta (Fase 4 · puertas).
 *
 * Cada entrada define color, rugosidad y metalicidad PBR y, cuando procede, un
 * **mapa procedural generado en canvas** (sin imágenes externas) para que se
 * vea bien en 3D sin depender de archivos. El vidrio usa transparencia/opacidad.
 *
 * Los IDs son estables y viajan en el proyecto (guardado/deshacer).
 */

import * as THREE from 'three'

export type DoorMaterialId =
  | 'door.wood-light'
  | 'door.wood-dark'
  | 'door.oak'
  | 'door.walnut'
  | 'door.paint-white'
  | 'door.paint-black'
  | 'door.metal'
  | 'door.aluminum'
  | 'door.glass-clear'
  | 'door.glass-frosted'
  | 'door.cherry'
  | 'door.steel'

export interface DoorMaterial {
  id: DoorMaterialId
  label: string
  /** Color base (tinte). */
  color: number
  /** Rugosidad 0 (espejo) .. 1 (mate). */
  roughness: number
  /** Metalicidad 0 .. 1. */
  metalness: number
  /** Opacidad 0..1 (vidrios). */
  opacity: number
  /** Tipo de mapa procedural aplicado al canal `map` (null = color plano). */
  mapKind: 'wood-light' | 'wood-dark' | 'oak' | 'walnut' | 'metal' | 'aluminum' | 'glass' | null
  /** Miniatura SVG lista para insertar en el panel de texturas. */
  thumbnail: string
}

/** Tamaño por defecto (ancho × alto, en metros) de cada variante de puerta. */
export interface DoorDefault { width: number; height: number; label: string }

export const DOOR_DEFAULTS: Record<DoorVariant, DoorDefault> = {
  simple:   { width: 0.90, height: 2.10, label: 'Puerta simple' },
  doble:    { width: 1.80, height: 2.10, label: 'Puerta doble' },
  corrediza:{ width: 0.90, height: 2.10, label: 'Puerta corrediza' },
  garaje:   { width: 2.50, height: 2.20, label: 'Puerta de garaje' },
  vidrio:   { width: 0.90, height: 2.10, label: 'Puerta de vidrio' },
  'puerta-ventana': { width: 0.80, height: 2.10, label: 'Puerta-ventana' },
} as const

export type DoorVariant =
  | 'simple' | 'doble' | 'corrediza' | 'garaje' | 'vidrio' | 'puerta-ventana'

export type DoorSwing = 'left-in' | 'right-in' | 'left-out' | 'right-out'

const seeded = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s >>> 8) / 0xffffff
  }
}

function fillNoise(ctx: CanvasRenderingContext2D, size: number, seed: number, scale: number): void {
  const rand = seeded(seed)
  for (let i = 0; i < size * size * scale; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 0.5 + rand() * 2
    const gray = Math.round(180 + rand() * 60)
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`
    ctx.fillRect(x, y, r, r)
  }
}

function drawWoodGrain(ctx: CanvasRenderingContext2D, size: number, base: string, seed: number): void {
  const rand = seeded(seed)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  ctx.lineWidth = 2
  for (let i = 0; i < 14; i++) {
    const y = rand() * size
    const x0 = rand() * size * 0.4
    const x1 = x0 + size * (0.5 + rand() * 0.5)
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.bezierCurveTo(x0 + size * 0.2, y + rand() * 4, x1 - size * 0.2, y - rand() * 4, x1, y)
    ctx.strokeStyle = `rgba(0,0,0,${0.15 + rand() * 0.2})`
    ctx.stroke()
  }
  fillNoise(ctx, size, seed + 1, 0.35)
}

function drawMetalBrushed(ctx: CanvasRenderingContext2D, size: number, base: string, seed: number): void {
  const rand = seeded(seed)
  const grad = ctx.createLinearGradient(0, 0, size, 0)
  grad.addColorStop(0, base)
  grad.addColorStop(0.5, '#ffffff')
  grad.addColorStop(1, base)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < size / 3; i++) {
    const x = rand() * size
    const w = 1 + rand() * 3
    const h = size * (0.6 + rand() * 0.4)
    ctx.fillStyle = `rgba(255,255,255,${0.10 + rand() * 0.15})`
    ctx.fillRect(x, (size - h) / 2, w, h)
  }
}

/** Crea una `CanvasTexture` procedimental (sin red ni imágenes externas). */
function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function thumbnailSwatch(color: number, kind: string | null): string {
  const hex = `#${color.toString(16).padStart(6, '0')}`
  const pattern = kind === null
    ? ''
    : `<pattern id="p" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="${hex}"/>
        <path d="M0 10 Q10 0 20 10 M0 10 Q10 20 20 10" stroke="#00000033" stroke-width="1" fill="none"/>
      </pattern>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <rect x="2" y="2" width="44" height="44" rx="6" fill="${hex}" stroke="#00000044" stroke-width="1"/>
    ${pattern ? `<rect x="8" y="8" width="32" height="32" rx="4" fill="url(#p)"/>` : ''}
  </svg>`
}

export const DOOR_MATERIALS: ReadonlyArray<DoorMaterial> = [
  {
    id: 'door.wood-light', label: 'Madera clara',
    color: 0xd4a373, roughness: 0.72, metalness: 0.05, opacity: 1,
    mapKind: 'wood-light',
    thumbnail: thumbnailSwatch(0xd4a373, 'wood-light')
  },
  {
    id: 'door.wood-dark', label: 'Madera oscura',
    color: 0x5d4037, roughness: 0.68, metalness: 0.08, opacity: 1,
    mapKind: 'wood-dark',
    thumbnail: thumbnailSwatch(0x5d4037, 'wood-dark')
  },
  {
    id: 'door.oak', label: 'Roble',
    color: 0x8d6e63, roughness: 0.70, metalness: 0.06, opacity: 1,
    mapKind: 'oak',
    thumbnail: thumbnailSwatch(0x8d6e63, 'oak')
  },
  {
    id: 'door.walnut', label: 'Nogal',
    color: 0x4e342e, roughness: 0.66, metalness: 0.07, opacity: 1,
    mapKind: 'walnut',
    thumbnail: thumbnailSwatch(0x4e342e, 'walnut')
  },
  {
    id: 'door.paint-white', label: 'Blanca lacada',
    color: 0xf5f5f5, roughness: 0.30, metalness: 0.10, opacity: 1,
    mapKind: null,
    thumbnail: thumbnailSwatch(0xf5f5f5, null)
  },
  {
    id: 'door.paint-black', label: 'Negra',
    color: 0x212121, roughness: 0.42, metalness: 0.20, opacity: 1,
    mapKind: null,
    thumbnail: thumbnailSwatch(0x212121, null)
  },
  {
    id: 'door.metal', label: 'Metal',
    color: 0x9e9e9e, roughness: 0.25, metalness: 0.90, opacity: 1,
    mapKind: 'metal',
    thumbnail: thumbnailSwatch(0x9e9e9e, 'metal')
  },
  {
    id: 'door.aluminum', label: 'Aluminio',
    color: 0xe0e0e0, roughness: 0.20, metalness: 0.72, opacity: 1,
    mapKind: 'aluminum',
    thumbnail: thumbnailSwatch(0xe0e0e0, 'aluminum')
  },
  {
    id: 'door.glass-clear', label: 'Vidrio claro',
    color: 0xffffff, roughness: 0.05, metalness: 0.00, opacity: 0.60,
    mapKind: 'glass',
    thumbnail: thumbnailSwatch(0xcfdef2, 'glass')
  },
  {
    id: 'door.glass-frosted', label: 'Vidrio esmerilado',
    color: 0xe8f2f6, roughness: 0.45, metalness: 0.00, opacity: 0.72,
    mapKind: 'glass',
    thumbnail: thumbnailSwatch(0xe8f2f6, 'glass')
  },
  {
    id: 'door.cherry', label: 'Cerezo',
    color: 0x7b3f2e, roughness: 0.68, metalness: 0.06, opacity: 1,
    mapKind: 'wood-dark',
    thumbnail: thumbnailSwatch(0x7b3f2e, 'wood-dark')
  },
  {
    id: 'door.steel', label: 'Acero',
    color: 0xb0bec5, roughness: 0.22, metalness: 0.85, opacity: 1,
    mapKind: 'metal',
    thumbnail: thumbnailSwatch(0xb0bec5, 'metal')
  }
]

const BY_ID = new Map<DoorMaterialId, DoorMaterial>(DOOR_MATERIALS.map((m) => [m.id, m]))

export function getDoorMaterial(id: DoorMaterialId | string | null | undefined): DoorMaterial | undefined {
  return id != null ? BY_ID.get(id as DoorMaterialId) : undefined
}

/** Crea el `MeshStandardMaterial` de un material de puerta (hoja o marco). */
export function createDoorMaterial(id: DoorMaterialId | string | null): THREE.MeshStandardMaterial | null {
  const def = getDoorMaterial(id)
  if (!def) return null
  const m = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    opacity: def.opacity,
    transparent: def.opacity < 1,
    side: THREE.DoubleSide,
    depthWrite: def.opacity >= 1
  })
  m.name = def.id
  if (def.mapKind) {
    m.map = makeDoorMap(def.mapKind)!
    m.map.repeat.set(1 / 0.9, 1 / 0.9)
  }
  return m
}

const mapCache = new Map<string, THREE.Texture>()
function makeDoorMap(kind: DoorMaterial['mapKind']): THREE.Texture | null {
  if (!kind) return null
  const key = `door-${kind}`
  let tex = mapCache.get(key)
  if (!tex) {
    tex = canvasTexture((ctx, size) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      if (kind === 'wood-light') drawWoodGrain(ctx, size, '#c9a87a', 501)
      else if (kind === 'wood-dark') drawWoodGrain(ctx, size, '#7a523a', 502)
      else if (kind === 'oak') drawWoodGrain(ctx, size, '#a67c5b', 503)
      else if (kind === 'walnut') drawWoodGrain(ctx, size, '#5c4033', 504)
      else if (kind === 'metal') drawMetalBrushed(ctx, size, '#9e9e9e', 505)
      else if (kind === 'aluminum') drawMetalBrushed(ctx, size, '#e0e0e0', 506)
      else if (kind === 'glass') {
        ctx.fillStyle = '#b9d6ea'
        ctx.fillRect(0, 0, size, size)
        ctx.globalAlpha = 0.25
        const rand = seeded(507)
        for (let i = 0; i < 40; i++) {
          ctx.beginPath()
          ctx.arc(rand() * size, rand() * size, 1 + rand() * 3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    })
    mapCache.set(key, tex)
  }
  return tex
}

/** Miniatura SVG de un material de puerta (para la lista con buscador). */
export function doorThumbnail(id: DoorMaterialId | string | null): string {
  const def = getDoorMaterial(id)
  if (!def) return thumbnailSwatch(0xcccccc, null)
  return def.thumbnail
}

/** Etiqueta legible de un material de puerta. */
export function doorLabel(id: DoorMaterialId | string | null): string {
  const def = getDoorMaterial(id)
  return def ? def.label : (id ?? '—')
}

export default { DOOR_MATERIALS, getDoorMaterial, createDoorMaterial, doorThumbnail, doorLabel, DOOR_DEFAULTS }