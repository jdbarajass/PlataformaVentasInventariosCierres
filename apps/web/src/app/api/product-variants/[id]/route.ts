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
    // Solo admin puede editar inventario, igual que el software local exige
    // la clave maestra de Admin para esta acción incluso con sesión de vendedor.
    const auth = await requireAuth(request, ['admin'])
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

// DELETE - Desactivar una variante (soft delete, preserva el historial de ventas/movimientos).
// Si tenía stock, registra un movimiento 'deleted' — igual que el software
// local (database/inventario_repo.py: eliminar_producto), que deja rastro en
// el historial de movimientos en vez de simplemente hacer desaparecer el stock.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data: variant, error: fetchError } = await supabase
      .from('product_variants')
      .select('id, product_id, stock_qty, talla')
      .eq('id', params.id)
      .single()

    if (fetchError || !variant) {
      return NextResponse.json({ error: 'Variante no encontrada' }, { status: 404 })
    }

    const v = variant as { id: string; product_id: string; stock_qty: number; talla: string | null }

    const { error } = await supabase
      .from('product_variants')
      // @ts-ignore - Supabase type inference issue
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) {
      throw error
    }

    if (v.stock_qty > 0) {
      await (supabase.from('inventory_movements') as any).insert({
        product_id: v.product_id,
        variant_id: v.id,
        qty: -v.stock_qty,
        type: 'deleted',
        note: `Variante desactivada${v.talla ? ` (talla ${v.talla})` : ''} con ${v.stock_qty} unidades en stock`,
        created_by: auth.user.id,
      })
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
