import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Ventas por datáfono (método 'card') pendientes de desembolso o ya
// liberadas al saldo real (ver migración 00055) -- se liberan solas el
// siguiente día hábil colombiano vía cron. Mismo patrón que
// /api/sistecredito/pending-releases.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('card_pending_releases')
      .select('id, account_id, order_id, amount_cents, sale_date, release_date, released_at')
      .order('sale_date', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching card pending releases:', error)
    return NextResponse.json(
      { error: 'Error al obtener los pendientes de Datáfono' },
      { status: 500 }
    )
  }
}
