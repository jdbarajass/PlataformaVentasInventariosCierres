import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Admin: list all reviews (with filter by approved status)
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const searchParams = request.nextUrl.searchParams
  const approved = searchParams.get('approved')

  let query = supabase
    .from('product_reviews')
    .select('*, users:user_id(name, email), products:product_id(title, slug)')
    .order('created_at', { ascending: false })

  if (approved !== null) {
    query = query.eq('approved', approved === 'true')
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Admin: approve/reject a review
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const body = await request.json()
  const { id, approved } = body

  if (!id) {
    return NextResponse.json({ error: 'Review ID is required' }, { status: 400 })
  }

  const { error } = await (supabase.from('product_reviews') as any)
    .update({ approved })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE - Admin: delete a review
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Review ID is required' }, { status: 400 })
  }

  const { error } = await (supabase.from('product_reviews') as any)
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
