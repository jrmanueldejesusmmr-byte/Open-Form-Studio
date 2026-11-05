import {
  CEILING_RUN_HEIGHT,
  UNDERGROUND_RUN_DEPTH,
  type ElectricalDevice,
  type ElectricalWire
} from './electricalTypes'

/**
 * Ruteo ortogonal realista de tuberías conduit (puro, sin Three.js).
 *
 * Desde cada dispositivo de muro la tubería entra al eje de la pared, sube (o
 * baja) verticalmente por dentro del muro hasta la cota del cielo/losa
 * (2.40 m), recorre el techo con tramos ortogonales (en L) y baja por el muro
 * del otro dispositivo. Los tramos que tocan la varilla de tierra viajan
 * enterrados (−0.30 m). Así el metraje incluye subidas y bajadas reales en
 * lugar de cruzar el cuarto en diagonal por el aire.
 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface RoutingContext {
  levelElevation: (levelId: string) => number
  levelHeight: (levelId: string) => number
}

const EPS = 1e-4

function same(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.z - b.z) < EPS
}

function collinear(a: Vec3, b: Vec3, c: Vec3): boolean {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abz = b.z - a.z
  const bcx = c.x - b.x
  const bcy = c.y - b.y
  const bcz = c.z - b.z
  const cx = aby * bcz - abz * bcy
  const cy = abz * bcx - abx * bcz
  const cz = abx * bcy - aby * bcx
  return Math.hypot(cx, cy, cz) < EPS
}

/** Quita puntos repetidos y vértices intermedios colineales. */
export function simplifyPolyline(points: Vec3[]): Vec3[] {
  const dedup: Vec3[] = []
  for (const p of points) if (!dedup.length || !same(dedup[dedup.length - 1], p)) dedup.push(p)
  if (dedup.length < 3) return dedup
  const out: Vec3[] = [dedup[0]]
  for (let i = 1; i < dedup.length - 1; i++) {
    if (!collinear(out[out.length - 1], dedup[i], dedup[i + 1])) out.push(dedup[i])
  }
  out.push(dedup[dedup.length - 1])
  return out
}

export function polylineLength(points: readonly Vec3[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z)
  }
  return total
}

/** Punto visible (cara) del dispositivo en coordenadas de mundo. */
export function deviceWorldPoint(device: ElectricalDevice, ctx: RoutingContext): Vec3 {
  return { x: device.x, y: ctx.levelElevation(device.levelId) + device.height, z: device.z }
}

/** Punto dentro del muro (eje) por donde corre la tubería del dispositivo. */
function deviceAnchor(device: ElectricalDevice, y: number): Vec3 {
  return { x: device.anchorX ?? device.x, y, z: device.anchorZ ?? device.z }
}

/** Cota (mundo) del recorrido horizontal del tramo. */
export function runHeightFor(a: ElectricalDevice, b: ElectricalDevice, ctx: RoutingContext): number {
  const buried = a.type === 'groundRod' || b.type === 'groundRod'
  if (buried) {
    return Math.min(ctx.levelElevation(a.levelId), ctx.levelElevation(b.levelId)) + UNDERGROUND_RUN_DEPTH
  }
  const height = ctx.levelHeight(a.levelId)
  const run = Math.min(CEILING_RUN_HEIGHT, Math.max(1, height - 0.05))
  return ctx.levelElevation(a.levelId) + run
}

/**
 * Recorrido ortogonal completo entre dos dispositivos (polilínea 3D).
 * Siempre empieza en la cara de `a` y termina en la cara de `b`.
 */
export function routeBetween(a: ElectricalDevice, b: ElectricalDevice, ctx: RoutingContext): Vec3[] {
  const pa = deviceWorldPoint(a, ctx)
  const pb = deviceWorldPoint(b, ctx)
  const h = runHeightFor(a, b, ctx)

  const qa = deviceAnchor(a, pa.y)
  const qb = deviceAnchor(b, pb.y)
  const ra = { ...qa, y: h }
  const rb = { ...qb, y: h }

  // Tramo horizontal en L: primero el eje con mayor recorrido (menos codos visibles).
  const dx = Math.abs(rb.x - ra.x)
  const dz = Math.abs(rb.z - ra.z)
  const corner: Vec3 = dx >= dz ? { x: rb.x, y: h, z: ra.z } : { x: ra.x, y: h, z: rb.z }

  return simplifyPolyline([pa, qa, ra, corner, rb, qb, pb])
}

export function routeWire(
  wire: ElectricalWire,
  devices: ReadonlyMap<string, ElectricalDevice>,
  ctx: RoutingContext
): Vec3[] | null {
  const a = devices.get(wire.from)
  const b = devices.get(wire.to)
  if (!a || !b) return null
  return routeBetween(a, b, ctx)
}

/** Número de codos (cambios de dirección) del recorrido: material de obra. */
export function elbowCount(points: readonly Vec3[]): number {
  return Math.max(0, points.length - 2)
}

/**
 * Curva de planta (simbología 2D): arco cuadrático entre los dos símbolos,
 * como en los planos eléctricos dibujados a mano. Devuelve puntos XZ.
 */
export function planArc(
  a: { x: number; z: number },
  b: { x: number; z: number },
  bulge = 0.18,
  segments = 20
): Array<{ x: number; z: number }> {
  const mx = (a.x + b.x) / 2
  const mz = (a.z + b.z) / 2
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < EPS) return [a, b]
  // Control desplazado perpendicularmente (siempre al mismo lado de la cuerda).
  const nx = -dz / len
  const nz = dx / len
  const cx = mx + nx * len * bulge
  const cz = mz + nz * len * bulge
  const out: Array<{ x: number; z: number }> = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    out.push({
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      z: u * u * a.z + 2 * u * t * cz + t * t * b.z
    })
  }
  return out
}

