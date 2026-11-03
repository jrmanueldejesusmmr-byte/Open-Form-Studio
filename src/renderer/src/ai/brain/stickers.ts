/**
 * Banco de stickers de Astro (Modo Amoroso).
 *
 * SVGs originales de diseño propio (sin personajes ni marcas de terceros),
 * inline y sin dependencias: la UI los inyecta en la burbuja de Astro SOLO
 * cuando la respuesta es de tono amoroso. Tamaño 72 px (viewBox 64, máx. 96)
 * y animación CSS suave de 1–2 s definida en `ui/styles.css`, desactivada con
 * `prefers-reduced-motion` para accesibilidad.
 *
 * Emparejamiento por tipo de respuesta (ver `love.test.ts`):
 *   éxito → pulgar-arriba / estrellitas · «te amo» → lluvia-corazones ·
 *   ánimo → corazon-fuerte · error → corazon-consuelo · saludo → saludo-corazon ·
 *   aclaración → duda-tierna · resumen/preview → casita-corazon …
 */

import type { AstroTone, PhraseCategory } from './phrases'

export type StickerId =
  | 'saludo-corazon'
  | 'carita-tierna'
  | 'corazon-latido'
  | 'duda-tierna'
  | 'reloj-corazon'
  | 'nube-besos'
  | 'pulgar-arriba'
  | 'estrellitas'
  | 'corazon-fuerte'
  | 'corazon-consuelo'
  | 'casita-corazon'
  | 'lluvia-corazones'

export interface Sticker {
  /** Texto alternativo accesible (aparece junto al mensaje). */
  alt: string
  /** SVG inline original (viewBox 64×64, renderizado a 72 px). */
  svg: string
}

const svg = (inner: string): string =>
  `<svg viewBox="0 0 64 64" width="72" height="72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`

/** Corazón grande (≈48×44) centrado en la caja 64×64. */
const HEART_D =
  'M32 55C13 43 8 34 8 25.5 8 19 13 14 19.5 14c4.7 0 8.6 2.6 12.5 7.4C35.9 16.6 39.8 14 44.5 14 51 14 56 19 56 25.5 56 34 51 43 32 55z'
/** Corazón pequeño (≈18×17) para usar dentro de otros stickers. */
const HEART_S_D =
  'M10 18.5C3.4 14 1.5 10.5 1.5 7.2 1.5 4.3 3.8 2 6.6 2c1.8 0 2.9 1 3.4 1.9.6-.9 1.7-1.9 3.5-1.9 2.8 0 5 2.3 5 5.2 0 3.3-2 6.8-8.5 11.3z'

/** Corazón pequeño (≈18×17) para usar dentro de otros stickers.
 * Va envuelto en `<g>` para que la animación CSS no pise el `transform` del path. */
const heartSmall = (x: number, y: number, s: number, fill: string, cls?: string, delay?: string): string =>
  `<g ${cls ? `class="${cls}" ` : ''}${delay ? `style="animation-delay:${delay}" ` : ''}><path d="${HEART_S_D}" fill="${fill}" transform="translate(${x} ${y}) scale(${s})"/></g>`

export const STICKERS: Readonly<Record<StickerId, Sticker>> = {
  'saludo-corazon': {
    alt: 'Corazón que saluda con cariño',
    svg: svg(
      `<g class="stk-onda"><path d="${HEART_D}" fill="#f43f5e" transform="translate(-3 4) scale(0.88)"/></g>` +
        '<path d="M52 22c3 2 3 7 0 9" stroke="#fda4af" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M57 17c5 4 5 14 0 18" stroke="#fbcfe8" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    )
  },
  'carita-tierna': {
    alt: 'Carita tierna con brillo',
    svg: svg(
      '<circle cx="32" cy="32" r="23" fill="#ffd9e8"/>' +
        '<circle cx="25" cy="30" r="2.7" fill="#4a2b33"/><circle cx="39" cy="30" r="2.7" fill="#4a2b33"/>' +
        '<ellipse cx="18" cy="38" rx="4.2" ry="2.6" fill="#fda4af" opacity="0.85"/>' +
        '<ellipse cx="46" cy="38" rx="4.2" ry="2.6" fill="#fda4af" opacity="0.85"/>' +
        '<path d="M26 38c2.6 3.4 9.4 3.4 12 0" stroke="#4a2b33" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="stk-brilla" d="M54 10l1.7 4.3 4.3 1.7-4.3 1.7L54 22l-1.7-4.3L48 16l4.3-1.7z" fill="#fbbf24"/>'
    )
  },
  'corazon-latido': {
    alt: 'Corazón latiendo',
    svg: svg(
      `<path class="stk-late" d="${HEART_D}" fill="#ec4899"/>` +
        '<path d="M6 44h11l4-7 6 15 4.5-8H58" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>'
    )
  },
  'duda-tierna': {
    alt: 'Globo de duda con corazón',
    svg: svg(
      '<path d="M10 10h44a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H30L16 54l2.5-12H10a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z" fill="#ffe4ef" stroke="#f9a8d4" stroke-width="2.4"/>' +
        '<text x="34" y="34" text-anchor="middle" font-size="24" font-weight="700" fill="#db2777">?</text>' +
        heartSmall(44, 2, 0.7, '#f43f5e', 'stk-flota')
    )
  },
  'reloj-corazon': {
    alt: 'Reloj con corazón: un momento para ti',
    svg: svg(
      '<circle cx="32" cy="35" r="20" fill="#fff1f2" stroke="#ec4899" stroke-width="3"/>' +
        '<path d="M32 8c-3.4-4.6-9.6-3.4-9.6 1.8 0 4.3 5.2 7.4 9.6 10.8 4.4-3.4 9.6-6.5 9.6-10.8C41.6 4.6 35.4 3.4 32 8z" fill="#f43f5e"/>' +
        '<line x1="32" y1="35" x2="42" y2="41" stroke="#db2777" stroke-width="2.6" stroke-linecap="round"/>' +
        '<g class="stk-tick"><line x1="32" y1="35" x2="32" y2="21" stroke="#db2777" stroke-width="2.6" stroke-linecap="round"/></g>' +
        '<circle cx="32" cy="35" r="2.4" fill="#db2777"/>'
    )
  },
  'nube-besos': {
    alt: 'Nube que manda besitos',
    svg: svg(
      '<g class="stk-flota" fill="#e2e8f0">' +
        '<circle cx="24" cy="34" r="10"/><circle cx="37" cy="30" r="12"/><circle cx="47" cy="37" r="8"/>' +
        '<rect x="16" y="34" width="34" height="11" rx="5.5"/>' +
        '</g>' +
        heartSmall(12, 44, 0.8, '#f43f5e', 'stk-flota', '0.3s') +
        heartSmall(42, 48, 0.65, '#fb7185', 'stk-flota', '0.8s')
    )
  },
  'pulgar-arriba': {
    alt: 'Pulgar arriba: ¡aprobado!',
    svg: svg(
      '<g class="stk-late">' +
        '<rect x="24" y="28" width="28" height="24" rx="8" fill="#fda4af" stroke="#f472b6" stroke-width="2.5"/>' +
        '<path d="M25 33c-1.5-7 2-14 6.5-14 4 0 6 4 4.4 9.6" fill="#fda4af" stroke="#f472b6" stroke-width="2.5" stroke-linecap="round"/>' +
        '<rect x="8" y="34" width="14" height="18" rx="5" fill="#f472b6"/>' +
        '<path d="M33 36h6M33 42h6M33 48h6" stroke="#f472b6" stroke-width="2" stroke-linecap="round"/>' +
        '</g>' +
        '<path class="stk-brilla" d="M54 8l1.5 3.8 3.8 1.5-3.8 1.5L54 19l-1.5-4.2L48.7 13l3.8-1.2z" fill="#fbbf24"/>'
    )
  },
  estrellitas: {
    alt: 'Estrellitas brillando',
    svg: svg(
      '<path class="stk-brilla" d="M32 6l4.6 15.4L52 26l-15.4 4.6L32 46l-4.6-15.4L12 26l15.4-4.6z" fill="#fbbf24"/>' +
        '<path class="stk-brilla" style="animation-delay:0.5s" d="M13 36l2.7 8.6 8.6 2.7-8.6 2.7L13 58.6l-2.7-8.6L1.7 47.3l8.6-2.7z" fill="#fda4af"/>' +
        '<path class="stk-brilla" style="animation-delay:0.9s" d="M50 38l2.3 7.4 7.4 2.3-7.4 2.3-2.3 7.4-2.3-7.4-7.4-2.3 7.4-2.3z" fill="#f43f5e"/>'
    )
  },
  'corazon-fuerte': {
    alt: 'Corazón con energía: ¡tú puedes!',
    svg: svg(
      `<path class="stk-late" d="${HEART_D}" fill="#f43f5e"/>` +
        '<path d="M35 17l-11 17h7.5l-3.5 14 13-19H33z" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.6" stroke-linejoin="round"/>'
    )
  },
  'corazon-consuelo': {
    alt: 'Corazón con curita: todo va a estar bien',
    svg: svg(
      `<path d="${HEART_D}" fill="#fb7185"/>` +
        '<circle cx="25" cy="30" r="2.5" fill="#5b2733"/><circle cx="39" cy="30" r="2.5" fill="#5b2733"/>' +
        '<path d="M27 40c2.6-2.4 7.4-2.4 10 0" stroke="#5b2733" stroke-width="2.3" fill="none" stroke-linecap="round"/>' +
        '<g transform="rotate(-28 17 18)">' +
        '<rect x="7" y="13.5" width="20" height="9" rx="4.5" fill="#fde68a" stroke="#f59e0b" stroke-width="1.6"/>' +
        '<circle cx="17" cy="18" r="1.1" fill="#f59e0b"/><circle cx="12.5" cy="18" r="1.1" fill="#f59e0b"/><circle cx="21.5" cy="18" r="1.1" fill="#f59e0b"/>' +
        '</g>'
    )
  },
  'casita-corazon': {
    alt: 'Casita con corazón',
    svg: svg(
      heartSmall(24, -4, 1.1, '#f43f5e', 'stk-flota') +
        '<path d="M32 8l26 19H6z" fill="#f43f5e" stroke="#e11d48" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<rect x="13" y="27" width="38" height="27" rx="4" fill="#ffe4ef" stroke="#f9a8d4" stroke-width="2.2"/>' +
        '<rect x="18" y="33" width="10" height="10" rx="2.4" fill="#fbcfe8"/>' +
        '<rect x="36" y="33" width="10" height="10" rx="2.4" fill="#fbcfe8"/>' +
        '<rect x="28" y="41" width="9" height="13" rx="2.4" fill="#db2777"/>'
    )
  },
  'lluvia-corazones': {
    alt: 'Lluvia de corazones',
    svg: svg(
      heartSmall(6, 12, 1.15, '#fb7185', 'stk-cae') +
        heartSmall(26, 6, 1.45, '#f43f5e', 'stk-cae', '0.35s') +
        heartSmall(47, 14, 1.05, '#ec4899', 'stk-cae', '0.7s')
    )
  }
}

/** Sticker por categoría de respuesta. En tono profesional no hay sticker. */
const MAPA_CATEGORIA: Readonly<Record<PhraseCategory, StickerId>> = {
  saludo: 'saludo-corazon',
  ayuda: 'carita-tierna',
  confirmacion: 'corazon-latido',
  aclaracion: 'duda-tierna',
  deshacer: 'reloj-corazon',
  despedida: 'nube-besos',
  exito: 'pulgar-arriba',
  animo: 'corazon-fuerte',
  error: 'corazon-consuelo',
  resumen: 'casita-corazon',
  declaracion: 'lluvia-corazones'
}

/** Alterna pulgar-arriba / estrellitas en éxitos sin repetir el anterior. */
const STICKERS_EXITO: readonly StickerId[] = ['pulgar-arriba', 'estrellitas']
let ultimoExito: StickerId | undefined

/** Sticker para una respuesta según su categoría y tono (sin tono → undefined). */
export function stickerParaCategoria(categoria: PhraseCategory, tone: AstroTone): StickerId | undefined {
  if (tone !== 'amoroso') return undefined
  if (categoria === 'exito') {
    const elegido = STICKERS_EXITO.find((id) => id !== ultimoExito) ?? STICKERS_EXITO[0]
    ultimoExito = elegido
    return elegido
  }
  return MAPA_CATEGORIA[categoria]
}

/** SVG inline de un sticker (para inyectarlo en la burbuja de Astro). */
export function stickerSVG(id: StickerId): string {
  return STICKERS[id].svg
}

/** HTML de un sticker listo para `innerHTML` (span accesible + svg). */
export function stickerHTML(id: StickerId): string {
  const alt = STICKERS[id].alt.replace(/"/g, '&quot;')
  return `<span class="chat-sticker" role="img" aria-label="${alt}">${STICKERS[id].svg}</span>`
}
