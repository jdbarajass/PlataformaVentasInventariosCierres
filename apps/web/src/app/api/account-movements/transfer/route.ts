import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const transferSchema = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  description: z.string().optional(),
  created_by: z.string().uuid().optional(),
})

// POST - Transferir saldo entre dos cuentas (valida saldo suficiente). Solo admin.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = transferSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { from_account_id, to_account_id, amount_cents, description, created_by } =
      validation.data

    // transfer_between_accounts valida el saldo, descuenta/acredita ambas
    // cuentas e inserta los dos movimientos enlazados, todo en una sola
    // transacción de Postgres.
    const supabase = getServiceSupabase()
    const { data: referenceId, error } = await (supabase.rpc as any)(
      'transfer_between_accounts',
      {
        p_from_account_id: from_account_id,
        p_to_account_id: to_account_id,
        p_amount_cents: amount_cents,
        p_description: description || 'Transferencia entre cuentas',
        p_created_by: created_by || null,
      }
    )

    if (error) {
      if (error.message?.includes('Saldo insuficiente')) {
        return NextResponse.json({ error: 'Saldo insuficiente en la cuenta origen' }, { status: 400 })
      }
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'account_transfer',
      tableName: 'account_movements',
      recordId: referenceId as any,
      newData: { from_account_id, to_account_id, amount_cents, description },
    })

    return NextResponse.json({ reference_id: referenceId }, { status: 201 })
  } catch (error) {
    console.error('Error transferring between accounts:', error)
    return NextResponse.json(
      { error: 'Error al realizar la transferencia' },
      { status: 500 }
    )
  }
}
