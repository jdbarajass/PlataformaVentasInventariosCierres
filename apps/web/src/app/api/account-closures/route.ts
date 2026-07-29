import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const closureSchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  notes: z.string().optional(),
  created_by: z.string().uuid().optional(),
})

// GET - Listar cierres mensuales de cuentas
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('account_closures')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching account closures:', error)
    return NextResponse.json(
      { error: 'Error al obtener los cierres de cuentas' },
      { status: 500 }
    )
  }
}

// POST - Hacer/rehacer el cierre mensual: snapshot del saldo de cada cuenta
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = closureSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const now = new Date()
    const year = validation.data.year ?? now.getFullYear()
    const month = validation.data.month ?? now.getMonth() + 1

    const supabase = createAuthenticatedClient(auth.token)

    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, payment_method, balance_cents')
      .eq('active', true)

    if (accountsError) {
      throw accountsError
    }

    const snapshot = {
      accounts: accounts || [],
      taken_at: now.toISOString(),
    }

    // Cierre sobreescribible: si ya existe uno para year/month, se actualiza
    // (mismo comportamiento que hacer_cierre_mes del software local).
    const { data: closure, error } = await (supabase
      .from('account_closures') as any)
      .upsert(
        {
          year,
          month,
          snapshot,
          notes: validation.data.notes,
          created_by: validation.data.created_by,
        },
        { onConflict: 'year,month' }
      )
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'account_closure_created',
      tableName: 'account_closures',
      recordId: (closure as any)?.id,
      newData: { year, month },
    })

    return NextResponse.json({ data: closure }, { status: 201 })
  } catch (error) {
    console.error('Error creating account closure:', error)
    return NextResponse.json(
      { error: 'Error al crear el cierre de cuentas' },
      { status: 500 }
    )
  }
}
