import { getServiceSupabase } from '@/lib/supabase'
import { Order } from '@/types/database'
import { DashboardTabs } from '@/components/admin/dashboard-tabs'
import { bogotaDateStr, bogotaToISO } from '@/lib/bogota-time'

// Sin esto, Next.js prerrenderiza esta página como estática en el build
// (no detecta las consultas de Supabase como "dinámicas" — a diferencia de
// `fetch`, que sí reconoce) y la sirve congelada con los datos de ese
// momento a todo el mundo hasta el siguiente deploy. Así se explicaba que
// el Dashboard mostrara una venta del 14/08 como si fuera del 13/08 y una
// "tendencia de los últimos 7 días" con solo 1 día real: no eran los
// últimos 7 días de HOY, eran los del instante del último build. El resto
// del panel (Historial Mensual, Ventas del Día, etc.) no tiene este
// problema porque son componentes de cliente que piden los datos en el
// navegador cada vez que se abren, no en el momento del build.
export const dynamic = 'force-dynamic'

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
  // comentario junto al cliente de servicio arriba). Sí se excluyen los
  // eliminados (deleted_at) — antes un producto ya borrado desde
  // Productos seguía apareciendo aquí para siempre, porque esta consulta
  // era la única del panel que no filtraba por deleted_at (a diferencia
  // de /admin/inventario, que sí lo hace).
  //
  // Un producto con tallas se evalúa por su stock CONSOLIDADO (suma de
  // todas sus variantes, igual que /admin/inventario) contra el umbral
  // del producto — no el umbral de cada talla por separado. Antes se
  // comparaba cada variante contra su propio low_stock_threshold, así que
  // el número mostrado aquí no coincidía con "stock bajo" en Inventario:
  // un producto con una sola talla con existencia (ej. 1 de 8 unidades
  // totales, mínimo 5) podía no aparecer si esa talla nunca cruzaba su
  // propio umbral, mientras que otro con 6 tallas de umbral bajo cada una
  // podía sonar la alerta aunque el total fuera saludable.
  const { data: allProductsStock } = await supabase
    .from('products')
    .select('id, title, stock_qty, low_stock_threshold, product_variants(stock_qty)')
    .is('deleted_at', null)

  const consolidated: LowStockProduct[] = ((allProductsStock as any[]) || []).map((p) => {
    const hasVariants = p.product_variants && p.product_variants.length > 0
    const stock_qty = hasVariants
      ? p.product_variants.reduce((sum: number, v: any) => sum + v.stock_qty, 0)
      : p.stock_qty
    return {
      id: p.id,
      title: p.title,
      stock_qty,
      low_stock_threshold: p.low_stock_threshold,
    }
  })

  // Se devuelve la lista completa (sin recortar a 5) — el conteo real de
  // la tarjeta "Stock Bajo" depende de este arreglo entero; el recorte a
  // los primeros 5 para la vista previa se hace en DashboardTabs, que
  // también enlaza a /admin/inventario?stockBajo=1 para ver el resto.
  return consolidated
    .filter((p) => p.stock_qty <= p.low_stock_threshold)
    .sort((a, b) => a.stock_qty - b.stock_qty)
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
  // Se completan los 7 días del rango con $0 aunque no tengan ventas —
  // antes `trendMap` solo tenía llaves para días con al menos una venta,
  // así que un día sin ventas simplemente no aparecía (en vez de aparecer
  // en $0), y "los últimos 7 días" podía verse con una sola barra aunque
  // el rango sí fueran 7 días reales.
  const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgoDate)
    d.setUTCDate(d.getUTCDate() + i)
    const date = bogotaDateStr(d)
    return { date, cents: trendMap[date] || 0 }
  })

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

interface StaleOrder {
  id: string
  order_number: string
  customer_name: string | null
  customer_email: string
  total_cents: number
  created_at: string
}

// Alertas activas hoy: consolida en el Dashboard lo que hoy está repartido
// en varias pantallas (el popup de recordatorios de sesión solo se ve una
// vez al iniciar sesión, y "Órdenes Pendientes" del panel de canal es solo
// un conteo sin poder ver cuáles ni desde cuándo). Reutiliza las mismas
// reglas que /api/admin/session-alerts (facturas ≤7 días, notas ≤3 días,
// fiados >30 días) para no duplicar el criterio de negocio en dos lugares.
async function getBusinessAlerts() {
  const now = new Date()
  const in7Days = bogotaDateStr(new Date(now.getTime() + 7 * 86_400_000))
  const in3Days = bogotaDateStr(new Date(now.getTime() + 3 * 86_400_000))
  const yesterday = new Date(now.getTime() - 24 * 3_600_000).toISOString()

  const [invoicesRes, notesRes, creditsRes, stalePendingRes, paymentPendingRes] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .not('due_date', 'is', null)
      .lte('due_date', in7Days),
    supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', in3Days),
    supabase.from('customer_credits').select('created_at').eq('status', 'pending'),
    // Pedidos online que llevan más de 24h sin pasar de "pending" — a
    // diferencia del conteo crudo de "Órdenes Pendientes" (que mezcla un
    // pedido de hace 5 minutos con uno de hace 3 días), esto separa lo que
    // de verdad necesita atención.
    supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_email, total_cents, created_at')
      .eq('channel', 'online')
      .eq('status', 'pending')
      .lt('created_at', yesterday)
      .order('created_at', { ascending: true })
      .limit(5),
    // Pagos manuales (transferencia/Nequi/etc.) esperando confirmación —
    // requieren que un admin los marque como pagados a mano.
    supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_email, total_cents, created_at')
      .eq('channel', 'online')
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5),
  ])

  const oldCreditsCount = ((creditsRes.data as { created_at: string }[]) || []).filter(
    (c) => Math.floor((now.getTime() - new Date(c.created_at).getTime()) / 86_400_000) > 30
  ).length

  return {
    dueInvoicesCount: invoicesRes.count || 0,
    urgentNotesCount: notesRes.count || 0,
    oldCreditsCount,
    stalePendingOrders: (stalePendingRes.data as StaleOrder[]) || [],
    paymentPendingOrders: (paymentPendingRes.data as StaleOrder[]) || [],
  }
}

export default async function AdminDashboard() {
  const [onlineStats, posStats, lowStockProducts, ventas, alerts] = await Promise.all([
    getChannelStats('online'),
    getChannelStats('pos'),
    getLowStockProducts(),
    getVentasStats(),
    getBusinessAlerts(),
  ])

  return (
    <DashboardTabs
      online={{ ...onlineStats, lowStockProducts }}
      fisica={{ ...posStats, lowStockProducts }}
      ventas={ventas}
      alerts={alerts}
    />
  )
}
