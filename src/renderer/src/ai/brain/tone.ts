/**
 * Tono de Astro y detección de Modo Amoroso («/») — Fase 1.
 *
 * En el chat del área de trabajo:
 * - Si el mensaje empieza con `/` (tras trim a la izquierda), se activa el
 *   MODO AMOROSO para ese mensaje. Sin `/`, el tono es profesional.
 * - El prefijo `/` se retira antes de interpretar la orden; la orden real es
 *   lo que sigue a la barra.
 * - El modo amoroso cambia SOLO el tono, nunca la lógica ni las herramientas.
 * - Jamás dice "Terminado, mi amor" ante un fallo: reporta la verdad con cariño.
 * - Los mensajes sin `/` no se vuelven amorosos por accidente.
 */

import {
  type AstroTone,
  type PhraseCategory,
  getPhrase,
  SPECIAL_AFFECTION_RESPONSES
} from './phrases'

export type { AstroTone, PhraseCategory }

export type TipoTono = PhraseCategory

export interface ToneDetectionResult {
  tone: AstroTone
  cleaned: string
}

/**
 * Punto de entrada único para detectar el tono y limpiar el mensaje:
 * - Si tras trim a la izquierda empieza con "/", activa 'amoroso' y remueve el prefijo "/".
 * - Si no empieza con "/", activa 'profesional' y limpia el texto con trim.
 */
export function detectTone(rawMessage: string): ToneDetectionResult {
  const leftTrimmed = rawMessage.trimStart()
  if (leftTrimmed.startsWith('/')) {
    const afterSlash = leftTrimmed.slice(1).trim()
    return {
      tone: 'amoroso',
      cleaned: afterSlash
    }
  }
  return {
    tone: 'profesional',
    cleaned: rawMessage.trim()
  }
}

/* ========================= Modo amoroso persistente ========================= */

const PREF_KEY = 'arqstudio.astro.modo_amoroso'
let modoAmorosoMemoria = false

function leerModoAmoroso(): boolean {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(PREF_KEY) : null
    if (raw !== null) return raw === '1'
  } catch {
    /* fallback a memoria en entornos node/tests */
  }
  return modoAmorosoMemoria
}

function guardarModoAmoroso(valor: boolean): void {
  modoAmorosoMemoria = valor
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(PREF_KEY, valor ? '1' : '0')
    }
  } catch {
    /* memoria */
  }
}

export function modoAmorosoActivo(): boolean {
  return leerModoAmoroso()
}

export function setModoAmoroso(activo: boolean): void {
  guardarModoAmoroso(activo)
}

/* ========================= Declaraciones de afecto ========================= */

export interface DeteccionDeclaracion {
  esDeclaracion: boolean
  respuesta: string
}

/**
 * Detecta si el texto es una declaración de afecto (/te amo, te amo, eres lo mejor, etc.).
 * Devuelve la respuesta exacta requerida ("Yo te amo aún más, mi vida.").
 */
export function detectarDeclaracion(texto: string): DeteccionDeclaracion {
  const limpio = texto.trim()
  for (const { regex, exactResponse } of SPECIAL_AFFECTION_RESPONSES) {
    if (regex.test(limpio)) {
      return { esDeclaracion: true, respuesta: exactResponse }
    }
  }
  return { esDeclaracion: false, respuesta: '' }
}

/* ========================= Análisis integral ========================= */

export interface AnalisisModo {
  comando: 'ninguno' | 'activar' | 'desactivar'
  textoLimpio: string
  amorosoParaEsteMensaje: boolean
  tone: AstroTone
}

/**
 * Analiza el mensaje, compatible con versiones anteriores y gobernado
 * por la regla de `/` al inicio.
 */
export function analizarModoAmoroso(texto: string): AnalisisModo {
  const { tone, cleaned } = detectTone(texto)
  const empiezaConBarra = texto.trimStart().startsWith('/')
  const amoroso = tone === 'amoroso' || modoAmorosoActivo()

  const lowered = cleaned.toLowerCase()
  if (empiezaConBarra && /^modo\s+amoroso\s*$/.test(lowered)) {
    return { comando: 'activar', textoLimpio: '', amorosoParaEsteMensaje: true, tone: 'amoroso' }
  }
  if (empiezaConBarra && /^modo\s+normal\s*$/.test(lowered)) {
    return { comando: 'desactivar', textoLimpio: '', amorosoParaEsteMensaje: false, tone: 'profesional' }
  }

  return {
    comando: 'ninguno',
    textoLimpio: cleaned,
    amorosoParaEsteMensaje: amoroso,
    tone: amoroso ? 'amoroso' : 'profesional'
  }
}

/* ========================= Frases y Redacción ========================= */

/**
 * Obtiene una frase variada según tipo y tono.
 */
export function frase(tipo: PhraseCategory, tone: AstroTone = 'amoroso'): string {
  return getPhrase(tipo, tone)
}

/**
 * Redacta un mensaje de error honesto según el tono. Jamás finge éxito.
 */
export function formatearErrorHonesto(motivo: string, tone: AstroTone = 'amoroso'): string {
  const plantilla = frase('error', tone)
  const cuerpo = plantilla.includes('{motivo}')
    ? plantilla.replace('{motivo}', motivo)
    : `${plantilla} ${motivo}`
  return cuerpo.trim()
}

/**
 * Envuelve el resumen y avisos en el tono adecuado, conservando
 * todas las dimensiones y datos concretos de la orden.
 */
export function envuelveConTono(resumen: string, avisos: string[] = [], tone: AstroTone = 'amoroso'): string {
  const datos = resumen || 'la orden fue procesada'
  if (tone === 'amoroso') {
    const plantilla = frase('resumen', 'amoroso')
    const cuerpo = plantilla.includes('{datos}')
      ? plantilla.replace('{datos}', datos)
      : `${plantilla} ${datos}`
    const extra = avisos.length > 0 ? ` ${avisos.join(' ')}` : ''
    return `${cuerpo}${extra}`.trim()
  }

  const extra = avisos.length > 0 ? ` (${avisos.join(' · ')})` : ''
  return `${datos}${extra}`.trim()
}

export function resumenConTono(datos: string, tone: AstroTone = 'amoroso'): string {
  return envuelveConTono(datos, [], tone)
}
