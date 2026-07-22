import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const manualAdjustmentSchema = z.object({
  account_id: z.string().uuid(),
  amount_cents: z.number().int().refine((v) => v !== 0, 'El monto no puede ser cero'),
  description: z.string().optional(),
  created_by: z.string().uuid().optional(),
})

// GET - Listar movimientos de cuentas. Solo admin (ver nota en accounts/route.ts).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Use authenticated client (respects RLS)
    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('account_movements')
      .select('*, account:accounts(id, name, color)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (accountId) {
      query = query.eq('account_id', accountId)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching account movements:', error)
    return NextResponse.json(
      { error: 'Error al obtener los movimientos de cuentas' },
      { status: 500 }
    )
  }
}

// POST - Ajuste manual de saldo de una cuenta (entrada/salida con signo). Solo admin.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = manualAdjustmentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { account_id, amount_cents, description, created_by } = validation.data

    // La función RPC actualiza el saldo e inserta el movimiento en una sola
    // transacción (supabase/migrations/00011_account_balance_functions.sql).
    const supabase = getServiceSupabase()
    const { data: movement, error } = await (supabase.rpc as any)(
      'adjust_account_balance',
      {
        p_account_id: account_id,
        p_amount_cents: amount_cents,
        p_type: 'manual_adjustment',
        p_description: description || 'Ajuste manual de saldo',
        p_created_by: created_by || null,
      }
    )

    if (error) {
      throw error
    }

    return NextResponse.json({ data: movement }, { status: 201 })
  } catch (error) {
    console.error('Error creating account movement:', error)
    return NextResponse.json(
      { error: 'Error al registrar el movimiento' },
      { status: 500 }
    )
  }
}
