import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { monthPeriod } from '@/lib/finance/periods'
import { fetchAll } from '@/lib/finance/queries'
import { buildExpensesMonth, type MonthExpense } from '@/lib/finance/expenses-month'
import type { FixedMonthlyExpenses } from '@/lib/finance/expense-classes'

// GET /api/finance/expenses-month?year=YYYY&month=M
// Gastos del mes con su clase, totales y estado de los gastos fijos
// (Finanzas → Gastos). Solo admin (el de solo lectura puede ver). No escribe:
// registrar/editar/borrar usa /api/operating-expenses, igual que Ventas del Día.
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
    const p = monthPeriod(year, month)
    const [{ data: settings, error: settingsError }, expenses, accounts] = await Promise.all([
      supabase.from('store_settings').select('fixed_monthly_expenses').eq('id', 1).single(),
      fetchAll<MonthExpense>((a, b) =>
        supabase
          .from('operating_expenses')
          .select('id, date, description, amount_cents, category, account_id')
          .gte('date', p.fromDate)
          .lt('date', p.toDate)
          .order('date')
          .range(a, b)
      ),
      fetchAll<{ id: string; name: string; active: boolean; balance_cents: number; sort_order: number }>((a, b) =>
        supabase.from('accounts').select('id, name, active, balance_cents, sort_order').order('sort_order').range(a, b)
      ),
    ])
    if (settingsError) throw settingsError
    const fixed = ((settings as any)?.fixed_monthly_expenses || null) as FixedMonthlyExpenses | null

    const summary = buildExpensesMonth({ expenses: expenses.map((e) => ({ ...e, amount_cents: Number(e.amount_cents) })), accounts, fixed })
    return NextResponse.json({
      data: {
        year,
        month,
        fromDate: p.fromDate,
        toDate: p.toDate,
        daysInMonth: p.daysInMonth,
        daysElapsed: p.daysElapsed,
        fixedConfig: fixed,
        accounts: accounts.map((a) => ({ id: a.id, name: a.name, active: a.active, balance_cents: Number(a.balance_cents) })),
        ...summary,
      },
    })
  } catch (error) {
    console.error('Error building expenses month:', error)
    return NextResponse.json({ error: 'Error al cargar los gastos del mes' }, { status: 500 })
  }
}
