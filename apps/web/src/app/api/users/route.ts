import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role')

    const supabase = getServiceSupabase()

    let query = supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    if (role && role !== 'all') {
      query = query.eq('role', role as 'admin' | 'seller' | 'viewer')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Error al obtener usuarios' },
      { status: 500 }
    )
  }
}

// POST - Crear un usuario nuevo (login real, no autorregistro) — igual que
// "+ Crear" en config_panel.py._seccion_usuarios del local, que crea el
// usuario con nombre/rol/contraseña directamente. Aquí se crea la cuenta
// real de Supabase Auth (con el rol elegido desde el inicio, a diferencia
// del autorregistro público que siempre arranca en 'viewer') más su fila
// en public.users.
const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  role: z.enum(['admin', 'seller', 'viewer']),
  phone: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = createUserSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }
    const { email, password, name, role, phone } = validation.data

    const supabase = getServiceSupabase()

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone: phone || null },
    })
    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message || 'Error al crear el usuario' },
        { status: 400 }
      )
    }

    const { data: profile, error: profileError } = await (supabase.from('users') as any)
      .insert({ id: created.user.id, email, name, phone: phone || null, role })
      .select()
      .single()

    if (profileError) {
      // No dejar una cuenta de Auth huérfana sin perfil.
      await supabase.auth.admin.deleteUser(created.user.id)
      throw profileError
    }

    await (supabase.from('audit_logs') as any).insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      action: 'user_created',
      table_name: 'users',
      record_id: created.user.id,
      new_data: { email, name, role },
    })

    return NextResponse.json({ data: profile }, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Error al crear el usuario' }, { status: 500 })
  }
}

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'seller', 'viewer']).optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  // Restablecer la contraseña de cualquier usuario — igual que "Cambiar
  // contraseña de usuario" en config_panel.py del local.
  new_password: z.string().min(6).optional(),
})

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = updateUserSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { userId, new_password, ...updateData } = validation.data
    const supabase = getServiceSupabase()

    if (new_password) {
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, { password: new_password })
      if (pwError) {
        return NextResponse.json({ error: pwError.message }, { status: 400 })
      }
      await (supabase.from('audit_logs') as any).insert({
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        action: 'user_password_reset',
        table_name: 'users',
        record_id: userId,
      })
    }

    if (Object.keys(updateData).length === 0) {
      const { data } = await supabase.from('users').select('*').eq('id', userId).single()
      return NextResponse.json({ data })
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw error
    }

    // Create audit log
    await (supabase.from('audit_logs') as any).insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      action: 'user_updated',
      table_name: 'users',
      record_id: userId,
      new_data: updateData,
    })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Error al actualizar usuario' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar un usuario (?userId=...) — igual que "Borrar" en
// config_panel.py del local (que protege solo al usuario "Admin" fijo).
// Aquí se protege de forma más general: no se puede eliminar el propio
// usuario ni el último administrador restante (evitaría quedar sin acceso).
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'Falta el parámetro userId' }, { status: 400 })
    }
    if (userId === auth.user.id) {
      return NextResponse.json({ error: 'No puedes eliminar tu propio usuario' }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    const { data: target } = await supabase.from('users').select('role').eq('id', userId).single()
    if ((target as { role: string } | null)?.role === 'admin') {
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'No puedes eliminar al único administrador restante' }, { status: 400 })
      }
    }

    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      throw error
    }

    await (supabase.from('audit_logs') as any).insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      action: 'user_deleted',
      table_name: 'users',
      record_id: userId,
    })

    return NextResponse.json({ message: 'Usuario eliminado exitosamente' })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Error al eliminar el usuario' }, { status: 500 })
  }
}
