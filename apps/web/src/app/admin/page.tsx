import { supabase } from '@/lib/supabase'
import { formatPrice, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

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

  const todayTotal = todaySales?.reduce((sum, order) => sum + order.total_cents, 0) || 0

  // Sales this week
  const { data: weekSales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('payment_status', 'paid')
    .gte('created_at', startOfWeek)

  const weekTotal = weekSales?.reduce((sum, order) => sum + order.total_cents, 0) || 0

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

  // Top products
  const { data: topProducts } = await supabase
    .from('order_items')
    .select('product_id, product_title, qty')
    .gte('created_at', startOfMonth)
    .limit(100)

  const productSales: Record<string, { title: string; qty: number }> = {}
  topProducts?.forEach((item) => {
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

  return {
    todayTotal,
    weekTotal,
    ordersToday: ordersToday || 0,
    pendingOrders: pendingOrders || 0,
    lowStockProducts: lowStockProducts || [],
    topProducts: topProductsList,
    recentOrders: recentOrders || [],
  }
}

export default async function AdminDashboard() {
  const stats = await getDashboardStats()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen de ventas y actividad de la tienda
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ventas Hoy</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(stats.todayTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500 inline-flex items-center">
                <ArrowUpRight className="h-3 w-3" />
                +12%
              </span>{' '}
              vs ayer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ventas Semana</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(stats.weekTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              Ultimos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ordenes Hoy</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordersToday}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingOrders} pendientes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lowStockProducts.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Productos por reabastecer
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Ordenes Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length > 0 ? (
              <div className="space-y-4">
                {stats.recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.customer_name || order.customer_email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatPrice(order.total_cents)}
                      </p>
                      <Badge
                        variant={
                          order.payment_status === 'paid'
                            ? 'success'
                            : order.payment_status === 'failed'
                            ? 'error'
                            : 'warning'
                        }
                      >
                        {order.payment_status === 'paid'
                          ? 'Pagado'
                          : order.payment_status === 'failed'
                          ? 'Fallido'
                          : 'Pendiente'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">
                No hay ordenes recientes
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Productos Mas Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topProducts.length > 0 ? (
              <div className="space-y-4">
                {stats.topProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                        {index + 1}
                      </span>
                      <p className="font-medium line-clamp-1">
                        {product.title}
                      </p>
                    </div>
                    <Badge variant="secondary">{product.qty} vendidos</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">
                No hay datos de ventas este mes
              </p>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        {stats.lowStockProducts.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Alerta de Stock Bajo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-medium line-clamp-1">{product.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Stock: {product.stock_qty}
                      </p>
                    </div>
                    <Badge variant={product.stock_qty === 0 ? 'error' : 'warning'}>
                      {product.stock_qty === 0 ? 'Agotado' : 'Bajo'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
