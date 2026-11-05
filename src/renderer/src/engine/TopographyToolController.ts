import * as THREE from 'three'
import type { SceneManager } from './SceneManager'
import type { ViewportRenderer } from './ViewportRenderer'
import { applyGradingPadToTerrain, sampleTerrainElevation } from './TerrainBuilder'
import { cloneTerrainData, type TerrainSpotElevation } from '../models/TerrainTypes'

export type TopographyToolMode = 'none' | 'probe' | 'grade'
export type GradingShapeMode = 'rect' | 'polygon'

export interface GradingResultStats {
  cutVolumeM3: number
  fillVolumeM3: number
  targetElevation: number
  modifiedVertices: number
}

export interface TopographyToolOptions {
  canvas: HTMLCanvasElement
  overlay: HTMLElement
  scene: SceneManager
  viewport: ViewportRenderer
  cameraClaimsGesture?: (e: PointerEvent) => boolean
  onMessage: (msg: string) => void
  onModeChange?: (mode: TopographyToolMode) => void
  onGradingResult?: (stats: GradingResultStats) => void
}

export interface TopographyToolHandle {
  setMode(mode: TopographyToolMode): void
  getMode(): TopographyToolMode
  isActive(): boolean
  setTargetElevation(elev: number): void
  getTargetElevation(): number
  setGradingShape(shape: GradingShapeMode): void
  getGradingShape(): GradingShapeMode
  setTransitionMargin(margin: number): void
  getTransitionMargin(): number
  clearSpotElevations(): void
  refreshOverlay(): void
  dispose(): void
}

function fmtSign(v: number): string {
  const fixed = v.toFixed(2)
  return v >= 0 ? `+${fixed}` : fixed
}

export function mountTopographyTool(options: TopographyToolOptions): TopographyToolHandle {
  const { canvas, overlay, scene, viewport } = options

  let mode: TopographyToolMode = 'none'
  let gradeShape: GradingShapeMode = 'rect'
  let targetElevation = 0
  let transitionMargin = 1.2

  // Estado de trazo de rectángulo / polígono de explanación
  let rectStart: { x: number; z: number; terrainId: string } | null = null
  let isDraggingRect = false
  let polyPoints: Array<{ x: number; z: number }> = []
  let activeTerrainId: string | null = null

  // Elementos DOM en #viewport-overlay
  const probeTooltip = document.createElement('div')
  probeTooltip.className = 'topo-probe-tooltip'
  probeTooltip.style.display = 'none'
  overlay.appendChild(probeTooltip)

  const markersHost = document.createElement('div')
  markersHost.className = 'topo-markers-layer'
  markersHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  overlay.appendChild(markersHost)

  function hideTooltip(): void {
    probeTooltip.style.display = 'none'
  }

  function updateTooltipAt(clientX: number, clientY: number, worldPt: THREE.Vector3): void {
    const rect = canvas.getBoundingClientRect()
    const lx = clientX - rect.left
    const ly = clientY - rect.top
    const cadX = worldPt.x.toFixed(2)
    const cadY = (-worldPt.z).toFixed(2)
    const elevZ = fmtSign(worldPt.y)

    probeTooltip.innerHTML =
      mode === 'grade'
        ? `<div><strong>Plataforma:</strong> Nivel obj. <strong>${fmtSign(targetElevation)} m</strong></div>` +
          `<div>Cursor (X: ${cadX}, Y: ${cadY}) · Terreno Z: ${elevZ} m</div>`
        : `<div><strong>Cota Z: ${elevZ} m</strong></div>` +
          `<div>Coord. X: ${cadX} m · Y: ${cadY} m</div>`

    probeTooltip.style.left = `${Math.min(rect.width - 210, Math.max(8, lx))}px`
    probeTooltip.style.top = `${Math.min(rect.height - 36, Math.max(24, ly))}px`
    probeTooltip.style.display = 'block'
  }

  function refreshOverlay(): void {
    markersHost.innerHTML = ''
    const terrains = scene.getTerrains()
    for (const terrain of terrains) {
      if (!terrain.visible || !terrain.terrainData?.spotElevations?.length) continue
      for (const spot of terrain.terrainData.spotElevations) {
        // Recalcular altura actual por si el terreno fue explanado después de poner la cota
        const liveElev = sampleTerrainElevation(terrain, spot.x, spot.z) ?? spot.elevation
        const proj = viewport.projectPoint(new THREE.Vector3(spot.x, liveElev + 0.08, spot.z))
        if (!proj || proj.behind) continue

        const el = document.createElement('div')
        el.className = 'topo-spot-marker'
        el.style.left = `${proj.x}px`
        el.style.top = `${proj.y}px`
        el.title = 'Clic derecho o clic en × para eliminar esta cota'
        const cadX = spot.x.toFixed(1)
        const cadY = (-spot.z).toFixed(1)
        el.innerHTML = `
          <span>⊕</span>
          <span class="topo-spot-marker__elev">Z ${fmtSign(liveElev)} m</span>
          <span style="opacity:0.78">(${cadX}, ${cadY})</span>
          <span data-remove-spot="${spot.id}" style="margin-left:2px;opacity:0.65;font-weight:700">×</span>
        `
        const removeSpot = (ev: MouseEvent): void => {
          ev.stopPropagation()
          ev.preventDefault()
          const nextData = cloneTerrainData(terrain.terrainData)
          if (!nextData) return
          nextData.spotElevations = (nextData.spotElevations ?? []).filter((s) => s.id !== spot.id)
          scene.updateObject(terrain.id, { terrainData: nextData }, false)
          refreshOverlay()
          options.onMessage('Cota topográfica eliminada.')
        }
        el.querySelector('[data-remove-spot]')?.addEventListener('click', (ev) => removeSpot(ev as MouseEvent))
        el.addEventListener('contextmenu', removeSpot)
        markersHost.appendChild(el)
      }
    }
  }

  function addSpotElevation(terrainId: string, point: THREE.Vector3): void {
    const terrain = scene.getObject(terrainId)
    if (!terrain || !terrain.terrainData) return
    const nextData = cloneTerrainData(terrain.terrainData)
    if (!nextData) return
    const elev = Math.round(point.y * 100) / 100
    const spot: TerrainSpotElevation = {
      id: `spot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      x: Math.round(point.x * 100) / 100,
      z: Math.round(point.z * 100) / 100,
      elevation: elev
    }
    nextData.spotElevations = [...(nextData.spotElevations ?? []), spot]
    scene.updateObject(terrain.id, { terrainData: nextData }, false)
    refreshOverlay()
    options.onMessage(
      `Cota insertada: X=${spot.x.toFixed(2)} m, Y=${(-spot.z).toFixed(2)} m, Nivel Z=${fmtSign(elev)} m.`
    )
  }

  function applyGradingPolygon(terrainId: string, polygonXZ: Array<{ x: number; z: number }>): void {
    const terrain = scene.getObject(terrainId)
    if (!terrain || !terrain.terrainData || polygonXZ.length < 3) return

    const res = applyGradingPadToTerrain(terrain, polygonXZ, targetElevation, transitionMargin)
    if (!res) return

    const nextSize = new THREE.Vector3(terrain.size.x, res.newHeightSize, terrain.size.z)
    scene.updateObject(
      terrain.id,
      {
        size: nextSize,
        terrainData: res.updatedData
      },
      false
    )
    viewport.clearToolPreview()
    refreshOverlay()
    options.onGradingResult?.({
      cutVolumeM3: res.cutVolumeM3,
      fillVolumeM3: res.fillVolumeM3,
      targetElevation,
      modifiedVertices: res.modifiedVertices
    })
    options.onMessage(
      `Plataforma aplanada a Nivel ${fmtSign(targetElevation)} m · Corte: ${res.cutVolumeM3.toFixed(2)} m³ · Relleno: ${res.fillVolumeM3.toFixed(2)} m³ (Ctrl+Z deshace).`
    )
  }

  function previewRectangle(a: { x: number; z: number }, b: { x: number; z: number }): void {
    const y = targetElevation + 0.08
    viewport.setPolygonPreview(
      [
        new THREE.Vector3(a.x, y, a.z),
        new THREE.Vector3(b.x, y, a.z),
        new THREE.Vector3(b.x, y, b.z),
        new THREE.Vector3(a.x, y, b.z)
      ],
      true
    )
  }

  function onPointerMove(e: PointerEvent): void {
    if (mode === 'none') return

    const hit = viewport.pickTerrain(e.clientX, e.clientY)
    if (hit) {
      updateTooltipAt(e.clientX, e.clientY, hit.point)
    } else {
      hideTooltip()
    }

    if (mode === 'grade') {
      const worldPt = hit?.point ?? viewport.pointerToGround(e.clientX, e.clientY)
      if (!worldPt) return

      if (gradeShape === 'rect' && isDraggingRect && rectStart) {
        previewRectangle(rectStart, { x: worldPt.x, z: worldPt.z })
      } else if (gradeShape === 'polygon' && polyPoints.length >= 1) {
        const y = targetElevation + 0.08
        const previewPts = [
          ...polyPoints.map((p) => new THREE.Vector3(p.x, y, p.z)),
          new THREE.Vector3(worldPt.x, y, worldPt.z)
        ]
        viewport.setPolygonPreview(previewPts, polyPoints.length >= 2)
      }
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (mode === 'none') return
    if (e.button !== 0) return
    if (options.cameraClaimsGesture?.(e)) return
    if (viewport.isTransformGizmoDragging() || viewport.isPointerOverTransformGizmo()) return

    const hit = viewport.pickTerrain(e.clientX, e.clientY)
    if (!hit) {
      if (scene.getTerrains().length === 0) {
        options.onMessage('Primero importa un mapa topográfico o genera un terreno de prueba en «Topografía y Terreno».')
      } else {
        options.onMessage('Haz clic directamente sobre la superficie del mapa topográfico.')
      }
      return
    }

    if (mode === 'probe') {
      addSpotElevation(hit.object.id, hit.point)
      return
    }

    if (mode === 'grade') {
      if (gradeShape === 'rect') {
        rectStart = { x: hit.point.x, z: hit.point.z, terrainId: hit.object.id }
        isDraggingRect = true
        previewRectangle(rectStart, rectStart)
      } else {
        activeTerrainId = hit.object.id
        polyPoints.push({ x: hit.point.x, z: hit.point.z })
        const y = targetElevation + 0.08
        viewport.setPolygonPreview(
          polyPoints.map((p) => new THREE.Vector3(p.x, y, p.z)),
          polyPoints.length >= 3
        )
        options.onMessage(
          `Vértice ${polyPoints.length} añadido. ${
            polyPoints.length >= 3 ? 'Pulsa Enter o haz doble clic para aplanar la plataforma.' : 'Añade al menos 3 vértices.'
          }`
        )
      }
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (mode !== 'grade' || gradeShape !== 'rect' || !isDraggingRect || !rectStart) return
    if (e.button !== 0) return

    isDraggingRect = false
    const start = rectStart
    rectStart = null

    const hit = viewport.pickTerrain(e.clientX, e.clientY)
    const endPt = hit?.point ?? viewport.pointerToGround(e.clientX, e.clientY)
    viewport.clearToolPreview()
    if (!endPt) return

    const dx = Math.abs(endPt.x - start.x)
    const dz = Math.abs(endPt.z - start.z)
    if (dx < 0.4 || dz < 0.4) {
      options.onMessage('Arrastra un rectángulo de al menos 0,4 × 0,4 m sobre el terreno para crear la plataforma.')
      return
    }

    applyGradingPolygon(start.terrainId, [
      { x: start.x, z: start.z },
      { x: endPt.x, z: start.z },
      { x: endPt.x, z: endPt.z },
      { x: start.x, z: endPt.z }
    ])
  }

  function onDblClick(e: MouseEvent): void {
    if (mode !== 'grade' || gradeShape !== 'polygon') return
    if (polyPoints.length >= 3 && activeTerrainId) {
      e.preventDefault()
      const pts = [...polyPoints]
      const tid = activeTerrainId
      polyPoints = []
      activeTerrainId = null
      applyGradingPolygon(tid, pts)
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (mode === 'none') return
    if (e.key === 'Enter' && mode === 'grade' && gradeShape === 'polygon' && polyPoints.length >= 3 && activeTerrainId) {
      e.preventDefault()
      const pts = [...polyPoints]
      const tid = activeTerrainId
      polyPoints = []
      activeTerrainId = null
      applyGradingPolygon(tid, pts)
      return
    }
    if (e.key === 'Escape') {
      if (isDraggingRect || polyPoints.length > 0) {
        isDraggingRect = false
        rectStart = null
        polyPoints = []
        activeTerrainId = null
        viewport.clearToolPreview()
        options.onMessage('Trazo de plataforma cancelado.')
      } else {
        setMode('none')
      }
    }
  }

  function onPointerLeave(): void {
    hideTooltip()
  }

  function setMode(next: TopographyToolMode): void {
    if (mode === next) return
    mode = next
    isDraggingRect = false
    rectStart = null
    polyPoints = []
    activeTerrainId = null
    hideTooltip()
    viewport.clearToolPreview()
    canvas.style.cursor = mode === 'none' ? '' : 'crosshair'
    options.onModeChange?.(mode)
  }

  // Suscribir refresco de cotas proyectadas cuando cambian objetos de la escena
  scene.onObjectAdded(() => refreshOverlay())
  scene.onObjectRemoved(() => refreshOverlay())
  scene.onObjectChanged(() => refreshOverlay())
  scene.onObjectMoved(() => refreshOverlay())
  scene.onLevelsChanged(() => refreshOverlay())

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('dblclick', onDblClick)
  window.addEventListener('pointerup', onPointerUp)
  document.addEventListener('keydown', onKeyDown)

  return {
    setMode,
    getMode: () => mode,
    isActive: () => mode !== 'none',
    setTargetElevation(elev: number) {
      if (Number.isFinite(elev)) targetElevation = elev
    },
    getTargetElevation: () => targetElevation,
    setGradingShape(shape: GradingShapeMode) {
      gradeShape = shape
      polyPoints = []
      isDraggingRect = false
      rectStart = null
      viewport.clearToolPreview()
    },
    getGradingShape: () => gradeShape,
    setTransitionMargin(margin: number) {
      if (Number.isFinite(margin) && margin >= 0) transitionMargin = margin
    },
    getTransitionMargin: () => transitionMargin,
    clearSpotElevations() {
      for (const terrain of scene.getTerrains()) {
        if (!terrain.terrainData?.spotElevations?.length) continue
        const nextData = cloneTerrainData(terrain.terrainData)
        if (!nextData) continue
        nextData.spotElevations = []
        scene.updateObject(terrain.id, { terrainData: nextData }, false)
      }
      refreshOverlay()
    },
    refreshOverlay,
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('keydown', onKeyDown)
      probeTooltip.remove()
      markersHost.remove()
    }
  }
}

