import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// DELETE - Quitar una línea/ítem de una factura de proveedor
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { error } = await supabase
      .from('supplier_invoice_items')
      .delete()
      .eq('id', params.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ message: 'Ítem eliminado exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting supplier invoice item:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el ítem' },
      { status: 500 }
    )
  }
}
