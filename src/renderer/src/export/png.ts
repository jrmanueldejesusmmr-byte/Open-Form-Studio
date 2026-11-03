import * as THREE from 'three'
import type { ExportContext } from './index'

export interface PngCaptureOptions {
  scale?: 1 | 2 | 4 | number
  resolution?: 1 | 2 | 4 | number | string
  transparent?: boolean
  alpha?: boolean
  backgroundColor?: string | number
  background?: string | number
  hideGrid?: boolean
  hideGridAndGizmos?: boolean
  hideGizmos?: boolean
  hideHelpers?: boolean
}

export interface PngSource {
  capturePng(
    mimeType?: 'image/png' | 'image/jpeg' | Record<string, unknown>,
    quality?: number,
    options?: PngCaptureOptions | Record<string, unknown>
  ): string
}

function normalizeScale(value: unknown): 1 | 2 | 4 {
  const raw = String(value ?? '1').toLowerCase().replace('x', '')
  const n = Number(raw)
  if (n === 2) return 2
  if (n === 4) return 4
  return 1
}

function pngOptionsFromContext(context: ExportContext): PngCaptureOptions {
  const nested =
    (context as unknown as { pngOptions?: PngCaptureOptions }).pngOptions ??
    (context as unknown as { png?: PngCaptureOptions }).png ??
    (context as unknown as { image?: PngCaptureOptions }).image ??
    {}
  const ctx = context as unknown as Record<string, unknown>
  return {
    scale: normalizeScale(ctx.pngScale ?? ctx.pngResolution ?? nested.scale ?? nested.resolution),
    transparent: Boolean(ctx.pngTransparent ?? nested.transparent ?? (ctx.pngBackground === 'transparent' || nested.background === 'transparent')),
    backgroundColor: (ctx.pngBackgroundColor ?? ctx.pngBackground ?? nested.backgroundColor ?? nested.background) as string | number | undefined,
    hideGrid: (ctx.pngHideGrid ?? nested.hideGrid ?? true) as boolean,
    hideGizmos: (ctx.pngHideGizmos ?? nested.hideGizmos ?? true) as boolean
  }
}

export async function exportPng(
  _scene: THREE.Scene,
  context?: ExportContext,
  error?: { message?: string }
): Promise<string> {
  try {
    const ctx = context ?? { walls: [], objects: [], levels: [] }
    const source = ctx.viewport as PngSource | undefined
    if (!source) {
      if (error) error.message = 'La captura PNG necesita el visor 3D activo.'
      return ''
    }
    const options = pngOptionsFromContext(ctx)
    const base64 = source.capturePng('image/png', undefined, options)
    if (!base64) {
      if (error) error.message = 'El lienzo 3D está vacío: no se pudo capturar la imagen.'
      return ''
    }
    return base64
  } catch (err) {
    if (error) error.message = `PNG: ${(err as Error).message}`
    return ''
  }
}
