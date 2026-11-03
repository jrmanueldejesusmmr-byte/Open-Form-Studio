import * as THREE from 'three'
import type { ExportContext } from './index'
import { collectPlanSegments, collectPlanTexts, collectPlanPolygons } from './dxf'

export const SVG_LAYER_STYLE: Record<string, { stroke: string; width: number; fill: string; dash?: string }> = {
  MUROS: { stroke: '#111111', width: 0.04, fill: 'url(#wall-hatch)', dash: 'none' },
  PUERTAS: { stroke: '#aa2222', width: 0.025, fill: 'none', dash: '4 2' },
  VENTANAS: { stroke: '#2244aa', width: 0.025, fill: 'none', dash: '2 2' },
  COTAS: { stroke: '#2266aa', width: 0.015, fill: 'none', dash: '3 2' },
  MOBILIARIO: { stroke: '#5a5a66', width: 0.02, fill: '#8f8f9c', dash: 'none' },
  OBJETOS: { stroke: '#5a5a66', width: 0.02, fill: '#8f8f9c', dash: 'none' },
  TEXTO: { stroke: '#222222', width: 0.01, fill: '#222222', dash: 'none' },
  PISOS: { stroke: '#9e9a8f', width: 0.015, fill: '#e8e4dc', dash: '6 3' },
  RAYADO: { stroke: '#888888', width: 0.01, fill: 'none', dash: 'none' }
}

const LAYER_ORDER: string[] = ['PISOS', 'MOBILIARIO', 'OBJETOS', 'PUERTAS', 'VENTANAS', 'MUROS', 'RAYADO', 'COTAS', 'TEXTO']

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

export interface SvgOptions {
  title?: string
  scale?: number
}

export function buildSvg(context: ExportContext, options: SvgOptions = {}): string {
  const segments = collectPlanSegments(context)
  const texts = collectPlanTexts(context)
  const polygons = collectPlanPolygons(context)
  if (segments.length === 0 && polygons.length === 0 && texts.length === 0) return ''

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  for (const s of segments) { grow(s.x1, s.y1); grow(s.x2, s.y2) }
  for (const p of polygons) for (const pt of p.points) grow(pt.x, pt.y)
  if (segments.length === 0 && polygons.length === 0) {
    for (const t of texts) grow(t.x, t.y)
  }
  const margin = 0.5
  const viewX = minX - margin
  const viewY = minY - margin
  const viewW = Math.max(maxX - minX, 1e-6) + margin * 2
  const viewH = Math.max(maxY - minY, 1e-6) + margin * 2

  const title = options.title ?? context.projectName ?? 'Plano ArqStudio'
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${fmt(viewW)}m" height="${fmt(viewH)}m" viewBox="${fmt(viewX)} ${fmt(viewY)} ${fmt(viewW)} ${fmt(viewH)}">`)
  lines.push(`  <title>${escapeXml(title)}</title>`)
  lines.push(`  <desc>Plano generado por ArqStudio 3D. Unidades: metros (1 unidad = 1 m).</desc>`)
  lines.push('  <defs>')
  lines.push('    <pattern id="wall-hatch" patternUnits="userSpaceOnUse" width="0.2" height="0.2" patternTransform="rotate(45)">')
  lines.push('      <line x1="0" y1="0" x2="0" y2="0.2" stroke="#888888" stroke-width="0.01" />')
  lines.push('    </pattern>')
  lines.push('  </defs>')

  lines.push(`  <g id="cabecera" font-family="sans-serif" font-size="0.4" fill="#111111">`)
  lines.push(`    <text x="${fmt(viewX)}" y="${fmt(viewY + 0.6)}">${escapeXml(title)}</text>`)
  const scaleText = options.scale ? `Escala 1:${options.scale}` : 'Escala 1:1 (metros reales)'
  lines.push(`    <text x="${fmt(viewX)}" y="${fmt(viewY + 1.05)}" font-size="0.3">${escapeXml(scaleText)} · Unidades: metros</text>`)
  lines.push('  </g>')

  for (const layer of LAYER_ORDER) {
    const ownSegs = segments.filter((s) => s.layer === layer)
    const ownPolys = polygons.filter((p) => p.layer === layer)
    const ownTexts = texts.filter((t) => t.layer === layer)
    if (ownSegs.length === 0 && ownPolys.length === 0 && ownTexts.length === 0) {
      // ensure MUROS and OBJETOS groups exist for compatibility
      if (layer !== 'MUROS' && layer !== 'OBJETOS') continue
    }
    const style = SVG_LAYER_STYLE[layer] ?? { stroke: '#333333', width: 0.02, fill: 'none' }
    const dashAttr = style.dash && style.dash !== 'none' ? ` stroke-dasharray="${style.dash}"` : ''
    lines.push(`  <g id="${layer}" stroke="${style.stroke}" stroke-width="${fmt(style.width)}" fill="${style.fill}" stroke-linecap="square"${dashAttr}>`)
    for (const poly of ownPolys) {
      const pts = poly.points.map((pt) => `${fmt(pt.x)},${fmt(pt.y)}`).join(' ')
      lines.push(`    <polygon points="${pts}" />`)
    }
    for (const seg of ownSegs) {
      lines.push(`    <line x1="${fmt(seg.x1)}" y1="${fmt(seg.y1)}" x2="${fmt(seg.x2)}" y2="${fmt(seg.y2)}" />`)
    }
    for (const t of ownTexts) {
      lines.push(`    <text x="${fmt(t.x)}" y="${fmt(t.y)}" font-size="${fmt((t.height ?? 0.1) * 0.8)}" fill="${style.stroke}">${escapeXml(t.text)}</text>`)
    }
    lines.push('  </g>')
  }

  lines.push('</svg>')
  return lines.join('\n')
}

export async function exportSvg(
  _scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const ctx = context ?? { walls: [], objects: [], levels: [] }
    const svg = buildSvg(ctx, { title: ctx.projectName, scale: ctx.scale })
    if (svg) return svg
    const title = escapeXml(ctx.projectName ?? 'Plano ArqStudio')
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="10m" height="10m" viewBox="-5 -5 10 10">',
      `  <title>${title}</title>`,
      '  <desc>Plano generado por ArqStudio 3D. Unidades: metros (1 unidad = 1 m).</desc>',
      '  <g id="MUROS" stroke="#111111" stroke-width="0.04" fill="none" />',
      '  <g id="OBJETOS" stroke="#5a5a66" stroke-width="0.02" fill="none" />',
      '  <g id="TEXTO" font-family="sans-serif" font-size="0.35" fill="#444444">',
      `    <text x="-4.5" y="-4">${title} · Planta vacía</text>`,
      '  </g>',
      '</svg>'
    ].join('\n')
  } catch (err) {
    if (error) error.message = `SVG: ${(err as Error).message}`
    return ''
  }
}
