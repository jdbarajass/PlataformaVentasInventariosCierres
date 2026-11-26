import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// PATCH - Define el % sobre el costo del "precio mínimo a la venta cliente"
// de un producto (migración 00069). Solo admin: el vendedor ve el precio
// resultante pero no puede cambiarlo ni ver el %. Body: { pct: number | null }
// (null = quitarlo).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json().catch(() => null)
    const raw = body?.pct
    let pct: number | null
    if (raw === null || raw === '') {
      pct = null
    } else {
      pct = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
        return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 1000' }, { status: 400 })
      }
      pct = Math.round(pct * 100) / 100
    }

    const supabase = createAuthenticatedClient(auth.token)
    const { data, error } = await (supabase as any)
      .from('products')
      .update({ client_min_markup_pct: pct, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, client_min_markup_pct')
      .single()

    if (error || !data) {
      console.error('Error updating client markup:', error)
      return NextResponse.json({ error: 'No se pudo guardar el porcentaje' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating client markup:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
