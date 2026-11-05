// Ventas del mes, día por día y por medio de pago (Finanzas → Ventas por día).
// Equivale a la "Hoja del mes" de KOAJ. Función pura.
//
// - Cada venta pagada se reparte en sus pagos (payments) por medio. Las ventas
//   de la tienda en línea van en su propia columna ("Tienda online") para no
//   mezclarlas con el datáfono del local.
// - Si una venta no tiene pagos registrados (o suman menos que su total), la
//   diferencia va a "Sin medio" para que el total del día cuadre con las ventas.
// - Calificación del día por el total vendido (umbrales del dueño, 2026-11-05).

import { bogotaDateStr } from '@/lib/bogota-time'

export const DAY_RATINGS = [
  { key: 'mala', label: 'Mala', max: 300_000_00 }, // < $300.000
  { key: 'media', label: 'Media', max: 600_000_00 }, // $300.000 – $599.999
  { key: 'normal', label: 'Normal', max: 1_500_000_00 }, // $600.000 – $1.499.999
  { key: 'buena', label: 'Buena', max: Infinity }, // $1.500.000 o más
] as const

export type DayRating = (typeof DAY_RATINGS)[number]['key'] | 'sin_venta'

export function rateDay(totalCents: number): DayRating {
  if (totalCents <= 0) return 'sin_venta'
  return DAY_RATINGS.find((r) => totalCents < r.max)!.key
}

/** Columnas posibles, en el orden en que se muestran. */
export const SALES_COLUMNS: { key: string; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'qr', label: 'QR' },
  { key: 'nequi', label: 'Nequi' },
  { key: 'nu', label: 'NU' },
  { key: 'daviplata', label: 'Daviplata' },
  { key: 'card', label: 'Datáfono' },
  { key: 'addi', label: 'Addi' },
  { key: 'sistecredito', label: 'SisteCrédito' },
  { key: 'transfer', label: 'Transferencia' },
  { key: 'wallet', label: 'Billetera' },
  { key: 'other', label: 'Otro' },
  { key: 'online', label: 'Tienda online' },
  { key: 'sin_medio', label: 'Sin medio' },
]

export interface SalesOrder {
  created_at: string
  total_cents: number
  channel: string | null
  payments: { method: string | null; amount_cents: number; commission_cents: number | null }[] | null
}

export interface SalesDay {
  date: string
  weekday: string
  byColumn: Record<string, number>
  total: number
  orders: number
  rating: DayRating
}

export interface SalesMonth {
  days: SalesDay[]
  /** Columnas con algún valor en el mes, en orden. */
  columns: { key: string; label: string }[]
  totals: Record<string, number> & { total: number; orders: number }
  halves: { label: string; byColumn: Record<string, number>; total: number }[]
  ratingCounts: Record<DayRating, { days: number; cents: number }>
  commissions: { byColumn: Record<string, number>; total: number }
  bestDay: SalesDay | null
  averagePerDay: number | null
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const known = new Set(SALES_COLUMNS.map((c) => c.key))

export function buildSalesMonth(input: { orders: SalesOrder[]; year: number; month: number; daysInMonth: number; daysElapsed: number }): SalesMonth {
  const { year, month } = input
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = new Map<string, SalesDay>()
  for (let d = 1; d <= input.daysElapsed; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`
    days.set(date, { date, weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, d)).getUTCDay()], byColumn: {}, total: 0, orders: 0, rating: 'sin_venta' })
  }

  const commissions: Record<string, number> = {}
  for (const o of input.orders) {
    const date = bogotaDateStr(new Date(o.created_at))
    const day = days.get(date)
    if (!day) continue
    const add = (col: string, cents: number) => {
      if (!cents) return
      day.byColumn[col] = (day.byColumn[col] || 0) + cents
    }
    day.orders += 1
    day.total += o.total_cents
    let paid = 0
    for (const p of o.payments || []) {
      const col = o.channel === 'online' ? 'online' : known.has(p.method || '') ? (p.method as string) : 'other'
      add(col, p.amount_cents)
      paid += p.amount_cents
      if (p.commission_cents) commissions[col] = (commissions[col] || 0) + p.commission_cents
    }
    // Ventas sin pagos (o con pagos incompletos): la diferencia queda visible.
    if (o.total_cents - paid > 0) add(o.channel === 'online' ? 'online' : 'sin_medio', o.total_cents - paid)
  }

  const list = Array.from(days.values())
  for (const d of list) d.rating = rateDay(d.total)

  const sumCols = (ds: SalesDay[]) => {
    const r: Record<string, number> = {}
    for (const d of ds) for (const [k, v] of Object.entries(d.byColumn)) r[k] = (r[k] || 0) + v
    return r
  }
  const all = sumCols(list)
  const columns = SALES_COLUMNS.filter((c) => all[c.key])
  const total = list.reduce((s, d) => s + d.total, 0)
  const half = (from: number, to: number, label: string) => {
    const ds = list.filter((d) => {
      const n = Number(d.date.slice(8, 10))
      return n >= from && n <= to
    })
    return { label, byColumn: sumCols(ds), total: ds.reduce((s, d) => s + d.total, 0) }
  }

  const ratingCounts = { mala: { days: 0, cents: 0 }, media: { days: 0, cents: 0 }, normal: { days: 0, cents: 0 }, buena: { days: 0, cents: 0 }, sin_venta: { days: 0, cents: 0 } } as SalesMonth['ratingCounts']
  for (const d of list) {
    ratingCounts[d.rating].days += 1
    ratingCounts[d.rating].cents += d.total
  }
  const withSales = list.filter((d) => d.total > 0)

  return {
    days: list,
    columns,
    totals: { ...all, total, orders: list.reduce((s, d) => s + d.orders, 0) },
    halves: [half(1, 15, 'Del 1 al 15'), half(16, 31, `Del 16 al ${input.daysInMonth}`)].filter((h, i) => i === 0 || input.daysElapsed > 15),
    ratingCounts,
    commissions: { byColumn: commissions, total: Object.values(commissions).reduce((s, v) => s + v, 0) },
    bestDay: withSales.length ? withSales.reduce((a, b) => (b.total > a.total ? b : a)) : null,
    averagePerDay: list.length ? total / list.length : null,
  }
}
