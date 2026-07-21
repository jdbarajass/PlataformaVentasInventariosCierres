import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const itemSchema = z.object({
  description: z.string().min(1, 'La descripción es obligatoria'),
  qty: z.number().int().positive().default(1),
  unit_price_cents: z.number().int().min(0).default(0),
})

// POST - Agregar una línea/ítem a una factura de proveedor
export async function POST(
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
    const validatedData = itemSchema.parse(body)
    const subtotal_cents = validatedData.qty * validatedData.unit_price_cents

    const { data: item, error } = await supabase
      .from('supplier_invoice_items')
      // @ts-ignore - Supabase type inference issue
      .insert({ ...validatedData, invoice_id: params.id, subtotal_cents })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier invoice item:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al agregar el ítem' },
      { status: 500 }
    )
  }
}
