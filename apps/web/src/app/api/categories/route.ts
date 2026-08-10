import { NextRequest, NextResponse } from 'next/server'
import { supabase, createAuthenticatedClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

// GET - Listar categorías. Por defecto solo activas (tienda pública, filtro
// de Registrar Venta) — ?include_inactive=true trae todas, para la sección
// de administración de categorías (/admin/categorias), que necesita poder
// reactivar una que esté desactivada. La RLS de "categories" solo deja ver
// activas al cliente anónimo (migración 00004), así que para traer también
// las inactivas hace falta el cliente autenticado de un admin — el filtro
// por sí solo no basta para saltarse RLS.
export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { limit: 60, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  const includeInactive = new URL(request.url).searchParams.get('include_inactive') === 'true'

  try {
    let queryClient = supabase
    if (includeInactive) {
      const auth = await requireAuth(request, ['admin'])
      if (!auth.success) {
        return auth.response
      }
      queryClient = createAuthenticatedClient(auth.token)
    }

    let query = queryClient.from('categories').select('*').order('sort_order', { ascending: true })
    if (!includeInactive) {
      query = query.eq('active', true)
    }
    const { data, error } = await query

    if (error) {
      console.error('Error fetching categories:', error)
      return NextResponse.json(
        { error: 'Error al obtener categorías: ' + error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      categories: data,
      total: data.length,
    })
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

const categorySchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  slug: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita tildes (ej. "Baúles" -> "baules")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// POST - Crear una categoría nueva (solo admin — igual que Configuración,
// Usuarios y demás secciones estructurales del catálogo).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabaseAuth = createAuthenticatedClient(auth.token)
    const body = await request.json()
    const parsed = categorySchema.parse(body)

    const { data: maxRow } = await supabaseAuth
      .from('categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextSortOrder = ((maxRow as any)?.sort_order ?? 0) + 1

    const { data: category, error } = await (supabaseAuth
      .from('categories') as any)
      .insert({
        name: parsed.name,
        slug: parsed.slug || slugify(parsed.name),
        description: parsed.description || null,
        sort_order: nextSortOrder,
        active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una categoría con ese nombre o slug' }, { status: 409 })
      }
      throw error
    }

    await logAudit(supabaseAuth, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'category_created',
      tableName: 'categories',
      recordId: (category as any)?.id,
      newData: parsed,
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('Error creating category:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json({ error: 'Datos de validación inválidos' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Error al crear la categoría' }, { status: 500 })
  }
}
