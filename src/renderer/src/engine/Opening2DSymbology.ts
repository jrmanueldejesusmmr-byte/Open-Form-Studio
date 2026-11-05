import * as THREE from 'three'
import type { Opening, DoorStyle, WindowStyle, SwingHand, SwingDirection } from '../models/Opening'
import type { SceneObject } from '../models/SceneObject'
import type { Wall } from '../models/Wall'

/** Colores estándar de simbología arquitectónica CAD/BIM (estilo AutoCAD + YQArch). */
export const CAD_COLORS = {
  doorGreen: '#22c55e',      // Verde brillante clásico AutoCAD para puertas
  doorGreenHex: 0x22c55e,
  windowCyan: '#06b6d4',     // Cian CAD para ventanas y cristales
  windowCyanHex: 0x06b6d4,
  wallLine: '#f8fafc',       // Línea continua de muro / antepecho
  wallLineHex: 0xf8fafc,
  frameGray: '#94a3b8',      // Marcos / jambas laterales
  frameGrayHex: 0x94a3b8,
  arcDash: '#4ade80',        // Línea de arco de abatimiento
  arcDashHex: 0x4ade80,
  flipArrow: '#f59e0b',      // Flechas interactivas de flip
  flipArrowHex: 0xf59e0b,
  textWhite: '#e2e8f0'
} as const

export interface Opening2DSpec {
  id: string
  type: 'door' | 'window'
  x: number // metros desde el inicio del muro al centro
  width: number
  height: number
  sill: number
  variant: string
  style?: DoorStyle | WindowStyle | null
  swingHand: SwingHand
  swingDirection: SwingDirection
  openingAngle?: number
}

/**
 * Detecta automáticamente la mano (`left` | `right`) y el sentido (`in` | `out`)
 * del abatimiento a partir de la posición del cursor respecto a la línea del muro.
 */
export function detectSwingFromPointer(
  wallStart: THREE.Vector3,
  wallEnd: THREE.Vector3,
  pointerPoint: THREE.Vector3,
  openingCenterT: number
): { swingHand: SwingHand; swingDirection: SwingDirection } {
  const dx = wallEnd.x - wallStart.x
  const dz = wallEnd.z - wallStart.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return { swingHand: 'left', swingDirection: 'in' }

  const ux = dx / len
  const uz = dz / len

  // Proyección a lo largo del muro
  const relX = pointerPoint.x - wallStart.x
  const relZ = pointerPoint.z - wallStart.z
  const t = relX * ux + relZ * uz

  // Distancia perpendicular orientada respecto a la normal izquierda (-uz, ux)
  const perp = relX * -uz + relZ * ux

  const swingDirection: SwingDirection = perp >= 0 ? 'in' : 'out'
  const swingHand: SwingHand = t <= openingCenterT ? 'left' : 'right'

  return { swingHand, swingDirection }
}

/**
 * Invierte la mano de la bisagra (Izquierda <-> Derecha).
 */
export function toggleSwingHand(current: SwingHand): SwingHand {
  return current === 'left' ? 'right' : 'left'
}

/**
 * Invierte la dirección de apertura (Interior <-> Exterior).
 */
export function toggleSwingDirection(current: SwingDirection): SwingDirection {
  return current === 'in' ? 'out' : 'in'
}

/**
 * Genera el marcado SVG 2D completo de la simbología CAD de una abertura
 * orientada sobre su muro anfitrión (para el visor de Planta 2D).
 */
export function generateOpening2DSvg(
  wall: Wall,
  opening: Opening,
  options: {
    variant?: string
    style?: string | null
    swingHand?: SwingHand
    swingDirection?: SwingDirection
    isSelected?: boolean
    showDimensions?: boolean
  } = {}
): string {
  const isDoor = opening.type === 'door'
  const w = opening.width
  const wt = wall.thickness
  const halfWt = wt / 2
  const variant = (options.variant ?? (isDoor ? 'simple' : 'corrediza')).toLowerCase()
  const swingHand: SwingHand = options.swingHand ?? opening.swingHand ?? 'left'
  const swingDirection: SwingDirection = options.swingDirection ?? opening.swingDirection ?? 'in'
  const isSelected = options.isSelected ?? false

  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return ''

  const angleRad = Math.atan2(dz, dx)
  const angleDeg = (angleRad * 180) / Math.PI

  // Centro de la abertura en el mundo
  const ux = dx / len
  const uz = dz / len
  const centerX = wall.start.x + ux * opening.x
  const centerZ = wall.start.z + uz * opening.x

  const frameWidth = 0.05
  const halfW = w / 2

  let innerSvg = ''

  if (isDoor) {
    // -------------------------------------------------------------
    // SIMBOLOGÍA CAD PARA PUERTAS
    // -------------------------------------------------------------
    const leafThickness = 0.04
    const doorColor = CAD_COLORS.doorGreen
    const dirSign = swingDirection === 'in' ? 1 : -1 // Dirección perpendicular en SVG local

    // 1. Jambas / marcos laterales
    innerSvg += `
      <!-- Jambas -->
      <rect x="${-halfW}" y="${-halfWt}" width="${frameWidth}" height="${wt}" fill="${CAD_COLORS.frameGray}" stroke="#334155" stroke-width="0.015" />
      <rect x="${halfW - frameWidth}" y="${-halfWt}" width="${frameWidth}" height="${wt}" fill="${CAD_COLORS.frameGray}" stroke="#334155" stroke-width="0.015" />
    `

    const isDouble = variant.includes('doble') || variant.includes('double') || options.style === 'dobleHoja'
    const isSliding = variant.includes('corrediza') || variant.includes('sliding')
    const isVaiven = variant.includes('vaiven') || variant.includes('doble-accion')

    if (isSliding) {
      // Puerta corrediza: dos rieles/hojas paralelas desfasadas
      const sashW = halfW * 1.05
      innerSvg += `
        <!-- Hoja corrediza 1 -->
        <rect x="${-halfW}" y="${-leafThickness * 1.2}" width="${sashW}" height="${leafThickness}" fill="${doorColor}" stroke="#15803d" stroke-width="0.015" rx="0.01" />
        <!-- Hoja corrediza 2 -->
        <rect x="${-0.02}" y="${leafThickness * 0.2}" width="${sashW}" height="${leafThickness}" fill="${doorColor}" stroke="#15803d" stroke-width="0.015" rx="0.01" />
        <!-- Guía de riel -->
        <line x1="${-halfW - 0.05}" y1="0" x2="${halfW + 0.05}" y2="0" stroke="${doorColor}" stroke-dasharray="0.06,0.04" stroke-width="0.02" />
      `
    } else if (isVaiven) {
      // Puerta vaivén: hojas con doble arco cruzado en ambas direcciones
      const usableW = w - frameWidth * 2
      const hingeX = swingHand === 'left' ? -halfW + frameWidth : halfW - frameWidth
      const leafX = swingHand === 'left' ? hingeX : hingeX - leafThickness
      const openLen = usableW * 0.95

      innerSvg += `
        <!-- Hoja a 90° interior -->
        <rect x="${leafX}" y="${dirSign > 0 ? 0 : -openLen}" width="${leafThickness}" height="${openLen}" fill="${doorColor}" stroke="#15803d" stroke-width="0.015" />
        <!-- Arco interior -->
        <path d="M ${swingHand === 'left' ? halfW - frameWidth : -halfW + frameWidth} 0 A ${usableW} ${usableW} 0 0 ${swingHand === 'left' ? (dirSign > 0 ? 1 : 0) : (dirSign > 0 ? 0 : 1)} ${hingeX} ${dirSign * usableW}" fill="none" stroke="${CAD_COLORS.arcDash}" stroke-width="0.02" stroke-dasharray="0.08,0.04" />
        <!-- Arco exterior cruzado (vaivén) -->
        <path d="M ${swingHand === 'left' ? halfW - frameWidth : -halfW + frameWidth} 0 A ${usableW} ${usableW} 0 0 ${swingHand === 'left' ? (dirSign > 0 ? 0 : 1) : (dirSign > 0 ? 1 : 0)} ${hingeX} ${-dirSign * usableW}" fill="none" stroke="${CAD_COLORS.arcDash}" stroke-width="0.02" stroke-dasharray="0.08,0.04" />
      `
    } else if (isDouble) {
      // Puerta doble abatible: dos hojas simétricas y dos arcos formando "M"
      const leafSpan = (w - frameWidth * 2) / 2
      const leftHinge = -halfW + frameWidth
      const rightHinge = halfW - frameWidth

      innerSvg += `
        <!-- Hoja izquierda abierta 90° -->
        <rect x="${leftHinge}" y="${dirSign > 0 ? 0 : -leafSpan}" width="${leafThickness}" height="${leafSpan}" fill="${doorColor}" stroke="#15803d" stroke-width="0.015" />
        <!-- Hoja derecha abierta 90° -->
        <rect x="${rightHinge - leafThickness}" y="${dirSign > 0 ? 0 : -leafSpan}" width="${leafThickness}" height="${leafSpan}" fill="${doorColor}" stroke="#15803d" stroke-width="0.015" />
        <!-- Arco izquierdo -->
        <path d="M 0 0 A ${leafSpan} ${leafSpan} 0 0 ${dirSign > 0 ? 1 : 0} ${leftHinge} ${dirSign * leafSpan}" fill="none" stroke="${CAD_COLORS.arcDash}" stroke-width="0.02" stroke-dasharray="0.08,0.04" />
        <!-- Arco derecho -->
        <path d="M 0 0 A ${leafSpan} ${leafSpan} 0 0 ${dirSign > 0 ? 0 : 1} ${rightHinge} ${dirSign * leafSpan}" fill="none" stroke="${CAD_COLORS.arcDash}" stroke-width="0.02" stroke-dasharray="0.08,0.04" />
      `
    } else {
      // Puerta simple estándar: hoja rectangular a 90° + arco de cuarto de vuelta
      const usableW = w - frameWidth * 2
      const hingeX = swingHand === 'left' ? -halfW + frameWidth : halfW - frameWidth
      const freeEdgeX = swingHand === 'left' ? halfW - frameWidth : -halfW + frameWidth
      const leafX = swingHand === 'left' ? hingeX : hingeX - leafThickness

      // Arco de 90°
      const sweepFlag = swingHand === 'left' ? (dirSign > 0 ? 1 : 0) : (dirSign > 0 ? 0 : 1)
      const targetY = dirSign * usableW

      innerSvg += `
        <!-- Hoja abierta a 90° -->
        <rect x="${leafX}" y="${dirSign > 0 ? 0 : -usableW}" width="${leafThickness}" height="${usableW}" fill="${doorColor}" stroke="#15803d" stroke-width="0.015" rx="0.005" />
        <!-- Arco de abatimiento CAD (cuarto de circunferencia) -->
        <path d="M ${freeEdgeX} 0 A ${usableW} ${usableW} 0 0 ${sweepFlag} ${hingeX} ${targetY}" fill="none" stroke="${CAD_COLORS.arcDash}" stroke-width="0.025" stroke-dasharray="0.08,0.04" />
      `
    }

    // Flechas interactivas de Flip si está seleccionada
    if (isSelected) {
      innerSvg += `
        <!-- Botones interactivos de Flip sobre la puerta -->
        <g class="cad-flip-controls" style="cursor: pointer;">
          <!-- Flecha de cambio de mano (Izquierda/Derecha) -->
          <circle cx="0" cy="0" r="0.18" fill="${CAD_COLORS.flipArrow}" opacity="0.9" />
          <path d="M -0.10 0 L 0.10 0 M -0.06 -0.05 L -0.10 0 L -0.06 0.05 M 0.06 -0.05 L 0.10 0 L 0.06 0.05" stroke="#111827" stroke-width="0.03" stroke-linecap="round" />
          
          <!-- Flecha de apertura (Interior/Exterior) -->
          <circle cx="0" cy="${dirSign * 0.45}" r="0.16" fill="#38bdf8" opacity="0.9" />
          <path d="M 0 ${dirSign * 0.35} L 0 ${dirSign * 0.55} M -0.04 ${dirSign * 0.51} L 0 ${dirSign * 0.55} L 0.04 ${dirSign * 0.51}" stroke="#111827" stroke-width="0.03" stroke-linecap="round" />
        </g>
      `
    }
  } else {
    // -------------------------------------------------------------
    // SIMBOLOGÍA CAD PARA VENTANAS (DISTINCIÓN CLARA DE PUERTAS Y MUROS)
    // -------------------------------------------------------------
    const winColor = CAD_COLORS.windowCyan
    const sashThickness = 0.035

    // 1. Líneas de antepecho de mampostería continuo exterior e interior
    innerSvg += `
      <!-- Antepecho continuo (líneas exteriores del muro sin relleno macizo) -->
      <line x1="${-halfW}" y1="${-halfWt}" x2="${halfW}" y2="${-halfWt}" stroke="${CAD_COLORS.wallLine}" stroke-width="0.04" />
      <line x1="${-halfW}" y1="${halfWt}" x2="${halfW}" y2="${halfWt}" stroke="${CAD_COLORS.wallLine}" stroke-width="0.04" />
      <!-- Jambas laterales -->
      <rect x="${-halfW}" y="${-halfWt}" width="${frameWidth}" height="${wt}" fill="${CAD_COLORS.frameGray}" stroke="#334155" stroke-width="0.015" />
      <rect x="${halfW - frameWidth}" y="${-halfWt}" width="${frameWidth}" height="${wt}" fill="${CAD_COLORS.frameGray}" stroke="#334155" stroke-width="0.015" />
    `

    const isFixed = variant.includes('fija') || options.style === 'pisoTecho'
    const isCasement = variant.includes('abatible') || options.style === 'abatibleDoble'

    if (isFixed) {
      // Ventana fija: doble línea central de cristal
      innerSvg += `
        <!-- Doble línea central de cristal fijo -->
        <line x1="${-halfW + frameWidth}" y1="-0.012" x2="${halfW - frameWidth}" y2="-0.012" stroke="${winColor}" stroke-width="0.02" />
        <line x1="${-halfW + frameWidth}" y1="0.012" x2="${halfW - frameWidth}" y2="0.012" stroke="${winColor}" stroke-width="0.02" />
      `
    } else if (isCasement) {
      // Ventana abatible / proyectante: marco y líneas punteadas proyectantes
      innerSvg += `
        <!-- Cristal central -->
        <line x1="${-halfW + frameWidth}" y1="0" x2="${halfW - frameWidth}" y2="0" stroke="${winColor}" stroke-width="0.025" />
        <!-- Proyección abatible punteada -->
        <path d="M ${-halfW + frameWidth} 0 L 0 ${halfWt * 1.5} L ${halfW - frameWidth} 0" fill="none" stroke="${winColor}" stroke-width="0.02" stroke-dasharray="0.06,0.04" />
      `
    } else {
      // Ventana corredera clásica (2 o 4 hojas escalonadas en el punto medio)
      const sashW = halfW * 1.04
      innerSvg += `
        <!-- Hoja corredera 1 (desfasada a la izquierda) -->
        <rect x="${-halfW + frameWidth}" y="${-sashThickness - 0.005}" width="${sashW}" height="${sashThickness}" fill="${winColor}" opacity="0.85" stroke="#0e7490" stroke-width="0.015" rx="0.005" />
        <!-- Hoja corredera 2 (desfasada a la derecha) -->
        <rect x="${-0.02}" y="${0.005}" width="${sashW}" height="${sashThickness}" fill="${winColor}" opacity="0.85" stroke="#0e7490" stroke-width="0.015" rx="0.005" />
      `
    }
  }

  // Etiqueta de cota CAD opcional mostrando Vano y Antepecho/Altura
  if (options.showDimensions ?? true) {
    const textLabel = isDoor
      ? `P ${w.toFixed(2)}m`
      : `V ${w.toFixed(2)}m (A:${opening.sill.toFixed(2)})`

    innerSvg += `
      <g opacity="0.85" pointer-events="none">
        <rect x="${-0.45}" y="${halfWt + 0.08}" width="0.9" height="0.22" rx="0.04" fill="#0f172a" />
        <text x="0" y="${halfWt + 0.23}" text-anchor="middle" font-size="0.14" font-weight="600" fill="${isDoor ? CAD_COLORS.doorGreen : CAD_COLORS.windowCyan}">
          ${textLabel}
        </text>
      </g>
    `
  }

  return `
    <g
      class="cad-opening-2d ${isDoor ? 'cad-door-2d' : 'cad-window-2d'} ${isSelected ? 'is-selected' : ''}"
      data-opening-id="${opening.id}"
      data-wall-id="${wall.id}"
      transform="translate(${centerX.toFixed(4)}, ${centerZ.toFixed(4)}) rotate(${angleDeg.toFixed(2)})"
    >
      ${innerSvg}
    </g>
  `
}

/**
 * Construye la geometría Three.js con simbología 2D CAD para proyectar directamente
 * en el suelo o en la coronación de los muros en modo 2D o vista arquitectónica.
 */
export function buildOpening2DThreeGroup(
  wall: Wall,
  opening: Opening,
  options: {
    variant?: string
    style?: string | null
    swingHand?: SwingHand
    swingDirection?: SwingDirection
    isSelected?: boolean
  } = {}
): THREE.Group {
  const group = new THREE.Group()
  group.name = `opening-2d-${opening.id}`

  const isDoor = opening.type === 'door'
  const w = opening.width
  const wt = wall.thickness
  const halfWt = wt / 2
  const swingHand = options.swingHand ?? opening.swingHand ?? 'left'
  const swingDirection = options.swingDirection ?? opening.swingDirection ?? 'in'
  const dirSign = swingDirection === 'in' ? 1 : -1
  const halfW = w / 2

  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return group

  const ux = dx / len
  const uz = dz / len
  const angleY = -Math.atan2(dz, dx)

  group.position.set(wall.start.x + ux * opening.x, 0.02, wall.start.z + uz * opening.x)
  group.rotation.y = angleY

  const doorMat = new THREE.LineBasicMaterial({
    color: CAD_COLORS.doorGreenHex,
    linewidth: 2,
    depthTest: false
  })
  const winMat = new THREE.LineBasicMaterial({
    color: CAD_COLORS.windowCyanHex,
    linewidth: 2,
    depthTest: false
  })
  const sillMat = new THREE.LineBasicMaterial({
    color: CAD_COLORS.wallLineHex,
    linewidth: 2,
    depthTest: false
  })

  if (isDoor) {
    const frameW = 0.05
    const usableW = w - frameW * 2
    const hingeX = swingHand === 'left' ? -halfW + frameW : halfW - frameW
    const freeEdgeX = swingHand === 'left' ? halfW - frameW : -halfW + frameW

    // Hoja a 90°
    const leafPoints = [
      new THREE.Vector3(hingeX, 0, 0),
      new THREE.Vector3(hingeX, 0, dirSign * usableW)
    ]
    const leafGeo = new THREE.BufferGeometry().setFromPoints(leafPoints)
    group.add(new THREE.Line(leafGeo, doorMat))

    // Arco de 90° de cuarto de vuelta
    const curvePoints: THREE.Vector3[] = []
    const segments = 24
    const startAngle = swingHand === 'left' ? 0 : Math.PI
    const deltaAngle = (Math.PI / 2) * (swingHand === 'left' ? dirSign : -dirSign)

    for (let i = 0; i <= segments; i++) {
      const theta = startAngle + (deltaAngle * i) / segments
      const x = hingeX + usableW * Math.cos(theta) * (swingHand === 'left' ? 1 : -1)
      const z = usableW * Math.sin(theta)
      curvePoints.push(new THREE.Vector3(x, 0, z))
    }

    const arcGeo = new THREE.BufferGeometry().setFromPoints(curvePoints)
    group.add(new THREE.Line(arcGeo, doorMat))
  } else {
    // Líneas continuas de antepecho
    const sillFrontPoints = [new THREE.Vector3(-halfW, 0, -halfWt), new THREE.Vector3(halfW, 0, -halfWt)]
    const sillBackPoints = [new THREE.Vector3(-halfW, 0, halfWt), new THREE.Vector3(halfW, 0, halfWt)]
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sillFrontPoints), sillMat))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sillBackPoints), sillMat))

    // Líneas de hojas corredizas interiores
    const sash1Points = [new THREE.Vector3(-halfW, 0, -0.015), new THREE.Vector3(0.04, 0, -0.015)]
    const sash2Points = [new THREE.Vector3(-0.04, 0, 0.015), new THREE.Vector3(halfW, 0, 0.015)]
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sash1Points), winMat))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sash2Points), winMat))
  }

  return group
}

