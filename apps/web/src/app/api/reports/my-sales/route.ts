import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr, bogotaMonthRange } from '@/lib/bogota-time'

// GET - Acumulado de ventas de mostrador del mes en curso PARA QUIEN PIDE
// (no un reporte por vendedor como /api/reports/seller-performance, que es
// solo admin — este siempre responde con las ventas propias de quien tiene
// la sesión, admin o seller). Pensado para la tarjeta de meta mensual del
// Dashboard (ver docs/UNIFICACION_YJBMOTOCOM.md sección 81.12).
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
      .select('total_cents')
      .eq('seller_id', auth.user.id)
      .eq('channel', 'pos')
      .eq('payment_status', 'paid')
      .gte('created_at', from)
      .lt('created_at', to)

    if (error) {
      throw error
    }

    const totalCents = ((data as { total_cents: number }[]) || []).reduce((sum, o) => sum + o.total_cents, 0)

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
        total_cents: totalCents,
        goal_cents: (settings as any)?.seller_monthly_goal_cents ?? 0,
        bonus_cents: (settings as any)?.seller_goal_bonus_cents ?? 0,
        year,
        month,
      },
    })
  } catch (error) {
    console.error('Error fetching my-sales report:', error)
    return NextResponse.json(
      { error: 'Error al obtener el acumulado de ventas' },
      { status: 500 }
    )
  }
}
