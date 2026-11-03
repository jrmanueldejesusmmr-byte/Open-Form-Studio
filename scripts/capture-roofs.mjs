/**
 * Captura de techos por área con Playwright + el binario de Electron.
 *
 * Dos tomas: un techo RECTANGULAR y otro en L, ambos dibujados con la
 * herramienta «Techo» en modo MANUAL (clics sobre la cuadrícula con snap a
 * 0.5 m). Para acertar los píxeles se calibra la proyección ortográfica 2D
 * (planta) leyendo las coordenadas vivas del HUD (`#hud-status`) en dos
 * puntos de pantalla y resolviendo la transformación lineal pantalla↔suelo.
 *
 * Uso:
 *   1. npm run build            (compila out/ con los cambios actuales)
 *   2. xvfb-run -a node scripts/capture-roofs.mjs
 *
 * No transmite datos: solo URLs y rutas locales de prueba.
 */
import { _electron as electron } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(REPO, 'scripts', 'captures')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitUntil(page, fn, { timeout = 120000, every = 1500, what = 'condición' } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      last = await page.evaluate(fn)
      if (last) return last
    } catch (error) {
      last = String(error)
      if (/closed|crash/i.test(String(error))) throw error
    }
    await sleep(every)
  }
  throw new Error(`Timeout esperando ${what} (último: ${JSON.stringify(last)})`)
}

const app = await electron.launch({
  executablePath: path.join(REPO, 'node_modules', 'electron', 'dist', 'electron'),
  args: [
    path.join(REPO, 'out', 'main', 'index.js'),
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ],
  cwd: REPO,
  env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
  timeout: 90000
})

let page
{
  const deadline = Date.now() + 120000
  while (!page) {
    try {
      const wins = app.windows()
      if (wins.length > 0) {
        page = wins[0]
        break
      }
    } catch { /* arrancando */ }
    if (Date.now() > deadline) throw new Error('Timeout esperando ventana de Electron')
    await sleep(2000)
  }
}
console.log('[roofs] ventana detectada')
const step = (name) => console.log(`[step] ${new Date().toISOString()} ${name}`)

try {
  if (!page || page.isClosed()) throw new Error('La ventana se cerró durante el arranque')
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page:error] ${msg.text()}`)
  })
  page.on('crash', () => console.log('[page] CRASHED'))
  page.on('close', () => console.log('[page] CLOSED'))
  await mkdir(OUT_DIR, { recursive: true })

  // 1. Dashboard → «+ Nuevo proyecto».
  step('dashboard → nuevo proyecto')
  await waitUntil(page, () => !!document.querySelector('[data-dash-action="new"]'), {
    timeout: 60000, what: 'botón «Nuevo proyecto»'
  })
  await page.evaluate(() => {
    document.querySelector('[data-dash-action="new"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  // 2. Registro local (solo si no hay sesión persistida).
  step('auth / diálogo de proyecto')
  let entry = null
  {
    const deadline = Date.now() + 45000
    while (!entry && Date.now() < deadline) {
      const state = await page.evaluate(() => ({
        auth: !!document.querySelector('[data-auth-switch="signup"]'),
        dialog: !!document.querySelector('[data-dialog-submit]')
      }))
      if (state.auth) entry = 'auth'
      else if (state.dialog) entry = 'dialog'
      else await sleep(1000)
    }
  }
  if (!entry) throw new Error('Ni el modal de sesión ni el diálogo de proyecto aparecieron')
  if (entry === 'auth') {
    step('registro local')
    await page.click('[data-auth-switch="signup"]')
    await page.fill('#auth-name', 'Captura Techos')
    await page.fill('#auth-email', `roofs.capture.${Date.now()}@example.com`)
    await page.fill('#auth-password', 'Demo1234!')
    await page.fill('#auth-confirm', 'Demo1234!')
    try {
      await page.check('#auth-terms', { timeout: 8000 })
    } catch {
      await page.click('#auth-terms', { force: true, timeout: 8000 })
    }
    await page.click('[data-auth-submit]')
    await page.waitForSelector('[data-dialog-submit]', { timeout: 15000 })
  }
  step('confirmar proyecto')
  await page.evaluate(() => {
    document.querySelector('[data-dialog-submit]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  // 3. Workspace cargado.
  step('esperar workspace')
  await waitUntil(page, () => !!document.querySelector('[data-activity-id="costs"]'), {
    timeout: 120000, what: 'workspace'
  })
  await sleep(1500)

  // 4. Planta 2D (proyección ortográfica → calibración lineal fiable).
  step('vista 2D')
  await page.evaluate(() => {
    document.querySelector('[data-view-mode="2d"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(1500)

  // --- Calibración pantalla↔suelo leyendo el HUD en dos puntos ---
  async function calibrate() {
    const box = await page.locator('#viewport-canvas').boundingBox()
    const readAt = async (fx, fy) => {
      const x = Math.round(box.x + box.width * fx)
      const y = Math.round(box.y + box.height * fy)
      await page.mouse.move(x, y)
      await sleep(280)
      const txt = await page.evaluate(() => document.getElementById('hud-status')?.textContent ?? '')
      const m = txt.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
      return m ? { x: Number(m[1]), z: Number(m[2]), sx: x, sy: y } : null
    }
    const a = await readAt(0.35, 0.35)
    const b = await readAt(0.65, 0.65)
    if (!a || !b) throw new Error(`Calibración fallida: a=${JSON.stringify(a)} b=${JSON.stringify(b)}`)
    const sx = (b.x - a.x) / (b.sx - a.sx)
    const sz = (b.z - a.z) / (b.sy - a.sy)
    return {
      box,
      toScreen(gx, gz) {
        const px = a.sx + (gx - a.x) / sx
        const py = a.sy + (gz - a.z) / sz
        return { x: Math.round(px), y: Math.round(py) }
      }
    }
  }
  const calib = await calibrate()
  console.log(`[roofs] calibrado: canvas=${JSON.stringify({ x: calib.box.x, y: calib.box.y, w: calib.box.width, h: calib.box.height })}`)

  /** Abre la herramienta Techo en modo manual con las propiedades dadas. */
  async function openRoofToolManual({ slope = 30, overhang = 0.3 } = {}) {
    // «Cubierta / techo» vive en la barra de iconos de acceso rápido (quick-btn),
    // no en un desplegable: se pulsa directo su botón data-menu-action.
    await page.evaluate(() => {
      document.querySelector('.quick-btn[data-menu-action="tool.roof"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitUntil(page, () => !!document.querySelector('[data-roof-mode="manual"]'), {
      timeout: 15000, what: 'diálogo de opciones del techo'
    })
    await page.evaluate((s, o) => {
      document.querySelector('[data-roof-mode="manual"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const setNum = (sel, v) => {
        const el = document.querySelector(sel)
        if (el) {
          el.value = String(v)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
      setNum('[data-roof-slope]', s)
      setNum('[data-roof-overhang]', o)
    }, slope, overhang)
    await sleep(200)
    await page.evaluate(() => {
      document.querySelector('[data-roof-accept]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await sleep(400)
  }

  /** Dibuja un contorno haciendo clic en cada vértice y cierra con doble clic. */
  async function drawContour(points) {
    for (const p of points) {
      const s = calib.toScreen(p.x, p.z)
      await page.mouse.click(s.x, s.y)
      await sleep(220)
    }
    const last = calib.toScreen(points[points.length - 1].x, points[points.length - 1].z)
    await page.mouse.dblclick(last.x, last.y)
    await sleep(600)
  }

  // --- Techo RECTANGULAR 6 × 4 ---
  step('techo rectangular 6x4')
  await openRoofToolManual({ slope: 30, overhang: 0.5 })
  await drawContour([
    { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }
  ])
  const rectStatus = await page.evaluate(() => document.getElementById('status-bar')?.innerText ?? '')
  console.log(`[roofs] estado tras techo rectangular: ${rectStatus.replace(/\s+/g, ' ').slice(0, 160)}`)
  await sleep(800)
  await page.screenshot({ path: path.join(OUT_DIR, 'roof-rectangular.png') })
  console.log('[roofs] roof-rectangular.png')

  // --- Techo en L (6 × 4 con muesca 3 × 2) ---
  step('techo en L')
  await openRoofToolManual({ slope: 30, overhang: 0.3 })
  await drawContour([
    { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 },
    { x: 3, z: 2 }, { x: 3, z: 4 }, { x: 0, z: 4 }
  ])
  const lStatus = await page.evaluate(() => document.getElementById('status-bar')?.innerText ?? '')
  console.log(`[roofs] estado tras techo en L: ${lStatus.replace(/\s+/g, ' ').slice(0, 160)}`)
  await sleep(800)
  await page.screenshot({ path: path.join(OUT_DIR, 'roof-l-shape.png') })
  console.log('[roofs] roof-l-shape.png')
} catch (error) {
  try {
    const dbg = await page.evaluate(() => ({
      url: location.href,
      body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)
    }))
    console.log(`[roofs:fail] ${JSON.stringify(dbg)}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'roofs-debug.png') })
  } catch (dumpError) {
    console.log(`[roofs:fail] sin volcado: ${dumpError}`)
  }
  throw error
} finally {
  await app.close()
}
