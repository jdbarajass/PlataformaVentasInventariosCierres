import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const noteUpdateSchema = z.object({
  text: z.string().min(1).optional(),
  completed: z.boolean().optional(),
  due_date: z.string().optional().nullable(),
})

// PUT - Editar o marcar completada una nota
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = noteUpdateSchema.parse(body)

    const { data: note, error } = await supabase
      .from('notes')
      // @ts-ignore - Supabase type inference issue
      .update({ ...validatedData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'note_updated',
      tableName: 'notes',
      recordId: id,
      newData: validatedData,
    })

    return NextResponse.json(note)
  } catch (error) {
    console.error('Error updating note:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al actualizar la nota' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar una nota
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'note_deleted',
      tableName: 'notes',
      recordId: id,
    })

    return NextResponse.json({ message: 'Nota eliminada exitosamente', id: id })
  } catch (error) {
    console.error('Error deleting note:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la nota' },
      { status: 500 }
    )
  }
}
