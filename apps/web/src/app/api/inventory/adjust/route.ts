import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { sendRestockNotifications } from '@/lib/email'
import { z } from 'zod'

const adjustmentSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().int(),
  type: z.enum(['in', 'out', 'adjustment', 'return']),
  note: z.string().optional(),
  created_by: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = adjustmentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { product_id, qty, type, note, created_by } = validation.data
    // Use service role for system operations
    const supabase = getServiceSupabase()

    // Get current product stock
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('id, title, stock_qty')
      .eq('id', product_id)
      .single()

    if (productError || !productData) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    const product = productData as { id: string; title: string; stock_qty: number }

    // Calculate new stock
    let newStock = product.stock_qty
    if (type === 'in' || type === 'return') {
      newStock += Math.abs(qty)
    } else if (type === 'out') {
      newStock -= Math.abs(qty)
    } else {
      // adjustment - qty can be positive or negative
      newStock = qty
    }

    // Prevent negative stock
    if (newStock < 0) {
      return NextResponse.json(
        { error: 'El stock no puede ser negativo' },
        { status: 400 }
      )
    }

    // Start transaction-like operation
    // 1. Create inventory movement
    const movementData = {
      product_id,
      qty: type === 'adjustment' ? qty - product.stock_qty : qty,
      type,
      note,
      created_by,
    }
    const { data: movement, error: movementError } = await (supabase
      .from('inventory_movements') as any)
      .insert(movementData)
      .select()
      .single()

    if (movementError) {
      throw movementError
    }

    // 2. Update product stock
    const { error: updateError } = await (supabase
      .from('products') as any)
      .update({ stock_qty: newStock })
      .eq('id', product_id)

    if (updateError) {
      throw updateError
    }

    // 3. Create audit log
    await (supabase.from('audit_logs') as any).insert({
      actor_id: created_by,
      action: 'inventory_adjustment',
      table_name: 'products',
      record_id: product_id,
      old_data: { stock_qty: product.stock_qty },
      new_data: { stock_qty: newStock },
    })

    // 4. If stock went from 0 to positive, notify subscribers (non-blocking)
    if (product.stock_qty === 0 && newStock > 0) {
      sendRestockNotifications(product_id).catch((err) =>
        console.error('[Restock] Error sending notifications:', err)
      )
    }

    return NextResponse.json({
      success: true,
      movement,
      product: {
        id: product_id,
        previous_stock: product.stock_qty,
        new_stock: newStock,
      },
    })
  } catch (error) {
    console.error('Error adjusting inventory:', error)
    return NextResponse.json(
      { error: 'Error al ajustar inventario' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Use authenticated client (respects RLS)
    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('inventory_movements')
      .select(`
        *,
        product:products(id, title, sku)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (productId) {
      query = query.eq('product_id', productId)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }
    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching inventory movements:', error)
    return NextResponse.json(
      { error: 'Error al obtener movimientos de inventario' },
      { status: 500 }
    )
  }
}
