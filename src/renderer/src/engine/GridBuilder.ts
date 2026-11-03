import * as THREE from 'three'

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
