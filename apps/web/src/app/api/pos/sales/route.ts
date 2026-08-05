import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { resolveSale } from '@/lib/pos-sale'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const saleItemSchema = z
  .object({
    // Ausente/null = ítem manual fuera de catálogo (el local permite vender
    // un producto que no está en inventario con nombre/costo/precio libres).
    product_id: z.string().uuid().optional().nullable(),
    variant_id: z.string().uuid().optional().nullable(),
    manual_title: z.string().trim().min(1).optional(),
    manual_cost_cents: z.number().int().min(0).optional(),
    qty: z.number().int().positive(),
    // El precio debe ser mayor a cero, igual que el software local.
    price_cents: z.number().int().positive(),
    discount_cents: z.number().int().min(0).default(0),
  })
  .refine((item) => item.product_id || item.manual_title, {
    message: 'El ítem debe tener product_id o un nombre manual (manual_title)',
    path: ['product_id'],
  })

const salePaymentSchema = z.object({
  method: z.enum(['card', 'transfer', 'wallet', 'cash', 'nequi', 'nu', 'qr', 'daviplata', 'other', 'addi', 'sistecredito']),
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
  // Forzar la venta aunque el stock sea insuficiente (advertencia previa en
  // el cliente, igual que el software local) — el stock nunca baja de 0.
  force: z.boolean().optional().default(false),
  // El software local permite elegir la fecha al registrar una venta (para
  // registrar ventas de días anteriores, ej. si se fue la luz), capturando
  // la hora real al momento del clic. Si no se envía, la base de datos usa
  // NOW() como antes.
  created_at: z.string().datetime().optional(),
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

    const { customer_name, customer_phone, customer_id_number, notes, items, payments, force, created_at } =
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
      p_force: force,
      p_created_at: created_at || null,
    })

    if (error) {
      if (error.message?.includes('Stock insuficiente')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    await logAudit(serviceSupabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'pos_sale_created',
      tableName: 'orders',
      recordId: (order as any)?.id,
      newData: { total_cents, items: resolvedItems.length },
    })

    return NextResponse.json({ data: order }, { status: 201 })
  } catch (error) {
    console.error('Error creating POS sale:', error)
    if (error instanceof Error && (
      error.message.includes('no encontrado') ||
      error.message.includes('no encontrada') ||
      error.message.includes('suma de los pagos') ||
      error.message.includes('descuento no puede ser mayor')
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
      // Límite superior EXCLUSIVO — el único caller que envía `to`
      // (Ventas del Día) manda el inicio del día siguiente en hora de
      // Bogotá (bogotaDayRange), no el final del día pedido.
      query = query.lt('created_at', to)
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
