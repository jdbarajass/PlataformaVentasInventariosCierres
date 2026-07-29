import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const trackSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  items: z.array(
    z.object({
      title: z.string(),
      qty: z.number().int().positive(),
      price_cents: z.number().int().min(0),
    })
  ).min(1),
  subtotal_cents: z.number().int().min(0),
})

// POST - Captura email + contenido del carrito cuando el cliente lo escribe
// en el checkout, antes de pagar — así se le puede recordar si abandona la
// compra (mejora de la Fase 5, propuesta C.12). Un registro por email
// (upsert): cada vez que vuelve a escribir su email con el carrito
// actualizado, se refresca y se resetea reminded_at/recovered_at, para que
// un abandono nuevo pueda generar un nuevo recordatorio.
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { limit: 20, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  try {
    const body = await request.json()
    const validation = trackSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const { email, items, subtotal_cents } = validation.data
    const supabase = getServiceSupabase()

    const { error } = await (supabase.from('abandoned_carts') as any).upsert(
      {
        email,
        items,
        subtotal_cents,
        reminded_at: null,
        recovered_at: null,
      },
      { onConflict: 'email' }
    )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error tracking abandoned cart:', error)
    // No debe romper el checkout del cliente si esto falla — es un
    // mecanismo de recuperación, no parte del flujo de compra en sí.
    return NextResponse.json({ success: false })
  }
}
