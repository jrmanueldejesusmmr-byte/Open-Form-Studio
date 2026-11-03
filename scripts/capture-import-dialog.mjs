/**
 * Captura la pantalla del Import Dialog.
 * Uso: xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/capture-import-dialog.mjs
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(REPO, 'scripts', 'captures')
const stamp = Date.now()
const PROJECT_NAME = `ImportDialog-${stamp}`

app.disableHardwareAcceleration()

const results = []
let failed = false
function assert(condition, message) {
  if (condition) {
    console.log(`[assert] OK   ${message}`)
    results.push({ ok: true, message })
  } else {
    console.error(`[assert] FALLO ${message}`)
    results.push({ ok: false, message })
    failed = true
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Cargar la aplicación real
await import(pathToFileURL(path.join(REPO, 'out', 'main', 'index.js')).href)

function findWindow() {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null
}

async function waitFor(compute, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await compute()
      if (value) return value
    } catch {
      /* la página aún se está cargando o navegando: se reintenta */
    }
    await sleep(300)
  }
  throw new Error(`Timeout (${timeoutMs} ms) esperando: ${label}`)
}

app.whenReady().then(async () => {
  await mkdir(OUT_DIR, { recursive: true })
  let win = await waitFor(() => findWindow(), 20000, 'ventana principal')
  
  // Abrir el Import Dialog mediante el comando file.import
  await new Promise((resolve) => {
    win.webContents.send('command:toggle', 'file.import')
    // Pequeña espera para que el diálogo aparezca
    setTimeout(resolve, 500)
  })
  
  await sleep(1000)
  
  // Capturar la página
  const img = await win.webContents.capturePage({
    width: 1400,
    height: 900,
  })
  
  const pngBuffer = Buffer.from(img.toDataURL().split(',')[1], 'base64')
  const filepath = path.join(OUT_DIR, `import-dialog-${PROJECT_NAME}.png`)
  
  await writeFile(filepath, pngBuffer)
  console.log(`Screenshot saved to: ${filepath}`)
  
  // También guardar metadatos
  const metadata = {
    timestamp: new Date().toISOString(),
    windowBounds: win.getBounds(),
    format: 'png'
  }
  const metaPath = path.join(OUT_DIR, `import-dialog-${PROJECT_NAME}.json`)
  await writeFile(metaPath, JSON.stringify(metadata, null, 2))
  console.log(`Metadata saved to: ${metaPath}`)
  
  app.quit()
}).catch(err => {
  console.error('Failed:', err)
  app.quit()
})
