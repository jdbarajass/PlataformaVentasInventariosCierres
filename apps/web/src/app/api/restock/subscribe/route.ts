import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const subscribeSchema = z.object({
  product_id: z.string().uuid(),
  email: z.string().email('Email inválido'),
})

// POST - Subscribe to restock notification
export async function POST(request: NextRequest) {
  const rateLimitResult = checkRateLimit(request, { limit: 5, windowSeconds: 60 })
  if (rateLimitResult) return rateLimitResult

  const body = await request.json()
  const validation = subscribeSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { product_id, email } = validation.data
  const supabase = getServiceSupabase()

  // Verify product exists and is out of stock
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, title, stock_qty, active')
    .eq('id', product_id)
    .eq('active', true)
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }

  if (product.stock_qty > 0) {
    return NextResponse.json(
      { error: 'El producto tiene stock disponible. Puedes comprarlo ahora.' },
      { status: 400 }
    )
  }

  // Insert subscription (ignore duplicate silently)
  const { error } = await (supabase.from('restock_subscriptions') as any).upsert(
    { product_id, email, notified: false },
    { onConflict: 'product_id,email', ignoreDuplicates: true }
  )

  if (error) {
    console.error('Error creating restock subscription:', error)
    return NextResponse.json({ error: 'Error al registrar la suscripción' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Te notificaremos cuando el producto esté disponible.' })
}

// DELETE - Unsubscribe
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const product_id = searchParams.get('product_id')
  const email = searchParams.get('email')

  if (!product_id || !email) {
    return NextResponse.json({ error: 'product_id y email son requeridos' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { error } = await (supabase.from('restock_subscriptions') as any)
    .delete()
    .eq('product_id', product_id)
    .eq('email', email)

  if (error) {
    return NextResponse.json({ error: 'Error al cancelar suscripción' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
