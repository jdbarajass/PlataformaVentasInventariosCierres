import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const loanUpdateSchema = z.object({
  status: z.enum(['pending', 'returned', 'charged']).optional(),
  observations: z.string().optional().nullable(),
})

// PUT - Cambiar estado (pendiente/devuelto/cobrado) o notas de un préstamo
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

    return NextResponse.json({ message: 'Préstamo eliminado exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting loan:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el préstamo' },
      { status: 500 }
    )
  }
}
