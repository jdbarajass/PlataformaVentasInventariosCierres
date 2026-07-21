import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { productVariantSchema } from '@/lib/validations/product'

// PUT - Actualizar una variante (talla, código de barras, stock, costo, etc.)
export async function PUT(
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
    const validatedData = productVariantSchema.partial().parse(body)

    const { data: variant, error } = await supabase
      .from('product_variants')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una variante con esa talla o ese código de barras' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json(variant)
  } catch (error) {
    console.error('Error updating product variant:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al actualizar la variante' },
      { status: 500 }
    )
  }
}

// DELETE - Desactivar una variante (soft delete, preserva el historial de ventas/movimientos)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { error } = await supabase
      .from('product_variants')
      // @ts-ignore - Supabase type inference issue
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ message: 'Variante desactivada exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting product variant:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la variante' },
      { status: 500 }
    )
  }
}
