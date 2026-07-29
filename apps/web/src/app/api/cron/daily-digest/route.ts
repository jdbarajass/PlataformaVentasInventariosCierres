import { NextRequest, NextResponse } from 'next/server'
import { sendDailyDigest } from '@/lib/email'
import { verifyCronRequest } from '@/lib/cron-auth'

// GET - Envía al admin el resumen diario de vencimientos (facturas, notas,
// fiados) cada mañana, para que no pase inadvertido un día que nadie entra
// al panel a ver las alertas de sesión.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  const sent = await sendDailyDigest()
  return NextResponse.json({ sent })
}
