import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr } from '@/lib/bogota-time'
import { monthPeriod } from '@/lib/finance/periods'
import { fetchAll, fetchPendingReleases } from '@/lib/finance/queries'
import { buildSalesMonth, type SalesOrder } from '@/lib/finance/sales-month'
import { buildReceivables } from '@/lib/finance/cash-flow'

// GET /api/finance/sales-month?year=YYYY&month=M
// Ventas del mes día por día y por medio de pago (Finanzas → Ventas por día),
// más lo que está por llegar hoy. Solo admin (el de solo lectura puede ver). No escribe.
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
    const [orders, pending] = await Promise.all([
      fetchAll<SalesOrder>((a, b) =>
        supabase
          .from('orders')
          .select('created_at, total_cents, channel, payments(method, amount_cents, commission_cents)')
          .eq('payment_status', 'paid')
          .gte('created_at', p.fromISO)
          .lt('created_at', p.toISO)
          .order('created_at', { ascending: true })
          .range(a, b)
      ),
      fetchPendingReleases(supabase),
    ])

    const today = bogotaDateStr(new Date())
    const sales = buildSalesMonth({ orders, year, month, daysInMonth: p.daysInMonth, daysElapsed: p.daysElapsed })
    const porLlegar = buildReceivables({ credits: [], receivables: [], pending, today }).porLlegar

    return NextResponse.json({ data: { year, month, today, daysInMonth: p.daysInMonth, daysElapsed: p.daysElapsed, ...sales, porLlegar } })
  } catch (error) {
    console.error('Error building sales month:', error)
    return NextResponse.json({ error: 'Error al calcular las ventas del mes' }, { status: 500 })
  }
}
