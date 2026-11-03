import {
  QUALITY_LABELS,
  QUALITY_LEVELS,
  exportProjectTextures,
  getMaterialDef,
  getMaterialOverride,
  getQuality,
  getTexture,
  listMaterialOverrides,
  setMaterialOverride,
  setQuality,
  type MaterialDef,
  type QualityLevel
} from '../engine/MaterialSystem'
import { MATERIAL_CATALOG, MATERIAL_CATEGORIES, type MaterialCatalogItem, type MaterialCategory } from '../catalog/materials'
import { databaseService, type SceneTexture } from '../services/DatabaseService'
import { icon } from './icons'
import { t } from '../i18n/es'

/**
 * Paleta de materiales (Fase 1).
 *
 * Panel lateral con: miniaturas procedurales, buscador, categorías,
 * favoritos (localStorage), arrastrar‑y‑soltar sobre el lienzo, edición
 * rápida de un material (tinte, rugosidad, metalness, opacidad, escala)
 * persistida por proyecto, importación/exportación de texturas (SQLite
 * `texturas`) y selector de calidad del motor (baja / media / alta).
 */

export interface MaterialPaletteOptions {
  /** Aplica `materialId` a la selección actual (muro u objeto). */
  onApply: (materialId: string, label: string) => void
  /** Cambia la calidad del motor; el llamante la persiste. */
  onQualityChange: (level: QualityLevel) => void
  /** Id del proyecto abierto (para las texturas importadas); `null` sin proyecto. */
  getProjectId: () => string | null
  /** Fase 1: id del usuario autenticado (las texturas se guardan con su dueño). */
  getOwnerId: () => string | null
  /** Aviso para la barra de estado. */
  onMessage: (message: string) => void
  /** Las mallas deben reconstruirse (override de material aplicado). */
  onOverrideChanged: () => void
}

export interface MaterialPaletteHandle {
  /** Repinta el panel (selección, catálogo, favoritos…). */
  refresh(): void
  /** Sustituye la lista de texturas importadas (al cargar el proyecto). */
  setTextures(textures: SceneTexture[]): void
  /** Texturas importadas vigentes (para guardarlas con la escena). */
  getTextures(): SceneTexture[]
  /** Lee del proyecto los overrides de material persistidos y los aplica. */
  loadProjectSettings(): Promise<void>
}

type TabId = MaterialCategory | 'todos' | 'favoritos' | 'texturas'

const FAVORITES_KEY = 'arqstudio.materials.favorites'

/** Favoritos persistidos en `localStorage` (globales, no por proyecto). */
function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]))
  } catch {
    /* sin almacenamiento: los favoritos quedan sólo en memoria */
  }
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

/** Convierte `#RRGGBB` (input color) a número; `0xffffff` si no es válido. */
function parseHexColor(value: string): number {
  const parsed = Number.parseInt(value.replace('#', ''), 16)
  return Number.isNaN(parsed) ? 0xffffff : parsed
}

/** Descarga un data-URL como archivo (export de texturas). */
function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** Lee un `File` como data-URL (Promise). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

/** Dimensiones naturales de una imagen en data-URL (0 si no se pueden leer). */
function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = dataUrl
  })
}

/* ---------- Miniaturas procedurales ---------- */

/**
 * Miniaturas (64 px) de las texturas del catálogo, generadas una sola vez y
 * cacheadas como data-URL. Si la textura aún no existe, `getTexture` la
 * genera al tamaño de la calidad actual y aquí se reduce.
 */
const miniCache = new Map<string, string>()

function miniatureUrl(def: MaterialDef | null): string {
  const kind = def?.texture ?? null
  if (!kind) return ''
  const cached = miniCache.get(kind)
  if (cached) return cached
  try {
    const source = getTexture(kind).image as HTMLCanvasElement | undefined
    if (!source || !source.width) return ''
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(source, 0, 0, 64, 64)
    const url = canvas.toDataURL('image/png')
    miniCache.set(kind, url)
    return url
  } catch {
    return ''
  }
}

/* ---------- Montaje ---------- */

export function mountMaterialPalette(container: HTMLElement, options: MaterialPaletteOptions): MaterialPaletteHandle {
  let activeTab: TabId = 'todos'
  let query = ''
  let editingId: string | null = null
  let textures: SceneTexture[] = []
  const favorites = loadFavorites()

  const body = document.createElement('div')
  body.className = 'mat-palette'

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/png,image/jpeg,image/webp'
  fileInput.className = 'mat-palette__file'
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void importTexture(file)
  })

  container.innerHTML = ''
  container.appendChild(body)
  container.appendChild(fileInput)

  /* ---------- Filtrado ---------- */

  function visibleMaterials(): readonly MaterialCatalogItem[] {
    let list: readonly MaterialCatalogItem[] = MATERIAL_CATALOG
    if (activeTab === 'favoritos') list = list.filter((item) => favorites.has(item.id))
    else if (activeTab !== 'todos' && activeTab !== 'texturas') {
      list = list.filter((item) => item.category === activeTab)
    }
    const needle = query.trim().toLowerCase()
    if (needle) {
      list = list.filter(
        (item) => item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)
      )
    }
    return list
  }

  /* ---------- Persistencia ---------- */

  async function persistOverrides(): Promise<void> {
    const projectId = options.getProjectId()
    if (!projectId) return
    await databaseService.setSetting(
      `arqstudio.materialOverrides.${projectId}`,
      JSON.stringify(listMaterialOverrides())
    )
  }

  function loadProjectSettings(): Promise<void> {
    const projectId = options.getProjectId()
    // Limpia los overrides del proyecto anterior.
    for (const id of Object.keys(listMaterialOverrides())) setMaterialOverride(id, null)
    if (!projectId) {
      render()
      return Promise.resolve()
    }
    return databaseService
      .getSetting(`arqstudio.materialOverrides.${projectId}`)
      .then((raw) => {
        if (!raw) return
        try {
          const parsed = JSON.parse(raw) as Record<string, Partial<MaterialDef>>
          for (const [id, patch] of Object.entries(parsed)) setMaterialOverride(id, patch)
        } catch {
          /* JSON corrupto: se ignora y se usan los valores base */
        }
      })
      .finally(() => render())
  }

  /* ---------- Repintado ---------- */

  function renderCard(item: MaterialCatalogItem): string {
    const def = getMaterialDef(item.id)
    const tint = def?.tint ?? item.tint
    const mini = miniatureUrl(def)
    const favorite = favorites.has(item.id)
    const edited = def && getMaterialOverride(item.id) !== null
    const style = mini
      ? `background-image:url(${mini});background-color:${hex(tint)}`
      : `background-color:${hex(tint)}`
    return `
      <div class="mat-card${edited ? ' is-edited' : ''}" draggable="true" data-mat="${item.id}"
           title="${item.label} — arrastra al lienzo o clic para aplicar">
        <span class="mat-card__mini" style="${style}"></span>
        <span class="mat-card__name">${item.label}</span>
        <button class="mat-card__fav${favorite ? ' is-on' : ''}" data-fav="${item.id}"
                title="${favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${favorite ? '★' : '☆'}</button>
        <button class="mat-card__edit" data-edit="${item.id}" title="Edición rápida">${icon('pencil', 12)}</button>
      </div>`
  }

  function renderEditor(): string {
    if (!editingId) return ''
    const def = getMaterialDef(editingId)
    const base = MATERIAL_CATALOG.find((item) => item.id === editingId)
    if (!def || !base) return ''
    const slider = (prop: string, label: string, min: number, max: number, step: number, value: number): string =>
      `<label class="mat-editor__row"><span>${label}</span>
         <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-prop="${prop}">
       </label>`
    return `
      <section class="mat-editor" data-editor="${editingId}">
        <header class="mat-editor__head">
          <span>${icon('pencil', 13)} ${def.label}</span>
          <button class="icon-btn icon-btn--tiny" data-action="editor-close" title="Cerrar">${icon('close', 12)}</button>
        </header>
        <label class="mat-editor__row"><span>Tinte</span>
          <input type="color" value="${hex(def.tint)}" data-prop="tint">
        </label>
        ${slider('roughness', 'Rugosidad', 0, 1, 0.05, def.roughness)}
        ${slider('metalness', 'Metálico', 0, 1, 0.05, def.metalness)}
        ${slider('opacity', 'Opacidad', 0.05, 1, 0.05, def.opacity)}
        ${slider('tileMeters', 'Escala (m)', 0.25, 8, 0.25, def.tileMeters)}
        <footer class="mat-editor__foot">
          <button class="btn btn--ghost btn--tiny" data-action="editor-reset">Restablecer</button>
        </footer>
      </section>`
  }

  function renderTextures(): string {
    const rows = textures
      .map(
        (texture) => `
        <div class="mat-tex" data-tex="${texture.id}">
          <span class="mat-tex__mini" style="background-image:url(${texture.data})"></span>
          <span class="mat-tex__name" title="${texture.name}">${texture.name}</span>
          <button class="icon-btn icon-btn--tiny" data-tex-action="export" title="Exportar PNG">${icon('save', 12)}</button>
          <button class="icon-btn icon-btn--tiny" data-tex-action="delete" title="Eliminar">${icon('trash', 12)}</button>
        </div>`
      )
      .join('')
    return `
      <div class="mat-palette__texbar">
        <button class="btn btn--tiny" data-action="import">${icon('upload', 12)} Importar textura…</button>
        <span class="mat-palette__texcount">${textures.length} textura${textures.length === 1 ? '' : 's'}</span>
      </div>
      ${rows || '<p class="mat-palette__empty">Sin texturas importadas en este proyecto.</p>'}`
  }

  function render(): void {
    const tabs: Array<{ id: TabId; label: string }> = [
      { id: 'todos', label: 'Todos' },
      ...MATERIAL_CATEGORIES.map((category) => ({ id: category.id as TabId, label: category.label })),
      { id: 'favoritos', label: '★ Favoritos' },
      { id: 'texturas', label: 'Texturas' }
    ]

    const cards =
      activeTab === 'texturas'
        ? renderTextures()
        : visibleMaterials().map(renderCard).join('') ||
          '<p class="mat-palette__empty">Ningún material coincide con la búsqueda.</p>'

    body.innerHTML = `
      <header class="panel__head">
        <span class="panel__title">${icon('palette', 14)} ${t('panel.materials')}</span>
        <div class="panel__icons">
          <button class="icon-btn" data-action="import" title="Importar textura…">${icon('upload', 14)}</button>
          <button class="icon-btn" data-action="export" title="Exportar texturas (PNG)">${icon('save', 14)}</button>
        </div>
      </header>
      <div class="mat-palette__search">
        ${icon('search', 13)}
        <input type="search" placeholder="Buscar material…" value="${query}" data-role="search">
      </div>
      <nav class="mat-palette__tabs">
        ${tabs
          .map(
            (tab) =>
              `<button class="mat-palette__tab${activeTab === tab.id ? ' is-active' : ''}" data-tab="${tab.id}">${tab.label}</button>`
          )
          .join('')}
      </nav>
      <div class="mat-palette__grid">${cards}</div>
      ${renderEditor()}
      <footer class="mat-palette__foot">
        <span>Calidad</span>
        <select data-role="quality" title="Calidad de texturas del motor">
          ${QUALITY_LEVELS.map(
            (level) => `<option value="${level}"${getQuality() === level ? ' selected' : ''}>${QUALITY_LABELS[level]}</option>`
          ).join('')}
        </select>
      </footer>`

    bind()
  }

  /* ---------- Repintado parcial (conserva el foco del buscador) ---------- */

  /** Recalcula sólo la rejilla; no toca el buscador ni las pestañas. */
  function renderCards(): void {
    const grid = body.querySelector('.mat-palette__grid')
    if (!grid) return
    grid.innerHTML =
      activeTab === 'texturas'
        ? renderTextures()
        : visibleMaterials().map(renderCard).join('') ||
          '<p class="mat-palette__empty">Ningún material coincide con la búsqueda.</p>'
  }

  /* ---------- Acciones ---------- */

  function toggleFavorite(id: string): void {
    if (favorites.has(id)) favorites.delete(id)
    else favorites.add(id)
    saveFavorites(favorites)
    renderCards()
  }

  function applyMaterial(id: string): void {
    const def = getMaterialDef(id)
    const label = def?.label ?? id
    options.onApply(id, label)
    options.onMessage(`Material «${label}» aplicado a la selección.`)
  }

  /** Aplica en vivo un cambio del editor rápido y lo persiste en segundo plano. */
  function applyEditorInput(prop: string, input: HTMLInputElement): void {
    if (!editingId) return
    const patch: Partial<MaterialDef> = {}
    if (prop === 'tint') {
      patch.tint = parseHexColor(input.value)
    } else if (prop === 'roughness' || prop === 'metalness' || prop === 'opacity' || prop === 'tileMeters') {
      const value = Number.parseFloat(input.value)
      if (Number.isNaN(value)) return
      ;(patch as Record<string, number>)[prop] = value
    } else {
      return
    }
    setMaterialOverride(editingId, patch)
    options.onOverrideChanged()
    void persistOverrides()
  }

  /** Exporta las texturas del proyecto como PNG (importadas o, si no hay, las procedurales). */
  function exportTextures(): void {
    let count = 0
    for (const texture of textures) {
      downloadDataUrl(texture.data, texture.name)
      count += 1
    }
    if (count === 0) {
      for (const exported of exportProjectTextures()) {
        downloadDataUrl(exported.dataUrl, `${exported.kind}-${exported.size}.png`)
        count += 1
      }
    }
    options.onMessage(
      count ? `${count} textura(s) exportada(s) como PNG.` : 'No hay texturas que exportar.'
    )
  }

  /** Acciones de una fila de textura importada (exportar / eliminar). */
  function handleTextureAction(button: HTMLElement): void {
    const row = button.closest('[data-tex]') as HTMLElement | null
    const id = row?.dataset.tex
    if (!id) return
    const texture = textures.find((item) => item.id === id)
    if (button.dataset.texAction === 'export' && texture) {
      downloadDataUrl(texture.data, texture.name)
      return
    }
    if (button.dataset.texAction === 'delete' && texture) {
      void databaseService.deleteTexture(id, options.getOwnerId()).then((ok) => {
        if (ok) {
          textures = textures.filter((item) => item.id !== id)
          render()
          options.onMessage(`Textura «${texture.name}» eliminada.`)
        } else {
          options.onMessage('No se pudo eliminar la textura.')
        }
      })
    }
  }

  /** Botones con `data-action` de la cabecera, la barra de texturas y el editor. */
  function handleAction(action: string): void {
    switch (action) {
      case 'import':
        fileInput.click()
        break
      case 'export':
        exportTextures()
        break
      case 'editor-close':
        editingId = null
        render()
        break
      case 'editor-reset':
        if (editingId) {
          setMaterialOverride(editingId, null)
          void persistOverrides()
          options.onOverrideChanged()
          render()
        }
        break
    }
  }

  /* ---------- Importación de texturas ---------- */

  async function importTexture(file: File): Promise<void> {
    const projectId = options.getProjectId()
    if (!projectId) {
      options.onMessage('Abre o guarda un proyecto antes de importar texturas.')
      return
    }
    try {
      const data = await readFileAsDataUrl(file)
      const { width, height } = await imageDimensions(data)
      const created = await databaseService.createTexture({
        projectId,
        name: file.name,
        mime: file.type || 'image/png',
        width,
        height,
        data,
        userId: options.getOwnerId()
      })
      if (!created) {
        options.onMessage('No se pudo guardar la textura en la base de datos.')
        return
      }
      textures = [...textures, created]
      activeTab = 'texturas'
      render()
      options.onMessage(`Textura «${file.name}» importada.`)
    } catch {
      options.onMessage('No se pudo leer la imagen seleccionada.')
    }
  }

  /* ---------- Eventos (delegados; `body` persiste entre repintados) ---------- */

  let listenersBound = false

  function bind(): void {
    if (listenersBound) return
    listenersBound = true

    body.addEventListener('click', (event) => {
      const target = event.target as HTMLElement

      const tabButton = target.closest('[data-tab]') as HTMLElement | null
      if (tabButton) {
        activeTab = (tabButton.dataset.tab as TabId) ?? 'todos'
        render()
        return
      }

      const favButton = target.closest('[data-fav]') as HTMLElement | null
      if (favButton?.dataset.fav) {
        toggleFavorite(favButton.dataset.fav)
        return
      }

      const editButton = target.closest('[data-edit]') as HTMLElement | null
      if (editButton?.dataset.edit) {
        editingId = editButton.dataset.edit
        render()
        return
      }

      const texButton = target.closest('[data-tex-action]') as HTMLElement | null
      if (texButton) {
        handleTextureAction(texButton)
        return
      }

      const actionButton = target.closest('[data-action]') as HTMLElement | null
      if (actionButton?.dataset.action) {
        handleAction(actionButton.dataset.action)
        return
      }

      const card = target.closest('[data-mat]') as HTMLElement | null
      if (card?.dataset.mat) applyMaterial(card.dataset.mat)
    })

    body.addEventListener('input', (event) => {
      const target = event.target as HTMLElement
      if (!(target instanceof HTMLInputElement)) return
      if (target.dataset.role === 'search') {
        query = target.value
        renderCards()
        return
      }
      if (target.dataset.prop) applyEditorInput(target.dataset.prop, target)
    })

    body.addEventListener('change', (event) => {
      const target = event.target as HTMLElement
      if (target instanceof HTMLSelectElement && target.dataset.role === 'quality') {
        const level = target.value as QualityLevel
        setQuality(level)
        options.onQualityChange(level)
        options.onMessage(`Calidad de texturas: ${QUALITY_LABELS[level]}.`)
      }
    })

    body.addEventListener('dragstart', (event) => {
      const card = (event.target as HTMLElement).closest('[data-mat]') as HTMLElement | null
      if (!card?.dataset.mat || !event.dataTransfer) return
      event.dataTransfer.setData('text/plain', card.dataset.mat)
      event.dataTransfer.setData('application/x-arq-material', card.dataset.mat)
      event.dataTransfer.effectAllowed = 'copy'
    })
  }

  /* ---------- Handle público ---------- */

  const handle: MaterialPaletteHandle = {
    refresh: render,
    setTextures(list: SceneTexture[]): void {
      textures = list
      render()
    },
    getTextures(): SceneTexture[] {
      return textures
    },
    loadProjectSettings
  }

  render()

  return handle
}


