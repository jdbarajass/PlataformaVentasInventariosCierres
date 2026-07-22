import { NextRequest, NextResponse } from 'next/server'
import { supabase, getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Generous limit — this powers normal storefront browsing — just enough
  // to deter scraping/abuse without affecting real shoppers.
  const rateLimited = checkRateLimit(request, { limit: 60, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  const searchParams = request.nextUrl.searchParams
  const category = searchParams.get('category')
  const featured = searchParams.get('featured')
  const search = searchParams.get('q')
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const includeInactive = searchParams.get('include_inactive') === 'true'

  // include_inactive expone productos no publicados en la tienda (ej. el
  // inventario físico recién migrado, aún sin foto/descripción) — solo el
  // panel de administración (Inventario) puede pedirlo, y solo si autentica.
  if (includeInactive) {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) return auth.response
  }

  let query = supabase
    .from('products')
    .select('*, categories(name, slug)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  if (category) {
    const { data: catData } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', category)
      .single()
    const cat = catData as { id: string } | null
    if (cat) {
      query = query.eq('category_id', cat.id)
    }
  }

  if (featured === 'true') {
    query = query.eq('featured', true)
  }

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    products: data,
    total: count,
    limit,
    offset,
  })
}

export async function POST(request: NextRequest) {
  // Validate authentication and role
  const auth = await requireAuth(request, ['admin', 'seller'])
  if (!auth.success) {
    return auth.response
  }

  // Use authenticated client (respects RLS)
  const supabase = createAuthenticatedClient(auth.token)
  const body = await request.json()

  const productData = {
    ...body,
    slug: body.slug || body.title.toLowerCase().replace(/\s+/g, '-'),
  }

  const { data, error } = await (supabase
    .from('products') as any)
    .insert(productData)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
