/** Panel de depuración de herramientas IA (solo desarrollo, tecla F10). */
import type { HistoryManager } from '../engine/HistoryManager'
import type { SceneManager } from '../engine/SceneManager'
import { AI_TOOLS, simulateStep, runOrder } from './tools'
import { aiSettings } from './settings'
export interface AIToolsDebugOptions {
  container: HTMLElement
  scene: SceneManager
  history: HistoryManager
  onMessage: (message: string) => void
}
export interface AIToolsDebugHandle {
  toggle(): void
  isOpen(): boolean
}
const SAMPLES: Record<string, Record<string, unknown>> = {
  crear_muro: { inicio: { x: 0, z: 0 }, fin: { x: 4, z: 0 } },
  crear_habitacion: { x: 0, z: 0, ancho: 4, largo: 3 },
  alargar_o_acortar_muro: { id: '', delta: 2 },
  mover_muro: { id: '', inicio: { x: 0, z: 0 }, fin: { x: 4, z: 0 } },
  borrar_muro: { id: '' },
  cambiar_altura_muro: { id: '', altura: 3 },
  colocar_puerta: { muro_id: '', posicion: 1 },
  colocar_ventana: { muro_id: '', posicion: 1 },
  colocar_objeto: { tipo: 'furn.sofa', x: 2, z: 2 },
  mover_objeto: { id: '', x: 3, z: 3 },
  borrar_objeto: { id: '' },
  aplicar_material: { objetivo: '', material: 'mat.brick' },
  listar_materiales: {},
  crear_techo: { tipo: 'gable', contorno: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] },
  editar_techo: { id: '' },
  crear_planta: {},
  duplicar_planta: {},
  cambiar_planta_activa: { planta: 'level-0' },
  crear_cerca: { puntos: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }] },
  colocar_porton: { x: 2, z: 6 },
  describir_escena: {},
  seleccionar: { ids: [] },
  deshacer: {},
  rehacer: {},
  generar_casa: { ancho: 8, largo: 6 }
}
export function mountAIToolsDebug(options: AIToolsDebugOptions): AIToolsDebugHandle {
  const root = document.createElement('div')
  root.id = 'ai-tools-debug'
  root.className = 'ai-debug is-hidden'
  const rows = AI_TOOLS.map((t) => `<div class="ai-debug__row" data-tool="${t.nombre}"><span class="ai-debug__name" title="${t.descripcion}">${t.nombre}</span><button class="ai-debug__btn" data-act="dry">Simular</button><button class="ai-debug__btn" data-act="run">Ejecutar</button><span class="ai-debug__out" data-out></span></div>`).join('')
  root.innerHTML = `<header class="ai-debug__head"><span>Herramientas IA (F10 · solo desarrollo)</span><button class="ai-debug__btn" data-act="close">Cerrar</button></header><div class="ai-debug__list">${rows}</div><div class="ai-debug__row ai-debug__row--gemini"><span class="ai-debug__name">Gemini</span><label class="ai-debug__toggle" title="Usa Gemini (function calling) para proponer planes. Si falla, se usa el cerebro local."><input type="checkbox" data-gemini-toggle /> Function calling</label><span class="ai-debug__gstat" data-gemini-status>comprobando…</span><button class="ai-debug__btn" data-gemini-test>Probar Gemini</button><span class="ai-debug__out" data-gemini-out></span></div>`
  options.container.appendChild(root)
  let open = false
  function setOpen(v: boolean): void {
    open = v
    root.classList.toggle('is-hidden', !v)
  }

  // —— Gemini (Fase 3): estado + prueba de conectividad vía IPC (main tiene la clave) ——
  type AiBridge = {
    status(): Promise<{ configured: boolean; model: string | null }>
    generate(p: { prompt: string }): Promise<{ ok: boolean; text?: string; error?: string; status?: number }>
  }
  const ai = (window as unknown as { arqStudio?: { ai?: AiBridge } }).arqStudio?.ai
  const gStat = root.querySelector<HTMLElement>('[data-gemini-status]')
  const gOut = root.querySelector<HTMLElement>('[data-gemini-out]')
  const gBtn = root.querySelector<HTMLButtonElement>('[data-gemini-test]')

  async function refreshGeminiStatus(): Promise<void> {
    if (!ai || !gStat) {
      if (gStat) gStat.textContent = 'puente no disponible'
      return
    }
    try {
      const s = await ai.status()
      gStat.textContent = s.configured ? `configurado · ${s.model ?? '?'}` : 'no configurado (clave vacía)'
    } catch {
      gStat.textContent = 'estado desconocido'
    }
  }
  void refreshGeminiStatus()

  // —— Bandera `ai.geminiEnabled` (Fase 3): se aplica SIN reiniciar ——
  const gToggle = root.querySelector<HTMLInputElement>('[data-gemini-toggle]')
  if (gToggle) {
    gToggle.checked = aiSettings.geminiEnabled
    gToggle.addEventListener('change', () => {
      aiSettings.geminiEnabled = gToggle.checked
      options.onMessage(`[IA-debug] Gemini function calling ${gToggle.checked ? 'ACTIVADO' : 'DESACTIVADO'} (sin reiniciar)`)
    })
  }

  if (gBtn) {
    gBtn.addEventListener('click', () => {
      if (!ai) {
        if (gOut) gOut.textContent = 'ERROR: puente Gemini no disponible'
        return
      }
      gBtn.disabled = true
      if (gOut) gOut.textContent = 'Probando…'
      const t0 = performance.now()
      ai.generate({ prompt: 'Responde solo: ok' })
        .then((res) => {
          const ms = Math.round(performance.now() - t0)
          if (res.ok) {
            const texto = (res.text ?? '').trim()
            if (gOut) gOut.textContent = `✅ ok (${ms} ms): "${texto}"`
            options.onMessage(`[IA-debug] Gemini ok en ${ms} ms`)
          } else {
            const code = res.status ? `HTTP ${res.status} · ` : ''
            if (gOut) gOut.textContent = `⚠️ ${code}error (${ms} ms): ${res.error ?? 'desconocido'}`
            options.onMessage(`[IA-debug] Gemini ${code}error en ${ms} ms`)
          }
        })
        .catch((e) => {
          const ms = Math.round(performance.now() - t0)
          if (gOut) gOut.textContent = `⚠️ error (${ms} ms): ${(e as Error).message}`
        })
        .finally(() => {
          gBtn.disabled = false
        })
    })
  }
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null
    if (!btn) return
    const act = btn.dataset.act ?? ''
    if (act === 'close') {
      setOpen(false)
      return
    }
    const row = btn.closest('[data-tool]') as HTMLElement | null
    const name = row?.dataset.tool ?? ''
    if (!name) return
    const out = row?.querySelector('[data-out]') as HTMLElement | null
    const params: Record<string, unknown> = JSON.parse(JSON.stringify(SAMPLES[name] ?? {}))
    if (act === 'dry') {
      const r = simulateStep(options.scene, options.history, name, params)
      const txt = r.valido ? `SIM: ${r.resumen}` : `ERROR: ${r.error ?? 'inválido'}`
      if (out) out.textContent = txt
      options.onMessage(`[IA-debug] ${name}: ${txt}`)
    } else {
      const r = runOrder(options.scene, options.history, `IA-debug: ${name}`, [{ herramienta: name, parametros: params }])
      const txt = r.ok ? `OK: ${r.mensaje}` : `ERROR: ${r.mensaje}`
      if (out) out.textContent = txt
      options.onMessage(`[IA-debug] ${name}: ${txt}`)
    }
  })
  return { toggle(): void { setOpen(!open) }, isOpen(): boolean { return open } }
}
