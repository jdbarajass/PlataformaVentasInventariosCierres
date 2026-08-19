import { getServiceSupabase } from '@/lib/supabase'
import { Order } from '@/types/database'
import { DashboardTabs } from '@/components/admin/dashboard-tabs'
import { bogotaDateStr, bogotaToISO } from '@/lib/bogota-time'

// Se usa el cliente de servicio (bypassa RLS) en vez del cliente anónimo:
// esta página es un Server Component sin el JWT del usuario adjunto a la
// petición, así que con el cliente anónimo las políticas RLS de orders
// ("Admins can view all orders", que depende de auth.uid()) y de products
// ("Anyone can view active products") dejaban esta consulta viendo 0
// órdenes y solo los 4 productos activos de demo — el dashboard entero
// mostraba ceros. La ruta ya está protegida por middleware (exige sesión).
const supabase = getServiceSupabase()

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

type SalesChannel = 'online' | 'pos'

// Estadísticas de un solo canal (online = tienda web, pos = mostrador
// físico) — antes esta consulta traía TODAS las órdenes sin filtrar por
// canal bajo la pestaña "Tienda Online", así que una venta de mostrador
// registrada desde "Registrar Venta" (channel='pos', cliente por defecto
// "mostrador@yjbmotocom.com") aparecía mezclada ahí, aunque la pestaña
// dijera "Tienda Online". Ahora cada pestaña filtra `channel` de verdad.
async function getChannelStats(channel: SalesChannel) {
  const now = new Date()
  const todayStr = bogotaDateStr(now)
  const startOfDay = bogotaToISO(todayStr, '00:00')

  const weekAgo = new Date(now)
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
  const startOfWeek = bogotaToISO(bogotaDateStr(weekAgo), '00:00')

  const [y, m] = todayStr.split('-')
  const startOfMonth = bogotaToISO(`${y}-${m}-01`, '00:00')

  // Sales today
  const { data: todaySales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('payment_status', 'paid')
    .eq('channel', channel)
    .gte('created_at', startOfDay)

  const typedTodaySales = (todaySales as SalesData[]) || []
  const todayTotal = typedTodaySales.reduce((sum, order) => sum + order.total_cents, 0)

  // Sales this week
  const { data: weekSales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('payment_status', 'paid')
    .eq('channel', channel)
    .gte('created_at', startOfWeek)

  const typedWeekSales = (weekSales as SalesData[]) || []
  const weekTotal = typedWeekSales.reduce((sum, order) => sum + order.total_cents, 0)

  // Orders count
  const { count: ordersToday } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('channel', channel)
    .gte('created_at', startOfDay)

  const { count: pendingOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('channel', channel)
    .eq('status', 'pending')

  // Top products — order_items no tiene columna channel propia, se filtra
  // por el canal de la orden a la que pertenece (join `orders!inner`).
  const { data: topProducts } = await supabase
    .from('order_items')
    .select('product_id, product_title, qty, orders!inner(channel)')
    .eq('orders.channel', channel)
    .gte('created_at', startOfMonth)
    .limit(100)

  const typedTopProducts = (topProducts as unknown as TopProductItem[]) || []
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
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(5)

  const typedRecentOrders = (recentOrders as Order[]) || []

  return {
    todayTotal,
    weekTotal,
    ordersToday: ordersToday || 0,
    pendingOrders: pendingOrders || 0,
    topProducts: topProductsList,
    recentOrders: typedRecentOrders,
  }
}

// Stock bajo es inventario compartido, no depende del canal de venta —
// se calcula una sola vez y se muestra igual en ambas pestañas de canal.
async function getLowStockProducts() {
  // No se filtra por active: el stock bajo debe alertar sobre cualquier
  // producto con inventario real, esté publicado en la tienda o no (ver
  // comentario junto al cliente de servicio arriba).
  // PostgREST no soporta comparar dos columnas entre sí con .filter()
  // (stock_qty vs low_stock_threshold) — .filter('stock_qty','lte',
  // 'low_stock_threshold') trataba "low_stock_threshold" como un literal
  // de texto y fallaba en silencio (data quedaba null, sin lanzar error
  // visible), así que el widget siempre había estado vacío. Se trae todo
  // y se compara en el servidor.
  //
  // Productos con tallas se excluyen de este chequeo por producto completo
  // (su stock_qty es la suma de todas las variantes, migración 00030 — un
  // producto con 8 tallas puede sumar más que el umbral aunque cada talla
  // individual esté casi agotada) y se revisan aparte, por variante, más
  // abajo (mejora de la Fase 5, propuesta A.3).
  const { data: allProductsStock } = await supabase
    .from('products')
    .select('id, title, stock_qty, low_stock_threshold, product_variants(id)')

  const productsWithoutVariants = ((allProductsStock as any[]) || []).filter(
    (p) => !p.product_variants || p.product_variants.length === 0
  )
  const lowStockNoVariant = (productsWithoutVariants as LowStockProduct[])
    .filter((p) => p.stock_qty <= p.low_stock_threshold)

  const { data: variantStock } = await supabase
    .from('product_variants')
    .select('id, talla, stock_qty, low_stock_threshold, product:products(title)')
    .eq('active', true)

  const lowStockVariants = ((variantStock as any[]) || [])
    .filter((v) => v.stock_qty <= v.low_stock_threshold)
    .map((v) => ({
      id: v.id,
      title: `${v.product?.title || 'Producto'} (talla ${v.talla})`,
      stock_qty: v.stock_qty,
      low_stock_threshold: v.low_stock_threshold,
    }))

  return [...lowStockNoVariant, ...lowStockVariants]
    .sort((a, b) => a.stock_qty - b.stock_qty)
    .slice(0, 5)
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
  const todayStr = bogotaDateStr(now)
  const startOfDay = bogotaToISO(todayStr, '00:00')
  const sevenDaysAgoDate = new Date(now)
  sevenDaysAgoDate.setUTCDate(sevenDaysAgoDate.getUTCDate() - 6)
  const sevenDaysAgo = bogotaToISO(bogotaDateStr(sevenDaysAgoDate), '00:00')
  const [y, m] = todayStr.split('-')
  const startOfMonth = bogotaToISO(`${y}-${m}-01`, '00:00')

  const { data: todayOrdersData } = await supabase
    .from('orders')
    .select('id, total_cents, created_at, order_items(qty, cost_cents), payments(method, amount_cents, commission_cents)')
    .eq('payment_status', 'paid')
    .gte('created_at', startOfDay)

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
    .gte('created_at', sevenDaysAgo)

  const weekOrders = (weekOrdersData as { total_cents: number; created_at: string }[]) || []
  const trendMap = weekOrders.reduce<Record<string, number>>((acc, o) => {
    // Día de Bogotá, no el día UTC crudo — ver comentario de getChannelStats.
    const day = bogotaDateStr(new Date(o.created_at))
    acc[day] = (acc[day] || 0) + o.total_cents
    return acc
  }, {})
  const weeklyTrend = Object.entries(trendMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cents]) => ({ date, cents }))

  // Top productos combinado (online + mostrador) este mes — misma lógica
  // de agregación que getChannelStats, pero sin filtrar por canal, para
  // la pestaña "Ventas" (antes el top solo existía por separado en cada
  // pestaña de canal, sin una vista unificada de "qué se está vendiendo").
  const { data: topProductsData } = await supabase
    .from('order_items')
    .select('product_id, product_title, qty')
    .gte('created_at', startOfMonth)
    .limit(200)

  const typedTopProducts = (topProductsData as unknown as TopProductItem[]) || []
  const productSales: Record<string, { title: string; qty: number }> = {}
  typedTopProducts.forEach((item) => {
    if (item.product_id) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { title: item.product_title, qty: 0 }
      }
      productSales[item.product_id].qty += item.qty
    }
  })
  const topProducts = Object.entries(productSales)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  return {
    todayRevenue,
    todayOrders: todayOrders.length,
    todayCost,
    todayCommission,
    byMethod,
    weeklyTrend,
    topProducts,
  }
}

export default async function AdminDashboard() {
  const [onlineStats, posStats, lowStockProducts, ventas] = await Promise.all([
    getChannelStats('online'),
    getChannelStats('pos'),
    getLowStockProducts(),
    getVentasStats(),
  ])

  return (
    <DashboardTabs
      online={{ ...onlineStats, lowStockProducts }}
      fisica={{ ...posStats, lowStockProducts }}
      ventas={ventas}
    />
  )
}
