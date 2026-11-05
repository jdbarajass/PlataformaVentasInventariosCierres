import { describe, it, expect } from 'vitest'
import { buildYearSummary, type YearMonthInput } from '@/lib/finance/year-summary'
import { computeInventoryValue } from '@/lib/finance/inventory-value'

const P = (pesos: number) => pesos * 100
const FIXED = { arriendo_cents: P(1_000_000), sueldo_cents: 0, servicios_cents: 0, otros_gastos_cents: 0, dias_mes: 30 }

const order = (net: number, cost: number) => ({
  total_cents: P(net),
  order_items: [{ qty: 1, price_cents: P(net), total_cents: P(net), cost_cents: P(cost), discount_cents: 0 }],
  payments: [],
})

function month(m: number, extra: Partial<YearMonthInput> = {}): YearMonthInput {
  return { month: m, orders: [], expenses: [], purchases_cents: 0, supplier_payments_cents: 0, inventory: null, daysInMonth: 30, daysElapsed: 30, ...extra }
}

describe('buildYearSummary', () => {
  const summary = buildYearSummary({
    fixed: FIXED,
    previousInventory: null,
    months: [
      month(1, { purchases_cents: P(9_000_000) }), // solo facturas, sin ventas ni gastos: no cuenta
      month(2, {
        orders: [order(3_000_000, 1_800_000)],
        expenses: [{ amount_cents: P(100_000), category: 'Otro' }],
        purchases_cents: P(2_500_000),
        supplier_payments_cents: P(1_500_000),
        inventory: { value_cents: P(10_000_000), as_of: '2026-02-28', source: 'cron' },
      }),
      month(3, {
        orders: [order(2_000_000, 1_000_000)],
        supplier_payments_cents: P(500_000),
        inventory: { value_cents: P(10_700_000), as_of: '2026-03-15', source: 'live' },
        daysElapsed: 15,
      }),
      month(4, { daysElapsed: 0 }),
    ],
  })

  it('estado de cada mes', () => {
    expect(summary.months.map((m) => m.status)).toEqual(['no-data', 'closed', 'open', 'future'])
    expect(summary.months[3].statement).toBeNull()
  })

  it('"lo que quedó" = ventas − pagado a proveedores − gastos', () => {
    // feb: 3.000.000 − 1.500.000 − (1.000.000 fijo + 100.000) = 400.000
    expect(summary.months[1].leftover_cents).toBe(P(400_000))
    expect(summary.months[1].statement!.netProfit).toBe(P(3_000_000 - 1_800_000 - 1_100_000))
    expect(summary.months[0].leftover_cents).toBeNull()
  })

  it('variación del inventario contra el mes anterior', () => {
    expect(summary.months[1].inventory_change_cents).toBeNull() // enero sin foto
    expect(summary.months[2].inventory_change_cents).toBe(P(700_000))
  })

  it('totales y promedios solo con meses con datos', () => {
    expect(summary.totals.months_counted).toBe(2)
    expect(summary.totals.netSales).toBe(P(5_000_000))
    expect(summary.totals.purchases_cents).toBe(P(2_500_000)) // sin las de enero
    expect(summary.months[0].purchases_cents).toBe(P(9_000_000)) // pero se muestran
    expect(summary.totals.supplier_payments_cents).toBe(P(2_000_000))
    expect(summary.averages!.netSales).toBe(P(2_500_000))
    expect(summary.totals.grossMargin).toBeCloseTo(2_200_000 / 5_000_000)
  })

  it('año sin datos', () => {
    const empty = buildYearSummary({ fixed: null, previousInventory: null, months: [month(1), month(2)] })
    expect(empty.totals.months_counted).toBe(0)
    expect(empty.averages).toBeNull()
    expect(empty.totals.netMargin).toBeNull()
  })
})

describe('computeInventoryValue', () => {
  it('usa las variantes cuando existen y no cuenta dos veces', () => {
    const v = computeInventoryValue(
      [
        { id: 'a', cost_cents: 1000, stock_qty: 5 }, // sin variantes
        { id: 'b', cost_cents: 9999, stock_qty: 99 }, // con variantes: se ignora su stock propio
      ],
      [
        { product_id: 'b', cost_cents: 2000, stock_qty: 2 },
        { product_id: 'b', cost_cents: 3000, stock_qty: -1 }, // negativo no resta
        { product_id: 'zzz', cost_cents: 5000, stock_qty: 10 }, // producto borrado
      ]
    )
    expect(v).toEqual({ value_cents: 5000 + 4000, units: 7, refs: 3 })
  })
})
