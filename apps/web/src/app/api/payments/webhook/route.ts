import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import * as Sentry from '@sentry/nextjs'
import { getServiceSupabase } from '@/lib/supabase'
import { sendOrderConfirmation, sendLowStockAlert } from '@/lib/email'
import { validateStripeWebhook, mapStripePaymentStatus } from '@/lib/stripe-helpers'
import { markWebhookProcessed } from '@/lib/webhook-idempotency'
import { decrementStockAtomic, decrementVariantStockAtomic } from '@/lib/inventory'
import { awardLoyaltyPointsForOrder } from '@/lib/loyalty'

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
  const headersList = await headers()
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

  // Idempotency: Stripe retries deliveries reusing the same event.id. If we
  // already processed this exact event, skip it instead of double-applying
  // side effects like stock reduction or payment confirmation emails.
  const isNewEvent = await markWebhookProcessed(serviceSupabase, 'stripe', event.id)
  if (!isNewEvent) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`)
    return NextResponse.json({ received: true, duplicate: true })
  }

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

        // SECURITY: verify the amount actually charged by Stripe matches the
        // order's total before marking it as paid. Without this check, a
        // tampered session (or a bug elsewhere) could confirm an order for
        // less than what it costs and nobody would notice.
        const { data: orderRow, error: orderLookupError } = await serviceSupabase
          .from('orders')
          .select('total_cents')
          .eq('id', orderId)
          .single()

        if (orderLookupError || !orderRow) {
          console.error('[Webhook] Order not found for amount verification:', orderId)
          return NextResponse.json({ error: 'Order not found' }, { status: 400 })
        }

        const expectedTotal = (orderRow as any).total_cents
        const chargedAmount = session.amount_total ?? 0

        if (chargedAmount !== expectedTotal) {
          console.error(
            `[Webhook] Amount mismatch for order ${orderId}: charged ${chargedAmount}, expected ${expectedTotal}`
          )
          Sentry.captureMessage('Stripe payment amount mismatch', {
            level: 'error',
            extra: { orderId, chargedAmount, expectedTotal, sessionId: session.id },
          })
          await (serviceSupabase.from('audit_logs') as any).insert({
            action: 'payment_amount_mismatch',
            table_name: 'orders',
            record_id: orderId,
            new_data: { provider: 'stripe', charged_amount: chargedAmount, expected_total: expectedTotal, session_id: session.id },
          })
          // Do NOT mark the order as paid or reduce stock — leave it pending
          // for manual review. Acknowledge the webhook so Stripe doesn't retry.
          return NextResponse.json({ received: true, flagged: 'amount_mismatch' })
        }

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
          .select('id, product_id, variant_id, qty')
          .eq('order_id', orderId)

        if (itemsError) {
          console.error('[Webhook] Error fetching order items:', itemsError)
          throw itemsError
        }

        const orderItems = (orderItemsData as any[]) || []
        console.log(`[Webhook] Processing ${orderItems.length} items for stock reduction`)

        for (const item of orderItems) {
          if (!item.product_id) continue

          try {
            // Descuento atómico (un solo UPDATE, con bloqueo de fila) — evita
            // la carrera de leer-luego-escribir de un SELECT+UPDATE separado.
            // Si el item tiene variant_id (producto con tallas), descuenta la
            // variante exacta — el trigger de la migración 00030 deja
            // products.stock_qty sincronizado como la suma de sus variantes.
            const updated = item.variant_id
              ? await decrementVariantStockAtomic(serviceSupabase, item.variant_id, item.qty)
              : await decrementStockAtomic(serviceSupabase, item.product_id, item.qty)

            if (!updated) {
              console.error(`[Webhook] ${item.variant_id ? 'Variant' : 'Product'} ${item.variant_id || item.product_id} not found for stock decrement`)
              continue
            }

            console.log(`[Webhook] Reduced stock -> ${updated.stock_qty}`)

            // Se guarda el descuento REAL para que cancelar la orden más
            // adelante restaure ese monto exacto (ver
            // restore_stock_for_cancelled_order, migración 00046).
            await (serviceSupabase.from('order_items') as any)
              .update({ stock_deducted: updated.actual_deducted })
              .eq('id', item.id)

            // Record inventory movement
            const { error: movementError } = await (serviceSupabase.from('inventory_movements') as any).insert({
              product_id: item.product_id,
              variant_id: item.variant_id || null,
              qty: -updated.actual_deducted,
              type: 'sale',
              reference_id: orderId,
              reference_type: 'order',
              note: `Venta - Orden ${orderId}`,
            })

            if (movementError) {
              console.error(`[Webhook] Error recording inventory movement:`, movementError)
            }
          } catch (stockErr) {
            console.error(`[Webhook] Error decrementing stock for product ${item.product_id}:`, stockErr)
            continue // Don't fail the whole webhook for one product
          }
        }

        // Log audit
        await (serviceSupabase.from('audit_logs') as any).insert({
          action: 'payment_completed',
          table_name: 'orders',
          record_id: orderId,
          new_data: { payment_status: 'paid', stripe_session_id: session.id },
        })

        // Puntos de fidelización (Fase 6) — no bloqueante, idempotente por
        // order_id, no afecta el resultado del pago si falla.
        await awardLoyaltyPointsForOrder(serviceSupabase, orderId)

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
    Sentry.captureException(error, {
      tags: { webhook: 'stripe', event_type: event.type },
      extra: { eventId: event.id },
    })
    // Return 500 to tell Stripe to retry this webhook
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
