import type { SupabaseClient } from '@supabase/supabase-js'

// 1 punto por cada $1.000 COP gastado (Fase 6 del plan de mejoras
// integrales, docs/UNIFICACION_YJBMOTOCOM.md sección 80.10). Los montos en
// este proyecto se guardan en centavos (price_cents = pesos * 100, mismo
// convención de Stripe) — $1.000 COP son 100.000 "centavos".
const CENTS_PER_POINT = 100_000

// Tasa de canje: 100 puntos = $1.000 COP de descuento, la misma
// proporción con la que se ganan — 1 punto = 1.000 centavos.
export const REDEMPTION_CENTS_PER_POINT = 1_000
export const MIN_REDEMPTION_POINTS = 100

export function pointsForPurchase(totalCents: number): number {
  return Math.floor(totalCents / CENTS_PER_POINT)
}

/**
 * Otorga puntos de fidelización por una orden ya pagada (online o
 * mostrador). No hace nada si la orden no tiene cliente registrado
 * (checkout de invitado, o venta de mostrador sin cliente vinculado) — no
 * hay a quién darle los puntos. Idempotente por order_id vía
 * award_loyalty_points (índice único + chequeo explícito), así que es
 * seguro llamarla más de una vez para la misma orden (ej. reintento de
 * webhook) sin duplicar puntos.
 *
 * Nunca lanza — un fallo al otorgar puntos no debe tumbar el pago ni la
 * venta que ya se confirmó (mismo criterio que el resto de efectos
 * secundarios "best effort" del proyecto: email, alertas de stock, etc.).
 */
export async function awardLoyaltyPointsForOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('user_id, total_cents, order_number, channel')
      .eq('id', orderId)
      .single()

    if (error || !order) return

    const o = order as { user_id: string | null; total_cents: number; order_number: string; channel: string }
    if (!o.user_id) return

    const points = pointsForPurchase(o.total_cents)
    if (points <= 0) return

    const description =
      o.channel === 'pos' ? `Venta de mostrador ${o.order_number}` : `Compra ${o.order_number}`

    const { error: rpcError } = await (supabase.rpc as any)('award_loyalty_points', {
      p_user_id: o.user_id,
      p_points: points,
      p_order_id: orderId,
      p_description: description,
    })

    if (rpcError) {
      console.error(`[Loyalty] Error awarding points for order ${orderId}:`, rpcError)
    }
  } catch (err) {
    console.error(`[Loyalty] Unexpected error awarding points for order ${orderId}:`, err)
  }
}
