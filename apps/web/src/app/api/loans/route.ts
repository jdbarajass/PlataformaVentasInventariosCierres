import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const loanSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  product_title: z.string().min(1, 'El producto es obligatorio'),
  warehouse: z.string().min(1, 'El almacén es obligatorio'),
  observations: z.string().optional().nullable(),
})

// GET - Listar préstamos a otros almacenes (filtro: status)
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
      .from('loans')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status as 'pending' | 'returned' | 'charged')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching loans:', error)
    return NextResponse.json(
      { error: 'Error al obtener los préstamos' },
      { status: 500 }
    )
  }
}

// POST - Registrar un préstamo de producto a otro almacén
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = loanSchema.parse(body)

    const { data: loan, error } = await supabase
      .from('loans')
      // @ts-ignore - Supabase type inference issue
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(loan, { status: 201 })
  } catch (error) {
    console.error('Error creating loan:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al crear el préstamo' },
      { status: 500 }
    )
  }
}
