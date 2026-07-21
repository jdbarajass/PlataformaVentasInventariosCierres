import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const creditUpdateSchema = z.object({
  customer_name: z.string().min(1).optional(),
  customer_id_number: z.string().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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

// PUT - Editar datos descriptivos del fiado (nunca el estado/monto directo)
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

    const { data: credit, error } = await supabase
      .from('customer_credits')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      throw error
    }

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

    return NextResponse.json({ message: 'Fiado eliminado exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting customer credit:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el fiado' },
      { status: 500 }
    )
  }
}
