import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getCadBlock } from './cadBlocksData'

/**
 * Generador de Geometría Compuesta 3D en Three.js para Bloques Arquitectónicos.
 * Construye mallas proporcionadas, limpias y detalladas con base en y = 0.
 */

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d)
  geo.translate(x, y + h / 2, z)
  return geo
}

function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  x: number,
  y: number,
  z: number,
  radialSegments = 16
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, radialSegments)
  geo.translate(x, y + h / 2, z)
  return geo
}

function sphere(r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, 16, 12)
  geo.translate(x, y, z)
  return geo
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  const merged = mergeGeometries(flat, false)
  flat.forEach((p) => p.dispose())
  if (!merged) return new THREE.BoxGeometry(1, 1, 1)
  merged.computeVertexNormals()
  return merged
}

export function buildCadBlock3DGeometry(shapeId: string, size: THREE.Vector3): THREE.BufferGeometry | null {
  const blockDef = getCadBlock(shapeId)
  const blockType = blockDef?.blockType ?? shapeId.replace(/^furn\./, '')
  const w = size.x
  const h = size.y
  const d = size.z

  switch (blockType) {
    /* -------------------------------------------------------------
     * 1. 🛋️ Sala y Estar
     * ------------------------------------------------------------- */
    case 'sofa3': {
      const armW = 0.18
      const backD = 0.2
      const innerW = w - armW * 2
      const seatW = innerW / 3
      const seatH = 0.42
      return merge([
        // Base / patas
        box(w, 0.12, d, 0, 0, 0),
        // Respaldo
        box(innerW, h - 0.12, backD, 0, 0.12, -d / 2 + backD / 2),
        // Brazos
        box(armW, h * 0.72, d, -w / 2 + armW / 2, 0.12, 0),
        box(armW, h * 0.72, d, w / 2 - armW / 2, 0.12, 0),
        // 3 Cojines de asiento
        box(seatW - 0.02, 0.14, d - backD - 0.04, -seatW, seatH, 0.05),
        box(seatW - 0.02, 0.14, d - backD - 0.04, 0, seatH, 0.05),
        box(seatW - 0.02, 0.14, d - backD - 0.04, seatW, seatH, 0.05)
      ])
    }

    case 'sofa2': {
      const armW = 0.16
      const backD = 0.2
      const innerW = w - armW * 2
      const seatW = innerW / 2
      const seatH = 0.42
      return merge([
        box(w, 0.12, d, 0, 0, 0),
        box(innerW, h - 0.12, backD, 0, 0.12, -d / 2 + backD / 2),
        box(armW, h * 0.72, d, -w / 2 + armW / 2, 0.12, 0),
        box(armW, h * 0.72, d, w / 2 - armW / 2, 0.12, 0),
        box(seatW - 0.02, 0.14, d - backD - 0.04, -seatW / 2, seatH, 0.05),
        box(seatW - 0.02, 0.14, d - backD - 0.04, seatW / 2, seatH, 0.05)
      ])
    }

    case 'armchair': {
      const armW = 0.15
      const backD = 0.18
      const innerW = w - armW * 2
      return merge([
        box(w, 0.12, d, 0, 0, 0),
        box(innerW, h - 0.12, backD, 0, 0.12, -d / 2 + backD / 2),
        box(armW, h * 0.72, d, -w / 2 + armW / 2, 0.12, 0),
        box(armW, h * 0.72, d, w / 2 - armW / 2, 0.12, 0),
        box(innerW - 0.02, 0.14, d - backD - 0.04, 0, 0.42, 0.05)
      ])
    }

    case 'sofaL': {
      const armW = 0.18
      const backD = 0.22
      const chaiseW = 0.95
      return merge([
        // Asiento principal
        box(w, 0.42, 0.9, 0, 0, -d / 2 + 0.45),
        // Chaiselongue
        box(chaiseW, 0.42, d - 0.9, -w / 2 + chaiseW / 2, 0, 0.45),
        // Respaldo largo
        box(w - armW, h - 0.42, backD, armW / 2, 0.42, -d / 2 + backD / 2),
        // Respaldo lateral chaise
        box(backD, h - 0.42, d - 0.9, -w / 2 + backD / 2, 0.42, 0.45),
        // Brazo derecho
        box(armW, 0.6, 0.9, w / 2 - armW / 2, 0.42, -d / 2 + 0.45)
      ])
    }

    case 'coffeeRect': {
      const topY = h - 0.05
      const legR = 0.03
      return merge([
        box(w, 0.05, d, 0, topY, 0),
        cylinder(legR, legR, topY, -w / 2 + 0.08, 0, -d / 2 + 0.08),
        cylinder(legR, legR, topY, w / 2 - 0.08, 0, -d / 2 + 0.08),
        cylinder(legR, legR, topY, -w / 2 + 0.08, 0, d / 2 - 0.08),
        cylinder(legR, legR, topY, w / 2 - 0.08, 0, d / 2 - 0.08)
      ])
    }

    case 'coffeeRound': {
      const r = Math.min(w, d) / 2
      const topY = h - 0.05
      return merge([
        cylinder(r, r, 0.05, 0, topY, 0, 24),
        cylinder(0.04, 0.04, topY, 0, 0, 0),
        cylinder(r * 0.6, r * 0.6, 0.03, 0, 0, 0, 24)
      ])
    }

    case 'tvUnit': {
      const tvW = w * 0.75
      const tvH = h * 0.55
      return merge([
        // Mueble bajo con puertas
        box(w, 0.5, d, 0, 0, 0),
        // Pantalla Smart TV delgada
        box(tvW, tvH, 0.05, 0, 0.55, 0),
        // Pie de TV
        box(0.4, 0.05, 0.22, 0, 0.5, 0)
      ])
    }

    case 'piano': {
      return merge([
        // Cuerpo de piano
        box(w, 0.45, d, 0, 0.75, 0),
        // Patas
        cylinder(0.05, 0.03, 0.75, -w / 2 + 0.15, 0, -d / 2 + 0.15),
        cylinder(0.05, 0.03, 0.75, w / 2 - 0.15, 0, -d / 2 + 0.15),
        cylinder(0.05, 0.03, 0.75, 0, 0, d / 2 - 0.2),
        // Tapa superior abierta o inclinada
        box(w * 0.9, 0.04, d * 0.8, 0, 1.22, -0.05),
        // Teclado
        box(w - 0.2, 0.1, 0.2, 0, 0.75, d / 2 - 0.1)
      ])
    }

    case 'carpet': {
      return box(w, 0.02, d, 0, 0, 0)
    }

    case 'floorLamp': {
      return merge([
        cylinder(w / 2, w / 2, 0.04, 0, 0, 0),
        cylinder(0.02, 0.02, h - 0.35, 0, 0.04, 0),
        cylinder(w * 0.45, w * 0.6, 0.32, 0, h - 0.32, 0)
      ])
    }

    /* -------------------------------------------------------------
     * 2. 🍽️ Comedor y Desayunador
     * ------------------------------------------------------------- */
    case 'diningRect4':
    case 'diningRect6':
    case 'diningRect8':
    case 'diningRect10': {
      const topY = 0.75
      const tableW = w * 0.85
      const tableD = d * 0.7
      const chairsCount = blockType === 'diningRect4' ? 4 : blockType === 'diningRect6' ? 6 : blockType === 'diningRect8' ? 8 : 10
      const halfChairs = Math.floor(chairsCount / 2)
      const chairParts: THREE.BufferGeometry[] = []

      // Mesa
      chairParts.push(
        box(tableW, 0.05, tableD, 0, topY, 0),
        cylinder(0.04, 0.04, topY, -tableW / 2 + 0.1, 0, -tableD / 2 + 0.1),
        cylinder(0.04, 0.04, topY, tableW / 2 - 0.1, 0, -tableD / 2 + 0.1),
        cylinder(0.04, 0.04, topY, -tableW / 2 + 0.1, 0, tableD / 2 - 0.1),
        cylinder(0.04, 0.04, topY, tableW / 2 - 0.1, 0, tableD / 2 - 0.1)
      )

      // Sillas a los lados
      const step = tableW / (halfChairs + 1)
      for (let i = 1; i <= halfChairs; i++) {
        const cx = -tableW / 2 + i * step
        // Silla frente
        chairParts.push(
          box(0.42, 0.45, 0.4, cx, 0, -d / 2 + 0.2),
          box(0.42, 0.45, 0.05, cx, 0.45, -d / 2 + 0.05)
        )
        // Silla dorso
        chairParts.push(
          box(0.42, 0.45, 0.4, cx, 0, d / 2 - 0.2),
          box(0.42, 0.45, 0.05, cx, 0.45, d / 2 - 0.05)
        )
      }
      return merge(chairParts)
    }

    case 'diningRound4':
    case 'diningRound6': {
      const count = blockType === 'diningRound4' ? 4 : 6
      const r = Math.min(w, d) * 0.35
      const parts: THREE.BufferGeometry[] = [
        cylinder(r, r, 0.05, 0, 0.75, 0, 24),
        cylinder(0.08, 0.12, 0.75, 0, 0, 0, 16),
        cylinder(r * 0.6, r * 0.6, 0.04, 0, 0, 0, 24)
      ]
      for (let i = 0; i < count; i++) {
        const a = (i * 2 * Math.PI) / count
        const dist = r + 0.28
        const cx = Math.cos(a) * dist
        const cz = Math.sin(a) * dist
        parts.push(
          box(0.4, 0.45, 0.4, cx, 0, cz),
          box(0.4, 0.42, 0.05, cx, 0.45, cz + (cz >= 0 ? 0.18 : -0.18))
        )
      }
      return merge(parts)
    }

    case 'breakfastBar': {
      return merge([
        box(w, h, d * 0.6, 0, 0, -d * 0.2),
        // 3 bancos altos
        cylinder(0.18, 0.18, 0.75, -w * 0.3, 0, d * 0.22),
        cylinder(0.18, 0.18, 0.75, 0, 0, d * 0.22),
        cylinder(0.18, 0.18, 0.75, w * 0.3, 0, d * 0.22)
      ])
    }

    /* -------------------------------------------------------------
     * 3. 🛏️ Dormitorios
     * ------------------------------------------------------------- */
    case 'bedSingle': {
      const bedW = w * 0.65
      return merge([
        // Cama y colchón
        box(bedW, 0.35, d, -w / 2 + bedW / 2, 0, 0),
        box(bedW, 0.18, d - 0.1, -w / 2 + bedW / 2, 0.35, 0.05),
        // Cabecero
        box(bedW, h, 0.1, -w / 2 + bedW / 2, 0, -d / 2 + 0.05),
        // Almohada
        box(bedW * 0.7, 0.12, 0.35, -w / 2 + bedW / 2, 0.53, -d / 2 + 0.3),
        // Mesita de noche
        box(w - bedW - 0.08, 0.5, 0.4, w / 2 - (w - bedW - 0.08) / 2, 0, -d / 2 + 0.25)
      ])
    }

    case 'bedQueen':
    case 'bedKing': {
      const standW = 0.45
      const bedW = w - standW * 2 - 0.1
      return merge([
        // Somier y colchón
        box(bedW, 0.35, d, 0, 0, 0),
        box(bedW, 0.2, d - 0.1, 0, 0.35, 0.05),
        // Cabecero ancho
        box(bedW, h, 0.12, 0, 0, -d / 2 + 0.06),
        // 2 Almohadas
        box(bedW * 0.4, 0.12, 0.35, -bedW * 0.23, 0.55, -d / 2 + 0.3),
        box(bedW * 0.4, 0.12, 0.35, bedW * 0.23, 0.55, -d / 2 + 0.3),
        // Burós laterales
        box(standW, 0.5, 0.4, -w / 2 + standW / 2, 0, -d / 2 + 0.25),
        box(standW, 0.5, 0.4, w / 2 - standW / 2, 0, -d / 2 + 0.25)
      ])
    }

    case 'bedBunk': {
      return merge([
        // Cama inferior
        box(w, 0.35, d, 0, 0, 0),
        // 4 Postes esquineros
        box(0.08, h, 0.08, -w / 2 + 0.04, 0, -d / 2 + 0.04),
        box(0.08, h, 0.08, w / 2 - 0.04, 0, -d / 2 + 0.04),
        box(0.08, h, 0.08, -w / 2 + 0.04, 0, d / 2 - 0.04),
        box(0.08, h, 0.08, w / 2 - 0.04, 0, d / 2 - 0.04),
        // Cama superior
        box(w, 0.3, d, 0, h * 0.65, 0)
      ])
    }

    case 'closet': {
      return merge([
        box(w, h, d, 0, 0, 0),
        // Moldura marco frontal
        box(w, 0.06, 0.02, 0, h - 0.06, d / 2 + 0.01),
        box(0.06, h, 0.02, -w / 2 + 0.03, 0, d / 2 + 0.01),
        box(0.06, h, 0.02, w / 2 - 0.03, 0, d / 2 + 0.01)
      ])
    }

    case 'vanityDresser': {
      return merge([
        box(w, 0.75, d, 0, 0, 0),
        // Espejo vertical
        box(w * 0.8, h - 0.75, 0.04, 0, 0.75, -d / 2 + 0.04)
      ])
    }

    /* -------------------------------------------------------------
     * 4. 🚿 Baños y Accesorios Sanitarios (Plumbing)
     * ------------------------------------------------------------- */
    case 'toilet': {
      const tankD = 0.24
      return merge([
        // Tanque de agua trasero
        box(w, h, tankD, 0, 0, -d / 2 + tankD / 2),
        // Pie y taza
        cylinder(w * 0.42, w * 0.35, 0.42, 0, 0, 0.1, 20),
        // Taza ovalada
        cylinder(w * 0.44, w * 0.44, 0.08, 0, 0.4, 0.1, 20)
      ])
    }

    case 'sinkPedestal': {
      return merge([
        // Pedestal
        cylinder(0.12, 0.16, h - 0.2, 0, 0, 0),
        // Poza lavamanos
        box(w, 0.2, d, 0, h - 0.2, 0),
        // Grifo
        cylinder(0.02, 0.02, 0.14, 0, h, -d / 2 + 0.08)
      ])
    }

    case 'vanitySingle': {
      return merge([
        box(w, h * 0.95, d, 0, 0, 0),
        cylinder(0.02, 0.02, 0.14, 0, h * 0.95, -d / 2 + 0.12)
      ])
    }

    case 'vanityDouble': {
      return merge([
        box(w, h * 0.95, d, 0, 0, 0),
        cylinder(0.02, 0.02, 0.14, -w * 0.25, h * 0.95, -d / 2 + 0.12),
        cylinder(0.02, 0.02, 0.14, w * 0.25, h * 0.95, -d / 2 + 0.12)
      ])
    }

    case 'urinal': {
      return merge([
        box(w, h, d, 0, 0.4, 0),
        box(w * 0.8, h * 0.7, d * 0.7, 0, 0.45, 0.05)
      ])
    }

    case 'shower': {
      return merge([
        // Plato de ducha bajo
        box(w, 0.08, d, 0, 0, 0),
        // Mampara de vidrio (2 caras)
        box(w, h - 0.08, 0.02, 0, 0.08, d / 2 - 0.01),
        box(0.02, h - 0.08, d, w / 2 - 0.01, 0.08, 0),
        // Rociador de ducha superior
        cylinder(0.08, 0.08, 0.04, 0, h * 0.9, -d / 2 + 0.2)
      ])
    }

    case 'bathtub': {
      return merge([
        // Bañera exterior
        box(w, h, d, 0, 0, 0),
        // Borde superior
        box(w + 0.04, 0.05, d + 0.04, 0, h - 0.05, 0)
      ])
    }

    case 'jacuzzi': {
      return merge([
        box(w, h, d, 0, 0, 0),
        cylinder(w * 0.45, w * 0.42, h - 0.06, 0, 0.06, 0, 24)
      ])
    }

    case 'bathAccessories': {
      return merge([
        box(w, 0.03, 0.1, 0, h, 0),
        cylinder(0.06, 0.06, 0.12, w / 2 - 0.1, h * 0.5, 0)
      ])
    }

    /* -------------------------------------------------------------
     * 5. 🍳 Cocina y Lavandería
     * ------------------------------------------------------------- */
    case 'kitchenSink1': {
      return merge([
        box(w, h, d, 0, 0, 0),
        // Grifo cisne
        cylinder(0.015, 0.015, 0.25, 0, h, -d / 2 + 0.1)
      ])
    }

    case 'kitchenSink2': {
      return merge([
        box(w, h, d, 0, 0, 0),
        cylinder(0.018, 0.018, 0.28, 0, h, -d / 2 + 0.1)
      ])
    }

    case 'stove4': {
      return merge([
        box(w, h, d, 0, 0, 0),
        // Horno con ventanilla frontal
        box(w * 0.8, 0.4, 0.02, 0, 0.15, d / 2 + 0.01),
        // 4 Quemadores superiores
        cylinder(0.08, 0.08, 0.02, -w * 0.25, h, -d * 0.22),
        cylinder(0.08, 0.08, 0.02, w * 0.25, h, -d * 0.22),
        cylinder(0.08, 0.08, 0.02, -w * 0.25, h, d * 0.22),
        cylinder(0.08, 0.08, 0.02, w * 0.25, h, d * 0.22)
      ])
    }

    case 'stove6': {
      return merge([
        box(w, h, d, 0, 0, 0),
        box(w * 0.85, 0.45, 0.02, 0, 0.15, d / 2 + 0.01),
        cylinder(0.07, 0.07, 0.02, -w * 0.3, h, -d * 0.22),
        cylinder(0.07, 0.07, 0.02, 0, h, -d * 0.22),
        cylinder(0.07, 0.07, 0.02, w * 0.3, h, -d * 0.22),
        cylinder(0.07, 0.07, 0.02, -w * 0.3, h, d * 0.22),
        cylinder(0.07, 0.07, 0.02, 0, h, d * 0.22),
        cylinder(0.07, 0.07, 0.02, w * 0.3, h, d * 0.22)
      ])
    }

    case 'fridge1': {
      return merge([
        box(w, h, d, 0, 0, 0),
        // Puerta y tirador
        box(w, h * 0.98, 0.04, 0, 0.01, d / 2 + 0.02),
        box(0.03, 0.3, 0.03, w / 2 - 0.08, h * 0.5, d / 2 + 0.05)
      ])
    }

    case 'fridge2': {
      return merge([
        box(w, h, d, 0, 0, 0),
        // 2 puertas Side-by-Side
        box(w * 0.48, h * 0.98, 0.04, -w * 0.25, 0.01, d / 2 + 0.02),
        box(w * 0.48, h * 0.98, 0.04, w * 0.25, 0.01, d / 2 + 0.02),
        box(0.03, 0.4, 0.03, -0.05, h * 0.5, d / 2 + 0.05),
        box(0.03, 0.4, 0.03, 0.05, h * 0.5, d / 2 + 0.05)
      ])
    }

    case 'kitchenIsland': {
      return merge([
        box(w, h - 0.06, d * 0.7, 0, 0, -d * 0.15),
        // Encimera sobresaliente
        box(w + 0.08, 0.06, d, 0, h - 0.06, 0)
      ])
    }

    case 'microwave': {
      return merge([
        box(w, h, d, 0, 0, 0),
        box(w * 0.7, h * 0.75, 0.02, -w * 0.1, h * 0.12, d / 2 + 0.01)
      ])
    }

    case 'washer':
    case 'dryer': {
      return merge([
        box(w, h, d, 0, 0, 0),
        cylinder(w * 0.32, w * 0.32, 0.04, 0, h * 0.45, d / 2 + 0.02, 20)
      ])
    }

    case 'washTub': {
      return merge([
        box(w, h, d, 0, 0, 0),
        box(w * 0.45, 0.35, d * 0.75, -w * 0.22, h - 0.35, 0)
      ])
    }

    /* -------------------------------------------------------------
     * 6. 💻 Oficina y Estudio
     * ------------------------------------------------------------- */
    case 'deskPc': {
      return merge([
        box(w, 0.05, d, 0, 0.72, 0),
        box(0.05, 0.72, d, -w / 2 + 0.025, 0, 0),
        box(0.05, 0.72, d, w / 2 - 0.025, 0, 0),
        // Monitor
        box(0.6, 0.36, 0.04, 0, 0.85, -d / 2 + 0.15),
        cylinder(0.03, 0.03, 0.1, 0, 0.75, -d / 2 + 0.15),
        // Silla ergonómica
        cylinder(0.24, 0.24, 0.08, 0, 0.42, d * 0.2, 16),
        box(0.42, 0.45, 0.06, 0, 0.5, d * 0.35)
      ])
    }

    case 'deskL': {
      return merge([
        box(w, 0.05, 0.75, 0, 0.72, -d / 2 + 0.375),
        box(0.8, 0.05, d - 0.75, -w / 2 + 0.4, 0.72, 0.375),
        box(0.05, 0.72, 0.75, w / 2 - 0.025, 0, -d / 2 + 0.375),
        box(0.05, 0.72, 0.75, -w / 2 + 0.025, 0, -d / 2 + 0.375),
        box(0.8, 0.72, 0.05, -w / 2 + 0.4, 0, d / 2 - 0.025)
      ])
    }

    case 'meetingTable': {
      return merge([
        box(w, 0.06, d, 0, 0.74, 0),
        cylinder(0.12, 0.16, 0.74, -w * 0.3, 0, 0, 16),
        cylinder(0.12, 0.16, 0.74, w * 0.3, 0, 0, 16)
      ])
    }

    case 'bookcase': {
      return merge([
        box(w, h, d, 0, 0, 0),
        box(w - 0.08, 0.04, d - 0.04, 0, h * 0.25, 0.02),
        box(w - 0.08, 0.04, d - 0.04, 0, h * 0.5, 0.02),
        box(w - 0.08, 0.04, d - 0.04, 0, h * 0.75, 0.02)
      ])
    }

    case 'fileCabinet': {
      return merge([
        box(w, h, d, 0, 0, 0),
        box(w * 0.85, h * 0.2, 0.02, 0, h * 0.05, d / 2 + 0.01),
        box(w * 0.85, h * 0.2, 0.02, 0, h * 0.28, d / 2 + 0.01),
        box(w * 0.85, h * 0.2, 0.02, 0, h * 0.51, d / 2 + 0.01),
        box(w * 0.85, h * 0.2, 0.02, 0, h * 0.74, d / 2 + 0.01)
      ])
    }

    /* -------------------------------------------------------------
     * 7. 🚗 Vehículos, Vegetación y Escala Humana (Exterior & Entorno)
     * ------------------------------------------------------------- */
    case 'carSedan': {
      const tireR = 0.32
      const tireW = 0.22
      return merge([
        // Chasis y carrocería
        box(w, 0.55, d, 0, 0.2, 0),
        // Cabina
        box(w * 0.88, h - 0.6, d * 0.52, 0, 0.65, 0.1),
        // 4 Ruedas
        cylinder(tireR, tireR, tireW, -w / 2 + 0.05, 0, -d * 0.3, 16),
        cylinder(tireR, tireR, tireW, w / 2 - 0.05, 0, -d * 0.3, 16),
        cylinder(tireR, tireR, tireW, -w / 2 + 0.05, 0, d * 0.3, 16),
        cylinder(tireR, tireR, tireW, w / 2 - 0.05, 0, d * 0.3, 16)
      ])
    }

    case 'carSuv': {
      const tireR = 0.38
      return merge([
        box(w, 0.65, d, 0, 0.25, 0),
        box(w * 0.92, h - 0.75, d * 0.65, 0, 0.8, 0.2),
        cylinder(tireR, tireR, 0.26, -w / 2 + 0.05, 0, -d * 0.32, 16),
        cylinder(tireR, tireR, 0.26, w / 2 - 0.05, 0, -d * 0.32, 16),
        cylinder(tireR, tireR, 0.26, -w / 2 + 0.05, 0, d * 0.32, 16),
        cylinder(tireR, tireR, 0.26, w / 2 - 0.05, 0, d * 0.32, 16)
      ])
    }

    case 'motorcycle': {
      return merge([
        // Chasis central
        box(0.24, 0.6, 1.2, 0, 0.3, 0),
        // Ruedas delantera y trasera
        cylinder(0.3, 0.3, 0.12, 0, 0.1, -d / 2 + 0.35, 16),
        cylinder(0.3, 0.3, 0.15, 0, 0.1, d / 2 - 0.35, 16),
        // Manillar
        box(w, 0.05, 0.05, 0, h * 0.85, -d / 2 + 0.5)
      ])
    }

    case 'bicycle': {
      return merge([
        // Ruedas
        cylinder(0.32, 0.32, 0.04, 0, 0.05, -d / 2 + 0.35, 16),
        cylinder(0.32, 0.32, 0.04, 0, 0.05, d / 2 - 0.35, 16),
        // Cuadro
        box(0.05, 0.6, 1.0, 0, 0.35, 0),
        // Manillar
        box(w, 0.04, 0.04, 0, h - 0.05, -d / 2 + 0.4)
      ])
    }

    case 'truck': {
      return merge([
        // Cabina
        box(w, h * 0.85, 1.8, 0, 0.3, -d / 2 + 0.9),
        // Caja de carga
        box(w + 0.1, h, d - 2.0, 0, 0.4, 0.9),
        // Ruedas
        cylinder(0.42, 0.42, 0.28, -w / 2, 0, -d / 2 + 1.0, 16),
        cylinder(0.42, 0.42, 0.28, w / 2, 0, -d / 2 + 1.0, 16),
        cylinder(0.42, 0.42, 0.28, -w / 2, 0, d / 2 - 1.2, 16),
        cylinder(0.42, 0.42, 0.28, w / 2, 0, d / 2 - 1.2, 16)
      ])
    }

    case 'bus': {
      return merge([
        box(w, h * 0.85, d, 0, 0.35, 0),
        cylinder(0.45, 0.45, 0.3, -w / 2, 0, -d * 0.35, 16),
        cylinder(0.45, 0.45, 0.3, w / 2, 0, -d * 0.35, 16),
        cylinder(0.45, 0.45, 0.3, -w / 2, 0, d * 0.35, 16),
        cylinder(0.45, 0.45, 0.3, w / 2, 0, d * 0.35, 16)
      ])
    }

    case 'tree': {
      const trunkR = Math.min(w, d) * 0.08
      const trunkH = h * 0.45
      const canopyR = Math.min(w, d) * 0.45
      return merge([
        cylinder(trunkR * 0.8, trunkR, trunkH, 0, 0, 0, 16),
        sphere(canopyR, 0, trunkH + canopyR * 0.85, 0),
        sphere(canopyR * 0.7, canopyR * 0.3, trunkH + canopyR * 0.6, canopyR * 0.2),
        sphere(canopyR * 0.7, -canopyR * 0.3, trunkH + canopyR * 0.7, -canopyR * 0.2)
      ])
    }

    case 'palm': {
      const trunkR = 0.16
      const trunkH = h * 0.8
      return merge([
        cylinder(trunkR * 0.7, trunkR, trunkH, 0, 0, 0, 16),
        // Corona de hojas
        cylinder(w * 0.45, 0.1, 0.4, 0, trunkH, 0, 12),
        sphere(0.35, 0, trunkH + 0.2, 0)
      ])
    }

    case 'shrub': {
      const r = Math.min(w, d) / 2
      return merge([
        sphere(r, -w * 0.2, h * 0.5, 0),
        sphere(r * 0.9, w * 0.2, h * 0.45, 0),
        sphere(r * 0.8, 0, h * 0.6, 0)
      ])
    }

    case 'potPlant': {
      return merge([
        cylinder(w * 0.4, w * 0.3, 0.45, 0, 0, 0, 16),
        sphere(w * 0.45, 0, 0.7, 0),
        sphere(w * 0.35, 0, 0.95, 0)
      ])
    }

    case 'human': {
      // Escala Humana 1.70m proporcionada (piernas, torso, cabeza, brazos)
      const headR = 0.12
      return merge([
        // 2 Piernas
        cylinder(0.06, 0.05, 0.85, -0.1, 0, 0, 12),
        cylinder(0.06, 0.05, 0.85, 0.1, 0, 0, 12),
        // Torso
        box(0.38, 0.55, 0.2, 0, 0.85, 0),
        // Brazos
        cylinder(0.045, 0.04, 0.52, -0.23, 0.85, 0, 12),
        cylinder(0.045, 0.04, 0.52, 0.23, 0.85, 0, 12),
        // Cabeza
        sphere(headR, 0, 1.55, 0)
      ])
    }

    default:
      return null
  }
}

