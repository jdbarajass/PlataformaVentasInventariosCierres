import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { getServiceSupabase } from '@/lib/supabase'
import { sendOrderConfirmation, sendLowStockAlert } from '@/lib/email'
import { validateStripeWebhook, mapStripePaymentStatus } from '@/lib/stripe-helpers'

/**
 * Stripe Webhook Handler
 * Processes Stripe events (payments, refunds, etc.)
 *
 * Important: This endpoint must be configured in Stripe Dashboard:
 * https://dashboard.stripe.com/webhooks
 *
 * Events to listen for:
 * - checkout.session.completed
 * - checkout.session.expired
 * - charge.refunded
 * - payment_intent.succeeded
 * - payment_intent.payment_failed
 */

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    console.error('[Webhook] Missing Stripe signature')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Validate webhook signature
  const event = validateStripeWebhook(body, signature)

  if (!event) {
    console.error('[Webhook] Invalid signature or event')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log(`[Webhook] Received event: ${event.type}`)

  const serviceSupabase = getServiceSupabase()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orderId = session.metadata?.order_id

        if (!orderId) {
          console.error('[Webhook] Missing order_id in session metadata')
          return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })
        }

        console.log(`[Webhook] Processing payment for order: ${orderId}`)

        // Update order status
        const { error: orderError } = await (serviceSupabase
          .from('orders') as any)
          .update({
            status: 'confirmed',
            payment_status: 'paid',
          })
          .eq('id', orderId)

        if (orderError) {
          console.error('[Webhook] Error updating order:', orderError)
          throw orderError
        }

        // Update payment status
        const { error: paymentError } = await (serviceSupabase
          .from('payments') as any)
          .update({
            status: 'succeeded',
            provider_payment_id: session.payment_intent as string,
          })
          .eq('provider_session_id', session.id)

        if (paymentError) {
          console.error('[Webhook] Error updating payment:', paymentError)
          throw paymentError
        }

        // Reduce stock for each item
        const { data: orderItemsData, error: itemsError } = await serviceSupabase
          .from('order_items')
          .select('product_id, qty')
          .eq('order_id', orderId)

        if (itemsError) {
          console.error('[Webhook] Error fetching order items:', itemsError)
          throw itemsError
        }

        const orderItems = (orderItemsData as any[]) || []
        console.log(`[Webhook] Processing ${orderItems.length} items for stock reduction`)

        for (const item of orderItems) {
          if (item.product_id) {
            // Get current stock
            const { data: productData, error: productError } = await serviceSupabase
              .from('products')
              .select('stock_qty, title')
              .eq('id', item.product_id)
              .single()

            if (productError) {
              console.error(`[Webhook] Error fetching product ${item.product_id}:`, productError)
              continue // Don't fail the whole webhook for one product
            }

            const product = productData as any

            if (product) {
              const newStock = Math.max(0, product.stock_qty - item.qty)
              console.log(`[Webhook] Reducing stock for "${product.title}": ${product.stock_qty} -> ${newStock}`)

              // Update stock
              const { error: stockError } = await (serviceSupabase
                .from('products') as any)
                .update({ stock_qty: newStock })
                .eq('id', item.product_id)

              if (stockError) {
                console.error(`[Webhook] Error updating stock for product ${item.product_id}:`, stockError)
                continue
              }

              // Record inventory movement
              const { error: movementError } = await (serviceSupabase.from('inventory_movements') as any).insert({
                product_id: item.product_id,
                qty: -item.qty,
                type: 'sale',
                reference_id: orderId,
                reference_type: 'order',
                note: `Venta - Orden ${orderId}`,
              })

              if (movementError) {
                console.error(`[Webhook] Error recording inventory movement:`, movementError)
              }
            }
          }
        }

        // Log audit
        await (serviceSupabase.from('audit_logs') as any).insert({
          action: 'payment_completed',
          table_name: 'orders',
          record_id: orderId,
          new_data: { payment_status: 'paid', stripe_session_id: session.id },
        })

        console.log(`[Webhook] Order ${orderId} payment completed successfully`)

        // Send order confirmation email
        try {
          const emailSent = await sendOrderConfirmation(orderId)
          if (emailSent) {
            console.log(`[Webhook] Confirmation email sent for order ${orderId}`)
          } else {
            console.warn(`[Webhook] Confirmation email failed for order ${orderId}`)
          }
        } catch (emailError) {
          console.error('[Webhook] Confirmation email send error:', emailError)
          // Don't block webhook processing if email fails
        }

        // Check and alert low stock (non-blocking)
        sendLowStockAlert().catch((err) => console.error('[Webhook] Low stock alert error:', err))

        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        const orderId = session.metadata?.order_id

        if (!orderId) {
          console.warn('[Webhook] Missing order_id in expired session metadata')
          break
        }

        console.log(`[Webhook] Checkout session expired for order: ${orderId}`)

        await (serviceSupabase
          .from('orders') as any)
          .update({ payment_status: 'failed' })
          .eq('id', orderId)

        await (serviceSupabase
          .from('payments') as any)
          .update({ status: 'cancelled' })
          .eq('provider_session_id', session.id)

        // Log audit
        await (serviceSupabase.from('audit_logs') as any).insert({
          action: 'payment_expired',
          table_name: 'orders',
          record_id: orderId,
          new_data: { payment_status: 'failed', reason: 'session_expired' },
        })

        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId = charge.payment_intent as string

        if (!paymentIntentId) {
          console.warn('[Webhook] Missing payment_intent in refund event')
          break
        }

        console.log(`[Webhook] Processing refund for payment intent: ${paymentIntentId}`)

        const { data: paymentData, error: paymentLookupError } = await serviceSupabase
          .from('payments')
          .select('order_id')
          .eq('provider_payment_id', paymentIntentId)
          .single()

        if (paymentLookupError || !paymentData) {
          console.error('[Webhook] Payment not found for refund:', paymentIntentId)
          break
        }

        const payment = paymentData as any

        // Update order status
        await (serviceSupabase
          .from('orders') as any)
          .update({
            status: 'refunded',
            payment_status: 'refunded',
          })
          .eq('id', payment.order_id)

        // Update payment status
        await (serviceSupabase
          .from('payments') as any)
          .update({ status: 'refunded' })
          .eq('provider_payment_id', paymentIntentId)

        // Log audit
        await (serviceSupabase.from('audit_logs') as any).insert({
          action: 'payment_refunded',
          table_name: 'orders',
          record_id: payment.order_id,
          new_data: { payment_status: 'refunded', payment_intent_id: paymentIntentId },
        })

        console.log(`[Webhook] Refund processed for order: ${payment.order_id}`)

        break
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)
    // Return 500 to tell Stripe to retry this webhook
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
