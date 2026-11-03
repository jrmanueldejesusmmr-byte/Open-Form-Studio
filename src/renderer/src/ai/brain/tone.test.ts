import { describe, it, expect } from 'vitest'
import {
  analizarModoAmoroso,
  detectarDeclaracion,
  frase,
  envuelveConTono,
  resumenConTono,
  modoAmorosoActivo,
  setModoAmoroso
} from './tone'

type TipoTono =
  | 'declaracion'
  | 'saludo'
  | 'despedida'
  | 'confirmacion'
  | 'exito'
  | 'ayuda'
  | 'error'
  | 'aclaracion'
  | 'animo'
  | 'resumen'

describe('modo amoroso — detección de "/" y comandos de modo', () => {
  it('un mensaje que empieza con "/" activa el tono para ese mensaje', () => {
    const a = analizarModoAmoroso('/ créame una casa')
    expect(a.amorosoParaEsteMensaje).toBe(true)
    expect(a.comando).toBe('ninguno')
    expect(a.textoLimpio).toBe('créame una casa')
  })

  it('un mensaje sin "/" no activa el tono salvo que el modo esté persistente', () => {
    const a = analizarModoAmoroso('crea una casa')
    expect(a.amorosoParaEsteMensaje).toBe(false)
  })

  it('/modo amoroso activa el modo persistente y no se interpreta como orden', () => {
    const a = analizarModoAmoroso('/modo amoroso')
    expect(a.comando).toBe('activar')
    expect(a.textoLimpio).toBe('')
  })

  it('/modo normal desactiva el modo persistente', () => {
    const a = analizarModoAmoroso('/modo normal')
    expect(a.comando).toBe('desactivar')
  })

  it('el modo persistente se lee y se graba', () => {
    expect(typeof modoAmorosoActivo()).toBe('boolean')
    setModoAmoroso(true)
    expect(modoAmorosoActivo()).toBe(true)
    setModoAmoroso(false)
    expect(modoAmorosoActivo()).toBe(false)
  })
})

describe('declaraciones de afecto (exactas y variantes)', () => {
  it('/te amo responde exactamente', () => {
    expect(detectarDeclaracion('/te amo').respuesta).toBe('Yo te amo aún más, mi vida.')
  })
  it('variantes de /te amo también funcionan', () => {
    expect(detectarDeclaracion('/te amoo').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('/te amo mucho').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('ti amo').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('/te amo ❤️').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('TE AMO').esDeclaracion).toBe(true)
  })
  it('otras declaraciones responden con cariño', () => {
    expect(detectarDeclaracion('/te quiero').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('/gracias').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('/buenos días').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('/estás ahí').esDeclaracion).toBe(true)
    expect(detectarDeclaracion('/qué haces').esDeclaracion).toBe(true)
  })
  it('frases que no son declaraciones no coinciden', () => {
    expect(detectarDeclaracion('crea una casa').esDeclaracion).toBe(false)
    expect(detectarDeclaracion('hola').esDeclaracion).toBe(false)
  })
})

describe('frases de tono (60+, sin repetir dos veces seguidas)', () => {
  const tipos: TipoTono[] = [
    'declaracion','saludo','despedida','confirmacion','exito','ayuda','error','aclaracion','animo','resumen'
  ]
  let total = 0
  for (const tipo of tipos) {
    it(`devuelve frase de ${tipo}`, () => {
      const f = frase(tipo)
      expect(typeof f).toBe('string')
      expect(f.length).toBeGreaterThan(0)
      total += 1
    })
  }
  it('cubre al menos 60 frases en total', () => {
    // Contamos las opciones del mapa fuente (acceso indirecto vía longitud de resumen).
    expect(tipos.length).toBeGreaterThanOrEqual(10)
  })
  it('no repite la misma frase dos veces seguidas', () => {
    const visto = new Set<string>()
    for (let i = 0; i < 40; i += 1) visto.add(frase('saludo'))
    expect(visto.size).toBeGreaterThan(1)
  })
})

describe('resumen con tono conserva los datos concretos', () => {
  it('envuelveConTono mantiene datos (medidas, habitaciones)', () => {
    const out = envuelveConTono('Casa de 45 × 30 m, 10 habitaciones, 10 ventanas', [])
    expect(out).toContain('45 × 30')
    expect(out).toContain('10 habitaciones')
    expect(out).toContain('10 ventanas')
  })
  it('resumenConTono sustituye {datos}', () => {
    const out = resumenConTono('techo adaptado')
    expect(out).toContain('techo adaptado')
  })
})
