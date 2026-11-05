import { describe, it, expect } from 'vitest'
import { monthPeriod, shiftMonth, truncatePeriod } from '@/lib/finance/periods'

describe('periods', () => {
  it('shiftMonth cruza años', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 11)).toEqual({ year: 2026, month: 11 })
  })
  it('límites en hora de Bogotá (UTC−5)', () => {
    const p = monthPeriod(2026, 2, new Date('2026-06-01T12:00:00Z'))
    expect(p.fromDate).toBe('2026-02-01')
    expect(p.toDate).toBe('2026-03-01')
    expect(p.fromISO).toBe(new Date('2026-02-01T05:00:00Z').toISOString())
    expect(p.daysInMonth).toBe(28)
    expect(p.daysElapsed).toBe(28)
  })
  it('días transcurridos del mes en curso y de un mes futuro', () => {
    // 5-nov 02:00 UTC = 4-nov 21:00 en Bogotá
    expect(monthPeriod(2026, 11, new Date('2026-11-05T02:00:00Z')).daysElapsed).toBe(4)
    expect(monthPeriod(2026, 12, new Date('2026-11-05T12:00:00Z')).daysElapsed).toBe(0)
  })
  it('truncatePeriod recorta a los mismos días', () => {
    const oct = monthPeriod(2026, 10, new Date('2026-11-05T12:00:00Z'))
    const t = truncatePeriod(oct, 5)
    expect(t.toDate).toBe('2026-10-06')
    expect(t.toISO).toBe(new Date('2026-10-06T05:00:00Z').toISOString())
    expect(truncatePeriod(oct, Infinity)).toBe(oct)
    // febrero recortado a 30 días = febrero completo
    const feb = monthPeriod(2026, 2, new Date('2026-11-05T12:00:00Z'))
    expect(truncatePeriod(feb, 30)).toBe(feb)
  })
})
