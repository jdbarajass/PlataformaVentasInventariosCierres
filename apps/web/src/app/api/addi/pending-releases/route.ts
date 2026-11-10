import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { fetchAll } from '@/lib/finance/queries'

// GET - Ventas por Addi (plan de 7 días) pendientes de desembolso o ya
// liberadas al saldo real (ver migración 00056) -- se liberan solas en
// su fecha de pago vía cron. Mismo patrón que
// /api/sistecredito/pending-releases y /api/card-payments/pending-releases.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    // Paginado: Supabase corta cada consulta en 1000 filas y esta tabla
    // guarda todo el historial (el detalle de Cuentas muestra lo ya llegado).
    const data = await fetchAll((a, b) =>
      supabase
        .from('addi_pending_releases')
        .select('id, account_id, order_id, amount_cents, sale_date, release_date, released_at, order:orders(order_number, customer_name)')
        .order('sale_date', { ascending: false })
        .order('id')
        .range(a, b)
    )

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching addi pending releases:', error)
    return NextResponse.json(
      { error: 'Error al obtener los pendientes de Addi' },
      { status: 500 }
    )
  }
}
