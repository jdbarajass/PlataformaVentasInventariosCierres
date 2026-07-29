import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { sendReviewRequestEmail } from '@/lib/email'
import { verifyCronRequest } from '@/lib/cron-auth'

const DAYS_AFTER_DELIVERY = 3

// GET - Pide reseña por email unos días después de que una orden queda
// 'delivered' (mejora de la Fase 5, propuesta C.14). orders.metadata.
// delivered_at se estampa en PUT /api/orders/[id] al marcar la orden como
// entregada; review_requested evita mandar el email dos veces.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()

    // Acotado a los últimos 30 días para no barrer todo el historial en
    // cada corrida — una orden entregada hace más de un mes ya no es
    // candidata a este recordatorio.
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

    const { data, error } = await supabase
      .from('orders')
      .select('id, metadata')
      .eq('status', 'delivered')
      .gte('created_at', monthAgo)

    if (error) throw error

    const threshold = Date.now() - DAYS_AFTER_DELIVERY * 86_400_000
    const candidates = ((data || []) as { id: string; metadata: any }[]).filter((o) => {
      const meta = o.metadata || {}
      if (meta.review_requested) return false
      if (!meta.delivered_at) return false
      return new Date(meta.delivered_at).getTime() <= threshold
    })

    let sent = 0
    for (const order of candidates) {
      const ok = await sendReviewRequestEmail(order.id)
      if (ok) sent++
      // Se marca "ya intentado" independientemente del resultado del envío
      // (mismo criterio que el resto de la app: no reintentar
      // indefinidamente un item roto, ej. orden sin producto de catálogo).
      await (supabase.from('orders') as any)
        .update({ metadata: { ...order.metadata, review_requested: true } })
        .eq('id', order.id)
    }

    return NextResponse.json({ candidates: candidates.length, sent })
  } catch (error) {
    console.error('[Cron Review Requests] Error:', error)
    return NextResponse.json({ error: 'Error procesando solicitudes de reseña' }, { status: 500 })
  }
}
