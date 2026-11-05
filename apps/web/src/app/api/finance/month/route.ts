import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { buildIncomeStatement, type StatementOrder, type StatementExpense } from '@/lib/finance/income-statement'
import { monthPeriod, shiftMonth, truncatePeriod, type MonthPeriod } from '@/lib/finance/periods'
import type { FixedMonthlyExpenses } from '@/lib/finance/expense-classes'

// GET /api/finance/month?year=YYYY&month=M
// Estado de resultados del mes pedido, del mes anterior y del mismo mes del
// año anterior (docs/PLAN_CONTROL_FINANCIERO.md, Fase 2). Solo admin (el
// admin de solo lectura también puede leer: requireAuth lo deja pasar en GET).
// Solo lectura: no escribe nada.

const PAGE = 1000

async function fetchOrders(supabase: ReturnType<typeof getServiceSupabase>, p: MonthPeriod): Promise<StatementOrder[]> {
  const rows: StatementOrder[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select('total_cents, discount_cents, order_items(qty, price_cents, total_cents, cost_cents, discount_cents), payments(commission_cents)')
      .eq('payment_status', 'paid')
      .gte('created_at', p.fromISO)
      .lt('created_at', p.toISO)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data as unknown as StatementOrder[]) || []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

async function fetchExpenses(supabase: ReturnType<typeof getServiceSupabase>, p: MonthPeriod): Promise<StatementExpense[]> {
  const rows: StatementExpense[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('operating_expenses')
      .select('amount_cents, category')
      .gte('date', p.fromDate)
      .lt('date', p.toDate)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data as StatementExpense[]) || []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) return auth.response

    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year'))
    const month = Number(searchParams.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Parámetros year y month inválidos' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    const { data: settings, error: settingsError } = await supabase
      .from('store_settings')
      .select('fixed_monthly_expenses')
      .eq('id', 1)
      .single()
    if (settingsError) throw settingsError
    const fixed = ((settings as any)?.fixed_monthly_expenses || null) as FixedMonthlyExpenses | null

    const prev = shiftMonth(year, month, -1)
    const current = monthPeriod(year, month)
    // Mes en curso: se compara contra los MISMOS días del mes anterior y del
    // año pasado (5 días de noviembre contra el 1-5 de octubre, no contra
    // octubre completo). Un mes cerrado se compara completo.
    const partial = current.daysElapsed > 0 && current.daysElapsed < current.daysInMonth
    const compareDays = partial ? current.daysElapsed : Infinity
    const periods = [
      current,
      truncatePeriod(monthPeriod(prev.year, prev.month), compareDays),
      truncatePeriod(monthPeriod(year - 1, month), compareDays),
    ]

    const statements = await Promise.all(
      periods.map(async (p) => {
        const [orders, expenses] = await Promise.all([fetchOrders(supabase, p), fetchExpenses(supabase, p)])
        return {
          year: p.year,
          month: p.month,
          // Último día incluido ('YYYY-MM-DD'): en los periodos de comparación
          // de un mes en curso es el mismo día del mes que hoy.
          lastDay: new Date(Date.parse(`${p.toDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10),
          daysInMonth: p.daysInMonth,
          daysElapsed: p.daysElapsed,
          statement: buildIncomeStatement({ orders, expenses, fixed, daysInMonth: p.daysInMonth, daysElapsed: p.daysElapsed }),
        }
      })
    )

    return NextResponse.json({
      data: {
        current: statements[0],
        previous: statements[1],
        lastYear: statements[2],
        // Los gastos fijos no tienen historial: los tres meses usan la
        // configuración actual. La pantalla lo advierte.
        fixedConfig: fixed,
        comparedSameDays: partial,
      },
    })
  } catch (error) {
    console.error('Error building income statement:', error)
    return NextResponse.json({ error: 'Error al calcular el estado de resultados' }, { status: 500 })
  }
}
