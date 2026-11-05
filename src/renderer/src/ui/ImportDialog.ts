import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { HistoryManager } from '../engine/HistoryManager'
import type { LayerManager } from '../engine/LayerManager'
import type { Viewport3DController } from '../engine/Viewport3DController'
import type { ViewMode } from '../engine/ViewportRenderer'
import { applyDxfImport, inferWalls, parseDxf, type DxfImportPlan } from '../export/dxfImport'
import {
  loadModel,
  createImportedObjects,
  base64ToBytes,
  type ImportedModel,
  type ImportModelOptions,
  type Model3DFormat
} from '../import/modelImport'
import { parseIfc, planIfcImport, applyIfcImport, type IfcImportPlan } from '../import/ifcImport'
import { extractPdfLines, planPdfImport, applyPdfImport, type PdfImportPlan } from '../import/pdfImport'
import { parseSvg, planSvgImport, applySvgImport, type SvgImportPlan } from '../import/svgImport'
import { parseTopographyFile, type ParsedTopography } from '../import/topographyImport'
import { createTerrainDataFromPoints } from '../engine/TerrainBuilder'
import { SceneObject } from '../models/SceneObject'
import {
  parseProjectJson,
  applySerializedProjectToWorkspace,
  type SerializedProjectFile
} from '../services/ProjectPersistence'
import { icon, type IconName } from './icons'
import { showToast } from './Toast'

/** El puente arqStudio expuesto por preload/index.ts (window.arqStudio.app). */
export interface ImportAppBridge {
  openDialog(options: unknown): Promise<{ canceled?: boolean; filePaths?: string[] }>
  /** Devuelve el contenido en base64; el diálogo lo decodifica a texto o bytes. */
  readFile(payload: { filePath: string }): Promise<unknown>
}

/** Identificadores de las tarjetas de formato del modal de importación. */
export type ImportCardId =
  | 'glb'
  | 'obj'
  | 'stl'
  | 'dxf'
  | 'svg'
  | 'ifc'
  | 'pdf'
  | 'json'
  | 'topo-dxf'
  | 'topo-csv'
  | 'topo-geojson'

/** Compatibilidad con tipos previos. */
export type ImportFormat = ImportCardId | 'model' | 'pdf-text'

export interface ImportedFileResult {
  fileName: string
  projectName: string
  format: ImportCardId
  hasContent: boolean
  parsedModel?: ImportedModel | null
  parsedDxf?: { text: string; plan: DxfImportPlan } | null
  parsedSvg?: { text: string; plan: SvgImportPlan } | null
  parsedIfcPlan?: IfcImportPlan | null
  parsedPdfPlan?: PdfImportPlan | null
  parsedJsonProject?: SerializedProjectFile | null
  parsedTopography?: ParsedTopography | null
  transformParams: {
    scale: number
    x: number
    y: number
    z: number
    rotYRad: number
    rotYDeg: number
    centerAtOrigin: boolean
    includeInCosts: boolean
  }
}

export function createImportedTerrainObject(
  topo: ParsedTopography,
  fileName: string,
  params: ImportedFileResult['transformParams']
): SceneObject {
  const terrainData = createTerrainDataFromPoints(topo.points, {
    scale: params.scale,
    sourceFormat: topo.format
  })
  const cleanName = fileName.replace(/\.[^.]+$/, '').trim() || 'Mapa Topográfico'
  const terrainObj = new SceneObject(`Terreno: ${cleanName}`, 'shape')
  terrainObj.shapeId = 'topo.terrain'
  terrainObj.materialId = null
  terrainObj.color = 0x5c8f4d
  terrainObj.layer = 'terrain'
  terrainObj.terrainData = terrainData
  const relief = Math.max(0.5, terrainData.maxElev - terrainData.minElev)
  terrainObj.size.set(terrainData.width, Math.round(relief * 100) / 100, terrainData.depth)
  const cx = params.centerAtOrigin ? 0 : ((topo.bounds.minX + topo.bounds.maxX) / 2) * params.scale
  const cz = params.centerAtOrigin ? 0 : (-(topo.bounds.minY + topo.bounds.maxY) / 2) * params.scale
  terrainObj.position.set(params.x + cx, params.y, params.z + cz)
  terrainObj.rotationY = params.rotYRad
  terrainObj.includeInCosts = params.includeInCosts
  return terrainObj
}

export function hasImportedContent(result: ImportedFileResult | null | undefined): boolean {
  if (!result || !result.fileName) return false
  if (result.parsedModel && result.parsedModel.meshCount > 0) return true
  if (result.parsedDxf && result.parsedDxf.plan.walls.length > 0) return true
  if (result.parsedSvg && result.parsedSvg.plan.walls.length > 0) return true
  if (
    result.parsedIfcPlan &&
    (result.parsedIfcPlan.walls.length > 0 ||
      result.parsedIfcPlan.slabs.length > 0 ||
      result.parsedIfcPlan.columns.length > 0 ||
      result.parsedIfcPlan.openings.length > 0 ||
      result.parsedIfcPlan.roofs.length > 0 ||
      result.parsedIfcPlan.furnishings.length > 0)
  ) {
    return true
  }
  if (result.parsedPdfPlan && result.parsedPdfPlan.walls.length > 0) return true
  if (
    result.parsedJsonProject &&
    (result.parsedJsonProject.walls.length > 0 || result.parsedJsonProject.objects.length > 0)
  ) {
    return true
  }
  if (result.parsedTopography && result.parsedTopography.points.length > 0) {
    return true
  }
  return false
}

export interface ImportDialogOptions {
  scene?: SceneManager
  history?: HistoryManager
  app?: ImportAppBridge
  statusBar?: { setMessage: (message: string) => void }
  layers?: LayerManager
  cameraController?: Viewport3DController
  setViewMode?: (mode: ViewMode) => void
  onRestoreAnimation?: (anim: unknown) => void
  onImportSuccess?: (projectName: string, importedProject?: SerializedProjectFile) => void
}

interface FormatCardDef {
  id: ImportCardId
  category: '3d' | '2d' | 'topo' | 'bim' | 'ref'
  title: string
  extLabel: string
  description: string
  icon: IconName
  extensions: string[]
  accept: string
}

const FORMAT_CARDS: readonly FormatCardDef[] = [
  // Modelos 3D
  {
    id: 'glb',
    category: '3d',
    title: 'GLB / glTF',
    extLabel: '.glb · .gltf',
    description: 'Escena 3D jerárquica PBR con materiales y sombras',
    icon: 'cube',
    extensions: ['glb', 'gltf'],
    accept: '.glb,.gltf'
  },
  {
    id: 'obj',
    category: '3d',
    title: 'OBJ + MTL',
    extLabel: '.obj (+ .mtl)',
    description: 'Malla poligonal Wavefront con soporte de materiales',
    icon: 'box',
    extensions: ['obj', 'mtl'],
    accept: '.obj,.mtl'
  },
  {
    id: 'stl',
    category: '3d',
    title: 'STL',
    extLabel: '.stl',
    description: 'Geometría de malla triangulada estereolitográfica',
    icon: 'shapes',
    extensions: ['stl'],
    accept: '.stl'
  },
  // Planos y CAD 2D
  {
    id: 'dxf',
    category: '2d',
    title: 'DXF (CAD 2D)',
    extLabel: '.dxf',
    description: 'Entidades LINE, LWPOLYLINE, CIRCLE y ARC a planta/muros',
    icon: 'plan2d',
    extensions: ['dxf'],
    accept: '.dxf'
  },
  {
    id: 'svg',
    category: '2d',
    title: 'SVG Vectorial',
    extLabel: '.svg',
    description: 'Trayectorias vectoriales 2D convertidas a trazos de planta',
    icon: 'layers',
    extensions: ['svg'],
    accept: '.svg'
  },
  // Topografía / GIS (Estilo AutoCAD Civil)
  {
    id: 'topo-dxf',
    category: 'topo',
    title: 'DXF Topográfico 3D',
    extLabel: '.dxf (X,Y,Z)',
    description: 'Polilíneas 3D, curvas de nivel y cotas Z a malla de terreno 3D',
    icon: 'layers',
    extensions: ['dxf'],
    accept: '.dxf'
  },
  {
    id: 'topo-csv',
    category: 'topo',
    title: 'Puntos CSV / TXT',
    extLabel: '.csv · .txt',
    description: 'Nube de puntos topográficos X,Y,Z (GPS / estación total) a terreno 3D',
    icon: 'fileCode',
    extensions: ['csv', 'txt', 'xyz', 'pts'],
    accept: '.csv,.txt,.xyz,.pts'
  },
  {
    id: 'topo-geojson',
    category: 'topo',
    title: 'Mapa GIS GeoJSON',
    extLabel: '.geojson · .json',
    description: 'Curvas de nivel y geometrías GIS con elevaciones Z a terreno 3D',
    icon: 'globe',
    extensions: ['geojson', 'json'],
    accept: '.geojson,.json'
  },
  // BIM / Estructura
  {
    id: 'ifc',
    category: 'bim',
    title: 'IFC4 (BIM)',
    extLabel: '.ifc',
    description: 'IfcWall, IfcSlab, IfcColumn y vanos paramétricos',
    icon: 'building',
    extensions: ['ifc'],
    accept: '.ifc'
  },
  // Referencias / Datos
  {
    id: 'pdf',
    category: 'ref',
    title: 'Plano PDF',
    extLabel: '.pdf',
    description: 'Extracción vectorial de líneas de plano desde PDF',
    icon: 'fileText',
    extensions: ['pdf'],
    accept: '.pdf'
  },
  {
    id: 'json',
    category: 'ref',
    title: 'Proyecto Nativo',
    extLabel: '.arqproj · .json',
    description: 'Reconstrucción íntegra de muros, muebles, capas y cámara',
    icon: 'fileJson',
    extensions: ['arqproj', 'json'],
    accept: '.arqproj,.json'
  }
]

const CATEGORIES: ReadonlyArray<{ id: FormatCardDef['category']; label: string }> = [
  { id: '3d', label: 'Modelos 3D' },
  { id: '2d', label: 'Planos 2D' },
  { id: 'topo', label: 'Topografía / GIS' },
  { id: 'bim', label: 'BIM' },
  { id: 'ref', label: 'Documentos' }
]

/** Decodifica base64 a texto UTF-8. */
function base64ToText(base64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf8')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = base64ToBytes(base64)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function fileNameOf(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}

function extOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : ''
}

function cardForExtension(ext: string, preferredCategory?: FormatCardDef['category']): ImportCardId | null {
  switch (ext) {
    case 'glb':
    case 'gltf':
      return 'glb'
    case 'obj':
    case 'mtl':
      return 'obj'
    case 'stl':
      return 'stl'
    case 'dxf':
      return preferredCategory === 'topo' ? 'topo-dxf' : 'dxf'
    case 'csv':
    case 'txt':
    case 'xyz':
    case 'pts':
      return 'topo-csv'
    case 'geojson':
      return 'topo-geojson'
    case 'svg':
      return 'svg'
    case 'ifc':
      return 'ifc'
    case 'pdf':
      return 'pdf'
    case 'arqproj':
      return 'json'
    case 'json':
      return preferredCategory === 'topo' ? 'topo-geojson' : 'json'
    default:
      return null
  }
}

export function mountImportDialog(
  overlay: HTMLElement,
  options?: ImportDialogOptions
): {
  open: (initialCategory?: FormatCardDef['category']) => Promise<ImportedFileResult | null>
  close: (result?: ImportedFileResult | null) => void
  isOpen: () => boolean
} {
  const {
    scene,
    history,
    app,
    statusBar,
    layers,
    cameraController,
    setViewMode,
    onRestoreAnimation,
    onImportSuccess
  } = options ?? {}

  let activeCard: ImportCardId = 'glb'
  let activeCategory: FormatCardDef['category'] = '3d'
  let isBusy = false
  let isDialogOpen = false
  let settlePromise: ((value: ImportedFileResult | null) => void) | null = null
  let abortController = new AbortController()

  // Datos cargados y validados listos para importar
  let loadedFileName = ''
  let loadedMtlName = ''
  let loadedMtlText: string | null = null
  let loadedRawObjBuffer: ArrayBuffer | null = null

  let parsedModel: ImportedModel | null = null
  let parsedDxfText: string | null = null
  let parsedDxfPlan: DxfImportPlan | null = null
  let parsedSvgText: string | null = null
  let parsedSvgPlan: SvgImportPlan | null = null
  let parsedIfcPlan: IfcImportPlan | null = null
  let parsedPdfPlan: PdfImportPlan | null = null
  let parsedJsonProject: SerializedProjectFile | null = null
  let parsedTopography: ParsedTopography | null = null

  function resetLoadedState(): void {
    loadedFileName = ''
    loadedMtlName = ''
    loadedMtlText = null
    loadedRawObjBuffer = null
    parsedModel = null
    parsedDxfText = null
    parsedDxfPlan = null
    parsedSvgText = null
    parsedSvgPlan = null
    parsedIfcPlan = null
    parsedPdfPlan = null
    parsedJsonProject = null
    parsedTopography = null
  }

  function hasValidSelectedFile(): boolean {
    return Boolean(
      loadedFileName &&
        ((parsedModel && parsedModel.meshCount > 0) ||
          (parsedDxfText && parsedDxfPlan && parsedDxfPlan.walls.length > 0) ||
          (parsedSvgText && parsedSvgPlan && parsedSvgPlan.walls.length > 0) ||
          (parsedIfcPlan &&
            (parsedIfcPlan.walls.length > 0 ||
              parsedIfcPlan.slabs.length > 0 ||
              parsedIfcPlan.columns.length > 0)) ||
          (parsedPdfPlan && parsedPdfPlan.walls.length > 0) ||
          (parsedJsonProject &&
            (parsedJsonProject.walls.length > 0 || parsedJsonProject.objects.length > 0)) ||
          (parsedTopography && parsedTopography.points.length > 0))
    )
  }

  function cleanup(): void {
    try {
      abortController.abort()
    } catch {
      /* ignore */
    }
    document.removeEventListener('keydown', onKey, true)
    resetLoadedState()
    isBusy = false
    isDialogOpen = false
    overlay.classList.add('is-hidden')
    overlay.innerHTML = ''
  }

  function close(value: ImportedFileResult | null = null): void {
    const resolve = settlePromise
    settlePromise = null
    try {
      resolve?.(value)
    } finally {
      cleanup()
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (overlay.classList.contains('is-hidden')) return
    if (event.key === 'Escape' && !isBusy) {
      event.preventDefault()
      event.stopPropagation()
      close(null)
    }
  }

  function open(initialCategory?: FormatCardDef['category']): Promise<ImportedFileResult | null> {
    if (isDialogOpen) {
      return Promise.resolve(null)
    }
    isDialogOpen = true
    isBusy = false
    abortController = new AbortController()

    return new Promise<ImportedFileResult | null>((resolve) => {
      settlePromise = resolve
      try {
        resetLoadedState()
        if (initialCategory) {
          activeCategory = initialCategory
          const firstInCat = FORMAT_CARDS.find((c) => c.category === initialCategory)
          if (firstInCat) activeCard = firstInCat.id
        } else {
          activeCategory = currentCardDef().category
        }
        overlay.classList.remove('is-hidden')
        renderModal()
        wireModal(abortController.signal)
        document.addEventListener('keydown', onKey, true)
      } catch {
        close(null)
      }
    })
  }

  function currentCardDef(): FormatCardDef {
    return FORMAT_CARDS.find((c) => c.id === activeCard) ?? FORMAT_CARDS[0]
  }

  function renderModal(): void {
    const card = currentCardDef()

    overlay.innerHTML = `
      <div class="exp-modal imp-modal max-w-5xl w-full bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="imp-modal-title">
        <header class="exp-header bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div class="exp-header-left flex items-center gap-3">
            <span class="exp-header-icon w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-600/30 shrink-0">
              ${icon('uploadCloud', 18)}
            </span>
            <div>
              <h3 class="exp-title text-base font-bold text-slate-100 tracking-tight" id="imp-modal-title">Importar archivo al proyecto</h3>
              <p class="exp-subtitle text-xs text-slate-400 mt-0.5">Modelos 3D, Planos 2D, Estructuras BIM y Documentos arquitectónicos</p>
            </div>
          </div>
          <button type="button" class="exp-close-btn w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" data-action="close" aria-label="Cerrar">
            ${icon('close', 16)}
          </button>
        </header>

        <div class="exp-body imp-body overflow-y-auto max-h-[85vh] p-6 space-y-4">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Columna izquierda: Selector de categorías + Cuadrícula de formatos (grid-cols-2 gap-3) -->
            <div class="lg:col-span-6 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Categoría y Formatos</span>
                <span class="text-[11px] text-sky-400 font-mono" data-selected-fmt-badge>${card.extLabel}</span>
              </div>

              <!-- Selector de categorías mediante pestañas limpias -->
              <div class="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80" role="tablist" aria-label="Categorías de importación">
                ${CATEGORIES.map(
                  (cat) => `
                  <button
                    type="button"
                    role="tab"
                    class="imp-category-tab flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
                      cat.id === activeCategory
                        ? 'is-active bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                    }"
                    data-category-tab="${cat.id}"
                    aria-selected="${cat.id === activeCategory ? 'true' : 'false'}"
                  >
                    ${cat.label}
                  </button>
                `
                ).join('')}
              </div>

              <!-- Cuadrícula de formatos: grid grid-cols-2 gap-3 con tarjetas p-3, icono, negrita y descripción debajo -->
              <div class="grid grid-cols-2 gap-3" data-format-cards-container>
                ${FORMAT_CARDS.map(
                  (c) => `
                  <button
                    type="button"
                    class="imp-card p-3 rounded-xl border border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/50 hover:border-slate-700/80 text-left transition-all flex flex-col justify-between group cursor-pointer relative ${
                      c.id === activeCard
                        ? 'is-selected border-sky-500 bg-sky-500/10 shadow-[0_0_12px_rgba(14,165,233,0.2)] ring-1 ring-sky-500/40'
                        : ''
                    } ${c.category !== activeCategory ? 'hidden' : ''}"
                    data-format-card="${c.id}"
                    data-card-category="${c.category}"
                    aria-pressed="${c.id === activeCard ? 'true' : 'false'}"
                  >
                    <div>
                      <div class="flex items-center justify-between gap-1">
                        <span class="w-8 h-8 rounded-lg bg-slate-800/90 flex items-center justify-center text-sky-400 group-hover:text-sky-300 shrink-0">
                          ${icon(c.icon, 18)}
                        </span>
                        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-400 font-medium">
                          ${c.extLabel}
                        </span>
                      </div>
                      <div class="font-bold text-xs text-slate-100 mt-2 truncate">
                        ${c.title}
                      </div>
                    </div>
                    <div class="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                      ${c.description}
                    </div>
                  </button>
                `
                ).join('')}
              </div>
            </div>

            <!-- Columna derecha: Dropzone (h-36), transformación 2x2, checkboxes, feedback -->
            <div class="lg:col-span-6 flex flex-col gap-3.5">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Archivo de origen (<span data-accepted-title>${card.title.toUpperCase()}</span>)
                  </span>
                  <span class="text-[11px] font-medium text-sky-400 px-2 py-0.5 rounded-full bg-sky-950/60 border border-sky-800/50" data-accepted-pill>
                    Admite: ${card.extLabel}
                  </span>
                </div>

                <!-- Dropzone con altura fija h-36 -->
                <div
                  class="imp-dropzone h-36 border-2 border-dashed border-slate-700 hover:border-sky-500/70 rounded-xl bg-slate-950/50 p-4 transition-all flex flex-col items-center justify-center text-center cursor-pointer group relative my-1"
                  data-dropzone
                  tabindex="0"
                  role="button"
                  aria-label="Zona para arrastrar o seleccionar archivo"
                >
                  <input
                    type="file"
                    class="hidden"
                    hidden
                    style="display: none;"
                    data-file-input
                    accept=".glb,.gltf,.obj,.mtl,.stl,.dxf,.csv,.txt,.xyz,.pts,.geojson,.svg,.ifc,.pdf,.arqproj,.json"
                    multiple
                  />
                  <div class="w-9 h-9 rounded-full bg-slate-800/80 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform mb-1 shrink-0">
                    ${icon('uploadCloud', 20)}
                  </div>
                  <div class="text-xs text-slate-200 font-medium" data-dropzone-title>
                    Arrastra y suelta tu archivo aquí o
                  </div>
                  <button
                    type="button"
                    class="mt-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                    data-browse-btn
                  >
                    Examinar archivo
                  </button>
                  <div class="text-[10px] text-slate-400 mt-1 line-clamp-1" data-dropzone-sub>
                    Detección automática de formato
                  </div>
                </div>
              </div>

              <!-- Parámetros de transformación: Cuadrícula compacta 2x2 -->
              <div class="space-y-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  Parámetros de transformación
                </span>
                <div class="grid grid-cols-2 gap-2.5">
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-slate-400 font-medium" for="imp-scale">Escala (factor)</label>
                    <input id="imp-scale" data-param-scale type="number" class="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500" value="1.0" min="0.0001" max="1000" step="0.1" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-slate-400 font-medium" for="imp-rot-y">Rotación en Y (°)</label>
                    <input id="imp-rot-y" data-param-rot-y type="number" class="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500" value="0" min="-360" max="360" step="5" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-slate-400 font-medium" for="imp-pos-x">Posición X (m)</label>
                    <input id="imp-pos-x" data-param-x type="number" class="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500" value="0" step="0.1" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-slate-400 font-medium" for="imp-pos-z">Posición Z (m)</label>
                    <input id="imp-pos-z" data-param-z type="number" class="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500" value="0" step="0.1" />
                  </div>
                  <input id="imp-pos-y" data-param-y type="hidden" value="0" />
                </div>

                <!-- Checkboxes alineados con items-center gap-2 -->
                <div class="flex flex-wrap items-center gap-4 pt-1">
                  <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium select-none">
                    <input type="checkbox" data-param-costs class="w-4 h-4 rounded text-sky-500 accent-sky-500 bg-slate-950 border-slate-700" />
                    <span>Incluir en cómputo / costos</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium select-none">
                    <input type="checkbox" data-param-center checked class="w-4 h-4 rounded text-sky-500 accent-sky-500 bg-slate-950 border-slate-700" />
                    <span>Centrar automáticamente en el origen</span>
                  </label>
                </div>
              </div>

              <!-- Estado / Feedback -->
              <div class="imp-feedback hidden text-xs p-3 rounded-lg border" data-feedback aria-live="polite"></div>
            </div>
          </div>
        </div>

        <footer class="exp-footer sticky bottom-0 bg-slate-900/98 backdrop-blur px-6 py-3.5 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div class="exp-status flex items-center gap-2 text-xs text-slate-400 max-w-sm truncate">
            <span class="exp-status-dot w-2 h-2 rounded-full bg-sky-500 shrink-0" data-status-dot></span>
            <span class="exp-status-text truncate" data-status-text>Selecciona o arrastra un archivo para previsualizar</span>
          </div>
          <div class="exp-actions flex items-center gap-3">
            <button type="button" class="exp-btn-secondary px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80 transition-colors" data-action="cancel">Cancelar</button>
            <button type="button" class="exp-btn-primary imp-submit-btn px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-600/25 transition-all flex items-center gap-2 disabled:opacity-50" data-action="submit" disabled>
              <span class="imp-submit-icon" data-submit-icon>${icon('uploadCloud', 15)}</span>
              <span data-submit-label>Importar al proyecto</span>
            </button>
          </div>
        </footer>
      </div>
    `
  }

  function wireModal(signal: AbortSignal): void {
    const dropzone = overlay.querySelector<HTMLElement>('[data-dropzone]')!
    const fileInput = overlay.querySelector<HTMLInputElement>('[data-file-input]')!
    const dropzoneTitle = overlay.querySelector<HTMLElement>('[data-dropzone-title]')!
    const dropzoneSub = overlay.querySelector<HTMLElement>('[data-dropzone-sub]')!
    const acceptedPill = overlay.querySelector<HTMLElement>('[data-accepted-pill]')!
    const feedbackEl = overlay.querySelector<HTMLElement>('[data-feedback]')!
    const statusDot = overlay.querySelector<HTMLElement>('[data-status-dot]')!
    const statusText = overlay.querySelector<HTMLElement>('[data-status-text]')!
    const submitBtn = overlay.querySelector<HTMLButtonElement>('[data-action="submit"]')!
    const submitIcon = overlay.querySelector<HTMLElement>('[data-submit-icon]')!
    const submitLabel = overlay.querySelector<HTMLElement>('[data-submit-label]')!

    const scaleInput = overlay.querySelector<HTMLInputElement>('[data-param-scale]')!
    const xInput = overlay.querySelector<HTMLInputElement>('[data-param-x]')!
    const yInput = overlay.querySelector<HTMLInputElement>('[data-param-y]')!
    const zInput = overlay.querySelector<HTMLInputElement>('[data-param-z]')!
    const rotYInput = overlay.querySelector<HTMLInputElement>('[data-param-rot-y]')!
    const costsCheckbox = overlay.querySelector<HTMLInputElement>('[data-param-costs]')!
    const centerCheckbox = overlay.querySelector<HTMLInputElement>('[data-param-center]')!

    function updateCategoryTabsUi(): void {
      overlay.querySelectorAll<HTMLElement>('[data-category-tab]').forEach((tab) => {
        const isCurrent = tab.dataset.categoryTab === activeCategory
        tab.classList.toggle('is-active', isCurrent)
        tab.classList.toggle('bg-sky-500/15', isCurrent)
        tab.classList.toggle('text-sky-400', isCurrent)
        tab.classList.toggle('border-sky-500/30', isCurrent)
        tab.classList.toggle('font-semibold', isCurrent)
        tab.classList.toggle('text-slate-400', !isCurrent)
        tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false')
      })
      overlay.querySelectorAll<HTMLElement>('[data-format-card]').forEach((card) => {
        const cardCat = card.dataset.cardCategory
        card.classList.toggle('hidden', cardCat !== activeCategory)
      })
    }

    function getTransformParams(): {
      scale: number
      x: number
      y: number
      z: number
      rotYDeg: number
      rotYRad: number
      includeInCosts: boolean
      centerAtOrigin: boolean
    } {
      const rawScale = Number(scaleInput.value)
      const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.min(1000, rawScale) : 1
      const x = Number.isFinite(Number(xInput.value)) ? Number(xInput.value) : 0
      const y = Number.isFinite(Number(yInput.value)) ? Number(yInput.value) : 0
      const z = Number.isFinite(Number(zInput.value)) ? Number(zInput.value) : 0
      const rotYDeg = Number.isFinite(Number(rotYInput.value)) ? Number(rotYInput.value) : 0
      const rotYRad = (rotYDeg * Math.PI) / 180
      return {
        scale,
        x,
        y,
        z,
        rotYDeg,
        rotYRad,
        includeInCosts: costsCheckbox.checked,
        centerAtOrigin: centerCheckbox.checked
      }
    }

    function setFeedback(type: 'ok' | 'error' | 'warn' | 'loading' | null, message: string, detail?: string): void {
      if (!type) {
        feedbackEl.className = 'imp-feedback hidden'
        feedbackEl.innerHTML = ''
        return
      }
      feedbackEl.className = `imp-feedback imp-feedback--${type} block`
      const ic =
        type === 'error'
          ? icon('alert', 16)
          : type === 'loading'
            ? `<span class="imp-spinner">${icon('loader', 16)}</span>`
            : type === 'warn'
              ? icon('info', 16)
              : icon('checkCircle', 16)
      feedbackEl.innerHTML = `
        <div class="imp-feedback-icon shrink-0 mt-0.5">${ic}</div>
        <div class="imp-feedback-content">
          <div class="imp-feedback-title font-semibold">${message}</div>
          ${detail ? `<div class="imp-feedback-detail text-slate-300 mt-0.5 leading-relaxed">${detail}</div>` : ''}
        </div>
      `
    }

    function setLoadingState(loading: boolean, labelText?: string): void {
      isBusy = loading
      if (loading) {
        submitBtn.disabled = true
        submitIcon.innerHTML = `<span class="imp-spinner">${icon('loader', 15)}</span>`
        submitLabel.textContent = labelText ?? 'Procesando archivo…'
        statusDot.className = 'exp-status-dot is-busy'
        statusText.textContent = labelText ?? 'Analizando geometría…'
      } else {
        submitBtn.disabled = !hasValidSelectedFile()
        submitIcon.innerHTML = icon('uploadCloud', 15)
        submitLabel.textContent = 'Importar al proyecto'
        statusDot.className = 'exp-status-dot'
      }
    }

    function selectFormatCard(cardId: ImportCardId, clearCurrentFile = false): void {
      activeCard = cardId
      const def = currentCardDef()
      if (def.category !== activeCategory) {
        activeCategory = def.category
        updateCategoryTabsUi()
      }
      overlay.querySelectorAll<HTMLElement>('[data-format-card]').forEach((btn) => {
        const isCurrent = btn.dataset.formatCard === cardId
        btn.classList.toggle('is-selected', isCurrent)
        btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false')
      })
      const acceptedTitle = overlay.querySelector<HTMLElement>('[data-accepted-title]')
      if (acceptedTitle) acceptedTitle.textContent = def.title.toUpperCase()
      const fmtBadge = overlay.querySelector<HTMLElement>('[data-selected-fmt-badge]')
      if (fmtBadge) fmtBadge.textContent = def.extLabel
      acceptedPill.textContent = `Admite: ${def.extLabel}`
      if (clearCurrentFile) {
        resetLoadedState()
        dropzone.classList.remove('has-file', 'has-error')
        dropzoneTitle.innerHTML = `Arrastra y suelta tu archivo <strong>${def.extLabel}</strong> aquí o`
        dropzoneSub.textContent = def.description
        setFeedback(null, '')
        submitBtn.disabled = true
        statusText.textContent = `Formato activo: ${def.title} (${def.extLabel})`
      }
    }

    function refreshPreviewSummary(): void {
      const params = getTransformParams()
      if (parsedModel) {
        const size = parsedModel.bbox
          .getSize(new THREE.Vector3())
          .multiplyScalar(params.scale)
        const dimStr = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`
        const mtlNote =
          activeCard === 'obj'
            ? loadedMtlName
              ? ` · Material MTL: ${loadedMtlName}`
              : ' · Material estándar neutro'
            : ''
        setFeedback(
          'ok',
          `Modelo 3D listo: ${loadedFileName}`,
          `${parsedModel.meshCount} ${parsedModel.meshCount === 1 ? 'malla detectada' : 'mallas detectadas'} · BoundingBox escalado: ${dimStr}${mtlNote} · Destino: (${params.x}, ${params.y}, ${params.z}) m, Rot Y: ${params.rotYDeg}°.`
        )
        statusText.textContent = `Listo para insertar (${parsedModel.meshCount} mallas)`
        submitBtn.disabled = false
      } else if (parsedDxfPlan) {
        const wCount = parsedDxfPlan.walls.length
        const skippedNote = parsedDxfPlan.skipped > 0 ? ` · ${parsedDxfPlan.skipped} trazos omitidos` : ''
        const textNote =
          parsedDxfPlan.textCount > 0 ? ` · ${parsedDxfPlan.textCount} textos ignorados` : ''
        setFeedback(
          'ok',
          `Plano DXF validado: ${loadedFileName}`,
          `${wCount} ${wCount === 1 ? 'muro inferido' : 'muros inferidos'} (factor unidades: ${parsedDxfPlan.unitFactor}, escala inserción: ×${params.scale})${skippedNote}${textNote}.`
        )
        statusText.textContent = `Listo para insertar (${wCount} muros)`
        submitBtn.disabled = false
      } else if (parsedSvgPlan) {
        const wCount = parsedSvgPlan.walls.length
        setFeedback(
          'ok',
          `Plano vectorial SVG validado: ${loadedFileName}`,
          `${wCount} ${wCount === 1 ? 'trazo/muro' : 'trazos/muros'} extraídos de ${parsedSvgPlan.pathCount} trayectorias vectoriales · Escala: ×${params.scale}.`
        )
        statusText.textContent = `Listo para insertar (${wCount} trazos de planta)`
        submitBtn.disabled = false
      } else if (parsedIfcPlan) {
        const wCount = parsedIfcPlan.walls.length
        const sCount = parsedIfcPlan.slabs.length
        const cCount = parsedIfcPlan.columns.length
        const oCount = parsedIfcPlan.openings.length
        const rCount = parsedIfcPlan.roofs.length + parsedIfcPlan.furnishings.length
        setFeedback(
          'ok',
          `Modelo BIM IFC4 validado: ${loadedFileName}`,
          `Proyecto: «${parsedIfcPlan.projectName ?? 'Sin título'}» · ${wCount} muros (IfcWall), ${sCount} losas (IfcSlab), ${cCount} columnas (IfcColumn), ${oCount} vanos y ${rCount} elementos adicionales.`
        )
        statusText.textContent = `Listo para integrar elementos BIM`
        submitBtn.disabled = false
      } else if (parsedPdfPlan) {
        const wCount = parsedPdfPlan.walls.length
        setFeedback(
          'ok',
          `Plano PDF vectorial validado: ${loadedFileName}`,
          `${wCount} ${wCount === 1 ? 'muro inferido' : 'muros inferidos'} a partir de ${parsedPdfPlan.lineCount} segmentos vectoriales.`
        )
        statusText.textContent = `Listo para insertar (${wCount} muros)`
        submitBtn.disabled = false
      } else if (parsedJsonProject) {
        const wCount = parsedJsonProject.walls.length
        const oCount = parsedJsonProject.objects.length
        const lCount = parsedJsonProject.levels.length
        setFeedback(
          'ok',
          `Proyecto nativo de Open Form Studio validado: «${parsedJsonProject.metadata.name}»`,
          `Reconstruirá el lienzo con ${wCount} muros, ${oCount} objetos/muebles, ${lCount} ${lCount === 1 ? 'nivel' : 'niveles'}, configuración de capas y cámara (${parsedJsonProject.camera.viewMode.toUpperCase()}).`
        )
        statusText.textContent = `Listo para cargar proyecto (${wCount} muros, ${oCount} objetos)`
        submitBtn.disabled = false
      } else if (parsedTopography) {
        const pts = parsedTopography.points.length
        const w = (parsedTopography.bounds.width * params.scale).toFixed(1)
        const d = (parsedTopography.bounds.depth * params.scale).toFixed(1)
        const minZ = (parsedTopography.bounds.minZ * params.scale).toFixed(2)
        const maxZ = (parsedTopography.bounds.maxZ * params.scale).toFixed(2)
        const contoursNote =
          parsedTopography.contourLinesCount > 0
            ? ` · ${parsedTopography.contourLinesCount} curvas/polilíneas 3D`
            : ''
        setFeedback(
          'ok',
          `Mapa topográfico ${parsedTopography.format} listo: ${loadedFileName}`,
          `${pts} puntos 3D (X,Y,Z)${contoursNote} · Área: ${w} × ${d} m · Cotas Z: [${minZ} m a ${maxZ} m]. Generará malla TerrainMesh 3D con curvas de nivel.`
        )
        statusText.textContent = `Listo para generar terreno 3D (${pts} puntos)`
        submitBtn.disabled = false
      }
    }

    async function processLoadedBuffer(fileName: string, buffer: ArrayBuffer): Promise<void> {
      const ext = extOf(fileName)
      const detectedCard = cardForExtension(ext, activeCategory)
      if (!detectedCard) {
        dropzone.classList.remove('has-file')
        dropzone.classList.add('has-error')
        submitBtn.disabled = true
        setFeedback(
          'error',
          `Extensión no admitida (.${ext || 'desconocida'})`,
          'Formatos soportados: .glb, .gltf, .obj (+ .mtl), .stl, .dxf, .csv, .txt, .geojson, .svg, .ifc, .pdf, .arqproj y .json.'
        )
        statusText.textContent = 'Error: formato no compatible'
        return
      }

      // Si el usuario suelta un archivo .mtl directamente, lo asociamos al flujo OBJ
      if (ext === 'mtl') {
        selectFormatCard('obj', false)
        loadedMtlName = fileName
        loadedMtlText = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
        if (loadedRawObjBuffer && loadedFileName) {
          await parseAndPrepareFile(loadedFileName, loadedRawObjBuffer)
        } else {
          setFeedback(
            'warn',
            `Archivo de materiales «${fileName}» listo`,
            'Ahora selecciona o arrastra el archivo geométrico .OBJ correspondiente.'
          )
        }
        return
      }

      if (detectedCard !== activeCard) {
        selectFormatCard(detectedCard, false)
      }

      await parseAndPrepareFile(fileName, buffer)
    }

    async function parseAndPrepareFile(fileName: string, buffer: ArrayBuffer): Promise<void> {
      const prevMtlName = loadedMtlName
      const prevMtlText = loadedMtlText
      resetLoadedState()
      if (activeCard === 'obj') {
        loadedMtlName = prevMtlName
        loadedMtlText = prevMtlText
        loadedRawObjBuffer = buffer
      }

      loadedFileName = fileName
      const ext = extOf(fileName)
      setLoadingState(true, `Analizando «${fileName}»…`)
      setFeedback('loading', `Analizando «${fileName}»…`, 'Verificando integridad y geometría del archivo.')

      try {
        if (ext === 'glb' || ext === 'gltf' || ext === 'obj' || ext === 'stl') {
          const fmt: Model3DFormat =
            ext === 'gltf' ? 'gltf' : ext === 'obj' ? 'obj' : ext === 'stl' ? 'stl' : 'glb'
          const model = await loadModel(buffer, fmt, {
            mtlText: fmt === 'obj' ? (loadedMtlText ?? undefined) : undefined
          })
          if (model.meshCount === 0) {
            throw new Error(`El archivo ${ext.toUpperCase()} no contiene ninguna malla 3D con geometría válida.`)
          }
          parsedModel = model
        } else if (ext === 'csv' || ext === 'txt' || ext === 'xyz' || ext === 'pts' || ext === 'geojson') {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
          parsedTopography = parseTopographyFile(text, fileName)
        } else if (ext === 'dxf') {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
          if (activeCard === 'topo-dxf' || activeCategory === 'topo') {
            parsedTopography = parseTopographyFile(text, fileName)
          } else {
            const parsed = parseDxf(text)
            const plan = inferWalls(parsed)
            if (plan.walls.length === 0) {
              // Si el DXF contiene polilíneas 3D / puntos topográficos pero no muros 2D, auto-detectar topografía
              try {
                const topo = parseTopographyFile(text, fileName)
                if (topo.points.length >= 3) {
                  selectFormatCard('topo-dxf', false)
                  parsedTopography = topo
                }
              } catch {
                /* mantener error 2D original */
              }
              if (!parsedTopography) {
                throw new Error(
                  plan.textCount > 0
                    ? `El archivo DXF solo contiene ${plan.textCount} entidades de texto y ninguna entidad geométrica (LINE, LWPOLYLINE, CIRCLE, ARC).`
                    : 'No se encontraron entidades geométricas (LINE, LWPOLYLINE, CIRCLE, ARC) válidas en el archivo DXF.'
                )
              }
            } else {
              parsedDxfText = text
              parsedDxfPlan = plan
            }
          }
        } else if (ext === 'svg') {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
          const parsed = parseSvg(text)
          const plan = planSvgImport(parsed, 1)
          if (plan.walls.length === 0) {
            throw new Error('El archivo SVG no contiene trazos vectoriales convertibles en planta.')
          }
          parsedSvgText = text
          parsedSvgPlan = plan
        } else if (ext === 'ifc') {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
          if (!text.includes('ISO-10303-21') && !text.includes('DATA;')) {
            throw new Error('El archivo no tiene una cabecera STEP / IFC4 válida (ISO-10303-21).')
          }
          const parsed = parseIfc(text)
          const plan = planIfcImport(parsed)
          const total =
            plan.walls.length +
            plan.openings.length +
            plan.slabs.length +
            plan.columns.length +
            plan.roofs.length +
            plan.furnishings.length
          if (total === 0) {
            throw new Error(
              'No se encontraron entidades IFC geométricas compatibles (IfcWall, IfcSlab, IfcColumn, IfcDoor, IfcWindow).'
            )
          }
          parsedIfcPlan = plan
        } else if (ext === 'pdf') {
          const lines = await extractPdfLines(buffer, { disableWorker: true })
          const scale = getTransformParams().scale * 0.001
          const plan = planPdfImport(lines, scale)
          if (plan.walls.length === 0) {
            throw new Error(
              'No se encontraron trazos vectoriales en el PDF (puede tratarse de una imagen escaneada sin vectores).'
            )
          }
          parsedPdfPlan = plan
        } else if (ext === 'arqproj' || ext === 'json') {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
          if (ext === 'json' && (activeCard === 'topo-geojson' || activeCategory === 'topo')) {
            parsedTopography = parseTopographyFile(text, 'mapa.geojson')
          } else {
            try {
              parsedJsonProject = parseProjectJson(text)
            } catch (jsonErr) {
              if (ext === 'json') {
                try {
                  const topo = parseTopographyFile(text, 'mapa.geojson')
                  selectFormatCard('topo-geojson', false)
                  parsedTopography = topo
                } catch {
                  throw jsonErr
                }
              } else {
                throw jsonErr
              }
            }
          }
        } else {
          throw new Error(`Extensión de archivo no soportada: .${ext}`)
        }

        dropzone.classList.remove('has-error')
        dropzone.classList.add('has-file')
        dropzoneTitle.innerHTML = `Archivo cargado: <strong>${fileName}</strong> <span class="imp-dropzone-link">(cambiar archivo)</span>`
        dropzoneSub.textContent = `${(buffer.byteLength / 1024).toFixed(1)} KB · Formato ${ext.toUpperCase()} verificado correctamente`
        setLoadingState(false)
        refreshPreviewSummary()
      } catch (err) {
        resetLoadedState()
        dropzone.classList.remove('has-file')
        dropzone.classList.add('has-error')
        setLoadingState(false)
        submitBtn.disabled = true
        const msg = err instanceof Error ? err.message : 'Error al procesar el archivo seleccionado.'
        setFeedback('error', `Error al analizar «${fileName}»`, msg)
        statusText.textContent = 'Archivo inválido o con errores de lectura'
      }
    }

    async function openNativeBrowse(): Promise<void> {
      if (isBusy) return
      const card = currentCardDef()
      if (app?.openDialog && app?.readFile) {
        try {
          const picked = await app.openDialog({
            title: `Importar ${card.title}`,
            filters: [
              { name: card.title, extensions: card.extensions },
              {
                name: 'Todos los formatos admitidos',
                extensions: [
                  'glb',
                  'gltf',
                  'obj',
                  'mtl',
                  'stl',
                  'dxf',
                  'csv',
                  'txt',
                  'xyz',
                  'pts',
                  'geojson',
                  'svg',
                  'ifc',
                  'pdf',
                  'arqproj',
                  'json'
                ]
              }
            ]
          })
          if (picked.canceled || !picked.filePaths?.[0]) return
          const filePath = picked.filePaths[0]
          const raw = await app.readFile({ filePath })
          const base64 = typeof raw === 'string' ? raw : (raw as { data?: string })?.data
          if (typeof base64 !== 'string') {
            setFeedback('error', 'Error de lectura', 'No se pudo leer el archivo desde el sistema local.')
            return
          }
          const buffer = base64ToArrayBuffer(base64)
          await processLoadedBuffer(fileNameOf(filePath), buffer)
          return
        } catch {
          // Si falla el diálogo IPC, cae al input file estándar
        }
      }
      fileInput.value = ''
      fileInput.click()
    }

    async function handleBrowserFiles(fileList: FileList | null): Promise<void> {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList)
      // Si se arrastran juntos un .obj y un .mtl, cargamos primero el .mtl
      const mtlFile = files.find((f) => extOf(f.name) === 'mtl')
      const mainFile = files.find((f) => extOf(f.name) !== 'mtl') ?? files[0]

      if (mtlFile && mainFile !== mtlFile) {
        const mtlBuf = await mtlFile.arrayBuffer()
        loadedMtlName = mtlFile.name
        loadedMtlText = new TextDecoder('utf-8').decode(new Uint8Array(mtlBuf))
      }

      const mainBuf = await mainFile.arrayBuffer()
      await processLoadedBuffer(mainFile.name, mainBuf)
    }

    async function executeImport(): Promise<void> {
      if (isBusy) return
      const selectedFile = hasValidSelectedFile()
      if (!selectedFile) return
      const params = getTransformParams()
      const cleanProjectName =
        loadedFileName.replace(/\.[^.]+$/, '').trim() || 'Proyecto importado'

      setLoadingState(true, 'Importando al proyecto…')

      const result: ImportedFileResult = {
        fileName: loadedFileName,
        projectName: cleanProjectName,
        format: activeCard,
        hasContent: true,
        parsedModel,
        parsedDxf: parsedDxfText && parsedDxfPlan ? { text: parsedDxfText, plan: parsedDxfPlan } : null,
        parsedSvg: parsedSvgText && parsedSvgPlan ? { text: parsedSvgText, plan: parsedSvgPlan } : null,
        parsedIfcPlan,
        parsedPdfPlan,
        parsedJsonProject,
        parsedTopography,
        transformParams: params
      }

      try {
        if (scene && history) {
          if (parsedTopography) {
            const terrainObj = createImportedTerrainObject(parsedTopography, loadedFileName, params)
            history.transaction(`Importar Topografía ${parsedTopography.format}`, () => {
              scene.addObject(terrainObj)
              scene.selectObject(terrainObj)
            })
            const msg = `Terreno 3D generado (${parsedTopography.points.length} puntos · ${terrainObj.size.x.toFixed(1)}×${terrainObj.size.z.toFixed(1)} m · cotas Z [${terrainObj.terrainData!.minElev.toFixed(2)}m, ${terrainObj.terrainData!.maxElev.toFixed(2)}m]).`
            statusBar?.setMessage(msg)
            showToast({
              title: 'Terreno topográfico 3D generado',
              subtitle: msg
            })
            close(result)
            onImportSuccess?.(cleanProjectName)
            return
          }

          if (parsedModel) {
            const cleanObjName = loadedFileName.replace(/\.(glb|gltf|obj|stl)$/i, '') || 'Modelo 3D'
            const modelOpts: ImportModelOptions = {
              scale: new THREE.Vector3(params.scale, params.scale, params.scale),
              position: new THREE.Vector3(params.x, params.y, params.z),
              rotationY: params.rotYRad,
              centerAtOrigin: params.centerAtOrigin,
              includeInCosts: params.includeInCosts,
              objectName: cleanObjName
            }
            const created = createImportedObjects(parsedModel, modelOpts)
            history.transaction(`Importar ${parsedModel.format.toUpperCase()}`, () => {
              for (const obj of created) {
                scene.addObject(obj)
              }
            })
            const msg = `Importar ${parsedModel.format.toUpperCase()}: ${created.length} ${created.length === 1 ? 'malla añadida' : 'mallas añadidas'} a la escena.`
            statusBar?.setMessage(msg)
            showToast({ title: 'Modelo 3D importado correctamente', subtitle: `${cleanObjName} (${created.length} mallas)` })
            close(result)
            onImportSuccess?.(cleanProjectName)
            return
          }

          if (parsedDxfText && parsedDxfPlan) {
            let dxfRes = { ok: false, walls: 0, skipped: 0, message: '' }
            history.transaction('Importar DXF', () => {
              dxfRes = applyDxfImport(scene, parsedDxfText!, {
                scale: params.scale,
                position: { x: params.x, y: params.y, z: params.z },
                rotationY: params.rotYRad,
                centerAtOrigin: params.centerAtOrigin
              })
            })
            if (!dxfRes.ok) throw new Error(dxfRes.message)
            statusBar?.setMessage(dxfRes.message)
            showToast({ title: 'Plano DXF importado correctamente', subtitle: dxfRes.message })
            close(result)
            onImportSuccess?.(cleanProjectName)
            return
          }

          if (parsedSvgText && parsedSvgPlan) {
            let svgRes = { ok: false, walls: 0, skipped: 0, message: '' }
            history.transaction('Importar SVG', () => {
              svgRes = applySvgImport(scene, parsedSvgText!, {
                scale: params.scale,
                position: { x: params.x, y: params.y, z: params.z },
                rotationY: params.rotYRad,
                centerAtOrigin: params.centerAtOrigin
              })
            })
            if (!svgRes.ok) throw new Error(svgRes.message)
            statusBar?.setMessage(svgRes.message)
            showToast({ title: 'Plano SVG importado correctamente', subtitle: svgRes.message })
            close(result)
            onImportSuccess?.(cleanProjectName)
            return
          }

          if (parsedIfcPlan) {
            let ifcRes = { ok: false, walls: 0, openings: 0, slabs: 0, columns: 0, objects: 0, message: '' }
            history.transaction('Importar IFC', () => {
              ifcRes = applyIfcImport(scene, parsedIfcPlan!, {
                scale: params.scale,
                position: { x: params.x, y: params.y, z: params.z },
                rotationY: params.rotYRad,
                centerAtOrigin: params.centerAtOrigin,
                includeInCosts: params.includeInCosts
              })
            })
            if (!ifcRes.ok) throw new Error(ifcRes.message)
            statusBar?.setMessage(ifcRes.message)
            showToast({ title: 'Modelo BIM IFC importado', subtitle: ifcRes.message })
            close(result)
            onImportSuccess?.(parsedIfcPlan.projectName || cleanProjectName)
            return
          }

          if (parsedPdfPlan) {
            let pdfRes = { ok: false, walls: 0, skipped: 0, message: '' }
            history.transaction('Importar PDF', () => {
              pdfRes = applyPdfImport(scene, parsedPdfPlan!, {
                scale: params.scale,
                position: { x: params.x, y: params.y, z: params.z },
                rotationY: params.rotYRad,
                centerAtOrigin: params.centerAtOrigin
              })
            })
            if (!pdfRes.ok) throw new Error(pdfRes.message)
            statusBar?.setMessage(pdfRes.message)
            showToast({ title: 'Plano PDF importado correctamente', subtitle: pdfRes.message })
            close(result)
            onImportSuccess?.(cleanProjectName)
            return
          }

          if (parsedJsonProject) {
            const projectToLoad = parsedJsonProject
            history.transaction(`Cargar proyecto ${projectToLoad.metadata.name}`, () => {
              applySerializedProjectToWorkspace(projectToLoad, {
                scene,
                layers,
                cameraController,
                setViewMode,
                onRestoreAnimation
              })
            })
            const msg = `Proyecto «${projectToLoad.metadata.name}» reconstruido (${projectToLoad.walls.length} muros, ${projectToLoad.objects.length} objetos).`
            statusBar?.setMessage(msg)
            showToast({ title: 'Proyecto cargado correctamente', subtitle: msg })
            close(result)
            onImportSuccess?.(projectToLoad.metadata.name, projectToLoad)
            return
          }
        } else {
          // Importación iniciada desde el dashboard (sin escena activa aún)
          close(result)
          return
        }
      } catch (err) {
        setLoadingState(false)
        submitBtn.disabled = !hasValidSelectedFile()
        const msg = err instanceof Error ? err.message : 'Error inesperado durante la importación.'
        setFeedback('error', 'No se pudo completar la importación', msg)
      }
    }

    // Eventos del selector de categorías (Pestañas limpias)
    overlay.querySelectorAll<HTMLButtonElement>('[data-category-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const catId = tabBtn.dataset.categoryTab as FormatCardDef['category']
        if (catId && catId !== activeCategory) {
          activeCategory = catId
          updateCategoryTabsUi()
          const firstInCat = FORMAT_CARDS.find((c) => c.category === catId)
          if (firstInCat && activeCard !== firstInCat.id) {
            selectFormatCard(firstInCat.id, true)
          }
        }
      }, { signal })
    })

    // Botón "Examinar archivo" explícito dentro de la dropzone
    overlay.querySelector<HTMLElement>('[data-browse-btn]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      void openNativeBrowse()
    }, { signal })

    // Eventos de las tarjetas de formato
    overlay.querySelectorAll<HTMLButtonElement>('[data-format-card]').forEach((cardBtn) => {
      cardBtn.addEventListener('click', () => {
        const id = cardBtn.dataset.formatCard as ImportCardId
        if (id && id !== activeCard) {
          selectFormatCard(id, true)
        }
      }, { signal })
    })

    // Eventos de la Dropzone (clic + teclado + arrastrar y soltar)
    dropzone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('input[type="file"]')) return
      void openNativeBrowse()
    }, { signal })
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        void openNativeBrowse()
      }
    }, { signal })
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropzone.classList.add('is-dragover')
    }, { signal })
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropzone.classList.remove('is-dragover')
    }, { signal })
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropzone.classList.remove('is-dragover')
      void handleBrowserFiles(e.dataTransfer?.files ?? null)
    }, { signal })

    fileInput.addEventListener('change', () => {
      void handleBrowserFiles(fileInput.files)
    }, { signal })

    // Cambios en los parámetros de inserción actualizan la vista previa en vivo
    ;[scaleInput, xInput, yInput, zInput, rotYInput, costsCheckbox, centerCheckbox].forEach((el) => {
      el.addEventListener('input', refreshPreviewSummary, { signal })
      el.addEventListener('change', refreshPreviewSummary, { signal })
    })

    // Botones de cerrar / cancelar / importar
    overlay.querySelectorAll<HTMLElement>('[data-action="close"], [data-action="cancel"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isBusy) close(null)
      }, { signal })
    })

    submitBtn.addEventListener('click', () => {
      void executeImport()
    }, { signal })

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !isBusy) close(null)
    }, { signal })
  }

  return {
    open,
    close: (res: ImportedFileResult | null = null) => close(res),
    isOpen: () => isDialogOpen
  }
}

export function openImportDialog(
  overlay: HTMLElement,
  options?: ImportDialogOptions
): Promise<ImportedFileResult | null> {
  const dialog = mountImportDialog(overlay, options)
  return dialog.open()
}
