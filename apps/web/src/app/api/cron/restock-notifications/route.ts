import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { sendRestockNotifications } from '@/lib/email'
import { verifyCronRequest } from '@/lib/cron-auth'

// GET - Procesa restock_notification_queue (migración 00036): un trigger de
// base de datos encola cada transición de stock 0 → positivo (por talla o
// por producto sin variantes) sin importar por qué ruta se escribió el
// stock — este cron es el único lugar que de verdad envía el email
// (Postgres no puede llamar a Resend directamente).
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()

    const { data: pending, error } = await supabase
      .from('restock_notification_queue')
      .select('id, product_id, variant_id')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) throw error

    const rows = (pending || []) as { id: string; product_id: string; variant_id: string | null }[]
    let totalSent = 0

    for (const row of rows) {
      try {
        totalSent += await sendRestockNotifications(row.product_id, row.variant_id)
      } catch (err) {
        console.error(`[Cron Restock] Error procesando cola ${row.id}:`, err)
      } finally {
        // Se marca procesado incluso si falló el envío para no reintentar
        // indefinidamente el mismo item roto — mismo criterio que el resto
        // de la app (no bloquear el flujo por un error de email puntual).
        await (supabase.from('restock_notification_queue') as any)
          .update({ processed_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    }

    return NextResponse.json({ processed: rows.length, emails_sent: totalSent })
  } catch (error) {
    console.error('[Cron Restock] Error:', error)
    return NextResponse.json({ error: 'Error procesando la cola de reabasto' }, { status: 500 })
  }
}
