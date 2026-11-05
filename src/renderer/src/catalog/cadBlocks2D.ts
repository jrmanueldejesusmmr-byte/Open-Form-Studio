import type { SceneObject } from '../models/SceneObject'
import { getCadBlock } from './cadBlocksData'

/**
 * Generador de Simbología Técnica 2D CAD para Bloques Arquitectónicos.
 * Produce vectores SVG limpios y precisos vistos en Planta (estilo AutoCAD Architectural Blocks).
 */

export interface Cad2DStyleOptions {
  strokeColor?: string
  strokeWidth?: number
  fillColor?: string
  accentColor?: string
}

const DEFAULT_CAD_STYLE: Cad2DStyleOptions = {
  strokeColor: '#38bdf8', // Azul CAD técnico
  strokeWidth: 0.04, // m
  fillColor: 'rgba(56, 189, 248, 0.06)',
  accentColor: '#94a3b8'
}

/**
 * Genera el elemento `<g>` SVG completo de la simbología 2D de un bloque arquitectónico,
 * centrado en (0, 0) según sus dimensiones locales `(w, d)`.
 */
export function generateBlock2DSymbol(blockType: string, w: number, d: number): string {
  const hw = w / 2
  const hd = d / 2
  const sw = 0.035 // Trazo estándar fino

  switch (blockType) {
    /* -------------------------------------------------------------
     * 1. 🛋️ Sala y Estar
     * ------------------------------------------------------------- */
    case 'sofa3': {
      const armW = 0.18
      const backD = 0.2
      const innerW = w - armW * 2
      const seatW = innerW / 3
      const seatD = d - backD
      return `
        <!-- Contorno exterior -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.08" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Respaldo -->
        <rect x="${-hw + armW}" y="${-hd}" width="${innerW}" height="${backD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <!-- Brazo izquierdo y derecho -->
        <rect x="${-hw}" y="${-hd}" width="${armW}" height="${d}" rx="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${hw - armW}" y="${-hd}" width="${armW}" height="${d}" rx="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <!-- 3 Cojines de asiento -->
        <rect x="${-hw + armW}" y="${-hd + backD}" width="${seatW}" height="${seatD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <rect x="${-hw + armW + seatW}" y="${-hd + backD}" width="${seatW}" height="${seatD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <rect x="${-hw + armW + seatW * 2}" y="${-hd + backD}" width="${seatW}" height="${seatD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
      `
    }

    case 'sofa2': {
      const armW = 0.16
      const backD = 0.2
      const innerW = w - armW * 2
      const seatW = innerW / 2
      const seatD = d - backD
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.08" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + armW}" y="${-hd}" width="${innerW}" height="${backD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw}" y="${-hd}" width="${armW}" height="${d}" rx="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${hw - armW}" y="${-hd}" width="${armW}" height="${d}" rx="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <!-- 2 Cojines -->
        <rect x="${-hw + armW}" y="${-hd + backD}" width="${seatW}" height="${seatD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <rect x="${-hw + armW + seatW}" y="${-hd + backD}" width="${seatW}" height="${seatD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
      `
    }

    case 'armchair': {
      const armW = 0.15
      const backD = 0.18
      const innerW = w - armW * 2
      const seatD = d - backD
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.08" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + armW}" y="${-hd}" width="${innerW}" height="${backD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw}" y="${-hd}" width="${armW}" height="${d}" rx="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${hw - armW}" y="${-hd}" width="${armW}" height="${d}" rx="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + armW}" y="${-hd + backD}" width="${innerW}" height="${seatD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
      `
    }

    case 'sofaL': {
      const armW = 0.18
      const backD = 0.22
      const chaW = 0.95
      return `
        <!-- Silueta en L -->
        <path d="M ${-hw} ${-hd} L ${hw} ${-hd} L ${hw} ${-hd + 0.9} L ${-hw + chaW} ${-hd + 0.9} L ${-hw + chaW} ${hd} L ${-hw} ${hd} Z" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Respaldo continuo -->
        <path d="M ${-hw + armW} ${-hd + backD} L ${hw - armW} ${-hd + backD}" stroke="currentColor" stroke-width="${sw}" />
        <path d="M ${-hw + backD} ${-hd + 0.9} L ${-hw + backD} ${hd - armW}" stroke="currentColor" stroke-width="${sw}" />
        <!-- Brazos extremos -->
        <rect x="${hw - armW}" y="${-hd}" width="${armW}" height="0.9" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw}" y="${hd - armW}" width="${chaW}" height="${armW}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <!-- División de módulos -->
        <line x1="${-hw + chaW}" y1="${-hd + backD}" x2="${-hw + chaW}" y2="${-hd + 0.9}" stroke="currentColor" stroke-width="${sw * 0.8}" stroke-dasharray="0.06 0.04" />
      `
    }

    case 'coffeeRect': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(217, 119, 6, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + 0.08}" y="${-hd + 0.08}" width="${w - 0.16}" height="${d - 0.16}" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" stroke-dasharray="0.06 0.04" />
      `
    }

    case 'coffeeRound': {
      const r = Math.min(hw, hd)
      return `
        <circle cx="0" cy="0" r="${r}" fill="rgba(217, 119, 6, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="0" cy="0" r="${r * 0.85}" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" stroke-dasharray="0.06 0.04" />
      `
    }

    case 'tvUnit': {
      const tvW = w * 0.75
      return `
        <!-- Mueble base -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <line x1="${-hw + w * 0.33}" y1="${-hd}" x2="${-hw + w * 0.33}" y2="${hd}" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <line x1="${-hw + w * 0.66}" y1="${-hd}" x2="${-hw + w * 0.66}" y2="${hd}" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Pantalla de TV centrada (delgada) -->
        <rect x="${-tvW / 2}" y="${-0.03}" width="${tvW}" height="0.06" rx="0.01" fill="#0f172a" stroke="#38bdf8" stroke-width="${sw}" />
        <!-- Base TV -->
        <rect x="${-0.25}" y="${-0.07}" width="0.5" height="0.14" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
      `
    }

    case 'piano': {
      return `
        <!-- Contorno cola de piano -->
        <path d="M ${-hw} ${hd} L ${hw} ${hd} L ${hw} ${-hd + 0.4} Q ${hw} ${-hd} 0 ${-hd} Q ${-hw} ${-hd} ${-hw} ${hd - 0.25} Z" fill="rgba(15, 23, 42, 0.15)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Teclado en la parte frontal -->
        <rect x="${-hw + 0.1}" y="${hd - 0.2}" width="${w - 0.2}" height="0.18" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <!-- Teclas negras simuladas -->
        ${Array.from({ length: 9 })
          .map((_, i) => `<rect x="${-hw + 0.16 + i * 0.14}" y="${hd - 0.2}" width="0.07" height="0.11" fill="#0f172a" />`)
          .join('')}
      `
    }

    case 'carpet': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.06" fill="rgba(244, 63, 94, 0.05)" stroke="currentColor" stroke-width="${sw}" stroke-dasharray="0.08 0.05" />
        <rect x="${-hw + 0.1}" y="${-hd + 0.1}" width="${w - 0.2}" height="${d - 0.2}" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
      `
    }

    case 'floorLamp': {
      const r = Math.min(hw, hd)
      return `
        <circle cx="0" cy="0" r="${r}" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="0" cy="0" r="${r * 0.3}" fill="currentColor" />
        <line x1="${-r}" y1="0" x2="${r}" y2="0" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <line x1="0" y1="${-r}" x2="0" y2="${r}" stroke="currentColor" stroke-width="${sw * 0.7}" />
      `
    }

    /* -------------------------------------------------------------
     * 2. 🍽️ Comedor y Desayunador
     * ------------------------------------------------------------- */
    case 'diningRect4':
    case 'diningRect6':
    case 'diningRect8':
    case 'diningRect10': {
      // Dibujar mesa central + sillas alrededor
      const chairsSide = blockType === 'diningRect4' ? 2 : blockType === 'diningRect6' ? 3 : 4
      const chairW = 0.42
      const chairD = 0.38
      const hasHeadChairs = blockType === 'diningRect10'
      const margin = 0.15

      // Mesa interior recortada
      const tableW = w - (hasHeadChairs ? (chairD + margin) * 2 : 0.1)
      const tableD = d - (chairD + margin) * 2
      const htw = tableW / 2
      const htd = tableD / 2

      const chairsHtml: string[] = []
      // Sillas arriba y abajo
      const spacing = tableW / (chairsSide + 1)
      for (let i = 1; i <= chairsSide; i++) {
        const cx = -htw + i * spacing
        // Arriba
        chairsHtml.push(`
          <rect x="${cx - chairW / 2}" y="${-hd}" width="${chairW}" height="${chairD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
          <path d="M ${cx - chairW / 2} ${-hd + 0.08} Q ${cx} ${-hd + 0.14} ${cx + chairW / 2} ${-hd + 0.08}" stroke="currentColor" stroke-width="${sw * 0.8}" fill="none" />
        `)
        // Abajo
        chairsHtml.push(`
          <rect x="${cx - chairW / 2}" y="${hd - chairD}" width="${chairW}" height="${chairD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
          <path d="M ${cx - chairW / 2} ${hd - 0.08} Q ${cx} ${hd - 0.14} ${cx + chairW / 2} ${hd - 0.08}" stroke="currentColor" stroke-width="${sw * 0.8}" fill="none" />
        `)
      }

      // Sillas en cabeceras si es de 10
      if (hasHeadChairs) {
        // Izquierda
        chairsHtml.push(`
          <rect x="${-hw}" y="${-chairW / 2}" width="${chairD}" height="${chairW}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        `)
        // Derecha
        chairsHtml.push(`
          <rect x="${hw - chairD}" y="${-chairW / 2}" width="${chairD}" height="${chairW}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        `)
      }

      return `
        <!-- Mesa -->
        <rect x="${-htw}" y="${-htd}" width="${tableW}" height="${tableD}" rx="0.08" fill="rgba(217, 119, 6, 0.12)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Sillas -->
        ${chairsHtml.join('')}
      `
    }

    case 'diningRound4':
    case 'diningRound6': {
      const count = blockType === 'diningRound4' ? 4 : 6
      const rTable = Math.min(w, d) * 0.36
      const chairW = 0.4
      const chairD = 0.35
      const chairsHtml: string[] = []

      for (let i = 0; i < count; i++) {
        const angle = (i * 2 * Math.PI) / count
        const dist = rTable + chairD / 2 + 0.04
        const cx = Math.cos(angle) * dist
        const cy = Math.sin(angle) * dist
        const deg = (angle * 180) / Math.PI + 90
        chairsHtml.push(`
          <g transform="translate(${cx}, ${cy}) rotate(${deg})">
            <rect x="${-chairW / 2}" y="${-chairD / 2}" width="${chairW}" height="${chairD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
            <path d="M ${-chairW / 2} ${chairD / 2 - 0.08} Q 0 ${chairD / 2 - 0.14} ${chairW / 2} ${chairD / 2 - 0.08}" stroke="currentColor" stroke-width="${sw * 0.8}" fill="none" />
          </g>
        `)
      }

      return `
        <!-- Mesa circular -->
        <circle cx="0" cy="0" r="${rTable}" fill="rgba(217, 119, 6, 0.12)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Sillas radiales -->
        ${chairsHtml.join('')}
      `
    }

    case 'breakfastBar': {
      const stools = 3
      const stoolR = 0.16
      const step = w / (stools + 1)
      const stoolsHtml: string[] = []
      for (let i = 1; i <= stools; i++) {
        const cx = -hw + i * step
        stoolsHtml.push(`
          <circle cx="${cx}" cy="${hd - stoolR - 0.04}" r="${stoolR}" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
          <path d="M ${cx - stoolR * 0.8} ${hd - 0.06} Q ${cx} ${hd - 0.12} ${cx + stoolR * 0.8} ${hd - 0.06}" stroke="currentColor" stroke-width="${sw * 0.8}" fill="none" />
        `)
      }
      return `
        <!-- Barra -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d * 0.6}" rx="0.04" fill="rgba(217, 119, 6, 0.12)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Bancos -->
        ${stoolsHtml.join('')}
      `
    }

    /* -------------------------------------------------------------
     * 3. 🛏️ Dormitorios
     * ------------------------------------------------------------- */
    case 'bedSingle': {
      const standW = 0.45
      const standD = 0.4
      const bedW = w - standW - 0.1
      return `
        <!-- Mesita de noche lateral -->
        <rect x="${-hw}" y="${-hd}" width="${standW}" height="${standD}" rx="0.03" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-hw + standW / 2}" cy="${-hd + standD / 2}" r="0.08" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
        <!-- Cama -->
        <g transform="translate(${standW + 0.1 - hw}, ${-hd})">
          <!-- Colchón -->
          <rect x="0" y="0" width="${bedW}" height="${d}" rx="0.06" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
          <!-- Cabecero -->
          <rect x="0" y="0" width="${bedW}" height="0.12" fill="currentColor" opacity="0.4" />
          <!-- Almohada -->
          <rect x="${bedW * 0.15}" y="0.18" width="${bedW * 0.7}" height="0.38" rx="0.06" fill="white" stroke="currentColor" stroke-width="${sw * 0.8}" />
          <!-- Doblez de sábana -->
          <line x1="0" y1="${d * 0.45}" x2="${bedW}" y2="${d * 0.45}" stroke="currentColor" stroke-width="${sw * 0.8}" stroke-dasharray="0.06 0.04" />
        </g>
      `
    }

    case 'bedQueen':
    case 'bedKing': {
      const standW = 0.45
      const standD = 0.4
      const bedW = w - standW * 2 - 0.15
      const isKing = blockType === 'bedKing'
      const pilW = bedW * 0.4
      return `
        <!-- Buró izquierdo -->
        <rect x="${-hw}" y="${-hd}" width="${standW}" height="${standD}" rx="0.03" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-hw + standW / 2}" cy="${-hd + standD / 2}" r="0.08" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
        <!-- Buró derecho -->
        <rect x="${hw - standW}" y="${-hd}" width="${standW}" height="${standD}" rx="0.03" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${hw - standW / 2}" cy="${-hd + standD / 2}" r="0.08" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
        <!-- Cama central -->
        <g transform="translate(${-bedW / 2}, ${-hd})">
          <rect x="0" y="0" width="${bedW}" height="${d}" rx="0.08" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
          <!-- Cabecero -->
          <rect x="0" y="0" width="${bedW}" height="0.14" fill="currentColor" opacity="0.3" />
          <!-- 2 Almohadas -->
          <rect x="${bedW * 0.06}" y="0.2" width="${pilW}" height="0.4" rx="0.06" fill="white" stroke="currentColor" stroke-width="${sw * 0.8}" />
          <rect x="${bedW * 0.54}" y="0.2" width="${pilW}" height="0.4" rx="0.06" fill="white" stroke="currentColor" stroke-width="${sw * 0.8}" />
          ${
            isKing
              ? `<!-- Almohadas decorativas extra King -->
                 <rect x="${bedW * 0.1}" y="0.65" width="${pilW * 0.8}" height="0.25" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
                 <rect x="${bedW * 0.58}" y="0.65" width="${pilW * 0.8}" height="0.25" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
                `
              : ''
          }
          <!-- Sábana -->
          <line x1="0" y1="${d * 0.45}" x2="${bedW}" y2="${d * 0.45}" stroke="currentColor" stroke-width="${sw * 0.8}" stroke-dasharray="0.08 0.04" />
        </g>
      `
    }

    case 'bedBunk': {
      return `
        <!-- Marco de litera -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + 0.06}" y="${-hd + 0.06}" width="${w - 0.12}" height="${d - 0.12}" rx="0.03" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Almohada -->
        <rect x="${-hw + 0.15}" y="${-hd + 0.15}" width="${w - 0.3}" height="0.38" rx="0.05" fill="white" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <!-- Escalera lateral -->
        <line x1="${hw - 0.1}" y1="${-hd + 0.8}" x2="${hw}" y2="${-hd + 0.8}" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <line x1="${hw - 0.1}" y1="${-hd + 1.1}" x2="${hw}" y2="${-hd + 1.1}" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <line x1="${hw - 0.1}" y1="${-hd + 1.4}" x2="${hw}" y2="${-hd + 1.4}" stroke="currentColor" stroke-width="${sw * 1.2}" />
      `
    }

    case 'closet': {
      return `
        <!-- Módulo de clóset / ropero -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.02" fill="rgba(148, 163, 184, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Líneas diagonales CAD para armarios empotrados -->
        <line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd}" stroke="currentColor" stroke-width="${sw * 0.6}" stroke-dasharray="0.08 0.05" />
        <line x1="${-hw}" y1="${hd}" x2="${hw}" y2="${-hd}" stroke="currentColor" stroke-width="${sw * 0.6}" stroke-dasharray="0.08 0.05" />
        <!-- Rieles de puertas correderas frontales -->
        <line x1="${-hw}" y1="${hd - 0.05}" x2="${hw}" y2="${hd - 0.05}" stroke="currentColor" stroke-width="${sw * 0.8}" />
      `
    }

    case 'vanityDresser': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <!-- Espejo trasero -->
        <line x1="${-hw + 0.1}" y1="${-hd + 0.04}" x2="${hw - 0.1}" y2="${-hd + 0.04}" stroke="currentColor" stroke-width="${sw * 1.5}" />
        <!-- Banqueta / puff -->
        <rect x="${-0.25}" y="${hd - 0.12}" width="0.5" height="0.25" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
      `
    }

    /* -------------------------------------------------------------
     * 4. 🚿 Baños y Accesorios Sanitarios (Plumbing)
     * ------------------------------------------------------------- */
    case 'toilet': {
      // Tanque + Taza ovalada + Aro asiento
      const tankD = 0.22
      return `
        <!-- Tanque de agua -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${tankD}" rx="0.03" fill="rgba(56, 189, 248, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Botón de descarga -->
        <circle cx="0" cy="${-hd + tankD / 2}" r="0.035" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Taza ovalada -->
        <path d="M ${-0.19} ${-hd + tankD} L ${-0.19} ${-hd + tankD + 0.15} C ${-0.19} ${hd + 0.05} ${0.19} ${hd + 0.05} ${0.19} ${-hd + tankD + 0.15} L ${0.19} ${-hd + tankD} Z" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <!-- Interior de la taza -->
        <ellipse cx="0" cy="${0.08}" rx="0.13" ry="0.18" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
      `
    }

    case 'sinkPedestal': {
      return `
        <!-- Lavabo cerámico -->
        <path d="M ${-hw} ${-hd} L ${hw} ${-hd} Q ${hw} ${hd} 0 ${hd} Q ${-hw} ${hd} ${-hw} ${-hd} Z" fill="rgba(56, 189, 248, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Poza interior -->
        <ellipse cx="0" cy="${0}" rx="${hw * 0.7}" ry="${hd * 0.6}" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Grifería y desagüe -->
        <circle cx="0" cy="${-hd + 0.08}" r="0.035" fill="currentColor" />
        <circle cx="0" cy="0" r="0.02" fill="currentColor" />
      `
    }

    case 'vanitySingle': {
      return `
        <!-- Mueble -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Poza central -->
        <ellipse cx="0" cy="0" rx="0.25" ry="0.18" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="0" cy="${-0.16}" r="0.03" fill="currentColor" />
        <circle cx="0" cy="0" r="0.02" fill="currentColor" />
      `
    }

    case 'vanityDouble': {
      const qx = w * 0.25
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Poza 1 -->
        <ellipse cx="${-qx}" cy="0" rx="0.24" ry="0.17" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-qx}" cy="${-0.16}" r="0.03" fill="currentColor" />
        <circle cx="${-qx}" cy="0" r="0.02" fill="currentColor" />
        <!-- Poza 2 -->
        <ellipse cx="${qx}" cy="0" rx="0.24" ry="0.17" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${qx}" cy="${-0.16}" r="0.03" fill="currentColor" />
        <circle cx="${qx}" cy="0" r="0.02" fill="currentColor" />
      `
    }

    case 'urinal': {
      return `
        <path d="M ${-hw} ${-hd} L ${hw} ${-hd} L ${hw * 0.8} ${hd * 0.4} Q 0 ${hd} ${-hw * 0.8} ${hd * 0.4} Z" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="0" cy="${hd * 0.2}" r="0.03" fill="currentColor" />
      `
    }

    case 'shower': {
      return `
        <!-- Plato de ducha cuadrado -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Líneas en X de pendiente hacia el sumidero -->
        <line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd}" stroke="currentColor" stroke-width="${sw * 0.5}" stroke-dasharray="0.06 0.04" />
        <line x1="${-hw}" y1="${hd}" x2="${hw}" y2="${-hd}" stroke="currentColor" stroke-width="${sw * 0.5}" stroke-dasharray="0.06 0.04" />
        <!-- Sumidero / coladera -->
        <circle cx="0" cy="0" r="0.06" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <!-- Mampara de vidrio (frontal y lateral) -->
        <line x1="${-hw}" y1="${hd - 0.02}" x2="${hw}" y2="${hd - 0.02}" stroke="#06b6d4" stroke-width="${sw * 1.5}" />
      `
    }

    case 'bathtub': {
      return `
        <!-- Contorno exterior rectangular -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.05" fill="rgba(56, 189, 248, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Interior redondeado -->
        <rect x="${-hw + 0.1}" y="${-hd + 0.1}" width="${w - 0.2}" height="${d - 0.2}" rx="${(d - 0.2) / 2}" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <!-- Desagüe y grifería -->
        <circle cx="${-hw + 0.25}" cy="0" r="0.035" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <rect x="${-hw + 0.04}" y="-0.04" width="0.06" height="0.08" fill="currentColor" />
      `
    }

    case 'jacuzzi': {
      return `
        <!-- Tina esquinera -->
        <path d="M ${-hw} ${-hd} L ${hw} ${-hd} Q ${hw} ${hd} ${-hw} ${hd} Z" fill="rgba(56, 189, 248, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <path d="M ${-hw + 0.12} ${-hd + 0.12} L ${hw - 0.12} ${-hd + 0.12} Q ${hw - 0.12} ${hd - 0.12} ${-hw + 0.12} ${hd - 0.12} Z" fill="white" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <!-- Boquillas de hidromasaje -->
        <circle cx="0" cy="0" r="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-hw * 0.4}" cy="${-hd * 0.4}" r="0.03" fill="currentColor" />
        <circle cx="${hw * 0.4}" cy="${-hd * 0.4}" r="0.03" fill="currentColor" />
      `
    }

    case 'bathAccessories': {
      return `
        <!-- Barra toallero -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="0.04" rx="0.02" fill="currentColor" />
        <!-- Portarrollo -->
        <circle cx="${hw - 0.1}" cy="${hd - 0.06}" r="0.05" fill="none" stroke="currentColor" stroke-width="${sw}" />
      `
    }

    /* -------------------------------------------------------------
     * 5. 🍳 Cocina y Lavandería
     * ------------------------------------------------------------- */
    case 'kitchenSink1': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + 0.08}" y="${-hd + 0.08}" width="${w - 0.16}" height="${d - 0.16}" rx="0.04" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="0" cy="0" r="0.035" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <circle cx="0" cy="${-hd + 0.04}" r="0.025" fill="currentColor" />
      `
    }

    case 'kitchenSink2': {
      const basinW = (w - 0.4) / 2
      const drainerW = 0.32
      return `
        <!-- Encimera completa -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Poza 1 -->
        <rect x="${-hw + 0.08}" y="${-hd + 0.08}" width="${basinW}" height="${d - 0.16}" rx="0.03" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-hw + 0.08 + basinW / 2}" cy="0" r="0.03" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Poza 2 -->
        <rect x="${-hw + 0.14 + basinW}" y="${-hd + 0.08}" width="${basinW}" height="${d - 0.16}" rx="0.03" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-hw + 0.14 + basinW * 1.5}" cy="0" r="0.03" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Escurridor estriado -->
        <g transform="translate(${hw - drainerW - 0.05}, ${-hd + 0.08})">
          <rect x="0" y="0" width="${drainerW}" height="${d - 0.16}" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
          ${[0.2, 0.4, 0.6, 0.8].map((t) => `<line x1="${drainerW * t}" y1="0.04" x2="${drainerW * t}" y2="${d - 0.2}" stroke="currentColor" stroke-width="${sw * 0.5}" />`).join('')}
        </g>
        <circle cx="${-hw + 0.11 + basinW}" cy="${-hd + 0.04}" r="0.025" fill="currentColor" />
      `
    }

    case 'stove4': {
      const qx = w * 0.25
      const qz = d * 0.22
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(30, 41, 59, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- 4 Quemadores concéntricos -->
        <circle cx="${-qx}" cy="${-qz}" r="0.09" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-qx}" cy="${-qz}" r="0.04" fill="currentColor" />
        <circle cx="${qx}" cy="${-qz}" r="0.07" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${qx}" cy="${-qz}" r="0.035" fill="currentColor" />
        <circle cx="${-qx}" cy="${qz}" r="0.075" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${-qx}" cy="${qz}" r="0.035" fill="currentColor" />
        <circle cx="${qx}" cy="${qz}" r="0.10" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="${qx}" cy="${qz}" r="0.045" fill="currentColor" />
        <!-- Perillas frontales -->
        <line x1="${-hw + 0.08}" y1="${hd - 0.06}" x2="${hw - 0.08}" y2="${hd - 0.06}" stroke="currentColor" stroke-width="${sw * 0.7}" />
      `
    }

    case 'stove6': {
      const colStep = w / 4
      const qz = d * 0.22
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(30, 41, 59, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- 6 Quemadores -->
        ${[-1, 0, 1]
          .map((c) => {
            const cx = c * colStep
            return `
            <circle cx="${cx}" cy="${-qz}" r="0.08" fill="none" stroke="currentColor" stroke-width="${sw}" />
            <circle cx="${cx}" cy="${-qz}" r="0.035" fill="currentColor" />
            <circle cx="${cx}" cy="${qz}" r="0.08" fill="none" stroke="currentColor" stroke-width="${sw}" />
            <circle cx="${cx}" cy="${qz}" r="0.035" fill="currentColor" />
          `
          })
          .join('')}
        <line x1="${-hw + 0.08}" y1="${hd - 0.06}" x2="${hw - 0.08}" y2="${hd - 0.06}" stroke="currentColor" stroke-width="${sw * 0.7}" />
      `
    }

    case 'fridge1': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(148, 163, 184, 0.15)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Puerta frontal abatible -->
        <line x1="${-hw}" y1="${hd - 0.06}" x2="${hw}" y2="${hd - 0.06}" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <rect x="${hw - 0.12}" y="${hd - 0.09}" width="0.06" height="0.04" fill="currentColor" />
      `
    }

    case 'fridge2': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(148, 163, 184, 0.15)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Dos puertas Side-by-Side -->
        <line x1="${-hw}" y1="${hd - 0.06}" x2="${hw}" y2="${hd - 0.06}" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <line x1="0" y1="${-hd}" x2="0" y2="${hd}" stroke="currentColor" stroke-width="${sw}" />
        <!-- Manijas centrales -->
        <rect x="-0.06" y="${hd - 0.09}" width="0.04" height="0.04" fill="currentColor" />
        <rect x="0.02" y="${hd - 0.09}" width="0.04" height="0.04" fill="currentColor" />
      `
    }

    case 'kitchenIsland': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Zona desayunador rayada -->
        <line x1="${-hw}" y1="${hd - 0.3}" x2="${hw}" y2="${hd - 0.3}" stroke="currentColor" stroke-width="${sw * 0.7}" stroke-dasharray="0.08 0.05" />
      `
    }

    case 'microwave': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${-hw + 0.04}" y="${-hd + 0.04}" width="${w * 0.65}" height="${d - 0.08}" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
      `
    }

    case 'washer':
    case 'dryer': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Tambor circular -->
        <circle cx="0" cy="0" r="${Math.min(hw, hd) * 0.7}" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <circle cx="0" cy="0" r="${Math.min(hw, hd) * 0.4}" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
        <line x1="${-hw + 0.06}" y1="${-hd + 0.08}" x2="${hw - 0.06}" y2="${-hd + 0.08}" stroke="currentColor" stroke-width="${sw * 0.7}" />
      `
    }

    case 'washTub': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(148, 163, 184, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Pila de enjuague + estriado de lavado -->
        <rect x="${-hw + 0.06}" y="${-hd + 0.06}" width="${w * 0.45}" height="${d - 0.12}" rx="0.03" fill="white" stroke="currentColor" stroke-width="${sw}" />
        <rect x="${0.02}" y="${-hd + 0.06}" width="${hw - 0.08}" height="${d - 0.12}" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        ${[-0.15, 0, 0.15].map((off) => `<line x1="${0.05}" y1="${off}" x2="${hw - 0.1}" y2="${off}" stroke="currentColor" stroke-width="${sw * 0.5}" />`).join('')}
      `
    }

    /* -------------------------------------------------------------
     * 6. 💻 Oficina y Estudio
     * ------------------------------------------------------------- */
    case 'deskPc': {
      return `
        <!-- Mesa -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.03" fill="rgba(217, 119, 6, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Monitor plano -->
        <rect x="${-0.3}" y="${-hd + 0.08}" width="0.6" height="0.04" rx="0.01" fill="#0f172a" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Teclado -->
        <rect x="${-0.22}" y="${-hd + 0.22}" width="0.44" height="0.14" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
        <!-- Silla ergonómica de oficina (estrella 5 puntas + asiento) -->
        <g transform="translate(0, ${hd - 0.1})">
          <circle cx="0" cy="0" r="0.22" fill="none" stroke="currentColor" stroke-width="${sw}" />
          <path d="M -0.2 -0.1 Q 0 -0.2 0.2 -0.1" stroke="currentColor" stroke-width="${sw * 1.5}" fill="none" />
        </g>
      `
    }

    case 'deskL': {
      return `
        <!-- Mesa en L -->
        <path d="M ${-hw} ${-hd} L ${hw} ${-hd} L ${hw} ${-hd + 0.75} L ${-hw + 0.8} ${-hd + 0.75} L ${-hw + 0.8} ${hd} L ${-hw} ${hd} Z" fill="rgba(217, 119, 6, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Monitor en ala principal -->
        <rect x="${0}" y="${-hd + 0.08}" width="0.6" height="0.04" fill="#0f172a" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <g transform="translate(0.3, ${-hd + 0.45})">
          <circle cx="0" cy="0" r="0.24" fill="none" stroke="currentColor" stroke-width="${sw}" />
          <path d="M -0.22 -0.1 Q 0 -0.22 0.22 -0.1" stroke="currentColor" stroke-width="${sw * 1.5}" fill="none" />
        </g>
      `
    }

    case 'meetingTable': {
      const chairs = 8
      const chairW = 0.44
      const chairD = 0.38
      const tW = w - 0.8
      const tD = d - 0.6
      return `
        <!-- Mesa de juntas ovalada / bordes suaves -->
        <rect x="${-tW / 2}" y="${-tD / 2}" width="${tW}" height="${tD}" rx="${tD / 2}" fill="rgba(217, 119, 6, 0.12)" stroke="currentColor" stroke-width="${sw}" />
        <!-- 3 sillas arriba y 3 abajo -->
        ${[-0.6, 0, 0.6]
          .map(
            (cx) => `
          <rect x="${cx - chairW / 2}" y="${-hd}" width="${chairW}" height="${chairD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
          <rect x="${cx - chairW / 2}" y="${hd - chairD}" width="${chairW}" height="${chairD}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        `
          )
          .join('')}
        <!-- 1 silla a la izquierda y 1 a la derecha -->
        <rect x="${-hw}" y="${-chairW / 2}" width="${chairD}" height="${chairW}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
        <rect x="${hw - chairD}" y="${-chairW / 2}" width="${chairD}" height="${chairW}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.8}" />
      `
    }

    case 'bookcase': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <line x1="${-hw}" y1="0" x2="${hw}" y2="0" stroke="currentColor" stroke-width="${sw * 0.6}" stroke-dasharray="0.06 0.04" />
      `
    }

    case 'fileCabinet': {
      const step = d / 4
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.02" fill="none" stroke="currentColor" stroke-width="${sw}" />
        ${[1, 2, 3].map((i) => `<line x1="${-hw}" y1="${-hd + i * step}" x2="${hw}" y2="${-hd + i * step}" stroke="currentColor" stroke-width="${sw * 0.7}" />`).join('')}
      `
    }

    /* -------------------------------------------------------------
     * 7. 🚗 Vehículos, Vegetación y Escala Humana (Exterior & Entorno)
     * ------------------------------------------------------------- */
    case 'carSedan': {
      return `
        <!-- Carrocería Sedán estilizada CAD -->
        <path d="M ${-hw + 0.2} ${-hd} L ${hw - 0.2} ${-hd} Q ${hw} ${-hd} ${hw} ${-hd + 0.3} L ${hw} ${hd - 0.3} Q ${hw} ${hd} ${hw - 0.2} ${hd} L ${-hw + 0.2} ${hd} Q ${-hw} ${hd} ${-hw} ${hd - 0.3} L ${-hw} ${-hd + 0.3} Q ${-hw} ${-hd} ${-hw + 0.2} ${-hd} Z" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Parabrisas delantero -->
        <path d="M ${-hw + 0.15} ${-hd + 1.1} Q 0 ${-hd + 1.25} ${hw - 0.15} ${-hd + 1.1}" stroke="currentColor" stroke-width="${sw * 1.2}" fill="none" />
        <!-- Techo de cabina -->
        <rect x="${-hw + 0.18}" y="${-hd + 1.25}" width="${w - 0.36}" height="${d * 0.45}" rx="0.08" fill="none" stroke="currentColor" stroke-width="${sw * 0.7}" />
        <!-- Luna trasera -->
        <path d="M ${-hw + 0.15} ${-hd + 1.25 + d * 0.45} Q 0 ${-hd + 1.15 + d * 0.45} ${hw - 0.15} ${-hd + 1.25 + d * 0.45}" stroke="currentColor" stroke-width="${sw * 1.2}" fill="none" />
        <!-- Espejos retrovisores -->
        <rect x="${-hw - 0.08}" y="${-hd + 1.2}" width="0.08" height="0.14" rx="0.03" fill="currentColor" />
        <rect x="${hw}" y="${-hd + 1.2}" width="0.08" height="0.14" rx="0.03" fill="currentColor" />
      `
    }

    case 'carSuv': {
      return `
        <path d="M ${-hw + 0.2} ${-hd} L ${hw - 0.2} ${-hd} Q ${hw} ${-hd} ${hw} ${-hd + 0.3} L ${hw} ${hd - 0.2} Q ${hw} ${hd} ${hw - 0.2} ${hd} L ${-hw + 0.2} ${hd} Q ${-hw} ${hd} ${-hw} ${hd - 0.2} L ${-hw} ${-hd + 0.3} Q ${-hw} ${-hd} ${-hw + 0.2} ${-hd} Z" fill="rgba(56, 189, 248, 0.1)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Parabrisas delantero -->
        <path d="M ${-hw + 0.18} ${-hd + 1.2} Q 0 ${-hd + 1.4} ${hw - 0.18} ${-hd + 1.2}" stroke="currentColor" stroke-width="${sw * 1.3}" fill="none" />
        <!-- Barras de techo portaequipajes -->
        <line x1="${-hw + 0.3}" y1="${-hd + 1.5}" x2="${-hw + 0.3}" y2="${hd - 0.8}" stroke="currentColor" stroke-width="${sw * 1.4}" />
        <line x1="${hw - 0.3}" y1="${-hd + 1.5}" x2="${hw - 0.3}" y2="${hd - 0.8}" stroke="currentColor" stroke-width="${sw * 1.4}" />
        <!-- Luna trasera y portón -->
        <path d="M ${-hw + 0.18} ${hd - 0.6} L ${hw - 0.18} ${hd - 0.6}" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <!-- Espejos -->
        <rect x="${-hw - 0.1}" y="${-hd + 1.3}" width="0.1" height="0.16" rx="0.03" fill="currentColor" />
        <rect x="${hw}" y="${-hd + 1.3}" width="0.1" height="0.16" rx="0.03" fill="currentColor" />
      `
    }

    case 'motorcycle': {
      return `
        <!-- Manillar y retrovisores -->
        <line x1="${-hw + 0.05}" y1="${-hd + 0.5}" x2="${hw - 0.05}" y2="${-hd + 0.5}" stroke="currentColor" stroke-width="${sw * 1.5}" />
        <circle cx="${-hw + 0.05}" cy="${-hd + 0.45}" r="0.04" fill="currentColor" />
        <circle cx="${hw - 0.05}" cy="${-hd + 0.45}" r="0.04" fill="currentColor" />
        <!-- Rueda delantera -->
        <rect x="${-0.06}" y="${-hd}" width="0.12" height="0.45" rx="0.04" fill="currentColor" />
        <!-- Tanque y asiento -->
        <ellipse cx="0" cy="${-hd + 0.85}" rx="0.18" ry="0.25" fill="none" stroke="currentColor" stroke-width="${sw}" />
        <path d="M -0.14 ${-hd + 1.1} L 0.14 ${-hd + 1.1} L 0.08 ${hd - 0.3} L -0.08 ${hd - 0.3} Z" fill="rgba(56, 189, 248, 0.2)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Rueda trasera -->
        <rect x="${-0.07}" y="${hd - 0.45}" width="0.14" height="0.45" rx="0.04" fill="currentColor" />
      `
    }

    case 'bicycle': {
      return `
        <!-- Manillar -->
        <line x1="${-hw + 0.05}" y1="${-hd + 0.4}" x2="${hw - 0.05}" y2="${-hd + 0.4}" stroke="currentColor" stroke-width="${sw * 1.5}" />
        <!-- Rueda delantera delgada -->
        <line x1="0" y1="${-hd}" x2="0" y2="${-hd + 0.5}" stroke="currentColor" stroke-width="${sw * 1.8}" />
        <!-- Cuadro principal -->
        <line x1="0" y1="${-hd + 0.4}" x2="0" y2="${hd - 0.4}" stroke="currentColor" stroke-width="${sw}" />
        <!-- Sillín -->
        <ellipse cx="0" cy="${0.1}" rx="0.1" ry="0.14" fill="currentColor" />
        <!-- Rueda trasera -->
        <line x1="0" y1="${hd - 0.5}" x2="0" y2="${hd}" stroke="currentColor" stroke-width="${sw * 1.8}" />
      `
    }

    case 'truck': {
      return `
        <!-- Cabina frontal -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="1.6" rx="0.08" fill="rgba(56, 189, 248, 0.12)" stroke="currentColor" stroke-width="${sw}" />
        <path d="M ${-hw + 0.2} ${-hd + 0.5} Q 0 ${-hd + 0.7} ${hw - 0.2} ${-hd + 0.5}" stroke="currentColor" stroke-width="${sw * 1.3}" fill="none" />
        <!-- Caja de carga trasera -->
        <rect x="${-hw + 0.05}" y="${-hd + 1.7}" width="${w - 0.1}" height="${d - 1.75}" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <line x1="${-hw + 0.05}" y1="${-hd + 1.7}" x2="${hw - 0.05}" y2="${hd - 0.05}" stroke="currentColor" stroke-width="${sw * 0.5}" stroke-dasharray="0.1 0.06" />
        <line x1="${-hw + 0.05}" y1="${hd - 0.05}" x2="${hw - 0.05}" y2="${-hd + 1.7}" stroke="currentColor" stroke-width="${sw * 0.5}" stroke-dasharray="0.1 0.06" />
      `
    }

    case 'bus': {
      const seatRows = 10
      const step = (d - 2.0) / seatRows
      return `
        <!-- Chasis autobús -->
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.15" fill="rgba(56, 189, 248, 0.08)" stroke="currentColor" stroke-width="${sw}" />
        <!-- Parabrisas amplio -->
        <path d="M ${-hw + 0.15} ${-hd + 0.6} Q 0 ${-hd + 0.9} ${hw - 0.15} ${-hd + 0.6}" stroke="currentColor" stroke-width="${sw * 1.5}" fill="none" />
        <!-- Filas de asientos dobles y pasillo central -->
        ${Array.from({ length: seatRows })
          .map((_, i) => {
            const y = -hd + 1.2 + i * step
            return `
            <!-- Asiento izquierdo -->
            <rect x="${-hw + 0.15}" y="${y}" width="0.75" height="0.4" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
            <!-- Asiento derecho -->
            <rect x="${hw - 0.9}" y="${y}" width="0.75" height="0.4" rx="0.04" fill="none" stroke="currentColor" stroke-width="${sw * 0.6}" />
          `
          })
          .join('')}
      `
    }

    case 'tree': {
      const r = Math.min(hw, hd)
      // Corona de árbol orgánica estilo bloque CAD
      return `
        <!-- Copa exterior lobulada -->
        <circle cx="0" cy="0" r="${r}" fill="rgba(34, 197, 94, 0.12)" stroke="#22c55e" stroke-width="${sw}" />
        <circle cx="0" cy="0" r="${r * 0.82}" fill="none" stroke="#22c55e" stroke-width="${sw * 0.8}" stroke-dasharray="0.15 0.08" />
        <!-- Ramas centrales en cruz y diagonal -->
        <line x1="${-r * 0.6}" y1="${-r * 0.6}" x2="${r * 0.6}" y2="${r * 0.6}" stroke="#15803d" stroke-width="${sw * 1.2}" />
        <line x1="${-r * 0.6}" y1="${r * 0.6}" x2="${r * 0.6}" y2="${-r * 0.6}" stroke="#15803d" stroke-width="${sw * 1.2}" />
        <line x1="${-r * 0.7}" y1="0" x2="${r * 0.7}" y2="0" stroke="#15803d" stroke-width="${sw * 1.2}" />
        <line x1="0" y1="${-r * 0.7}" x2="0" y2="${r * 0.7}" stroke="#15803d" stroke-width="${sw * 1.2}" />
        <!-- Tronco central -->
        <circle cx="0" cy="0" r="0.16" fill="#15803d" stroke="none" />
      `
    }

    case 'palm': {
      const r = Math.min(hw, hd)
      const fronds = 9
      const frondsHtml: string[] = []
      for (let i = 0; i < fronds; i++) {
        const a = (i * 2 * Math.PI) / fronds
        const ex = Math.cos(a) * r
        const ey = Math.sin(a) * r
        frondsHtml.push(`
          <path d="M 0 0 Q ${ex * 0.4 + Math.sin(a) * 0.2} ${ey * 0.4 - Math.cos(a) * 0.2} ${ex} ${ey}" stroke="#16a34a" stroke-width="${sw * 1.8}" fill="none" />
        `)
      }
      return `
        <!-- Frondas radiales de palmera -->
        ${frondsHtml.join('')}
        <circle cx="0" cy="0" r="0.2" fill="#854d0e" stroke="#16a34a" stroke-width="${sw}" />
      `
    }

    case 'shrub': {
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="${Math.min(hw, hd) * 0.8}" fill="rgba(34, 197, 94, 0.15)" stroke="#16a34a" stroke-width="${sw}" />
        <circle cx="${-hw * 0.4}" cy="0" r="${Math.min(hw, hd) * 0.35}" fill="none" stroke="#16a34a" stroke-width="${sw * 0.7}" stroke-dasharray="0.08 0.05" />
        <circle cx="${hw * 0.4}" cy="0" r="${Math.min(hw, hd) * 0.35}" fill="none" stroke="#16a34a" stroke-width="${sw * 0.7}" stroke-dasharray="0.08 0.05" />
      `
    }

    case 'potPlant': {
      const r = Math.min(hw, hd)
      return `
        <circle cx="0" cy="0" r="${r}" fill="rgba(34, 197, 94, 0.2)" stroke="#16a34a" stroke-width="${sw}" />
        <!-- Hojas interiores -->
        <circle cx="0" cy="${-r * 0.4}" r="${r * 0.35}" fill="none" stroke="#22c55e" stroke-width="${sw * 0.8}" />
        <circle cx="${-r * 0.35}" cy="${r * 0.2}" r="${r * 0.35}" fill="none" stroke="#22c55e" stroke-width="${sw * 0.8}" />
        <circle cx="${r * 0.35}" cy="${r * 0.2}" r="${r * 0.35}" fill="none" stroke="#22c55e" stroke-width="${sw * 0.8}" />
      `
    }

    case 'human': {
      // Silueta arquitectónica cenital (cabeza + hombros)
      return `
        <!-- Hombros / torso ovalado -->
        <ellipse cx="0" cy="0" rx="0.24" ry="0.12" fill="rgba(100, 116, 139, 0.2)" stroke="currentColor" stroke-width="${sw * 1.2}" />
        <!-- Cabeza circular central -->
        <circle cx="0" cy="0" r="0.11" fill="currentColor" stroke="none" />
      `
    }

    default:
      // Caja fallback con aspa CAD limpia
      return `
        <rect x="${-hw}" y="${-hd}" width="${w}" height="${d}" rx="0.04" fill="rgba(148, 163, 184, 0.12)" stroke="currentColor" stroke-width="${sw}" />
        <line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd}" stroke="currentColor" stroke-width="${sw * 0.6}" stroke-dasharray="0.06 0.04" />
        <line x1="${-hw}" y1="${hd}" x2="${hw}" y2="${-hd}" stroke="currentColor" stroke-width="${sw * 0.6}" stroke-dasharray="0.06 0.04" />
      `
  }
}

/**
 * Renderiza el bloque en la Planta 2D (SVG) respetando su posición y rotación Y.
 */
export function renderCadBlock2DSvg(
  obj: SceneObject,
  options: Cad2DStyleOptions = DEFAULT_CAD_STYLE
): string {
  const blockDef = obj.shapeId ? getCadBlock(obj.shapeId) : undefined
  const blockType = blockDef?.blockType ?? (obj.shapeId ? obj.shapeId.replace(/^furn\./, '') : 'default')

  const w = obj.size.x
  const d = obj.size.z
  const posX = obj.position.x
  const posZ = obj.position.z
  const rotDeg = (-obj.rotationY * 180) / Math.PI

  const stroke = obj.isSelected ? '#38bdf8' : options.strokeColor ?? '#64748b'
  const fill = obj.isSelected ? 'rgba(56, 189, 248, 0.15)' : options.fillColor ?? 'rgba(148, 163, 184, 0.06)'

  return `
    <g
      class="cad-block-2d ${obj.isSelected ? 'is-selected' : ''}"
      data-object-id="${obj.id}"
      transform="translate(${posX}, ${posZ}) rotate(${rotDeg})"
      style="color: ${stroke}; fill: ${fill};"
    >
      ${generateBlock2DSymbol(blockType, w, d)}
      ${
        obj.isSelected
          ? `<rect x="${-w / 2 - 0.08}" y="${-d / 2 - 0.08}" width="${w + 0.16}" height="${d + 0.16}" rx="0.06" fill="none" stroke="#38bdf8" stroke-width="0.03" stroke-dasharray="0.08 0.05" />`
          : ''
      }
    </g>
  `
}

