import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const OUT_DIR = path.join(REPO, 'scripts', 'captures')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Espera activa evaluando JS en el renderer (retorna el valor truthy). */
async function waitEval(win, fnSource, { timeout = 60000, every = 1200, what = 'condición' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    try {
      last = await win.webContents.executeJavaScript(fnSource)
      if (last) return last
    } catch (error) {
      last = `ERR ${String(error).slice(0, 120)}`
      await sleep(every)
      continue
    }
    await sleep(every)
  }
  throw new Error(`Timeout esperando ${what} (último: ${JSON.stringify(String(last).slice(0, 200))})`)
}

/** Abre la app compilada y devuelve la ventana lista en el workspace. */
export async function abrirWorkspace(win) {
  const step = (name) => console.log(`[love] ${new Date().toISOString()} ${name}`)
  // Offline: bloquea la nube de Supabase para que AuthService use la base
  // local SQLite (el registro por red está limitado por rate-limit).
  await win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['https://*.supabase.co/*'] },
    (details, callback) => callback({ cancel: true })
  )
  await win.loadFile(path.join(REPO, 'out', 'renderer', 'index.html'))
  step('dashboard → nuevo proyecto')
  await waitEval(win, `!!document.querySelector('[data-dash-action="new"]')`, {
    what: 'botón «Nuevo proyecto»'
  })
  await win.webContents.executeJavaScript(
    `document.querySelector('[data-dash-action="new"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`
  )
  let entry = null
  {
    const deadline = Date.now() + 45000
    while (!entry && Date.now() < deadline) {
      entry = await win.webContents.executeJavaScript(`(() => ({
        auth: !!document.querySelector('[data-auth-switch="signup"]'),
        dialog: !!document.querySelector('[data-project-name]'),
        dash: !!document.querySelector('[data-dash-action="new"]')
      }))()`)
      if (!entry.auth && !entry.dialog && !entry.dash) entry = null
      else break
      await sleep(800)
    }
  }
  if (!entry) throw new Error('No apareció ni auth ni diálogo de proyecto')
  // Sesión local persistida de un intento anterior: el dashboard abre directo.
  if (!entry.auth && !entry.dialog && entry.dash) {
    step('sesión persistida: dashboard directo')
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-dash-action="new"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`
    )
    await waitEval(win, `!!document.querySelector('[data-project-name]')`, {
      timeout: 20000, what: 'diálogo «Crear proyecto»'
    })
    entry = { ...entry, dialog: true }
  }
  if (entry.auth) {
    step('registro local demo (teclado real)')
    await win.webContents.executeJavaScript(`(() => {
      document.querySelector('[data-auth-switch="signup"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })()`)
    await sleep(1200)
    const emailUnico = `amoroso-${Date.now().toString(36)}@local.test`
    // Tecleo real: genera keydown/keypress/input de confianza para React.
    for (const [name, value] of [['name', 'Tester Amoroso'], ['email', emailUnico], ['password', 'demo1234'], ['confirm', 'demo1234']]) {
      await win.webContents.executeJavaScript(`(() => {
        document.querySelector('.auth__form input[name="${name}"]')?.focus()
      })()`)
      await sleep(250)
      for (const ch of value) {
        win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
        await sleep(15)
      }
      await sleep(200)
    }
    // Marca términos con clic real (el estado vive en React) y envía el form.
    await win.webContents.executeJavaScript(`(() => {
      const terms = document.querySelector('.auth__form input[name="terms"]')
      if (terms && !terms.checked) terms.click()
    })()`)
    await sleep(400)
    for (let intento = 0; intento < 4; intento++) {
      if (intento > 0) await sleep(70000) // rate-limit: espera 70 s entre intentos
      await win.webContents.executeJavaScript(`(() => {
        document.querySelector('.auth__form')?.requestSubmit()
      })()`)
      await sleep(6000)
      const diagAuth = await win.webContents.executeJavaScript(`(() => {
        const msg = document.querySelector('[data-auth-message]')?.textContent ?? ''
        const terms = document.querySelector('.auth__form input[name="terms"]')
        const errs = [...document.querySelectorAll('.auth-field__error')].map(e => (e.textContent ?? '').trim()).filter(Boolean)
        return {
          msg: msg.slice(0, 200),
          dialog: !!document.querySelector('[data-project-name]'),
          dash: !!document.querySelector('[data-dash-action="new"]'),
          authAbierto: !!document.querySelector('.auth__form'),
          terms: terms ? terms.checked : null,
          errs
        }
      })()`)
      console.log(`[love:diag-auth intento ${intento}] ${JSON.stringify(diagAuth)}`)
      if (diagAuth.dialog) break
      // Si ya estamos en el dashboard pero sin diálogo, reabre «Nuevo proyecto».
      if (!diagAuth.authAbierto && diagAuth.dash) {
        await win.webContents.executeJavaScript(
          `document.querySelector('[data-dash-action="new"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`
        )
        await sleep(2500)
        const retry = await win.webContents.executeJavaScript(
          `!!document.querySelector('[data-project-name]')`
        )
        if (retry) break
      }
    }
    await waitEval(win, `!!document.querySelector('[data-project-name]')`, {
      timeout: 20000, what: 'diálogo «Crear proyecto»'
    })
  }
  step('crear proyecto de prueba')
  await waitEval(win, `!!document.querySelector('[data-project-name]')`, {
    timeout: 20000, what: 'diálogo «Nuevo proyecto»'
  })
  await win.webContents.executeJavaScript(`(() => {
    const name = document.querySelector('[data-project-name]')
    if (name) { name.focus(); name.value = 'Modo amoroso'; name.dispatchEvent(new Event('input', { bubbles: true })) }
    document.querySelector('[data-dialog-submit]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })()`)
  await waitEval(win, `!!document.querySelector('#chat-input')`, {
    timeout: 60000, what: 'workspace con #chat-input'
  })
  step('workspace listo; chat visible')
}

/** Envía un mensaje al chat y captura la respuesta en PNG (encuadre del chat). */
export async function sendChat(win, text, shotName) {
  const COUNT_MSGS = `document.querySelectorAll('#chat-messages > *').length`
  const before = await win.webContents.executeJavaScript(COUNT_MSGS)
  const SEND_PREFIX = `(() => {
    const input = document.querySelector('#chat-input')
    if (!input) return 'sin-input'
    input.value = `
  const SEND_SUFFIX = `
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('#chat-send')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return 'enviado'
  })()`
  await win.webContents.executeJavaScript(SEND_PREFIX + JSON.stringify(text) + SEND_SUFFIX)
  await waitEval(
    win,
    COUNT_MSGS + ' > ' + before + ` ? document.querySelector('#chat-messages').innerText.slice(-400) : ''`,
    { timeout: 45000, what: 'respuesta a ' + JSON.stringify(text) }
  )
  await sleep(2000)
  const TAIL_EXPR = `document.querySelector('#chat-messages').innerText.replace(/\\s+/g, ' ').slice(-260)`
  const tail = await win.webContents.executeJavaScript(TAIL_EXPR)
  console.log(`[love] respuesta «${text}»: …${tail}`)
  const APPLY_EXPR = `(() => {
    const btn = document.querySelector('.chat-preview__apply:not([disabled])')
    if (!btn) return 'sin-boton'
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return 'aplicado'
  })()`
  const applied = await win.webContents.executeJavaScript(APPLY_EXPR)
  if (applied === 'aplicado') await sleep(2000)
  const RECT_EXPR = `(() => {
    const el = document.querySelector('#chat-panel')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height) }
  })()`
  const rect = await win.webContents.executeJavaScript(RECT_EXPR)
  const img = rect && rect.width > 120
    ? await win.webContents.capturePage(rect)
    : await win.webContents.capturePage()
  await writeFile(path.join(OUT_DIR, shotName), img.toPNG())
  console.log(`[love] ${shotName} (${applied})`)
  return tail
}
