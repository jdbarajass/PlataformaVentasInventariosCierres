import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

// DELETE - Eliminar una nota del día
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
    const { error } = await supabase.from('daily_notes').delete().eq('id', id)

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'daily_note_deleted',
      tableName: 'daily_notes',
      recordId: id,
    })

    return NextResponse.json({ message: 'Nota eliminada', id })
  } catch (error) {
    console.error('Error deleting daily note:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la nota' },
      { status: 500 }
    )
  }
}
