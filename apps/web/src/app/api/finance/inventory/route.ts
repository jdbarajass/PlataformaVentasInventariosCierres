import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr, bogotaToISO } from '@/lib/bogota-time'
import { addDays, buildInventoryInsights, type InsightProduct, type InsightSale } from '@/lib/finance/inventory-insights'
import type { InventoryVariantRow } from '@/lib/finance/inventory-value'

// GET /api/finance/inventory?window=90&quiet=90
// Rotación, productos quietos y rentabilidad por categoría/producto
// (docs/PLAN_CONTROL_FINANCIERO.md, Fase 4). Solo admin (el de solo lectura
// puede ver). No escribe nada.

const PAGE = 1000
const WINDOWS = [30, 90, 180, 365]
const QUIET = [60, 90, 180]
// Siempre se mira un año de ventas: así "última venta" es exacta aunque la
// ventana elegida sea corta.
const LOOKBACK_DAYS = 365

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) return auth.response

    const params = new URL(request.url).searchParams
    const windowDays = Number(params.get('window') || 90)
    const quietDays = Number(params.get('quiet') || 90)
    if (!WINDOWS.includes(windowDays) || !QUIET.includes(quietDays)) {
      return NextResponse.json({ error: 'Parámetros window/quiet inválidos' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const today = bogotaDateStr(new Date())
    const fromISO = bogotaToISO(addDays(today, -(LOOKBACK_DAYS - 1)), '00:00')

    const [products, variants, items, movements] = await Promise.all([
      // Incluye los borrados: solo para ubicar sus ventas pasadas en su categoría.
      fetchAll<{ id: string; title: string; cost_cents: number; stock_qty: number; created_at: string; deleted_at: string | null; categories: { name: string } | null }>((a, b) =>
        supabase.from('products').select('id, title, cost_cents, stock_qty, created_at, deleted_at, categories(name)').order('id').range(a, b)
      ),
      fetchAll<InventoryVariantRow>((a, b) =>
        supabase.from('product_variants').select('product_id, cost_cents, stock_qty').order('id').range(a, b)
      ),
      fetchAll<{ product_id: string | null; product_title: string; qty: number; total_cents: number; cost_cents: number | null; orders: { created_at: string } }>((a, b) =>
        supabase
          .from('order_items')
          .select('product_id, product_title, qty, total_cents, cost_cents, orders!inner(created_at, payment_status)')
          .eq('orders.payment_status', 'paid')
          .gte('orders.created_at', fromISO)
          .order('id')
          .range(a, b)
      ),
      fetchAll<{ product_id: string; created_at: string }>((a, b) =>
        supabase.from('inventory_movements').select('product_id, created_at').eq('type', 'in').order('id').range(a, b)
      ),
    ])

    const lastIn: Record<string, string> = {}
    for (const m of movements) {
      const d = bogotaDateStr(new Date(m.created_at))
      if (!lastIn[m.product_id] || d > lastIn[m.product_id]) lastIn[m.product_id] = d
    }

    const insightProducts: InsightProduct[] = products.map((p) => ({
      id: p.id,
      title: p.title,
      cost_cents: p.cost_cents,
      stock_qty: p.stock_qty,
      created_at: p.created_at,
      category: p.categories?.name || null,
      deleted: !!p.deleted_at,
    }))
    const sales: InsightSale[] = items.map((i) => ({
      product_id: i.product_id,
      title: i.product_title,
      qty: i.qty,
      total_cents: i.total_cents,
      cost_cents: i.cost_cents,
      date: bogotaDateStr(new Date(i.orders.created_at)),
    }))

    const insights = buildInventoryInsights({ products: insightProducts, variants, sales, lastIn, today, windowDays, quietDays })
    return NextResponse.json({ data: { today, lookbackDays: LOOKBACK_DAYS, ...insights } })
  } catch (error) {
    console.error('Error building inventory insights:', error)
    return NextResponse.json({ error: 'Error al calcular la rotación del inventario' }, { status: 500 })
  }
}
