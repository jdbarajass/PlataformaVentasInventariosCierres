import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Ventas por SisteCrédito que ya se registraron pero todavía no se
// liberan al saldo real (ver migración 00053) — pendientes de que llegue
// el día 1 del mes siguiente a la venta. Solo admin, mismo criterio que
// el resto de Cuentas.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('sistecredito_pending_releases')
      .select('id, account_id, base_amount_cents, margin_pct, sale_date, release_date')
      .is('released_at', null)
      .order('release_date', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching sistecredito pending releases:', error)
    return NextResponse.json(
      { error: 'Error al obtener los pendientes de SisteCrédito' },
      { status: 500 }
    )
  }
}
