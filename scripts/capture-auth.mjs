/**
 * Capturas de pantalla del modal de Login/Registro usando el Chromium de
 * Electron (no hay Chromium/Chrome independiente instalado en la máquina).
 *
 * Uso:
 *   1. Arrancar el dev server:  npm run dev   (http://localhost:5173)
 *   2. xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/capture-auth.mjs
 *
 * Se abre `?auth=login` y `?auth=signup` (gancho de main.ts) a ancho de
 * escritorio y a ~700 px para revisar el responsive. No imprime ni transmite
 * ningún dato de usuario: solo URLs de prueba y rutas de salida.
 */
import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Sin GPU en el entorno de captura (xvfb): se desactiva para evitar
// cierres inesperados del proceso (SIGTRAP) entre capturas.
app.disableHardwareAcceleration()

const BASE = process.env.CAPTURE_URL ?? 'http://localhost:5173/'
const OUT_DIR = path.resolve('scripts/captures')

const SHOTS = [
  { name: 'login-desktop-1280', mode: 'login', width: 1280, height: 800 },
  { name: 'signup-desktop-1280', mode: 'signup', width: 1280, height: 800 },
  { name: 'login-700px', mode: 'login', width: 700, height: 900 },
  { name: 'signup-700px', mode: 'signup', width: 700, height: 900 }
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  await mkdir(OUT_DIR, { recursive: true })

  // Una sola ventana reutilizada: crear/destruir ventanas entre capturas
  // hacía fallar a Electron en este entorno sin GPU.
  const win = new BrowserWindow({
    width: SHOTS[0].width,
    height: SHOTS[0].height,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })

  for (const shot of SHOTS) {
    try {
      win.setSize(shot.width, shot.height)
      await win.loadURL(`${BASE}?auth=${shot.mode}`)
      // Deja que carguen imagen, HMR y el foco inicial antes de capturar.
      await sleep(3000)
      const image = await win.webContents.capturePage()
      const file = path.join(OUT_DIR, `${shot.name}.png`)
      await writeFile(file, image.toPNG())
      console.log(`[capture] ${shot.name} -> ${file}`)
    } catch (error) {
      console.error(`[capture] fallo en ${shot.name}:`, String(error))
    }
  }

  win.destroy()
  app.quit()
})
