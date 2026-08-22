import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr, bogotaMonthRange } from '@/lib/bogota-time'

interface OrderRow {
  total_cents: number
  seller_id: string | null
  seller: { id: string; name: string | null; email: string } | null
}

// GET - Acumulado de ventas de mostrador del mes en curso, desglosado por
// vendedor, más el total del equipo — visible para admin y seller por igual
// (a diferencia de /api/reports/seller-performance, que es admin-only y
// acepta cualquier rango de fechas). Pensado para la tarjeta de meta
// mensual del Dashboard: la meta es del equipo completo, no individual, así
// que todos ven el mismo desglose y el mismo avance (ver
// docs/UNIFICACION_YJBMOTOCOM.md sección 81.15).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const now = new Date()
    const [year, month] = bogotaDateStr(now).split('-').map(Number)
    const { from, to } = bogotaMonthRange(year, month)

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('orders')
      .select('total_cents, seller_id, seller:users!orders_seller_id_fkey(id, name, email)')
      .eq('channel', 'pos')
      .eq('payment_status', 'paid')
      .gte('created_at', from)
      .lt('created_at', to)

    if (error) {
      throw error
    }

    const orders = (data as unknown as OrderRow[]) || []

    const bySeller: Record<string, { seller_id: string | null; name: string; revenue_cents: number }> = {}

    // Incluye a todos los usuarios registrados (admin/seller), aunque no
    // hayan vendido nada aún este mes — mismo patrón que seller-performance,
    // así el equipo completo aparece listado desde el día 1.
    const { data: usersData } = await supabase
      .from('users')
      .select('id, name, email, role')
      .in('role', ['admin', 'seller'])

    for (const u of (usersData || []) as { id: string; name: string | null; email: string; role: string }[]) {
      bySeller[u.id] = { seller_id: u.id, name: u.name || u.email, revenue_cents: 0 }
    }

    orders.forEach((order) => {
      const key = order.seller_id || 'sin_vendedor'
      if (!bySeller[key]) {
        bySeller[key] = {
          seller_id: order.seller_id,
          name: order.seller?.name || order.seller?.email || 'Sin vendedor asignado',
          revenue_cents: 0,
        }
      }
      bySeller[key].revenue_cents += order.total_cents
    })

    const sellers = Object.values(bySeller).sort((a, b) => b.revenue_cents - a.revenue_cents)
    const totalCents = sellers.reduce((sum, s) => sum + s.revenue_cents, 0)

    // Cliente de servicio para la meta/bono: son configuración del negocio,
    // no datos propios del pedido — no dependen de RLS por usuario.
    const serviceSupabase = getServiceSupabase()
    const { data: settings } = await serviceSupabase
      .from('store_settings')
      .select('seller_monthly_goal_cents, seller_goal_bonus_cents')
      .eq('id', 1)
      .single()

    return NextResponse.json({
      data: {
        sellers,
        total_cents: totalCents,
        goal_cents: (settings as any)?.seller_monthly_goal_cents ?? 0,
        bonus_cents: (settings as any)?.seller_goal_bonus_cents ?? 0,
        year,
        month,
      },
    })
  } catch (error) {
    console.error('Error fetching team-sales report:', error)
    return NextResponse.json(
      { error: 'Error al obtener el acumulado de ventas del equipo' },
      { status: 500 }
    )
  }
}
