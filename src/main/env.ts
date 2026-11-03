/**
 * Carga segura de secretos para el proceso **main** (Fase 3 · Gemini).
 *
 * Regla de oro: la API key vive solo en el `.env` del disco y se lee ÚNICAMENTE
 * aquí, en el proceso principal de Electron. Nunca se inyecta en el bundle del
 * renderer ni viaja por IPC hacia la interfaz; el renderer solo puede pedir
 * «¿está configurado?» o «genera este texto», nunca la clave.
 *
 * No se usa ninguna dependencia (`dotenv`): el parser es deliberadamente
 * mínimo y puro, para poder testearlo sin Electron.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Mapa clave→valor tal como aparece en un `.env`. */
export interface EnvMap {
  [key: string]: string
}

/**
 * Parsea el contenido de un `.env` (función pura, sin I/O).
 * - ignora líneas vacías y comentarios (`# …`),
 * - admite `export CLAVE=valor`,
 * - recorta comillas envolventes simples o dobles del valor,
 * - hace trim de espacios alrededor de `=`.
 */
export function parseEnv(text: string): EnvMap {
  const out: EnvMap = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line
    const eq = withoutExport.indexOf('=')
    if (eq <= 0) continue
    const key = withoutExport.slice(0, eq).trim()
    if (key === '') continue
    let value = withoutExport.slice(eq + 1).trim()
    // Quita comillas envolventes (simples o dobles) sin tocar el interior.
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * Lee y fusiona varios `.env` por orden de prioridad (los últimos sobrescriben
 * a los primeros). Los archivos que no existen se ignoran. Nunca lanza.
 */
export function loadEnvFiles(baseDir: string, names: readonly string[]): EnvMap {
  const merged: EnvMap = {}
  for (const name of names) {
    const path = join(baseDir, name)
    try {
      if (existsSync(path)) Object.assign(merged, parseEnv(readFileSync(path, 'utf-8')))
    } catch {
      /* un archivo ilegible no debe tumbar el arranque: se ignora */
    }
  }
  return merged
}

/** Modelo de Gemini por defecto si el `.env` no especifica `GEMINI_MODEL`. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

/** Configuración de Gemini resuelta para el proceso main. */
export interface GeminiConfig {
  apiKey: string
  model: string
}

/**
 * Resuelve la configuración de Gemini leyendo el `.env` de la raíz del proyecto
 * (única fuente; antes había un `.env.akey` aparte, ya unificado aquí).
 * Devuelve `null` si no hay `GEMINI_API_KEY` (la app degrada al cerebro local).
 * La clave resultante permanece en el proceso main y se sanea por si al pegarla
 * se colaron comillas envolventes o espacios. Nunca se expone al renderer.
 */
export function readGeminiConfig(baseDir: string): GeminiConfig | null {
  const env = loadEnvFiles(baseDir, ['.env'])
  // Sanea la clave: recorta, quita comillas envolventes y TODO espacio en blanco
  // (una API key no lleva espacios). Así un copy/paste con «"…"» o saltos funciona.
  const apiKey = (env['GEMINI_API_KEY'] ?? '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '')
  if (!apiKey) return null
  const model = (env['GEMINI_MODEL'] ?? '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '') || DEFAULT_GEMINI_MODEL
  return { apiKey, model }
}
