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

/**
 * Ventas por Datáfono, Addi y SisteCrédito que todavía no llegan a las cuentas
 * (released_at vacío). SisteCrédito llega con su margen: base × (1 + margen %).
 */
export async function fetchPendingReleases(supabase: SupabaseClient): Promise<Record<string, { amount_cents: number; release_date: string }[]>> {
  const [card, addi, siste] = await Promise.all([
    fetchAll<{ amount_cents: number; release_date: string }>((a, b) =>
      supabase.from('card_pending_releases').select('amount_cents, release_date').is('released_at', null).order('id').range(a, b)
    ),
    fetchAll<{ amount_cents: number; release_date: string }>((a, b) =>
      supabase.from('addi_pending_releases').select('amount_cents, release_date').is('released_at', null).order('id').range(a, b)
    ),
    fetchAll<{ base_amount_cents: number; margin_pct: number; release_date: string }>((a, b) =>
      supabase.from('sistecredito_pending_releases').select('base_amount_cents, margin_pct, release_date').is('released_at', null).order('id').range(a, b)
    ),
  ])
  return {
    datafono: card.map((r) => ({ amount_cents: Number(r.amount_cents), release_date: r.release_date })),
    addi: addi.map((r) => ({ amount_cents: Number(r.amount_cents), release_date: r.release_date })),
    sistecredito: siste.map((s) => ({ amount_cents: Math.round(Number(s.base_amount_cents) * (1 + Number(s.margin_pct) / 100)), release_date: s.release_date })),
  }
}
