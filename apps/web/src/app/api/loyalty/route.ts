import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Saldo de puntos y últimos movimientos del cliente autenticado, para
// la pestaña "Mis Puntos" de Mi Cuenta (Fase 6 del plan de mejoras
// integrales). Cliente autenticado con RLS (no service role): las
// políticas de la migración 00044 ya limitan loyalty_points_ledger a "ver
// lo propio", así que no hace falta filtrar user_id a mano aquí.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.success) return auth.response

    const supabase = createAuthenticatedClient(auth.token)

    const [{ data: userRow, error: userError }, { data: ledger, error: ledgerError }] = await Promise.all([
      supabase.from('users').select('loyalty_points_balance').eq('id', auth.user.id).single(),
      supabase
        .from('loyalty_points_ledger')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (userError) throw userError
    if (ledgerError) throw ledgerError

    return NextResponse.json({
      data: {
        balance: (userRow as any)?.loyalty_points_balance ?? 0,
        ledger: ledger || [],
      },
    })
  } catch (error) {
    console.error('Error fetching loyalty data:', error)
    return NextResponse.json({ error: 'Error al obtener los puntos' }, { status: 500 })
  }
}
