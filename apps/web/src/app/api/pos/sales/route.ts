import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { resolveSale } from '@/lib/pos-sale'
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

    const { resolvedItems, resolvedPayments, subtotal_cents, discount_cents, total_cents } =
      await resolveSale(supabase, items, payments)

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
    if (error instanceof Error && (
      error.message.includes('no encontrado') ||
      error.message.includes('no encontrada') ||
      error.message.includes('suma de los pagos')
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
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
