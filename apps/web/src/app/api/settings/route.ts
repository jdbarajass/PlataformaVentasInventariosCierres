import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()

    const supabase = getServiceSupabase()

    const updateData: Record<string, any> = {
      updated_by: auth.user.id,
    }

    // Only update fields that are provided
    const allowedFields = [
      'store_name',
      'store_description',
      'contact_info',
      'shipping_config',
      'tax_config',
      'payment_methods',
      'social_links',
      'branding',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data, error } = await supabase
      .from('store_settings')
      .update(updateData)
      .eq('id', 1)
      .select()
      .single()

    if (error) {
      throw error
    }

    // Audit log
    await (supabase.from('audit_logs') as any).insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      action: 'settings_updated',
      table_name: 'store_settings',
      record_id: '1',
      new_data: updateData,
    })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    )
  }
}
