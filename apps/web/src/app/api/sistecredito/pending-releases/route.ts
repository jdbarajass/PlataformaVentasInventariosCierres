import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { fetchAll } from '@/lib/finance/queries'

// GET - Ventas por SisteCrédito (ver migración 00053/00054): todas, con su
// estado (pendiente o ya liberada al saldo real) y fecha de liberación —
// usado tanto para el resumen (solo pendientes) como para el detalle de
// "Por Cobrar" (todas, con estado). Solo admin, mismo criterio que el
// resto de Cuentas.
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
        .from('sistecredito_pending_releases')
        .select('id, account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date, released_at, order:orders(order_number, customer_name)')
        .order('sale_date', { ascending: false })
        .order('id')
        .range(a, b)
    )

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching sistecredito pending releases:', error)
    return NextResponse.json(
      { error: 'Error al obtener los pendientes de SisteCrédito' },
      { status: 500 }
    )
  }
}
