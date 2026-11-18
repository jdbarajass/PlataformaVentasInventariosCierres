import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { resolveSale } from '@/lib/pos-sale'
import { logAudit } from '@/lib/audit'
import { loanSaleSchema, loadLoan, productHasSizes, isLoanRuleError } from '@/lib/loans'

// POST - Cobrar un préstamo (Nos deben): el otro local lo pagó, así que se
// registra como venta de mostrador (baja el inventario y entra la plata a la
// cuenta) y el préstamo queda "Cobrado" enlazado a esa venta. Todo en una
// sola transacción (charge_lent_loan, migración 00062).
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
    const { price_cents, cost_cents, variant_id, payment, created_at } = validation.data

    const supabase = createAuthenticatedClient(auth.token)
    const loan = await loadLoan(supabase, id)
    if (!loan) {
      return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
    }
    if (loan.direction !== 'lent' || loan.status !== 'pending') {
      return NextResponse.json({ error: 'Solo se cobra un préstamo pendiente de "Nos deben"' }, { status: 400 })
    }

    let item
    if (loan.product_id) {
      const variantId = loan.variant_id || variant_id || null
      if (!variantId && (await productHasSizes(supabase, loan.product_id))) {
        return NextResponse.json({ error: 'Elige la talla del producto que se cobra', needs_size: true }, { status: 400 })
      }
      item = { product_id: loan.product_id, variant_id: variantId, qty: 1, price_cents }
    } else {
      // Préstamo de algo fuera de catálogo: el costo lo escribe el usuario.
      if (!cost_cents) {
        return NextResponse.json({ error: 'Escribe el costo del producto (está fuera de catálogo)' }, { status: 400 })
      }
      item = { product_id: null, manual_title: loan.product_title, manual_cost_cents: cost_cents, qty: 1, price_cents }
    }

    const { resolvedItems, resolvedPayments, subtotal_cents, discount_cents, total_cents } = await resolveSale(
      supabase,
      [item],
      [{ ...payment, amount_cents: price_cents }]
    )

    const service = getServiceSupabase()
    const { data, error } = await (service.rpc as any)('charge_lent_loan', {
      p_loan_id: id,
      p_order: {
        customer_name: loan.warehouse,
        seller_id: auth.user.id,
        subtotal_cents,
        discount_cents,
        total_cents,
        notes: `Cobro de préstamo a ${loan.warehouse}`,
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
      action: 'loan_charged',
      tableName: 'loans',
      recordId: id,
      newData: { sale_order_id: (data as any)?.sale_order_id, price_cents, method: payment.method },
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error charging loan:', error)
    if (error instanceof Error && isLoanRuleError(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al cobrar el préstamo' }, { status: 500 })
  }
}
