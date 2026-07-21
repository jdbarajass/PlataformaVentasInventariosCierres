import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const creditSchema = z.object({
  customer_name: z.string().min(1, 'El nombre del cliente es obligatorio'),
  customer_id_number: z.string().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  total_amount_cents: z.number().int().min(0),
  notes: z.string().optional().nullable(),
  initial_payment_cents: z.number().int().min(0).optional(),
  initial_payment_account_id: z.string().uuid().optional().nullable(),
  created_by: z.string().uuid().optional(),
})

// GET - Listar fiados/apartados de clientes (filtro: status)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('customer_credits')
      .select('*, payments:customer_credit_payments(*)')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching customer credits:', error)
    return NextResponse.json(
      { error: 'Error al obtener los fiados' },
      { status: 500 }
    )
  }
}

// POST - Crear un fiado/apartado, con abono inicial opcional
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = creditSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const {
      initial_payment_cents,
      initial_payment_account_id,
      created_by,
      ...creditData
    } = validation.data

    const supabase = createAuthenticatedClient(auth.token)

    const { data: credit, error } = await supabase
      .from('customer_credits')
      // @ts-ignore - Supabase type inference issue
      .insert(creditData)
      .select()
      .single()

    if (error) {
      throw error
    }

    if (initial_payment_cents && initial_payment_cents > 0) {
      const serviceSupabase = getServiceSupabase()
      const { data: updatedCredit, error: payError } = await (serviceSupabase.rpc as any)(
        'pay_customer_credit',
        {
          p_credit_id: (credit as any).id,
          p_amount_cents: initial_payment_cents,
          p_account_id: initial_payment_account_id || null,
          p_notes: 'Abono inicial',
          p_created_by: created_by || null,
        }
      )
      if (!payError && updatedCredit) {
        return NextResponse.json(updatedCredit, { status: 201 })
      }
    }

    return NextResponse.json(credit, { status: 201 })
  } catch (error) {
    console.error('Error creating customer credit:', error)
    return NextResponse.json(
      { error: 'Error al crear el fiado' },
      { status: 500 }
    )
  }
}
