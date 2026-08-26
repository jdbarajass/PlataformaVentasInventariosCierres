import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const receivableSchema = z.object({
  account_id: z.string().uuid(),
  debtor_name: z.string().min(1, 'El nombre del deudor es obligatorio'),
  amount_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  debt_date: z.string().optional(),
  notes: z.string().optional().nullable(),
  created_by: z.string().uuid().optional(),
})

// GET - Listar cuentas por cobrar (dinero que nos deben, ligado a un medio
// de pago). Solo admin, mismo criterio que el resto de Cuentas.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('account_receivables')
      .select('*')
      .order('debt_date', { ascending: true })

    if (accountId) {
      query = query.eq('account_id', accountId)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching account receivables:', error)
    return NextResponse.json(
      { error: 'Error al obtener las cuentas por cobrar' },
      { status: 500 }
    )
  }
}

// POST - Registrar una deuda pendiente ligada a una cuenta.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = receivableSchema.parse(body)

    const { data: receivable, error } = await supabase
      .from('account_receivables')
      // @ts-ignore - Supabase type inference issue
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'account_receivable_created',
      tableName: 'account_receivables',
      recordId: (receivable as any)?.id,
      newData: validatedData,
    })

    return NextResponse.json(receivable, { status: 201 })
  } catch (error) {
    console.error('Error creating account receivable:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al registrar la cuenta por cobrar' },
      { status: 500 }
    )
  }
}
