import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const action = searchParams.get('action')
    const tableName = searchParams.get('table')
    const actorId = searchParams.get('actor_id')
    const recordId = searchParams.get('record_id')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = getServiceSupabase()

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }
    if (action) {
      query = query.eq('action', action)
    }
    if (tableName) {
      query = query.eq('table_name', tableName)
    }
    if (actorId) {
      query = query.eq('actor_id', actorId)
    }
    if (recordId) {
      query = query.eq('record_id', recordId)
    }

    const { data, error, count } = await query

    if (error) {
      throw error
    }

    // Get unique actions and tables for filters
    const { data: actions } = await supabase
      .from('audit_logs')
      .select('action')
      .limit(100)

    const { data: tables } = await supabase
      .from('audit_logs')
      .select('table_name')
      .limit(100)

    const uniqueActions = [...new Set(actions?.map((a) => a.action) || [])]
    const uniqueTables = [...new Set(tables?.map((t) => t.table_name) || [])]

    return NextResponse.json({
      data,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      filters: {
        available_actions: uniqueActions,
        available_tables: uniqueTables,
      },
    })
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return NextResponse.json(
      { error: 'Error al obtener logs de auditoría' },
      { status: 500 }
    )
  }
}
