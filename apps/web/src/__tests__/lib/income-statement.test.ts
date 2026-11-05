import { describe, it, expect } from 'vitest'
import { buildIncomeStatement, salesForTargetProfit, percentChange, ratio } from '@/lib/finance/income-statement'

// Montos en centavos. 1 peso = 100.
const P = (pesos: number) => pesos * 100

const FIXED = { arriendo_cents: P(1_000_000), sueldo_cents: P(1_500_000), servicios_cents: 0, otros_gastos_cents: P(100_000), dias_mes: 26 }

const orders = [
  {
    total_cents: P(300_000),
    order_items: [
      { qty: 2, price_cents: P(100_000), total_cents: P(190_000), cost_cents: P(60_000), discount_cents: P(10_000) },
      { qty: 1, price_cents: P(110_000), total_cents: P(110_000), cost_cents: P(50_000), discount_cents: 0 },
    ],
    payments: [{ commission_cents: P(5_000) }],
  },
  {
    total_cents: P(200_000),
    order_items: [{ qty: 1, price_cents: P(200_000), total_cents: P(200_000), cost_cents: 0, discount_cents: 0 }],
    payments: [{ commission_cents: null }],
  },
]

const expenses = [
  { amount_cents: P(1_000_000), category: 'Arriendo' }, // ya en fijos → no resta otra vez
  { amount_cents: P(80_000), category: 'Luz' }, // servicios en 0 → resta
  { amount_cents: P(20_000), category: 'Gastos bancarios' }, // financiero
  { amount_cents: P(500_000), category: 'Retiro del dueño' },
  { amount_cents: P(300_000), category: 'Inversión' },
]

describe('buildIncomeStatement', () => {
  const s = buildIncomeStatement({ orders, expenses, fixed: FIXED, daysInMonth: 30, daysElapsed: 30 })

  it('ventas', () => {
    expect(s.grossSales).toBe(P(510_000))
    expect(s.discounts).toBe(P(10_000))
    expect(s.netSales).toBe(P(500_000))
    expect(s.transactions).toBe(2)
    expect(s.units).toBe(4)
    expect(s.averageTicket).toBe(P(250_000))
  })

  it('costo, utilidad bruta, margen y markup; la comisión no resta', () => {
    expect(s.costOfSales).toBe(P(170_000))
    expect(s.grossProfit).toBe(P(330_000))
    expect(s.grossMargin).toBeCloseTo(0.66)
    expect(s.markup).toBeCloseTo(330 / 170)
    expect(s.commissions).toBe(P(5_000))
    expect(s.itemsWithoutCost).toEqual({ lines: 1, sales_cents: P(200_000) })
  })

  it('gastos por clase sin doble conteo', () => {
    expect(s.fixedExpenses).toBe(P(2_600_000))
    expect(s.operatingExpenses).toBe(P(2_680_000)) // fijos + luz
    expect(s.financialExpenses).toBe(P(20_000))
    expect(s.ownerWithdrawals).toBe(P(500_000))
    expect(s.investments).toBe(P(300_000))
    expect(s.coveredByFixed).toBe(P(1_000_000))
    expect(s.payroll).toBe(P(1_500_000))
  })

  it('resultados = utilidad real de Historial Mensual', () => {
    expect(s.operatingProfit).toBe(P(330_000 - 2_680_000))
    expect(s.netProfit).toBe(P(330_000 - 2_680_000 - 20_000))
    expect(s.netMargin).toBeCloseTo(-2_370_000 / 500_000)
  })

  it('punto de equilibrio = gastos ÷ margen bruto, por día ÷ días configurados', () => {
    expect(s.breakEvenSales).toBeCloseTo(P(2_700_000) / 0.66)
    expect(s.breakEvenDaily).toBeCloseTo(P(2_700_000) / 0.66 / 26)
    expect(s.projectedNetSales).toBeNull()
  })

  it('proyección solo en el mes en curso', () => {
    const cur = buildIncomeStatement({ orders, expenses, fixed: FIXED, daysInMonth: 30, daysElapsed: 10 })
    expect(cur.projectedNetSales).toBe(P(1_500_000))
  })

  it('mes vacío: sin divisiones por cero', () => {
    const empty = buildIncomeStatement({ orders: [], expenses: [], fixed: null, daysInMonth: 31, daysElapsed: 31 })
    expect(empty.netSales).toBe(0)
    expect(empty.averageTicket).toBeNull()
    expect(empty.grossMargin).toBeNull()
    expect(empty.markup).toBeNull()
    expect(empty.netMargin).toBeNull()
    expect(empty.breakEvenSales).toBeNull()
    expect(empty.breakEvenDaily).toBeNull()
    expect(empty.openDays).toBe(30)
    expect(empty.hasData).toBe(false)
    expect(s.hasData).toBe(true)
  })
})

describe('auxiliares', () => {
  it('salesForTargetProfit', () => {
    expect(salesForTargetProfit(P(1_000_000), P(500_000), 0.5)).toBe(P(3_000_000))
    expect(salesForTargetProfit(P(1_000_000), 0, 0)).toBeNull()
    expect(salesForTargetProfit(P(1_000_000), 0, -0.1)).toBeNull()
    expect(salesForTargetProfit(P(1_000_000), 0, null)).toBeNull()
  })
  it('percentChange y ratio', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2)
    expect(percentChange(-50, -100)).toBeCloseTo(0.5)
    expect(percentChange(10, 0)).toBeNull()
    expect(ratio(1, 0)).toBeNull()
  })
})
