import { supabase } from '@/lib/supabase'
import { Order } from '@/types/database'
import { DashboardTabs } from '@/components/admin/dashboard-tabs'

interface SalesData {
  total_cents: number
}

interface LowStockProduct {
  id: string
  title: string
  stock_qty: number
  low_stock_threshold: number
}

interface TopProductItem {
  product_id: string | null
  product_title: string
  qty: number
}

async function getDashboardStats() {
  const today = new Date()
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
  const startOfWeek = new Date(today.setDate(today.getDate() - 7)).toISOString()
  const startOfMonth = new Date(today.setDate(1)).toISOString()

  // Sales today
  const { data: todaySales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('payment_status', 'paid')
    .gte('created_at', startOfDay)

  const typedTodaySales = (todaySales as SalesData[]) || []
  const todayTotal = typedTodaySales.reduce((sum, order) => sum + order.total_cents, 0)

  // Sales this week
  const { data: weekSales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('payment_status', 'paid')
    .gte('created_at', startOfWeek)

  const typedWeekSales = (weekSales as SalesData[]) || []
  const weekTotal = typedWeekSales.reduce((sum, order) => sum + order.total_cents, 0)

  // Orders count
  const { count: ordersToday } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfDay)

  const { count: pendingOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  // Low stock products
  const { data: lowStockProducts } = await supabase
    .from('products')
    .select('id, title, stock_qty, low_stock_threshold')
    .eq('active', true)
    .filter('stock_qty', 'lte', 'low_stock_threshold')
    .limit(5)

  const typedLowStock = (lowStockProducts as LowStockProduct[]) || []

  // Top products
  const { data: topProducts } = await supabase
    .from('order_items')
    .select('product_id, product_title, qty')
    .gte('created_at', startOfMonth)
    .limit(100)

  const typedTopProducts = (topProducts as TopProductItem[]) || []
  const productSales: Record<string, { title: string; qty: number }> = {}
  typedTopProducts.forEach((item) => {
    if (item.product_id) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { title: item.product_title, qty: 0 }
      }
      productSales[item.product_id].qty += item.qty
    }
  })

  const topProductsList = Object.entries(productSales)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // Recent orders
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  const typedRecentOrders = (recentOrders as Order[]) || []

  return {
    todayTotal,
    weekTotal,
    ordersToday: ordersToday || 0,
    pendingOrders: pendingOrders || 0,
    lowStockProducts: typedLowStock,
    topProducts: topProductsList,
    recentOrders: typedRecentOrders,
  }
}

interface VentasOrderRow {
  id: string
  total_cents: number
  created_at: string
  order_items: { qty: number; cost_cents: number }[] | null
  payments: { method: string; amount_cents: number; commission_cents: number }[] | null
}

// Pestaña "Ventas" del Dashboard — resumen diario (ganancia, ingresos por
// método) + tendencia 7 días, igual que el Dashboard del software local.
// Ventas online + de mostrador unificadas, consistente con Reportes/Historial.
async function getVentasStats() {
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const { data: todayOrdersData } = await supabase
    .from('orders')
    .select('id, total_cents, created_at, order_items(qty, cost_cents), payments(method, amount_cents, commission_cents)')
    .eq('payment_status', 'paid')
    .gte('created_at', startOfDay.toISOString())

  const todayOrders = (todayOrdersData as unknown as VentasOrderRow[]) || []

  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total_cents, 0)
  const todayCost = todayOrders.reduce(
    (sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0),
    0
  )
  const todayCommission = todayOrders.reduce(
    (sum, o) => sum + (o.payments || []).reduce((s, p) => s + (p.commission_cents || 0), 0),
    0
  )
  const methodMap = todayOrders.reduce<Record<string, number>>((acc, o) => {
    ;(o.payments || []).forEach((p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount_cents
    })
    return acc
  }, {})
  const byMethod = Object.entries(methodMap)
    .sort((a, b) => b[1] - a[1])
    .map(([method, cents]) => ({ method, cents }))

  const { data: weekOrdersData } = await supabase
    .from('orders')
    .select('id, total_cents, created_at')
    .eq('payment_status', 'paid')
    .gte('created_at', sevenDaysAgo.toISOString())

  const weekOrders = (weekOrdersData as { total_cents: number; created_at: string }[]) || []
  const trendMap = weekOrders.reduce<Record<string, number>>((acc, o) => {
    const day = o.created_at.split('T')[0]
    acc[day] = (acc[day] || 0) + o.total_cents
    return acc
  }, {})
  const weeklyTrend = Object.entries(trendMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cents]) => ({ date, cents }))

  return {
    todayRevenue,
    todayOrders: todayOrders.length,
    todayCost,
    todayCommission,
    byMethod,
    weeklyTrend,
  }
}

export default async function AdminDashboard() {
  const [stats, ventas] = await Promise.all([getDashboardStats(), getVentasStats()])

  return <DashboardTabs tiendaOnline={stats} ventas={ventas} />
}
