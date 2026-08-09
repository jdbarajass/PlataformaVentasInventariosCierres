import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { productVariantSchema } from '@/lib/validations/product'
import { variantConflictMessage } from '@/lib/variant-conflict-message'

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
        return NextResponse.json({ error: variantConflictMessage(error) }, { status: 409 })
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

// DELETE - Eliminar una variante (talla) de verdad.
// Antes esto era un soft delete (`active = false`), pero la fila seguía
// ocupando su talla/código de barras frente a las restricciones UNIQUE
// (Postgres no distingue `active` en un UNIQUE normal), así que una talla
// "eliminada" bloqueaba para siempre volver a crear esa misma talla o
// reusar su código — bug reportado 2026-08-09 (ver migración 039). Es
// seguro borrar la fila de verdad: todo lo que referencia
// `product_variants.id` usa `ON DELETE SET NULL` con su propio snapshot ya
// guardado aparte (`order_items.product_talla`/`cost_cents`, el `note` de
// abajo en `inventory_movements`) o `ON DELETE CASCADE` sobre tablas
// puramente operativas sin valor histórico (`restock_subscriptions`,
// `restock_notification_queue`). El trigger de sincronización de stock
// (migración 030) reacciona a `DELETE`, así que `products.stock_qty` queda
// recalculado automáticamente.
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

    // Registrar el movimiento ANTES de borrar: la fila de la variante debe
    // seguir existiendo para que la referencia `variant_id` sea válida al
    // insertar (la cláusula ON DELETE SET NULL solo aplica hacia adelante).
    if (v.stock_qty > 0) {
      await (supabase.from('inventory_movements') as any).insert({
        product_id: v.product_id,
        variant_id: v.id,
        qty: -v.stock_qty,
        type: 'deleted',
        note: `Talla eliminada${v.talla ? ` (talla ${v.talla})` : ''} con ${v.stock_qty} unidades en stock`,
        created_by: auth.user.id,
      })
    }

    const { error } = await supabase
      .from('product_variants')
      .delete()
      .eq('id', params.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ message: 'Variante eliminada exitosamente', id: params.id })
  } catch (error) {
    console.error('Error deleting product variant:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la variante' },
      { status: 500 }
    )
  }
}
