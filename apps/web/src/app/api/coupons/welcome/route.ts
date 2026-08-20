import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendWelcomeCouponEmail } from '@/lib/email'

const WELCOME_DISCOUNT_PCT = 10
const WELCOME_VALID_DAYS = 15

function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I para evitar confusión al leerlo
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// POST - Genera (o devuelve, si ya existe) el cupón de bienvenida de un
// cliente recién registrado: 10% de descuento, un solo uso, 15 días de
// vigencia. Se llama justo después de crear la fila en public.users
// (registro/page.tsx) — no depende de que ya exista una sesión activa
// (el signUp de Supabase no siempre deja una al toque si hay confirmación
// de email de por medio), así que valida el user_id contra la tabla real
// en vez de exigir un JWT.
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { limit: 5, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  try {
    const { user_id } = await request.json()
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('id', user_id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Idempotente: si ya se generó un cupón de bienvenida para este cliente
    // (ej. el navegador reintentó la llamada), se devuelve el mismo en vez
    // de crear uno nuevo — nunca dos cupones de bienvenida por persona.
    const { data: existing } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ data: existing })
    }

    const now = new Date()
    const validUntil = new Date(now.getTime() + WELCOME_VALID_DAYS * 86_400_000)

    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: coupon, error } = await (supabase.from('coupons') as any)
        .insert({
          code: `BIENVENIDA-${randomSuffix()}`,
          description: 'Cupón de bienvenida — 10% en tu primera compra',
          discount_type: 'percentage',
          discount_value: WELCOME_DISCOUNT_PCT,
          min_purchase_cents: 0,
          max_uses: 1,
          valid_from: now.toISOString(),
          valid_until: validUntil.toISOString(),
          active: true,
          user_id,
        })
        .select()
        .single()

      if (!error) {
        // No bloquea la respuesta si el email falla — el código ya se
        // muestra en pantalla, el correo es un respaldo (mismo criterio
        // que sendLowStockAlert y el resto de emails no transaccionales).
        sendWelcomeCouponEmail({
          to: user.email,
          name: user.name || 'Cliente',
          code: coupon.code,
          validUntil: validUntil.toISOString(),
        }).catch((err) => console.error('Error sending welcome coupon email:', err))

        return NextResponse.json({ data: coupon }, { status: 201 })
      }

      lastError = error
      if (error.code !== '23505') break // solo reintenta si fue choque de código, no otro error
    }

    console.error('Error creating welcome coupon:', lastError)
    return NextResponse.json({ error: 'Error al generar el cupón de bienvenida' }, { status: 500 })
  } catch (error) {
    console.error('Error in welcome coupon route:', error)
    return NextResponse.json({ error: 'Error al generar el cupón de bienvenida' }, { status: 500 })
  }
}
