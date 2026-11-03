/** Exportación de la cotización: CSV y PDF imprimible (puro; el DOM solo
 * dispara la impresión en `Panel.ts`). No depende de librerías externas.
 */
import { CostRow, CostRowsResult } from './rows'
import { categoryLabel } from './rows'

export const ESTIMATE_DISCLAIMER =
  'Estimación aproximada, no sustituye a un presupuesto de obra.'

/** Escapa un valor para CSV (comillas dobles). */
function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV por piso y categoría, con total general. Separador `;` (Excel ES). */
export function toCsv(result: CostRowsResult, currencySymbol: string): string {
  const header = ['Piso', 'Categoría', 'Cantidad', 'Unidad', 'Precio unitario', 'Subtotal']
  const lines: string[] = [header.map(csvCell).join(';')]
  for (const row of result.rows) {
    lines.push(
      [row.levelName, categoryLabel(row.category), row.qty, row.unit, row.unitPrice, row.subtotal]
        .map(csvCell)
        .join(';')
    )
  }
  const money = (n: number): string => `${currencySymbol}${round2(n)}`
  lines.push('')
  lines.push([csvCell('Subtotal'), money(result.subtotal)].join(';'))
  lines.push([csvCell('Total'), money(result.total)].join(';'))
  return lines.join('\n')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** HTML de la «Cotización» imprimible: tabla, totales, fecha y aviso. */
export function toPrintableHtml(
  result: CostRowsResult,
  currencySymbol: string,
  date: string,
  title = 'Cotización'
): string {
  const money = (n: number): string => `${currencySymbol}${round2(n)}`
  const rowsHtml = result.rows
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.levelName)}</td>
      <td>${escapeHtml(categoryLabel(row.category))}</td>
      <td>${row.qty}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${money(row.unitPrice)}</td>
      <td>${money(row.subtotal)}</td>
    </tr>`
    )
    .join('\n')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f2f5; }
  td:nth-child(3), td:nth-child(5), td:nth-child(6) { text-align: right; }
  tfoot td { font-weight: 700; }
  .disclaimer { margin-top: 20px; font-size: 11px; color: #a33; font-style: italic; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Fecha: ${escapeHtml(date)}</div>
  <table>
    <thead><tr><th>Piso</th><th>Categoría</th><th>Cantidad</th><th>Unidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="6">Sin partidas.</td></tr>'}</tbody>
    <tfoot>
      <tr><td colspan="5">Subtotal</td><td>${money(result.subtotal)}</td></tr>
      <tr><td colspan="5">Total</td><td>${money(result.total)}</td></tr>
    </tfoot>
  </table>
  <p class="disclaimer">${escapeHtml(ESTIMATE_DISCLAIMER)}</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
