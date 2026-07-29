import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getServiceSupabase } from '@/lib/supabase'
import { sendPaymentInstructions, sendNewOrderAdmin } from '@/lib/email'
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe-helpers'
import { createPreference, isMercadoPagoConfigured } from '@/lib/mercadopago-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireAuth } from '@/lib/auth-helpers'
import { getStoreSettings } from '@/lib/settings'
import { createOrderSchema } from '@/lib/validations/order'

export async function POST(request: NextRequest) {
  // Rate limit: max 5 orders per minute per IP
  const rateLimited = checkRateLimit(request, { limit: 5, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  const serviceSupabase = getServiceSupabase()
  const body = await request.json()

  const validation = createOrderSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Datos invalidos', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { items, customer, payment_method, coupon_code } = validation.data

  try {
    // SECURITY: never trust prices/totals sent by the client. Re-fetch every
    // product from the database and recompute everything server-side.
    const productIds = Array.from(new Set(items.map((item) => item.id)))

    // Trae también las variantes (tallas) de cada producto: un producto con
    // variantes exige elegir una talla — su stock real vive por variante,
    // no en `products.stock_qty` (ver migración 00030 y
    // docs/UNIFICACION_YJBMOTOCOM.md, hallazgo de la auditoría por fases).
    const { data: productsData, error: productsError } = await serviceSupabase
      .from('products')
      .select('id, title, price_cents, stock_qty, cost_cents, active, images, product_variants(id, talla, stock_qty, cost_cents, active)')
      .in('id', productIds)

    if (productsError) {
      throw new Error(productsError.message)
    }

    const productsById = new Map((productsData as any[]).map((p) => [p.id, p]))

    let subtotal_cents = 0
    const orderItemsInput: {
      product_id: string
      product_title: string
      product_image: string | null
      variant_id: string | null
      product_talla: string | null
      qty: number
      price_cents: number
      cost_cents: number
      total_cents: number
    }[] = []

    for (const item of items) {
      const product = productsById.get(item.id)
      const qty = item.qty

      if (!product || !product.active) {
        return NextResponse.json({ error: `Producto no disponible: ${item.id}` }, { status: 400 })
      }

      const activeVariants = ((product.product_variants || []) as any[]).filter((v) => v.active)
      let variant: any = null

      if (activeVariants.length > 0) {
        // Producto con tallas: la talla es obligatoria, no se puede vender
        // "genérico" (no habría forma de saber cuál despachar).
        if (!item.variant_id) {
          return NextResponse.json({ error: `Debes elegir una talla para "${product.title}"` }, { status: 400 })
        }
        variant = activeVariants.find((v) => v.id === item.variant_id)
        if (!variant) {
          return NextResponse.json({ error: `Talla no disponible para "${product.title}"` }, { status: 400 })
        }
        if (variant.stock_qty < qty) {
          return NextResponse.json({ error: `Stock insuficiente para "${product.title}" (talla ${variant.talla})` }, { status: 400 })
        }
      } else {
        if (product.stock_qty < qty) {
          return NextResponse.json({ error: `Stock insuficiente para "${product.title}"` }, { status: 400 })
        }
      }

      const itemTotal = product.price_cents * qty
      subtotal_cents += itemTotal

      orderItemsInput.push({
        product_id: product.id,
        product_title: product.title,
        product_image: product.images?.[0] ?? null,
        variant_id: variant?.id ?? null,
        product_talla: variant?.talla ?? null,
        qty,
        price_cents: product.price_cents,
        cost_cents: (variant ? variant.cost_cents : product.cost_cents) ?? 0,
        total_cents: itemTotal,
      })
    }

    // Recompute shipping from store settings (server-side, ignoring client value)
    const storeSettings = await getStoreSettings()
    const shippingConfig = storeSettings?.shipping_config
    const shipping_cents =
      shippingConfig?.enabled && subtotal_cents < shippingConfig.free_shipping_threshold_cents
        ? shippingConfig.default_shipping_cost_cents
        : 0

    // Recompute coupon discount server-side (ignoring any client-supplied discount)
    let discount_cents = 0
    if (coupon_code) {
      const { data: coupon } = await serviceSupabase
        .from('coupons')
        .select('*')
        .eq('code', String(coupon_code).toUpperCase().trim())
        .eq('active', true)
        .single()

      const c = coupon as any
      const now = new Date()
      const validCoupon =
        c &&
        (!c.valid_from || new Date(c.valid_from) <= now) &&
        (!c.valid_until || new Date(c.valid_until) >= now) &&
        (c.max_uses === null || c.used_count < c.max_uses) &&
        subtotal_cents >= c.min_purchase_cents

      if (validCoupon) {
        discount_cents =
          c.discount_type === 'percentage'
            ? Math.round(subtotal_cents * (c.discount_value / 100))
            : c.discount_value
      }
    }

    const total_cents = Math.max(0, subtotal_cents - discount_cents + shipping_cents)

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
      discount_cents,
      shipping_cents,
      total_cents,
      notes: customer.notes,
      status: 'pending',
      payment_status: 'pending',
    }
    // Create order + order_items atomically (single Postgres transaction via
    // RPC, see supabase/migrations/00006_order_atomicity.sql). Avoids
    // orphaned orders if the items insert were to fail after the order
    // insert succeeded.
    const { data: order, error: orderError } = await (serviceSupabase.rpc as any)(
      'create_order_with_items',
      {
        p_order: orderData,
        p_items: orderItemsInput.map((item) => ({
          product_id: item.product_id,
          product_title: item.product_title,
          product_image: item.product_image,
          variant_id: item.variant_id,
          product_talla: item.product_talla,
          qty: item.qty,
          price_cents: item.price_cents,
          cost_cents: item.cost_cents,
          total_cents: item.total_cents,
        })),
      }
    )

    if (orderError || !order) {
      throw new Error(orderError?.message ?? 'No se pudo crear la orden')
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
      // Charged as a single consolidated line item so the amount charged is
      // always exactly total_cents (server-recomputed), regardless of how
      // many products/shipping/discounts make up the order.
      const session = await createCheckoutSession({
        orderId: order.id,
        items: [
          {
            title: `Pedido ${order.order_number ?? order.id} (${orderItemsInput.length} producto${orderItemsInput.length > 1 ? 's' : ''})`,
            price_cents: total_cents,
            qty: 1,
            image: orderItemsInput[0]?.product_image ?? undefined,
          },
        ],
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
      // Same consolidated-line-item approach as Stripe above: the amount
      // charged must always equal the server-recomputed total_cents.
      const initPoint = await createPreference({
        orderId: order.id,
        items: [
          {
            title: `Pedido ${order.order_number ?? order.id} (${orderItemsInput.length} producto${orderItemsInput.length > 1 ? 's' : ''})`,
            price_cents: total_cents,
            qty: 1,
          },
        ],
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
    Sentry.captureException(error, { tags: { route: 'orders.create' } })
    return NextResponse.json(
      { error: 'Error al crear la orden' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, ['admin', 'seller'])
  if (!auth.success) return auth.response

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
    query = query.eq('status', status as 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded')
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
