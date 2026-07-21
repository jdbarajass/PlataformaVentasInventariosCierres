import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// DELETE - Cancelar una venta de mostrador: revierte stock y saldo de
// cuentas (función atómica cancel_pos_sale).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()
    const { error } = await (supabase.rpc as any)('cancel_pos_sale', {
      p_order_id: params.id,
    })

    if (error) {
      if (error.message?.includes('no encontrada')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ message: 'Venta cancelada exitosamente', id: params.id })
  } catch (error) {
    console.error('Error cancelling POS sale:', error)
    return NextResponse.json(
      { error: 'Error al cancelar la venta' },
      { status: 500 }
    )
  }
}
