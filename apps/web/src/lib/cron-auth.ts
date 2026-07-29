import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifica que la petición venga de verdad de Vercel Cron (no de cualquiera
 * que adivine la URL de una ruta /api/cron/*, que de otra forma sería un
 * GET público sin protección). Vercel adjunta automáticamente
 * `Authorization: Bearer $CRON_SECRET` a las peticiones que dispara un cron
 * configurado en vercel.json, cuando esa variable de entorno existe.
 */
export function verifyCronRequest(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Cron] CRON_SECRET no está configurado')
    return NextResponse.json({ error: 'Cron no configurado' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  return null
}
