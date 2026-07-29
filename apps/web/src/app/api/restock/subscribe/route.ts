import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const subscribeSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  email: z.string().email('Email inválido'),
})

// POST - Subscribe to restock notification (de una talla puntual si el
// producto tiene variantes, o del producto completo si no).
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

  const { product_id, variant_id, email } = validation.data
  const supabase = getServiceSupabase()

  // Verify product exists and, si tiene tallas, trae sus variantes activas
  // — el stock real de una talla vive en product_variants, no en el total
  // sumado de products.stock_qty (ver migración 00030).
  const { data: productData, error: productError } = await supabase
    .from('products')
    .select('id, title, stock_qty, active, product_variants(id, talla, stock_qty, active)')
    .eq('id', product_id)
    .eq('active', true)
    .single()

  if (productError || !productData) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }

  const product = productData as any
  const activeVariants = ((product.product_variants || []) as any[]).filter((v) => v.active)

  let resolvedVariant: { id: string; talla: string | null; stock_qty: number } | null = null

  if (activeVariants.length > 0) {
    if (!variant_id) {
      return NextResponse.json({ error: 'Debes indicar la talla de la que quieres que te avisemos' }, { status: 400 })
    }
    resolvedVariant = activeVariants.find((v) => v.id === variant_id) || null
    if (!resolvedVariant) {
      return NextResponse.json({ error: 'Talla no encontrada para este producto' }, { status: 404 })
    }
    if (resolvedVariant.stock_qty > 0) {
      return NextResponse.json(
        { error: `La talla ${resolvedVariant.talla} tiene stock disponible. Puedes comprarla ahora.` },
        { status: 400 }
      )
    }
  } else {
    if (product.stock_qty > 0) {
      return NextResponse.json(
        { error: 'El producto tiene stock disponible. Puedes comprarlo ahora.' },
        { status: 400 }
      )
    }
  }

  // Insert subscription (ignora silenciosamente si ya estaba suscrito a
  // esta misma talla/producto — el índice único parcial de la migración
  // 00033 es la red de seguridad ante una carrera entre dos solicitudes).
  const { error } = await (supabase.from('restock_subscriptions') as any).insert({
    product_id,
    variant_id: resolvedVariant?.id ?? null,
    email,
    notified: false,
  })

  if (error && error.code !== '23505') {
    console.error('Error creating restock subscription:', error)
    return NextResponse.json({ error: 'Error al registrar la suscripción' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: resolvedVariant
      ? `Te avisaremos cuando la talla ${resolvedVariant.talla} esté disponible.`
      : 'Te notificaremos cuando el producto esté disponible.',
  })
}

// DELETE - Unsubscribe
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const product_id = searchParams.get('product_id')
  const variant_id = searchParams.get('variant_id')
  const email = searchParams.get('email')

  if (!product_id || !email) {
    return NextResponse.json({ error: 'product_id y email son requeridos' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  let query = supabase
    .from('restock_subscriptions')
    .delete()
    .eq('product_id', product_id)
    .eq('email', email)
  query = variant_id ? query.eq('variant_id', variant_id) : query.is('variant_id', null)

  const { error } = await query

  if (error) {
    return NextResponse.json({ error: 'Error al cancelar suscripción' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
