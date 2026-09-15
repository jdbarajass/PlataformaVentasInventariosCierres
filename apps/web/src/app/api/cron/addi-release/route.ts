import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { verifyCronRequest } from '@/lib/cron-auth'

// GET - Libera al saldo real las ventas por Addi cuya fecha de pago ya
// llegó (ver supabase/migrations/00056_addi_pending_releases.sql). Corre
// a diario a las 4pm hora Bogotá (vercel.json, "0 21 * * *" UTC); es
// idempotente (release_addi_pending() solo toca filas vencidas y sin
// liberar), así que si un día falla o Vercel no lo ejecuta, el día
// siguiente recoge lo pendiente sin duplicar nada.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await (supabase.rpc as any)('release_addi_pending')

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('Error releasing addi pending amounts:', error)
    return NextResponse.json(
      { error: 'Error al liberar los pendientes de Addi' },
      { status: 500 }
    )
  }
}
