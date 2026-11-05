import * as THREE from 'three'
import type { BackgroundThemeDef, WorkBgStyleId } from '../services/ThemeManager'

/**
 * Genera la geometría de líneas de la cuadrícula del plano de trabajo
 * (estilo CAD, plano X-Z), equivalente a Engine/GridBuilder.cs de la
 * versión WPF.
 */
export function buildGrid(halfExtent = 25, cellSize = 1): THREE.LineSegments {
  const points: number[] = []

  // El bucle original avanzaba con `x += cellSize`, de modo que un `cellSize`
  // 0/negativo (o un `halfExtent` no finito) impedía alcanzar la condición de
  // salida y colgaba la aplicación. Se sanean los parámetros y se pasa a un
  // bucle contado, con condición de salida declarada y siempre alcanzable.
  const extent = Number.isFinite(halfExtent) ? Math.abs(halfExtent) : 25
  const cell = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 1
  // Tope de seguridad: con parámetros extremos la rejilla se recorta, pero el
  // número de iteraciones queda acotado.
  const MAX_LINES_PER_AXIS = 4096
  const lineCount = Math.min(Math.floor(extent / cell) * 2 + 1, MAX_LINES_PER_AXIS)

  for (let i = 0; i < lineCount; i++) {
    const x = -extent + i * cell
    points.push(x, 0, -extent, x, 0, extent)
  }
  for (let i = 0; i < lineCount; i++) {
    const z = -extent + i * cell
    points.push(-extent, 0, z, extent, 0, z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.24
  })

  return new THREE.LineSegments(geometry, material)
}

export interface WorkspaceGridSystem {
  group: THREE.Group
  updateTheme: (themeDef: BackgroundThemeDef, workBgStyle: WorkBgStyleId, userGridVisible: boolean) => void
  dispose: () => void
}

/**
 * Construye el sistema de referencia del plano de trabajo X-Z sincronizado
 * con el tema activo y con el "Estilo de Fondo de Trabajo":
 * - `'grid'`: retícula `THREE.GridHelper` (subdivisiones de 1 m + líneas maestras de 5 m).
 * - `'dots'`: matriz de puntos 3D sobre el plano X-Z.
 * - `'solid'`: fondo limpio sin retícula ni puntos.
 */
export function buildWorkspaceGridSystem(halfExtent = 50, cellSize = 1): WorkspaceGridSystem {
  const extent = Number.isFinite(halfExtent) ? Math.abs(halfExtent) : 50
  const cell = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 1
  const totalSize = extent * 2
  const minorDivisions = Math.max(2, Math.min(Math.round(totalSize / cell), 400))
  const majorDivisions = Math.max(2, Math.min(Math.round(totalSize / (cell * 5)), 100))

  const group = new THREE.Group()
  group.name = 'WorkspaceGridSystem'

  let minorGrid: THREE.GridHelper | null = null
  let majorGrid: THREE.GridHelper | null = null
  let lastMajorHex = ''
  let lastMinorHex = ''

  // Matriz de puntos 3D para el modo 'dots'
  const dotPositions: number[] = []
  const dotCount = Math.min(Math.floor(extent / cell) * 2 + 1, 201)
  for (let ix = 0; ix < dotCount; ix++) {
    const x = -extent + ix * cell
    for (let iz = 0; iz < dotCount; iz++) {
      const z = -extent + iz * cell
      dotPositions.push(x, 0.003, z)
    }
  }
  const dotsGeometry = new THREE.BufferGeometry()
  dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3))
  const dotsMaterial = new THREE.PointsMaterial({
    color: 0x64748b,
    size: 3.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.72
  })
  const dotsPoints = new THREE.Points(dotsGeometry, dotsMaterial)
  dotsPoints.visible = false
  group.add(dotsPoints)

  const rebuildGridHelpers = (themeDef: BackgroundThemeDef): void => {
    if (minorGrid) {
      group.remove(minorGrid)
      minorGrid.geometry.dispose()
      if (Array.isArray(minorGrid.material)) minorGrid.material.forEach((m) => m.dispose())
      else minorGrid.material.dispose()
    }
    if (majorGrid) {
      group.remove(majorGrid)
      majorGrid.geometry.dispose()
      if (Array.isArray(majorGrid.material)) majorGrid.material.forEach((m) => m.dispose())
      else majorGrid.material.dispose()
    }

    const majorColor = new THREE.Color(themeDef.gridMajor)
    const minorColor = new THREE.Color(themeDef.gridMinor)
    const isLight = themeDef.colorScheme === 'light'

    minorGrid = new THREE.GridHelper(totalSize, minorDivisions, majorColor, minorColor)
    const minorMat = minorGrid.material as THREE.LineBasicMaterial
    minorMat.transparent = true
    minorMat.opacity = isLight ? 0.55 : 0.48
    minorMat.depthWrite = false

    majorGrid = new THREE.GridHelper(totalSize, majorDivisions, majorColor, majorColor)
    majorGrid.position.y = 0.0015
    const majorMat = majorGrid.material as THREE.LineBasicMaterial
    majorMat.transparent = true
    majorMat.opacity = isLight ? 0.78 : 0.72
    majorMat.depthWrite = false

    group.add(minorGrid)
    group.add(majorGrid)
    lastMajorHex = themeDef.gridMajor
    lastMinorHex = themeDef.gridMinor
  }

  const updateTheme = (
    themeDef: BackgroundThemeDef,
    workBgStyle: WorkBgStyleId,
    userGridVisible: boolean
  ): void => {
    if (!minorGrid || !majorGrid || lastMajorHex !== themeDef.gridMajor || lastMinorHex !== themeDef.gridMinor) {
      rebuildGridHelpers(themeDef)
    }
    dotsMaterial.color.set(themeDef.gridDots)
    dotsMaterial.opacity = themeDef.colorScheme === 'light' ? 0.75 : 0.68

    if (!userGridVisible || workBgStyle === 'solid') {
      if (minorGrid) minorGrid.visible = false
      if (majorGrid) majorGrid.visible = false
      dotsPoints.visible = false
    } else if (workBgStyle === 'dots') {
      if (minorGrid) minorGrid.visible = false
      if (majorGrid) majorGrid.visible = false
      dotsPoints.visible = true
    } else {
      if (minorGrid) minorGrid.visible = true
      if (majorGrid) majorGrid.visible = true
      dotsPoints.visible = false
    }
  }

  const dispose = (): void => {
    if (minorGrid) {
      minorGrid.geometry.dispose()
      if (Array.isArray(minorGrid.material)) minorGrid.material.forEach((m) => m.dispose())
      else minorGrid.material.dispose()
    }
    if (majorGrid) {
      majorGrid.geometry.dispose()
      if (Array.isArray(majorGrid.material)) majorGrid.material.forEach((m) => m.dispose())
      else majorGrid.material.dispose()
    }
    dotsGeometry.dispose()
    dotsMaterial.dispose()
  }

  return { group, updateTheme, dispose }
}
