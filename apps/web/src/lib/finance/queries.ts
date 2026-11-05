// Consultas compartidas por las APIs de Finanzas (lado servidor, service role).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementExpense, StatementOrder } from './income-statement'
import type { MonthPeriod } from './periods'

const PAGE = 1000

/** Trae todas las filas de una consulta paginando de a 1000 (límite de Supabase). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: any }>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/** Órdenes pagadas del periodo (mostrador + online), con sus ítems y pagos. */
export function fetchPeriodOrders(supabase: SupabaseClient, p: Pick<MonthPeriod, 'fromISO' | 'toISO'>) {
  return fetchAll<StatementOrder>((a, b) =>
    supabase
      .from('orders')
      .select('total_cents, discount_cents, order_items(qty, price_cents, total_cents, cost_cents, discount_cents), payments(commission_cents)')
      .eq('payment_status', 'paid')
      .gte('created_at', p.fromISO)
      .lt('created_at', p.toISO)
      .order('created_at', { ascending: true })
      .range(a, b)
  )
}

/** Gastos (operating_expenses) del periodo, por su fecha. */
export function fetchPeriodExpenses(supabase: SupabaseClient, p: Pick<MonthPeriod, 'fromDate' | 'toDate'>) {
  return fetchAll<StatementExpense>((a, b) =>
    supabase.from('operating_expenses').select('amount_cents, category').gte('date', p.fromDate).lt('date', p.toDate).order('date', { ascending: true }).range(a, b)
  )
}
