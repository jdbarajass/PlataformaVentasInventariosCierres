import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { resolveSale } from '@/lib/pos-sale'
import { logAudit } from '@/lib/audit'
import { loanSaleSchema, loadLoan, catalogCost, isLoanRuleError } from '@/lib/loans'

// POST - "Lo vendí" (Debemos): vendimos a un cliente el producto que otro
// local nos prestó. Entra como venta de mostrador con ítem manual, así que
// NO toca nuestro inventario (la unidad era del otro local). La deuda sigue
// abierta hasta cerrarla (pagando o devolviendo una unidad igual).
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

    const validation = loanSaleSchema.safeParse(await request.json())
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }
    const { price_cents, cost_cents, payment, created_at } = validation.data

    const supabase = createAuthenticatedClient(auth.token)
    const loan = await loadLoan(supabase, id)
    if (!loan) {
      return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 })
    }
    if (loan.direction !== 'borrowed' || loan.status !== 'pending' || loan.sale_order_id) {
      return NextResponse.json({ error: 'Solo se vende una deuda pendiente que no se haya vendido' }, { status: 400 })
    }

    // Costo: el que se escriba, o el del catálogo si el producto existe. Si
    // después se le paga en plata al otro local, el costo pasa a ser lo pagado.
    const cost = cost_cents || (await catalogCost(supabase, loan.product_id, loan.variant_id))
    if (!cost) {
      return NextResponse.json({ error: 'Escribe el costo del producto (cuánto nos cuesta)' }, { status: 400 })
    }

    const { resolvedItems, resolvedPayments, subtotal_cents, discount_cents, total_cents } = await resolveSale(
      supabase,
      [{ product_id: null, manual_title: loan.product_title, manual_cost_cents: cost, qty: 1, price_cents }],
      [{ ...payment, amount_cents: price_cents }]
    )

    const service = getServiceSupabase()
    const { data, error } = await (service.rpc as any)('sell_borrowed_loan', {
      p_loan_id: id,
      p_order: {
        seller_id: auth.user.id,
        subtotal_cents,
        discount_cents,
        total_cents,
        notes: `Producto prestado por ${loan.warehouse}`,
        metadata: { loan_id: id },
      },
      p_items: resolvedItems,
      p_payments: resolvedPayments,
      p_created_at: created_at || null,
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
      action: 'loan_borrowed_sold',
      tableName: 'loans',
      recordId: id,
      newData: { sale_order_id: (data as any)?.sale_order_id, price_cents, method: payment.method },
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error selling borrowed loan:', error)
    if (error instanceof Error && isLoanRuleError(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al registrar la venta' }, { status: 500 })
  }
}
