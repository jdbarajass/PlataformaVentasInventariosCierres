import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Buscar un cliente registrado (por nombre, email o teléfono) para
// vincularlo a una venta de mostrador en Registrar Venta — así una compra
// en tienda física también puede ganar puntos de fidelización (Fase 6 del
// plan de mejoras integrales). Solo cuentas role='viewer' (clientes reales,
// no otros admins/vendedores). Usa el cliente de servicio porque un
// vendedor no tiene permiso RLS para leer perfiles de otros usuarios — el
// filtro de campos devueltos (sin nada más sensible que teléfono/email, ya
// visibles en Registrar Venta de cualquier forma) hace las veces de eso.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const q = request.nextUrl.searchParams.get('q')?.trim()
    if (!q || q.length < 2) {
      return NextResponse.json({ data: [] })
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, phone, loyalty_points_balance')
      .eq('role', 'viewer')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(10)

    if (error) {
      throw error
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error searching customers:', error)
    return NextResponse.json({ error: 'Error al buscar clientes' }, { status: 500 })
  }
}
