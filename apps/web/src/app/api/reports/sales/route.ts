import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

interface OrderData {
  id: string
  total_cents: number
  subtotal_cents: number
  discount_cents: number
  payment_status: string
  created_at: string
  order_items: Array<{
    id: string
    qty: number
    price_cents: number
    product_id: string | null
  }>
}

export async function GET(request: NextRequest) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const groupBy = searchParams.get('group_by') || 'day'

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Se requieren los parámetros from y to' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Get orders within date range
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        total_cents,
        subtotal_cents,
        discount_cents,
        payment_status,
        created_at,
        order_items (
          id,
          qty,
          price_cents,
          product_id
        )
      `)
      .gte('created_at', from)
      .lte('created_at', to)
      .eq('payment_status', 'paid')

    if (ordersError) {
      throw ordersError
    }

    const typedOrders = (orders as OrderData[]) || []

    // Group sales by period
    const salesByPeriod: Record<string, {
      period: string
      total_sales_cents: number
      total_orders: number
      total_items: number
      average_order_cents: number
    }> = {}

    typedOrders.forEach((order) => {
      const date = new Date(order.created_at)
      let periodKey: string

      switch (groupBy) {
        case 'week':
          const weekStart = new Date(date)
          weekStart.setDate(date.getDate() - date.getDay())
          periodKey = weekStart.toISOString().split('T')[0]
          break
        case 'month':
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          break
        default: // day
          periodKey = date.toISOString().split('T')[0]
      }

      if (!salesByPeriod[periodKey]) {
        salesByPeriod[periodKey] = {
          period: periodKey,
          total_sales_cents: 0,
          total_orders: 0,
          total_items: 0,
          average_order_cents: 0,
        }
      }

      salesByPeriod[periodKey].total_sales_cents += order.total_cents
      salesByPeriod[periodKey].total_orders += 1
      salesByPeriod[periodKey].total_items += order.order_items?.reduce(
        (sum, item) => sum + item.qty,
        0
      ) || 0
    })

    // Calculate averages
    Object.values(salesByPeriod).forEach((period) => {
      period.average_order_cents = Math.round(
        period.total_sales_cents / period.total_orders
      )
    })

    // Sort by period
    const sortedSales = Object.values(salesByPeriod).sort(
      (a, b) => a.period.localeCompare(b.period)
    )

    // Calculate totals
    const totals = sortedSales.reduce(
      (acc, period) => ({
        total_sales_cents: acc.total_sales_cents + period.total_sales_cents,
        total_orders: acc.total_orders + period.total_orders,
        total_items: acc.total_items + period.total_items,
      }),
      { total_sales_cents: 0, total_orders: 0, total_items: 0 }
    )

    return NextResponse.json({
      data: sortedSales,
      summary: {
        ...totals,
        average_order_cents: totals.total_orders > 0
          ? Math.round(totals.total_sales_cents / totals.total_orders)
          : 0,
        period_count: sortedSales.length,
      },
      filters: { from, to, group_by: groupBy },
    })
  } catch (error) {
    console.error('Error fetching sales report:', error)
    return NextResponse.json(
      { error: 'Error al obtener el reporte de ventas' },
      { status: 500 }
    )
  }
}
