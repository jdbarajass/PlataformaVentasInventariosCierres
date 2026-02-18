import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { sendPaymentInstructions, sendNewOrderAdmin } from '@/lib/email'
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe-helpers'
import { createPreference, isMercadoPagoConfigured } from '@/lib/mercadopago-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // Rate limit: max 5 orders per minute per IP
  const rateLimited = checkRateLimit(request, { limit: 5, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  const serviceSupabase = getServiceSupabase()
  const body = await request.json()

  const { items, customer, payment_method, subtotal_cents, shipping_cents, total_cents } = body

  try {
    // Create order in database
    const orderData = {
      customer_email: customer.email,
      customer_name: customer.name,
      customer_phone: customer.phone,
      shipping_address: {
        address: customer.address,
        city: customer.city,
      },
      subtotal_cents,
      shipping_cents,
      total_cents,
      notes: customer.notes,
      status: 'pending',
      payment_status: 'pending',
    }
    const { data: order, error: orderError } = await (serviceSupabase
      .from('orders') as any)
      .insert(orderData)
      .select()
      .single()

    if (orderError) {
      throw new Error(orderError.message)
    }

    // Create order items
    const orderItems = items.map((item: { id: string; title: string; price_cents: number; qty: number; image: string }) => ({
      order_id: order.id,
      product_id: item.id,
      product_title: item.title,
      product_image: item.image,
      qty: item.qty,
      price_cents: item.price_cents,
      total_cents: item.price_cents * item.qty,
    }))

    const { error: itemsError } = await (serviceSupabase
      .from('order_items') as any)
      .insert(orderItems)

    if (itemsError) {
      throw new Error(itemsError.message)
    }

    // Handle payment based on method
    if (payment_method === 'card') {
      // Validate Stripe configuration
      if (!isStripeConfigured()) {
        console.error('Stripe is not properly configured')
        return NextResponse.json(
          { error: 'Payment system is not configured. Please contact support.' },
          { status: 500 }
        )
      }

      // Create Stripe checkout session
      const session = await createCheckoutSession({
        orderId: order.id,
        items: items.map((item: { id: string; title: string; price_cents: number; qty: number; image?: string }) => ({
          title: item.title,
          price_cents: item.price_cents,
          qty: item.qty,
          image: item.image,
        })),
        customerEmail: customer.email,
        currency: 'cop',
      })

      // Create payment record
      await (serviceSupabase.from('payments') as any).insert({
        order_id: order.id,
        provider: 'stripe',
        provider_session_id: session.id,
        amount_cents: total_cents,
        method: 'card',
        status: 'pending',
      })

      // Send admin notification (non-blocking)
      sendNewOrderAdmin(order.id).catch(console.error)

      return NextResponse.json({
        order_id: order.id,
        checkout_url: session.url,
      })
    } else if (payment_method === 'mercadopago') {
      // Validate MercadoPago configuration
      if (!isMercadoPagoConfigured()) {
        console.error('MercadoPago is not properly configured')
        return NextResponse.json(
          { error: 'Payment system is not configured. Please contact support.' },
          { status: 500 }
        )
      }

      // Create MercadoPago preference
      const initPoint = await createPreference({
        orderId: order.id,
        items: items.map((item: { id: string; title: string; price_cents: number; qty: number }) => ({
          title: item.title,
          price_cents: item.price_cents,
          qty: item.qty,
        })),
        customerEmail: customer.email,
        total_cents,
      })

      // Create payment record
      await (serviceSupabase.from('payments') as any).insert({
        order_id: order.id,
        provider: 'mercadopago',
        amount_cents: total_cents,
        method: 'mercadopago',
        status: 'pending',
      })

      // Send admin notification (non-blocking)
      sendNewOrderAdmin(order.id).catch(console.error)

      return NextResponse.json({
        order_id: order.id,
        checkout_url: initPoint,
      })
    } else {
      // For other payment methods (transfer, nequi, daviplata)
      await (serviceSupabase.from('payments') as any).insert({
        order_id: order.id,
        provider: 'manual',
        amount_cents: total_cents,
        method: payment_method,
        status: 'pending',
      })

      // Send payment instructions email
      try {
        await sendPaymentInstructions(order.id, payment_method)
      } catch (emailError) {
        console.error('Email send failed:', emailError)
        // Don't block order creation if email fails
      }

      // Send admin notification (non-blocking)
      sendNewOrderAdmin(order.id).catch(console.error)

      return NextResponse.json({
        order_id: order.id,
        message: 'Orden creada. Recibiras instrucciones de pago por email.',
      })
    }
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { error: 'Error al crear la orden' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const serviceSupabase = getServiceSupabase()
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = serviceSupabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (from) {
    query = query.gte('created_at', from)
  }

  if (to) {
    query = query.lte('created_at', to)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
