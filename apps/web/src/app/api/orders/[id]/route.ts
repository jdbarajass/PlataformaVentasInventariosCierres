import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { sendOrderShipped, sendOrderConfirmation } from '@/lib/email'
import { decrementStockForOrder } from '@/lib/order-fulfillment'

// GET - Admin: get single order details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request, ['admin', 'seller'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Admin: update order status, tracking, fulfillment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request, ['admin', 'seller'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const body = await request.json()
  const { status, tracking_number, tracking_url, mark_paid } = body

  // Update order status
  if (status) {
    const { error } = await (supabase.from('orders') as any)
      .update({ status })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Marca cuándo quedó 'delivered' (una sola vez) — lo usa el cron de
    // api/cron/review-requests para pedir reseña unos días después, sin
    // depender de updated_at (que cambia con cualquier otra edición).
    if (status === 'delivered') {
      const { data: order } = await supabase.from('orders').select('metadata').eq('id', params.id).single()
      const currentMetadata = (order?.metadata as Record<string, any>) || {}
      if (!currentMetadata.delivered_at) {
        await (supabase.from('orders') as any)
          .update({ metadata: { ...currentMetadata, delivered_at: new Date().toISOString() } })
          .eq('id', params.id)
      }
    }
  }

  // Confirmar pago manual (transferencia/Nequi/Daviplata): esos métodos
  // nunca pasan por un webhook de pasarela, así que hasta ahora nunca
  // descontaban stock — el admin tenía que ajustar el inventario a mano.
  // Este botón replica exactamente lo que ya hacen los webhooks de Stripe/
  // MercadoPago (descuento por variante + movimiento + email), pero
  // disparado a mano por un admin en vez de por una notificación externa.
  if (mark_paid) {
    const { data: orderRow, error: orderLookupError } = await supabase
      .from('orders')
      .select('payment_status, order_number')
      .eq('id', params.id)
      .single()

    if (orderLookupError || !orderRow) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    // Idempotente: si ya estaba pagada (ej. doble clic, o ya la confirmó un
    // webhook), no se vuelve a descontar stock.
    if ((orderRow as any).payment_status !== 'paid') {
      const { error: updateError } = await (supabase.from('orders') as any)
        .update({ status: 'confirmed', payment_status: 'paid' })
        .eq('id', params.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      try {
        await decrementStockForOrder(supabase, params.id, `Pago manual confirmado - Orden ${(orderRow as any).order_number}`)
      } catch (stockError) {
        console.error('Error decrementing stock for manual payment:', stockError)
      }

      await (supabase.from('audit_logs') as any).insert({
        action: 'payment_completed_manual',
        table_name: 'orders',
        record_id: params.id,
        new_data: { payment_status: 'paid' },
      })

      try {
        await sendOrderConfirmation(params.id)
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError)
      }
    }
  }

  // Store tracking info in order metadata
  if (tracking_number !== undefined || tracking_url !== undefined) {
    // Get current metadata
    const { data: order } = await supabase
      .from('orders')
      .select('metadata')
      .eq('id', params.id)
      .single()

    const currentMetadata = (order?.metadata as Record<string, any>) || {}
    const newMetadata = {
      ...currentMetadata,
      ...(tracking_number !== undefined && { tracking_number }),
      ...(tracking_url !== undefined && { tracking_url }),
    }

    const { error: metaError } = await (supabase.from('orders') as any)
      .update({ metadata: newMetadata })
      .eq('id', params.id)

    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 })
    }
  }

  // If status changed to 'shipped', send notification email
  if (status === 'shipped') {
    try {
      await sendOrderShipped(params.id, tracking_number, tracking_url)
    } catch (emailError) {
      console.error('Error sending shipped notification:', emailError)
    }
  }

  // Log audit
  await (supabase.from('audit_logs') as any).insert({
    action: `order_${status || 'updated'}`,
    table_name: 'orders',
    record_id: params.id,
    new_data: body,
  })

  return NextResponse.json({ success: true })
}
