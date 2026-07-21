import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const expenseSchema = z.object({
  date: z.string().optional(),
  description: z.string().min(1, 'La descripción es obligatoria'),
  amount_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  category: z.string().min(1, 'La categoría es obligatoria'),
  account_id: z.string().uuid().optional().nullable(),
  created_by: z.string().uuid().optional(),
})

// GET - Listar gastos operativos (filtros: from, to, category)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const category = searchParams.get('category')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('operating_expenses')
      .select('*')
      .order('date', { ascending: false })

    if (from) {
      query = query.gte('date', from)
    }
    if (to) {
      query = query.lte('date', to)
    }
    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching operating expenses:', error)
    return NextResponse.json(
      { error: 'Error al obtener los gastos operativos' },
      { status: 500 }
    )
  }
}

// POST - Registrar un gasto operativo (debita la cuenta indicada, si hay)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = expenseSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { date, description, amount_cents, category, account_id, created_by } = validation.data

    const supabase = getServiceSupabase()
    const { data: expense, error } = await (supabase.rpc as any)('record_operating_expense', {
      p_date: date || null,
      p_description: description,
      p_amount_cents: amount_cents,
      p_category: category,
      p_account_id: account_id || null,
      p_created_by: created_by || null,
    })

    if (error) {
      throw error
    }

    return NextResponse.json({ data: expense }, { status: 201 })
  } catch (error) {
    console.error('Error creating operating expense:', error)
    return NextResponse.json(
      { error: 'Error al registrar el gasto' },
      { status: 500 }
    )
  }
}
