import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { checkSufficientBalance } from '@/lib/account-balance'
import { logAudit } from '@/lib/audit'
import { isLoanRuleError } from '@/lib/loans'
import { expenseGmfCents } from '@/lib/finance/gmf'
import { z } from 'zod'

// POST - Cerrar una deuda (Debemos), de una de tres formas (migración 00062):
//   same_unit    → le devolvimos su misma unidad (solo si no se vendió).
//   restock_unit → le devolvimos una igual que nos llegó de surtido; si ya
//                  está ingresada al inventario (product_id), baja 1.
//   money        → le pagamos en plata: sale de la cuenta como pago a
//                  proveedor y, si se vendió, es el costo real de esa venta.
//                  Si la cuenta no es efectivo, cobra además el 4x1000 como
//                  gasto bancario (migración 00063; no suma al costo).
const closeSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('same_unit'), date: z.string().datetime().optional() }),
  z.object({
    method: z.literal('restock_unit'),
    product_id: z.string().uuid().optional().nullable(),
    variant_id: z.string().uuid().optional().nullable(),
    date: z.string().datetime().optional(),
  }),
  z.object({
    method: z.literal('money'),
    amount_cents: z.number().int().positive('Escribe cuánto le pagaste al otro local'),
    account_id: z.string().uuid().optional().nullable(),
    apply_gmf: z.boolean().optional(),
    date: z.string().datetime().optional(),
  }),
])

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

    const validation = closeSchema.safeParse(await request.json())
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }
    const body = validation.data
    const service = getServiceSupabase()

    // No dejar la cuenta en negativo (igual que los abonos a proveedores):
    // el saldo tiene que cubrir el pago + su 4x1000.
    const applyGmf = body.method === 'money' && !!body.apply_gmf
    if (body.method === 'money' && body.account_id) {
      let gmf = 0
      if (applyGmf) {
        const { data: account } = await service.from('accounts').select('payment_method').eq('id', body.account_id).maybeSingle()
        gmf = expenseGmfCents(body.amount_cents, (account as any)?.payment_method, true)
      }
      const insufficient = await checkSufficientBalance(service, body.account_id, body.amount_cents + gmf)
      if (insufficient) return insufficient
    }

    const { data, error } = await (service.rpc as any)('close_borrowed_loan', {
      p_loan_id: id,
      p_method: body.method,
      p_product_id: body.method === 'restock_unit' ? body.product_id || null : null,
      p_variant_id: body.method === 'restock_unit' ? body.variant_id || null : null,
      p_amount_cents: body.method === 'money' ? body.amount_cents : null,
      p_account_id: body.method === 'money' ? body.account_id || null : null,
      p_date: body.date || null,
      p_actor: auth.user.id,
      p_apply_gmf: applyGmf,
    })

    if (error) {
      if (isLoanRuleError(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    await logAudit(service, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'loan_borrowed_closed',
      tableName: 'loans',
      recordId: id,
      newData: body,
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error closing borrowed loan:', error)
    return NextResponse.json({ error: 'Error al cerrar la deuda' }, { status: 500 })
  }
}
