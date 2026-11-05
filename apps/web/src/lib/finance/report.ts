// Reportes exportables de Finanzas (docs/PLAN_CONTROL_FINANCIERO.md, Fase 6).
//
// Un ReportDoc describe el reporte una sola vez y sale igual en Excel (una
// hoja por sección) y en PDF (ventana imprimible: "Guardar como PDF"). Los
// valores de dinero van en CENTAVOS; aquí se pasan a pesos.

export type CellKind = 'text' | 'money' | 'pct' | 'number'
export type Cell = string | number | null

export interface ReportColumn {
  header: string
  kind?: CellKind
}

export interface ReportSection {
  title: string
  columns: ReportColumn[]
  rows: Cell[][]
  /** Fila de total, en negrilla. */
  totals?: Cell[]
  /** Filas después del total (ej. promedio por mes), sin negrilla. */
  afterTotals?: Cell[][]
  note?: string
}

export interface ReportDoc {
  title: string
  subtitle: string
  /** Nombre de archivo sin extensión. */
  filename: string
  sections: ReportSection[]
  /** Aclaraciones al final (fórmulas, datos estimados). */
  notes?: string[]
}

const BRAND_SUFFIX = 'Control financiero'

export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const money = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100))

export function formatCell(value: Cell, kind: CellKind = 'text'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (kind === 'money') return money(value)
  if (kind === 'pct') return `${(value * 100).toFixed(1)}%`
  if (kind === 'number') return value.toLocaleString('es-CO')
  return String(value)
}

/** HTML completo, imprimible, del reporte. Todo el texto va escapado. */
export function buildReportHtml(doc: ReportDoc, generatedAt: Date = new Date()): string {
  const sections = doc.sections
    .map((s) => {
      const head = s.columns.map((c) => `<th class="${c.kind && c.kind !== 'text' ? 'r' : ''}">${escapeHtml(c.header)}</th>`).join('')
      const row = (cells: Cell[], cls = '') =>
        `<tr class="${cls}">${s.columns
          .map((c, i) => {
            const v = cells[i] ?? null
            const neg = typeof v === 'number' && v < 0 && (c.kind === 'money' || c.kind === 'pct')
            return `<td class="${c.kind && c.kind !== 'text' ? 'r' : ''}${neg ? ' neg' : ''}">${escapeHtml(formatCell(v, c.kind))}</td>`
          })
          .join('')}</tr>`
      const body = s.rows.length ? s.rows.map((r) => row(r)).join('') : `<tr><td colspan="${s.columns.length}" class="muted">Sin datos</td></tr>`
      return `<h2>${escapeHtml(s.title)}</h2>
        <table><thead><tr>${head}</tr></thead><tbody>${body}${s.totals ? row(s.totals, 'total') : ''}${(s.afterTotals || []).map((r) => row(r, 'after')).join('')}</tbody></table>
        ${s.note ? `<p class="note">${escapeHtml(s.note)}</p>` : ''}`
    })
    .join('')
  const notes = doc.notes?.length ? `<div class="notes">${doc.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}</div>` : ''
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} — ${escapeHtml(doc.subtitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; padding: 28px; margin: 0; }
  h1 { margin: 0 0 2px; font-size: 22px; color: #1E293B; }
  .sub { margin: 0 0 14px; color: #2563EB; font-size: 14px; }
  hr { border: none; border-top: 3px solid #2563EB; margin: 0 0 16px; }
  h2 { font-size: 13px; color: #1E293B; margin: 20px 0 6px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #E2E8F0; padding: 5px 7px; text-align: left; vertical-align: top; }
  thead th { background: #1E293B; color: #fff; font-size: 10.5px; }
  tbody tr:nth-child(even) { background: #F8FAFC; }
  .r { text-align: right; white-space: nowrap; }
  .neg { color: #DC2626; }
  .total td { font-weight: bold; background: #F1F5F9; }
  .after td { color: #6B7280; }
  .muted { color: #6B7280; text-align: center; }
  .note { font-size: 10px; color: #6B7280; margin: 4px 0 0; }
  .notes { margin-top: 20px; border-top: 1px solid #E2E8F0; padding-top: 8px; font-size: 10px; color: #6B7280; }
  .notes p { margin: 2px 0; }
  .footer { margin-top: 18px; text-align: center; font-size: 9px; color: #9CA3AF; }
  .print-btn { margin-bottom: 18px; padding: 10px 22px; background: #2563EB; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
  @media print { .print-btn { display: none; } body { padding: 0; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">Imprimir / Guardar como PDF</button>
<h1>${escapeHtml(doc.title)}</h1>
<p class="sub">${escapeHtml(doc.subtitle)}</p>
<hr />
${sections}
${notes}
<div class="footer">Generado el ${escapeHtml(generatedAt.toLocaleString('es-CO', { timeZone: 'America/Bogota' }))} · ${BRAND_SUFFIX}</div>
</body></html>`
}

/** Nombre de hoja válido para Excel (≤ 31 caracteres, sin []:*?/\ y sin repetir). */
export function sheetName(title: string, used: Set<string>): string {
  const base = (title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Hoja').slice(0, 31)
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` ${i}`
    name = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(name.toLowerCase())
  return name
}

/** Valor de una celda para Excel: dinero en pesos (número), porcentaje como fracción. */
export function excelValue(value: Cell, kind: CellKind = 'text'): string | number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value
  if (kind === 'money') return Math.round(value) / 100
  return value
}

const EXCEL_FORMAT: Partial<Record<CellKind, string>> = {
  money: '"$" #,##0;[Red]-"$" #,##0',
  pct: '0.0%',
  number: '#,##0',
}

/** Arma el libro de Excel (lado navegador; exceljs se carga solo al exportar). */
export async function buildReportWorkbookBuffer(doc: ReportDoc): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = BRAND_SUFFIX
  wb.created = new Date()
  const used = new Set<string>()
  for (const s of doc.sections) {
    const ws = wb.addWorksheet(sheetName(s.title, used))
    ws.addRow([`${doc.title} — ${doc.subtitle}`]).font = { bold: true, size: 12 }
    ws.addRow([s.title]).font = { bold: true }
    ws.addRow([])
    const header = ws.addRow(s.columns.map((c) => c.header))
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    })
    const add = (cells: Cell[], bold = false) => {
      const r = ws.addRow(s.columns.map((c, i) => excelValue(cells[i] ?? null, c.kind)))
      s.columns.forEach((c, i) => {
        const fmt = c.kind ? EXCEL_FORMAT[c.kind] : undefined
        if (fmt) r.getCell(i + 1).numFmt = fmt
      })
      if (bold) r.font = { bold: true }
    }
    s.rows.forEach((r) => add(r))
    if (s.totals) add(s.totals, true)
    for (const r of s.afterTotals || []) add(r)
    if (s.note) {
      ws.addRow([])
      ws.addRow([s.note]).font = { italic: true, color: { argb: 'FF6B7280' } }
    }
    ws.columns.forEach((col, i) => {
      const c = s.columns[i]
      if (!c) return
      const longest = Math.max(c.header.length, ...s.rows.map((r) => formatCell(r[i] ?? null, c.kind).length))
      col.width = Math.min(Math.max(longest + 2, c.kind && c.kind !== 'text' ? 14 : 12), 60)
    })
  }
  if (doc.notes?.length) {
    const ws = wb.addWorksheet(sheetName('Notas', used))
    ws.addRow([`${doc.title} — ${doc.subtitle}`]).font = { bold: true, size: 12 }
    ws.addRow([])
    doc.notes.forEach((n) => ws.addRow([n]))
    ws.getColumn(1).width = 120
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function downloadReportExcel(doc: ReportDoc) {
  const buffer = await buildReportWorkbookBuffer(doc)
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Abre el reporte en una pestaña nueva lista para imprimir / guardar como PDF. */
export function openReportPrintable(doc: ReportDoc): boolean {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.write(buildReportHtml(doc))
  win.document.close()
  return true
}
