import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { bogotaDateStr } from '@/lib/bogota-time'
import { applyInvoiceAmountChange } from '@/lib/supplier-invoice-edit'

const invoiceUpdateSchema = z.object({
  description: z.string().min(1).optional(),
  supplier: z.string().min(1).optional(),
  amount_cents: z.number().int().min(0).optional(),
  arrival_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET - Detalle de una factura (con items y abonos)
export async function GET(
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

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .select('*, items:supplier_invoice_items(*), payments:supplier_invoice_payments(*)')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching supplier invoice:', error)
    return NextResponse.json(
      { error: 'Error al obtener la factura' },
      { status: 500 }
    )
  }
}

// PUT - Editar la factura (solo admin): descripción, proveedor, total, fechas y
// notas. El estado no se manda: se recalcula si cambia el total (ver
// lib/supplier-invoice-edit.ts) y el total nunca puede quedar por debajo de lo
// ya abonado. Queda en auditoría con el valor anterior.
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

    const body = await request.json()
    const parsed = invoiceUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos de validación inválidos', details: parsed.error.errors }, { status: 400 })
    }
    const validatedData = parsed.data

    const supabase = getServiceSupabase()
    const { data: current, error: currentError } = await supabase
      .from('supplier_invoices')
      .select('id, description, supplier, amount_cents, arrival_date, due_date, notes, status, paid_at, payments:supplier_invoice_payments(amount_cents)')
      .eq('id', id)
      .single()
    if (currentError || !current) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }
    const cur = current as any

    const update: Record<string, unknown> = { ...validatedData, updated_at: new Date().toISOString() }
    if (validatedData.amount_cents !== undefined && validatedData.amount_cents !== Number(cur.amount_cents)) {
      const result = applyInvoiceAmountChange(
        { amount_cents: Number(cur.amount_cents), status: cur.status, paid_at: cur.paid_at, payments: cur.payments },
        validatedData.amount_cents,
        bogotaDateStr(new Date())
      )
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      update.status = result.status
      update.paid_at = result.paid_at
    }

    const { data: invoice, error } = await (supabase.from('supplier_invoices') as any)
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    const { payments: _payments, ...oldData } = cur
    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'supplier_invoice_updated',
      tableName: 'supplier_invoices',
      recordId: id,
      oldData,
      newData: update,
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error updating supplier invoice:', error)
    return NextResponse.json(
      { error: 'Error al actualizar la factura' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar la factura, revirtiendo cualquier abono que haya debitado una cuenta
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

    const supabase = getServiceSupabase()
    const { error } = await (supabase.rpc as any)('delete_supplier_invoice', {
      p_invoice_id: id,
    })

    if (error) {
      if (error.message?.includes('no encontrada')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'supplier_invoice_deleted',
      tableName: 'supplier_invoices',
      recordId: id,
    })

    return NextResponse.json({ message: 'Factura eliminada exitosamente', id: id })
  } catch (error) {
    console.error('Error deleting supplier invoice:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la factura' },
      { status: 500 }
    )
  }
}
