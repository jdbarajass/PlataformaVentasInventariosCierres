// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { productSchema } from '@/lib/validations/product'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Obtener producto por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()

    const { data: product, error } = await supabase
      .from('products')
      .select('*, categories(name, slug)')
      .eq('id', params.id)
      .single()

    if (error || !product) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar producto
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    // Use authenticated client (respects RLS)
    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()

    // Validar datos con Zod
    const validatedData = productSchema.parse(body)

    // Actualizar producto
    // @ts-ignore - Supabase type inference issue
    const { data: product, error } = await supabase
      .from('products')
      .update({
        ...validatedData,
        slug: body.slug, // El slug viene del formulario
        // Guardar con "Producto activo" marcado es la forma de restaurar
        // uno que se había eliminado — limpia deleted_at para que vuelva
        // a aparecer en Registrar Venta/Cambios (ver migración 00040).
        // JSON.stringify descarta las llaves en `undefined`, así que no
        // toca deleted_at cuando active sigue en false (ej. un producto
        // recién ingresado desde "Ingresar", nunca eliminado).
        deleted_at: validatedData.active ? null : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating product:', error)
      return NextResponse.json(
        { error: 'Error al actualizar producto: ' + error.message },
        { status: 500 }
      )
    }

    // Registrar auditoría (TODO: agregar a audit_logs)

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error updating product:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar producto
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    // Use authenticated client (respects RLS)
    const supabase = createAuthenticatedClient(auth.token)

    // Verificar si el producto existe
    const { data: product } = await supabase
      .from('products')
      .select('id, title')
      .eq('id', params.id)
      .single()

    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    // Soft delete: Marcar como inactivo en lugar de eliminar
    // Esto preserva el historial de órdenes
    // deleted_at (además de active) marca que esto fue un borrado real —
    // a diferencia de un producto simplemente "sin publicar todavía"
    // (ver migración 00040) — para que Registrar Venta/Cambios puedan
    // dejar de mostrarlo sin esconder los que "Ingresar" crea a propósito
    // con active=false.
    const { error: updateError } = await supabase
      .from('products')
      .update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (updateError) {
      console.error('Error deleting product:', updateError)
      return NextResponse.json(
        { error: 'Error al eliminar producto: ' + updateError.message },
        { status: 500 }
      )
    }

    // Registrar auditoría (TODO: agregar a audit_logs)

    return NextResponse.json({
      message: 'Producto eliminado exitosamente',
      id: params.id,
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
