import {
  buildBillOfMaterials,
  detectCircuits,
  diagnose,
  summarizeLoads,
  type CircuitReport,
  type DiagnosticIssue
} from './electricalAnalysis'
import { routeBetween, polylineLength, elbowCount } from './electricalRouting'
import type { ElectricalModel } from './ElectricalModel'
import type { SceneManager } from '../engine/SceneManager'

export class ElectricalDiagnosticModal {
  private overlay: HTMLElement | null = null

  constructor(
    private readonly model: ElectricalModel,
    private readonly scene: SceneManager
  ) {}

  public open(): void {
    if (this.overlay) this.close()

    const devices = this.model.getDevices()
    const wires = this.model.getWires()

    const ctx = {
      levelElevation: (lvlId: string) => this.scene.getLevel(lvlId)?.elevation ?? 0,
      levelHeight: (lvlId: string) => this.scene.getLevel(lvlId)?.height ?? 2.8
    }

    const devMap = new Map(devices.map((d) => [d.id, d]))
    const routeStats = new Map<string, { length: number; elbows: number }>()

    for (const wire of wires) {
      const a = devMap.get(wire.from)
      const b = devMap.get(wire.to)
      if (!a || !b) continue
      const pts = routeBetween(a, b, ctx)
      const len = polylineLength(pts)
      const elb = elbowCount(pts)
      routeStats.set(wire.id, { length: Math.round(len * 100) / 100, elbows: elb })
    }

    const wireLengths = new Map<string, number>()
    for (const [wid, s] of routeStats) wireLengths.set(wid, s.length)

    const circuits = detectCircuits(devices, wires, wireLengths)
    const issues = diagnose(devices, wires, circuits)
    const loadSummary = summarizeLoads(devices, circuits)
    const bom = buildBillOfMaterials(devices, wires, routeStats, circuits)

    this.renderModal(issues, circuits, loadSummary, bom)
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.remove()
      this.overlay = null
    }
  }

  private renderModal(
    issues: DiagnosticIssue[],
    circuits: CircuitReport[],
    load: ReturnType<typeof summarizeLoads>,
    bom: ReturnType<typeof buildBillOfMaterials>
  ): void {
    const overlay = document.createElement('div')
    overlay.className = 'elec-modal-overlay'
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px); z-index: 9999; display: flex;
      align-items: center; justify-content: center; padding: 20px;
    `

    const errorsCount = issues.filter((i) => i.severity === 'error').length
    const warningsCount = issues.filter((i) => i.severity === 'warning').length

    overlay.innerHTML = `
      <div class="elec-modal-window" style="
        background: #1e293b; color: #f8fafc; width: 920px; max-width: 95vw;
        max-height: 88vh; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex; flex-direction: column; overflow: hidden; border: 1px solid #334155;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <header style="
          padding: 18px 24px; border-bottom: 1px solid #334155; display: flex;
          align-items: center; justify-content: space-between; background: #0f172a;
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">⚡</span>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #f1f5f9;">
                Inspección, Cuadro de Cargas y Metraje MEP
              </h2>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                Verificación normativa según estándar residencial NEC / CNE
              </div>
            </div>
          </div>
          <button type="button" class="elec-modal-close-btn" style="
            background: none; border: none; color: #94a3b8; font-size: 24px;
            cursor: pointer; padding: 4px 8px; border-radius: 4px; line-height: 1;
          ">&times;</button>
        </header>

        <div style="
          display: flex; border-bottom: 1px solid #334155; background: #1e293b;
          padding: 0 16px;
        ">
          <button type="button" class="elec-tab-btn is-active" data-tab="tab-checklist" style="
            padding: 12px 18px; border: none; background: none; color: #38bdf8;
            font-weight: 600; font-size: 13px; cursor: pointer; border-bottom: 2px solid #38bdf8;
          ">
            1. Diagnóstico y Checklist
            ${errorsCount > 0 ? `<span style="background:#ef4444;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:6px;">${errorsCount}</span>` : ''}
            ${warningsCount > 0 ? `<span style="background:#f59e0b;color:#000;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:4px;">${warningsCount}</span>` : ''}
          </button>
          <button type="button" class="elec-tab-btn" data-tab="tab-loads" style="
            padding: 12px 18px; border: none; background: none; color: #94a3b8;
            font-weight: 600; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent;
          ">
            2. Cuadro de Cargas y Breakers (${circuits.length} Ctos)
          </button>
          <button type="button" class="elec-tab-btn" data-tab="tab-bom" style="
            padding: 12px 18px; border: none; background: none; color: #94a3b8;
            font-weight: 600; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent;
          ">
            3. Presupuesto y Metraje Real 3D
          </button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 20px;">
          <!-- PESTAÑA 1: DIAGNÓSTICO -->
          <div class="elec-tab-content" id="tab-checklist">
            <div style="display: flex; gap: 14px; margin-bottom: 18px;">
              <div style="flex: 1; background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Potencia Total</div>
                <div style="font-size: 22px; font-weight: 700; color: #38bdf8; margin-top: 4px;">${load.totalWatts} W</div>
              </div>
              <div style="flex: 1; background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Corriente a 240V / 120V</div>
                <div style="font-size: 22px; font-weight: 700; color: #f59e0b; margin-top: 4px;">
                  ${load.ampsAt240.toFixed(1)} A <span style="font-size:12px;color:#94a3b8;">(240V)</span>
                </div>
              </div>
              <div style="flex: 1; background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Breaker Principal Sugerido</div>
                <div style="font-size: 22px; font-weight: 700; color: #22c55e; margin-top: 4px;">2x${load.mainBreaker}A</div>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${issues
                .map((issue) => {
                  const border =
                    issue.severity === 'error'
                      ? '#ef4444'
                      : issue.severity === 'warning'
                      ? '#f59e0b'
                      : issue.severity === 'ok'
                      ? '#22c55e'
                      : '#3b82f6'
                  const bg =
                    issue.severity === 'error'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : issue.severity === 'warning'
                      ? 'rgba(245, 158, 11, 0.12)'
                      : issue.severity === 'ok'
                      ? 'rgba(34, 197, 94, 0.12)'
                      : 'rgba(59, 130, 246, 0.12)'
                  const icon =
                    issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : issue.severity === 'ok' ? '✅' : 'ℹ️'
                  return `
                    <div style="background: ${bg}; border-left: 4px solid ${border}; border-radius: 4px; padding: 12px 16px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${icon}</span>
                        <strong style="color: #f8fafc; font-size: 14px;">${issue.title}</strong>
                      </div>
                      <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px; line-height: 1.5;">
                        ${issue.detail}
                      </div>
                    </div>
                  `
                })
                .join('')}
            </div>
          </div>

          <!-- PESTAÑA 2: CUADRO DE CARGAS -->
          <div class="elec-tab-content" id="tab-loads" style="display: none;">
            ${
              circuits.length === 0
                ? '<div style="color: #94a3b8; text-align: center; padding: 40px 0;">No se han trazado circuitos desde el Centro de Carga. Usa la herramienta de cableado [E] para conectar el Tablero con los elementos.</div>'
                : `
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                  <thead>
                    <tr style="background: #0f172a; border-bottom: 2px solid #334155; color: #94a3b8;">
                      <th style="padding: 10px 12px;">Circuito</th>
                      <th style="padding: 10px 12px;">Tipo / Carga</th>
                      <th style="padding: 10px 12px;">Focos</th>
                      <th style="padding: 10px 12px;">Tomas</th>
                      <th style="padding: 10px 12px;">Potencia (W)</th>
                      <th style="padding: 10px 12px;">Corriente (A)</th>
                      <th style="padding: 10px 12px;">Breaker</th>
                      <th style="padding: 10px 12px;">Calibre</th>
                      <th style="padding: 10px 12px;">Carga %</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${circuits
                      .map(
                        (c) => `
                      <tr style="border-bottom: 1px solid #334155; background: ${c.overloaded ? 'rgba(239,68,68,0.1)' : 'transparent'};">
                        <td style="padding: 10px 12px; font-weight: 600; color: #38bdf8;">${c.id}</td>
                        <td style="padding: 10px 12px;">${c.name}</td>
                        <td style="padding: 10px 12px;">${c.lights}</td>
                        <td style="padding: 10px 12px;">${c.outlets + c.outlets240}</td>
                        <td style="padding: 10px 12px; font-weight: 600;">${c.watts} W</td>
                        <td style="padding: 10px 12px;">${c.amps.toFixed(1)} A</td>
                        <td style="padding: 10px 12px; font-weight: 700; color: #22c55e;">${c.breakerLabel}</td>
                        <td style="padding: 10px 12px;">${c.awg} AWG</td>
                        <td style="padding: 10px 12px;">
                          <div style="display: flex; align-items: center; gap: 6px;">
                            <span>${c.loadPercent.toFixed(0)}%</span>
                            <div style="width: 50px; height: 6px; background: #334155; border-radius: 3px; overflow: hidden;">
                              <div style="width: ${Math.min(100, c.loadPercent)}%; height: 100%; background: ${c.overloaded ? '#ef4444' : '#38bdf8'};"></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
            }
          </div>

          <!-- PESTAÑA 3: PRESUPUESTO Y METRAJE 3D -->
          <div class="elec-tab-content" id="tab-bom" style="display: none;">
            <div style="font-size: 12px; color: #94a3b8; margin-bottom: 14px;">
              Metraje volumétrico 3D real calculado incluyendo recorridos horizontales por losa y bajadas/subidas verticales por los muros:
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: #0f172a; border-bottom: 2px solid #334155; color: #94a3b8;">
                  <th style="padding: 10px 12px;">Categoría</th>
                  <th style="padding: 10px 12px;">Material / Componente</th>
                  <th style="padding: 10px 12px; text-align: right;">Cantidad</th>
                  <th style="padding: 10px 12px; text-align: center;">Unidad</th>
                </tr>
              </thead>
              <tbody>
                ${bom
                  .map(
                    (item) => `
                  <tr style="border-bottom: 1px solid #334155;">
                    <td style="padding: 10px 12px; color: #38bdf8; font-weight: 600;">${item.group}</td>
                    <td style="padding: 10px 12px; color: #f1f5f9;">${item.item}</td>
                    <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #f59e0b;">
                      ${item.unit === 'm' ? item.qty.toFixed(2) : item.qty}
                    </td>
                    <td style="padding: 10px 12px; text-align: center; color: #94a3b8;">${item.unit}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <footer style="
          padding: 14px 24px; border-top: 1px solid #334155; background: #0f172a;
          display: flex; justify-content: flex-end; gap: 10px;
        ">
          <button type="button" class="elec-modal-ok-btn" style="
            background: #0284c7; color: #ffffff; border: none; padding: 8px 18px;
            border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;
          ">
            Aceptar y Cerrar
          </button>
        </footer>
      </div>
    `

    document.body.appendChild(overlay)
    this.overlay = overlay

    overlay.querySelector('.elec-modal-close-btn')?.addEventListener('click', () => this.close())
    overlay.querySelector('.elec-modal-ok-btn')?.addEventListener('click', () => this.close())
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close()
    })

    const tabs = overlay.querySelectorAll<HTMLButtonElement>('.elec-tab-btn')
    const contents = overlay.querySelectorAll<HTMLElement>('.elec-tab-content')

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.tab
        tabs.forEach((t) => {
          const isActive = t === tab
          t.style.color = isActive ? '#38bdf8' : '#94a3b8'
          t.style.borderBottomColor = isActive ? '#38bdf8' : 'transparent'
        })
        contents.forEach((c) => {
          c.style.display = c.id === targetId ? 'block' : 'none'
        })
      })
    })
  }
}

