import { build } from 'esbuild'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

class FakeImageData {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}
globalThis.ImageData = FakeImageData

class FakeCanvas {
  constructor() {
    this.width = 256
    this.height = 256
    this.canvas = this
  }
  getContext() {
    return {
      canvas: this,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      fillRect: () => {},
      strokeRect: () => {},
      rect: () => {},
      createImageData: (w, h) => new FakeImageData(w, h),
      getImageData: (x, y, w, h) => new FakeImageData(w, h),
      putImageData: () => {},
      drawImage: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      ellipse: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {}
    }
  }
}

globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return new FakeCanvas()
    return {
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      setAttribute: () => {},
      appendChild: () => {},
      addEventListener: () => {},
      remove: () => {}
    }
  },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild: () => {}, removeChild: () => {} },
  head: { appendChild: () => {}, removeChild: () => {} }
}

const dir = await mkdtemp(path.join(tmpdir(), 'openings-tests-'))
const entry = 'src/renderer/src/engine/OpeningsRedesign.test.ts'
const out = path.join(dir, 'openings.test.mjs')

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'warning'
})

console.log(`\n=== ${entry} ===`)
await import(pathToFileURL(out).href)
