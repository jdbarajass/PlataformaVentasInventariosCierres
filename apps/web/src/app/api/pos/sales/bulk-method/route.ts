import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const bulkMethodSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(2, 'Selecciona al menos 2 ventas'),
  method: z.enum(['card', 'transfer', 'wallet', 'cash', 'nequi', 'nu', 'qr', 'daviplata', 'other', 'addi']),
  methodDetail: z.string().optional().nullable(),
})

// PUT - Cambia el método de pago de varias ventas de mostrador seleccionadas
// a la vez. Excluye automáticamente las ventas con pago combinado (más de un
// método), igual que el software local (_on_editar_metodo_masivo en
// ui/ventas_dia_panel.py) — solo tiene sentido reasignar UN método cuando la
// venta original tuvo uno solo. Recalcula la comisión con la tasa del nuevo
// método; no toca cuentas/saldos (el dinero ya entró a la misma cuenta).
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = bulkMethodSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.errors }, { status: 400 })
    }
    const { orderIds, method, methodDetail } = validation.data

    const supabase = createAuthenticatedClient(auth.token)

    const { data: settings } = await supabase
      .from('store_settings')
      .select('pos_commission_rates')
      .eq('id', 1)
      .single()
    const rates: Record<string, number> = (settings as any)?.pos_commission_rates || {}
    const rate = rates[method] || 0

    const { data: payments } = await supabase
      .from('payments')
      .select('id, order_id, amount_cents')
      .in('order_id', orderIds)

    const paymentsByOrder = new Map<string, { id: string; amount_cents: number }[]>()
    for (const p of (payments || []) as { id: string; order_id: string; amount_cents: number }[]) {
      const list = paymentsByOrder.get(p.order_id) || []
      list.push({ id: p.id, amount_cents: p.amount_cents })
      paymentsByOrder.set(p.order_id, list)
    }

    let updated = 0
    let excluded = 0

    for (const orderId of orderIds) {
      const orderPayments = paymentsByOrder.get(orderId) || []
      if (orderPayments.length !== 1) {
        excluded++
        continue
      }
      const payment = orderPayments[0]
      const commissionCents = Math.round((payment.amount_cents * rate) / 100)
      const { error } = await (supabase.from('payments') as any)
        .update({ method, method_detail: methodDetail || null, commission_cents: commissionCents })
        .eq('id', payment.id)
      if (error) {
        excluded++
        continue
      }
      updated++
    }

    return NextResponse.json({ data: { updated, excluded } })
  } catch (error) {
    console.error('Error updating bulk payment method:', error)
    return NextResponse.json({ error: 'Error al cambiar el método de pago' }, { status: 500 })
  }
}
