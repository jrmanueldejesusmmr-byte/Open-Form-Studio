/**
 * Verificación de la FASE 2 (exportar) — genera un archivo de cada formato y
 * lo vuelve a leer. Lo invoca `scripts/_verify-export.mjs` (que lo empaqueta
 * con esbuild para poder importar los `.ts` del renderer en Node).
 */

import * as THREE from 'three'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { SceneManager } from '../src/renderer/src/engine/SceneManager'
import { WallSegmentType } from '../src/renderer/src/models/Wall'
import { setQuality } from '../src/renderer/src/engine/MaterialSystem'
import { buildExportScene, EXPORT_FORMATS, type ExportContext } from '../src/renderer/src/export/index'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// En calidad «baja» el motor no genera texturas procedurales (necesitan DOM).
setQuality('baja')

/**
 * `GLTFExporter` usa `FileReader` (solo existe en navegador). En Node se
 * instala un polyfill mínimo basado en `Blob.arrayBuffer()` (Node ≥ 18).
 */
if (typeof (globalThis as { FileReader?: unknown }).FileReader === 'undefined') {
  ;(globalThis as Record<string, unknown>).FileReader = class FileReaderPolyfill {
    result: ArrayBuffer | null = null
    onloadend: (() => void) | null = null
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
    }
  }
}

let total = 0
let ok = 0
const fallos: string[] = []

function check(nombre: string, condicion: boolean, detalle = ''): void {
  total += 1
  if (condicion) {
    ok += 1
    console.log(`  ✅ ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } else {
    fallos.push(nombre)
    console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  }
}

/** Escena de prueba: casa de 8 × 6 m con 4 muros, una puerta y una ventana. */
function makeContext(): ExportContext {
  const manager = new SceneManager()
  const corners: Array<[number, number]> = [
    [0, 0],
    [8, 0],
    [8, 6],
    [0, 6]
  ]
  for (let i = 0; i < corners.length; i++) {
    const [x1, z1] = corners[i]
    const [x2, z2] = corners[(i + 1) % corners.length]
    const wall = manager.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(x1, 0, z1),
      new THREE.Vector3(x2, 0, z2)
    )
    wall.height = 2.8
    wall.thickness = 0.2
    wall.materialId = 'mat.plaster'
  }
  manager.restoreObject({
    id: 'obj-puerta',
    kind: 'shape',
    name: 'Puerta',
    position: { x: 2, y: 0, z: 0 },
    rotationY: 0,
    size: { width: 0.9, height: 2.1, depth: 0.12 },
    color: 0xffffff,
    materialId: 'mat.plaster'
  })
  manager.restoreObject({
    id: 'obj-ventana',
    kind: 'shape',
    name: 'Ventana',
    position: { x: 5, y: 1, z: 0 },
    rotationY: 0,
    size: { width: 1.2, height: 1.2, depth: 0.12 },
    color: 0xffffff,
    materialId: 'mat.plaster'
  })
  return {
    walls: manager.getWalls(),
    objects: manager.getObjects(),
    levels: manager.getLevels(),
    projectName: 'Casa verificación'
  }
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export async function run(outDir: string): Promise<void> {
  const context = makeContext()
  const scene = buildExportScene(context)

  console.log('\n📦 Verificación de la FASE 2 — exportar (ida y vuelta)\n')

  // --- OBJ ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'obj')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    const file = path.join(outDir, 'casa.obj')
    await writeFile(file, content, 'utf8')
    const loader = new OBJLoader()
    const root = loader.parse(content)
    let meshes = 0
    root.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) meshes += 1
    })
    // Se mide solo la malla del MURO: la escena incluye además la losa del
    // piso, que es más ancha que la casa.
    const wallMesh = root.children.find(
      (c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).name.includes('muro')
    ) as THREE.Mesh
    const box = new THREE.Box3().setFromObject(wallMesh)
    const size = new THREE.Vector3()
    box.getSize(size)
    check('OBJ: se genera y se relee', content.length > 0 && meshes > 0, `${meshes} mallas`)
    check(
      'OBJ: conserva las medidas en metros (muro de 8 m)',
      Math.abs(size.x - 8) < 0.01 && Math.abs(size.z - 0.2) < 0.01,
      `X=${size.x.toFixed(3)} Z=${size.z.toFixed(3)}`
    )
  }

  // --- MTL ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'mtl')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    await writeFile(path.join(outDir, 'casa.mtl'), content, 'utf8')
    check('MTL: se genera con materiales', content.includes('newmtl '), `${content.split('newmtl ').length - 1} materiales`)
  }

  // --- GLB ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'glb')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    const bytes = base64ToBytes(content)
    await writeFile(path.join(outDir, 'casa.glb'), bytes)
    const loader = new GLTFLoader()
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(
        bytes.buffer.slice(0) as ArrayBuffer,
        '',
        (result) => resolve(result as { scene: THREE.Group }),
        (event) => reject(event.error ?? new Error('error GLB'))
      )
    })
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = new THREE.Vector3()
    box.getSize(size)
    check('GLB: se genera y se relee', bytes.length > 0, `${bytes.length} bytes`)
    // La escena incluye la losa del piso (más ancha que la casa) y el muro
    // de 8 m: se comprueba que la medida mayor sea la del muro + su espesor.
    check(
      'GLB: conserva las medidas en metros',
      Math.abs(size.x - 8.2) < 0.05 && Math.abs(size.z - 6.2) < 0.05,
      `X=${size.x.toFixed(3)} Z=${size.z.toFixed(3)}`
    )
  }

  // --- STL ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'stl')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    const bytes = base64ToBytes(content)
    await writeFile(path.join(outDir, 'casa.stl'), bytes)
    const loader = new STLLoader()
    const geometry = loader.parse(bytes.buffer.slice(0) as ArrayBuffer)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    check('STL: se genera y se relee', bytes.length > 0, `${bytes.length} bytes`)
    // La escena incluye la losa del piso: el conjunto mide 8,2 × 6,2 m
    // (casa de 8 × 6 m más el espesor de los muros).
    check(
      'STL: conserva las medidas en metros (8 × 6 m)',
      Math.abs(box.max.x - box.min.x - 8.2) < 0.05 && Math.abs(box.max.z - box.min.z - 6.2) < 0.05,
      `X=${(box.max.x - box.min.x).toFixed(3)} Z=${(box.max.z - box.min.z).toFixed(3)}`
    )
  }

  // --- DXF ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'dxf')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    await writeFile(path.join(outDir, 'casa.dxf'), content, 'utf8')
    // Se relee con el parser propio del proyecto (`dxfImport.ts`).
    const { parseDxf, insUnitsToMeters } = await import(
      '../src/renderer/src/export/dxfImport'
    )
    const parsed = parseDxf(content)
    const meters = insUnitsToMeters(parsed.insUnits)
    check('DXF: se genera y se relee', content.includes('ENTITIES') && parsed.lines.length > 0, `${parsed.lines.length} segmentos`)
    check('DXF: declara unidades en metros', meters === 1, `INSUNITS=${parsed.insUnits}`)
    // La planta va de x=0 a x=8 y de z=0 a z=6 (proyectada a −Z).
    const xs = parsed.lines.flatMap((l) => [l.x1, l.x2])
    const ys = parsed.lines.flatMap((l) => [l.y1, l.y2])
    check(
      'DXF: conserva las medidas en metros',
      Math.abs(Math.max(...xs) - Math.min(...xs) - 8.2) < 0.05,
      `ancho=${(Math.max(...xs) - Math.min(...xs)).toFixed(3)} m`
    )
    check(
      'DXF: la planta conserva la profundidad (6 m)',
      Math.abs(Math.max(...ys) - Math.min(...ys) - 6.2) < 0.05,
      `fondo=${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} m`
    )
  }

  // --- PDF ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'pdf')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    const bytes = base64ToBytes(content)
    await writeFile(path.join(outDir, 'casa.pdf'), bytes)
    // El PDF se genera en Latin-1: se lee byte a byte.
    const head = Buffer.from(bytes.subarray(0, 8)).toString('latin1')
    const tail = Buffer.from(bytes.subarray(-8)).toString('latin1')
    check('PDF: se genera con cabecera válida', head.startsWith('%PDF-1.'), head.trim())
    check('PDF: termina con EOF', tail.includes('%%EOF'), tail.trim())
    check('PDF: tamaño razonable', bytes.length > 1000, `${bytes.length} bytes`)
  }

  // --- SVG ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'svg')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    await writeFile(path.join(outDir, 'casa.svg'), content, 'utf8')
    // Se relee con un parser XML simple: se comprueban capas y viewBox.
    const viewBox = content.match(/viewBox="([^"]+)"/)
    const parts = viewBox ? viewBox[1].split(' ').map(Number) : []
    const width = parts.length === 4 ? parts[2] : 0
    check('SVG: se genera y se relee', content.startsWith('<?xml') && content.trimEnd().endsWith('</svg>'))
    check('SVG: incluye las capas MUROS y OBJETOS', content.includes('id="MUROS"') && content.includes('id="OBJETOS"'))
    check(
      'SVG: el viewBox está en metros (8 m + márgenes)',
      width > 8 && width < 10,
      `ancho=${width} m`
    )
  }

  // --- IFC ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'ifc')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    await writeFile(path.join(outDir, 'casa.ifc'), content, 'utf8')
    const lines = content.split('\n').filter((l) => l.startsWith('#'))
    const defined = new Set(lines.map((l) => l.slice(1).split('=')[0]))
    // Las referencias son `#N` con N corto (id de entidad). Los GUID de IFC
    // son globales y tienen 22 caracteres: no son referencias locales.
    const referenced = [...content.matchAll(/#(\d{1,6})(?![0-9A-Za-z_$])/g)].map((m) => m[1])
    const missing = [...new Set(referenced.filter((id) => defined.has(id) === false))]
    check('IFC: se genera con cabecera STEP IFC4', content.startsWith('ISO-10303-21;') && content.includes("FILE_SCHEMA(('IFC4'))"))
    check('IFC: incluye muros, losas, puertas y ventanas', content.includes('IFCWALLSTANDARDCASE(') && content.includes('IFCSLAB(') && content.includes('IFCDOOR(') && content.includes('IFCWINDOW('))
    check('IFC: todas las referencias apuntan a entidades existentes', missing.length === 0, `${missing.length} rotas`)
    check('IFC: declara unidades en metros', content.includes('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'))
  }

  // --- PNG (necesita el visor: se comprueba el camino de error honesto) ---
  {
    const format = EXPORT_FORMATS.find((f) => f.id === 'png')!
    const error: { message?: string } = {}
    const content = await format.export(scene, context, error)
    // Sin visor 3D no se puede capturar: el exportador debe avisar, no fallar en silencio.
    check(
      'PNG: sin visor 3D avisa honestamente (no genera archivo corrupto)',
      content === '' && typeof error.message === 'string' && error.message.length > 0,
      error.message ?? '(sin mensaje)'
    )
  }

  console.log(`\n${fallos.length === 0 ? '✅' : '❌'} ${ok}/${total} comprobaciones superadas`)
  console.log(`   Archivos generados en: ${outDir}\n`)
  if (fallos.length > 0) {
    console.log(`   Fallos: ${fallos.join(', ')}`)
    process.exitCode = 1
  }
}
