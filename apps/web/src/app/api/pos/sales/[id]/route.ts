import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { resolveSale } from '@/lib/pos-sale'
import { z } from 'zod'

const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  qty: z.number().int().positive(),
  price_cents: z.number().int().positive(),
  discount_cents: z.number().int().min(0).default(0),
})

const salePaymentSchema = z.object({
  method: z.enum(['card', 'transfer', 'wallet', 'cash', 'nequi', 'nu', 'qr', 'daviplata', 'other', 'addi']),
  method_detail: z.string().optional().nullable(),
  account_id: z.string().uuid().optional().nullable(),
  amount_cents: z.number().int().positive(),
})

const editSaleSchema = z.object({
  customer_name: z.string().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'La venta debe tener al menos un producto'),
  payments: z.array(salePaymentSchema).min(1, 'La venta debe tener al menos un método de pago'),
  force: z.boolean().optional().default(false),
})

// GET - Detalle de una venta de mostrador (para precargar el formulario de edición)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), payments(*)')
      .eq('id', params.id)
      .eq('channel', 'pos')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching POS sale:', error)
    return NextResponse.json({ error: 'Error al obtener la venta' }, { status: 500 })
  }
}

// PUT - Editar una venta de mostrador ya registrada: revierte por completo
// el stock/saldo de cuentas de la venta actual y vuelve a aplicarlos con los
// datos nuevos, conservando el mismo id/order_number (función edit_pos_sale).
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = editSaleSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { customer_name, customer_phone, notes, items, payments, force } = validation.data

    const supabase = createAuthenticatedClient(auth.token)

    const { resolvedItems, resolvedPayments, subtotal_cents, discount_cents, total_cents } =
      await resolveSale(supabase, items, payments)

    const orderPayload = {
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      subtotal_cents,
      discount_cents,
      total_cents,
      notes: notes || null,
    }

    const serviceSupabase = getServiceSupabase()
    const { data: order, error } = await (serviceSupabase.rpc as any)('edit_pos_sale', {
      p_order_id: params.id,
      p_order: orderPayload,
      p_items: resolvedItems,
      p_payments: resolvedPayments,
      p_force: force,
    })

    if (error) {
      if (error.message?.includes('no encontrada') || error.message?.includes('no encontrado')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error.message?.includes('Stock insuficiente')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data: order })
  } catch (error) {
    console.error('Error editing POS sale:', error)
    if (error instanceof Error && (
      error.message.includes('no encontrado') ||
      error.message.includes('no encontrada') ||
      error.message.includes('suma de los pagos') ||
      error.message.includes('descuento no puede ser mayor')
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al editar la venta' }, { status: 500 })
  }
}

// DELETE - Cancelar una venta de mostrador: revierte stock y saldo de
// cuentas (función atómica cancel_pos_sale).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()
    const { error } = await (supabase.rpc as any)('cancel_pos_sale', {
      p_order_id: params.id,
    })

    if (error) {
      if (error.message?.includes('no encontrada')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ message: 'Venta cancelada exitosamente', id: params.id })
  } catch (error) {
    console.error('Error cancelling POS sale:', error)
    return NextResponse.json(
      { error: 'Error al cancelar la venta' },
      { status: 500 }
    )
  }
}
