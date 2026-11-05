import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { ViewportRenderer } from '../engine/ViewportRenderer'
import { generateOpening2DSvg, toggleSwingHand, toggleSwingDirection } from '../engine/Opening2DSymbology'
import { renderCadBlock2DSvg } from '../catalog/cadBlocks2D'
import type { BimMasterTable } from './BimMasterTable'
import type { Wall } from '../models/Wall'

export interface QuadViewBimHandle {
  toggle: () => void
  open: () => void
  close: () => void
  isActive: () => boolean
  refresh: () => void
  destroy: () => void
}

/**
 * Gestor de la Vista Cuádruple BIM (Planta / Corte / Fachada / 3D).
 * Muestra 4 ventanas simultáneas sincronizadas en tiempo real que leen
 * exactamente la misma Tabla Maestra y SceneManager.
 */
export class QuadViewBimManager {
  private overlayEl: HTMLElement | null = null
  private active = false
  private maximizedQuadrant: number | null = null
  private unsubscribeTable: (() => void) | null = null

  constructor(
    private readonly container: HTMLElement,
    private readonly scene: SceneManager,
    private readonly viewport: ViewportRenderer,
    private readonly bimTable: BimMasterTable
  ) {
    this.createDom()
    this.attachSceneListeners()
  }

  private createDom(): void {
    const overlay = document.createElement('div')
    overlay.className = 'quad-view-overlay is-hidden'
    overlay.setAttribute('id', 'quad-view-bim-overlay')

    overlay.innerHTML = `
      <!-- Cuadrante 1: Planta 2D -->
      <div class="quad-cell" data-quad="1">
        <div class="quad-header">
          <div class="quad-title">
            <span>📐</span> Planta 2D
            <span class="quad-badge">Cotas Dinámicas</span>
          </div>
          <div class="quad-controls">
            <button class="quad-btn" data-quad-action="maximize" title="Maximizar cuadrante">🗖</button>
          </div>
        </div>
        <div class="quad-viewport-area">
          <svg class="quad-svg-canvas" id="quad-canvas-planta" viewBox="-12 -12 24 24"></svg>
        </div>
      </div>

      <!-- Cuadrante 2: Corte / Sección Constructiva -->
      <div class="quad-cell" data-quad="2">
        <div class="quad-header">
          <div class="quad-title">
            <span>✂️</span> Corte / Sección Constructiva A-A'
            <span class="quad-badge">Niveles N.B.T</span>
          </div>
          <div class="quad-controls">
            <button class="quad-btn" data-quad-action="maximize" title="Maximizar cuadrante">🗖</button>
          </div>
        </div>
        <div class="quad-viewport-area">
          <svg class="quad-svg-canvas" id="quad-canvas-corte" viewBox="-12 -2 24 12"></svg>
        </div>
      </div>

      <!-- Cuadrante 3: Fachada / Alzado Exterior -->
      <div class="quad-cell" data-quad="3">
        <div class="quad-header">
          <div class="quad-title">
            <span>🏛️</span> Fachada / Alzado Principal (Sur)
            <span class="quad-badge">Ortogonal</span>
          </div>
          <div class="quad-controls">
            <button class="quad-btn" data-quad-action="maximize" title="Maximizar cuadrante">🗖</button>
          </div>
        </div>
        <div class="quad-viewport-area">
          <svg class="quad-svg-canvas" id="quad-canvas-fachada" viewBox="-12 -2 24 12"></svg>
        </div>
      </div>

      <!-- Cuadrante 4: Perspectiva 3D Interactiva -->
      <div class="quad-cell" data-quad="4">
        <div class="quad-header">
          <div class="quad-title">
            <span>🌐</span> Perspectiva 3D Interactiva
            <span class="quad-badge">WebGL Live</span>
          </div>
          <div class="quad-controls">
            <button class="quad-btn" data-quad-action="maximize" title="Maximizar cuadrante">🗖</button>
            <button class="quad-btn" data-quad-action="close" title="Volver a vista normal (3D completo)">✕</button>
          </div>
        </div>
        <div class="quad-viewport-area" id="quad-3d-host">
          <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 4px; font-size: 10px; color: #94a3b8;">
            * Sincronizado con el motor 3D central
          </div>
        </div>
      </div>
    `

    this.container.appendChild(overlay)
    this.overlayEl = overlay

    // Eventos de controles de cuadrante
    overlay.querySelectorAll<HTMLButtonElement>('[data-quad-action="maximize"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const cell = (e.currentTarget as HTMLElement).closest('.quad-cell') as HTMLElement
        const quadIndex = parseInt(cell.dataset.quad || '1', 10)
        if (this.maximizedQuadrant === quadIndex) {
          this.maximizedQuadrant = null
          cell.classList.remove('is-maximized')
          btn.textContent = '🗖'
        } else {
          overlay.querySelectorAll('.quad-cell').forEach((c) => c.classList.remove('is-maximized'))
          this.maximizedQuadrant = quadIndex
          cell.classList.add('is-maximized')
          btn.textContent = '🗗'
        }
      })
    })

    overlay.querySelector('[data-quad-action="close"]')?.addEventListener('click', () => {
      this.close()
    })

    const svgPlanta = overlay.querySelector('#quad-canvas-planta') as SVGSVGElement | null
    svgPlanta?.addEventListener('click', (e) => {
      const target = e.target as SVGElement
      const flipCtrl = target.closest('.cad-flip-controls')
      const openingGroup = target.closest('.cad-opening-2d') as SVGGElement | null
      if (openingGroup) {
        const openingId = openingGroup.getAttribute('data-opening-id')
        const linkedObj = this.scene.getObjects().find((o) => o.openingId === openingId)
        if (linkedObj) {
          if (flipCtrl) {
            const isDir = target.getAttribute('fill') === '#38bdf8'
            if (isDir) {
              this.scene.updateObject(linkedObj.id, {
                swingDirection: toggleSwingDirection(linkedObj.swingDirection)
              })
            } else {
              this.scene.updateObject(linkedObj.id, {
                swingHand: toggleSwingHand(linkedObj.swingHand)
              })
            }
          } else {
            this.scene.selectObject(linkedObj)
          }
          this.renderPlanta()
        }
      }
    })
  }

  private attachSceneListeners(): void {
    const updateViews = (): void => {
      if (this.active) {
        this.renderPlanta()
        this.renderCorte()
        this.renderFachada()
      }
    }

    this.scene.onWallAdded(updateViews)
    this.scene.onWallRemoved(updateViews)
    this.scene.onWallChanged(updateViews)
    this.scene.onWallMoved(updateViews)
    this.scene.onObjectAdded(updateViews)
    this.scene.onObjectRemoved(updateViews)
    this.scene.onObjectChanged(updateViews)
    this.scene.onObjectMoved(updateViews)
    this.scene.onLevelsChanged(updateViews)

    this.unsubscribeTable = this.bimTable.onChange(() => {
      updateViews()
    })
  }

  public open(): void {
    if (!this.overlayEl) return
    this.active = true
    this.overlayEl.classList.remove('is-hidden')
    this.renderPlanta()
    this.renderCorte()
    this.renderFachada()
  }

  public close(): void {
    if (!this.overlayEl) return
    this.active = false
    this.overlayEl.classList.add('is-hidden')
  }

  public toggle(): void {
    if (this.active) {
      this.close()
    } else {
      this.open()
    }
  }

  public isActive(): boolean {
    return this.active
  }

  public refresh(): void {
    if (this.active) {
      this.renderPlanta()
      this.renderCorte()
      this.renderFachada()
    }
  }

  public destroy(): void {
    if (this.unsubscribeTable) this.unsubscribeTable()
    this.overlayEl?.remove()
  }

  /* ===================================================================
   * 1. Render de Planta 2D con Cotas Dinámicas
   * =================================================================== */
  private renderPlanta(): void {
    const svg = document.getElementById('quad-canvas-planta') as SVGSVGElement | null
    if (!svg) return

    const walls = this.scene.getWalls()
    const objects = this.scene.getObjects()

    // Calcular límites para centrar la vista
    let minX = -8, maxX = 8, minZ = -8, maxZ = 8
    if (walls.length > 0) {
      minX = Math.min(...walls.map((w) => Math.min(w.start.x, w.end.x))) - 3
      maxX = Math.max(...walls.map((w) => Math.max(w.start.x, w.end.x))) + 3
      minZ = Math.min(...walls.map((w) => Math.min(w.start.z, w.end.z))) - 3
      maxZ = Math.max(...walls.map((w) => Math.max(w.start.z, w.end.z))) + 3
    }
    const width = Math.max(16, maxX - minX)
    const height = Math.max(16, maxZ - minZ)
    svg.setAttribute('viewBox', `${minX} ${minZ} ${width} ${height}`)

    let html = `
      <defs>
        <marker id="tick-marker" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <line x1="0" y1="6" x2="6" y2="0" stroke="#38bdf8" stroke-width="1.5" />
        </marker>
      </defs>
      <!-- Cuadrícula base -->
      <g opacity="0.15">
        ${this.buildSvgGrid(minX, maxX, minZ, maxZ)}
      </g>
    `

    // Dibujar objetos/mobiliario con simbología técnica vectorial 2D CAD
    for (const obj of objects) {
      if (obj.openingId) continue // Van sobre el muro anfitrión
      html += renderCadBlock2DSvg(obj)
    }

    // Dibujar muros
    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.z - wall.start.z
      const len = Math.sqrt(dx * dx + dz * dz)
      if (len < 0.05) continue

      const ux = dx / len
      const uz = dz / len
      const nx = -uz * (wall.thickness / 2)
      const nz = ux * (wall.thickness / 2)

      // Función auxiliar para dibujar un tramo sólido de muro
      const addWallSegment = (t0: number, t1: number): void => {
        if (t1 <= t0 + 0.02) return
        const sX = wall.start.x + ux * t0
        const sZ = wall.start.z + uz * t0
        const eX = wall.start.x + ux * t1
        const eZ = wall.start.z + uz * t1

        const pt1 = `${sX + nx},${sZ + nz}`
        const pt2 = `${eX + nx},${eZ + nz}`
        const pt3 = `${eX - nx},${eZ - nz}`
        const pt4 = `${sX - nx},${sZ - nz}`

        html += `
          <polygon
            points="${pt1} ${pt2} ${pt3} ${pt4}"
            class="wall-2d-rect ${wall.isSelected ? 'is-selected' : ''}"
            data-wall-id="${wall.id}"
          />
        `
      }

      // Si no tiene vanos, dibuja el muro continuo
      if (!wall.openings || wall.openings.length === 0) {
        addWallSegment(0, len)
      } else {
        // Divide el muro respetando los cortes reales de vano en 2D (Module 1 y Module 2)
        const sortedOps = [...wall.openings].sort((a, b) => a.x - b.x)
        let curT = 0
        for (const op of sortedOps) {
          const opStart = Math.max(0, op.x - op.width / 2)
          const opEnd = Math.min(len, op.x + op.width / 2)

          // Tramo macizo antes de la abertura
          addWallSegment(curT, opStart)

          // Renderizar simbología CAD 2D del vano (puerta o ventana)
          const linkedObj = objects.find((o) => o.openingId === op.id)
          html += generateOpening2DSvg(wall, op, {
            variant: linkedObj?.openingVariant ?? (op.type === 'door' ? 'simple' : 'corrediza'),
            style: linkedObj?.doorStyle ?? linkedObj?.windowStyle ?? (op.style as any) ?? null,
            swingHand: linkedObj?.swingHand ?? op.swingHand ?? 'left',
            swingDirection: linkedObj?.swingDirection ?? op.swingDirection ?? 'in',
            isSelected: linkedObj?.isSelected ?? false,
            showDimensions: true
          })

          curT = opEnd
        }
        // Tramo macizo final
        addWallSegment(curT, len)
      }

      // Cotas dinámicas exteriores (desplazadas 0.7m en la normal)
      const cotaOffset = 0.65
      const c1x = wall.start.x + nx * (1 + cotaOffset / wall.thickness)
      const c1z = wall.start.z + nz * (1 + cotaOffset / wall.thickness)
      const c2x = wall.end.x + nx * (1 + cotaOffset / wall.thickness)
      const c2z = wall.end.z + nz * (1 + cotaOffset / wall.thickness)

      const midCotaX = (c1x + c2x) / 2
      const midCotaZ = (c1z + c2z) / 2

      html += `
        <g class="cota-group">
          <!-- Línea de cota -->
          <line
            x1="${c1x}" y1="${c1z}"
            x2="${c2x}" y2="${c2z}"
            class="cota-line"
            marker-start="url(#tick-marker)"
            marker-end="url(#tick-marker)"
            stroke-width="0.04"
          />
          <!-- Texto de cota con longitud exacta -->
          <rect
            x="${midCotaX - 0.5}"
            y="${midCotaZ - 0.25}"
            width="1.0"
            height="0.5"
            fill="#111827"
            rx="0.1"
          />
          <text
            x="${midCotaX}"
            y="${midCotaZ + 0.1}"
            class="cota-text"
            font-size="0.32"
          >${wall.length.toFixed(2)}m</text>
        </g>
      `
    }

    svg.innerHTML = html
  }

  /* ===================================================================
   * 2. Render de Corte / Sección Constructiva con Niveles N.B.T
   * =================================================================== */
  private renderCorte(): void {
    const svg = document.getElementById('quad-canvas-corte') as SVGSVGElement | null
    if (!svg) return

    const walls = this.scene.getWalls()
    const levels = this.scene.getLevels()
    const objects = this.scene.getObjects()

    let minX = -6, maxX = 6
    if (walls.length > 0) {
      minX = Math.min(...walls.map((w) => Math.min(w.start.x, w.end.x))) - 3
      maxX = Math.max(...walls.map((w) => Math.max(w.start.x, w.end.x))) + 3
    }

    const maxY = Math.max(7, ...levels.map((l) => l.elevation + 3.5))
    svg.setAttribute('viewBox', `${minX} -1 ${maxX - minX} ${maxY + 2}`)

    let html = `
      <!-- Terreno natural (Línea de tierra) -->
      <line x1="${minX}" y1="0" x2="${maxX}" y2="0" stroke="#65a30d" stroke-width="0.1" />
      <polygon points="${minX},0 ${maxX},0 ${maxX},-1 ${minX},-1" fill="rgba(101, 163, 13, 0.15)" />
    `

    // Dibujar niveles N.B.T
    for (const lev of levels) {
      const y = lev.elevation
      html += `
        <g class="nbt-level-group">
          <!-- Línea discontinua de nivel -->
          <line
            x1="${minX}"
            y1="${y}"
            x2="${maxX}"
            y2="${y}"
            class="cota-nbt-line"
            stroke-width="0.04"
          />
          <!-- Símbolo de nivel N.B.T -->
          <polygon
            points="${minX + 0.5},${y} ${minX + 0.2},${y + 0.3} ${minX + 0.8},${y + 0.3}"
            fill="#f59e0b"
          />
          <text
            x="${minX + 0.9}"
            y="${y + 0.25}"
            class="cota-nbt-text"
            font-size="0.28"
          >N.B.T ${lev.name} (+${y.toFixed(2)}m)</text>
        </g>
      `
    }

    // Dibujar sección de muros proyectados
    for (const wall of walls) {
      const lev = levels.find((l) => l.id === wall.levelId)
      const baseElev = lev?.elevation ?? 0
      const topElev = baseElev + wall.height

      const x = (wall.start.x + wall.end.x) / 2
      const w = Math.max(wall.thickness, 0.25)

      html += `
        <!-- Corte de muro -->
        <rect
          x="${x - w / 2}"
          y="${baseElev}"
          width="${w}"
          height="${wall.height}"
          fill="#475569"
          stroke="#94a3b8"
          stroke-width="0.04"
        />
        <!-- Rayado de sección constructiva -->
        <line x1="${x - w / 2}" y1="${baseElev}" x2="${x + w / 2}" y2="${topElev}" stroke="#334155" stroke-width="0.02" />
        <!-- Cota de altura de muro -->
        <text
          x="${x + w + 0.2}"
          y="${baseElev + wall.height / 2}"
          class="cota-text"
          font-size="0.22"
          text-anchor="start"
        >h=${wall.height.toFixed(2)}m</text>
      `
    }

    // Dibujar losas de forjado en el corte
    for (const lev of levels) {
      const slabY = lev.elevation
      html += `
        <!-- Losa de entrepiso / forjado -->
        <rect
          x="${minX + 1}"
          y="${slabY - 0.2}"
          width="${maxX - minX - 2}"
          height="0.2"
          fill="#3b82f6"
          opacity="0.3"
          stroke="#3b82f6"
          stroke-width="0.03"
        />
        <text
          x="${maxX - 2.5}"
          y="${slabY - 0.05}"
          font-size="0.18"
          fill="#60a5fa"
        >Losa e=0.20m</text>
      `
    }

    // Techos / Cubiertas
    for (const obj of objects) {
      if (obj.kind === 'roof' || obj.roofProps) {
        const yBase = obj.position.y
        html += `
          <!-- Cubierta / Techo en corte -->
          <polygon
            points="${obj.position.x - obj.size.x / 2},${yBase} ${obj.position.x},${yBase + obj.size.y} ${obj.position.x + obj.size.x / 2},${yBase}"
            fill="rgba(239, 68, 68, 0.25)"
            stroke="#ef4444"
            stroke-width="0.05"
          />
          <text
            x="${obj.position.x}"
            y="${yBase + obj.size.y + 0.3}"
            class="cota-text"
            font-size="0.24"
            fill="#ef4444"
          >Cumbrera +${(yBase + obj.size.y).toFixed(2)}m</text>
        `
      }
    }

    svg.innerHTML = html
  }

  /* ===================================================================
   * 3. Render de Fachada / Alzado Principal (Ortogonal)
   * =================================================================== */
  private renderFachada(): void {
    const svg = document.getElementById('quad-canvas-fachada') as SVGSVGElement | null
    if (!svg) return

    const walls = this.scene.getWalls()
    const levels = this.scene.getLevels()
    const objects = this.scene.getObjects()

    let minX = -6, maxX = 6
    if (walls.length > 0) {
      minX = Math.min(...walls.map((w) => Math.min(w.start.x, w.end.x))) - 3
      maxX = Math.max(...walls.map((w) => Math.max(w.start.x, w.end.x))) + 3
    }
    const maxY = Math.max(7, ...levels.map((l) => l.elevation + 4))
    svg.setAttribute('viewBox', `${minX} -1 ${maxX - minX} ${maxY + 2}`)

    let html = `
      <!-- Suelo rasante de fachada -->
      <line x1="${minX}" y1="0" x2="${maxX}" y2="0" stroke="#475569" stroke-width="0.08" />
    `

    // Proyección frontal de muros (alzado)
    for (const wall of walls) {
      const lev = levels.find((l) => l.id === wall.levelId)
      const baseElev = lev?.elevation ?? 0
      const leftX = Math.min(wall.start.x, wall.end.x)
      const rightX = Math.max(wall.start.x, wall.end.x)
      const w = Math.max(0.4, rightX - leftX)

      html += `
        <!-- Fachada muro -->
        <rect
          x="${leftX}"
          y="${baseElev}"
          width="${w}"
          height="${wall.height}"
          fill="#334155"
          stroke="#64748b"
          stroke-width="0.05"
        />
      `

      // Dibujar huecos de puertas y ventanas
      for (const op of wall.openings) {
        const opX = leftX + op.x
        const opY = baseElev + op.sill
        const isDoor = op.type === 'door'
        html += `
          <rect
            x="${opX}"
            y="${opY}"
            width="${op.width}"
            height="${op.height}"
            fill="${isDoor ? '#854d0e' : '#38bdf8'}"
            opacity="${isDoor ? '0.7' : '0.4'}"
            stroke="#f8fafc"
            stroke-width="0.03"
          />
        `
      }
    }

    // Cubiertas en fachada
    for (const obj of objects) {
      if (obj.kind === 'roof' || obj.roofProps) {
        const yBase = obj.position.y
        html += `
          <polygon
            points="${obj.position.x - obj.size.x / 2 - 0.3},${yBase} ${obj.position.x},${yBase + obj.size.y} ${obj.position.x + obj.size.x / 2 + 0.3},${yBase}"
            fill="#b91c1c"
            stroke="#fca5a5"
            stroke-width="0.06"
          />
        `
      }
    }

    svg.innerHTML = html
  }

  private buildSvgGrid(minX: number, maxX: number, minZ: number, maxZ: number): string {
    let out = ''
    const startX = Math.floor(minX)
    const endX = Math.ceil(maxX)
    const startZ = Math.floor(minZ)
    const endZ = Math.ceil(maxZ)

    for (let x = startX; x <= endX; x++) {
      out += `<line x1="${x}" y1="${startZ}" x2="${x}" y2="${endZ}" stroke="#64748b" stroke-width="0.02" />`
    }
    for (let z = startZ; z <= endZ; z++) {
      out += `<line x1="${startX}" y1="${z}" x2="${endX}" y2="${z}" stroke="#64748b" stroke-width="0.02" />`
    }
    return out
  }
}

