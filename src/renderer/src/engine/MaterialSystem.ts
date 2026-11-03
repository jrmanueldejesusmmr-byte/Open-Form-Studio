import * as THREE from 'three'
import { disposePbrMaps, makeBumpTexture, makeNormalTexture, makeRoughnessTexture } from './PbrMaps'

/**
 * Motor de materiales PBR del editor (Fase 1).
 *
 * Diseño:
 *   - `MeshStandardMaterial` para todo (ladrillo, concreto, madera, teja…).
 *   - `MeshPhysicalMaterial` SOLO para el vidrio (transmisión + transparencia).
 *   - Las texturas NO se generan hasta que se usan por primera vez (lazy).
 *     Caché por tipo de textura y por calidad.
 *   - Tamaño máximo de generación: 512 (Baja), 1024 (Media), 2048 (Alta).
 *     Mipmaps siempre activadas; anisotropía moderada (8x).
 *   - UVs de Toda la geometría expresadas en **metros** (`applyMeterUVs`),
   *     de modo que `texture.repeat = 1 / tileMeters` repite las juntas del
 *     ladrillo con el mismo tamaño en un muro de 0.6 m o de 8 m.
 *   - `aoMap` y `roughnessMap` viven en un segundo set UV (`uv1`), reutilizando
 *     las coordenadas de `applyMeterUVs`. El resolvedor los enruta al material.
 *   - Calidad del motor: `baja` / `media` / `alta`, recordada y aplicable
 *     en caliente (sin reconstruir la escena).
 */

export type QualityLevel = 'baja' | 'media' | 'alta'

export const QUALITY_LEVELS: ReadonlyArray<QualityLevel> = ['baja', 'media', 'alta']

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta'
}

export const QUALITY_PRIORITY: ReadonlyArray<QualityLevel> = ['baja', 'media', 'alta']

/** Alias coherente con `material.ts` que importa `materialId` (mat.brick…). */
export type TextureKind =
  | 'brick'
  | 'wood'
  | 'concrete'
  | 'marble'
  | 'metalOre'
  | 'metalPot'
  | 'terracotta'
  | 'stucco'
  | 'stone'
  | 'ceramic'
  | 'grass'
  | 'gravel'
  | 'asphalt'
  | 'glass'
  | 'corrugated'

export interface MaterialDef {
  id: string
  label: string
  /** Tinte multiplicado sobre la textura (0xffffff = textura tal cual). */
  tint: number
  /** Roughness de sombra (0.0=espejo, 1.0=mat). Sobreescribe el base. */
  roughness: number
  /** Metalness 0.0..1.0. Sobreescribe el base. */
  metalness: number
  /** 1 = opaco; el vidrio usa < 1 con `transparent`. */
  opacity: number
  /** Metros reales que cubre una repetición de la textura. */
  tileMeters: number
  /** `null` = material sin textura (sólo color/opacity). */
  texture: TextureKind | null
  /** Normal map procedural (ladrillo, madera, piedra). `null` = sin normal. */
  normalMap: TextureKind | null
  /** Mapa de rugosidad (0=suave,1=ruidoso). `null` = usar roughness. */
  roughnessMap: TextureKind | null
  /** AO / sombreado ambiental (0=oscuro,1=brillo). `null` = no enrutado. */
  aoMap: TextureKind | null
  /** Si es true, se usa MeshPhysicalMaterial (transmisión/transparencia). */
  physical: boolean
}

export interface TextureState {
  kind: TextureKind
  /** Uno o dos: `['brick','ao']` para texturas duales. */
  sources: ReadonlyArray<TextureKind>
  targetSize: number
}

/** Mapa de tamaño de textura por calidad de motor. */
const QUALITY_TEXTURE_SIZE: Record<QualityLevel, number> = {
  baja: 512,
  media: 1024,
  alta: 2048
}

/** Mapa de texturas que se generan en pares (albedo + ao). */
const PAIR_KINDS: ReadonlyArray<TextureKind> = [
  'brick',
  'wood',
  'concrete',
  'marble',
  'metalOre',
  'metalPot',
  'terracotta',
  'stucco',
  'stone',
  'ceramic',
  'grass',
  'gravel',
  'asphalt',
  'glass',
  'corrugated'
]

/** Valor por defecto de calidad del motor (MEDIA = industria). */
let currentQuality: QualityLevel = 'media'

export function setQuality(level: QualityLevel): void {
  if (!QUALITY_PRIORITY.includes(level)) return
  if (currentQuality === level) return
  currentQuality = level
  // El tipo de material (p. ej. vidrio con/sin transmission) y los tamaños de
  // textura dependen de la calidad: invalidamos las cachés para que se regeneren
  // en caliente sin reiniciar la app.
  baseMaterialCache.forEach((material) => material.dispose())
  baseMaterialCache.clear()
  disposePbrMaps()
  textureCache.forEach((state) => {
    // Los canvas se liberan vaciando su tamaño (no tienen .dispose()).
    state.textures.forEach((canvas) => {
      canvas.width = 0
      canvas.height = 0
    })
  })
  textureCache.clear()
}

export function getQuality(): QualityLevel {
  return currentQuality
}

/** `true` si la calidad terminal de este material puede tener normal/AO. */
function isQualityEnabled(level: QualityLevel): boolean {
  return level !== 'baja'
}

/**
 * Devuelve la textura procedural (o `null`). Se genera solo la primera vez.
 * `-1` = tamaño fijo por tipo (nunca escala con la calidad).
 */
export function getTexture(kind: TextureKind, overrideSize: number = -1): THREE.Texture {
  const targetSize = overrideSize > 0 ? overrideSize : QUALITY_TEXTURE_SIZE[currentQuality]
  const key = `${kind}-${targetSize}`
  let state: GeneratedTextureState | undefined = textureCache.get(key)
  if (!state) {
    state = { kind, targetSize, textures: [] }
    textureCache.set(key, state)
    generateTexture(kind, targetSize)
  }
  const tex = new THREE.CanvasTexture(state.textures[0])
  // Albedo = color: sRGB explícito (three ≥ r152 ya no lo asume) y
  // RepeatWrapping para que `repeat = 1 / tileMeters` tile de verdad.
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * AO real de un tipo (canvas[1] del par albedo+AO) o `null` si el tipo no
 * genera par. En su día se enrutaba el albedo como AO, lo que atenuaba la
 * escena con el tinte de la textura en vez de con la oclusión.
 */
export function getAoTexture(kind: TextureKind): THREE.Texture | null {
  if (!isQualityEnabled(currentQuality)) return null
  const size = QUALITY_TEXTURE_SIZE[currentQuality]
  const key = `${kind}-${size}`
  if (!textureCache.has(key)) {
    textureCache.set(key, { kind, targetSize: size, textures: [] })
    generateTexture(kind, size)
  }
  const canvas = textureCache.get(key)?.textures[1]
  if (!canvas) return null
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function getDualTexture(aoKind: TextureKind, overrides: { targetSize: number }): { albedo: THREE.Texture; ao: THREE.Texture } | null {
  if (!isQualityEnabled(currentQuality)) return null
  const targetSize = overrides.targetSize > 0 ? overrides.targetSize : QUALITY_TEXTURE_SIZE[currentQuality]
  const key = `${aoKind}-pair-${targetSize}`
  let state: GeneratedTextureState | undefined = textureCache.get(key)
  if (!state) {
    state = { kind: aoKind, targetSize, textures: [] }
    textureCache.set(key, state)
    generateTexture(aoKind, targetSize)
  }
  return state.textures[0]
    ? { albedo: new THREE.CanvasTexture(state.textures[0]), ao: new THREE.CanvasTexture(state.textures[1]) }
    : null
}

/** Estado de una textura generada (albedo principal + secundarias opcionales). */

interface GeneratedTextureState {
  kind: TextureKind
  targetSize: number
  textures: HTMLCanvasElement[]
}

const textureCache = new Map<string, GeneratedTextureState>()

/* -------------------------------------------------------------------------- */
/* Generación procedural (canvas 2D, sin almacenamiento externo, determinista)*/
/* -------------------------------------------------------------------------- */

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No hay contexto 2D para la generación de texturas.')
  return { canvas, ctx }
}

/** PRNG determinista: el mismo ruido saldrá en cada arranque. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

function fillNoise(ctx: CanvasRenderingContext2D, size: number, seed: number, weight: number): void {
  const rand = seeded(seed)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  for (let i = 0; i < 600; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 2.5
    const a = 0.06 * weight + rand() * 0.10 * weight
    ctx.fillStyle = `rgba(0,0,0,${a})`
    ctx.fillRect(x, y, r, r)
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, size: number): void {
  const rows = 8
  const cols = 4
  const bh = size / rows
  const bw = size / cols
  const mortar = Math.max(2, size * 0.015)
  // Fondo de mortero de cemento / arena
  ctx.fillStyle = '#cfc9be'
  ctx.fillRect(0, 0, size, size)
  fillNoise(ctx, size, 5, 0.4)

  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : bw / 2
    for (let c = -1; c <= cols + 1; c++) {
      const x = c * bw + offset + mortar * 0.5
      const y = r * bh + mortar * 0.5
      const w = bw - mortar
      const h = bh - mortar

      // Sombra determinista por posición **envuelta**: el ladrillo que cruza
      // el borde (filas impares) se pinta dos veces y debe llevar el mismo
      // tono en ambos extremos, o la textura se «corta» al repetir.
      const wx = ((Math.round(x) % size) + size) % size
      const shade = 0.85 + seeded(wx * 131 + r * 31 + 7)() * 0.28
      const rCol = Math.min(255, Math.round(0xb8 * shade))
      const gCol = Math.min(255, Math.round(0x56 * shade))
      const bCol = Math.min(255, Math.round(0x3e * shade))
      ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`
      ctx.fillRect(x, y, w, h)

      // Micro bisel y relieve en los bordes del ladrillo
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(x, y + h - 1.5, w, 1.5)
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(x, y, w, 1.2)
    }
  }
}

function drawWood(ctx: CanvasRenderingContext2D, size: number): void {
  // 8 tablas (duelas) en 1 metro -> ~12.5 cm de ancho por tabla
  const planks = 8
  const pw = size / planks
  const rand = seeded(29)
  ctx.fillStyle = '#8a5834'
  ctx.fillRect(0, 0, size, size)

  for (let p = 0; p < planks; p++) {
    const shade = 0.88 + rand() * 0.24
    const rCol = Math.min(255, Math.round(0xaa * shade))
    const gCol = Math.min(255, Math.round(0x73 * shade))
    const bCol = Math.min(255, Math.round(0x45 * shade))
    ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`
    ctx.fillRect(p * pw, 0, pw, size)

    // Vetas longitudinales continuas
    ctx.strokeStyle = `rgba(70,42,20,${0.25 + rand() * 0.20})`
    ctx.lineWidth = 1.0
    for (let g = 0; g < 6; g++) {
      const gx = p * pw + 4 + rand() * (pw - 8)
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      ctx.bezierCurveTo(
        gx + (rand() - 0.5) * 8, size * 0.33,
        gx + (rand() - 0.5) * 8, size * 0.67,
        gx, size
      )
      ctx.stroke()
    }

    // Bisel / junta oscura entre tablas de piso
    ctx.fillStyle = 'rgba(35,20,10,0.85)'
    ctx.fillRect(p * pw, 0, 1.5, size)
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(p * pw + 1.5, 0, 1.0, size)
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#b9b7b2'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(23)
  for (let i = 0; i < 1200; i++) {
    const v = rand()
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,60,60,0.14)'
    const s = 1 + rand() * 2.5
    ctx.fillRect(rand() * size, rand() * size, s, s)
  }
  for (let i = 0; i < 18; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 30 + rand() * 80
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(140,138,134,0.18)')
    grad.addColorStop(1, 'rgba(140,138,134,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

function drawMarble(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#eceae6'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(31)
  // Vetas grises suaves y curvadas.
  ctx.lineCap = 'round'
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = `rgba(110,114,120,${0.12 + rand() * 0.30})`
    ctx.lineWidth = 0.8 + rand() * 2.6
    let x = rand() * size
    let y = rand() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let s = 0; s < 5; s++) {
      x += (rand() - 0.5) * size * 0.6
      y += (rand() - 0.5) * size * 0.6
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

function drawMetalOre(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#7e848c'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(41)
  for (let i = 0; i < 300; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 4 + rand() * 18
    const a = 0.12 + rand() * 0.25
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawMetalPot(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#6b7178'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(53)
  for (let i = 0; i < 160; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 2 + rand() * 10
    const a = 0.10 + rand() * 0.20
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // Línea de himbre/hilura simulada.
  ctx.strokeStyle = 'rgba(120,124,130,0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const y = 0.2 + rand() * 0.6
    ctx.beginPath()
    ctx.moveTo(0, y * size)
    ctx.lineTo(size, y * size)
    ctx.stroke()
  }
}

function drawTerracotta(ctx: CanvasRenderingContext2D, size: number): void {
  // Teja curva de barro cocido: ~35-40 cm de largo (3 filas) x ~24 cm de ancho (5 columnas)
  const rows = 3
  const cols = 5
  const bh = size / rows
  const bw = size / cols
  const rand = seeded(43)

  ctx.fillStyle = '#2d180d'
  ctx.fillRect(0, 0, size, size)

  for (let r = 0; r < rows; r++) {
    const y = r * bh
    const rowOffset = (r % 2 === 0) ? 0 : bw * 0.5

    for (let c = -1; c <= cols + 1; c++) {
      const x = c * bw + rowOffset
      const tileRand = rand()
      const baseR = Math.round(185 + tileRand * 25)
      const baseG = Math.round(85 + tileRand * 25)
      const baseB = Math.round(48 + tileRand * 18)

      // Gradiente cilíndrico de la teja curva (de sombra en canal a lomo iluminado)
      const grad = ctx.createLinearGradient(x, 0, x + bw, 0)
      grad.addColorStop(0, `rgb(${Math.round(baseR * 0.55)},${Math.round(baseG * 0.55)},${Math.round(baseB * 0.55)})`)
      grad.addColorStop(0.25, `rgb(${Math.round(baseR * 0.75)},${Math.round(baseG * 0.75)},${Math.round(baseB * 0.75)})`)
      grad.addColorStop(0.55, `rgb(${Math.min(255, Math.round(baseR * 1.15))},${Math.min(255, Math.round(baseG * 1.15))},${Math.min(255, Math.round(baseB * 1.15))})`)
      grad.addColorStop(0.85, `rgb(${baseR},${baseG},${baseB})`)
      grad.addColorStop(1.0, `rgb(${Math.round(baseR * 0.5)},${Math.round(baseG * 0.5)},${Math.round(baseB * 0.5)})`)

      ctx.fillStyle = grad
      ctx.fillRect(x, y + 4, bw - 2, bh - 6)

      // Sombra proyectada del solape de la hilera superior sobre la inferior
      const shadowGrad = ctx.createLinearGradient(0, y, 0, y + bh * 0.28)
      shadowGrad.addColorStop(0, 'rgba(20,10,5,0.75)')
      shadowGrad.addColorStop(1, 'rgba(20,10,5,0.0)')
      ctx.fillStyle = shadowGrad
      ctx.fillRect(x, y, bw, bh * 0.28)

      // Canto inferior redondeado de la teja
      ctx.fillStyle = 'rgba(255,230,200,0.22)'
      ctx.fillRect(x, y + bh - 4, bw - 2, 1.8)
    }
  }
}

/** Textura rosa/blanco de estuco: fondo claro con relieve suave. */
function drawStucco(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#f2ece2'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(83)
  ctx.lineCap = 'round'
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = `rgba(130,124,112,${0.10 + rand() * 0.28})`
    ctx.lineWidth = 0.7 + rand() * 2.4
    let x = rand() * size
    let y = rand() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let s = 0; s < 5; s++) {
      x += (rand() - 0.5) * size * 0.6
      y += (rand() - 0.5) * size * 0.6
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  fillNoise(ctx, size, 97, 0.9)
}

/** Textura de piedra: bloques irregulares de mampostería. */
function drawStone(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#8e8b84'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(101)
  for (let i = 0; i < 24; i++) {
    const x = rand() * size
    const y = rand() * size
    const w = 40 + rand() * 80
    const h = 30 + rand() * 60
    const shade = 0.75 + rand() * 0.45
    ctx.fillStyle = `rgb(${Math.round(140 * shade)},${Math.round(136 * shade)},${Math.round(128 * shade)})`
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = 'rgba(40,36,32,0.45)'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)
  }
  fillNoise(ctx, size, 109, 0.7)
}

/** Textura de cerámica: baldosas de 25x25 cm con junta y esmalte. */
function drawCeramic(ctx: CanvasRenderingContext2D, size: number): void {
  const cols = 4
  const rows = 4
  const bw = size / cols
  const bh = size / rows
  const grout = Math.max(1.5, size * 0.012)

  ctx.fillStyle = '#b5afa6'
  ctx.fillRect(0, 0, size, size)

  const rand = seeded(113)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shade = 0.94 + rand() * 0.12
      const rr = Math.min(255, Math.round(232 * shade))
      const gg = Math.min(255, Math.round(230 * shade))
      const bb = Math.min(255, Math.round(225 * shade))
      ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`
      ctx.fillRect(c * bw + grout, r * bh + grout, bw - grout * 2, bh - grout * 2)

      // Reflejo esmaltado
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(c * bw + grout, r * bh + grout, bw - grout * 2, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      ctx.fillRect(c * bw + grout, (r + 1) * bh - grout - 2, bw - grout * 2, 2)
    }
  }
}

/** Lámina acanalada / corrugada galvanizada (~10 cm por onda). */
function drawCorrugated(ctx: CanvasRenderingContext2D, size: number): void {
  const waves = 10
  const ww = size / waves

  ctx.fillStyle = '#7a828a'
  ctx.fillRect(0, 0, size, size)

  for (let w = 0; w < waves; w++) {
    const x = w * ww
    const grad = ctx.createLinearGradient(x, 0, x + ww, 0)
    grad.addColorStop(0, '#50565e')
    grad.addColorStop(0.3, '#8b949e')
    grad.addColorStop(0.5, '#cdd4dc')
    grad.addColorStop(0.7, '#858e98')
    grad.addColorStop(1, '#474d54')
    ctx.fillStyle = grad
    ctx.fillRect(x, 0, ww, size)
  }
  fillNoise(ctx, size, 77, 0.25)
}

/** Pasto: hojas verdes en un fondo. */
function drawGrass(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#7d9b4a'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(149)
  for (let i = 0; i < 400; i++) {
    const x = rand() * size
    const y = rand() * size
    const h = 8 + rand() * 22
    const w = 1 + rand() * 3
    const shade = 0.70 + rand() * 0.40
    ctx.fillStyle = `rgb(${Math.round(120 * shade)},${Math.round(150 * shade)},${Math.round(60 * shade)})`
    ctx.fillRect(x, y, w, h)
  }
}

/** Grava: piedras pequeñas sobre arena. */
function drawGravel(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#c2bab4'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(157)
  for (let i = 0; i < 700; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 4
    const shade = 0.80 + rand() * 0.30
    ctx.fillStyle = `rgb(${Math.round(190 * shade)},${Math.round(184 * shade)},${Math.round(176 * shade)})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Asfalto: gris oscuro con textura irregular. */
function drawAsphalt(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#4a4540'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(167)
  for (let i = 0; i < 1500; i++) {
    const v = rand()
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'
    const s = 1 + rand() * 2
    ctx.fillRect(rand() * size, rand() * size, s, s)
  }
}

/** Vidrio transparente: transmisión suave con brillo interno. */
function drawGlass(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#d7ecf5'
  ctx.fillRect(0, 0, size, size)
  ctx.globalAlpha = 0.35
  const rand = seeded(317)
  for (let i = 0; i < 60; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 4
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawBase(kind: TextureKind, size: number): ((ctx: CanvasRenderingContext2D, size: number) => void) | void {
  switch (kind) {
    case 'brick': return drawBrick
    case 'wood': return drawWood
    case 'concrete': return drawConcrete
    case 'marble': return drawMarble
    case 'metalOre': return drawMetalOre
    case 'metalPot': return drawMetalPot
    case 'terracotta': return drawTerracotta
    case 'stucco': return drawStucco
    case 'stone': return drawStone
    case 'ceramic': return drawCeramic
    case 'grass': return drawGrass
    case 'gravel': return drawGravel
    case 'asphalt': return drawAsphalt
    case 'glass': return drawGlass
    case 'corrugated': return drawCorrugated
  }
  return drawBrick
}

/** Pinta el mapa de Ambient Occlusion (AO) alineado con las juntas/ranuras reales de cada material. */
function drawAmbientOcclusion(kind: TextureKind, aoCtx: CanvasRenderingContext2D, targetSize: number): void {
  aoCtx.fillStyle = '#ffffff'
  aoCtx.fillRect(0, 0, targetSize, targetSize)

  if (kind === 'brick') {
    const rows = 8
    const cols = 4
    const bh = targetSize / rows
    const bw = targetSize / cols
    const mortar = Math.max(2, targetSize * 0.018)
    // Mortero con oclusión ambiental marcada en las juntas
    aoCtx.fillStyle = '#5c5650'
    aoCtx.fillRect(0, 0, targetSize, targetSize)
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : bw / 2
      for (let c = -1; c <= cols + 1; c++) {
        const x = c * bw + offset + mortar * 0.5
        const y = r * bh + mortar * 0.5
        const w = bw - mortar
        const h = bh - mortar
        aoCtx.fillStyle = '#d4cfc8'
        aoCtx.fillRect(x, y, w, h)
        const inset = Math.max(1.5, targetSize * 0.004)
        aoCtx.fillStyle = '#ffffff'
        aoCtx.fillRect(x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2))
      }
    }
    fillNoise(aoCtx, targetSize, 601, 0.35)
    return
  }

  if (kind === 'wood') {
    const planks = 8
    const pw = targetSize / planks
    aoCtx.fillStyle = '#4a3f36'
    aoCtx.fillRect(0, 0, targetSize, targetSize)
    for (let p = 0; p < planks; p++) {
      aoCtx.fillStyle = '#ffffff'
      aoCtx.fillRect(p * pw + 2, 0, pw - 3, targetSize)
    }
    fillNoise(aoCtx, targetSize, 607, 0.25)
    return
  }

  if (kind === 'terracotta') {
    const rows = 3
    const cols = 5
    const bh = targetSize / rows
    const bw = targetSize / cols
    aoCtx.fillStyle = '#483b34'
    aoCtx.fillRect(0, 0, targetSize, targetSize)
    for (let r = 0; r < rows; r++) {
      const y = r * bh
      const rowOffset = r % 2 === 0 ? 0 : bw * 0.5
      for (let c = -1; c <= cols + 1; c++) {
        const x = c * bw + rowOffset
        const grad = aoCtx.createLinearGradient(x, 0, x + bw, 0)
        grad.addColorStop(0, '#5a4d44')
        grad.addColorStop(0.22, '#d8d2cc')
        grad.addColorStop(0.5, '#ffffff')
        grad.addColorStop(0.78, '#d8d2cc')
        grad.addColorStop(1, '#52463e')
        aoCtx.fillStyle = grad
        aoCtx.fillRect(x + 1, y + 3, bw - 2, bh - 4)
      }
    }
    return
  }

  if (kind === 'ceramic') {
    const tiles = 4
    const tw = targetSize / tiles
    const grout = Math.max(1.5, targetSize * 0.012)
    aoCtx.fillStyle = '#6e6a64'
    aoCtx.fillRect(0, 0, targetSize, targetSize)
    for (let r = 0; r < tiles; r++) {
      for (let c = 0; c < tiles; c++) {
        aoCtx.fillStyle = '#ffffff'
        aoCtx.fillRect(c * tw + grout, r * tw + grout, tw - grout * 2, tw - grout * 2)
      }
    }
    return
  }

  fillNoise(aoCtx, targetSize, 703 + ((kind.charCodeAt(0) * 31 + kind.length) % 199), 0.65)
}

/** Genera una o dos texturas (albedo + ao) y las guarda en `state.textures`. */
export function generateTexture(kind: TextureKind, targetSize: number): void {
  const canvas = createCanvas(targetSize)
  const ctx = canvas.ctx

  if (PAIR_KINDS.includes(kind)) {
    const draw = drawBase(kind, targetSize)
    if (draw) draw(ctx, targetSize)
    const ao = createCanvas(targetSize)
    drawAmbientOcclusion(kind, ao.ctx, targetSize)
    const state = textureCache.get(`${kind}-${targetSize}`)
    if (state) state.textures = [canvas.canvas, ao.canvas]
  } else {
    const draw = drawBase(kind, targetSize)
    if (draw) draw(ctx, targetSize)
    const state = textureCache.get(`${kind}-${targetSize}`)
    if (state) state.textures = [canvas.canvas]
  }
}

/* -------------------------------------------------------------------------- */
/* Materiales (base cacheado + clon por malla)                                */
/* -------------------------------------------------------------------------- */

/**
 * Construye el material base de un `MaterialDef` (cacheado por `def.id`).
 * Termina en `MeshStandardMaterial` o `MeshPhysicalMaterial` según el flag.
 */
export function buildBaseMaterial(def: MaterialDef): THREE.MeshStandardMaterial {
  const isGlass = def.opacity < 1
  const useTransmission = def.physical && isGlass && getQuality() !== 'baja'
  const material = useTransmission
    ? new THREE.MeshPhysicalMaterial({
        color: def.tint,
        roughness: def.roughness,
        metalness: def.metalness,
        opacity: def.opacity,
        side: THREE.DoubleSide,
        transparent: isGlass,
        depthWrite: !isGlass,
        transmission: isGlass ? 0.9 : 0,
        ior: 1.5,
        reflectivity: 0.9,
        roughnessMap: null,
        metalnessMap: null,
        normalMap: null,
        aoMap: null,
        envMap: null
      })
    : new THREE.MeshStandardMaterial({
        color: def.tint,
        roughness: def.roughness,
        metalness: def.metalness,
        side: THREE.DoubleSide,
        transparent: isGlass,
        depthWrite: !isGlass
      })

  if (def.opacity < 1) {
    material.opacity = def.opacity
  }

  // El nombre del material lleva su id de catálogo: los exportadores (MTL,
  // OBJ) lo usan para nombrar cada material del archivo.
  material.name = def.id

  if (def.texture) {
    const tex = getTexture(def.texture)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 8
    tex.repeat.set(1 / def.tileMeters, 1 / def.tileMeters)
    material.map = tex
  }

  // Normal / Bump / AO / Roughness: enrutados en calidad Media y Alta.
  if (isQualityEnabled(currentQuality)) {
    const mapSize = QUALITY_TEXTURE_SIZE[currentQuality]
    if (def.normalMap) {
      const tex = makeNormalTexture(def.normalMap, mapSize)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(1 / def.tileMeters, 1 / def.tileMeters)
      material.normalMap = tex
      material.normalScale.set(1.85, 1.85)

      const bump = makeBumpTexture(def.normalMap, mapSize)
      bump.wrapS = THREE.RepeatWrapping
      bump.wrapT = THREE.RepeatWrapping
      bump.repeat.set(1 / def.tileMeters, 1 / def.tileMeters)
      material.bumpMap = bump
      material.bumpScale = 0.035
    }
    if (def.aoMap) {
      const ao = getAoTexture(def.aoMap)
      if (ao) {
        ao.wrapS = THREE.RepeatWrapping
        ao.wrapT = THREE.RepeatWrapping
        ao.repeat.set(1 / def.tileMeters, 1 / def.tileMeters)
        material.aoMap = ao
        material.aoMapIntensity = 0.75
      }
    }
    if (def.roughnessMap) {
      const tex = makeRoughnessTexture(def.roughnessMap, mapSize)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(1 / def.tileMeters, 1 / def.tileMeters)
      material.roughnessMap = tex
    }
  }

  return material
}

/** Cache de materiales base por id de catálogo. */
const baseMaterialCache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * Material listo para una malla: clona el base cacheado por id (el `map` se
 * compartido por referencia, el clone es barato). Cada malla tiene su propio
 * material para teñir la selección sin afectar a las demás. Devuelve
 * `MeshStandardMaterial` (o `MeshPhysicalMaterial` que hereda de él), así que
 * el consumidor puede asignar `.color` directamente.
 */
export function createMeshMaterial(defId: string | null | undefined): THREE.MeshStandardMaterial | null {
  const def = getMaterialDef(defId)
  if (!def) return null

  let base = baseMaterialCache.get(def.id)
  if (!base) {
    base = buildBaseMaterial(def)
    baseMaterialCache.set(def.id, base)
  }
  return base.clone()
}

/** Libera la biblioteca de materiales y texturas cacheadas. */
export function disposeMaterialLibrary(): void {
  baseMaterialCache.forEach((material) => material.dispose())
  baseMaterialCache.clear()
  disposePbrMaps()
  textureCache.forEach((state) => {
    state.textures.forEach((canvas) => {
      if (canvas instanceof HTMLCanvasElement) {
        canvas.width = 0
        canvas.height = 0
      }
    })
  })
  textureCache.clear()
}

/** Definición de material por id de catálogo; `null` si no existe.
 *
 * Devuelve la definición **ya resuelta**: si el usuario editó el material en
 * la paleta (edición rápida), se le aplican los overrides persistentes de la
 * sesión (`setMaterialOverride`) encima de la definición base.
 */
export function getMaterialDef(id?: string | null): MaterialDef | null {
  if (!id) return null
  const def = MATERIAL_DEFS[id]
  if (!def) return null
  const override = materialOverrides.get(id)
  return override ? { ...def, ...override } : def
}

/* -------------------------------------------------------------------------- */
/* Overrides por material (edición rápida de la paleta)                       */
/* -------------------------------------------------------------------------- */

/** Parches aplicados encima de un `MaterialDef` base (por id). */
const materialOverrides = new Map<string, Partial<MaterialDef>>()

/**
 * Aplica (o limpia con `null`) un override sobre un material del catálogo.
 * Invalida el material base cacheado para que el cambio se refleje al
 * reconstruir las mallas. El catálogo (`MATERIAL_DEFS`) no se toca: los
 * overrides son estado del usuario, no del catálogo.
 */
export function setMaterialOverride(defId: string, patch: Partial<MaterialDef> | null): void {
  if (!MATERIAL_DEFS[defId]) return
  if (patch === null) {
    materialOverrides.delete(defId)
  } else {
    const merged = { ...(materialOverrides.get(defId) ?? {}), ...patch }
    // `id` no se deja sobreescribir: rompería la clave de la caché.
    delete merged.id
    materialOverrides.set(defId, merged)
  }
  const base = baseMaterialCache.get(defId)
  if (base) {
    base.dispose()
    baseMaterialCache.delete(defId)
  }
}

/** Override vigente de un material; `null` si no se ha editado. */
export function getMaterialOverride(defId: string): Partial<MaterialDef> | null {
  return materialOverrides.get(defId) ?? null
}

/** Todos los overrides vigentes (para persistirlos con el proyecto). */
export function listMaterialOverrides(): Record<string, Partial<MaterialDef>> {
  const out: Record<string, Partial<MaterialDef>> = {}
  for (const [id, patch] of materialOverrides) out[id] = patch
  return out
}

/** Color base con el que pintar una malla; `fallback` si no hay material. */
export function materialTint(defId: string | null | undefined, fallback: number): number {
  return getMaterialDef(defId)?.tint ?? fallback
}

/**
 * UVs planares por cara en metros: proyecta cada vértice en el plano de su
 * normal dominante (tri-proyección). Así una textura con `tileMeters = 1`
 * repite juntas del mismo tamaño en muros, muebles, perfiles y cubiertas.
 */
export function applyMeterUVs(geometry: THREE.BufferGeometry): void {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(position.count * 2)

  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i)
    const py = position.getY(i)
    const pz = position.getZ(i)

    const nx = normal.getX(i)
    const ny = normal.getY(i)
    const nz = normal.getZ(i)

    const horizLenSq = nx * nx + nz * nz
    if (horizLenSq < 1e-4) {
      // Plano horizontal puro (suelo, piso, losa)
      uv[i * 2] = px
      uv[i * 2 + 1] = pz
    } else {
      const len = Math.sqrt(horizLenSq)
      // Vector U: horizontal paralelo al plano (eje de longitud del muro / alero del techo)
      const ux = -nz / len
      const uz = nx / len

      // Vector V: a lo largo de la pendiente o altura (hacia arriba en la cara)
      const vx = (-ny * nx) / len
      const vy = len
      const vz = (-ny * nz) / len

      uv[i * 2] = px * ux + pz * uz
      uv[i * 2 + 1] = px * vx + py * vy + pz * vz
    }
  }
  const uvAttr = new THREE.BufferAttribute(uv, 2)
  geometry.setAttribute('uv', uvAttr)
  geometry.setAttribute('uv1', uvAttr)
  geometry.setAttribute('uv2', uvAttr)
}

/** Estado cacheado de la generación de una textura (usado por `getTextureState`). */
export function getTextureState(kind: TextureKind): GeneratedTextureState | null {
  const key = `${kind}-${QUALITY_TEXTURE_SIZE[currentQuality]}`
  return textureCache.get(key) ?? null
}

/** Entrada de exportación de una textura procedural del proyecto. */
export interface ExportedTexture {
  kind: TextureKind
  size: number
  /** Data-URL listo para descargar o volver a importar. */
  dataUrl: string
}

/**
 * Exporta las texturas procedurales del catálogo (albedo + AO si existe) a
 * data-URLs. Genera al tamaño de la calidad actual sólo lo que falte; lo que ya
 * esté cacheado se reutiliza. Pensado para el botón «Exportar» de la paleta
 * de materiales y para respaldos del proyecto.
 */
export function exportProjectTextures(kinds?: ReadonlyArray<TextureKind>): ExportedTexture[] {
  const wanted: ReadonlyArray<TextureKind> = kinds && kinds.length ? kinds : PAIR_KINDS
  const out: ExportedTexture[] = []
  const size = QUALITY_TEXTURE_SIZE[currentQuality]
  for (const kind of wanted) {
    const key = `${kind}-${size}`
    if (!textureCache.has(key)) {
      textureCache.set(key, { kind, targetSize: size, textures: [] })
      generateTexture(kind, size)
    }
    const state = textureCache.get(key)
    if (!state || !state.textures[0]) continue
    out.push({ kind, size, dataUrl: state.textures[0].toDataURL('image/png') })
    if (state.textures[1]) out.push({ kind, size, dataUrl: state.textures[1].toDataURL('image/png') })
  }
  return out
}

/** Array de `MaterialDef` del catálogo con mapas PBR completos (map, normalMap, roughnessMap, aoMap). */
export const MATERIAL_DEFS: Record<string, MaterialDef> = {
  /* Ladrillo */
  'mat.brick': { id: 'mat.brick', label: 'Ladrillo rojo', tint: 0xffffff, roughness: 0.88, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'brick', normalMap: 'brick', roughnessMap: 'brick', aoMap: 'brick', physical: false },
  'mat.brick-old': { id: 'mat.brick-old', label: 'Ladrillo rústico', tint: 0xd8b8a0, roughness: 0.92, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'brick', normalMap: 'brick', roughnessMap: 'brick', aoMap: 'brick', physical: false },
  'mat.brick-painted': { id: 'mat.brick-painted', label: 'Ladrillo blanco', tint: 0xf2eee6, roughness: 0.84, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'brick', normalMap: 'brick', roughnessMap: 'brick', aoMap: 'brick', physical: false },

  /* Concreto */
  'mat.concrete': { id: 'mat.concrete', label: 'Concreto gris', tint: 0xffffff, roughness: 0.86, metalness: 0.0, opacity: 1, tileMeters: 2, texture: 'concrete', normalMap: 'concrete', roughnessMap: 'concrete', aoMap: 'concrete', physical: false },
  'mat.concrete-dark': { id: 'mat.concrete-dark', label: 'Concreto oscuro', tint: 0x82858a, roughness: 0.88, metalness: 0.0, opacity: 1, tileMeters: 2, texture: 'concrete', normalMap: 'concrete', roughnessMap: 'concrete', aoMap: 'concrete', physical: false },
  'mat.concrete-smooth': { id: 'mat.concrete-smooth', label: 'Concreto pulido', tint: 0xe8e8e6, roughness: 0.36, metalness: 0.06, opacity: 1, tileMeters: 2, texture: 'concrete', normalMap: 'concrete', roughnessMap: 'concrete', aoMap: 'concrete', physical: false },

  /* Estuco */
  'mat.stucco': { id: 'mat.stucco', label: 'Estuco fino', tint: 0xf6f2ea, roughness: 0.82, metalness: 0.0, opacity: 1, tileMeters: 2, texture: 'stucco', normalMap: 'stucco', roughnessMap: 'stucco', aoMap: 'stucco', physical: false },
  'mat.plaster': { id: 'mat.plaster', label: 'Yeso liso', tint: 0xf8f6f0, roughness: 0.72, metalness: 0.0, opacity: 1, tileMeters: 2, texture: null, normalMap: null, roughnessMap: null, aoMap: null, physical: false },

  /* Piedra */
  'mat.stone': { id: 'mat.stone', label: 'Piedra mampostería', tint: 0xffffff, roughness: 0.90, metalness: 0.0, opacity: 1, tileMeters: 1.5, texture: 'stone', normalMap: 'stone', roughnessMap: 'stone', aoMap: 'stone', physical: false },
  'mat.marble': { id: 'mat.marble', label: 'Mármol blanco', tint: 0xffffff, roughness: 0.22, metalness: 0.05, opacity: 1, tileMeters: 2, texture: 'marble', normalMap: 'marble', roughnessMap: 'marble', aoMap: 'marble', physical: false },
  'mat.marble-dark': { id: 'mat.marble-dark', label: 'Mármol negro', tint: 0x484850, roughness: 0.20, metalness: 0.05, opacity: 1, tileMeters: 2, texture: 'marble', normalMap: 'marble', roughnessMap: 'marble', aoMap: 'marble', physical: false },
  'mat.marble-cream': { id: 'mat.marble-cream', label: 'Mármol crema', tint: 0xf2e4ce, roughness: 0.25, metalness: 0.05, opacity: 1, tileMeters: 2, texture: 'marble', normalMap: 'marble', roughnessMap: 'marble', aoMap: 'marble', physical: false },

  /* Madera */
  'mat.wood': { id: 'mat.wood', label: 'Madera natural', tint: 0xffffff, roughness: 0.62, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'wood', normalMap: 'wood', roughnessMap: 'wood', aoMap: 'wood', physical: false },
  'mat.oak': { id: 'mat.oak', label: 'Roble americano', tint: 0xe8c698, roughness: 0.58, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'wood', normalMap: 'wood', roughnessMap: 'wood', aoMap: 'wood', physical: false },
  'mat.walnut': { id: 'mat.walnut', label: 'Nogal oscuro', tint: 0x825e3e, roughness: 0.55, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'wood', normalMap: 'wood', roughnessMap: 'wood', aoMap: 'wood', physical: false },
  'mat.pine': { id: 'mat.pine', label: 'Pino claro', tint: 0xf5dfb5, roughness: 0.65, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'wood', normalMap: 'wood', roughnessMap: 'wood', aoMap: 'wood', physical: false },

  /* Cerámica */
  'mat.ceramic': { id: 'mat.ceramic', label: 'Baldosa cerámica', tint: 0xffffff, roughness: 0.24, metalness: 0.04, opacity: 1, tileMeters: 1, texture: 'ceramic', normalMap: 'ceramic', roughnessMap: 'ceramic', aoMap: 'ceramic', physical: false },
  'mat.ceramic-terracotta': { id: 'mat.ceramic-terracotta', label: 'Baldosa barro cocido', tint: 0xd87a48, roughness: 0.72, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'ceramic', normalMap: 'ceramic', roughnessMap: 'ceramic', aoMap: 'ceramic', physical: false },

  /* Teja */
  'mat.terracotta': { id: 'mat.terracotta', label: 'Teja curva de barro', tint: 0xffffff, roughness: 0.78, metalness: 0.0, opacity: 1, tileMeters: 1.2, texture: 'terracotta', normalMap: 'terracotta', roughnessMap: 'terracotta', aoMap: 'terracotta', physical: false },
  'mat.terracotta-old': { id: 'mat.terracotta-old', label: 'Teja envejecida', tint: 0xd09470, roughness: 0.86, metalness: 0.0, opacity: 1, tileMeters: 1.2, texture: 'terracotta', normalMap: 'terracotta', roughnessMap: 'terracotta', aoMap: 'terracotta', physical: false },
  'mat.roof-slate': { id: 'mat.roof-slate', label: 'Pizarra de tejado', tint: 0x5a6068, roughness: 0.66, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'stone', normalMap: 'stone', roughnessMap: 'stone', aoMap: 'stone', physical: false },

  /* Lámina */
  'mat.metal-corrugated': { id: 'mat.metal-corrugated', label: 'Lámina acanalada', tint: 0xffffff, roughness: 0.35, metalness: 0.85, opacity: 1, tileMeters: 1, texture: 'corrugated', normalMap: 'corrugated', roughnessMap: 'corrugated', aoMap: 'corrugated', physical: false },
  'mat.steel': { id: 'mat.steel', label: 'Chapa de acero', tint: 0xd8dce0, roughness: 0.28, metalness: 0.92, opacity: 1, tileMeters: 1, texture: 'metalPot', normalMap: 'metalPot', roughnessMap: 'metalPot', aoMap: 'metalPot', physical: false },
  'mat.copper': { id: 'mat.copper', label: 'Lámina de cobre', tint: 0xc8753a, roughness: 0.32, metalness: 0.88, opacity: 1, tileMeters: 1, texture: 'metalPot', normalMap: 'metalPot', roughnessMap: 'metalPot', aoMap: 'metalPot', physical: false },
  'mat.brass': { id: 'mat.brass', label: 'Lámina de latón', tint: 0xd8b54e, roughness: 0.30, metalness: 0.90, opacity: 1, tileMeters: 1, texture: 'metalPot', normalMap: 'metalPot', roughnessMap: 'metalPot', aoMap: 'metalPot', physical: false },
  'mat.metal-ore': { id: 'mat.metal-ore', label: 'Hierro forjado', tint: 0x555860, roughness: 0.60, metalness: 0.70, opacity: 1, tileMeters: 1, texture: 'metalOre', normalMap: 'metalOre', roughnessMap: 'metalOre', aoMap: 'metalOre', physical: false },
  'mat.metal-pot': { id: 'mat.metal-pot', label: 'Metal pulido', tint: 0xe0e3e8, roughness: 0.25, metalness: 0.88, opacity: 1, tileMeters: 1, texture: 'metalPot', normalMap: 'metalPot', roughnessMap: 'metalPot', aoMap: 'metalPot', physical: false },
  'mat.rust': { id: 'mat.rust', label: 'Chapa oxidada', tint: 0xa85828, roughness: 0.90, metalness: 0.35, opacity: 1, tileMeters: 1, texture: 'metalOre', normalMap: 'metalOre', roughnessMap: 'metalOre', aoMap: 'metalOre', physical: false },
  'mat.gold': { id: 'mat.gold', label: 'Lámina dorada', tint: 0xffd550, roughness: 0.20, metalness: 0.95, opacity: 1, tileMeters: 1, texture: 'metalPot', normalMap: 'metalPot', roughnessMap: 'metalPot', aoMap: 'metalPot', physical: false },

  /* Vidrio */
  'mat.glass': { id: 'mat.glass', label: 'Vidrio templado', tint: 0xe0f2fe, roughness: 0.05, metalness: 0.0, opacity: 0.35, tileMeters: 1, texture: null, normalMap: null, roughnessMap: null, aoMap: null, physical: true },
  'mat.glass-frosted': { id: 'mat.glass-frosted', label: 'Vidrio esmerilado', tint: 0xe8f2f6, roughness: 0.45, metalness: 0.0, opacity: 0.55, tileMeters: 1, texture: 'glass', normalMap: null, roughnessMap: null, aoMap: null, physical: true },
  'mat.glass-tinted': { id: 'mat.glass-tinted', label: 'Vidrio polarizado', tint: 0x485860, roughness: 0.08, metalness: 0.1, opacity: 0.40, tileMeters: 1, texture: null, normalMap: null, roughnessMap: null, aoMap: null, physical: true },

  /* Pintura */
  'mat.paint-white': { id: 'mat.paint-white', label: 'Pintura blanca', tint: 0xfafafa, roughness: 0.40, metalness: 0.0, opacity: 1, tileMeters: 2, texture: null, normalMap: null, roughnessMap: null, aoMap: null, physical: false },
  'mat.paint-gray': { id: 'mat.paint-gray', label: 'Pintura gris', tint: 0xb4b8be, roughness: 0.42, metalness: 0.0, opacity: 1, tileMeters: 2, texture: null, normalMap: null, roughnessMap: null, aoMap: null, physical: false },
  'mat.paint-warm': { id: 'mat.paint-warm', label: 'Pintura beige cálido', tint: 0xebe1d0, roughness: 0.42, metalness: 0.0, opacity: 1, tileMeters: 2, texture: null, normalMap: null, roughnessMap: null, aoMap: null, physical: false },

  /* Pasto */
  'mat.grass': { id: 'mat.grass', label: 'Césped natural', tint: 0xffffff, roughness: 0.94, metalness: 0.0, opacity: 1, tileMeters: 1.5, texture: 'grass', normalMap: 'grass', roughnessMap: 'grass', aoMap: 'grass', physical: false },

  /* Grava */
  'mat.gravel': { id: 'mat.gravel', label: 'Grava triturada', tint: 0xffffff, roughness: 0.96, metalness: 0.0, opacity: 1, tileMeters: 1, texture: 'gravel', normalMap: 'gravel', roughnessMap: 'gravel', aoMap: 'gravel', physical: false },

  /* Asfalto */
  'mat.asphalt': { id: 'mat.asphalt', label: 'Pavimento asfalto', tint: 0xffffff, roughness: 0.90, metalness: 0.0, opacity: 1, tileMeters: 2, texture: 'asphalt', normalMap: 'asphalt', roughnessMap: 'asphalt', aoMap: 'asphalt', physical: false }
}

