import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const itemUpdateSchema = z.object({
  description: z.string().min(1).optional(),
  qty: z.number().int().positive().optional(),
  unit_price_cents: z.number().int().min(0).optional(),
})

// PUT - Editar una línea/ítem de una factura de proveedor (el software
// local permite editar cualquier ítem ya agregado — sección 12.2/13.3 ítem
// 4.3.9 de la auditoría de fidelidad).
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = itemUpdateSchema.parse(body)

    const { data: current, error: fetchError } = await supabase
      .from('supplier_invoice_items')
      .select('qty, unit_price_cents')
      .eq('id', params.id)
      .single()
    if (fetchError || !current) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })
    }
    const c = current as { qty: number; unit_price_cents: number }
    const qty = validatedData.qty ?? c.qty
    const unitPrice = validatedData.unit_price_cents ?? c.unit_price_cents

    const { data: item, error } = await supabase
      .from('supplier_invoice_items')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, subtotal_cents: qty * unitPrice })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating supplier invoice item:', error)
    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json({ error: 'Datos de validación inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al actualizar el ítem' }, { status: 500 })
  }
}

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
