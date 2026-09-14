import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { verifyCronRequest } from '@/lib/cron-auth'

// GET - Libera al saldo real las ventas por Datáfono cuyo día hábil de
// desembolso ya llegó (ver supabase/migrations/00055_card_pending_releases.sql).
// Corre a diario a las 3pm hora Bogotá (vercel.json, "0 20 * * *" UTC); es
// idempotente (release_card_pending() solo toca filas vencidas y sin
// liberar), así que si un día falla o Vercel no lo ejecuta, el día
// siguiente recoge lo pendiente sin duplicar nada.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await (supabase.rpc as any)('release_card_pending')

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('Error releasing card pending amounts:', error)
    return NextResponse.json(
      { error: 'Error al liberar los pendientes de Datáfono' },
      { status: 500 }
    )
  }
}
