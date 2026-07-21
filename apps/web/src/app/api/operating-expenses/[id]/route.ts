import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// DELETE - Eliminar un gasto operativo, revirtiendo el débito a su cuenta (si tenía)
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
    const { error } = await (supabase.rpc as any)('delete_operating_expense', {
      p_expense_id: params.id,
    })

    if (error) {
      if (error.message?.includes('no encontrado')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ message: 'Gasto eliminado exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting operating expense:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el gasto' },
      { status: 500 }
    )
  }
}
