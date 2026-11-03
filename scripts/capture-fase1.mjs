/**
 * Validación visual y funcional de la Fase 1 (aislamiento por usuario).
 *
 * Usa el main REAL compilado (`out/main/index.js`) para conservar IPC, preload
 * y SQLite, y automatiza el flujo por DOM como lo haría un usuario:
 *
 *   1) Arranque SIN sesión → solo login (sin proyectos/contadores/miniaturas).
 *   2) Registro cuenta A → lista vacía («Aún no tienes proyectos…»).
 *   3) Crear «Proyecto Fase1» con A → A lo ve.
 *   4) Cerrar sesión → vuelve el login; nada visible detrás.
 *   5) Registro cuenta B → lista vacía, sin rastro de A.
 *   6) Volver con A → su proyecto sigue ahí.
 *
 * Uso (con build hecho):
 *   xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/capture-fase1.mjs
 *
 * Solo escribe PNG en scripts/captures/ y mensajes por consola: no imprime
 * claves ni datos de .env.
 */
import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(REPO, 'scripts', 'captures')
const stamp = Date.now()
const EMAIL_A = `fase1.a.${stamp}@example.com`
const EMAIL_B = `fase1.b.${stamp}@example.com`
const PROJECT_NAME = 'Proyecto Fase1'
const PASSWORD = 'Demo1234!'

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

// La aplicación real: registra IPC (SQLite/sql.js), preload y crea su ventana.
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
  win.webContents.on('console-message', (...args) => {
    const first = args[0]
    let text = null
    if (first && typeof first === 'object' && typeof first.message === 'string') text = first.message
    else if (typeof args[2] === 'string') text = args[2]
    else if (typeof args[1] === 'string') text = args[1]
    if (text) console.log(`[page] ${text}`)
  })
  const run = (code) => win.webContents.executeJavaScript(code, true)
  const shot = async (name) => {
    await sleep(700)
    const image = await win.webContents.capturePage()
    const file = path.join(OUT_DIR, `${name}.png`)
    await writeFile(file, image.toPNG())
    console.log(`[capture] ${name} -> ${file}`)
  }
  const dashboardState = () =>
    run(`({
      authOpen: !document.getElementById('auth-overlay')?.classList.contains('is-hidden'),
      dashVisible: !document.getElementById('screen-dashboard')?.classList.contains('is-hidden'),
      wsVisible: !document.getElementById('screen-workspace')?.classList.contains('is-hidden'),
      cards: document.querySelectorAll('.proj-card:not(.proj-card--new)').length,
      cardNames: [...document.querySelectorAll('.proj-card:not(.proj-card--new) .proj-card__name')].map((el) => el.textContent),
      badge: !!document.querySelector('.dash__count-badge'),
      empty: (document.querySelector('.dash__empty')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      message: (document.querySelector('[data-auth-message]')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      content: (document.querySelector('[data-dash-content]')?.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 300)
    })`)

  /** Helpers de DOM en la página (estilo usuario real: click + input events). */
  const installHelpers = () =>
    run(`(() => {
      window.__f1 = {
        set: (id, val) => {
          const el = document.getElementById(id)
          if (!el) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
          setter.set.call(el, val)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return true
        },
        click: (sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true }
      }
      return true
    })()`)

  /**
   * Espera a que la sesión quede activa (overlay cerrado). Un mensaje en la
   * caja de aviso NO es fallo si el overlay se cierra (p. ej. el «notice» de
   * éxito del modo local): solo se toma como fallo si persiste tras un margen.
   */
  function waitForSession(label) {
    let polls = 0
    return waitFor(
      async () => {
        polls += 1
        const state = await dashboardState()
        if (!state.authOpen) return { done: true, state }
        if (state.message && polls > 14) return { done: false, state }
        return null
      },
      30000,
      label
    )
  }

  /** Registro (modo local) y espera de sesión activa o mensaje de error. */
  async function signup(fullName, email) {
    await installHelpers()
    await run(`window.__f1.click('[data-auth-switch="signup"]')`)
    await waitFor(async () => await run(`!!document.getElementById('auth-name')`), 10000, 'formulario de registro')
    await run(`window.__f1.set('auth-name', ${JSON.stringify(fullName)})`)
    await run(`window.__f1.set('auth-email', ${JSON.stringify(email)})`)
    await run(`window.__f1.set('auth-password', ${JSON.stringify(PASSWORD)})`)
    await run(`window.__f1.set('auth-confirm', ${JSON.stringify(PASSWORD)})`)
    await run(`(() => { const t = document.getElementById('auth-terms'); if (t && !t.checked) t.click(); return true })()`)
    await run(`window.__f1.click('[data-auth-submit]')`)
    return waitForSession('respuesta del registro')
  }

  /** Login con correo+contraseña y espera de sesión activa o mensaje de error. */
  async function login(email) {
    await installHelpers()
    await run(`window.__f1.set('auth-email', ${JSON.stringify(email)})`)
    await run(`window.__f1.set('auth-password', ${JSON.stringify(PASSWORD)})`)
    await run(`window.__f1.click('[data-auth-submit]')`)
    return waitForSession('respuesta del login')
  }

  /** Cerrar sesión desde la barra lateral y confirmar que aparece el login. */
  async function signOut() {
    await run(`(() => {
      const b = document.querySelector('[data-sidebar-footer] [data-dash-action="signout"]') || document.querySelector('[data-dash-action="signout"]')
      if (!b) return false
      b.click()
      return true
    })()`)
    return waitFor(
      async () => {
        const state = await dashboardState()
        return state.authOpen && state.cards === 0 ? state : null
      },
      20000,
      'cierre de sesión → pantalla de login'
    )
  }

  /* ---------------------------------------------------------------- */
  /* 1) ARRANQUE SIN SESIÓN                                            */
  /* ---------------------------------------------------------------- */

  // Termina sesiones de pasadas (SOLO claves de sesión; no borra cuentas ni
  // proyectos) y recarga para observar el arranque real sin sesión.
  await run(`(() => {
    let removed = 0
    for (const key of Object.keys(localStorage)) {
      if (key === 'arqstudio.auth.session.v1' || key.startsWith('sb-')) {
        localStorage.removeItem(key)
        removed++
      }
    }
    return removed
  })()`)
  try {
    await run(`location.reload()`)
  } catch {
    /* la navegación corta la promesa: se espera abajo */
  }
  await waitFor(async () => await run(`document.readyState`) === 'complete', 20000, 'recarga del arranque')
  await sleep(3500)

  const s1 = await dashboardState()
  assert(s1.authOpen, 'sin sesión → la pantalla de login/registro está visible')
  assert(!s1.wsVisible, 'sin sesión → el editor NO está visible')
  assert(s1.cards === 0, `sin sesión → 0 tarjetas de proyecto (hubo ${s1.cards})`)
  assert(s1.badge === false, 'sin sesión → sin contador de proyectos')
  assert(
    !/Proyecto Fase1|primera casa|Copia de|Casa Los Robles|Oficinas Centro/.test(s1.content),
    'sin sesión → ninguna referencia a proyectos en el DOM'
  )
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(500)
  const s1b = await dashboardState()
  assert(s1b.authOpen, 'sin sesión → Escape NO cierra la pantalla de login')
  await shot('fase1-01-sin-sesion')

  /* ---------------------------------------------------------------- */
  /* 2) CUENTA NUEVA (A) → LISTA VACÍA                                 */
  /* ---------------------------------------------------------------- */

  const signupA = await signup('Cuenta Fase1 A', EMAIL_A)
  assert(
    signupA.done,
    `registro A → sesión iniciada${signupA.done ? '' : ` (mensaje: «${signupA.state.message}»)`}`
  )
  if (signupA.done) {
    await sleep(1500)
    const s2 = await dashboardState()
    assert(s2.cards === 0, `cuenta nueva A → 0 proyectos (hubo ${s2.cards})`)
    assert(s2.empty.includes('Aún no tienes proyectos'), `estado vacío amable («${s2.empty}»)`)
    assert(s2.content.includes('0 proyectos guardados'), 'contador a 0 para la cuenta nueva')
    await shot('fase1-02-cuenta-a-vacia')

    /* ---------------------------------------------------------------- */
    /* 3) A CREA «Proyecto Fase1» → A LO VE                              */
    /* ---------------------------------------------------------------- */

    await run(`window.__f1.click('[data-dash-action="new"]')`)
    await waitFor(async () => await run(`!!document.querySelector('[data-dialog-submit]')`), 15000, 'diálogo de proyecto')
    await run(`(() => {
      const input = document.querySelector('[data-project-name]') || document.querySelector('[data-dialog-input]')
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        setter.set.call(input, ${JSON.stringify(PROJECT_NAME)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return !!input
    })()`)
    await run(`window.__f1.click('[data-dialog-submit]')`)
    await waitFor(
      async () => await run(`!document.getElementById('screen-workspace')?.classList.contains('is-hidden')`),
      25000,
      'apertura del editor'
    )
    await sleep(4000)
    await shot('fase1-03-proyecto-a-abierto')

    // Volver al Dashboard: menú Archivo → Dashboard.
    await run(`(() => {
      const trigger = [...document.querySelectorAll('.menu__trigger')].find((b) => b.textContent.trim() === 'Archivo')
      if (trigger) trigger.click()
      return !!trigger
    })()`)
    await waitFor(
      async () => {
        const clicked = await run(`(() => {
          const item = document.querySelector('[data-menu-action="file.dashboard"]')
          if (item && item.offsetParent !== null) { item.click(); return true }
          return false
        })()`)
        if (clicked) return true
        await run(`(() => {
          const trigger = [...document.querySelectorAll('.menu__trigger')].find((b) => b.textContent.trim() === 'Archivo')
          if (trigger) trigger.click()
          return false
        })()`)
        return null
      },
      25000,
      'menú Archivo → Dashboard'
    )
    const s3 = await waitFor(
      async () => {
        const state = await dashboardState()
        return state.cards === 1 ? state : null
      },
      20000,
      'lista de A con 1 proyecto'
    )
    assert(s3.cardNames.includes(PROJECT_NAME), `A ve su proyecto «${PROJECT_NAME}» (${JSON.stringify(s3.cardNames)})`)
    await shot('fase1-04-lista-a-1-proyecto')

    /* ---------------------------------------------------------------- */
    /* 4) CERRAR SESIÓN → LOGIN SIN NADA DETRÁS                          */
    /* ---------------------------------------------------------------- */

    const s4 = await signOut()
    assert(s4.authOpen, 'cerrar sesión → vuelve la pantalla de login')
    assert(s4.cards === 0, 'cerrar sesión → 0 tarjetas visibles')
    assert(!/Proyecto Fase1/.test(s4.content), 'cerrar sesión → sin rastro del proyecto de A en el DOM')
    await shot('fase1-05-cierre-sesion')

    /* ---------------------------------------------------------------- */
    /* 5) CUENTA B → LISTA VACÍA, SIN NADA DE A                          */
    /* ---------------------------------------------------------------- */

    const signupB = await signup('Cuenta Fase1 B', EMAIL_B)
    assert(
      signupB.done,
      `registro B → sesión iniciada${signupB.done ? '' : ` (mensaje: «${signupB.state.message}»)`}`
    )
    if (signupB.done) {
      await sleep(1500)
      const s5 = await dashboardState()
      assert(s5.cards === 0, `cuenta nueva B → 0 proyectos (hubo ${s5.cards})`)
      assert(!/Proyecto Fase1/.test(s5.content), 'B no ve NADA del proyecto de A (ni nombre ni miniatura)')
      assert(s5.empty.includes('Aún no tienes proyectos'), `B ve el estado vacío («${s5.empty}»)`)
      await shot('fase1-06-cuenta-b-vacia')

      /* ---------------------------------------------------------------- */
      /* 6) VOLVER CON A → SU PROYECTO SIGUE AHÍ                          */
      /* ---------------------------------------------------------------- */

      const s6out = await signOut()
      assert(s6out.authOpen, 'B cierra sesión → login de nuevo')
      const loginA = await login(EMAIL_A)
      assert(
        loginA.done,
        `vuelve A → sesión iniciada${loginA.done ? '' : ` (mensaje: «${loginA.state.message}»)`}`
      )
      const s7 = await waitFor(
        async () => {
          const state = await dashboardState()
          return state.cards >= 1 ? state : null
        },
        20000,
        'lista de A tras volver'
      )
      assert(s7.cardNames.includes(PROJECT_NAME), `A recupera «${PROJECT_NAME}» (${JSON.stringify(s7.cardNames)})`)
      assert(s7.cards === 1, `A ve exactamente 1 proyecto (${s7.cards})`)
      await shot('fase1-07-vuelta-a-a')
    }
  }

  /* ---------------------------------------------------------------- */
  /* RESUMEN                                                           */
  /* ---------------------------------------------------------------- */

  const summary = {
    passed: results.filter((entry) => entry.ok).length,
    failed: results.filter((entry) => !entry.ok).length,
    results
  }
  await writeFile(path.join(OUT_DIR, 'fase1-resumen.json'), JSON.stringify(summary, null, 2))
  console.log('[resumen] ' + JSON.stringify(summary, null, 2))
  console.log(failed ? 'FASE1_CAPTURAS: FALLOS' : 'FASE1_CAPTURAS: OK')

  win.destroy()
  app.quit()
}).catch((error) => {
  console.error('[capture] ERROR:', error)
  failed = true
  app.quit()
})
