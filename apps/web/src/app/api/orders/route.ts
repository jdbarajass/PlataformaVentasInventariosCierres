import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
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
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: items.map((item: { title: string; price_cents: number; qty: number; image: string }) => ({
          price_data: {
            currency: 'cop',
            product_data: {
              name: item.title,
              images: item.image ? [item.image] : [],
            },
            unit_amount: item.price_cents,
          },
          quantity: item.qty,
        })),
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/orden/${order.id}/confirmacion?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout`,
        metadata: {
          order_id: order.id,
        },
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

      return NextResponse.json({
        order_id: order.id,
        checkout_url: session.url,
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

      // TODO: Send email with payment instructions

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
