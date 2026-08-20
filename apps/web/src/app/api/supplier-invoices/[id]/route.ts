import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

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

// PUT - Editar datos descriptivos de la factura (nunca el estado/pago directo)
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
    const validatedData = invoiceUpdateSchema.parse(body)

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'supplier_invoice_updated',
      tableName: 'supplier_invoices',
      recordId: id,
      newData: validatedData,
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error updating supplier invoice:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

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
