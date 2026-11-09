import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { ViewportRenderer, TransformGizmoMode } from '../engine/ViewportRenderer'
import {
  defaultStructuralParamsFor,
  isParametricStructuralShape,
  isRadialStructuralShape,
  STRUCTURAL_MATERIAL_COLOR,
  STRUCTURAL_MATERIAL_TO_CATALOG,
  type StructuralMaterialType,
  type StructuralParams
} from '../models/StructuralTypes'
import { cloneTerrainData } from '../models/TerrainTypes'
import { sampleAnyTerrainAt } from '../engine/TerrainBuilder'

export const QUICK_PALETTE = [
  { name: 'Rojo Metálico', hex: '#dc2626' },
  { name: 'Azul Eléctrico', hex: '#2563eb' },
  { name: 'Blanco Perla', hex: '#f8fafc' },
  { name: 'Negro Obsidiana', hex: '#18181b' },
  { name: 'Gris Plata', hex: '#94a3b8' },
  { name: 'Madera Nogal', hex: '#451a03' },
  { name: 'Beige Cálido', hex: '#d6d3d1' },
  { name: 'Verde Natural', hex: '#166534' }
]

export interface SelectionTransformPanelOptions {
  overlay: HTMLElement
  scene: SceneManager
  viewport: ViewportRenderer
  onMessage: (message: string) => void
}

export interface SelectionTransformPanelHandle {
  refresh(): void
  dispose(): void
}

function radToDeg360(rad: number): number {
  const deg = ((rad * 180) / Math.PI) % 360
  return Math.round(((deg + 360) % 360) * 10) / 10
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function mountSelectionTransformPanel(
  options: SelectionTransformPanelOptions
): SelectionTransformPanelHandle {
  const { overlay, scene, viewport, onMessage } = options

  const panel = document.createElement('aside')
  panel.className = 'transform-inspector is-hidden'
  panel.setAttribute('aria-label', 'Propiedades y Dimensiones')
  // Evitar que clics o teclas dentro del inspector disparen herramientas del canvas
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())
  panel.addEventListener('wheel', (e) => e.stopPropagation())
  panel.addEventListener('keydown', (e) => e.stopPropagation())
  overlay.appendChild(panel)

  let renderedSignature = ''

  function currentSignature(): string {
    const obj = scene.getSelectedObject()
    if (obj) {
      return `obj:${obj.id}:${obj.shapeId ?? ''}:${obj.structuralParams?.subType ?? ''}:${Boolean(obj.terrainData)}`
    }
    const wall = scene.getSelected()
    if (wall) {
      return `wall:${wall.id}`
    }
    return 'none'
  }

  function updateValuesInPlace(): void {
    const activeEl = document.activeElement
    const setVal = (key: string, val: string | number): void => {
      const el = panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-tf-input="${key}"]`)
      if (!el || el === activeEl) return
      el.value = String(val)
    }

    // Actualizar botones de modo de gizmo
    const gMode = viewport.getTransformGizmoMode()
    panel.querySelectorAll<HTMLButtonElement>('[data-gizmo-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.gizmoMode === gMode)
    })

    const obj = scene.getSelectedObject()
    if (obj) {
      setVal('width', round2(obj.size.x))
      setVal('height', round2(obj.size.y))
      setVal('depth', round2(obj.size.z))
      setVal('posX', round2(obj.position.x))
      setVal('posY', round2(obj.position.y))
      setVal('posZ', round2(obj.position.z))
      const deg = radToDeg360(obj.rotationY)
      setVal('rotDeg', deg)
      setVal('rotRange', deg)

      const radius = round2((obj.size.x + obj.size.z) / 4)
      setVal('radius', radius)
      setVal('diameter', round2(radius * 2))

      if (obj.structuralParams) {
        setVal('thickness', round2(obj.structuralParams.thickness))
        setVal('divisions', Math.round(obj.structuralParams.divisions))
        setVal('bays', Math.round(obj.structuralParams.bays))
        setVal('floors', Math.round(obj.structuralParams.floors ?? 2))
        setVal('archRise', round2(obj.structuralParams.archRise))
        setVal('sweepAngle', Math.round(obj.structuralParams.sweepAngle ?? 180))
        setVal('materialType', obj.structuralParams.materialType)
        if (obj.structuralParams.subType) setVal('subType', obj.structuralParams.subType)
      }
      if (obj.terrainData) {
        setVal('contourInterval', round2(obj.terrainData.contourInterval))
        const statsEl = panel.querySelector('[data-tf-terrain-stats]')
        if (statsEl) {
          statsEl.textContent = `Cotas: ${obj.terrainData.minElev.toFixed(2)} m a ${obj.terrainData.maxElev.toFixed(2)} m · Corte: ${(obj.terrainData.cutVolumeM3 ?? 0).toFixed(1)} m³ · Relleno: ${(obj.terrainData.fillVolumeM3 ?? 0).toFixed(1)} m³`
        }
      }

      const objHex = `#${(obj.color ?? 0xdc2626).toString(16).padStart(6, '0')}`
      setVal('color', objHex)
      panel.querySelectorAll<HTMLButtonElement>('[data-swatch-color]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.swatchColor?.toLowerCase() === objHex.toLowerCase())
      })
      return
    }

    const wall = scene.getSelected()
    if (wall) {
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      const len = round2(Math.hypot(dx, dz))
      const deg = radToDeg360(-Math.atan2(dz, dx))
      setVal('wallLength', len)
      setVal('wallHeight', round2(wall.height))
      setVal('wallThickness', round2(wall.thickness))
      setVal('wallElev', round2(wall.start.y))
      setVal('wallRotDeg', deg)
      setVal('wallRotRange', deg)
    }
  }

  function renderSubtypeOptions(shapeId: string, currentSub?: string): string {
    let optionsList: Array<{ value: string; label: string }> = []
    if (shapeId === 'struct.abovedada') {
      optionsList = [
        { value: 'arco', label: 'Arco de medio punto' },
        { value: 'boveda', label: 'Bóveda de cañón' },
        { value: 'cupula', label: 'Cúpula semiesférica' }
      ]
    } else if (shapeId === 'struct.muros_carga') {
      optionsList = [
        { value: 'recto', label: 'Muros portantes rectos' },
        { value: 'curvo', label: 'Muro portante cilíndrico' }
      ]
    } else if (shapeId === 'struct.laminar') {
      optionsList = [
        { value: 'hypar', label: 'Paraboloide hiperbólico' },
        { value: 'candela', label: 'Cascarón Félix Candela' }
      ]
    } else if (shapeId === 'struct.geodesica') {
      optionsList = [
        { value: 'cupula', label: 'Cúpula geodésica' },
        { value: 'esfera', label: 'Esfera geodésica completa' }
      ]
    } else if (shapeId === 'geo.cilindro') {
      optionsList = [
        { value: 'macizo', label: 'Cilindro macizo' },
        { value: 'hueco', label: 'Cilindro hueco / torre' }
      ]
    } else if (shapeId === 'geo.cono') {
      optionsList = [
        { value: 'agudo', label: 'Cono completo' },
        { value: 'truncado', label: 'Cono truncado' }
      ]
    }
    if (optionsList.length === 0) return ''
    return `
      <label class="transform-field">
        <span>Variante / Tipología</span>
        <select data-tf-input="subType">
          ${optionsList
            .map(
              (opt) =>
                `<option value="${opt.value}"${currentSub === opt.value ? ' selected' : ''}>${opt.label}</option>`
            )
            .join('')}
        </select>
      </label>
    `
  }

  function snapSelectedToTerrain(): void {
    const obj = scene.getSelectedObject()
    if (obj) {
      if (obj.shapeId === 'topo.terrain' || obj.terrainData) {
        const nextPos = obj.position.clone()
        nextPos.y = 0
        scene.updateObject(obj.id, { position: nextPos }, false)
        onMessage(`Terreno «${obj.name}» nivelado a referencia base Y = 0.00 m.`)
        return
      }
      const terrains = scene.getTerrains()
      const hit = sampleAnyTerrainAt(terrains, obj.position.x, obj.position.z)
      if (hit) {
        const nextPos = obj.position.clone()
        nextPos.y = round2(hit.elevation)
        scene.updateObject(obj.id, { position: nextPos }, false)
        onMessage(
          `«${obj.name}» ajustado a la superficie del terreno en cota Z = ${nextPos.y >= 0 ? '+' : ''}${nextPos.y.toFixed(2)} m.`
        )
      } else {
        const levelElev = scene.getLevel(obj.levelId)?.elevation ?? 0
        const nextPos = obj.position.clone()
        nextPos.y = round2(levelElev)
        scene.updateObject(obj.id, { position: nextPos }, false)
        onMessage(
          terrains.length === 0
            ? `No hay mapa topográfico cargado; «${obj.name}» apoyado en cota de planta (${levelElev.toFixed(2)} m).`
            : `«${obj.name}» está fuera del área del mapa topográfico; apoyado en cota (${levelElev.toFixed(2)} m).`
        )
      }
      return
    }

    const wall = scene.getSelected()
    if (wall) {
      const midX = (wall.start.x + wall.end.x) * 0.5
      const midZ = (wall.start.z + wall.end.z) * 0.5
      const hit = sampleAnyTerrainAt(scene.getTerrains(), midX, midZ)
      const targetY = hit ? round2(hit.elevation) : (scene.getLevel(wall.levelId)?.elevation ?? 0)
      const s = wall.start.clone()
      const e = wall.end.clone()
      s.y = targetY
      e.y = targetY
      scene.moveWall(wall.id, s, e, false)
      onMessage(`«${wall.label}» ajustado al nivel del terreno (cota Z = ${targetY.toFixed(2)} m).`)
    }
  }

  function refresh(): void {
    const sig = currentSignature()
    if (sig === 'none') {
      panel.classList.add('is-hidden')
      renderedSignature = 'none'
      return
    }

    panel.classList.remove('is-hidden')
    if (sig === renderedSignature) {
      updateValuesInPlace()
      return
    }
    renderedSignature = sig

    const gMode = viewport.getTransformGizmoMode()
    const gizmoBarHtml = `
      <div class="transform-gizmo-bar" role="group" aria-label="Modo de gizmo 3D">
        <button type="button" class="transform-gizmo-btn${gMode === 'translate' ? ' is-active' : ''}" data-gizmo-mode="translate" title="Gizmo 3D: Mover en X, Y, Z">Mover</button>
        <button type="button" class="transform-gizmo-btn${gMode === 'rotate' ? ' is-active' : ''}" data-gizmo-mode="rotate" title="Gizmo 3D: Rotar en eje vertical">Rotar</button>
        <button type="button" class="transform-gizmo-btn${gMode === 'scale' ? ' is-active' : ''}" data-gizmo-mode="scale" title="Gizmo 3D: Escalar dimensiones">Escalar</button>
      </div>
    `

    const obj = scene.getSelectedObject()
    if (obj) {
      const shapeId = obj.shapeId ?? ''
      const isStruct = isParametricStructuralShape(shapeId)
      const isTerrain = shapeId === 'topo.terrain' || Boolean(obj.terrainData)
      const structParams: StructuralParams | null = isStruct
        ? obj.structuralParams ?? defaultStructuralParamsFor(shapeId).params
        : obj.structuralParams
      const isRadial = isRadialStructuralShape(shapeId, structParams?.subType)
      const radius = round2((obj.size.x + obj.size.z) / 4)
      const deg = radToDeg360(obj.rotationY)
      const currentHex = `#${(obj.color ?? 0xdc2626).toString(16).padStart(6, '0')}`
      const swatchesHtml = QUICK_PALETTE.map(
        (c) => `
        <button
          type="button"
          class="transform-color-circle ${c.hex.toLowerCase() === currentHex.toLowerCase() ? 'is-active' : ''}"
          style="background-color: ${c.hex};"
          data-swatch-color="${c.hex}"
          title="${c.name} (${c.hex})"
        ></button>
      `
      ).join('')
      const subtypeHtml = isStruct ? renderSubtypeOptions(shapeId, structParams?.subType) : ''
      const showSweep = shapeId === 'geo.muro_curvo' || (shapeId === 'struct.muros_carga' && structParams?.subType === 'curvo')
      const showFloors = shapeId === 'struct.entramada'

      panel.innerHTML = `
        <div class="transform-inspector__head">
          <div class="transform-inspector__title" title="${obj.name}">
            <span>⬡</span>
            <span>Propiedades · ${obj.name}</span>
          </div>
          <button type="button" class="icon-btn" data-tf-close title="Deseleccionar">✕</button>
        </div>
        <div class="transform-inspector__body">
          ${gizmoBarHtml}

          <div class="transform-section-label">Dimensiones exactas (metros)</div>
          <div class="transform-grid">
            <label class="transform-field">
              <span>Largo X (m)</span>
              <input type="number" step="0.1" min="0.1" max="500" data-tf-input="width" value="${round2(obj.size.x)}" />
            </label>
            <label class="transform-field">
              <span>Alto Y (m)</span>
              <input type="number" step="0.1" min="0.1" max="300" data-tf-input="height" value="${round2(obj.size.y)}" />
            </label>
            <label class="transform-field">
              <span>Profund. Z (m)</span>
              <input type="number" step="0.1" min="0.1" max="500" data-tf-input="depth" value="${round2(obj.size.z)}" />
            </label>
          </div>

          ${
            isRadial
              ? `
          <div class="transform-grid transform-grid--2">
            <label class="transform-field">
              <span>Radio (m)</span>
              <input type="number" step="0.1" min="0.1" max="250" data-tf-input="radius" value="${radius}" />
            </label>
            <label class="transform-field">
              <span>Diámetro (m)</span>
              <input type="number" step="0.2" min="0.2" max="500" data-tf-input="diameter" value="${round2(radius * 2)}" />
            </label>
          </div>`
              : ''
          }

          <div class="transform-section-label">Posición 3D y Cota (metros)</div>
          <div class="transform-grid">
            <label class="transform-field">
              <span>Coord. X</span>
              <input type="number" step="0.25" data-tf-input="posX" value="${round2(obj.position.x)}" />
            </label>
            <label class="transform-field">
              <span>Nivel / Y</span>
              <input type="number" step="0.1" data-tf-input="posY" value="${round2(obj.position.y)}" />
            </label>
            <label class="transform-field">
              <span>Coord. Z</span>
              <input type="number" step="0.25" data-tf-input="posZ" value="${round2(obj.position.z)}" />
            </label>
          </div>

          ${
            structParams
              ? `
          <div class="transform-section-label">Parámetros Estructurales</div>
          ${subtypeHtml}
          <div class="transform-grid transform-grid--2">
            <label class="transform-field">
              <span>Espesor (m)</span>
              <input type="number" step="0.02" min="0.03" max="4" data-tf-input="thickness" value="${round2(structParams.thickness)}" />
            </label>
            <label class="transform-field">
              <span>Material visual</span>
              <select data-tf-input="materialType">
                <option value="concrete"${structParams.materialType === 'concrete' ? ' selected' : ''}>Hormigón</option>
                <option value="wood"${structParams.materialType === 'wood' ? ' selected' : ''}>Madera</option>
                <option value="steel"${structParams.materialType === 'steel' ? ' selected' : ''}>Acero</option>
                <option value="stone"${structParams.materialType === 'stone' ? ' selected' : ''}>Cantera / Piedra</option>
                <option value="membrane"${structParams.materialType === 'membrane' ? ' selected' : ''}>Membrana textil</option>
                <option value="glass"${structParams.materialType === 'glass' ? ' selected' : ''}>Vidrio estructural</option>
              </select>
            </label>
          </div>
          <div class="transform-grid">
            <label class="transform-field">
              <span>Subdivisiones</span>
              <input type="number" step="1" min="1" max="72" data-tf-input="divisions" value="${Math.round(structParams.divisions)}" />
            </label>
            <label class="transform-field">
              <span>Pilares/Vanos</span>
              <input type="number" step="1" min="1" max="20" data-tf-input="bays" value="${Math.round(structParams.bays)}" />
            </label>
            <label class="transform-field">
              <span>Flecha (m)</span>
              <input type="number" step="0.1" min="0" max="60" data-tf-input="archRise" value="${round2(structParams.archRise)}" />
            </label>
          </div>
          ${
            showFloors || showSweep
              ? `<div class="transform-grid transform-grid--2">
                  ${
                    showFloors
                      ? `<label class="transform-field">
                          <span>Plantas / Forjados</span>
                          <input type="number" step="1" min="1" max="10" data-tf-input="floors" value="${Math.round(structParams.floors ?? 2)}" />
                        </label>`
                      : ''
                  }
                  ${
                    showSweep
                      ? `<label class="transform-field">
                          <span>Ángulo arco (°)</span>
                          <input type="number" step="5" min="30" max="355" data-tf-input="sweepAngle" value="${Math.round(structParams.sweepAngle ?? 180)}" />
                        </label>`
                      : ''
                  }
                </div>`
              : ''
          }
          `
              : ''
          }

          ${
            isTerrain && obj.terrainData
              ? `
          <div class="transform-section-label">Topografía y Curvas de Nivel</div>
          <div class="transform-grid transform-grid--2">
            <label class="transform-field">
              <span>Equidistancia curvas (m)</span>
              <input type="number" step="0.25" min="0.1" max="25" data-tf-input="contourInterval" value="${round2(obj.terrainData.contourInterval)}" />
            </label>
            <label class="transform-field">
              <span>Origen</span>
              <input type="text" readonly value="${obj.terrainData.sourceFormat ?? 'CAD'}" />
            </label>
          </div>
          <div data-tf-terrain-stats style="font-size:10px;color:var(--text-secondary);line-height:1.35;">
            Cotas: ${obj.terrainData.minElev.toFixed(2)} m a ${obj.terrainData.maxElev.toFixed(2)} m · Corte: ${(obj.terrainData.cutVolumeM3 ?? 0).toFixed(1)} m³ · Relleno: ${(obj.terrainData.fillVolumeM3 ?? 0).toFixed(1)} m³
          </div>
          `
              : ''
          }

          <div class="transform-section-label">🎨 Color Principal / Acabado</div>
          <div class="transform-color-row">
            <div class="transform-color-swatches">
              ${swatchesHtml}
            </div>
            <input
              type="color"
              data-tf-input="color"
              value="${currentHex}"
              title="Selector de color libre"
              class="transform-color-picker"
            />
          </div>

          <div class="transform-section-label">Rotación (0° a 360°)</div>
          <div class="transform-rot-row">
            <input type="range" min="0" max="360" step="1" data-tf-input="rotRange" value="${deg}" />
            <input type="number" min="0" max="360" step="1" data-tf-input="rotDeg" value="${deg}" />
          </div>

          <button type="button" class="transform-btn-terrain" data-tf-snap-terrain>
            <span>⛰</span>
            <span>Ajustar al nivel del terreno</span>
          </button>
        </div>
      `
      bindObjectPanelEvents(obj.id)
      return
    }

    const wall = scene.getSelected()
    if (wall) {
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      const len = round2(Math.hypot(dx, dz))
      const deg = radToDeg360(-Math.atan2(dz, dx))

      panel.innerHTML = `
        <div class="transform-inspector__head">
          <div class="transform-inspector__title" title="${wall.label}">
            <span>🧱</span>
            <span>Propiedades · ${wall.label}</span>
          </div>
          <button type="button" class="icon-btn" data-tf-close title="Deseleccionar">✕</button>
        </div>
        <div class="transform-inspector__body">
          ${gizmoBarHtml}

          <div class="transform-section-label">Dimensiones del muro (metros)</div>
          <div class="transform-grid">
            <label class="transform-field">
              <span>Largo (m)</span>
              <input type="number" step="0.1" min="0.2" max="300" data-tf-input="wallLength" value="${len}" />
            </label>
            <label class="transform-field">
              <span>Alto Y (m)</span>
              <input type="number" step="0.1" min="0.3" max="50" data-tf-input="wallHeight" value="${round2(wall.height)}" />
            </label>
            <label class="transform-field">
              <span>Espesor (m)</span>
              <input type="number" step="0.02" min="0.05" max="3" data-tf-input="wallThickness" value="${round2(wall.thickness)}" />
            </label>
          </div>

          <div class="transform-grid transform-grid--2">
            <label class="transform-field">
              <span>Cota base Y (m)</span>
              <input type="number" step="0.1" data-tf-input="wallElev" value="${round2(wall.start.y)}" />
            </label>
            <label class="transform-field">
              <span>Huecos</span>
              <input type="text" readonly value="${wall.openings.length}" />
            </label>
          </div>

          <div class="transform-section-label">Rotación (0° a 360°)</div>
          <div class="transform-rot-row">
            <input type="range" min="0" max="360" step="1" data-tf-input="wallRotRange" value="${deg}" />
            <input type="number" min="0" max="360" step="1" data-tf-input="wallRotDeg" value="${deg}" />
          </div>

          <button type="button" class="transform-btn-terrain" data-tf-snap-terrain>
            <span>⛰</span>
            <span>Ajustar al nivel del terreno</span>
          </button>
        </div>
      `
      bindWallPanelEvents(wall.id)
    }
  }

  function bindCommonGizmoEvents(): void {
    panel.querySelector('[data-tf-close]')?.addEventListener('click', () => {
      scene.select(null)
      scene.selectObject(null)
    })
    panel.querySelectorAll<HTMLButtonElement>('[data-gizmo-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.gizmoMode as TransformGizmoMode
        viewport.setTransformGizmoMode(nextMode)
        updateValuesInPlace()
      })
    })
    panel.querySelector('[data-tf-snap-terrain]')?.addEventListener('click', () => {
      snapSelectedToTerrain()
    })
  }

  function bindObjectPanelEvents(objectId: string): void {
    bindCommonGizmoEvents()

    const applyField = (key: string, rawVal: string, silent: boolean): void => {
      const obj = scene.getObject(objectId)
      if (!obj) return
      const num = Number.parseFloat(rawVal)

      const nextSize = obj.size.clone()
      const nextPos = obj.position.clone()
      let nextRotY = obj.rotationY
      let nextColor = obj.color
      let nextMaterialId: string | null | undefined = undefined
      let nextStruct: StructuralParams | null | undefined = obj.structuralParams
        ? { ...obj.structuralParams }
        : isParametricStructuralShape(obj.shapeId)
          ? { ...defaultStructuralParamsFor(obj.shapeId!).params }
          : undefined

      if (key === 'color') {
        const hexNum = parseInt(rawVal.replace('#', ''), 16)
        if (Number.isFinite(hexNum)) {
          nextColor = hexNum
        }
      } else if (key === 'width' && Number.isFinite(num) && num >= 0.05) {
        nextSize.x = num
        if (nextStruct && isRadialStructuralShape(obj.shapeId, nextStruct.subType)) {
          nextStruct.radius = round2((nextSize.x + nextSize.z) / 4)
        }
      } else if (key === 'height' && Number.isFinite(num) && num >= 0.05) {
        nextSize.y = num
      } else if (key === 'depth' && Number.isFinite(num) && num >= 0.05) {
        nextSize.z = num
        if (nextStruct && isRadialStructuralShape(obj.shapeId, nextStruct.subType)) {
          nextStruct.radius = round2((nextSize.x + nextSize.z) / 4)
        }
      } else if (key === 'radius' && Number.isFinite(num) && num >= 0.05) {
        nextSize.x = round2(num * 2)
        nextSize.z = round2(num * 2)
        if (nextStruct) nextStruct.radius = num
      } else if (key === 'diameter' && Number.isFinite(num) && num >= 0.1) {
        nextSize.x = round2(num)
        nextSize.z = round2(num)
        if (nextStruct) nextStruct.radius = round2(num / 2)
      } else if (key === 'posX' && Number.isFinite(num)) {
        nextPos.x = num
      } else if (key === 'posY' && Number.isFinite(num)) {
        nextPos.y = num
      } else if (key === 'posZ' && Number.isFinite(num)) {
        nextPos.z = num
      } else if ((key === 'rotDeg' || key === 'rotRange') && Number.isFinite(num)) {
        const clampedDeg = ((num % 360) + 360) % 360
        nextRotY = degToRad(clampedDeg)
      } else if (key === 'thickness' && nextStruct && Number.isFinite(num) && num >= 0.02) {
        nextStruct.thickness = num
      } else if (key === 'divisions' && nextStruct && Number.isFinite(num) && num >= 1) {
        nextStruct.divisions = Math.max(1, Math.min(72, Math.round(num)))
      } else if (key === 'bays' && nextStruct && Number.isFinite(num) && num >= 1) {
        nextStruct.bays = Math.max(1, Math.min(24, Math.round(num)))
      } else if (key === 'floors' && nextStruct && Number.isFinite(num) && num >= 1) {
        nextStruct.floors = Math.max(1, Math.min(12, Math.round(num)))
      } else if (key === 'archRise' && nextStruct && Number.isFinite(num) && num >= 0) {
        nextStruct.archRise = num
      } else if (key === 'sweepAngle' && nextStruct && Number.isFinite(num) && num >= 25) {
        nextStruct.sweepAngle = Math.max(25, Math.min(355, num))
      } else if (key === 'materialType' && nextStruct) {
        const mType = rawVal as StructuralMaterialType
        nextStruct.materialType = mType
        nextMaterialId = STRUCTURAL_MATERIAL_TO_CATALOG[mType] ?? null
        nextColor = STRUCTURAL_MATERIAL_COLOR[mType] ?? obj.color
      } else if (key === 'subType' && nextStruct) {
        nextStruct.subType = rawVal
      } else if (key === 'contourInterval' && obj.terrainData && Number.isFinite(num) && num >= 0.1) {
        const nextTerrain = cloneTerrainData(obj.terrainData)
        if (nextTerrain) {
          nextTerrain.contourInterval = num
          scene.updateObject(obj.id, { terrainData: nextTerrain }, silent)
          updateValuesInPlace()
        }
        return
      } else {
        return
      }

      scene.updateObject(
        obj.id,
        {
          size: nextSize,
          position: nextPos,
          rotationY: nextRotY,
          color: nextColor,
          ...(nextMaterialId !== undefined ? { materialId: nextMaterialId } : {}),
          ...(nextStruct !== undefined ? { structuralParams: nextStruct } : {})
        },
        silent
      )

      // Si cambió el subtipo, puede aparecer/ocultarse algún campo específico (p. ej. barrido curvo)
      if (key === 'subType') {
        renderedSignature = ''
        refresh()
      } else {
        updateValuesInPlace()
      }
    }

    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-tf-input]').forEach((el) => {
      const key = el.dataset.tfInput
      if (!key) return
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => applyField(key, el.value, false))
      } else {
        // Actualización silenciosa en vivo mientras el usuario escribe/arrastra el slider
        el.addEventListener('input', () => applyField(key, el.value, true))
        // Confirmación en historial Deshacer/Rehacer al terminar de editar
        el.addEventListener('change', () => applyField(key, el.value, false))
      }
    })

    panel.querySelectorAll<HTMLButtonElement>('[data-swatch-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = btn.dataset.swatchColor
        if (c) {
          applyField('color', c, false)
        }
      })
    })
  }

  function bindWallPanelEvents(wallId: string): void {
    bindCommonGizmoEvents()

    const applyWallField = (key: string, rawVal: string, silent: boolean): void => {
      const wall = scene.getWall(wallId)
      if (!wall) return
      const num = Number.parseFloat(rawVal)
      if (!Number.isFinite(num)) return

      const mid = new THREE.Vector3().addVectors(wall.start, wall.end).multiplyScalar(0.5)
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      const curLen = Math.max(0.1, Math.hypot(dx, dz))
      const curAngle = -Math.atan2(dz, dx)

      if (key === 'wallLength' && num >= 0.2) {
        const half = num * 0.5
        const ux = dx / curLen
        const uz = dz / curLen
        scene.moveWall(
          wall.id,
          new THREE.Vector3(mid.x - ux * half, wall.start.y, mid.z - uz * half),
          new THREE.Vector3(mid.x + ux * half, wall.end.y, mid.z + uz * half),
          silent
        )
      } else if (key === 'wallHeight' && num >= 0.3) {
        wall.height = num
        scene.moveWall(wall.id, wall.start.clone(), wall.end.clone(), silent)
      } else if (key === 'wallThickness' && num >= 0.05) {
        wall.thickness = num
        scene.moveWall(wall.id, wall.start.clone(), wall.end.clone(), silent)
      } else if (key === 'wallElev') {
        const s = wall.start.clone()
        const e = wall.end.clone()
        s.y = num
        e.y = num
        scene.moveWall(wall.id, s, e, silent)
      } else if (key === 'wallRotDeg' || key === 'wallRotRange') {
        const rad = degToRad(((num % 360) + 360) % 360)
        const dA = rad - curAngle
        const cos = Math.cos(-dA)
        const sin = Math.sin(-dA)
        const rotPt = (pt: THREE.Vector3): THREE.Vector3 => {
          const rx = pt.x - mid.x
          const rz = pt.z - mid.z
          return new THREE.Vector3(mid.x + rx * cos - rz * sin, pt.y, mid.z + rx * sin + rz * cos)
        }
        scene.moveWall(wall.id, rotPt(wall.start), rotPt(wall.end), silent)
      }
      updateValuesInPlace()
    }

    panel.querySelectorAll<HTMLInputElement>('[data-tf-input]').forEach((el) => {
      const key = el.dataset.tfInput
      if (!key) return
      el.addEventListener('input', () => applyWallField(key, el.value, true))
      el.addEventListener('change', () => applyWallField(key, el.value, false))
    })
  }

  scene.onSelectionChanged(() => refresh())
  scene.onObjectSelectionChanged(() => refresh())
  scene.onWallMoved(() => updateValuesInPlace())
  scene.onObjectMoved(() => updateValuesInPlace())
  scene.onObjectChanged(() => refresh())
  const unsubGizmo = viewport.onTransformGizmoChange(() => updateValuesInPlace())

  return {
    refresh,
    dispose() {
      unsubGizmo()
      panel.remove()
    }
  }
}

