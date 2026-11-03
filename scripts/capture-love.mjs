/**
 * Capturas del Modo Amoroso (emojis, stickers, lluvia de corazones).
 * Uso: 1) npm run build  2) xvfb-run -a node scripts/capture-love.mjs
 * Envía /hola, /crea casa 10x8, /te amo, /casa 0x0 (error) y hola sin barra,
 * y guarda scripts/captures/love-*.png con encuadre del chat.
 */
import { app, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { abrirWorkspace, sendChat, OUT_DIR } from './capture-love-run.mjs'

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-dev-shm-usage')

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { sandbox: false }
  })
  try {
    await abrirWorkspace(win)
    await sendChat(win, '/hola', 'love-01-hola.png')
    await sendChat(win, '/crea una casa de 10 por 8', 'love-02-casa.png')
    await sendChat(win, '/te amo', 'love-03-te-amo.png')
    await sendChat(win, '/crea una casa de 0 por 0', 'love-04-error.png')
    await sendChat(win, 'hola', 'love-05-profesional.png')
    const dom = await win.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('#chat-messages')
      const html = root ? root.innerHTML : ''
      return {
        burbujas: root?.children.length ?? 0,
        stickers: (html.match(/chat-sticker/g) ?? []).length,
        lluvia: !!root?.querySelector('.chat-heart-rain'),
        fraseTeAmo: root?.innerText.includes('Yo te amo aún más, mi vida') ?? false
      }
    })()`)
    console.log(`[love] DOM chat: ${JSON.stringify(dom)}`)
    console.log('[love] capturas listas en scripts/captures/love-*.png')
  } finally {
    app.quit()
  }
}

app.whenReady().then(main).catch((error) => {
  console.error('[love:fail]', error)
  process.exitCode = 1
})

