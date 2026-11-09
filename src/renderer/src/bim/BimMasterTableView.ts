import { BimMasterTable } from './BimMasterTable'
import type { SceneManager } from '../engine/SceneManager'
import type { BimDiscipline, BimRow, BimTotals, ClashReport } from './types'

export interface BimMasterTableViewHandle {
  toggle: () => void
  open: () => void
  close: () => void
  isOpen: () => boolean
  refresh: () => void
  destroy: () => void
}

export function mountBimMasterTableView(
  container: HTMLElement,
  options: {
    table: BimMasterTable
    scene: SceneManager
  }
): BimMasterTableViewHandle {
  const { table, scene } = options

  let currentDiscipline: BimDiscipline | 'Todas' = 'Todas'
  let searchQuery = ''
  let isCollapsed = false
  let isMaximized = false
  let selectedRowId: string | null = null

  // Crear elemento del panel (inicia minimizado/oculto para dejar el 100% del visor 3D despejado)
  const panelEl = document.createElement('div')
  panelEl.className = 'bim-table-panel is-hidden'
  panelEl.setAttribute('id', 'bim-master-table-panel')
  container.appendChild(panelEl)

  // Botón flotante para abrir/cerrar
  const toggleBtn = document.createElement('button')
  toggleBtn.className = 'bim-table-toggle-btn'
  toggleBtn.innerHTML = `<span>📊</span><span>Tabla Maestra BIM y Costos (Live)</span>`
  toggleBtn.title = 'Abrir / Cerrar Tabla Maestra BIM, Cuantificación y Presupuesto en Vivo'
  container.appendChild(toggleBtn)

  toggleBtn.addEventListener('click', () => {
    panelEl.classList.toggle('is-hidden')
    if (!panelEl.classList.contains('is-hidden')) {
      render()
    }
  })

  function exportCSV(): void {
    const rows = table.getRows(currentDiscipline)
    const totals = table.getTotals()
    const headers = [
      'ID',
      'Disciplina',
      'Categoría',
      'Nombre',
      'Material / Especificación',
      'Altura (m)',
      'Grosor (m)',
      'Largo (m)',
      'Nivel Base',
      'Ubicación X',
      'Ubicación Z',
      'Área neta (m²)',
      'Volumen neto (m³)',
      'Descuento Auto-Clip (m³)',
      'Cuantificación Resumen',
      'Unidad',
      'Cantidad Facturable',
      'Precio Unitario ($ USD)',
      'Subtotal Costo ($ USD)'
    ]

    const csvLines = [headers.join(';')]
    for (const r of rows) {
      const line = [
        `"${r.id}"`,
        `"${r.discipline}"`,
        `"${r.category}"`,
        `"${r.name}"`,
        `"${r.material}"`,
        r.height,
        r.thickness,
        r.length,
        `"${r.baseLevel}"`,
        r.x,
        r.z,
        r.netArea,
        r.netVolume,
        r.clippedVolume,
        `"${r.materialCountSummary.replace(/"/g, '""')}"`,
        `"${r.unit}"`,
        r.billableQty,
        r.unitPrice.toFixed(2),
        r.subtotalCost.toFixed(2)
      ]
      csvLines.push(line.join(';'))
    }

    // Líneas de resumen al final
    csvLines.push('')
    csvLines.push(`"TOTAL METROS LINEALES MUROS";"${totals.wallLengthTotal.toFixed(2)} m"`)
    csvLines.push(`"TOTAL AREA CONSTRUIDA";"${totals.builtAreaTotal.toFixed(2)} m²"`)
    csvLines.push(`"TOTAL BLOQUES / LADRILLOS";"${totals.blocksCountTotal} pzs"`)
    csvLines.push(`"TOTAL CEMENTO GRIS (50kg)";"${totals.wallCementSacksTotal + totals.concreteCementSacksTotal} sacos"`)
    csvLines.push(`"TOTAL ACERO DE REFUERZO";"${totals.rebarSteelKgTotal} kg"`)
    csvLines.push(`"TOTAL TUBERIA CONDUIT";"${totals.conduitMetersTotal} m"`)
    csvLines.push(`"TOTAL ABERTURAS (PUERTAS + VENTANAS)";"${totals.openingsCountTotal} pzs"`)
    csvLines.push(`"TOTAL MOBILIARIO Y EQUIPOS";"${totals.furnitureCountTotal} pzs"`)
    csvLines.push(`"PRESUPUESTO TOTAL ESTIMADO ($ USD)";"${totals.totalBudgetCost.toFixed(2)}"`)

    // Con BOM UTF-8 para apertura directa en Microsoft Excel en español/inglés
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Presupuesto_BIM_Master_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDF(): void {
    const rows = table.getRows(currentDiscipline)
    const totals = table.getTotals()
    const dateStr = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const printWin = window.open('', '_blank', 'width=1100,height=850')
    if (!printWin) {
      alert('Por favor permite ventanas emergentes para generar el Presupuesto en PDF.')
      return
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Presupuesto Oficial de Obra y Cuantificación BIM</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 16px; font-size: 11px; }
          .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
          .report-title h1 { margin: 0 0 4px 0; font-size: 18px; color: #0f172a; }
          .report-title p { margin: 0; font-size: 11px; color: #64748b; }
          .report-meta { text-align: right; font-size: 10px; color: #475569; }
          .report-meta strong { font-size: 12px; color: #0369a1; }
          
          /* KPI Cards */
          .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
          .kpi-card.kpi-card--gold { background: #fefce8; border-color: #facc15; }
          .kpi-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
          .kpi-val { font-size: 14px; font-weight: 800; color: #0f172a; }
          .kpi-card--gold .kpi-val { color: #b45309; font-size: 16px; }

          /* Table */
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
          th { background: #0f172a; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; font-size: 9px; text-transform: uppercase; }
          th.num, td.num { text-align: right; }
          td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .badge { display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 700; }
          .badge-arq { background: #e0f2fe; color: #0369a1; }
          .badge-est { background: #fef3c7; color: #b45309; }
          .badge-ele { background: #f3e8ff; color: #7e22ce; }
          .badge-top { background: #dcfce7; color: #15803d; }
          .badge-ent { background: #fae8ff; color: #a21caf; }

          .total-box { margin-top: 15px; margin-left: auto; width: 320px; background: #f8fafc; border: 2px solid #0284c7; border-radius: 6px; padding: 10px 14px; }
          .total-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
          .total-row.grand { font-size: 15px; font-weight: 800; color: #0369a1; border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 6px; }

          .signatures { display: flex; justify-content: space-around; margin-top: 40px; page-break-inside: avoid; }
          .sig-box { text-align: center; width: 220px; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #475569; }
          .disclaimer { font-size: 8px; color: #94a3b8; text-align: center; margin-top: 25px; }

          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 15px; text-align: right;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: #fff; font-weight: 700; border: none; border-radius: 4px; cursor: pointer;">
            🖨️ Imprimir / Guardar como PDF
          </button>
        </div>

        <div class="report-header">
          <div class="report-title">
            <h1>OPEN FORM STUDIO · PRESUPUESTO MAESTRO BIM</h1>
            <p>Cómputo Métrico Cuantificado, Materiales de Obra y Costos Estimados (Live Data)</p>
          </div>
          <div class="report-meta">
            <div><strong>ESTADO: VIGENTE</strong></div>
            <div>Fecha: ${dateStr}</div>
            <div>Disciplina: ${currentDiscipline}</div>
            <div>Elementos: ${rows.length}</div>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Muros Lineales</div>
            <div class="kpi-val">${totals.wallLengthTotal.toFixed(2)} m</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Área Construida</div>
            <div class="kpi-val">${totals.builtAreaTotal.toFixed(2)} m²</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Bloques / Ladrillos</div>
            <div class="kpi-val">${totals.blocksCountTotal} pzs</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Sacos Cemento (50kg)</div>
            <div class="kpi-val">${totals.wallCementSacksTotal + totals.concreteCementSacksTotal} sacos</div>
          </div>
          <div class="kpi-card kpi-card--gold">
            <div class="kpi-label">PRESUPUESTO TOTAL ($ USD)</div>
            <div class="kpi-val">$${totals.totalBudgetCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>

        <!-- Table -->
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Disciplina</th>
              <th>Tipo</th>
              <th>Material / Especificación</th>
              <th>Nivel Base</th>
              <th class="num">Área (m²)</th>
              <th class="num">Vol. (m³)</th>
              <th>Cuantificación Obra</th>
              <th class="num">Cant. Fact.</th>
              <th class="num">Precio Unit. ($)</th>
              <th class="num">Subtotal ($ USD)</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td><code>${r.id}</code></td>
                <td><span class="badge ${r.discipline === 'Estructura' ? 'badge-est' : r.discipline === 'Eléctrica' ? 'badge-ele' : r.discipline === 'Topografía' ? 'badge-top' : r.discipline === 'Entorno' ? 'badge-ent' : 'badge-arq'}">${r.discipline}</span></td>
                <td><strong>${r.category}</strong></td>
                <td>${escapeHtml(r.material)}</td>
                <td>${escapeHtml(r.baseLevel)}</td>
                <td class="num">${r.netArea.toFixed(2)}</td>
                <td class="num">${r.netVolume.toFixed(3)}</td>
                <td style="color:#0369a1; font-weight:600;">${escapeHtml(r.materialCountSummary)}</td>
                <td class="num"><strong>${r.billableQty} ${r.unit}</strong></td>
                <td class="num">$${r.unitPrice.toFixed(2)}</td>
                <td class="num" style="font-weight:700; color:#0f172a;">$${r.subtotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <!-- Totals summary box -->
        <div class="total-box">
          <div class="total-row"><span>Total Elementos Computados:</span><span>${rows.length}</span></div>
          <div class="total-row"><span>Acero de Refuerzo:</span><span>${totals.rebarSteelKgTotal} kg</span></div>
          <div class="total-row"><span>Conduit Eléctrico:</span><span>${totals.conduitMetersTotal} m</span></div>
          <div class="total-row"><span>Aberturas (Puertas/Ventanas):</span><span>${totals.openingsCountTotal} pzs</span></div>
          <div class="total-row"><span>Mobiliario y Equipos:</span><span>${totals.furnitureCountTotal} pzs</span></div>
          <div class="total-row grand"><span>PRESUPUESTO TOTAL (USD):</span><span>$${totals.totalBudgetCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        </div>

        <div class="signatures">
          <div class="sig-box">
            <strong>Arquitecto / Proyectista BIM</strong><br />
            Responsable del Cómputo Métrico
          </div>
          <div class="sig-box">
            <strong>Director Técnico de Obra</strong><br />
            Revisión y Cuantificación
          </div>
          <div class="sig-box">
            <strong>Aprobación del Cliente</strong><br />
            Conforme con el Presupuesto
          </div>
        </div>

        <div class="disclaimer">
          Open Form Studio BIM · Documento generado automáticamente con enlace bidireccional al modelo 3D y 2D. Precios y cómputos paramétricos sujetos a condiciones de obra locales.
        </div>
      </body>
      </html>
    `

    printWin.document.open()
    printWin.document.write(htmlContent)
    printWin.document.close()
  }

  function render(): void {
    const rows = table.getRows(currentDiscipline)
    const totals = table.getTotals()
    const clashes = table.getClashes()

    const filteredRows = searchQuery.trim()
      ? rows.filter(
          (r) =>
            r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.material.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.category.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : rows

    panelEl.innerHTML = `
      <!-- Header -->
      <div class="bim-table-header" data-bim-drag>
        <div class="bim-table-header__left">
          <span class="bim-table-title">📊 TABLA MAESTRA BIM, CUANTIFICACIÓN Y COSTOS</span>
          <span class="bim-badge-live">LIVE DATA · BIDIRECCIONAL</span>
          <span style="font-size: 11px; color: #94a3b8;">${filteredRows.length} elementos</span>
        </div>
        <div class="bim-table-header__right">
          <button class="bim-btn-icon" data-action="minimize" title="Minimizar panel">${isCollapsed ? '🔼' : '🔽'}</button>
          <button class="bim-btn-icon" data-action="maximize" title="Alternar Vista Acoplada / Pantalla Completa">${isMaximized ? '🗗 Acoplar' : '🗖 Expandir'}</button>
          <button class="bim-btn-icon" data-action="close" title="Cerrar panel">✕</button>
        </div>
      </div>

      <!-- Banner de choques (si existen) -->
      ${
        clashes.length > 0
          ? `
        <div class="bim-clash-banner">
          <div>
            <strong>[ ⚠️ CHOQUE DETECTADO: ${clashes[0].wireLabel} vs ${clashes[0].structuralLabel} ]</strong>
            <span style="margin-left: 8px; font-size: 11px;">Interferencia en X=${clashes[0].clashPoint.x.toFixed(2)}, Y=${clashes[0].clashPoint.y.toFixed(2)}, Z=${clashes[0].clashPoint.z.toFixed(2)}</span>
          </div>
          <button class="bim-btn-resolve" data-resolve-clash="${clashes[0].id}">🔧 Resolver choque automáticamente</button>
        </div>
      `
          : ''
      }

      <!-- Toolbar con filtros por disciplina, búsqueda y exportaciones unificadas -->
      <div class="bim-table-toolbar">
        <div class="bim-tabs">
          ${(['Todas', 'Arquitectura', 'Estructura', 'Eléctrica', 'Topografía', 'Entorno'] as const)
            .map(
              (tab) => `
            <button class="bim-tab ${currentDiscipline === tab ? 'is-active' : ''}" data-discipline="${tab}">
              ${tab}
            </button>
          `
            )
            .join('')}
        </div>

        <div class="bim-tools-group">
          <input
            type="text"
            class="bim-search-input"
            placeholder="Buscar ID, tipo, material..."
            value="${escapeHtml(searchQuery)}"
            data-bim-search
          />
          <button class="bim-action-btn bim-action-btn--primary" data-action="auto-sanitize" title="Detectar y eliminar duplicados y líneas basura de raíz">
            🛡️ Auto-Sanitizar Escena
          </button>
          <button class="bim-action-btn" data-action="export-csv" title="Descargar planilla completa en CSV / Excel con precios y subtotales">
            📊 Exportar CSV / Excel
          </button>
          <button class="bim-action-btn bim-action-btn--pdf" data-action="export-pdf" title="Generar e imprimir presupuesto completo oficial en PDF">
            📄 Exportar Presupuesto PDF
          </button>
        </div>
      </div>

      <!-- Tarjetas de Resumen Superior (KPIs siempre visibles arriba de la tabla) -->
      <div class="bim-kpi-ribbon">
        <div class="bim-kpi-card" title="Metros lineales de muros">
          <span class="bim-kpi-label">🧱 Muros lineales</span>
          <span class="bim-kpi-val">${totals.wallLengthTotal.toFixed(2)} m</span>
        </div>
        <div class="bim-kpi-card" title="Área total construida estimada">
          <span class="bim-kpi-label">📐 Área construida</span>
          <span class="bim-kpi-val">${totals.builtAreaTotal.toFixed(2)} m²</span>
        </div>
        <div class="bim-kpi-card" title="Bloques / ladrillos totales con 5% desperdicio">
          <span class="bim-kpi-label">🧱 Bloques / Ladrillos</span>
          <span class="bim-kpi-val bim-kpi-val--highlight">${totals.blocksCountTotal} pzs</span>
        </div>
        <div class="bim-kpi-card" title="Sacos de cemento gris 50kg para muros y hormigón">
          <span class="bim-kpi-label">📦 Sacos Cemento (50kg)</span>
          <span class="bim-kpi-val bim-kpi-val--green">${totals.wallCementSacksTotal + totals.concreteCementSacksTotal} sacos</span>
        </div>
        <div class="bim-kpi-card" title="Acero de refuerzo estructural (kg)">
          <span class="bim-kpi-label">🔩 Acero refuerzo</span>
          <span class="bim-kpi-val">${totals.rebarSteelKgTotal} kg</span>
        </div>
        <div class="bim-kpi-card" title="Metros lineales de cableado y tubería conduit">
          <span class="bim-kpi-label">⚡ Cableado / Conduit</span>
          <span class="bim-kpi-val">${totals.conduitMetersTotal} m</span>
        </div>
        <div class="bim-kpi-card" title="Aberturas (Puertas y Ventanas)">
          <span class="bim-kpi-label">🚪 Aberturas (P/V)</span>
          <span class="bim-kpi-val">${totals.openingsCountTotal} u <small style="font-size:10px; color:#94a3b8;">(${totals.doorCountTotal}P/${totals.windowCountTotal}V)</small></span>
        </div>
        <div class="bim-kpi-card" title="Mobiliario y equipos (unidades)">
          <span class="bim-kpi-label">🛋️ Mobiliario / Equipos</span>
          <span class="bim-kpi-val">${totals.furnitureCountTotal} u</span>
        </div>
        <div class="bim-kpi-card bim-kpi-card--gold" title="Presupuesto total estimado sumando todas las filas con precios reales">
          <span class="bim-kpi-label">💰 PRESUPUESTO TOTAL ESTIMADO ($ USD)</span>
          <span class="bim-kpi-val bim-kpi-val--gold">$${totals.totalBudgetCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <!-- Tabla Reactiva -->
      <div class="bim-table-container">
        <table class="bim-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Disciplina</th>
              <th>Tipo</th>
              <th>Material / Especificación</th>
              <th>Altura (m)</th>
              <th>Grosor (m)</th>
              <th>Largo (m)</th>
              <th>Nivel (N.B.T)</th>
              <th>Ubicación (X, Z)</th>
              <th>Área (m²)</th>
              <th>Volumen (m³)</th>
              <th>Cantidad Material (Exacta)</th>
              <th style="background:#0369a1; color:#fff;">Precio Unitario ($)</th>
              <th style="background:#0284c7; color:#fff;">Subtotal Costo ($)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRows
              .map(
                (r) => `
              <tr class="${selectedRowId === r.id ? 'is-selected' : ''}" data-row-id="${r.id}">
                <td><code>${r.id}</code></td>
                <td>
                  <span class="bim-badge-discipline bim-badge-discipline--${r.discipline}">
                    ${r.discipline}
                  </span>
                </td>
                <td><strong>${r.category}</strong></td>
                <td>
                  <input
                    type="text"
                    class="bim-table-input"
                    style="width: 120px; text-align: left;"
                    value="${escapeHtml(r.material)}"
                    data-edit-field="material"
                    data-row-id="${r.id}"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    class="bim-table-input"
                    value="${r.height.toFixed(2)}"
                    data-edit-field="height"
                    data-row-id="${r.id}"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0.02"
                    class="bim-table-input"
                    value="${r.thickness.toFixed(2)}"
                    data-edit-field="thickness"
                    data-row-id="${r.id}"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    class="bim-table-input"
                    value="${r.length.toFixed(2)}"
                    data-edit-field="length"
                    data-row-id="${r.id}"
                  />
                </td>
                <td><small>${r.baseLevel}</small></td>
                <td>
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <span style="color:#94a3b8; font-size:10px;">X:</span>
                    <input
                      type="number"
                      step="0.1"
                      class="bim-table-input"
                      style="width: 46px;"
                      value="${r.x.toFixed(2)}"
                      data-edit-field="x"
                      data-row-id="${r.id}"
                    />
                    <span style="color:#94a3b8; font-size:10px;">Z:</span>
                    <input
                      type="number"
                      step="0.1"
                      class="bim-table-input"
                      style="width: 46px;"
                      value="${r.z.toFixed(2)}"
                      data-edit-field="z"
                      data-row-id="${r.id}"
                    />
                  </div>
                </td>
                <td><strong>${r.netArea.toFixed(2)}</strong></td>
                <td>
                  <strong>${r.netVolume.toFixed(3)}</strong>
                  ${r.clippedVolume > 0 ? `<br><small style="color:#10b981;">(Clip -${r.clippedVolume.toFixed(2)})</small>` : ''}
                </td>
                <td>
                  <span style="color: #38bdf8; font-weight: 600;">${escapeHtml(r.materialCountSummary)}</span>
                </td>
                <!-- Columna Financiera: Precio Unitario Editable -->
                <td style="background: rgba(3, 105, 161, 0.08);">
                  <div style="display: flex; align-items: center; gap: 2px;">
                    <span style="color:#38bdf8; font-weight:700; font-size:11px;">$</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      class="bim-table-input bim-price-input"
                      style="width: 70px; text-align: right; font-weight: 700; color: #facc15;"
                      value="${r.unitPrice.toFixed(2)}"
                      title="Editar precio unitario ($ USD) por ${r.unit}"
                      data-edit-price="${r.id}"
                    />
                    <small style="color:#94a3b8; font-size:9px;">/${r.unit}</small>
                  </div>
                </td>
                <!-- Columna Financiera: Subtotal Costo Automático -->
                <td style="background: rgba(2, 132, 199, 0.12); text-align: right;">
                  <strong style="color: #38bdf8; font-size: 12px;">$${r.subtotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `

    attachEventHandlers()
  }

  function attachEventHandlers(): void {
    // Pestañas de disciplina
    panelEl.querySelectorAll<HTMLButtonElement>('[data-discipline]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentDiscipline = btn.dataset.discipline as BimDiscipline | 'Todas'
        render()
      })
    })

    // Búsqueda
    const searchInput = panelEl.querySelector<HTMLInputElement>('[data-bim-search]')
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value
        render()
      })
    }

    // Doble clic en cabecera para alternar pantalla completa
    panelEl.querySelector('.bim-table-header')?.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      isMaximized = !isMaximized
      panelEl.classList.toggle('is-maximized', isMaximized)
      const maxBtn = panelEl.querySelector('[data-action="maximize"]')
      if (maxBtn) maxBtn.textContent = isMaximized ? '🗗 Acoplar' : '🗖 Expandir'
    })

    // Acciones de cabecera
    panelEl.querySelector('[data-action="minimize"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      isCollapsed = !isCollapsed
      panelEl.classList.toggle('is-collapsed', isCollapsed)
      ;(e.currentTarget as HTMLElement).textContent = isCollapsed ? '🔼' : '🔽'
    })

    panelEl.querySelector('[data-action="maximize"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      isMaximized = !isMaximized
      panelEl.classList.toggle('is-maximized', isMaximized)
      ;(e.currentTarget as HTMLElement).textContent = isMaximized ? '🗗 Acoplar' : '🗖 Expandir'
    })

    panelEl.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      panelEl.classList.add('is-hidden')
    })

    // Auto-Sanitizar
    panelEl.querySelector('[data-action="auto-sanitize"]')?.addEventListener('click', () => {
      const res = table.autoSanitize()
      alert(res.message)
      render()
    })

    // Exportar CSV
    panelEl.querySelector('[data-action="export-csv"]')?.addEventListener('click', () => {
      exportCSV()
    })

    // Exportar Presupuesto PDF
    panelEl.querySelector('[data-action="export-pdf"]')?.addEventListener('click', () => {
      exportPDF()
    })

    // Resolver choque
    panelEl.querySelectorAll<HTMLButtonElement>('[data-resolve-clash]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clashId = btn.dataset.resolveClash!
        const res = table.resolveClash(clashId)
        alert(res.message)
        render()
      })
    })

    // Selección de fila al hacer clic
    panelEl.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        // No robar foco si se está editando un input
        if ((e.target as HTMLElement).tagName === 'INPUT') return

        const rowId = tr.dataset.rowId
        if (!rowId) return
        selectedRowId = rowId

        const wall = scene.getWall(rowId)
        if (wall) {
          scene.select(wall)
        } else {
          const obj = scene.getObject(rowId)
          if (obj) scene.selectObject(obj)
        }

        panelEl.querySelectorAll('tbody tr').forEach((r) => r.classList.remove('is-selected'))
        tr.classList.add('is-selected')
      })
    })

    // Edición bidireccional de geometría en vivo
    panelEl.querySelectorAll<HTMLInputElement>('[data-edit-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const rowId = input.dataset.rowId
        const field = input.dataset.editField as 'height' | 'thickness' | 'length' | 'x' | 'z' | 'material'
        if (!rowId || !field) return

        table.updateRow(rowId, field, input.value)
      })

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur()
        }
      })
    })

    // Edición reactiva en vivo de Precio Unitario
    panelEl.querySelectorAll<HTMLInputElement>('[data-edit-price]').forEach((input) => {
      const commitPrice = (): void => {
        const rowId = input.dataset.editPrice
        if (!rowId) return
        const val = parseFloat(input.value)
        if (!isNaN(val) && val >= 0) {
          table.updateUnitPrice(rowId, val)
        }
      }

      input.addEventListener('change', commitPrice)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          commitPrice()
          input.blur()
        }
      })
    })
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  // Suscribirse a cambios en la tabla para actualizar la UI en vivo
  const unsubscribe = table.onChange(() => {
    if (!panelEl.classList.contains('is-hidden')) {
      render()
    }
  })

  // Render inicial
  render()

  return {
    toggle: () => {
      panelEl.classList.toggle('is-hidden')
      if (!panelEl.classList.contains('is-hidden')) render()
    },
    open: () => {
      panelEl.classList.remove('is-hidden')
      render()
    },
    close: () => {
      panelEl.classList.add('is-hidden')
    },
    isOpen: () => !panelEl.classList.contains('is-hidden'),
    refresh: () => render(),
    destroy: () => {
      unsubscribe()
      panelEl.remove()
      toggleBtn.remove()
    }
  }
}
