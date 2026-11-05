import { describe, it, expect } from 'vitest'
import { buildSalesMonth, rateDay } from '@/lib/finance/sales-month'

const P = (pesos: number) => pesos * 100
// 15:00 UTC = 10 am en Bogotá
const at = (day: number, hourUtc = 15) => `2026-10-${String(day).padStart(2, '0')}T${String(hourUtc).padStart(2, '0')}:00:00Z`

describe('rateDay (umbrales del dueño)', () => {
  it('mala < 300 mil, media < 600 mil, normal < 1,5 M, buena desde 1,5 M', () => {
    expect(rateDay(0)).toBe('sin_venta')
    expect(rateDay(P(299_999))).toBe('mala')
    expect(rateDay(P(300_000))).toBe('media')
    expect(rateDay(P(599_999))).toBe('media')
    expect(rateDay(P(600_000))).toBe('normal')
    expect(rateDay(P(1_499_999))).toBe('normal')
    expect(rateDay(P(1_500_000))).toBe('buena')
  })
})

describe('buildSalesMonth', () => {
  const m = buildSalesMonth({
    year: 2026,
    month: 10,
    daysInMonth: 31,
    daysElapsed: 20,
    orders: [
      { created_at: at(1), total_cents: P(500_000), channel: 'pos', payments: [{ method: 'cash', amount_cents: P(300_000), commission_cents: 0 }, { method: 'card', amount_cents: P(200_000), commission_cents: P(7_600) }] },
      { created_at: at(1), total_cents: P(1_200_000), channel: 'pos', payments: [{ method: 'qr', amount_cents: P(1_200_000), commission_cents: 0 }] },
      { created_at: at(2), total_cents: P(100_000), channel: 'online', payments: [{ method: 'card', amount_cents: P(100_000), commission_cents: 0 }] },
      { created_at: at(18), total_cents: P(50_000), channel: 'pos', payments: [] }, // sin pagos registrados
      { created_at: '2026-11-01T03:00:00Z', total_cents: P(999_000), channel: 'pos', payments: [{ method: 'cash', amount_cents: P(999_000), commission_cents: 0 }] }, // 31-oct 10pm Bogotá: fuera de los 20 días
    ],
  })

  it('un renglón por día transcurrido; días sin venta incluidos', () => {
    expect(m.days).toHaveLength(20)
    expect(m.days[0]).toMatchObject({ date: '2026-10-01', weekday: 'Jue', total: P(1_700_000), orders: 2, rating: 'buena' })
    expect(m.days[0].byColumn).toEqual({ cash: P(300_000), card: P(200_000), qr: P(1_200_000) })
    expect(m.days[2].rating).toBe('sin_venta')
  })

  it('online aparte del datáfono; venta sin pagos en "Sin medio"', () => {
    expect(m.days[1].byColumn).toEqual({ online: P(100_000) })
    expect(m.days[17].byColumn).toEqual({ sin_medio: P(50_000) })
    expect(m.columns.map((c) => c.key)).toEqual(['cash', 'qr', 'card', 'online', 'sin_medio'])
  })

  it('totales, quincenas, calificaciones y comisiones', () => {
    expect(m.totals.total).toBe(P(1_850_000))
    expect(m.totals.orders).toBe(4)
    expect(m.halves.map((h) => h.total)).toEqual([P(1_800_000), P(50_000)])
    expect(m.ratingCounts.buena).toEqual({ days: 1, cents: P(1_700_000) })
    expect(m.ratingCounts.mala.days).toBe(2)
    expect(m.ratingCounts.sin_venta.days).toBe(17)
    expect(m.commissions.total).toBe(P(7_600))
    expect(m.bestDay?.date).toBe('2026-10-01')
    expect(m.averagePerDay).toBe(P(1_850_000) / 20)
  })

  it('mes futuro: vacío y sin divisiones por cero', () => {
    const f = buildSalesMonth({ year: 2026, month: 12, daysInMonth: 31, daysElapsed: 0, orders: [] })
    expect(f.days).toEqual([])
    expect(f.averagePerDay).toBeNull()
    expect(f.bestDay).toBeNull()
    expect(f.halves).toHaveLength(1)
  })
})
