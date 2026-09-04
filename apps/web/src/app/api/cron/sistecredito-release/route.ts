import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { verifyCronRequest } from '@/lib/cron-auth'

// GET - Libera al saldo real las ventas por SisteCrédito cuyo mes de
// corte ya pasó (ver supabase/migrations/00053_sistecredito_monthly_release.sql).
// Corre a diario; es idempotente (release_sistecredito_pending() solo
// toca filas vencidas y sin liberar), así que si un día falla o Vercel
// no lo ejecuta, el día siguiente recoge lo pendiente sin duplicar nada.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await (supabase.rpc as any)('release_sistecredito_pending')

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('Error releasing sistecredito pending amounts:', error)
    return NextResponse.json(
      { error: 'Error al liberar los pendientes de SisteCrédito' },
      { status: 500 }
    )
  }
}
