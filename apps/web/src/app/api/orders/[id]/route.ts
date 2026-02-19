import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { sendOrderShipped } from '@/lib/email'

// GET - Admin: get single order details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request, ['admin', 'seller'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Admin: update order status, tracking, fulfillment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request, ['admin', 'seller'])
  if (!auth.success) return auth.response

  const supabase = getServiceSupabase()
  const body = await request.json()
  const { status, tracking_number, tracking_url } = body

  // Update order status
  if (status) {
    const { error } = await (supabase.from('orders') as any)
      .update({ status })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Store tracking info in order metadata
  if (tracking_number !== undefined || tracking_url !== undefined) {
    // Get current metadata
    const { data: order } = await supabase
      .from('orders')
      .select('metadata')
      .eq('id', params.id)
      .single()

    const currentMetadata = (order?.metadata as Record<string, any>) || {}
    const newMetadata = {
      ...currentMetadata,
      ...(tracking_number !== undefined && { tracking_number }),
      ...(tracking_url !== undefined && { tracking_url }),
    }

    const { error: metaError } = await (supabase.from('orders') as any)
      .update({ metadata: newMetadata })
      .eq('id', params.id)

    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 })
    }
  }

  // If status changed to 'shipped', send notification email
  if (status === 'shipped') {
    try {
      await sendOrderShipped(params.id, tracking_number, tracking_url)
    } catch (emailError) {
      console.error('Error sending shipped notification:', emailError)
    }
  }

  // Log audit
  await (supabase.from('audit_logs') as any).insert({
    action: `order_${status || 'updated'}`,
    table_name: 'orders',
    record_id: params.id,
    new_data: body,
  })

  return NextResponse.json({ success: true })
}
