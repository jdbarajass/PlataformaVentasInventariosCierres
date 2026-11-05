// Flujo de caja, por cobrar, por pagar y "cuánto se puede retirar"
// (docs/PLAN_CONTROL_FINANCIERO.md, Fase 5). Funciones puras.
//
// El saldo de cada cuenta solo cambia con un movimiento (account_movements,
// monto con signo: las salidas son negativas), así que:
//   saldo final del mes   = saldo de hoy − movimientos posteriores al mes
//   saldo inicial del mes = saldo final − movimientos del mes
// Los traslados entre cuentas propias (transfer_in / transfer_out) no son
// entrada ni salida del negocio: se muestran aparte y suman cero.
// Las ventas por Addi, datáfono y SisteCrédito NO entran al saldo hasta que
// el pago llega (tablas *_pending_releases): mientras tanto son "por llegar".

import { expenseClass, type ExpenseClass } from './expense-classes'

export interface CashAccount { id: string; name: string; balance_cents: number; active: boolean }

export interface CashMovement {
  account_id: string
  type: string
  amount_cents: number
  created_at: string
  reference_type: string | null
  /** Categoría del gasto si el movimiento viene de operating_expenses (null si el gasto ya no existe). */
  expense_category?: string | null
}

export type FlowConcept =
  | 'ventas'
  | 'liberaciones'
  | 'abonos_fiado'
  | 'ajustes'
  | 'gastos'
  | 'proveedores'
  | 'retiros'
  | 'inversiones'
  | 'traslados'

export const FLOW_CONCEPT_LABEL: Record<FlowConcept, string> = {
  ventas: 'Ventas cobradas',
  liberaciones: 'Llegó plata de Addi, datáfono y SisteCrédito',
  abonos_fiado: 'Abonos de fiado',
  ajustes: 'Ajustes manuales',
  gastos: 'Gastos del negocio',
  proveedores: 'Pagos a proveedores',
  retiros: 'Retiros del dueño',
  inversiones: 'Inversiones',
  traslados: 'Traslados entre cuentas propias',
}

const EXPENSE_CONCEPT: Record<ExpenseClass, FlowConcept> = {
  operativo: 'gastos',
  financiero: 'gastos',
  retiro: 'retiros',
  inversion: 'inversiones',
}

export function movementConcept(m: Pick<CashMovement, 'type' | 'reference_type' | 'expense_category'>): FlowConcept {
  switch (m.type) {
    case 'sale':
    case 'sale_reversal':
      return 'ventas'
    case 'sistecredito_release':
    case 'card_release':
    case 'addi_release':
      return 'liberaciones'
    case 'credit_payment':
    case 'credit_payment_reversal':
      return 'abonos_fiado'
    case 'transfer_in':
    case 'transfer_out':
      return 'traslados'
    case 'invoice_payment':
      return 'proveedores'
    case 'operating_expense':
      return EXPENSE_CONCEPT[expenseClass(m.expense_category)]
    case 'expense_reversal':
      // Reversa al borrar una factura de proveedor o un gasto.
      return m.reference_type === 'supplier_invoice' ? 'proveedores' : EXPENSE_CONCEPT[expenseClass(m.expense_category)]
    default:
      return 'ajustes'
  }
}

export interface AccountFlow {
  id: string
  name: string
  active: boolean
  opening: number
  inflows: number
  outflows: number
  closing: number
  current: number
}

export interface CashFlow {
  accounts: AccountFlow[]
  opening: number
  closing: number
  current: number
  /** Neto por concepto en el periodo (positivo = entró, negativo = salió). */
  concepts: { concept: FlowConcept; net: number }[]
  inflows: number
  outflows: number
  netFlow: number
  transfersMoved: number
}

export function buildCashFlow(input: {
  accounts: CashAccount[]
  /** Movimientos desde el inicio del periodo hasta hoy. */
  movements: CashMovement[]
  fromISO: string
  toISO: string
}): CashFlow {
  const { accounts, movements, fromISO, toISO } = input
  const inPeriod = (m: CashMovement) => m.created_at >= fromISO && m.created_at < toISO
  const after = (m: CashMovement) => m.created_at >= toISO

  const accountFlows: AccountFlow[] = accounts.map((a) => {
    const mine = movements.filter((m) => m.account_id === a.id)
    const afterSum = mine.filter(after).reduce((s, m) => s + m.amount_cents, 0)
    const period = mine.filter(inPeriod)
    const closing = a.balance_cents - afterSum
    const net = period.reduce((s, m) => s + m.amount_cents, 0)
    return {
      id: a.id,
      name: a.name,
      active: a.active,
      opening: closing - net,
      inflows: period.filter((m) => m.amount_cents > 0).reduce((s, m) => s + m.amount_cents, 0),
      outflows: period.filter((m) => m.amount_cents < 0).reduce((s, m) => s - m.amount_cents, 0),
      closing,
      current: a.balance_cents,
    }
  })

  const byConcept = new Map<FlowConcept, number>()
  let transfersMoved = 0
  for (const m of movements.filter(inPeriod)) {
    const c = movementConcept(m)
    byConcept.set(c, (byConcept.get(c) || 0) + m.amount_cents)
    if (c === 'traslados' && m.amount_cents > 0) transfersMoved += m.amount_cents
  }
  const order: FlowConcept[] = ['ventas', 'liberaciones', 'abonos_fiado', 'ajustes', 'gastos', 'proveedores', 'retiros', 'inversiones']
  const concepts = order.filter((c) => byConcept.has(c)).map((c) => ({ concept: c, net: byConcept.get(c)! }))
  const inflows = concepts.filter((c) => c.net > 0).reduce((s, c) => s + c.net, 0)
  const outflows = concepts.filter((c) => c.net < 0).reduce((s, c) => s - c.net, 0)

  const sum = (f: (a: AccountFlow) => number) => accountFlows.reduce((s, a) => s + f(a), 0)
  return {
    accounts: accountFlows,
    opening: sum((a) => a.opening),
    closing: sum((a) => a.closing),
    current: sum((a) => a.current),
    concepts,
    inflows,
    outflows,
    netFlow: inflows - outflows + (byConcept.get('traslados') || 0),
    transfersMoved,
  }
}

// ---------- Por cobrar y por pagar (foto de hoy) ----------

export interface PendingRelease { amount_cents: number; release_date: string }

export interface Receivables {
  fiado: { count: number; cents: number }
  porCobrar: { count: number; cents: number }
  porLlegar: { cents: number; atrasado_cents: number; byMethod: { method: string; cents: number; atrasado_cents: number; next_date: string | null }[] }
  total: number
}

export function buildReceivables(input: {
  credits: { total_amount_cents: number; paid_cents: number }[]
  receivables: { amount_cents: number }[]
  pending: Record<string, PendingRelease[]>
  today: string
}): Receivables {
  const fiadoRows = input.credits.map((c) => Math.max(c.total_amount_cents - c.paid_cents, 0)).filter((v) => v > 0)
  const fiado = { count: fiadoRows.length, cents: fiadoRows.reduce((s, v) => s + v, 0) }
  const porCobrar = { count: input.receivables.length, cents: input.receivables.reduce((s, r) => s + r.amount_cents, 0) }
  const byMethod = Object.entries(input.pending).map(([method, rows]) => {
    const future = rows.filter((r) => r.release_date > input.today)
    return {
      method,
      cents: rows.reduce((s, r) => s + r.amount_cents, 0),
      atrasado_cents: rows.filter((r) => r.release_date <= input.today).reduce((s, r) => s + r.amount_cents, 0),
      next_date: future.length ? future.map((r) => r.release_date).sort()[0] : null,
    }
  }).filter((m) => m.cents > 0)
  const porLlegar = {
    cents: byMethod.reduce((s, m) => s + m.cents, 0),
    atrasado_cents: byMethod.reduce((s, m) => s + m.atrasado_cents, 0),
    byMethod,
  }
  return { fiado, porCobrar, porLlegar, total: fiado.cents + porCobrar.cents + porLlegar.cents }
}

export interface PayableInvoice { supplier: string; description: string; balance_cents: number; due_date: string | null }

export interface Payables {
  total: number
  vencido: number
  next30: number
  later: number
  sinFecha: number
  invoices: (PayableInvoice & { status: 'vencida' | 'proxima' | 'despues' | 'sin_fecha'; days_to_due: number | null })[]
}

const DAY = 86_400_000
const daysTo = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

export function buildPayables(invoices: PayableInvoice[], today: string): Payables {
  const rows = invoices
    .filter((i) => i.balance_cents > 0)
    .map((i) => {
      const d = i.due_date ? daysTo(today, i.due_date) : null
      const status: Payables['invoices'][number]['status'] = d === null ? 'sin_fecha' : d < 0 ? 'vencida' : d <= 30 ? 'proxima' : 'despues'
      return { ...i, status, days_to_due: d }
    })
    .sort((a, b) => (a.days_to_due ?? 99999) - (b.days_to_due ?? 99999))
  const sum = (st: string) => rows.filter((r) => r.status === st).reduce((s, r) => s + r.balance_cents, 0)
  return {
    total: rows.reduce((s, r) => s + r.balance_cents, 0),
    vencido: sum('vencida'),
    next30: sum('proxima'),
    later: sum('despues'),
    sinFecha: sum('sin_fecha'),
    invoices: rows,
  }
}

/**
 * Cuánto se puede retirar sin poner en riesgo la operación (ESTIMADO):
 * plata en las cuentas − lo que hay que pagar a proveedores en 30 días (incluye lo vencido y lo sin fecha)
 * − un mes de gastos fijos. Lo que está por llegar (Addi, datáfono…) NO se cuenta hasta que llegue.
 */
export function withdrawable(input: { available: number; payables: Payables; monthlyFixed: number }) {
  const reserveSuppliers = input.payables.vencido + input.payables.next30 + input.payables.sinFecha
  const value = input.available - reserveSuppliers - input.monthlyFixed
  return { value: Math.max(value, 0), shortfall: value < 0 ? -value : 0, reserveSuppliers, reserveFixed: input.monthlyFixed }
}
