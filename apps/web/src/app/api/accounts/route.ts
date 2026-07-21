import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const accountSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  payment_method: z.string().min(1, 'El método de pago es obligatorio'),
  color: z.string().optional().nullable(),
  sort_order: z.number().int().default(0),
})

// GET - Listar cuentas (saldo por medio de pago)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json(
      { error: 'Error al obtener las cuentas' },
      { status: 500 }
    )
  }
}

// POST - Crear una cuenta nueva (poco frecuente; ya existen las 6 por defecto)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = accountSchema.parse(body)

    const { data: account, error } = await supabase
      .from('accounts')
      // @ts-ignore - Supabase type inference issue
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una cuenta con ese nombre' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    console.error('Error creating account:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al crear la cuenta' },
      { status: 500 }
    )
  }
}
