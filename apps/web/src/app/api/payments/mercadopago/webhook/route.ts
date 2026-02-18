import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getServiceSupabase } from '@/lib/supabase'
import { sendOrderConfirmation } from '@/lib/email'
import {
  validateMercadoPagoWebhook,
  getMercadoPagoPayment,
  mapMercadoPagoStatus,
} from '@/lib/mercadopago-helpers'

/**
 * MercadoPago Webhook Handler
 * Processes MercadoPago payment notifications
 *
 * Configure this URL in MercadoPago Dashboard:
 * https://www.mercadopago.com.co/developers/panel/app/webhooks
 *
 * Events handled: payment.created, payment.updated
 */

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = headers()
  const xSignature = headersList.get('x-signature')

  // Parse query params — MP sends ?topic=payment&id=PAYMENT_ID or ?data.id=PAYMENT_ID
  const { searchParams } = new URL(request.url)
  const topic = searchParams.get('topic')
  const queryId = searchParams.get('id') ?? searchParams.get('data.id')

  // Parse body for newer webhook format: { action, data: { id } }
  let parsedBody: Record<string, any> = {}
  try {
    parsedBody = JSON.parse(body)
  } catch {
    // Some MP notifications have empty body
  }

  const dataId: string =
    queryId ??
    parsedBody?.data?.id ??
    parsedBody?.id ??
    ''

  // Only process payment notifications
  const isPaymentTopic = topic === 'payment' || parsedBody?.action?.startsWith('payment')
  if (!isPaymentTopic) {
    console.log(`[MP Webhook] Skipping non-payment topic: ${topic ?? parsedBody?.action}`)
    return NextResponse.json({ received: true })
  }

  if (!dataId) {
    console.error('[MP Webhook] Missing payment ID')
    return NextResponse.json({ error: 'Missing payment ID' }, { status: 400 })
  }

  // Validate signature (skip if no secret configured — allows development without secret)
  if (process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    const valid = validateMercadoPagoWebhook(xSignature, dataId)
    if (!valid) {
      console.error('[MP Webhook] Invalid signature for payment ID:', dataId)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  console.log(`[MP Webhook] Processing payment ID: ${dataId}`)

  const serviceSupabase = getServiceSupabase()

  try {
    // Fetch payment details from MercadoPago
    const payment = await getMercadoPagoPayment(dataId)

    const mpStatus = payment.status ?? 'pending'
    const orderId = payment.external_reference

    if (!orderId) {
      console.error('[MP Webhook] Missing external_reference in payment:', dataId)
      return NextResponse.json({ received: true })
    }

    console.log(`[MP Webhook] Payment ${dataId} status: ${mpStatus} | Order: ${orderId}`)

    const internalStatus = mapMercadoPagoStatus(mpStatus)

    if (mpStatus === 'approved') {
      // Update order to confirmed + paid
      const { error: orderError } = await (serviceSupabase
        .from('orders') as any)
        .update({
          status: 'confirmed',
          payment_status: 'paid',
        })
        .eq('id', orderId)

      if (orderError) {
        console.error('[MP Webhook] Error updating order:', orderError)
        throw orderError
      }

      // Update or insert payment record
      const { error: paymentError } = await (serviceSupabase
        .from('payments') as any)
        .update({
          status: 'succeeded',
          provider_payment_id: String(payment.id),
        })
        .eq('order_id', orderId)
        .eq('provider', 'mercadopago')

      if (paymentError) {
        console.error('[MP Webhook] Error updating payment record:', paymentError)
        throw paymentError
      }

      // Reduce stock for each order item
      const { data: orderItemsData, error: itemsError } = await serviceSupabase
        .from('order_items')
        .select('product_id, qty')
        .eq('order_id', orderId)

      if (itemsError) {
        console.error('[MP Webhook] Error fetching order items:', itemsError)
        throw itemsError
      }

      const orderItems = (orderItemsData as any[]) ?? []
      console.log(`[MP Webhook] Processing ${orderItems.length} items for stock reduction`)

      for (const item of orderItems) {
        if (!item.product_id) continue

        const { data: productData, error: productError } = await serviceSupabase
          .from('products')
          .select('stock_qty, title')
          .eq('id', item.product_id)
          .single()

        if (productError || !productData) {
          console.error(`[MP Webhook] Error fetching product ${item.product_id}:`, productError)
          continue
        }

        const product = productData as any
        const newStock = Math.max(0, product.stock_qty - item.qty)
        console.log(`[MP Webhook] Reducing stock for "${product.title}": ${product.stock_qty} -> ${newStock}`)

        const { error: stockError } = await (serviceSupabase
          .from('products') as any)
          .update({ stock_qty: newStock })
          .eq('id', item.product_id)

        if (stockError) {
          console.error(`[MP Webhook] Error updating stock for product ${item.product_id}:`, stockError)
          continue
        }

        // Record inventory movement
        await (serviceSupabase.from('inventory_movements') as any).insert({
          product_id: item.product_id,
          qty: -item.qty,
          type: 'sale',
          reference_id: orderId,
          reference_type: 'order',
          note: `Venta MercadoPago - Orden ${orderId}`,
        })
      }

      // Audit log
      await (serviceSupabase.from('audit_logs') as any).insert({
        action: 'payment_completed',
        table_name: 'orders',
        record_id: orderId,
        new_data: { payment_status: 'paid', provider: 'mercadopago', mp_payment_id: String(payment.id) },
      })

      // Send confirmation email
      try {
        const emailSent = await sendOrderConfirmation(orderId)
        if (emailSent) {
          console.log(`[MP Webhook] Confirmation email sent for order ${orderId}`)
        } else {
          console.warn(`[MP Webhook] Confirmation email failed for order ${orderId}`)
        }
      } catch (emailError) {
        console.error('[MP Webhook] Email send error:', emailError)
      }

      console.log(`[MP Webhook] Order ${orderId} payment approved and processed`)

    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      await (serviceSupabase.from('orders') as any)
        .update({ payment_status: 'failed' })
        .eq('id', orderId)

      await (serviceSupabase.from('payments') as any)
        .update({ status: internalStatus })
        .eq('order_id', orderId)
        .eq('provider', 'mercadopago')

      await (serviceSupabase.from('audit_logs') as any).insert({
        action: 'payment_failed',
        table_name: 'orders',
        record_id: orderId,
        new_data: { payment_status: 'failed', mp_status: mpStatus },
      })

      console.log(`[MP Webhook] Payment ${mpStatus} for order ${orderId}`)

    } else if (mpStatus === 'in_process' || mpStatus === 'authorized' || mpStatus === 'in_mediation') {
      await (serviceSupabase.from('orders') as any)
        .update({ payment_status: 'processing' })
        .eq('id', orderId)

      await (serviceSupabase.from('payments') as any)
        .update({ status: 'processing' })
        .eq('order_id', orderId)
        .eq('provider', 'mercadopago')

      console.log(`[MP Webhook] Payment in progress (${mpStatus}) for order ${orderId}`)

    } else if (mpStatus === 'refunded' || mpStatus === 'charged_back') {
      await (serviceSupabase.from('orders') as any)
        .update({ status: 'refunded', payment_status: 'refunded' })
        .eq('id', orderId)

      await (serviceSupabase.from('payments') as any)
        .update({ status: 'refunded' })
        .eq('order_id', orderId)
        .eq('provider', 'mercadopago')

      await (serviceSupabase.from('audit_logs') as any).insert({
        action: 'payment_refunded',
        table_name: 'orders',
        record_id: orderId,
        new_data: { payment_status: 'refunded', mp_status: mpStatus },
      })

      console.log(`[MP Webhook] Payment refunded for order ${orderId}`)

    } else {
      console.log(`[MP Webhook] Unhandled status: ${mpStatus} for order ${orderId}`)
    }

    // MercadoPago expects 200 — any 5xx causes a retry
    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('[MP Webhook] Error processing webhook:', error)
    // Return 500 so MercadoPago retries
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
