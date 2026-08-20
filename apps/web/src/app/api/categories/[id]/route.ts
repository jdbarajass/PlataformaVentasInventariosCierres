import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
})

// PUT - Editar nombre/slug/descripción o activar/desactivar una categoría
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)
    const body = await request.json()
    const validatedData = categoryUpdateSchema.parse(body)

    const { data: category, error } = await (supabase
      .from('categories') as any)
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una categoría con ese nombre o slug' }, { status: 409 })
      }
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'category_updated',
      tableName: 'categories',
      recordId: id,
      newData: validatedData,
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error('Error updating category:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json({ error: 'Datos de validación inválidos' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Error al actualizar la categoría' }, { status: 500 })
  }
}

// DELETE - Eliminar una categoría por completo. Bloqueado si algún producto
// todavía la usa (evita dejar products.category_id apuntando a nada) — el
// admin debe reasignar esos productos o usar "Desactivar" en su lugar.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    if (count && count > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: ${count} producto(s) todavía usan esta categoría. Reasígnalos o desactívala en vez de eliminarla.` },
        { status: 409 }
      )
    }

    const { error } = await supabase.from('categories').delete().eq('id', id)

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'category_deleted',
      tableName: 'categories',
      recordId: id,
    })

    return NextResponse.json({ message: 'Categoría eliminada', id: id })
  } catch (error) {
    console.error('Error deleting category:', error)
    return NextResponse.json({ error: 'Error al eliminar la categoría' }, { status: 500 })
  }
}
