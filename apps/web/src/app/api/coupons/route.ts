import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Admin: list all coupons
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Admin: create a coupon
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const body = await request.json()

  const { data, error } = await (supabase.from('coupons') as any)
    .insert({
      code: body.code?.toUpperCase().trim(),
      description: body.description || null,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      min_purchase_cents: body.min_purchase_cents || 0,
      max_uses: body.max_uses || null,
      valid_from: body.valid_from || null,
      valid_until: body.valid_until || null,
      active: body.active ?? true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un cupon con ese codigo' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// PUT - Admin: update a coupon
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 })
  }

  if (updates.code) {
    updates.code = updates.code.toUpperCase().trim()
  }

  const { data, error } = await (supabase.from('coupons') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Admin: delete a coupon
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request, ['admin'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const id = request.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 })
  }

  const { error } = await (supabase.from('coupons') as any)
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
