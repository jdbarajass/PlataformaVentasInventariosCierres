import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const dailyNoteSchema = z.object({
  date: z.string().optional(),
  text: z.string().min(1, 'El texto es obligatorio'),
  created_by: z.string().uuid().optional(),
})

// GET - Listar notas del día (filtros: from, to — mismo patrón que operating-expenses)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('daily_notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (from) {
      query = query.gte('date', from)
    }
    if (to) {
      query = query.lte('date', to)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching daily notes:', error)
    return NextResponse.json(
      { error: 'Error al obtener las notas del día' },
      { status: 500 }
    )
  }
}

// POST - Registrar una nota ligada a un día
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validation = dailyNoteSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.errors }, { status: 400 })
    }
    const { date, text, created_by } = validation.data

    const { data: note, error } = await (supabase
      .from('daily_notes') as any)
      .insert({ date: date || undefined, text, created_by })
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'daily_note_created',
      tableName: 'daily_notes',
      recordId: (note as any)?.id,
      newData: { date, text },
    })

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    console.error('Error creating daily note:', error)
    return NextResponse.json(
      { error: 'Error al registrar la nota' },
      { status: 500 }
    )
  }
}
