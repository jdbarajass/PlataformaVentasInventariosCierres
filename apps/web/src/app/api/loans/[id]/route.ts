import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { isLoanRuleError } from '@/lib/loans'
import { z } from 'zod'

const loanUpdateSchema = z.object({
  // Solo Pendiente <-> Devuelto. "Cobrado"/"Pagado" se alcanzan con
  // /charge (Nos deben) y /close (Debemos), que dejan registrada la venta o
  // el pago — ver migración 00062.
  status: z.enum(['pending', 'returned']).optional(),
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const parsed = loanUpdateSchema.safeParse(body)
    if (!parsed.success) {
      const statusIssue = parsed.error.errors.some((e) => e.path[0] === 'status')
      return NextResponse.json(
        {
          error: statusIssue
            ? 'Estado no válido: para cobrar o pagar usa Cobrar / Cerrar deuda'
            : 'Datos de validación inválidos',
        },
        { status: 400 }
      )
    }
    const validatedData = parsed.data

    const { status, ...fields } = validatedData
    let loan: unknown = null

    // El estado va por función (set_loan_status, migración 00062): no mueve
    // inventario y no deja reabrir algo que ya tiene venta o pago.
    if (status) {
      const { data, error } = await (getServiceSupabase().rpc as any)('set_loan_status', {
        p_loan_id: id,
        p_status: status,
        p_actor: auth.user.id,
      })
      if (error) {
        if (isLoanRuleError(error.message)) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        throw error
      }
      loan = data
    }

    if (Object.keys(fields).length > 0) {
      const { data, error } = await supabase
        .from('loans')
        // @ts-ignore - Supabase type inference issue
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw error
      }
      loan = data
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'loan_updated',
      tableName: 'loans',
      recordId: id,
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    // Borrar solo quita el registro (los préstamos no mueven inventario). No
    // se borra uno con venta o pago registrado — ver delete_loan (00062).
    const { error } = await (getServiceSupabase().rpc as any)('delete_loan', {
      p_loan_id: id,
      p_actor: auth.user.id,
    })

    if (error) {
      if (isLoanRuleError(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'loan_deleted',
      tableName: 'loans',
      recordId: id,
    })

    return NextResponse.json({ message: 'Préstamo eliminado exitosamente', id: id })
  } catch (error) {
    console.error('Error deleting loan:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el préstamo' },
      { status: 500 }
    )
  }
}
