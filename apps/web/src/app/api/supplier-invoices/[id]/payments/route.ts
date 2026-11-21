import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { checkSufficientBalance } from '@/lib/account-balance'
import { bogotaDateStr } from '@/lib/bogota-time'
import { expenseGmfCents } from '@/lib/finance/gmf'
import { z } from 'zod'

const paymentSchema = z.object({
  amount_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  account_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_by: z.string().uuid().optional(),
  // Fecha del abono (YYYY-MM-DD, hora Colombia). Sin ella, hoy.
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().nullable(),
  // Casilla "cobrar 4x1000" (migración 00063). Solo aplica si la cuenta no es efectivo.
  apply_gmf: z.boolean().optional(),
})

// POST - Registrar un abono (parcial o el saldo restante) a una factura.
// La factura se marca 'paid' automáticamente cuando la suma de abonos
// alcanza el monto total (función pay_supplier_invoice). Si la cuenta no es
// efectivo, se cobra además el 4x1000 como gasto en "Gastos bancarios"
// (no cuenta como abono a la factura).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

    const { amount_cents, account_id, notes, created_by, paid_at, apply_gmf = false } = validation.data

    if (paid_at && paid_at > bogotaDateStr(new Date())) {
      return NextResponse.json({ error: 'La fecha del abono no puede ser futura' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    // No dejar la cuenta en negativo (pay_supplier_invoice resta sin
    // validar): el saldo tiene que cubrir el abono + su 4x1000. Sin cuenta
    // ("Sin cuenta") no se toca ningún saldo.
    if (account_id) {
      let gmf = 0
      if (apply_gmf) {
        const { data: account } = await supabase.from('accounts').select('payment_method').eq('id', account_id).maybeSingle()
        gmf = expenseGmfCents(amount_cents, (account as any)?.payment_method, true)
      }
      const insufficient = await checkSufficientBalance(supabase, account_id, amount_cents + gmf)
      if (insufficient) return insufficient
    }

    const { data: invoice, error } = await (supabase.rpc as any)('pay_supplier_invoice', {
      p_invoice_id: id,
      p_amount_cents: amount_cents,
      p_account_id: account_id || null,
      p_notes: notes || null,
      p_created_by: created_by || null,
      p_paid_at: paid_at || null,
      p_apply_gmf: apply_gmf,
    })

    if (error) {
      if (error.message?.includes('no encontrada')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error.message?.includes('futura')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
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
