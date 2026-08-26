import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const receivableUpdateSchema = z.object({
  debtor_name: z.string().min(1).optional(),
  amount_cents: z.number().int().positive().optional(),
  debt_date: z.string().optional(),
  notes: z.string().optional().nullable(),
})

// PUT - Editar una cuenta por cobrar existente
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = receivableUpdateSchema.parse(body)

    const { data: receivable, error } = await supabase
      .from('account_receivables')
      // @ts-ignore - Supabase type inference issue
      .update(validatedData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(receivable)
  } catch (error) {
    console.error('Error updating account receivable:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Error al actualizar la cuenta por cobrar' }, { status: 500 })
  }
}

// DELETE - Quitar una cuenta por cobrar (ej. ya pagaron). NUNCA toca
// accounts.balance_cents -- es solo un tracker informativo; el dinero real
// entra por el camino normal (venta, ajuste manual), separado de esto.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data: deleted, error } = await supabase
      .from('account_receivables')
      .delete()
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'account_receivable_deleted',
      tableName: 'account_receivables',
      recordId: id,
      oldData: deleted as Record<string, unknown>,
    })

    return NextResponse.json({ message: 'Cuenta por cobrar eliminada', id })
  } catch (error) {
    console.error('Error deleting account receivable:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la cuenta por cobrar' },
      { status: 500 }
    )
  }
}
