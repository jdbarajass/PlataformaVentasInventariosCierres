import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr } from '@/lib/bogota-time'
import { monthPeriod } from '@/lib/finance/periods'
import { fetchAll, fetchPeriodExpenses, fetchPeriodOrders } from '@/lib/finance/queries'
import { buildIncomeStatement } from '@/lib/finance/income-statement'
import { fixedMonthlyTotalCents, type FixedMonthlyExpenses } from '@/lib/finance/expense-classes'
import { buildCashFlow, buildPayables, buildReceivables, withdrawable, type CashMovement, type PendingRelease } from '@/lib/finance/cash-flow'

// GET /api/finance/cash-flow?year=YYYY&month=M
// Flujo de caja del mes + por cobrar / por pagar de hoy + cuánto se puede
// retirar (docs/PLAN_CONTROL_FINANCIERO.md, Fase 5). Solo admin (el de solo
// lectura puede ver). No escribe nada.

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) return auth.response

    const params = new URL(request.url).searchParams
    const year = Number(params.get('year'))
    const month = Number(params.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Parámetros year y month inválidos' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const period = monthPeriod(year, month)
    const today = bogotaDateStr(new Date())

    const [
      { data: settings, error: settingsError },
      accounts,
      rawMovements,
      credits,
      creditPayments,
      receivables,
      invoices,
      invoicePayments,
      card,
      addi,
      siste,
      orders,
      expenses,
    ] = await Promise.all([
      supabase.from('store_settings').select('fixed_monthly_expenses').eq('id', 1).single(),
      fetchAll<{ id: string; name: string; balance_cents: number; active: boolean; sort_order: number }>((a, b) =>
        supabase.from('accounts').select('id, name, balance_cents, active, sort_order').order('sort_order').range(a, b)
      ),
      // Desde el inicio del mes hasta hoy: los del mes dan el flujo y los
      // posteriores permiten reconstruir el saldo con que cerró.
      fetchAll<Omit<CashMovement, 'expense_category'> & { reference_id: string | null }>((a, b) =>
        supabase
          .from('account_movements')
          .select('account_id, type, amount_cents, created_at, reference_type, reference_id')
          .gte('created_at', period.fromISO)
          .order('created_at')
          .range(a, b)
      ),
      fetchAll<{ id: string; total_amount_cents: number }>((a, b) =>
        supabase.from('customer_credits').select('id, total_amount_cents').eq('status', 'pending').order('id').range(a, b)
      ),
      fetchAll<{ credit_id: string; amount_cents: number }>((a, b) =>
        supabase.from('customer_credit_payments').select('credit_id, amount_cents').order('id').range(a, b)
      ),
      fetchAll<{ amount_cents: number }>((a, b) => supabase.from('account_receivables').select('amount_cents').order('id').range(a, b)),
      fetchAll<{ id: string; supplier: string; description: string; amount_cents: number; due_date: string | null }>((a, b) =>
        supabase.from('supplier_invoices').select('id, supplier, description, amount_cents, due_date').eq('status', 'pending').order('id').range(a, b)
      ),
      fetchAll<{ invoice_id: string; amount_cents: number }>((a, b) =>
        supabase.from('supplier_invoice_payments').select('invoice_id, amount_cents').order('id').range(a, b)
      ),
      fetchAll<PendingRelease>((a, b) => supabase.from('card_pending_releases').select('amount_cents, release_date').is('released_at', null).order('id').range(a, b)),
      fetchAll<PendingRelease>((a, b) => supabase.from('addi_pending_releases').select('amount_cents, release_date').is('released_at', null).order('id').range(a, b)),
      fetchAll<{ base_amount_cents: number; margin_pct: number; release_date: string }>((a, b) =>
        supabase.from('sistecredito_pending_releases').select('base_amount_cents, margin_pct, release_date').is('released_at', null).order('id').range(a, b)
      ),
      fetchPeriodOrders(supabase, period),
      fetchPeriodExpenses(supabase, period),
    ])
    if (settingsError) throw settingsError
    const fixed = ((settings as any)?.fixed_monthly_expenses || null) as FixedMonthlyExpenses | null

    // Categoría del gasto de cada movimiento de gasto (para separar retiros e inversiones).
    const expenseIds = Array.from(new Set(rawMovements.filter((m) => m.reference_type === 'operating_expense' && m.reference_id).map((m) => m.reference_id as string)))
    const categoryById = new Map<string, string>()
    for (let i = 0; i < expenseIds.length; i += 200) {
      const { data, error } = await supabase.from('operating_expenses').select('id, category').in('id', expenseIds.slice(i, i + 200))
      if (error) throw error
      for (const e of (data as { id: string; category: string }[]) || []) categoryById.set(e.id, e.category)
    }
    const movements: CashMovement[] = rawMovements.map((m) => ({
      ...m,
      expense_category: m.reference_id ? categoryById.get(m.reference_id) ?? null : null,
    }))

    const flow = buildCashFlow({ accounts, movements, fromISO: period.fromISO, toISO: period.toISO })

    const paidByCredit = new Map<string, number>()
    for (const p of creditPayments) paidByCredit.set(p.credit_id, (paidByCredit.get(p.credit_id) || 0) + Number(p.amount_cents))
    const paidByInvoice = new Map<string, number>()
    for (const p of invoicePayments) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + Number(p.amount_cents))

    const receivablesSummary = buildReceivables({
      credits: credits.map((c) => ({ total_amount_cents: Number(c.total_amount_cents), paid_cents: paidByCredit.get(c.id) || 0 })),
      receivables,
      pending: {
        datafono: card,
        addi,
        sistecredito: siste.map((s) => ({ amount_cents: Math.round(Number(s.base_amount_cents) * (1 + Number(s.margin_pct) / 100)), release_date: s.release_date })),
      },
      today,
    })
    const payables = buildPayables(
      invoices.map((i) => ({ supplier: i.supplier, description: i.description, due_date: i.due_date, balance_cents: Number(i.amount_cents) - (paidByInvoice.get(i.id) || 0) })),
      today
    )
    const available = accounts.filter((a) => a.active).reduce((s, a) => s + Number(a.balance_cents), 0)
    const statement = buildIncomeStatement({ orders, expenses, fixed, daysInMonth: period.daysInMonth, daysElapsed: period.daysElapsed })

    return NextResponse.json({
      data: {
        year,
        month,
        today,
        isCurrentMonth: period.daysElapsed > 0 && period.daysElapsed < period.daysInMonth,
        flow,
        netProfit: statement.netProfit,
        receivables: receivablesSummary,
        payables,
        available,
        withdrawable: withdrawable({ available, payables, monthlyFixed: fixedMonthlyTotalCents(fixed) }),
      },
    })
  } catch (error) {
    console.error('Error building cash flow:', error)
    return NextResponse.json({ error: 'Error al calcular el flujo de caja' }, { status: 500 })
  }
}
