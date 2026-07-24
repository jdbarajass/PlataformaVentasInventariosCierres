import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

interface OrderRow {
  id: string
  total_cents: number
  seller_id: string | null
  seller: { id: string; name: string | null; email: string } | null
  order_items: Array<{ qty: number }>
}

// GET - Rendimiento por vendedor: ventas de mostrador agrupadas por
// seller_id. Solo Admin (igual que el software local, donde este panel
// está protegido y restringido a Admin).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Se requieren los parámetros from y to' },
        { status: 400 }
      )
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('orders')
      .select('id, total_cents, seller_id, seller:users!orders_seller_id_fkey(id, name, email), order_items(qty)')
      .eq('channel', 'pos')
      .eq('payment_status', 'paid')
      .gte('created_at', from)
      // Límite superior EXCLUSIVO — el caller (rendimiento-vendedores)
      // manda el inicio del día siguiente al rango en hora de Bogotá
      // (bogotaDayRange), no el final del día pedido.
      .lt('created_at', to)

    if (error) {
      throw error
    }

    const orders = ((data as unknown as OrderRow[]) || [])

    const bySeller: Record<string, { seller_id: string | null; name: string; orders: number; units: number; revenue_cents: number }> = {}

    // Incluye a todos los usuarios registrados (admin/seller), aunque no
    // hayan tenido ventas en el período — igual que obtener_todos_usuarios()
    // del local (ui/rendimiento_vendedores_panel.py), que muestra en gris
    // "—" a quien no vendió nada ese mes. Antes solo aparecían vendedores
    // con al menos una orden en el rango (sección 12.6, nunca cerrado).
    const { data: usersData } = await supabase
      .from('users')
      .select('id, name, email, role')
      .in('role', ['admin', 'seller'])

    for (const u of (usersData || []) as { id: string; name: string | null; email: string; role: string }[]) {
      bySeller[u.id] = { seller_id: u.id, name: u.name || u.email, orders: 0, units: 0, revenue_cents: 0 }
    }

    orders.forEach((order) => {
      const key = order.seller_id || 'sin_vendedor'
      if (!bySeller[key]) {
        bySeller[key] = {
          seller_id: order.seller_id,
          name: order.seller?.name || order.seller?.email || 'Sin vendedor asignado',
          orders: 0,
          units: 0,
          revenue_cents: 0,
        }
      }
      bySeller[key].orders += 1
      bySeller[key].units += (order.order_items || []).reduce((sum, i) => sum + i.qty, 0)
      bySeller[key].revenue_cents += order.total_cents
    })

    const result = Object.values(bySeller).sort((a, b) => b.revenue_cents - a.revenue_cents)

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Error fetching seller performance report:', error)
    return NextResponse.json(
      { error: 'Error al obtener el rendimiento por vendedor' },
      { status: 500 }
    )
  }
}
