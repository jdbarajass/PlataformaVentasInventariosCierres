import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr } from '@/lib/bogota-time'
import { monthPeriod } from '@/lib/finance/periods'
import { buildYearSummary, type InventoryPoint, type YearMonthInput } from '@/lib/finance/year-summary'
import { fetchInventoryValue } from '@/lib/finance/inventory-value'
import type { StatementExpense, StatementOrder } from '@/lib/finance/income-statement'
import type { FixedMonthlyExpenses } from '@/lib/finance/expense-classes'

// GET /api/finance/year?year=YYYY
// Resumen mes a mes del año (docs/PLAN_CONTROL_FINANCIERO.md, Fase 3): el
// "CierreGeneral" del Excel. Solo admin (el de solo lectura puede ver). No escribe.

const PAGE = 1000

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: any }>): Promise<T[]> {
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

/** 'YYYY-MM' de un timestamp en hora de Bogotá. */
const bogotaYearMonth = (iso: string) => bogotaDateStr(new Date(iso)).slice(0, 7)

// Tabla de la migración 00059 todavía sin crear.
const isMissingTable = (error: any) => error?.code === '42P01' || error?.code === 'PGRST205' || /inventory_snapshots/.test(error?.message || '')

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) return auth.response

    const year = Number(new URL(request.url).searchParams.get('year'))
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Parámetro year inválido' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const jan = monthPeriod(year, 1)
    const dec = monthPeriod(year, 12)
    const yearPrefix = String(year)

    const [{ data: settings, error: settingsError }, orders, expenses, invoices, payments] = await Promise.all([
      supabase.from('store_settings').select('fixed_monthly_expenses').eq('id', 1).single(),
      fetchAll<StatementOrder & { created_at: string }>((a, b) =>
        supabase
          .from('orders')
          .select('created_at, total_cents, discount_cents, order_items(qty, price_cents, total_cents, cost_cents, discount_cents), payments(commission_cents)')
          .eq('payment_status', 'paid')
          .gte('created_at', jan.fromISO)
          .lt('created_at', dec.toISO)
          .order('created_at', { ascending: true })
          .range(a, b)
      ),
      fetchAll<StatementExpense & { date: string }>((a, b) =>
        supabase.from('operating_expenses').select('date, amount_cents, category').gte('date', jan.fromDate).lt('date', dec.toDate).order('date').range(a, b)
      ),
      fetchAll<{ id: string; amount_cents: number; arrival_date: string | null; created_at: string; status: string; paid_at: string | null }>((a, b) =>
        supabase.from('supplier_invoices').select('id, amount_cents, arrival_date, created_at, status, paid_at').order('created_at').range(a, b)
      ),
      // Todos los abonos (no solo los del año): se necesitan para saber qué
      // facturas pagadas NO tienen abonos.
      fetchAll<{ invoice_id: string; amount_cents: number; paid_at: string }>((a, b) =>
        supabase.from('supplier_invoice_payments').select('invoice_id, amount_cents, paid_at').order('paid_at').range(a, b)
      ),
    ])
    if (settingsError) throw settingsError
    const fixed = ((settings as any)?.fixed_monthly_expenses || null) as FixedMonthlyExpenses | null

    // Fotos del inventario: las del año + diciembre anterior (para la variación de enero).
    let snapshotsMissing = false
    const snapshots = new Map<string, InventoryPoint>()
    const { data: snapData, error: snapError } = await supabase
      .from('inventory_snapshots')
      .select('year, month, as_of, value_cents, source')
      .or(`year.eq.${year},and(year.eq.${year - 1},month.eq.12)`)
    if (snapError) {
      if (isMissingTable(snapError)) snapshotsMissing = true
      else throw snapError
    }
    for (const s of (snapData as any[]) || []) {
      snapshots.set(`${s.year}-${s.month}`, { value_cents: Number(s.value_cents), as_of: s.as_of, source: s.source })
    }

    // Pagos a proveedores por mes ('YYYY-MM'): abonos por su fecha + facturas
    // marcadas pagadas sin ningún abono (se pagaron por fuera del sistema:
    // así se cargaron las de feb-jul 2026), por su fecha de pago o de llegada.
    const invoiceYM = (i: { arrival_date: string | null; created_at: string }) => (i.arrival_date ? i.arrival_date.slice(0, 7) : bogotaYearMonth(i.created_at))
    const withAbonos = new Set(payments.map((p) => p.invoice_id))
    const paidByMonth = new Map<string, number>()
    const addPaid = (ym: string, cents: number) => paidByMonth.set(ym, (paidByMonth.get(ym) || 0) + cents)
    for (const p of payments) addPaid(p.paid_at.slice(0, 7), Number(p.amount_cents || 0))
    for (const i of invoices) {
      if (i.status === 'paid' && !withAbonos.has(i.id)) addPaid(i.paid_at ? i.paid_at.slice(0, 7) : invoiceYM(i), Number(i.amount_cents || 0))
    }

    const todayYM = bogotaDateStr(new Date()).slice(0, 7)
    const months: YearMonthInput[] = []
    let liveInventory: InventoryPoint | null = null
    for (let m = 1; m <= 12; m++) {
      const p = monthPeriod(year, m)
      const ym = `${yearPrefix}-${String(m).padStart(2, '0')}`
      let inventory = snapshots.get(`${year}-${m}`) || null
      // Mes en curso: el valor de hoy, en vivo (la foto se sigue actualizando hasta fin de mes).
      if (ym === todayYM) {
        const v = await fetchInventoryValue(supabase)
        liveInventory = { value_cents: v.value_cents, as_of: bogotaDateStr(new Date()), source: 'live' }
        inventory = liveInventory
      }
      months.push({
        month: m,
        orders: orders.filter((o) => bogotaYearMonth(o.created_at) === ym),
        expenses: expenses.filter((e) => e.date.slice(0, 7) === ym),
        purchases_cents: invoices.filter((i) => invoiceYM(i) === ym).reduce((s, i) => s + Number(i.amount_cents || 0), 0),
        supplier_payments_cents: paidByMonth.get(ym) || 0,
        inventory,
        daysInMonth: p.daysInMonth,
        daysElapsed: p.daysElapsed,
      })
    }

    const summary = buildYearSummary({ months, fixed, previousInventory: snapshots.get(`${year - 1}-12`) || null })

    return NextResponse.json({ data: { year, ...summary, snapshotsMissing, hasLiveInventory: !!liveInventory } })
  } catch (error) {
    console.error('Error building year summary:', error)
    return NextResponse.json({ error: 'Error al calcular el resumen del año' }, { status: 500 })
  }
}
