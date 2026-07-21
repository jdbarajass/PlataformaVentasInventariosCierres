import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

// Nunca se acepta balance_cents aquí: el saldo solo cambia a través de
// movimientos (adjust_account_balance / transfer_between_accounts), para
// que siempre quede un movimiento que explique cada cambio de saldo.
const accountUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  payment_method: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

// PUT - Actualizar datos de una cuenta (nunca el saldo directamente)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = accountUpdateSchema.parse(body)

    const { data: account, error } = await supabase
      .from('accounts')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(account)
  } catch (error) {
    console.error('Error updating account:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al actualizar la cuenta' },
      { status: 500 }
    )
  }
}
