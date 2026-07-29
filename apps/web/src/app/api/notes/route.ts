import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const noteSchema = z.object({
  // 'admin_task' — "Pendientes Generales Admin": solo el admin puede
  // crearlas/verlas, RLS lo exige a nivel de base de datos (ver migración
  // 00029), esto es solo la forma del payload.
  type: z.enum(['task', 'restock', 'admin_task']).default('task'),
  text: z.string().min(1, 'El texto es obligatorio'),
  due_date: z.string().optional().nullable(),
})

// GET - Listar notas y pendientes (filtro: completed)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const completed = searchParams.get('completed')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('notes')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })

    if (completed !== null) {
      query = query.eq('completed', completed === 'true')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json(
      { error: 'Error al obtener las notas' },
      { status: 500 }
    )
  }
}

// POST - Crear una nota o pendiente
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = noteSchema.parse(body)

    const { data: note, error } = await supabase
      .from('notes')
      // @ts-ignore - Supabase type inference issue
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'note_created',
      tableName: 'notes',
      recordId: (note as any)?.id,
      newData: validatedData,
    })

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    console.error('Error creating note:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al crear la nota' },
      { status: 500 }
    )
  }
}
