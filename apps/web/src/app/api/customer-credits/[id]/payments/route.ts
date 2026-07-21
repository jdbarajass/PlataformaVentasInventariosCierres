import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const paymentSchema = z.object({
  amount_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  account_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_by: z.string().uuid().optional(),
})

// POST - Registrar un abono de un cliente a su fiado/apartado. Se marca
// 'paid' automáticamente cuando la suma de abonos cubre el monto total
// (función pay_customer_credit).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = paymentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { amount_cents, account_id, notes, created_by } = validation.data

    const supabase = getServiceSupabase()
    const { data: credit, error } = await (supabase.rpc as any)('pay_customer_credit', {
      p_credit_id: params.id,
      p_amount_cents: amount_cents,
      p_account_id: account_id || null,
      p_notes: notes || null,
      p_created_by: created_by || null,
    })

    if (error) {
      if (error.message?.includes('no encontrado')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ data: credit }, { status: 201 })
  } catch (error) {
    console.error('Error paying customer credit:', error)
    return NextResponse.json(
      { error: 'Error al registrar el abono' },
      { status: 500 }
    )
  }
}
