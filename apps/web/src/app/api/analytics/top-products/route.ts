import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = parseInt(searchParams.get('limit') || '10')
    const sortBy = searchParams.get('sort_by') || 'revenue' // revenue | quantity

    const supabase = getServiceSupabase()

    // Build date filter for orders
    let ordersQuery = supabase
      .from('orders')
      .select('id')
      .eq('payment_status', 'paid')

    if (from) {
      ordersQuery = ordersQuery.gte('created_at', from)
    }
    if (to) {
      ordersQuery = ordersQuery.lte('created_at', to)
    }

    const { data: orders, error: ordersError } = await ordersQuery

    if (ordersError) {
      throw ordersError
    }

    const orderIds = orders?.map((o) => o.id) || []

    if (orderIds.length === 0) {
      return NextResponse.json({
        data: [],
        summary: {
          total_revenue_cents: 0,
          total_quantity: 0,
          unique_products: 0,
        },
      })
    }

    // Get order items with product info
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        product_id,
        product_title,
        product_image,
        qty,
        price_cents,
        total_cents
      `)
      .in('order_id', orderIds)

    if (itemsError) {
      throw itemsError
    }

    // Aggregate by product
    const productStats: Record<
      string,
      {
        product_id: string | null
        product_title: string
        product_image: string | null
        total_quantity: number
        total_revenue_cents: number
        orders_count: number
      }
    > = {}

    orderItems?.forEach((item) => {
      const key = item.product_id || item.product_title

      if (!productStats[key]) {
        productStats[key] = {
          product_id: item.product_id,
          product_title: item.product_title,
          product_image: item.product_image,
          total_quantity: 0,
          total_revenue_cents: 0,
          orders_count: 0,
        }
      }

      productStats[key].total_quantity += item.qty
      productStats[key].total_revenue_cents += item.total_cents
      productStats[key].orders_count += 1
    })

    // Sort and limit
    const sortedProducts = Object.values(productStats)
      .sort((a, b) => {
        if (sortBy === 'quantity') {
          return b.total_quantity - a.total_quantity
        }
        return b.total_revenue_cents - a.total_revenue_cents
      })
      .slice(0, limit)
      .map((product, index) => ({
        rank: index + 1,
        ...product,
        average_price_cents: Math.round(
          product.total_revenue_cents / product.total_quantity
        ),
      }))

    // Calculate summary
    const allProducts = Object.values(productStats)
    const summary = {
      total_revenue_cents: allProducts.reduce(
        (sum, p) => sum + p.total_revenue_cents,
        0
      ),
      total_quantity: allProducts.reduce((sum, p) => sum + p.total_quantity, 0),
      unique_products: allProducts.length,
      date_range: { from, to },
    }

    return NextResponse.json({
      data: sortedProducts,
      summary,
    })
  } catch (error) {
    console.error('Error fetching top products:', error)
    return NextResponse.json(
      { error: 'Error al obtener productos top' },
      { status: 500 }
    )
  }
}
