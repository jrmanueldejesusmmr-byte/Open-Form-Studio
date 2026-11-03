/**
 * Convierte un ArrayBuffer/Uint8Array a base64, funcionando tanto en Node
 * (`Buffer`) como en el navegador (`btoa`), para los exportadores binarios
 * (GLB, PDF).
 */
export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convierte un texto (interpretado como Latin-1, un byte por carácter) a
 * base64. El PDF se genera en Latin-1, así que este camino no necesita
 * recorrer los bytes del string carácter a carácter en el navegador.
 */
export function latin1ToBase64(text: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'latin1').toString('base64')
  }
  return btoa(text)
}

/**
 * Decodifica una cadena base64 a Uint8Array de bytes reales (funciona tanto en
 * Node como en el navegador) para construir Blobs o ArrayBuffers.
 */
export function fromBase64(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').trim()
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(clean, 'base64')
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
