import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const creditUpdateSchema = z.object({
  customer_name: z.string().min(1).optional(),
  customer_id_number: z.string().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // El software local permite editar el monto total de un fiado ya creado
  // — sección 12.4/13.3 ítem 4.3.11 de la auditoría de fidelidad.
  total_amount_cents: z.number().int().min(0).optional(),
  // El local permite marcar un fiado como pagado sin verificar que el saldo
  // esté cubierto (condona la deuda restante) — _on_marcar_pagado en
  // ui/fiado_panel.py. La nube no tenía ninguna vía para esto (sección 12.4).
  // Solo admin puede condonar deuda (ver gate de rol más abajo).
  force_paid: z.boolean().optional(),
})

// GET - Detalle de un fiado (con abonos)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data: credit, error } = await supabase
      .from('customer_credits')
      .select('*, payments:customer_credit_payments(*)')
      .eq('id', params.id)
      .single()

    if (error || !credit) {
      return NextResponse.json({ error: 'Fiado no encontrado' }, { status: 404 })
    }

    return NextResponse.json(credit)
  } catch (error) {
    console.error('Error fetching customer credit:', error)
    return NextResponse.json(
      { error: 'Error al obtener el fiado' },
      { status: 500 }
    )
  }
}

// PUT - Editar datos descriptivos del fiado, incluido el monto total
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = creditUpdateSchema.parse(body)

    if (validatedData.force_paid && auth.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo un administrador puede marcar un fiado como pagado sin cubrir el saldo' },
        { status: 403 }
      )
    }

    const { force_paid, ...rest } = validatedData
    const updatePayload: Record<string, any> = { ...rest, updated_at: new Date().toISOString() }
    if (force_paid) {
      updatePayload.status = 'paid'
    }

    // Si se edita el monto total, recalcula el estado contra lo ya abonado
    // (nunca se permite bajar el total por debajo de lo ya pagado).
    if (!force_paid && validatedData.total_amount_cents !== undefined) {
      const { data: paymentsData } = await supabase
        .from('customer_credit_payments')
        .select('amount_cents')
        .eq('credit_id', params.id)
      const paidSoFar = ((paymentsData || []) as { amount_cents: number }[]).reduce(
        (sum, p) => sum + p.amount_cents,
        0
      )
      if (validatedData.total_amount_cents < paidSoFar) {
        return NextResponse.json(
          { error: `El monto total no puede ser menor a lo ya abonado (${paidSoFar / 100})` },
          { status: 400 }
        )
      }
      updatePayload.status = paidSoFar >= validatedData.total_amount_cents && validatedData.total_amount_cents > 0
        ? 'paid'
        : 'pending'
    }

    const { data: credit, error } = await supabase
      .from('customer_credits')
      // @ts-ignore - Supabase type inference issue
      .update(updatePayload)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: force_paid ? 'customer_credit_force_paid' : 'customer_credit_updated',
      tableName: 'customer_credits',
      recordId: params.id,
      newData: updatePayload,
    })

    return NextResponse.json(credit)
  } catch (error) {
    console.error('Error updating customer credit:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al actualizar el fiado' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar el fiado, revirtiendo cualquier abono que haya acreditado una cuenta
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()
    const { error } = await (supabase.rpc as any)('delete_customer_credit', {
      p_credit_id: params.id,
    })

    if (error) {
      if (error.message?.includes('no encontrado')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'customer_credit_deleted',
      tableName: 'customer_credits',
      recordId: params.id,
    })

    return NextResponse.json({ message: 'Fiado eliminado exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting customer credit:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el fiado' },
      { status: 500 }
    )
  }
}
