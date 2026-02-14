import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { getServiceSupabase } from '@/lib/supabase'
import { sendOrderConfirmation } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const serviceSupabase = getServiceSupabase()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.order_id

      if (orderId) {
        // Update order status
        await (serviceSupabase
          .from('orders') as any)
          .update({
            status: 'confirmed',
            payment_status: 'paid',
          })
          .eq('id', orderId)

        // Update payment status
        await (serviceSupabase
          .from('payments') as any)
          .update({
            status: 'succeeded',
            provider_payment_id: session.payment_intent as string,
          })
          .eq('provider_session_id', session.id)

        // Reduce stock for each item
        const { data: orderItemsData } = await serviceSupabase
          .from('order_items')
          .select('product_id, qty')
          .eq('order_id', orderId)

        const orderItems = (orderItemsData as any[]) || []

        for (const item of orderItems) {
          if (item.product_id) {
            // Get current stock
            const { data: productData } = await serviceSupabase
              .from('products')
              .select('stock_qty')
              .eq('id', item.product_id)
              .single()

            const product = productData as any

            if (product) {
              // Update stock
              await (serviceSupabase
                .from('products') as any)
                .update({ stock_qty: Math.max(0, product.stock_qty - item.qty) })
                .eq('id', item.product_id)

              // Record inventory movement
              await (serviceSupabase.from('inventory_movements') as any).insert({
                product_id: item.product_id,
                qty: -item.qty,
                type: 'sale',
                reference_id: orderId,
                reference_type: 'order',
                note: `Venta - Orden ${orderId}`,
              })
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

        // Send order confirmation email
        try {
          await sendOrderConfirmation(orderId)
        } catch (emailError) {
          console.error('Confirmation email send failed:', emailError)
          // Don't block webhook processing if email fails
        }
      }
      break
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.order_id

      if (orderId) {
        await (serviceSupabase
          .from('orders') as any)
          .update({ payment_status: 'failed' })
          .eq('id', orderId)

        await (serviceSupabase
          .from('payments') as any)
          .update({ status: 'cancelled' })
          .eq('provider_session_id', session.id)
      }
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId = charge.payment_intent as string

      const { data: paymentData } = await serviceSupabase
        .from('payments')
        .select('order_id')
        .eq('provider_payment_id', paymentIntentId)
        .single()

      const payment = paymentData as any

      if (payment) {
        await (serviceSupabase
          .from('orders') as any)
          .update({
            status: 'refunded',
            payment_status: 'refunded',
          })
          .eq('id', payment.order_id)

        await (serviceSupabase
          .from('payments') as any)
          .update({ status: 'refunded' })
          .eq('provider_payment_id', paymentIntentId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
