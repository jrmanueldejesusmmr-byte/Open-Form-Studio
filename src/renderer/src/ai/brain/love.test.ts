/**
 * Tests del Modo Amoroso: emojis contextuales, honestidad ante errores,
 * stickers por categoría y no repetición de frases.
 *
 * Vitest no arranca en este repo (vitest 5 + vite 5 incompatibles), así que
 * este archivo usa el patrón propio (check + process.exitCode) y se ejecuta
 * con esbuild: `node scripts/test-love.mjs`
 */

import {
  FRASES_AMOROSAS,
  FRASES_PROFESIONALES,
  getPhrase,
  type PhraseCategory
} from './phrases'
import { detectarDeclaracion, frase, formatearErrorHonesto, setModoAmoroso } from './tone'
import { STICKERS, stickerHTML, stickerParaCategoria, type StickerId } from './stickers'
import { BrainSession } from './session'
import { SceneManager } from '../../engine/SceneManager'
import { HistoryManager } from '../../engine/HistoryManager'

let failed = 0
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.error(`FAIL ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

const contarEmojis = (s: string): number => s.match(/\p{Extended_Pictographic}/gu)?.length ?? 0

const CATEGORIAS: PhraseCategory[] = [
  'saludo', 'ayuda', 'confirmacion', 'error', 'aclaracion', 'deshacer',
  'despedida', 'exito', 'animo', 'declaracion', 'resumen'
]

// —— 1. Frases amorosas: emojis contextuales, máximo 3 por frase ——
for (const cat of CATEGORIAS) {
  const lista = FRASES_AMOROSAS.get(cat) ?? []
  const conteos = lista.map(contarEmojis)
  check(
    `frases amorosas de «${cat}»: ≥3 variantes con 1..3 emojis`,
    lista.length >= 3 && conteos.every((n) => n >= 1 && n <= 3),
    JSON.stringify(conteos)
  )
}

// —— 2. Banco profesional: NINGÚN emoji decorativo ——
for (const cat of CATEGORIAS) {
  const lista = FRASES_PROFESIONALES.get(cat) ?? []
  check(
    `frases profesionales de «${cat}» sin emojis`,
    lista.length > 0 && lista.every((f) => contarEmojis(f) === 0)
  )
}

// —— 3. Stickers: banco 8..12 y emparejamiento por categoría ——
const ids = Object.keys(STICKERS) as StickerId[]
check('banco de 8..12 stickers originales', ids.length >= 8 && ids.length <= 12, `hay ${ids.length}`)
check(
  'cada sticker trae svg y alt accesible',
  ids.every((id) => STICKERS[id].svg.includes('<svg') && STICKERS[id].alt.length > 3)
)
check(
  'sin tono amoroso no hay sticker',
  stickerParaCategoria('exito', 'profesional') === undefined &&
    stickerParaCategoria('declaracion', 'profesional') === undefined &&
    stickerParaCategoria('error', 'profesional') === undefined
)
check('saludo → saludo-corazon', stickerParaCategoria('saludo', 'amoroso') === 'saludo-corazon')
check('aclaración → duda-tierna', stickerParaCategoria('aclaracion', 'amoroso') === 'duda-tierna')
check('error → corazon-consuelo', stickerParaCategoria('error', 'amoroso') === 'corazon-consuelo')
check('ánimo → corazon-fuerte', stickerParaCategoria('animo', 'amoroso') === 'corazon-fuerte')
check('«te amo» → lluvia-corazones', stickerParaCategoria('declaracion', 'amoroso') === 'lluvia-corazones')
check('resumen/preview → casita-corazon', stickerParaCategoria('resumen', 'amoroso') === 'casita-corazon')
const s1 = stickerParaCategoria('exito', 'amoroso')
const s2 = stickerParaCategoria('exito', 'amoroso')
check(
  'éxito alterna pulgar-arriba / estrellitas sin repetir',
  s1 !== undefined && s2 !== undefined && s1 !== s2 && [s1, s2].every((v) => v === 'pulgar-arriba' || v === 'estrellitas'),
  `${String(s1)} → ${String(s2)}`
)
const html = stickerHTML('corazon-latido')
check('stickerHTML es accesible (role/aria-label)', html.includes('role="img"') && html.includes('aria-label='))

// —— 4. Honestidad: error cariñoso pero verdadero, nunca 🎉 ni «Terminado» ——
const errA = formatearErrorHonesto('las medidas no son válidas', 'amoroso')
check(
  'error amoroso: motivo + ternura (🥺/💔), sin 🎉 ni «terminado»',
  errA.includes('las medidas no son válidas') &&
    (errA.includes('🥺') || errA.includes('💔')) &&
    !errA.includes('🎉') &&
    !/terminado/i.test(errA),
  errA
)
const errP = formatearErrorHonesto('las medidas no son válidas', 'profesional')
check(
  'error profesional: motivo y sin emojis',
  errP.includes('las medidas no son válidas') && contarEmojis(errP) === 0,
  errP
)

// —— 5. Nunca repetir la misma frase dos veces seguidas ——
for (const cat of ['saludo', 'exito', 'error', 'animo'] as PhraseCategory[]) {
  for (const tone of ['amoroso', 'profesional'] as const) {
    let prev = frase(cat, tone)
    let ok = true
    for (let i = 0; i < 40 && ok; i += 1) {
      const cur = frase(cat, tone)
      if (cur === prev) ok = false
      prev = cur
    }
    check(`«${cat}» (${tone}) no se repite consecutiva`, ok)
  }
}
check(
  'getPhrase profesional no llena el mapa con un solo valor',
  new Set(Array.from({ length: 30 }, () => getPhrase('saludo', 'profesional'))).size > 1
)

// —— 6. «/te amo» → respuesta exacta requerida ——
check(
  '/te amo responde exactamente «Yo te amo aún más, mi vida.»',
  detectarDeclaracion('/te amo').respuesta === 'Yo te amo aún más, mi vida.'
)
check(
  'otras declaraciones siguen detectándose',
  detectarDeclaracion('/te quiero').esDeclaracion && detectarDeclaracion('TE AMO').esDeclaracion
)

// —— 7. Sesión end-to-end: «/» con emoji + sticker, sin «/» profesional ——
setModoAmoroso(false)

const nuevaSesion = (autoApply = false): BrainSession => {
  const scene = new SceneManager()
  return new BrainSession({ scene, history: new HistoryManager(scene), autoApply })
}

{
  const r = nuevaSesion().submit('/hola')
  check(
    '/hola → chat con emoji y sticker de saludo',
    r.kind === 'chat' && contarEmojis(r.mensaje) >= 1 && r.sticker !== undefined,
    JSON.stringify({ kind: r.kind, sticker: r.sticker, mensaje: r.kind === 'chat' ? r.mensaje : '' })
  )
}
{
  const r = nuevaSesion().submit('hola')
  check(
    '«hola» sin / → profesional sin emoji decorativo ni sticker',
    r.kind === 'chat' && contarEmojis(r.mensaje) === 0 && r.sticker === undefined,
    r.kind === 'chat' ? r.mensaje : r.kind
  )
}
{
  const r = nuevaSesion().submit('/te amo')
  check(
    '/te amo → frase exacta + emoji + sticker de lluvia de corazones',
    r.kind === 'chat' &&
      r.mensaje.includes('Yo te amo aún más, mi vida.') &&
      contarEmojis(r.mensaje) >= 1 &&
      r.sticker === 'lluvia-corazones',
    r.kind === 'chat' ? r.mensaje : r.kind
  )
}
{
  const r = nuevaSesion().submit('/haz una habitación')
  check(
    '/haz una habitación → clarify con emoji, sin {pregunta} literal y sticker duda',
    r.kind === 'clarify' &&
      contarEmojis(r.clarify.pregunta) >= 1 &&
      !r.clarify.pregunta.includes('{pregunta}') &&
      r.sticker === 'duda-tierna',
    r.kind === 'clarify' ? r.clarify.pregunta : r.kind
  )
}
{
  const r = nuevaSesion().submit('haz una habitación')
  check(
    'clarify sin / → sin emojis y sin sticker',
    r.kind === 'clarify' && contarEmojis(r.clarify.pregunta) === 0 && r.sticker === undefined,
    r.kind === 'clarify' ? r.clarify.pregunta : r.kind
  )
}
{
  const r = nuevaSesion().submit('/crea una casa de 0 por 0')
  const resumen = r.kind === 'preview' ? r.preview.resumen : ''
  check(
    '/crea una casa de 0 por 0 → error honesto (🥺/💔, sin 🎉 ni «Terminado») + sticker de consuelo',
    r.kind === 'preview' &&
      !r.preview.valido &&
      resumen.includes('«ancho»') &&
      (resumen.includes('🥺') || resumen.includes('💔')) &&
      !resumen.includes('🎉') &&
      !/terminado/i.test(resumen) &&
      r.sticker === 'corazon-consuelo',
    resumen
  )
}
{
  const sesion = nuevaSesion()
  const r = sesion.submit('/crea una casa de 10 por 8')
  if (r.kind === 'preview' && r.preview.valido) {
    const res = sesion.apply()
    const animos = FRASES_AMOROSAS.get('animo') ?? []
    check(
      'orden grande con / → éxito + frase de ánimo + emoji',
      res.ok && contarEmojis(res.mensaje) >= 1 && animos.some((a) => res.mensaje.includes(a)),
      res.mensaje
    )
    check(
      'orden grande con / → sticker de éxito (pulgar-arriba o estrellitas)',
      res.sticker === 'pulgar-arriba' || res.sticker === 'estrellitas',
      String(res.sticker)
    )
  } else {
    check('orden grande con / → preview válida', false, JSON.stringify(r).slice(0, 200))
  }
}
{
  const sesion = nuevaSesion()
  const r = sesion.submit('crea una casa de 10 por 8')
  if (r.kind === 'preview' && r.preview.valido) {
    const res = sesion.apply()
    check(
      'orden sin / → profesional sin emoji ni sticker',
      res.ok && contarEmojis(res.mensaje) === 0 && res.sticker === undefined,
      res.mensaje
    )
  } else {
    check('orden sin / → preview válida', false, JSON.stringify(r).slice(0, 200))
  }
}

if (failed > 0) {
  console.error(`\nlove.test: ${failed} comprobación(es) fallida(s).`)
  process.exitCode = 1
} else {
  console.log('\nlove.test: todas las comprobaciones del banco pasaron.')
}
