// Estado de resultados de un periodo (docs/PLAN_CONTROL_FINANCIERO.md, Fase 2).
//
// Funciones puras: reciben las filas ya consultadas y devuelven los números.
// Toda pantalla que muestre utilidad, márgenes o punto de equilibrio debe
// salir de aquí, para que las fórmulas vivan en un solo lugar.
//
// Reglas del negocio que se respetan:
// - Ventas netas = Σ orders.total_cents pagadas (lo mismo que "Ingresos" en
//   Historial Mensual y Reportes).
// - Costo de lo vendido = Σ qty × cost_cents guardado al vender (costo real).
// - La comisión del medio de pago NO resta: se traslada al cliente como
//   sobreprecio (docs/UNIFICACION_YJBMOTOCOM.md 4.3). Se muestra informativa.
// - Gastos: lib/finance/expense-classes.ts (sin retiros, inversiones ni pagos
//   ya contados en gastos fijos). Así la utilidad neta de aquí es la misma
//   "utilidad real" de Historial Mensual.
// - Sin impuestos: el sistema no los maneja; la utilidad neta es antes de impuestos.
// - División por cero → null (la pantalla muestra "—").

import {
  expenseClass,
  countsInUtility,
  isCoveredByFixed,
  fixedMonthlyTotalCents,
  type ExpenseClass,
  type FixedMonthlyExpenses,
} from './expense-classes'

export interface StatementOrderItem {
  qty: number
  price_cents: number
  total_cents: number
  cost_cents: number | null
  discount_cents: number | null
}

export interface StatementOrder {
  total_cents: number
  discount_cents?: number | null
  order_items: StatementOrderItem[] | null
  payments: { commission_cents: number | null }[] | null
}

export interface StatementExpense {
  amount_cents: number
  category: string | null
}

export interface StatementInput {
  orders: StatementOrder[]
  expenses: StatementExpense[]
  fixed: FixedMonthlyExpenses | null
  /** Días calendario del mes. */
  daysInMonth: number
  /** Días ya transcurridos (para la proyección). Igual a daysInMonth en meses cerrados. */
  daysElapsed: number
}

export interface ExpenseLine {
  category: string
  cls: ExpenseClass
  amount_cents: number
  /** true si resta de la utilidad. */
  counted: boolean
  /** true si no resta porque ya está en gastos fijos. */
  coveredByFixed: boolean
}

export interface IncomeStatement {
  /**
   * false si el periodo no tiene ni ventas ni gastos registrados (ej. antes de
   * que el sistema empezara a usarse). No se debe comparar contra un periodo
   * así: sus gastos fijos darían una "pérdida" que nunca existió.
   */
  hasData: boolean
  // Ventas
  grossSales: number
  discounts: number
  netSales: number
  transactions: number
  units: number
  averageTicket: number | null
  // Costo y utilidad bruta
  costOfSales: number
  grossProfit: number
  grossMargin: number | null
  markup: number | null
  itemsWithoutCost: { lines: number; sales_cents: number }
  commissions: number
  // Gastos
  fixedExpenses: number
  operatingExpenses: number
  financialExpenses: number
  expenseLines: ExpenseLine[]
  ownerWithdrawals: number
  investments: number
  coveredByFixed: number
  payroll: number
  // Resultados
  operatingProfit: number
  netProfit: number
  netMargin: number | null
  expensesToSales: number | null
  payrollToSales: number | null
  // Punto de equilibrio
  breakEvenSales: number | null
  breakEvenDaily: number | null
  openDays: number
  // Proyección (estimado, solo útil en el mes en curso)
  projectedNetSales: number | null
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

/** Ventas necesarias para cubrir los gastos y además ganar `targetProfit`. */
export function salesForTargetProfit(totalExpenses: number, targetProfit: number, grossMargin: number | null): number | null {
  if (grossMargin === null || grossMargin <= 0) return null
  return (totalExpenses + targetProfit) / grossMargin
}

/** Cambio porcentual de `previous` a `current` (null si no hay base). */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null
  return (current - previous) / Math.abs(previous)
}

export function buildIncomeStatement(input: StatementInput): IncomeStatement {
  const { orders, expenses, fixed } = input

  let grossSales = 0
  let itemDiscounts = 0
  let orderDiscounts = 0
  let netSales = 0
  let units = 0
  let costOfSales = 0
  let commissions = 0
  const itemsWithoutCost = { lines: 0, sales_cents: 0 }

  for (const o of orders) {
    netSales += o.total_cents || 0
    orderDiscounts += o.discount_cents || 0
    for (const i of o.order_items || []) {
      grossSales += i.qty * (i.price_cents || 0)
      itemDiscounts += i.discount_cents || 0
      units += i.qty
      costOfSales += i.qty * (i.cost_cents || 0)
      if (!i.cost_cents && i.total_cents > 0) {
        itemsWithoutCost.lines += 1
        itemsWithoutCost.sales_cents += i.total_cents
      }
    }
    for (const p of o.payments || []) commissions += p.commission_cents || 0
  }

  const transactions = orders.length
  const grossProfit = netSales - costOfSales
  const grossMargin = ratio(grossProfit, netSales)

  // Gastos agrupados por categoría.
  const byCategory = new Map<string, number>()
  for (const e of expenses) {
    const key = (e.category || 'Sin categoría').trim() || 'Sin categoría'
    byCategory.set(key, (byCategory.get(key) || 0) + e.amount_cents)
  }
  const expenseLines: ExpenseLine[] = Array.from(byCategory.entries())
    .map(([category, amount_cents]) => ({
      category,
      cls: expenseClass(category),
      amount_cents,
      counted: countsInUtility(category, fixed),
      coveredByFixed: expenseClass(category) === 'operativo' && isCoveredByFixed(category, fixed),
    }))
    .sort((a, b) => b.amount_cents - a.amount_cents)

  const sumWhere = (pred: (l: ExpenseLine) => boolean) => expenseLines.filter(pred).reduce((s, l) => s + l.amount_cents, 0)

  const fixedExpenses = fixedMonthlyTotalCents(fixed)
  const operatingExpenses = fixedExpenses + sumWhere((l) => l.counted && l.cls === 'operativo')
  const financialExpenses = sumWhere((l) => l.counted && l.cls === 'financiero')
  const ownerWithdrawals = sumWhere((l) => l.cls === 'retiro')
  const investments = sumWhere((l) => l.cls === 'inversion')
  const coveredByFixed = sumWhere((l) => l.coveredByFixed)
  const payroll = fixed && fixed.sueldo_cents > 0 ? fixed.sueldo_cents : sumWhere((l) => l.category === 'Sueldo')

  const operatingProfit = grossProfit - operatingExpenses
  const netProfit = operatingProfit - financialExpenses
  const totalExpenses = operatingExpenses + financialExpenses

  const openDays = fixed?.dias_mes && fixed.dias_mes > 0 ? fixed.dias_mes : 30
  const breakEvenSales = salesForTargetProfit(totalExpenses, 0, grossMargin)

  const projectedNetSales =
    input.daysElapsed > 0 && input.daysElapsed < input.daysInMonth
      ? (netSales / input.daysElapsed) * input.daysInMonth
      : null

  return {
    hasData: transactions > 0 || expenses.length > 0,
    grossSales,
    discounts: itemDiscounts + orderDiscounts,
    netSales,
    transactions,
    units,
    averageTicket: ratio(netSales, transactions),
    costOfSales,
    grossProfit,
    grossMargin,
    markup: ratio(grossProfit, costOfSales),
    itemsWithoutCost,
    commissions,
    fixedExpenses,
    operatingExpenses,
    financialExpenses,
    expenseLines,
    ownerWithdrawals,
    investments,
    coveredByFixed,
    payroll,
    operatingProfit,
    netProfit,
    netMargin: ratio(netProfit, netSales),
    expensesToSales: ratio(totalExpenses, netSales),
    payrollToSales: ratio(payroll, netSales),
    breakEvenSales,
    breakEvenDaily: breakEvenSales === null ? null : breakEvenSales / openDays,
    openDays,
    projectedNetSales,
  }
}
