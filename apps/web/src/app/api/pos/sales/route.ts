import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  qty: z.number().int().positive(),
  price_cents: z.number().int().min(0),
  discount_cents: z.number().int().min(0).default(0),
})

const salePaymentSchema = z.object({
  method: z.enum(['card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi']),
  method_detail: z.string().optional().nullable(),
  account_id: z.string().uuid().optional().nullable(),
  amount_cents: z.number().int().positive(),
})

const saleSchema = z.object({
  customer_name: z.string().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  customer_id_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'La venta debe tener al menos un producto'),
  payments: z.array(salePaymentSchema).min(1, 'La venta debe tener al menos un método de pago'),
})

const defaultCommissionRates: Record<string, number> = {
  cash: 0, transfer: 0, wallet: 0, nequi: 0, daviplata: 0, addi: 0, card: 0, other: 0,
}

// POST - Registrar una venta de mostrador (carrito, pagos combinados, descuenta
// stock y acredita cuentas — todo vía la función atómica create_pos_sale).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = saleSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { customer_name, customer_phone, customer_id_number, notes, items, payments } =
      validation.data

    const supabase = createAuthenticatedClient(auth.token)

    // Resuelve título/SKU/imagen/costo actuales de cada producto (nunca se
    // confía en esos datos si vinieran del cliente) y valida que existan.
    const productIds = Array.from(new Set(items.map((i) => i.product_id)))
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, title, sku, images, cost_cents, active')
      .in('id', productIds)

    if (productsError) {
      throw productsError
    }

    const productsById = new Map((products || []).map((p: any) => [p.id, p]))

    const variantIds = items.map((i) => i.variant_id).filter(Boolean) as string[]
    let variantsById = new Map<string, any>()
    if (variantIds.length > 0) {
      const { data: variants, error: variantsError } = await supabase
        .from('product_variants')
        .select('id, product_id, talla, cost_cents, stock_qty')
        .in('id', variantIds)

      if (variantsError) {
        throw variantsError
      }
      variantsById = new Map((variants || []).map((v: any) => [v.id, v]))
    }

    for (const item of items) {
      const product = productsById.get(item.product_id)
      if (!product || !product.active) {
        return NextResponse.json(
          { error: `Producto no encontrado o inactivo: ${item.product_id}` },
          { status: 400 }
        )
      }
      if (item.variant_id && !variantsById.has(item.variant_id)) {
        return NextResponse.json(
          { error: `Variante no encontrada: ${item.variant_id}` },
          { status: 400 }
        )
      }
    }

    const resolvedItems = items.map((item) => {
      const product = productsById.get(item.product_id)
      const variant = item.variant_id ? variantsById.get(item.variant_id) : null
      const total_cents = item.qty * item.price_cents - item.discount_cents
      return {
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product_title: product.title,
        product_sku: product.sku,
        product_image: (product.images && product.images[0]) || null,
        product_talla: variant?.talla || null,
        qty: item.qty,
        price_cents: item.price_cents,
        cost_cents: variant ? variant.cost_cents : product.cost_cents,
        discount_cents: item.discount_cents,
        total_cents,
      }
    })

    const subtotal_cents = items.reduce((sum, i) => sum + i.qty * i.price_cents, 0)
    const discount_cents = items.reduce((sum, i) => sum + i.discount_cents, 0)
    const total_cents = subtotal_cents - discount_cents

    const paymentsSum = payments.reduce((sum, p) => sum + p.amount_cents, 0)
    if (paymentsSum < total_cents) {
      return NextResponse.json(
        { error: 'La suma de los pagos es menor al total de la venta' },
        { status: 400 }
      )
    }

    // Comisión informativa por método (se traslada al cliente como
    // sobreprecio: no afecta el total de la venta ni la ganancia registrada).
    const { data: settings } = await supabase
      .from('store_settings')
      .select('pos_commission_rates')
      .eq('id', 1)
      .single()
    const rates: Record<string, number> = {
      ...defaultCommissionRates,
      ...((settings as any)?.pos_commission_rates || {}),
    }

    const resolvedPayments = payments.map((p) => ({
      method: p.method,
      method_detail: p.method_detail || null,
      account_id: p.account_id || null,
      amount_cents: p.amount_cents,
      commission_cents: Math.round(p.amount_cents * (rates[p.method] || 0) / 100),
    }))

    const orderPayload = {
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      seller_id: auth.user.id,
      subtotal_cents,
      discount_cents,
      total_cents,
      notes: notes || null,
      metadata: customer_id_number ? { customer_id_number } : {},
    }

    // La función RPC hace todo (orden+items+stock+pagos+cuentas) en una sola
    // transacción — ver supabase/migrations/00013_pos_sale_functions.sql.
    const serviceSupabase = getServiceSupabase()
    const { data: order, error } = await (serviceSupabase.rpc as any)('create_pos_sale', {
      p_order: orderPayload,
      p_items: resolvedItems,
      p_payments: resolvedPayments,
    })

    if (error) {
      if (error.message?.includes('Stock insuficiente')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data: order }, { status: 201 })
  } catch (error) {
    console.error('Error creating POS sale:', error)
    return NextResponse.json(
      { error: 'Error al registrar la venta' },
      { status: 500 }
    )
  }
}

// GET - Listar ventas de mostrador (para "Ventas del día")
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = parseInt(searchParams.get('limit') || '50')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('orders')
      .select('*, order_items(*), payments(*)')
      .eq('channel', 'pos')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching POS sales:', error)
    return NextResponse.json(
      { error: 'Error al obtener las ventas de mostrador' },
      { status: 500 }
    )
  }
}
