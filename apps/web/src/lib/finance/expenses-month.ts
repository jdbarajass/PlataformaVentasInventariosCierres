// Gastos del mes (Finanzas → Gastos), al estilo de Cuentas → Gastos de KOAJ.
// Función pura: enriquece cada gasto con su clase y si resta utilidad, y arma
// los totales y el estado de los gastos fijos del mes.

import {
  expenseClass,
  countsInUtility,
  isCoveredByFixed,
  fixedMonthlyTotalCents,
  type ExpenseClass,
  type FixedMonthlyExpenses,
} from './expense-classes'

export interface MonthExpense {
  id: string
  date: string
  description: string
  amount_cents: number
  category: string
  account_id: string | null
}

export interface ExpenseRow extends MonthExpense {
  cls: ExpenseClass
  counted: boolean
  coveredByFixed: boolean
  account_name: string | null
}

export type FixedStatus = 'pagado' | 'parcial' | 'pendiente' | 'sin_valor' | 'sin_seguimiento'

export interface FixedItem {
  key: 'arriendo' | 'sueldo' | 'servicios' | 'otros'
  label: string
  configured: number
  registered: number
  categories: string[]
  status: FixedStatus
}

export interface ExpensesMonth {
  rows: ExpenseRow[]
  totals: { out: number; counted: number; notCounted: number; count: number }
  byCategory: { category: string; cls: ExpenseClass; cents: number; count: number }[]
  byAccount: { account: string; cents: number }[]
  fixed: { items: FixedItem[]; configuredTotal: number }
}

const FIXED_DEF: { key: FixedItem['key']; label: string; field: keyof FixedMonthlyExpenses; categories: string[] }[] = [
  { key: 'arriendo', label: 'Arriendo', field: 'arriendo_cents', categories: ['Arriendo'] },
  { key: 'sueldo', label: 'Sueldo', field: 'sueldo_cents', categories: ['Sueldo'] },
  { key: 'servicios', label: 'Servicios (luz, agua, internet)', field: 'servicios_cents', categories: ['Luz', 'Servicios'] },
  { key: 'otros', label: 'Otros gastos fijos', field: 'otros_gastos_cents', categories: [] },
]

export function buildExpensesMonth(input: {
  expenses: MonthExpense[]
  accounts: { id: string; name: string }[]
  fixed: FixedMonthlyExpenses | null
}): ExpensesMonth {
  const accountName = new Map(input.accounts.map((a) => [a.id, a.name]))
  const rows: ExpenseRow[] = input.expenses
    .map((e) => ({
      ...e,
      cls: expenseClass(e.category),
      counted: countsInUtility(e.category, input.fixed),
      coveredByFixed: expenseClass(e.category) === 'operativo' && isCoveredByFixed(e.category, input.fixed),
      account_name: e.account_id ? accountName.get(e.account_id) ?? 'Cuenta borrada' : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const out = rows.reduce((s, r) => s + r.amount_cents, 0)
  const counted = rows.filter((r) => r.counted).reduce((s, r) => s + r.amount_cents, 0)

  const cat = new Map<string, { category: string; cls: ExpenseClass; cents: number; count: number }>()
  const acc = new Map<string, number>()
  for (const r of rows) {
    const c = cat.get(r.category) || { category: r.category, cls: r.cls, cents: 0, count: 0 }
    c.cents += r.amount_cents
    c.count += 1
    cat.set(r.category, c)
    const a = r.account_name || 'Sin cuenta'
    acc.set(a, (acc.get(a) || 0) + r.amount_cents)
  }

  const items: FixedItem[] = FIXED_DEF.map((d) => {
    const configured = Number(input.fixed?.[d.field] || 0)
    const registered = rows.filter((r) => d.categories.includes(r.category)).reduce((s, r) => s + r.amount_cents, 0)
    let status: FixedStatus
    if (!d.categories.length) status = configured > 0 ? 'sin_seguimiento' : 'sin_valor'
    else if (configured <= 0) status = 'sin_valor'
    else if (registered >= configured) status = 'pagado'
    else if (registered > 0) status = 'parcial'
    else status = 'pendiente'
    return { key: d.key, label: d.label, configured, registered, categories: d.categories, status }
  })

  return {
    rows,
    totals: { out, counted, notCounted: out - counted, count: rows.length },
    byCategory: Array.from(cat.values()).sort((a, b) => b.cents - a.cents),
    byAccount: Array.from(acc.entries()).map(([account, cents]) => ({ account, cents })).sort((a, b) => b.cents - a.cents),
    fixed: { items, configuredTotal: fixedMonthlyTotalCents(input.fixed) },
  }
}

export interface ExpenseFilters {
  search: string
  account: string // '' = todas, '__none__' = sin cuenta, o el id
  category: string
  cls: '' | ExpenseClass | 'resta' | 'no_resta'
  from: string
  to: string
}

/** Filtra solo la lista (los totales de arriba son del mes completo). */
export function filterExpenseRows(rows: ExpenseRow[], f: ExpenseFilters): ExpenseRow[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (q && !`${r.description} ${r.category} ${r.account_name || ''}`.toLowerCase().includes(q)) return false
    if (f.account === '__none__' ? r.account_id !== null : f.account && r.account_id !== f.account) return false
    if (f.category && r.category !== f.category) return false
    if (f.cls === 'resta' && !r.counted) return false
    if (f.cls === 'no_resta' && r.counted) return false
    if (f.cls && f.cls !== 'resta' && f.cls !== 'no_resta' && r.cls !== f.cls) return false
    if (f.from && r.date < f.from) return false
    if (f.to && r.date > f.to) return false
    return true
  })
}
