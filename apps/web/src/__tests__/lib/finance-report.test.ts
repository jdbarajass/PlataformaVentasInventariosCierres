import { describe, it, expect } from 'vitest'
import { buildReportHtml, escapeHtml, formatCell, sheetName, excelValue, buildReportWorkbookBuffer, type ReportDoc } from '@/lib/finance/report'
import { monthReport, yearReport } from '@/lib/finance/report-builders'
import { buildIncomeStatement } from '@/lib/finance/income-statement'
import { buildYearSummary } from '@/lib/finance/year-summary'

const doc: ReportDoc = {
  title: 'Tienda — Prueba',
  subtitle: 'Noviembre 2026',
  filename: 'prueba',
  sections: [
    {
      title: 'Ventas',
      columns: [{ header: 'Producto' }, { header: 'Valor', kind: 'money' }, { header: 'Margen', kind: 'pct' }],
      rows: [['<script>alert(1)</script>', 1_234_500, 0.256], ['Negativo', -50_000, null]],
      totals: ['Total', 1_184_500, null],
    },
  ],
  notes: ['Nota "importante"'],
}

describe('report', () => {
  it('escapa todo el texto (los nombres de producto son datos del usuario)', () => {
    const html = buildReportHtml(doc, new Date('2026-11-05T15:00:00Z'))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Nota &quot;importante&quot;')
    expect(escapeHtml(`a&b<'"`)).toBe('a&amp;b&lt;&#39;&quot;')
  })

  it('formatea pesos, porcentajes y vacíos; marca negativos', () => {
    expect(formatCell(1_234_500, 'money')).toMatch(/12\.345/)
    expect(formatCell(0.256, 'pct')).toBe('25.6%')
    expect(formatCell(null, 'money')).toBe('—')
    expect(buildReportHtml(doc)).toContain('class="r neg"')
  })

  it('Excel: pesos como número, nombres de hoja válidos y únicos', () => {
    expect(excelValue(1_234_550, 'money')).toBe(12_345.5)
    expect(excelValue(0.25, 'pct')).toBe(0.25)
    const used = new Set<string>()
    expect(sheetName('Gastos / salidas: [mes]', used)).toBe('Gastos salidas mes')
    expect(sheetName('Gastos / salidas: [mes]', used)).toBe('Gastos salidas mes 2')
    expect(sheetName('x'.repeat(40), used).length).toBe(31)
  })

  it('arma un .xlsx real', async () => {
    const buf = await buildReportWorkbookBuffer(doc)
    const bytes = new Uint8Array(buf as ArrayBuffer)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK') // zip
  }, 30_000) // la primera carga de exceljs puede pasar de 5 s con toda la suite corriendo
})

describe('report-builders', () => {
  const st = buildIncomeStatement({
    orders: [{ total_cents: 100_000, order_items: [{ qty: 1, price_cents: 100_000, total_cents: 100_000, cost_cents: 60_000, discount_cents: 0 }], payments: [] }],
    expenses: [{ amount_cents: 10_000, category: 'Retiro del dueño' }],
    fixed: null,
    daysInMonth: 30,
    daysElapsed: 30,
  })
  const empty = buildIncomeStatement({ orders: [], expenses: [], fixed: null, daysInMonth: 31, daysElapsed: 31 })

  it('mes: estado de resultados con comparación y "sin datos" vacío', () => {
    const r = monthReport({
      current: { year: 2026, month: 10, daysInMonth: 31, daysElapsed: 31, statement: st },
      previous: { year: 2026, month: 9, statement: st },
      lastYear: { year: 2025, month: 10, statement: empty },
      comparedSameDays: false,
    }, 'YJB')
    const rows = r.sections[0].rows
    expect(rows[0]).toEqual(['Ventas netas', 100_000, 1, 100_000, null])
    expect(rows[6][1]).toBe(40_000)
    expect(r.filename).toBe('estado_resultados_2026_10')
    expect(r.sections[2].rows[0]).toEqual(['Retiro del dueño', 'Retiro del dueño', 10_000, 'No: retiro del dueño'])
  })

  it('año: meses futuros vacíos y fila de promedio', () => {
    const y = buildYearSummary({
      fixed: null,
      previousInventory: null,
      months: [
        { month: 1, orders: [{ total_cents: 100_000, order_items: [], payments: [] }], expenses: [], purchases_cents: 0, supplier_payments_cents: 0, inventory: null, daysInMonth: 31, daysElapsed: 31 },
        { month: 2, orders: [], expenses: [], purchases_cents: 0, supplier_payments_cents: 0, inventory: null, daysInMonth: 28, daysElapsed: 0 },
      ],
    })
    const r = yearReport({ ...y, year: 2026 }, 'YJB')
    const rows = r.sections[0].rows
    expect(rows[0][1]).toBe(100_000)
    expect(rows[1].slice(1).every((c) => c === null)).toBe(true)
    expect(r.sections[0].afterTotals![0][0]).toBe('Promedio por mes')
    expect(buildReportHtml(r).indexOf('Promedio por mes')).toBeGreaterThan(buildReportHtml(r).indexOf('>Total<'))
    expect(r.sections[0].totals![1]).toBe(100_000)
  })
})
