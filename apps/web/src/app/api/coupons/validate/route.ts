import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// POST - Validate a coupon code and return discount info
export async function POST(request: NextRequest) {
  // Rate limit: max 10 validations per minute per IP
  const rateLimited = checkRateLimit(request, { limit: 10, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  const supabase = getServiceSupabase()
  const { code, subtotal_cents } = await request.json()

  if (!code) {
    return NextResponse.json({ error: 'Codigo de cupon requerido' }, { status: 400 })
  }

  const { data: couponData, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('active', true)
    .single()

  if (error || !couponData) {
    return NextResponse.json({ error: 'Cupon no valido o expirado' }, { status: 404 })
  }

  // Dos .eq() encadenados + .single() no lo resuelve bien el parser de tipos
  // de @supabase/postgrest-js (mismo tipo de limitacion que
  // api/orders/[id]/invoice/route.ts — ver docs/UNIFICACION_YJBMOTOCOM.md).
  const coupon = couponData as any

  const now = new Date()

  // Check validity dates
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return NextResponse.json({ error: 'Este cupon aun no esta activo' }, { status: 400 })
  }

  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return NextResponse.json({ error: 'Este cupon ha expirado' }, { status: 400 })
  }

  // Check usage limit
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ error: 'Este cupon ha alcanzado su limite de uso' }, { status: 400 })
  }

  // Check minimum purchase
  if (subtotal_cents && subtotal_cents < coupon.min_purchase_cents) {
    const minFormatted = (coupon.min_purchase_cents / 100).toLocaleString('es-CO')
    return NextResponse.json({
      error: `Compra minima de $${minFormatted} COP requerida para este cupon`,
    }, { status: 400 })
  }

  // Calculate discount
  let discount_cents = 0
  if (coupon.discount_type === 'percentage') {
    discount_cents = Math.round((subtotal_cents || 0) * (coupon.discount_value / 100))
  } else {
    discount_cents = coupon.discount_value
  }

  return NextResponse.json({
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_cents,
    },
  })
}
