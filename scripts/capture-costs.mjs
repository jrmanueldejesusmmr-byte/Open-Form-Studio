a/**
 * Captura del panel «Costos / Presupuesto» usando Playwright con el propio
 * binario de Electron (la app necesita el puente IPC para SQLite/auth en modo
 * local).
 *
 * Uso:
 *   1. Arrancar el dev server:  npm run dev  (anota el puerto, p. ej. 5174)
 *   2. node scripts/capture-costs.mjs [--url http://localhost:5174]
 *
 * Flujo: Dashboard → registro local → crear proyecto → menú AEC «Casa de
 * prueba» (siembra muros/techo) → abrir el panel de Costos → captura PNG en
 * scripts/captures/. No transmite ningún dato: solo URLs locales de prueba.
 */
import { _electron as electron } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (() => {
  const i = process.argv.indexOf('--url')
  return i >= 0 ? process.argv[i + 1] : process.env.CAPTURE_URL ?? 'http://localhost:5174'
})()
const OUT_DIR = path.join(REPO, 'scripts', 'captures')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const app = await electron.launch({
  executablePath: path.join(REPO, 'node_modules', 'electron', 'dist', 'electron'),
  args: [path.join(REPO, 'out', 'main', 'index.js'), '--no-sandbox'],
  cwd: REPO,
  env: { ...process.env, ELECTRON_RENDERER_URL: BASE }
})

try {
  const page = await app.firstWindow()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page:error] ${msg.text()}`)
  })
  page.on('crash', () => console.log('[page] CRASHED'))
  page.on('close', () => console.log('[page] CLOSED'))
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) console.log(`[page] navigate -> ${frame.url()}`)
  })
  const proc = app.process()
  proc.stderr?.on('data', (chunk) => console.log(`[main:err] ${chunk}`.trimEnd()))
  const step = (name) => console.log(`[step] ${new Date().toISOString()} ${name}`)

  await mkdir(OUT_DIR, { recursive: true })

  if (process.argv.includes('--debug')) {
    await sleep(6000)
    console.log(`[debug] url=${page.url()}`)
    const info = await page.evaluate(() => ({
      title: document.title,
      ready: document.readyState,
      dash: !!document.querySelector('[data-dash-action="new"]'),
      authOpen: !document.getElementById('auth-overlay')?.classList.contains('is-hidden'),
      dashHidden: document.getElementById('screen-dashboard')?.className,
      wsHidden: document.getElementById('screen-workspace')?.className,
      body: document.body.innerText.slice(0, 400)
    }))
    console.log('[debug] ' + JSON.stringify(info, null, 2))
    await page.screenshot({ path: path.join(OUT_DIR, 'costs-debug.png') })
    console.log(`[debug] screenshot -> ${path.join(OUT_DIR, 'costs-debug.png')}`)
    process.exit(0)
  }

  // 1. Dashboard → «+ Nuevo proyecto» (pide sesión).
  step('esperar dashboard')
  await page.waitForSelector('[data-dash-action="new"]', { timeout: 20000 })
  step('click nuevo proyecto')
  await page.click('[data-dash-action="new"]')

  // 2. Modal de sesión → registro local (solo si no hay sesión persistida).
  step('esperar auth o diálogo de proyecto')
  const authWait = page
    .waitForSelector('[data-auth-switch="signup"]', { timeout: 15000 })
    .then(() => 'auth')
    .catch(() => null)
  const dialogWait = page
    .waitForSelector('[data-dialog-submit]', { timeout: 15000 })
    .then(() => 'dialog')
    .catch(() => null)
  const entry = await Promise.race([authWait, dialogWait])
  if (entry === 'auth') {
    step('rellenar registro')
    await page.click('[data-auth-switch="signup"]')
    await page.fill('#auth-name', 'Captura Costs')
    await page.fill('#auth-email', `costs.capture.${Date.now()}@example.com`)
    await page.fill('#auth-password', 'Demo1234!')
    await page.fill('#auth-confirm', 'Demo1234!')
    step('marcar términos')
    try {
      await page.check('#auth-terms', { timeout: 8000 })
    } catch {
      step('check falló → force click')
      await page.click('#auth-terms', { force: true, timeout: 8000 })
    }
    step('submit registro')
    await page.click('[data-auth-submit]')
    // 3. Diálogo «Crear nuevo proyecto» → «Crear y abrir» (blanco + 3D).
    step('esperar diálogo crear proyecto')
    await page.waitForSelector('[data-dialog-submit]', { timeout: 15000 })
  } else {
    step('sesión ya activa → diálogo de proyecto directo')
  }
  step('confirmar proyecto')
  await page.click('[data-dialog-submit]')

  // 4. Workspace cargado.
  step('esperar workspace')
  await page.waitForSelector('[data-activity-id="costs"]', { timeout: 30000 })
  await sleep(1500)

  // 5. Menú AEC → «Casa de prueba» (siembra muros, techo, puerta, ventanas).
  step('menú AEC → casa de prueba')
  await page.click('.menu__trigger:has-text("Herramientas AEC")')
  await page.waitForSelector('[data-menu-action="aec.testHouse"]', { timeout: 5000 })
  // La siembra es síncrona y pesada con GL por software: click vía evaluate.
  await page.evaluate(() => {
    document
      .querySelector('[data-menu-action="aec.testHouse"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(6000)

  // 6. Abrir el panel de Costos y esperar partidas + cotas.
  step('abrir panel costos')
  await page.evaluate(() => {
    document
      .querySelector('[data-activity-id="costs"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForSelector('#cost-table-body tr', { timeout: 30000 })
  await sleep(1500)

  // 6b. Precios de hoy (modo simple) → los totales deben recalcular en vivo.
  // Con GL por software el renderer va lento: se rellena vía evaluate + evento
  // 'input' (dispara los mismos listeners que el typing del usuario).
  step('introducir precios')
  const filled = await page.evaluate(() => {
    const set = (id, val) => {
      const el = document.getElementById(id)
      if (!el) return false
      el.value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }
    return {
      muros: set('price-muros', '450'),
      slabs: set('price-slabs', '380'),
      roofs: set('price-roofs', '260'),
      puertas: set('price-puertas', '2500'),
      ventanas: set('price-ventanas', '1800'),
      muebles: set('price-muebles', '3500'),
      wastage: set('params-wastage', '5'),
      labour: set('params-labour', '1.35'),
      contingency: set('params-contingency', '5'),
      tax: set('params-tax', '16')
    }
  })
  console.log(`[capture] inputs rellenados: ${JSON.stringify(filled)}`)
  await sleep(600)

  const totals = await page.evaluate(() => ({
    base: document.getElementById('summary-base')?.textContent,
    total: document.getElementById('summary-total')?.textContent
  }))
  console.log(`[capture] totales en vivo: base=${totals.base} total=${totals.total}`)

  const labels = await page.$$eval('.cost-dim-label', (els) =>
    els.slice(0, 3).map((el) => ({
      text: el.textContent,
      left: el.style.left,
      top: el.style.top,
      display: el.style.display
    }))
  )
  console.log(`[capture] cotas[0..2]=${JSON.stringify(labels)}`)

  // 6c. Clic en la fila «Muros» → resaltado 3D de los muros de la fila.
  step('clic fila muros (resaltado 3D)')
  await page.evaluate(() => {
    document.querySelector('#cost-table-body tr')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(1200)
  const selected = await page.evaluate(() => {
    const status = document.querySelector('.statusbar')?.innerText ?? ''
    return status.replace(/\s+/g, ' ').slice(0, 200)
  })
  console.log(`[capture] statusbar tras clic: ${selected}`)

  const tableText = await page.$$eval('#cost-table-body tr', (rows) =>
    rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  )
  const labelCount = await page.$$eval('.cost-dim-label', (els) => els.length)
  console.log(`[capture] filas=${tableText.length} cotas=${labelCount}`)
  for (const row of tableText) console.log(`[capture]   ${row}`)

  // Tabla visible en la captura: desplazar el panel hasta «Tabla por piso».
  await page.$eval('#cost-table', (el) => el.scrollIntoView({ block: 'start' }))
  await sleep(400)

  const file = path.join(OUT_DIR, 'costs-panel.png')
  await page.screenshot({ path: file })
  console.log(`[capture] costs-panel -> ${file}`)

  // Extra: primeras filas con detalle, por si se quiere revisar la tabla.
  const summary = await page.$eval('.cost-panel__summary', (el) => el.innerText.replace(/\n/g, ' | ')).catch(() => '')
  console.log(`[capture] resumen: ${summary}`)
} finally {
  await app.close()
}
