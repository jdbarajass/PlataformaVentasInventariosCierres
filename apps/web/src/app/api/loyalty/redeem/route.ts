import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { REDEMPTION_CENTS_PER_POINT, MIN_REDEMPTION_POINTS } from '@/lib/loyalty'
import { z } from 'zod'

const redeemSchema = z.object({
  points: z
    .number()
    .int()
    .min(MIN_REDEMPTION_POINTS, `Se necesitan al menos ${MIN_REDEMPTION_POINTS} puntos para canjear`)
    .refine((v) => v % 100 === 0, 'Los puntos se canjean en múltiplos de 100'),
})

function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// POST - Canjea puntos de fidelización del cliente autenticado por un
// cupón de descuento (Fase 6 del plan de mejoras integrales). Siempre
// actúa sobre auth.user.id — nunca sobre un user_id que mande el cliente,
// para que nadie pueda canjear los puntos de otra persona.
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { limit: 5, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  try {
    const auth = await requireAuth(request)
    if (!auth.success) return auth.response

    const body = await request.json()
    const validation = redeemSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Datos inválidos' },
        { status: 400 }
      )
    }

    const { points } = validation.data
    const discountCents = points * REDEMPTION_CENTS_PER_POINT
    const validUntil = new Date(Date.now() + 30 * 86_400_000)

    const supabase = getServiceSupabase()

    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: coupon, error } = await (supabase.rpc as any)('redeem_loyalty_points_for_coupon', {
        p_user_id: auth.user.id,
        p_points: points,
        p_code: `PUNTOS-${randomSuffix()}`,
        p_discount_cents: discountCents,
        p_valid_until: validUntil.toISOString(),
      })

      if (!error) {
        return NextResponse.json({ data: coupon }, { status: 201 })
      }

      lastError = error
      if (!error.message?.includes('duplicate key')) break // solo reintenta si chocó el código del cupón
    }

    if (lastError?.message?.includes('Puntos insuficientes')) {
      return NextResponse.json({ error: 'No tienes suficientes puntos para este canje' }, { status: 400 })
    }

    console.error('Error redeeming loyalty points:', lastError)
    return NextResponse.json({ error: 'Error al canjear los puntos' }, { status: 500 })
  } catch (error) {
    console.error('Error in loyalty redeem route:', error)
    return NextResponse.json({ error: 'Error al canjear los puntos' }, { status: 500 })
  }
}
