import { describe, it, expect } from 'vitest'
import { buildInventoryInsights, inferCategory, daysBetween, addDays } from '@/lib/finance/inventory-insights'

const TODAY = '2026-11-05'
const old = '2026-01-01T12:00:00Z'

const products = [
  { id: 'casco', title: 'CASCO ICH 501', cost_cents: 10_000, stock_qty: 0, created_at: old, category: 'Cascos' },
  { id: 'guante', title: 'GUANTE FOX', cost_cents: 2_000, stock_qty: 10, created_at: old, category: null },
  { id: 'quieto', title: 'IMPERMEABLE X', cost_cents: 5_000, stock_qty: 4, created_at: old, category: null },
  { id: 'nuevo', title: 'IMPERMEABLE NUEVO', cost_cents: 5_000, stock_qty: 3, created_at: '2026-10-20T12:00:00Z', category: null },
  { id: 'surtido', title: 'LAMINA Y', cost_cents: 1_000, stock_qty: 5, created_at: old, category: null },
]
const variants = [
  { product_id: 'casco', cost_cents: 10_000, stock_qty: 2 },
  { product_id: 'casco', cost_cents: 12_000, stock_qty: 1 },
]
const sale = (product_id: string | null, title: string, qty: number, price: number, cost: number, date: string) => ({
  product_id, title, qty, total_cents: qty * price, cost_cents: cost, date,
})
const sales = [
  sale('casco', 'CASCO ICH 501', 2, 20_000, 10_000, '2026-11-01'),
  sale('guante', 'GUANTE FOX', 5, 4_000, 2_000, '2026-10-20'),
  sale('guante', 'GUANTE FOX', 1, 4_000, 2_000, '2026-06-01'), // fuera de la ventana de 90 días
  sale('quieto', 'IMPERMEABLE X', 1, 9_000, 5_000, '2026-05-01'), // hace más de 90 días
  sale(null, 'Servicio lavado', 1, 3_000, 0, '2026-11-02'),
]

const r = buildInventoryInsights({
  products, variants, sales, lastIn: { surtido: '2026-10-30' }, today: TODAY, windowDays: 90, quietDays: 90,
})

describe('buildInventoryInsights', () => {
  it('valor del inventario y ventana', () => {
    // casco por variantes 2×10.000 + 1×12.000; guante 20.000; quieto 20.000; nuevo 15.000; surtido 5.000
    expect(r.inventory.value_cents).toBe(32_000 + 20_000 + 20_000 + 15_000 + 5_000)
    expect(r.window.sales).toBe(40_000 + 20_000 + 3_000)
    expect(r.window.cost).toBe(20_000 + 10_000)
    expect(r.cogs30).toBe(20_000 + 10_000)
  })

  it('días de inventario y rotación', () => {
    expect(r.daysOfInventory).toBeCloseTo(92_000 / (30_000 / 30))
    expect(r.turnoverPerYear).toBeCloseTo((30_000 * 365 / 90) / 92_000)
  })

  it('quietos: con stock, sin venta en N días y sin entrada reciente', () => {
    expect(r.quiet.map((p) => p.id)).toEqual(['quieto']) // "nuevo" y "surtido" llegaron hace poco
    expect(r.quiet[0].daysSinceSale).toBe(daysBetween('2026-05-01', TODAY))
    expect(r.quietTotals).toMatchObject({ products: 1, units: 4, value: 20_000 })
  })

  it('más vendidos, baja rotación y rentabilidad', () => {
    expect(r.topMovers.map((p) => p.id)).toEqual(['guante', 'casco'])
    const guante = r.topMovers[0]
    expect(guante.coverageDays).toBeCloseTo(10 / (5 / 90))
    expect(r.slowMovers[0].id).toBe('guante') // 180 días de cobertura vs 135 del casco
    expect(r.mostProfitable[0]).toMatchObject({ id: 'casco', profitWindow: 20_000 })
  })

  it('categorías: asignada, inferida e ítems manuales', () => {
    const byName = Object.fromEntries(r.categories.map((c) => [c.category, c]))
    expect(byName['CASCOS']).toMatchObject({ sales: 40_000, profit: 20_000, stockValue: 32_000 })
    expect(byName['GUANTE']).toMatchObject({ sales: 20_000, profit: 10_000 })
    expect(byName['ÍTEMS MANUALES']).toMatchObject({ sales: 3_000, profit: 3_000 })
    expect(byName['IMPERMEABLE'].stockValue).toBe(35_000)
    expect(byName['CASCOS'].profitShare).toBeCloseTo(20_000 / 33_000)
  })

  it('sin ventas: sin divisiones por cero', () => {
    const e = buildInventoryInsights({ products: [], variants: [], sales: [], lastIn: {}, today: TODAY, windowDays: 30, quietDays: 60 })
    expect(e.daysOfInventory).toBeNull()
    expect(e.turnoverPerYear).toBeNull()
    expect(e.quietTotals.shareOfInventory).toBeNull()
  })

  it('auxiliares', () => {
    expect(inferCategory('CASCO ICH -T:M')).toBe('CASCO')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
