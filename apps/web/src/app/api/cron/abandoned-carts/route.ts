import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { sendAbandonedCartReminder } from '@/lib/email'
import { verifyCronRequest } from '@/lib/cron-auth'

const HOURS_BEFORE_REMINDER = 2

// GET - Recuerda por email los carritos que se registraron (api/cart/track,
// al escribir el email en el checkout) hace más de 2 horas, nunca se
// recuperaron (no completaron una orden) y todavía no se les recordó.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()
    const threshold = new Date(Date.now() - HOURS_BEFORE_REMINDER * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('abandoned_carts')
      .select('id, email, items, subtotal_cents')
      .is('reminded_at', null)
      .is('recovered_at', null)
      .lte('created_at', threshold)
      .limit(50)

    if (error) throw error

    const carts = (data || []) as { id: string; email: string; items: any[]; subtotal_cents: number }[]
    let sent = 0

    for (const cart of carts) {
      const ok = await sendAbandonedCartReminder(cart.email, cart.items, cart.subtotal_cents)
      if (ok) sent++
      // Se marca "ya recordado" independientemente del resultado del envío
      // — un solo recordatorio por carrito, no reintentos indefinidos.
      await (supabase.from('abandoned_carts') as any)
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', cart.id)
    }

    return NextResponse.json({ candidates: carts.length, sent })
  } catch (error) {
    console.error('[Cron Abandoned Carts] Error:', error)
    return NextResponse.json({ error: 'Error procesando carritos abandonados' }, { status: 500 })
  }
}
