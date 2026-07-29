import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const loanUpdateSchema = z.object({
  status: z.enum(['pending', 'returned', 'charged']).optional(),
  observations: z.string().optional().nullable(),
  // El software local permite editar producto/almacén de un préstamo ya
  // creado (EditPrestamoDialog) — sección 12.3/13.3 ítem 4.3.10 de la
  // auditoría de fidelidad. También permite corregir fecha y hora al
  // editar (no solo al crear) — ver sección 24 del doc.
  product_title: z.string().min(1).optional(),
  warehouse: z.string().min(1).optional(),
  created_at: z.string().datetime().optional(),
})

// PUT - Cambiar estado (pendiente/devuelto/cobrado), notas, o
// producto/almacén de un préstamo
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
    const validatedData = loanUpdateSchema.parse(body)

    const { data: loan, error } = await supabase
      .from('loans')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'loan_updated',
      tableName: 'loans',
      recordId: params.id,
      newData: validatedData,
    })

    return NextResponse.json(loan)
  } catch (error) {
    console.error('Error updating loan:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al actualizar el préstamo' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar el registro de un préstamo
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
      .from('loans')
      .delete()
      .eq('id', params.id)

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'loan_deleted',
      tableName: 'loans',
      recordId: params.id,
    })

    return NextResponse.json({ message: 'Préstamo eliminado exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting loan:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el préstamo' },
      { status: 500 }
    )
  }
}
