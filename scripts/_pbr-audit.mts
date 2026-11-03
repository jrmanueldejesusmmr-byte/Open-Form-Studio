/* Paso 1 (realismo): verifica que los mapas PBR derivados son reales.
   Simula `document` con un canvas 2D mínimo para ejecutar PbrMaps sin navegador. */

type Ctx2D = {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: string
  globalAlpha: number
  createImageData: (w: number, h: number) => ImageData
  getImageData: (x: number, y: number, w: number, h: number) => ImageData
  putImageData: (d: ImageData, x: number, y: number) => void
  fillRect: (x: number, y: number, w: number, h: number) => void
  drawImage: (img: unknown, x: number, y: number, w?: number, h?: number) => void
  beginPath: () => void
  arc: (x: number, y: number, r: number, a: number, b: number) => void
  ellipse: (x: number, y: number, rx: number, ry: number, rot: number, a: number, b: number) => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  bezierCurveTo: (a: number, b: number, c: number, d: number, e: number, f: number) => void
  stroke: () => void
  fill: () => void
}

function makeCtx(w: number, h: number): Ctx2D {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  const parse = (style: string): [number, number, number, number] => {
    const m = /rgba?\(([^)]+)\)/.exec(style)
    if (!m) return [0, 0, 0, 255]
    const p = m[1].split(',').map((s) => parseFloat(s))
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255]
  }
  const put = (x: number, y: number, rgb: [number, number, number, number], alpha: number): void => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return
    const i = (yi * w + xi) * 4
    const a = (alpha * rgb[3]) / 255
    data[i] = Math.round(rgb[0] * a + data[i] * (1 - a))
    data[i + 1] = Math.round(rgb[1] * a + data[i + 1] * (1 - a))
    data[i + 2] = Math.round(rgb[2] * a + data[i + 2] * (1 - a))
    data[i + 3] = 255
  }
  let cur: [number, number, number, number] = [0, 0, 0, 255]
  const alpha = 1
  return {
    set fillStyle(v) { cur = parse(v) },
    get fillStyle() { return '' },
    set strokeStyle(v) { cur = parse(v) },
    get strokeStyle() { return '' },
    lineWidth: 1, lineCap: 'butt', globalAlpha: 1,
    createImageData: (ww, hh) => new FakeImageData(ww, hh),
    getImageData: (x, y, ww, hh) => {
      const out = new FakeImageData(ww, hh)
      for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) {
        const sx = x + i, sy = y + j
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
        const s = (sy * w + sx) * 4, d = (j * ww + i) * 4
        out.data[d] = data[s]; out.data[d + 1] = data[s + 1]; out.data[d + 2] = data[s + 2]; out.data[d + 3] = data[s + 3]
      }
      return out
    },
    putImageData: (dd, x, y) => {
      for (let j = 0; j < dd.height; j++) for (let i = 0; i < dd.width; i++) {
        const dx = x + i, dy = y + j
        if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue
        const s = (j * dd.width + i) * 4, d = (dy * w + dx) * 4
        data[d] = dd.data[s]; data[d + 1] = dd.data[s + 1]; data[d + 2] = dd.data[s + 2]; data[d + 3] = dd.data[s + 3]
      }
    },
    fillRect: (x, y, ww, hh) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) put(x + i, y + j, cur, alpha) },
    drawImage: (img, x, y, ww, hh) => {
      const src = img as FakeCanvas
      const sw = src.width, sh = src.height
      const dw = ww ?? sw, dh = hh ?? sh
      const sd = src.getContext().getImageData(0, 0, sw, sh).data
      for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
        const sx = Math.floor((i * sw) / dw), sy = Math.floor((j * sh) / dh)
        const s = (sy * sw + sx) * 4
        const dx = x + i, dy = y + j
        if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue
        const d = (dy * w + dx) * 4
        data[d] = sd[s]; data[d + 1] = sd[s + 1]; data[d + 2] = sd[s + 2]; data[d + 3] = sd[s + 3]
      }
    },
    beginPath: () => {}, arc: () => {}, ellipse: () => {}, moveTo: () => {}, lineTo: () => {},
    bezierCurveTo: () => {}, stroke: () => {}, fill: () => {}
  }
}

class FakeCanvas {
  width = 0
  height = 0
  private ctx: Ctx2D | null = null
  getContext(): Ctx2D { if (!this.ctx) this.ctx = makeCtx(this.width, this.height); return this.ctx }
}

// Node no expone `ImageData`; el mock lo aporta.
class FakeImageData {
  data: Uint8ClampedArray
  constructor(
    public width: number,
    public height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}
;(globalThis as unknown as { ImageData: unknown }).ImageData = FakeImageData

;(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => { if (tag !== 'canvas') throw new Error(tag); return new FakeCanvas() }
}

// Node no trae `ImageData`; el mínimo compatible con el uso del motor.
if (typeof (globalThis as unknown as { ImageData?: unknown }).ImageData === 'undefined') {
  ;(globalThis as unknown as { ImageData: unknown }).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(a: Uint8ClampedArray | number, b?: number, c?: number) {
      if (typeof a === 'number') { this.width = a; this.height = b as number; this.data = new Uint8ClampedArray(a * b as number * 4) }
      else { this.data = a; this.width = b as number; this.height = c as number }
    }
  }
}

// --- Normal map de ladrillo: relieve real, z dominante, tileable ---
const { makeNormalTexture, makeRoughnessTexture, disposePbrMaps } = await import(
  '../src/renderer/src/engine/PbrMaps'
)

let pass = 0, fail = 0
const ok = (n: string, c: boolean, extra = ''): void => {
  console.log(`${c ? 'OK  ' : 'FALLA'} ${n}${extra ? '  [' + extra + ']' : ''}`)
  c ? pass++ : fail++
}
const px = (cv: FakeCanvas, x: number, y: number): [number, number, number] => {
  const d = cv.getContext().getImageData(x, y, 1, 1).data
  return [d[0], d[1], d[2]]
}

{
  const tex = makeNormalTexture('brick', 256) as unknown as { image: FakeCanvas }
  const img = tex.image
  let zDom = 0, off = 0
  for (let y = 0; y < 256; y += 7) for (let x = 0; x < 256; x += 7) {
    const [, , z] = px(img, x, y)
    if (z > 128) zDom++; else off++
  }
  ok('brick: normal con z dominante (cara hacia cámara)', zDom > off * 3, `zDom=${zDom} off=${off}`)
  const uniq = new Set<string>()
  for (let y = 0; y < 256; y += 5) for (let x = 0; x < 256; x += 5) uniq.add(px(img, x, y).join(','))
  ok('brick: relieve real (no plano, muchos vectores distintos)', uniq.size > 40, `únicos=${uniq.size}`)
  // Tileable: el seam x=255→0 debe comportarse como la geometría interior
  // equivalente, no como un corte artificial.
  //  - Filas impares: el seam cae en mitad de un ladrillo que lo cruza
  //    (misma sombra a ambos lados tras el fix) → gradiente ~0.
  //  - Filas pares: el seam cruza una junta de mortero; su ΔR debe ser del
  //    orden del ΔR de una junta interior equivalente (x≈62→64).
  let oddFlatBad = 0
  for (let y = 34; y < 58; y += 3) {
    const l = px(img, 0, y)
    const r = px(img, 255, y)
    if (Math.abs(l[0] - r[0]) > 2) oddFlatBad++
  }
  ok('brick: seam (fila impar) continuo dentro del ladrillo', oddFlatBad === 0, `malas=${oddFlatBad}`)

  let seamΔ = 0
  let jointΔ = 0
  for (let y = 4; y < 28; y += 3) {
    seamΔ = Math.max(seamΔ, Math.abs(px(img, 0, y)[0] - px(img, 255, y)[0]))
    jointΔ = Math.max(jointΔ, Math.abs(px(img, 64, y)[0] - px(img, 62, y)[0]))
  }
  ok(
    'brick: seam (fila par) ≈ junta interior',
    seamΔ <= jointΔ + 40,
    `seam=${seamΔ} junta=${jointΔ}`
  )
}

// --- Corrugado: ondas sinusoidales visibles en el normal ---
{
  const tex = makeNormalTexture('corrugated', 256) as unknown as { image: FakeCanvas }
  const row = 128
  let changes = 0, prev = px(tex.image, 0, row)[0] > 128
  for (let x = 1; x < 256; x++) {
    const cur = px(tex.image, x, row)[0] > 128
    if (cur !== prev) changes++
    prev = cur
  }
  ok('corrugated: ondas visibles en el normal (cambia X)', changes >= 12, `cambios=${changes}`)
  // El seno es 256-periódico: el seam debe ser indetectable (wrap del Sobel).
  let seamMax = 0
  for (let y = 0; y < 256; y += 8) {
    seamMax = Math.max(seamMax, Math.abs(px(tex.image, 0, y)[0] - px(tex.image, 255, y)[0]))
  }
  ok('corrugated: seam continuo (wrap del Sobel)', seamMax <= 20, `Δ=${seamMax}`)
}

// --- Rugosidad: micro-variación alrededor de 1.0, nunca plano ni extremo ---
{
  const tex = makeRoughnessTexture('concrete', 128) as unknown as { image: FakeCanvas }
  let lo = 255, hi = 0
  for (let y = 0; y < 128; y += 3) for (let x = 0; x < 128; x += 3) {
    const v = px(tex.image, x, y)[0]
    lo = Math.min(lo, v); hi = Math.max(hi, v)
  }
  ok('roughness: micro-variación alrededor de 1.0', lo >= 170 && hi <= 255 && hi - lo >= 8, `min=${lo} max=${hi}`)
}

// --- Vidrio: sin relieve (plano) ---
{
  const tex = makeNormalTexture('glass', 128) as unknown as { image: FakeCanvas }
  const a = px(tex.image, 10, 10), b = px(tex.image, 100, 100)
  ok('glass: plano (sin relieve)', a[0] === 128 && a[1] === 128 && a[2] === 255 && b[0] === 128, `px=${a.join('/')}`)
}

disposePbrMaps()
console.log(`\n==== verificación PBR: ${pass} OK, ${fail} FALLO ====`)
process.exit(fail > 0 ? 1 : 0)
