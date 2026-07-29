import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const budgetSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  category: z.string().min(1, 'La categoría es obligatoria'),
  budgeted_amount_cents: z.number().int().min(0),
})

// GET - Listar presupuesto de un mes (?year=&month=)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase.from('monthly_budgets').select('*').order('category', { ascending: true })

    if (year) {
      query = query.eq('year', parseInt(year))
    }
    if (month) {
      query = query.eq('month', parseInt(month))
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching monthly budgets:', error)
    return NextResponse.json(
      { error: 'Error al obtener el presupuesto' },
      { status: 500 }
    )
  }
}

// POST - Crear o actualizar el presupuesto de una categoría para un mes (upsert)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = budgetSchema.parse(body)

    const { data: budget, error } = await supabase
      .from('monthly_budgets')
      // @ts-ignore - Supabase type inference issue
      .upsert(validatedData, { onConflict: 'year,month,category' })
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'monthly_budget_saved',
      tableName: 'monthly_budgets',
      recordId: (budget as any)?.id,
      newData: validatedData,
    })

    return NextResponse.json(budget, { status: 201 })
  } catch (error) {
    console.error('Error saving monthly budget:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al guardar el presupuesto' },
      { status: 500 }
    )
  }
}
