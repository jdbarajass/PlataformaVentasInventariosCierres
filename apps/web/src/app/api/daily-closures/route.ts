import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { z } from 'zod'

const closureSchema = z.object({
  date: z.string(),
  cash_amount_cents: z.number().int().min(0).default(0),
  card_amount_cents: z.number().int().min(0).default(0),
  transfer_amount_cents: z.number().int().min(0).default(0),
  wallet_amount_cents: z.number().int().min(0).default(0),
  other_amount_cents: z.number().int().min(0).default(0),
  orders_count: z.number().int().min(0).default(0),
  notes: z.string().optional(),
  created_by: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = closureSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const data = validation.data
    const supabase = getServiceSupabase()

    // Check if closure already exists for this date
    const { data: existing } = await supabase
      .from('daily_closures')
      .select('id')
      .eq('date', data.date)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un cierre para esta fecha' },
        { status: 409 }
      )
    }

    // Calculate total
    const total_amount_cents =
      data.cash_amount_cents +
      data.card_amount_cents +
      data.transfer_amount_cents +
      data.wallet_amount_cents +
      data.other_amount_cents

    // Create closure
    const insertData = {
      ...data,
      total_amount_cents,
    }
    const { data: closure, error } = await (supabase
      .from('daily_closures') as any)
      .insert(insertData)
      .select()
      .single()

    if (error) {
      throw error
    }

    // Create audit log
    await (supabase.from('audit_logs') as any).insert({
      actor_id: data.created_by,
      action: 'create',
      table_name: 'daily_closures',
      record_id: closure.id,
      new_data: closure,
    })

    return NextResponse.json({ data: closure }, { status: 201 })
  } catch (error) {
    console.error('Error creating daily closure:', error)
    return NextResponse.json(
      { error: 'Error al crear cierre diario' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = parseInt(searchParams.get('limit') || '30')

    const supabase = getServiceSupabase()

    let query = supabase
      .from('daily_closures')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit)

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

    // Calculate summary
    const closures = (data as any[]) || []
    const summary = closures.reduce(
      (acc, closure) => ({
        total_cash: acc.total_cash + closure.cash_amount_cents,
        total_card: acc.total_card + closure.card_amount_cents,
        total_transfer: acc.total_transfer + closure.transfer_amount_cents,
        total_wallet: acc.total_wallet + closure.wallet_amount_cents,
        total_other: acc.total_other + closure.other_amount_cents,
        grand_total: acc.grand_total + closure.total_amount_cents,
        total_orders: acc.total_orders + closure.orders_count,
      }),
      {
        total_cash: 0,
        total_card: 0,
        total_transfer: 0,
        total_wallet: 0,
        total_other: 0,
        grand_total: 0,
        total_orders: 0,
      }
    )

    return NextResponse.json({ data, summary })
  } catch (error) {
    console.error('Error fetching daily closures:', error)
    return NextResponse.json(
      { error: 'Error al obtener cierres diarios' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, verified, verified_by, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere el ID del cierre' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Get current closure
    const { data: currentData, error: fetchError } = await supabase
      .from('daily_closures')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentData) {
      return NextResponse.json(
        { error: 'Cierre no encontrado' },
        { status: 404 }
      )
    }

    const current = currentData as any

    // Prepare update data
    const updateData: Record<string, unknown> = { ...updates }

    if (verified !== undefined) {
      updateData.verified = verified
      updateData.verified_by = verified_by
      updateData.verified_at = verified ? new Date().toISOString() : null
    }

    // Recalculate total if amounts changed
    if (
      updates.cash_amount_cents !== undefined ||
      updates.card_amount_cents !== undefined ||
      updates.transfer_amount_cents !== undefined ||
      updates.wallet_amount_cents !== undefined ||
      updates.other_amount_cents !== undefined
    ) {
      updateData.total_amount_cents =
        (updates.cash_amount_cents ?? current.cash_amount_cents) +
        (updates.card_amount_cents ?? current.card_amount_cents) +
        (updates.transfer_amount_cents ?? current.transfer_amount_cents) +
        (updates.wallet_amount_cents ?? current.wallet_amount_cents) +
        (updates.other_amount_cents ?? current.other_amount_cents)
    }

    const { data: closure, error } = await (supabase
      .from('daily_closures') as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    // Create audit log
    await (supabase.from('audit_logs') as any).insert({
      actor_id: verified_by || updates.created_by,
      action: 'update',
      table_name: 'daily_closures',
      record_id: id,
      old_data: current,
      new_data: closure,
    })

    return NextResponse.json({ data: closure })
  } catch (error) {
    console.error('Error updating daily closure:', error)
    return NextResponse.json(
      { error: 'Error al actualizar cierre diario' },
      { status: 500 }
    )
  }
}
