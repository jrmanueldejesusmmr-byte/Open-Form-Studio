import * as THREE from 'three'
import type { TextureKind } from './MaterialSystem'

/**
 * Mapas PBR hiperrealistas derivados de las texturas procedurales:
 *
 *   - **Altura / Bump** (grayscale): patrón geométrico 1:1 con el albedo de
 *     `MaterialSystem.ts` (hiladas de ladrillo 8×4, tejas curvas 3×5, duelas de
 *     madera 8 tablas, baldosas cerámicas 4×4, mampostería de piedra, poros de
 *     concreto y briznas de césped).
 *   - **Normal Map**: Operador Sobel multi-escala wrap-around (convención OpenGL)
 *     para relieve profundo en juntas, vetas, canales de teja y rugosidad.
 *   - **Roughness Map**: Variación calibrada con fondo opaco completo (mortero
 *     y juntas más mates, caras de ladrillo/madera/concreto con micro-variación
 *     natural sin brillo plástico).
 */

/** PRNG determinista (idéntico al de MaterialSystem, para reproducibilidad). */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No hay contexto 2D para los mapas PBR.')
  return { canvas, ctx }
}

/** Estado de los mapas derivados de un tipo de textura. */
export interface PbrMapsState {
  height: HTMLCanvasElement | null
  normal: HTMLCanvasElement | null
  rough: HTMLCanvasElement | null
}

const pbrCache = new Map<string, PbrMapsState>()

function gray(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)))
  return `rgb(${n},${n},${n})`
}

/**
 * Pinta el mapa de altura (bump/height) alineado píxel a píxel con el albedo
 * de `MaterialSystem.ts`.
 */
function drawHeight(kind: TextureKind, ctx: CanvasRenderingContext2D, size: number): void {
  const rand = seeded(900 + kind.charCodeAt(0) * 7 + kind.length)

  switch (kind) {
    case 'brick': {
      const rows = 8
      const cols = 4
      const bh = size / rows
      const bw = size / cols
      const mortar = Math.max(2, size * 0.018)
      // Mortero profundo hundido
      ctx.fillStyle = gray(0.18)
      ctx.fillRect(0, 0, size, size)

      for (let r = 0; r < rows; r++) {
        const offset = r % 2 === 0 ? 0 : bw / 2
        for (let c = -1; c <= cols + 1; c++) {
          const x = c * bw + offset + mortar * 0.5
          const y = r * bh + mortar * 0.5
          const w = bw - mortar
          const h = bh - mortar
          const wx = ((Math.round(x) % size) + size) % size
          const brickRand = seeded(wx * 131 + r * 31 + 7)
          const baseH = 0.76 + brickRand() * 0.16

          // Bisel perimetral del ladrillo
          ctx.fillStyle = gray(baseH * 0.72)
          ctx.fillRect(x, y, w, h)

          // Cara elevada del ladrillo
          const bevel = Math.max(1.5, size * 0.004)
          ctx.fillStyle = gray(baseH)
          ctx.fillRect(x + bevel, y + bevel, Math.max(1, w - bevel * 2), Math.max(1, h - bevel * 2))

          // Micro-rugosidad de arcilla cocida
          for (let p = 0; p < 18; p++) {
            const px = x + bevel + brickRand() * Math.max(1, w - bevel * 2)
            const py = y + bevel + brickRand() * Math.max(1, h - bevel * 2)
            const pr = 1 + brickRand() * 2.5
            ctx.fillStyle = gray(baseH + (brickRand() - 0.5) * 0.14)
            ctx.fillRect(px, py, pr, pr)
          }
        }
      }
      break
    }

    case 'wood': {
      // 8 duelas longitudinales idénticas a drawWood
      const planks = 8
      const pw = size / planks
      const woodRand = seeded(29)
      ctx.fillStyle = gray(0.16) // ranura entre tablas
      ctx.fillRect(0, 0, size, size)

      for (let p = 0; p < planks; p++) {
        const baseH = 0.78 + woodRand() * 0.12
        const joint = Math.max(1.5, size * 0.003)
        ctx.fillStyle = gray(baseH)
        ctx.fillRect(p * pw + joint, 0, pw - joint * 1.5, size)

        // Vetas longitudinales en relieve
        for (let g = 0; g < 10; g++) {
          const gx = p * pw + 4 + woodRand() * (pw - 8)
          ctx.strokeStyle = gray(baseH - 0.12 - woodRand() * 0.08)
          ctx.lineWidth = 1 + woodRand() * 1.4
          ctx.beginPath()
          ctx.moveTo(gx, 0)
          ctx.bezierCurveTo(
            gx + (woodRand() - 0.5) * 10,
            size * 0.33,
            gx + (woodRand() - 0.5) * 10,
            size * 0.67,
            gx,
            size
          )
          ctx.stroke()
        }
      }
      break
    }

    case 'terracotta': {
      // Alineado 1:1 con drawTerracotta (3 filas × 5 columnas de teja curva española)
      const rows = 3
      const cols = 5
      const bh = size / rows
      const bw = size / cols
      ctx.fillStyle = gray(0.15)
      ctx.fillRect(0, 0, size, size)

      for (let r = 0; r < rows; r++) {
        const y = r * bh
        const rowOffset = r % 2 === 0 ? 0 : bw * 0.5
        for (let c = -1; c <= cols + 1; c++) {
          const x = c * bw + rowOffset
          // Perfil cilíndrico convexo de cada teja
          const grad = ctx.createLinearGradient(x, 0, x + bw, 0)
          grad.addColorStop(0.0, gray(0.22))
          grad.addColorStop(0.2, gray(0.58))
          grad.addColorStop(0.5, gray(0.95))
          grad.addColorStop(0.8, gray(0.62))
          grad.addColorStop(1.0, gray(0.2))
          ctx.fillStyle = grad
          ctx.fillRect(x + 1, y + 2, bw - 2, bh - 3)

          // Escalón de solape entre hiladas de tejas
          const overlapGrad = ctx.createLinearGradient(0, y, 0, y + bh * 0.22)
          overlapGrad.addColorStop(0, gray(0.14))
          overlapGrad.addColorStop(1, 'rgba(128,128,128,0)')
          ctx.fillStyle = overlapGrad
          ctx.fillRect(x, y, bw, bh * 0.22)

          // Borde frontal elevado de la teja
          ctx.fillStyle = gray(0.98)
          ctx.fillRect(x + 2, y + bh - 4, bw - 4, 2.5)
        }
      }
      break
    }

    case 'concrete':
    case 'asphalt': {
      const base = kind === 'concrete' ? 0.68 : 0.56
      ctx.fillStyle = gray(base)
      ctx.fillRect(0, 0, size, size)

      // Manchas de árido / porosidad
      for (let i = 0; i < 35; i++) {
        const x = rand() * size
        const y = rand() * size
        const r = 16 + rand() * 48
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        const delta = (rand() - 0.5) * 0.16
        g.addColorStop(0, gray(base + delta))
        g.addColorStop(1, 'rgba(128,128,128,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }

      // Micro-poros y textura de encofrado / asfalto
      const count = kind === 'concrete' ? 2200 : 3000
      const spread = kind === 'concrete' ? 0.26 : 0.34
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = gray(base + (rand() - 0.5) * spread)
        const s = 1 + rand() * 2.6
        ctx.fillRect(rand() * size, rand() * size, s, s)
      }
      break
    }

    case 'ceramic': {
      // Alineado 1:1 con drawCeramic (4×4 baldosas)
      const cols = 4
      const rows = 4
      const bw = size / cols
      const bh = size / rows
      const grout = Math.max(1.5, size * 0.012)
      ctx.fillStyle = gray(0.24) // junta de lechada hundida
      ctx.fillRect(0, 0, size, size)

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = gray(0.88)
          ctx.fillRect(c * bw + grout, r * bh + grout, bw - grout * 2, bh - grout * 2)
        }
      }
      break
    }

    case 'stone': {
      // Alineado con drawStone (seeded(101))
      ctx.fillStyle = gray(0.25)
      ctx.fillRect(0, 0, size, size)
      const stoneRand = seeded(101)
      for (let i = 0; i < 24; i++) {
        const x = stoneRand() * size
        const y = stoneRand() * size
        const w = 40 + stoneRand() * 80
        const h = 30 + stoneRand() * 60
        const shade = 0.65 + stoneRand() * 0.3
        ctx.fillStyle = gray(shade)
        ctx.fillRect(x + 2, y + 2, Math.max(2, w - 4), Math.max(2, h - 4))
      }
      for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = gray(0.5 + (rand() - 0.5) * 0.25)
        ctx.fillRect(rand() * size, rand() * size, 1.5 + rand() * 2, 1.5 + rand() * 2)
      }
      break
    }

    case 'grass': {
      ctx.fillStyle = gray(0.45)
      ctx.fillRect(0, 0, size, size)
      for (let i = 0; i < 3200; i++) {
        ctx.fillStyle = gray(0.35 + rand() * 0.58)
        const w = 1 + rand() * 2.2
        const h = 3 + rand() * 9
        ctx.fillRect(rand() * size, rand() * size, w, h)
      }
      break
    }

    case 'gravel': {
      ctx.fillStyle = gray(0.3)
      ctx.fillRect(0, 0, size, size)
      for (let i = 0; i < 650; i++) {
        ctx.fillStyle = gray(0.5 + rand() * 0.45)
        ctx.beginPath()
        ctx.ellipse(
          rand() * size,
          rand() * size,
          2 + rand() * 6,
          2 + rand() * 6,
          rand() * Math.PI,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
      break
    }

    case 'stucco': {
      ctx.fillStyle = gray(0.65)
      ctx.fillRect(0, 0, size, size)
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = gray(0.65 + (rand() - 0.5) * 0.24)
        const r = 1.5 + rand() * 6
        ctx.beginPath()
        ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'metalOre':
    case 'metalPot': {
      ctx.fillStyle = gray(0.62)
      ctx.fillRect(0, 0, size, size)
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = gray(0.62 + (rand() - 0.5) * 0.26)
        const s = 1 + rand() * 2.5
        ctx.fillRect(rand() * size, rand() * size, s, s)
      }
      break
    }

    case 'corrugated': {
      const img = ctx.createImageData(size, size)
      const waves = 10
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = 0.5 + 0.46 * Math.sin((x / size) * Math.PI * 2 * waves)
          const n = Math.round(v * 255)
          const idx = (y * size + x) * 4
          img.data[idx] = n
          img.data[idx + 1] = n
          img.data[idx + 2] = n
          img.data[idx + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
      break
    }

    case 'marble': {
      ctx.fillStyle = gray(0.82)
      ctx.fillRect(0, 0, size, size)
      const marbleRand = seeded(31)
      ctx.lineCap = 'round'
      for (let i = 0; i < 22; i++) {
        ctx.strokeStyle = gray(0.72)
        ctx.lineWidth = 0.8 + marbleRand() * 2.2
        let x = marbleRand() * size
        let y = marbleRand() * size
        ctx.beginPath()
        ctx.moveTo(x, y)
        for (let s = 0; s < 5; s++) {
          x += (marbleRand() - 0.5) * size * 0.6
          y += (marbleRand() - 0.5) * size * 0.6
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      break
    }

    case 'glass':
    default:
      ctx.fillStyle = gray(0.5)
      ctx.fillRect(0, 0, size, size)
      break
  }
}

/**
 * Convierte un mapa de altura en un **normal map** tangent-space real con el
 * operador Sobel 3×3 wrap-around (convención OpenGL).
 */
function heightToNormal(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = height.width
  const src = (height.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, size, size)
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const outCtx = out.getContext('2d') as CanvasRenderingContext2D
  const dst = outCtx.createImageData(size, size)
  const wrap = (v: number): number => ((v % size) + size) % size
  const h = (x: number, y: number): number => src.data[(wrap(y) * size + wrap(x)) * 4] / 255

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Filtro Sobel 3x3 completo para normales más ricas y suaves
      const tl = h(x - 1, y - 1)
      const tc = h(x, y - 1)
      const tr = h(x + 1, y - 1)
      const ml = h(x - 1, y)
      const mr = h(x + 1, y)
      const bl = h(x - 1, y + 1)
      const bc = h(x, y + 1)
      const br = h(x + 1, y + 1)

      const dx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * strength * 0.35
      const dy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * strength * 0.35

      let nx = -dx
      let ny = dy
      let nz = 1
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      nx /= len
      ny /= len
      nz /= len
      const idx = (y * size + x) * 4
      dst.data[idx] = Math.round((nx * 0.5 + 0.5) * 255)
      dst.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      dst.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      dst.data[idx + 3] = 255
    }
  }
  outCtx.putImageData(dst, 0, 0)
  return out
}

/**
 * Rugosidad relativa calibrada (el shader multiplica `def.roughness × roughnessMap.g`).
 *IMPORTANTE: Se rellena el fondo completo en gris claro (~0.92) para que nunca
 * quede negro/transparente (lo que provocaría brillo espejo plástico).
 * En juntas de ladrillo, cerámica y madera se sube a 1.0 (totalmente mate).
 */
function drawRough(kind: TextureKind, ctx: CanvasRenderingContext2D, size: number): void {
  const rand = seeded(1300 + kind.charCodeAt(0) * 11 + kind.length)
  const polished =
    kind === 'ceramic' || kind === 'marble' || kind.startsWith('metal') || kind === 'glass'
  const baseVal = polished ? 0.88 : 0.94

  // Fondo opaco completo calibrado
  ctx.fillStyle = gray(baseVal)
  ctx.fillRect(0, 0, size, size)

  if (kind === 'brick') {
    const rows = 8
    const cols = 4
    const bh = size / rows
    const bw = size / cols
    const mortar = Math.max(2, size * 0.018)
    // Mortero 100% mate (1.0)
    ctx.fillStyle = gray(1.0)
    ctx.fillRect(0, 0, size, size)
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : bw / 2
      for (let c = -1; c <= cols + 1; c++) {
        const x = c * bw + offset + mortar * 0.5
        const y = r * bh + mortar * 0.5
        ctx.fillStyle = gray(0.9 + rand() * 0.09)
        ctx.fillRect(x, y, bw - mortar, bh - mortar)
      }
    }
  } else if (kind === 'ceramic') {
    const tiles = 4
    const tw = size / tiles
    const grout = Math.max(1.5, size * 0.012)
    // Juntas de lechada mates (1.0), baldosas esmaltadas suaves (0.78..0.88)
    ctx.fillStyle = gray(1.0)
    ctx.fillRect(0, 0, size, size)
    for (let r = 0; r < tiles; r++) {
      for (let c = 0; c < tiles; c++) {
        ctx.fillStyle = gray(0.8 + rand() * 0.08)
        ctx.fillRect(c * tw + grout, r * tw + grout, tw - grout * 2, tw - grout * 2)
      }
    }
  } else if (kind === 'wood') {
    const planks = 8
    const pw = size / planks
    ctx.fillStyle = gray(1.0)
    ctx.fillRect(0, 0, size, size)
    for (let p = 0; p < planks; p++) {
      ctx.fillStyle = gray(0.86 + rand() * 0.1)
      ctx.fillRect(p * pw + 1.5, 0, pw - 1.5, size)
    }
  }

  const spread = polished ? 0.18 : 0.12
  for (let i = 0; i < 1600; i++) {
    const v = baseVal + (rand() - 0.5) * spread
    ctx.fillStyle = gray(v)
    const s = 1 + rand() * 3
    ctx.fillRect(rand() * size, rand() * size, s, s)
  }
}

/** Genera (una vez) y cachea los mapas derivados de `kind`. */
function ensurePbrMaps(kind: TextureKind, size: number): PbrMapsState {
  const key = `${kind}-${size}`
  let state = pbrCache.get(key)
  if (state) return state
  state = { height: null, normal: null, rough: null }
  pbrCache.set(key, state)

  const height = createCanvas(size)
  drawHeight(kind, height.ctx, size)
  state.height = height.canvas

  const half = Math.max(256, size >> 1)
  const heightHalf = document.createElement('canvas')
  heightHalf.width = half
  heightHalf.height = half
  heightHalf.getContext('2d')?.drawImage(height.canvas, 0, 0, half, half)
  state.normal = heightToNormal(heightHalf, 3.2)

  const rough = createCanvas(half)
  drawRough(kind, rough.ctx, half)
  state.rough = rough.canvas
  return state
}

/** Normal map procedural (Sobel real) en espacio lineal con RepeatWrapping. */
export function makeNormalTexture(kind: TextureKind, size: number): THREE.Texture {
  const canvas = ensurePbrMaps(kind, size).normal
  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Bump map (mapa de altura) en espacio lineal con RepeatWrapping. */
export function makeBumpTexture(kind: TextureKind, size: number): THREE.Texture {
  const canvas = ensurePbrMaps(kind, size).height
  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Mapa de rugosidad calibrada en espacio lineal con RepeatWrapping. */
export function makeRoughnessTexture(kind: TextureKind, size: number): THREE.Texture {
  const canvas = ensurePbrMaps(kind, size).rough
  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Libera los canvas derivados (calidad cambiada / cierre). */
export function disposePbrMaps(): void {
  pbrCache.forEach((state) => {
    for (const canvas of [state.height, state.normal, state.rough]) {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  })
  pbrCache.clear()
}
