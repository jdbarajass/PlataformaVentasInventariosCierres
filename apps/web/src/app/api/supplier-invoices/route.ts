import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const invoiceSchema = z.object({
  description: z.string().min(1, 'La descripción es obligatoria'),
  supplier: z.string().min(1, 'El proveedor es obligatorio'),
  amount_cents: z.number().int().min(0),
  arrival_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET - Listar facturas a proveedores (filtros: status, supplier)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const supplier = searchParams.get('supplier')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('supplier_invoices')
      .select('*, payments:supplier_invoice_payments(*)')
      .order('due_date', { ascending: true, nullsFirst: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (supplier) {
      query = query.ilike('supplier', `%${supplier}%`)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching supplier invoices:', error)
    return NextResponse.json(
      { error: 'Error al obtener las facturas' },
      { status: 500 }
    )
  }
}

// POST - Crear una factura de proveedor (queda 'pending' hasta el primer abono)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = invoiceSchema.parse(body)

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      // @ts-ignore - Supabase type inference issue
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier invoice:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al crear la factura' },
      { status: 500 }
    )
  }
}
