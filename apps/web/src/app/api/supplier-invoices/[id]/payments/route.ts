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

// POST - Registrar un abono (parcial o el saldo restante) a una factura.
// La factura se marca 'paid' automáticamente cuando la suma de abonos
// alcanza el monto total (función pay_supplier_invoice).
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
    const { data: invoice, error } = await (supabase.rpc as any)('pay_supplier_invoice', {
      p_invoice_id: params.id,
      p_amount_cents: amount_cents,
      p_account_id: account_id || null,
      p_notes: notes || null,
      p_created_by: created_by || null,
    })

    if (error) {
      if (error.message?.includes('no encontrada')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ data: invoice }, { status: 201 })
  } catch (error) {
    console.error('Error paying supplier invoice:', error)
    return NextResponse.json(
      { error: 'Error al registrar el abono' },
      { status: 500 }
    )
  }
}
