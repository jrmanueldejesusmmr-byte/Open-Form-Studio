import type { DashboardProject } from '../models/DashboardProject'
import { createSampleDesigns } from '../models/ProjectDesign'

/**
 * Miniatura de una tarjeta de proyecto: dibuja el plano real del
 * `ProjectDesign` asociado (los mismos muros que carga el editor 3D) como SVG.
 * Así la tarjeta anticipa lo que verá el usuario en el lienzo, sin necesidad de
 * renderizar la escena con WebGL.
 */

const designs = createSampleDesigns()

const VIEW_WIDTH = 200
const VIEW_HEIGHT = 110
const PADDING = 16

export function planThumbnailSvg(designIndex: number): string {
  const design = designs[Math.abs(designIndex) % designs.length] ?? designs[0]

  const points = design.walls.flatMap((wall) => [wall.start, wall.end])
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  const spanX = Math.max(maxX - minX, 0.001)
  const spanZ = Math.max(maxZ - minZ, 0.001)
  const scale = Math.min((VIEW_WIDTH - PADDING * 2) / spanX, (VIEW_HEIGHT - PADDING * 2) / spanZ)
  const offsetX = (VIEW_WIDTH - spanX * scale) / 2
  const offsetY = (VIEW_HEIGHT - spanZ * scale) / 2
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2

  // El eje Z del modelo se dibuja hacia abajo en el SVG (planta como en el lienzo).
  const toScreen = (point: { x: number; z: number }): [number, number] => [
    offsetX + (point.x - centerX + spanX / 2) * scale,
    offsetY + (point.z - centerZ + spanZ / 2) * scale
  ]

  const lines = design.walls
    .map((wall) => {
      const [x1, y1] = toScreen(wall.start)
      const [x2, y2] = toScreen(wall.end)
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`
    })
    .join('')

  return `<svg class="plan-thumb" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <pattern id="plan-grid-${designIndex}" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0v10" fill="none" stroke="rgba(120,150,190,0.10)" stroke-width="0.6" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#plan-grid-${designIndex})" />
      <g class="plan-thumb__walls">${lines}</g>
    </svg>`
}

/** Miniatura a partir del propio registro de proyecto. */
export function projectThumbnailSvg(project: Pick<DashboardProject, 'designIndex'>): string {
  return planThumbnailSvg(project.designIndex)
}
