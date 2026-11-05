// Arma el ReportDoc de cada pestaña de Finanzas (Fase 6). Funciones puras:
// reciben los mismos datos que ya muestra la pantalla, no recalculan nada.

import type { ReportDoc, ReportSection, Cell } from './report'
import type { IncomeStatement } from './income-statement'
import type { YearSummary } from './year-summary'
import type { InventoryInsights, ProductInsight } from './inventory-insights'
import type { CashFlow, Payables, Receivables } from './cash-flow'
import { FLOW_CONCEPT_LABEL } from './cash-flow'
import { EXPENSE_CLASS_LABEL } from './expense-classes'
import { MONTH_NAMES } from './format'

const mm = (y: number, m: number) => `${MONTH_NAMES[m - 1]} ${y}`
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`)

// ---------- Mes ----------

export interface MonthReportInput {
  current: { year: number; month: number; daysInMonth: number; daysElapsed: number; statement: IncomeStatement }
  previous: { year: number; month: number; statement: IncomeStatement }
  lastYear: { year: number; month: number; statement: IncomeStatement }
  comparedSameDays: boolean
}

export function monthReport(d: MonthReportInput, brand: string): ReportDoc {
  const s = d.current.statement
  const p = d.previous.statement
  const l = d.lastYear.statement
  const cmp = (x: IncomeStatement, v: number): Cell => (x.hasData ? v : null)
  const line = (label: string, pick: (x: IncomeStatement) => number): Cell[] => [
    label,
    pick(s),
    s.netSales ? pick(s) / s.netSales : null,
    cmp(p, pick(p)),
    cmp(l, pick(l)),
  ]
  const statement: ReportSection = {
    title: 'Estado de resultados',
    columns: [
      { header: 'Concepto' },
      { header: mm(d.current.year, d.current.month), kind: 'money' },
      { header: '% de ventas', kind: 'pct' },
      { header: mm(d.previous.year, d.previous.month), kind: 'money' },
      { header: mm(d.lastYear.year, d.lastYear.month), kind: 'money' },
    ],
    rows: [
      line('Ventas netas', (x) => x.netSales),
      line('(−) Costo de lo vendido', (x) => x.costOfSales),
      line('= Utilidad bruta', (x) => x.grossProfit),
      line('(−) Gastos operativos', (x) => x.operatingExpenses),
      line('= Utilidad operacional', (x) => x.operatingProfit),
      line('(−) Gastos financieros', (x) => x.financialExpenses),
      line('= Utilidad neta (antes de impuestos)', (x) => x.netProfit),
    ],
    note: d.comparedSameDays ? `Mes en curso: las columnas de comparación son solo los mismos ${d.current.daysElapsed} primeros días.` : undefined,
  }
  const indicators: ReportSection = {
    title: 'Indicadores',
    columns: [{ header: 'Indicador' }, { header: 'Valor' }, { header: 'Fórmula' }],
    rows: [
      ['Transacciones', String(s.transactions), 'Órdenes pagadas'],
      ['Unidades vendidas', String(s.units), ''],
      ['Ticket promedio', s.averageTicket === null ? '—' : fmtMoney(s.averageTicket), 'Ventas netas ÷ transacciones'],
      ['Margen bruto', pct(s.grossMargin), 'Utilidad bruta ÷ ventas netas'],
      ['Markup', pct(s.markup), 'Utilidad bruta ÷ costo de lo vendido'],
      ['Margen neto', pct(s.netMargin), 'Utilidad neta ÷ ventas netas'],
      ['Gastos / ventas', pct(s.expensesToSales), '(Gastos operativos + financieros) ÷ ventas netas'],
      ['Nómina / ventas', pct(s.payrollToSales), 'Sueldos ÷ ventas netas'],
      ['Precio de lista', fmtMoney(s.grossSales), 'Cantidad × precio, antes de descuentos'],
      ['Descuentos dados', fmtMoney(s.discounts), ''],
      ['Comisiones de medios de pago', fmtMoney(s.commissions), 'No restan: se cobran al cliente'],
      ['Retiros del dueño', fmtMoney(s.ownerWithdrawals), 'Salen de las cuentas; no son gasto'],
      ['Inversiones', fmtMoney(s.investments), 'Salen de las cuentas; no restan la utilidad del mes'],
      ['Ventas sin costo', s.itemsWithoutCost.lines ? `${s.itemsWithoutCost.lines} líneas (${fmtMoney(s.itemsWithoutCost.sales_cents)})` : 'Ninguna', 'Inflan la utilidad'],
    ],
  }
  const expenses: ReportSection = {
    title: 'Gastos y salidas',
    columns: [{ header: 'Categoría' }, { header: 'Clase' }, { header: 'Monto', kind: 'money' }, { header: '¿Resta utilidad?' }],
    rows: [
      ...(s.fixedExpenses > 0 ? [['Gastos fijos (Configuración)', 'Gasto operativo', s.fixedExpenses, 'Sí'] as Cell[]] : []),
      ...s.expenseLines.map((x) => [
        x.category,
        EXPENSE_CLASS_LABEL[x.cls],
        x.amount_cents,
        x.cls === 'retiro' ? 'No: retiro del dueño' : x.cls === 'inversion' ? 'No: inversión' : x.coveredByFixed ? 'No: ya está en gastos fijos' : 'Sí',
      ] as Cell[]),
    ],
  }
  const breakEven: ReportSection = {
    title: 'Punto de equilibrio',
    columns: [{ header: 'Concepto' }, { header: 'Valor', kind: 'money' }, { header: 'Fórmula' }],
    rows: [
      ['Ventas para no perder (mes)', s.breakEvenSales, 'Gastos ÷ margen bruto'],
      [`Por día (${s.openDays} días)`, s.breakEvenDaily, 'Punto de equilibrio ÷ días del mes configurados'],
      ...(s.projectedNetSales !== null ? [['Ventas al ritmo actual (ESTIMADO)', s.projectedNetSales, 'Ventas hasta hoy ÷ días transcurridos × días del mes'] as Cell[]] : []),
    ],
  }
  return {
    title: `${brand} — Estado de resultados`,
    subtitle: mm(d.current.year, d.current.month),
    filename: `estado_resultados_${d.current.year}_${String(d.current.month).padStart(2, '0')}`,
    sections: [statement, indicators, expenses, breakEven],
    notes: [
      'Ventas netas = lo cobrado en ventas pagadas (mostrador + tienda online). Costo = cantidad × costo guardado en cada venta.',
      'Gastos operativos = gastos fijos de Configuración + gastos registrados que restan (sin retiros, inversiones ni pagos ya contados en fijos).',
      'Los meses anteriores usan los gastos fijos configurados hoy. Sin impuestos: la utilidad neta es antes de impuestos.',
    ],
  }
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100))
}

// ---------- Año ----------

export function yearReport(d: YearSummary & { year: number }, brand: string): ReportDoc {
  const show = (st: string) => st === 'open' || st === 'closed'
  const statusText = { open: 'En curso', closed: '', 'no-data': 'Sin datos', future: '' } as const
  const rows: Cell[][] = d.months.map((m) => {
    const s = m.statement
    const on = show(m.status) && s
    return [
      `${MONTH_NAMES[m.month - 1]}${statusText[m.status] ? ` (${statusText[m.status]})` : ''}`,
      on ? s!.netSales : null,
      on ? s!.costOfSales : null,
      on ? s!.grossProfit : null,
      on ? s!.operatingExpenses + s!.financialExpenses : null,
      on ? s!.netProfit : null,
      on ? s!.netMargin : null,
      m.status !== 'future' ? m.purchases_cents : null,
      m.status !== 'future' ? m.supplier_payments_cents : null,
      on ? m.leftover_cents : null,
      m.inventory ? m.inventory.value_cents : null,
      m.inventory_change_cents,
    ]
  })
  const t = d.totals
  const totals: Cell[] = ['Total', t.netSales, t.costOfSales, t.grossProfit, t.operatingExpenses + t.financialExpenses, t.netProfit, t.netMargin, t.purchases_cents, t.supplier_payments_cents, t.leftover_cents, null, null]
  const averages: Cell[][] = d.averages
    ? [['Promedio por mes', d.averages.netSales, null, d.averages.grossProfit, null, d.averages.netProfit, null, d.averages.purchases_cents, null, d.averages.leftover_cents, null, null]]
    : []
  return {
    title: `${brand} — Resumen del año`,
    subtitle: String(d.year),
    filename: `resumen_anual_${d.year}`,
    sections: [
      {
        title: `Cierre general ${d.year}`,
        columns: [
          { header: 'Mes' },
          { header: 'Ventas', kind: 'money' },
          { header: 'Costo', kind: 'money' },
          { header: 'Utilidad bruta', kind: 'money' },
          { header: 'Gastos', kind: 'money' },
          { header: 'Utilidad neta', kind: 'money' },
          { header: 'Margen neto', kind: 'pct' },
          { header: 'Compras', kind: 'money' },
          { header: 'Pagado a proveedores', kind: 'money' },
          { header: 'Lo que quedó', kind: 'money' },
          { header: 'Inventario', kind: 'money' },
          { header: 'Variación inventario', kind: 'money' },
        ],
        rows,
        totals,
        afterTotals: averages,
      },
      {
        title: 'Otras salidas (no son gasto)',
        columns: [{ header: 'Concepto' }, { header: 'Valor', kind: 'money' }],
        rows: [['Retiros del dueño', t.ownerWithdrawals], ['Inversiones', t.investments]],
      },
    ],
    notes: [
      'Lo que quedó = ventas − pagado a proveedores − gastos (la "ganancia real" del Excel). Utilidad neta = la del estado de resultados de cada mes.',
      'Compras = facturas de proveedor por fecha de llegada. Pagado a proveedores = abonos por fecha de pago + facturas pagadas sin abonos (por su fecha de pago o de llegada).',
      'Un mes sin ventas ni gastos muestra sus compras pero no suma. El inventario del mes en curso es el de hoy (en vivo).',
    ],
  }
}

// ---------- Inventario ----------

const productRows = (items: ProductInsight[], pick: (p: ProductInsight) => Cell[]) => items.map(pick)

export function inventoryReport(d: InventoryInsights & { today: string }, brand: string): ReportDoc {
  const days = (n: number | null) => (n === null ? null : Math.round(n))
  return {
    title: `${brand} — Inventario y rentabilidad`,
    subtitle: `Al ${d.today} · ventas de los últimos ${d.windowDays} días · quieto: más de ${d.quietDays} días sin venta`,
    filename: `inventario_rentabilidad_${d.today}`,
    sections: [
      {
        title: 'Resumen',
        columns: [{ header: 'Indicador' }, { header: 'Valor' }, { header: 'Fórmula' }],
        rows: [
          ['Inventario a costo', fmtMoney(d.inventory.value_cents), `${d.inventory.units} unidades · ${d.inventory.refs} referencias`],
          ['Días de inventario', d.daysOfInventory === null ? '—' : `${Math.round(d.daysOfInventory)} días`, 'Inventario ÷ (costo vendido en 30 días ÷ 30)'],
          ['Rotación (ESTIMADO)', d.turnoverPerYear === null ? '—' : `${d.turnoverPerYear.toFixed(1)} veces/año`, `Costo vendido en ${d.windowDays} días llevado a un año ÷ inventario de hoy`],
          ['Plata quieta', fmtMoney(d.quietTotals.value), `${d.quietTotals.products} productos · ${pct(d.quietTotals.shareOfInventory)} del inventario`],
          [`Ventas (${d.windowDays} días)`, fmtMoney(d.window.sales), `Utilidad bruta ${fmtMoney(d.window.profit)}`],
        ],
      },
      {
        title: 'Rentabilidad por categoría',
        columns: [
          { header: 'Categoría' },
          { header: 'Unidades', kind: 'number' },
          { header: 'Ventas', kind: 'money' },
          { header: 'Utilidad bruta', kind: 'money' },
          { header: 'Margen', kind: 'pct' },
          { header: '% de la utilidad', kind: 'pct' },
          { header: 'Inventario hoy', kind: 'money' },
        ],
        rows: d.categories.map((c) => [c.category, c.units, c.sales, c.profit, c.margin, c.profitShare, c.stockValue]),
      },
      {
        title: 'Productos quietos',
        columns: [{ header: 'Producto' }, { header: 'Categoría' }, { header: 'Stock', kind: 'number' }, { header: 'Valor a costo', kind: 'money' }, { header: 'Días sin venta', kind: 'number' }],
        rows: productRows(d.quiet, (p) => [p.title, p.category, p.stock, p.stockValue, p.daysSinceSale ?? 'Más de un año / nunca']),
        totals: ['Total', '', d.quietTotals.units, d.quietTotals.value, ''],
      },
      {
        title: 'Los que más rotan',
        columns: [{ header: 'Producto' }, { header: 'Unidades vendidas', kind: 'number' }, { header: 'Stock', kind: 'number' }, { header: 'Días de cobertura', kind: 'number' }],
        rows: productRows(d.topMovers, (p) => [p.title, p.unitsWindow, p.stock, days(p.coverageDays)]),
      },
      {
        title: 'Baja rotación',
        columns: [{ header: 'Producto' }, { header: 'Stock', kind: 'number' }, { header: 'Unidades vendidas', kind: 'number' }, { header: 'Días de cobertura', kind: 'number' }, { header: 'Valor a costo', kind: 'money' }],
        rows: productRows(d.slowMovers, (p) => [p.title, p.stock, p.unitsWindow, days(p.coverageDays), p.stockValue]),
      },
      {
        title: 'Más utilidad',
        columns: [{ header: 'Producto' }, { header: 'Unidades', kind: 'number' }, { header: 'Ventas', kind: 'money' }, { header: 'Utilidad bruta', kind: 'money' }, { header: 'Margen', kind: 'pct' }],
        rows: productRows(d.mostProfitable, (p) => [p.title, p.unitsWindow, p.salesWindow, p.profitWindow, p.marginWindow]),
      },
    ],
    notes: [
      'Producto quieto = con stock, sin venta en más de los días elegidos y sin entrada de mercancía en ese tiempo.',
      'Días de cobertura = stock ÷ (unidades vendidas en la ventana ÷ días de la ventana).',
      'Las alertas de stock bajo están en Dashboard e Inventario.',
    ],
  }
}

// ---------- Flujo de caja ----------

export interface CashFlowReportInput {
  year: number
  month: number
  today: string
  isCurrentMonth: boolean
  flow: CashFlow
  netProfit: number
  receivables: Receivables
  payables: Payables
  available: number
  withdrawable: { value: number; shortfall: number; reserveSuppliers: number; reserveFixed: number }
}

const METHOD_LABEL: Record<string, string> = { datafono: 'Datáfono', addi: 'Addi', sistecredito: 'SisteCrédito' }
const STATUS_LABEL = { vencida: 'Vencida', proxima: 'Vence en 30 días', despues: 'Más adelante', sin_fecha: 'Sin fecha' } as const

export function cashFlowReport(d: CashFlowReportInput, brand: string): ReportDoc {
  const f = d.flow
  const r = d.receivables
  return {
    title: `${brand} — Flujo de caja`,
    subtitle: `${mm(d.year, d.month)}${d.isCurrentMonth ? ` (hasta ${d.today})` : ''} · por cobrar y por pagar al ${d.today}`,
    filename: `flujo_caja_${d.year}_${String(d.month).padStart(2, '0')}`,
    sections: [
      {
        title: 'Flujo del mes',
        columns: [{ header: 'Concepto' }, { header: 'Valor', kind: 'money' }],
        rows: [
          ['Saldo al iniciar el mes', f.opening],
          ...f.concepts.map((c) => [FLOW_CONCEPT_LABEL[c.concept], c.net] as Cell[]),
          [d.isCurrentMonth ? 'Saldo hoy' : 'Saldo al cerrar el mes', f.closing],
        ],
        totals: ['Flujo neto del mes', f.netFlow],
        note: f.transfersMoved ? `Traslados entre cuentas propias (no son entrada ni salida): ${fmtMoney(f.transfersMoved)}.` : undefined,
      },
      {
        title: 'Por cuenta',
        columns: [{ header: 'Cuenta' }, { header: 'Al iniciar', kind: 'money' }, { header: 'Entró', kind: 'money' }, { header: 'Salió', kind: 'money' }, { header: d.isCurrentMonth ? 'Hoy' : 'Al cerrar', kind: 'money' }],
        rows: f.accounts
          .filter((a) => a.active || a.opening || a.closing || a.inflows || a.outflows)
          .map((a) => [`${a.name}${a.active ? '' : ' (inactiva)'}`, a.opening, a.inflows, -a.outflows, a.closing]),
        totals: ['Total', f.opening, null, null, f.closing],
      },
      {
        title: 'Utilidad vs plata',
        columns: [{ header: 'Concepto' }, { header: 'Valor', kind: 'money' }],
        rows: [['Utilidad neta del mes', d.netProfit], ['Flujo de caja del mes', f.netFlow]],
        note: 'No tienen por qué coincidir: la utilidad cuenta el costo de lo vendido y los gastos fijos completos; la plata cuenta pagos a proveedores, retiros y lo que aún no llega.',
      },
      {
        title: 'Retiro posible',
        columns: [{ header: 'Concepto' }, { header: 'Valor', kind: 'money' }],
        rows: [
          ['Plata en las cuentas hoy', d.available],
          ['(−) Proveedores: vencido, sin fecha y 30 días', -d.withdrawable.reserveSuppliers],
          ['(−) Un mes de gastos fijos', -d.withdrawable.reserveFixed],
        ],
        totals: ['Se puede retirar (ESTIMADO)', d.withdrawable.value],
        note: d.withdrawable.shortfall ? `Faltan ${fmtMoney(d.withdrawable.shortfall)} para cubrir los compromisos.` : 'Lo por llegar y el fiado no se cuentan hasta que entren.',
      },
      {
        title: 'Nos deben',
        columns: [{ header: 'Concepto' }, { header: 'Valor', kind: 'money' }, { header: 'Detalle' }],
        rows: [
          [`Fiado (${r.fiado.count})`, r.fiado.cents, 'Saldo de Apartados y Abonos'],
          [`Por cobrar (${r.porCobrar.count})`, r.porCobrar.cents, 'Cuentas → Por Cobrar'],
          ...r.porLlegar.byMethod.map((m) => [
            `${METHOD_LABEL[m.method] || m.method} por llegar`,
            m.cents,
            [m.next_date ? `próximo pago ${m.next_date}` : '', m.atrasado_cents ? `${fmtMoney(m.atrasado_cents)} ya debió llegar` : ''].filter(Boolean).join(' · '),
          ] as Cell[]),
        ],
        totals: ['Total', r.total, ''],
      },
      {
        title: 'Por pagar',
        columns: [{ header: 'Proveedor' }, { header: 'Factura' }, { header: 'Estado' }, { header: 'Vence' }, { header: 'Saldo', kind: 'money' }],
        rows: d.payables.invoices.map((i) => [i.supplier, i.description, STATUS_LABEL[i.status], i.due_date || '—', i.balance_cents]),
        totals: ['Total', '', '', '', d.payables.total],
      },
    ],
    notes: ['Saldo final = saldo de hoy − movimientos posteriores al mes; saldo inicial = saldo final − movimientos del mes.'],
  }
}


// ---------- Ventas por día ----------

export interface SalesMonthReportInput {
  year: number
  month: number
  days: { date: string; weekday: string; byColumn: Record<string, number>; total: number; rating: string }[]
  columns: { key: string; label: string }[]
  totals: Record<string, number> & { total: number; orders: number }
  halves: { label: string; byColumn: Record<string, number>; total: number }[]
  ratingCounts: Record<string, { days: number; cents: number }>
  commissions: { total: number }
}

const RATING_LABEL: Record<string, string> = { mala: 'Mala', media: 'Media', normal: 'Normal', buena: 'Buena', sin_venta: 'Sin venta' }

export function salesMonthReport(d: SalesMonthReportInput, brand: string): ReportDoc {
  const cols = d.columns
  const line = (label: string, by: Record<string, number>, total: number, extra: Cell = null): Cell[] => [label, ...cols.map((c) => by[c.key] || null), total, extra]
  return {
    title: `${brand} — Ventas por día`,
    subtitle: mm(d.year, d.month),
    filename: `ventas_por_dia_${d.year}_${String(d.month).padStart(2, '0')}`,
    sections: [
      {
        title: 'Ventas diarias por medio de pago',
        columns: [{ header: 'Día' }, ...cols.map((c) => ({ header: c.label, kind: 'money' as const })), { header: 'Total', kind: 'money' }, { header: 'Venta' }],
        rows: d.days.map((day) => line(`${day.weekday} ${Number(day.date.slice(8, 10))}`, day.byColumn, day.total, RATING_LABEL[day.rating] || day.rating)),
        totals: line('Total', d.totals, d.totals.total, `${d.totals.orders} ventas`),
        afterTotals: d.halves.map((h) => line(h.label, h.byColumn, h.total)),
      },
      {
        title: 'Calificación de los días',
        columns: [{ header: 'Calificación' }, { header: 'Días', kind: 'number' }, { header: 'Ventas', kind: 'money' }],
        rows: ['buena', 'normal', 'media', 'mala', 'sin_venta'].map((k) => [RATING_LABEL[k], d.ratingCounts[k]?.days ?? 0, d.ratingCounts[k]?.cents ?? 0]),
      },
    ],
    notes: [
      'Calificación: Mala menos de $300.000 · Media hasta $599.999 · Normal hasta $1.499.999 · Buena desde $1.500.000.',
      `Comisiones de los medios de pago en el mes: ${fmtMoney(d.commissions.total)} (se le cobran al cliente como recargo).`,
      'Las ventas de la tienda en línea van en su propia columna. "Sin medio" son ventas sin el pago registrado.',
    ],
  }
}
