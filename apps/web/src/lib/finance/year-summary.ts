// Resumen del año, mes a mes (docs/PLAN_CONTROL_FINANCIERO.md, Fase 3).
// Es el "CierreGeneral" del Excel KOAJ_CARRENO2026.xlsx, con los datos de
// este sistema:
//   Excel "Recompras"      → compras a proveedores (Facturas)
//   Excel "Ganancia real"  → "Lo que quedó" = ventas − pagado a proveedores − gastos
//   Excel "Inventario 30|31" → foto del inventario a fin de mes (inventory_snapshots)
// Función pura: recibe los datos ya agrupados por mes.

import { buildIncomeStatement, ratio, type IncomeStatement, type StatementExpense, type StatementOrder } from './income-statement'
import type { FixedMonthlyExpenses } from './expense-classes'

export interface InventoryPoint {
  value_cents: number
  as_of: string
  source: 'cron' | 'manual' | 'live'
}

export interface YearMonthInput {
  month: number
  orders: StatementOrder[]
  expenses: StatementExpense[]
  /** Facturas de proveedor que llegaron en el mes (fecha de llegada, o de registro si no tiene). */
  purchases_cents: number
  /**
   * Pagado a proveedores en el mes: abonos por su fecha de pago + facturas
   * marcadas pagadas sin abonos (pagadas por fuera del sistema, ej. las
   * cargadas de golpe en jul-2026), por su fecha de pago o de llegada.
   */
  supplier_payments_cents: number
  inventory: InventoryPoint | null
  daysInMonth: number
  daysElapsed: number
}

export type MonthStatus = 'future' | 'no-data' | 'open' | 'closed'

export interface YearMonth {
  month: number
  status: MonthStatus
  statement: IncomeStatement | null
  purchases_cents: number
  supplier_payments_cents: number
  /** Ventas netas − pagado a proveedores − gastos (operativos + financieros). La "ganancia real" del Excel. */
  leftover_cents: number | null
  inventory: InventoryPoint | null
  /** Inventario de este mes − inventario del mes anterior (null si falta alguno). */
  inventory_change_cents: number | null
}

export interface YearTotals {
  months_counted: number
  netSales: number
  costOfSales: number
  grossProfit: number
  operatingExpenses: number
  financialExpenses: number
  netProfit: number
  purchases_cents: number
  supplier_payments_cents: number
  leftover_cents: number
  ownerWithdrawals: number
  investments: number
  grossMargin: number | null
  netMargin: number | null
}

export interface YearSummary {
  months: YearMonth[]
  totals: YearTotals
  /** Promedio por mes con datos (null si no hay ninguno). */
  averages: Pick<YearTotals, 'netSales' | 'grossProfit' | 'netProfit' | 'leftover_cents' | 'purchases_cents'> | null
}

export function buildYearSummary(input: {
  months: YearMonthInput[]
  fixed: FixedMonthlyExpenses | null
  /** Inventario de cierre de diciembre del año anterior (para la variación de enero). */
  previousInventory: InventoryPoint | null
}): YearSummary {
  const sorted = [...input.months].sort((a, b) => a.month - b.month)
  let prevInventory = input.previousInventory

  const months: YearMonth[] = sorted.map((m) => {
    const inventory_change_cents = m.inventory && prevInventory ? m.inventory.value_cents - prevInventory.value_cents : null
    prevInventory = m.inventory
    if (m.daysElapsed === 0) {
      return { month: m.month, status: 'future', statement: null, purchases_cents: 0, supplier_payments_cents: 0, leftover_cents: null, inventory: null, inventory_change_cents: null }
    }
    const statement = buildIncomeStatement({ orders: m.orders, expenses: m.expenses, fixed: input.fixed, daysInMonth: m.daysInMonth, daysElapsed: m.daysElapsed })
    // Solo cuenta un mes con ventas o gastos: uno con solo facturas de
    // proveedor (cargadas de meses en que el sistema no se usaba para vender)
    // mostraría como pérdida los gastos fijos completos.
    const hasData = statement.hasData
    const status: MonthStatus = !hasData ? 'no-data' : m.daysElapsed < m.daysInMonth ? 'open' : 'closed'
    return {
      month: m.month,
      status,
      statement,
      purchases_cents: m.purchases_cents,
      supplier_payments_cents: m.supplier_payments_cents,
      leftover_cents: hasData ? statement.netSales - m.supplier_payments_cents - statement.operatingExpenses - statement.financialExpenses : null,
      inventory: m.inventory,
      inventory_change_cents,
    }
  })

  const counted = months.filter((m) => (m.status === 'open' || m.status === 'closed') && m.statement)
  const sum = (f: (m: YearMonth) => number) => counted.reduce((s, m) => s + f(m), 0)
  const totals: YearTotals = {
    months_counted: counted.length,
    netSales: sum((m) => m.statement!.netSales),
    costOfSales: sum((m) => m.statement!.costOfSales),
    grossProfit: sum((m) => m.statement!.grossProfit),
    operatingExpenses: sum((m) => m.statement!.operatingExpenses),
    financialExpenses: sum((m) => m.statement!.financialExpenses),
    netProfit: sum((m) => m.statement!.netProfit),
    purchases_cents: sum((m) => m.purchases_cents),
    supplier_payments_cents: sum((m) => m.supplier_payments_cents),
    leftover_cents: sum((m) => m.leftover_cents || 0),
    ownerWithdrawals: sum((m) => m.statement!.ownerWithdrawals),
    investments: sum((m) => m.statement!.investments),
    grossMargin: null,
    netMargin: null,
  }
  totals.grossMargin = ratio(totals.grossProfit, totals.netSales)
  totals.netMargin = ratio(totals.netProfit, totals.netSales)

  const n = counted.length
  const averages = n
    ? {
        netSales: totals.netSales / n,
        grossProfit: totals.grossProfit / n,
        netProfit: totals.netProfit / n,
        leftover_cents: totals.leftover_cents / n,
        purchases_cents: totals.purchases_cents / n,
      }
    : null

  return { months, totals, averages }
}
