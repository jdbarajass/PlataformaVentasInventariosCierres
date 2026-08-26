'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamSalesGoalCard } from '@/components/admin/team-sales-goal-card'
import { BOGOTA_TZ } from '@/lib/bogota-time'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { Order } from '@/types/database'
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Store,
  Building2,
  Wallet,
  Clock,
  CheckCircle2,
  FileText,
  StickyNote,
  CreditCard,
  PackageSearch,
} from 'lucide-react'

interface LowStockProduct {
  id: string
  title: string
  stock_qty: number
  low_stock_threshold: number
}

interface TopProduct {
  id: string
  title: string
  qty: number
}

interface ChannelStats {
  todayTotal: number
  weekTotal: number
  ordersToday: number
  pendingOrders: number
  lowStockProducts: LowStockProduct[]
  topProducts: TopProduct[]
  recentOrders: Order[]
}

interface VentasStats {
  todayRevenue: number
  todayOrders: number
  todayCost: number
  todayCommission: number
  byMethod: { method: string; cents: number }[]
  weeklyTrend: { date: string; cents: number }[]
  topProducts: TopProduct[]
}

interface AlertOrder {
  id: string
  order_number: string
  customer_name: string | null
  customer_email: string
  total_cents: number
  created_at: string
}

interface BusinessAlerts {
  dueInvoicesCount: number
  urgentNotesCount: number
  oldCreditsCount: number
  stalePendingOrders: AlertOrder[]
  paymentPendingOrders: AlertOrder[]
}

function hoursAgo(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

// Alertas activas hoy — consolida en un solo lugar del Dashboard lo que
// antes estaba repartido (popup de recordatorios solo al iniciar sesión,
// conteo crudo de "Órdenes Pendientes" sin poder ver cuáles). No repite la
// Alerta de Stock Bajo: esa ya tiene su propia tarjeta en cada pestaña de
// canal, mostrarla dos veces en la misma página sería ruido.
function AlertsPanel({ alerts }: { alerts: BusinessAlerts }) {
  const total =
    alerts.dueInvoicesCount +
    alerts.urgentNotesCount +
    alerts.oldCreditsCount +
    alerts.stalePendingOrders.length +
    alerts.paymentPendingOrders.length

  if (total === 0) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
          <p className="text-sm font-medium">Todo al día — sin alertas activas.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Alertas activas hoy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {alerts.dueInvoicesCount > 0 && (
            <Link href="/admin/facturas">
              <Badge variant="warning" className="gap-1.5 px-3 py-1.5">
                <FileText className="h-3.5 w-3.5" />
                {alerts.dueInvoicesCount} factura{alerts.dueInvoicesCount === 1 ? '' : 's'} por vencer
              </Badge>
            </Link>
          )}
          {alerts.urgentNotesCount > 0 && (
            <Link href="/admin/notas">
              <Badge variant="warning" className="gap-1.5 px-3 py-1.5">
                <StickyNote className="h-3.5 w-3.5" />
                {alerts.urgentNotesCount} nota{alerts.urgentNotesCount === 1 ? '' : 's'} con fecha límite próxima
              </Badge>
            </Link>
          )}
          {alerts.oldCreditsCount > 0 && (
            <Link href="/admin/fiado">
              <Badge variant="warning" className="gap-1.5 px-3 py-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                {alerts.oldCreditsCount} fiado{alerts.oldCreditsCount === 1 ? '' : 's'} con más de 30 días
              </Badge>
            </Link>
          )}
        </div>

        {alerts.paymentPendingOrders.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">
              Pagos pendientes de confirmar ({alerts.paymentPendingOrders.length})
            </p>
            <div className="space-y-1.5">
              {alerts.paymentPendingOrders.map((o) => (
                <Link
                  key={o.id}
                  href="/admin/ordenes"
                  className="flex items-center justify-between rounded-lg border p-2.5 text-sm transition-colors hover:bg-secondary"
                >
                  <span className="line-clamp-1">
                    {o.order_number} — {o.customer_name || o.customer_email}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatPrice(o.total_cents)} · {hoursAgo(o.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {alerts.stalePendingOrders.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <PackageSearch className="h-4 w-4" />
              Pedidos sin confirmar hace más de 24h ({alerts.stalePendingOrders.length})
            </p>
            <div className="space-y-1.5">
              {alerts.stalePendingOrders.map((o) => (
                <Link
                  key={o.id}
                  href="/admin/ordenes"
                  className="flex items-center justify-between rounded-lg border p-2.5 text-sm transition-colors hover:bg-secondary"
                >
                  <span className="line-clamp-1">
                    {o.order_number} — {o.customer_name || o.customer_email}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatPrice(o.total_cents)} · {hoursAgo(o.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

// Mismas etiquetas/colores que admin/ordenes/page.tsx (paymentLabels) — el
// badge de "Ordenes Recientes" solo distinguía paid/failed/"Pendiente" por
// defecto, así que una orden con payment_status='refunded' se mostraba mal
// etiquetada como "Pendiente" (y no aparecía al filtrar Pendientes en
// Órdenes, porque ahí sí compara el valor real).
const paymentLabels: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  paid: { label: 'Pagado', variant: 'success' },
  failed: { label: 'Fallido', variant: 'error' },
  refunded: { label: 'Reembolsado', variant: 'default' },
}

// Tarjetas + órdenes recientes + top productos + alerta de stock bajo de UN
// canal (online o físico) — antes esto solo existía para "Tienda Online" con
// datos sin filtrar por canal; ahora se reutiliza igual para ambas pestañas,
// cada una ya con sus propios datos filtrados por `channel` (ver admin/page.tsx).
function ChannelPanel({ stats }: { stats: ChannelStats }) {
  return (
    <div className="space-y-6">
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

        <Link href="/admin/inventario?stockBajo=1" className="block">
          <Card className="transition-colors hover:border-cyan-500/50 hover:bg-secondary/30">
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
        </Link>
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
                {stats.recentOrders.map((order) => {
                  const payment = paymentLabels[order.payment_status] || { label: order.payment_status, variant: 'default' as const }
                  return (
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
                        <Badge variant={payment.variant}>{payment.label}</Badge>
                      </div>
                    </div>
                  )
                })}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Alerta de Stock Bajo
              </CardTitle>
              <Link
                href="/admin/inventario?stockBajo=1"
                className="text-sm font-medium text-cyan-600 hover:underline"
              >
                Ver todos ({stats.lowStockProducts.length})
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.lowStockProducts.slice(0, 5).map((product) => (
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

export function DashboardTabs({
  online,
  fisica,
  ventas,
  alerts,
}: {
  online: ChannelStats
  fisica: ChannelStats
  ventas: VentasStats
  alerts: BusinessAlerts
}) {
  const [tab, setTab] = useState<'ventas' | 'online' | 'fisica'>('ventas')
  const { userProfile } = useAuth()
  const canViewProfit = userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'

  const todayProfit = ventas.todayRevenue - ventas.todayCost
  const maxWeekly = Math.max(...ventas.weeklyTrend.map((d) => d.cents), 1)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Resumen de ventas y actividad de la tienda</p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('ventas')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            tab === 'ventas' ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Wallet className="h-4 w-4" /> Ventas
        </button>
        <button
          onClick={() => setTab('online')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            tab === 'online' ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Store className="h-4 w-4" /> Tienda Online
        </button>
        <button
          onClick={() => setTab('fisica')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            tab === 'fisica' ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Building2 className="h-4 w-4" /> Tienda Física
        </button>
      </div>

      {tab === 'ventas' && (
        <div className="space-y-6">
          <AlertsPanel alerts={alerts} />
          <TeamSalesGoalCard />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Ingresos de Hoy</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(ventas.todayRevenue)}</div>
                <p className="text-xs text-muted-foreground">{ventas.todayOrders} ventas hoy (online + mostrador)</p>
              </CardContent>
            </Card>

            {canViewProfit && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Ganancia de Hoy</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">{formatPrice(todayProfit)}</div>
                  <p className="text-xs text-muted-foreground">Costo: {formatPrice(ventas.todayCost)}</p>
                </CardContent>
              </Card>
            )}

            {canViewProfit && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Comisiones de Hoy</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatPrice(ventas.todayCommission)}</div>
                </CardContent>
              </Card>
            )}

            {/* Antes "Stock Bajo" y "Órdenes Pendientes" solo existían dentro
                de las pestañas Tienda Online/Física — mismos datos (ya
                vienen en `online`, compartidos entre canales para el stock),
                solo les faltaba una tarjeta propia en el resumen de Ventas. */}
            <Link href="/admin/inventario?stockBajo=1" className="block">
              <Card className="transition-colors hover:border-cyan-500/50 hover:bg-secondary/30">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{online.lowStockProducts.length}</div>
                  <p className="text-xs text-muted-foreground">Productos por reabastecer</p>
                </CardContent>
              </Card>
            </Link>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Órdenes Pendientes</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{online.pendingOrders}</div>
                <p className="text-xs text-muted-foreground">Tienda online, por confirmar pago</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>Ingresos por método de pago (hoy)</CardTitle></CardHeader>
              <CardContent>
                {ventas.byMethod.length > 0 ? (
                  <div className="space-y-3">
                    {ventas.byMethod.map((m) => (
                      <div key={m.method} className="flex items-center justify-between">
                        <span className="font-medium">{methodLabels[m.method] || m.method}</span>
                        <span className="font-semibold">{formatPrice(m.cents)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">No hay ventas registradas hoy</p>
                )}
              </CardContent>
            </Card>

            {/* Antes existía por separado en cada pestaña de canal (Tienda
                Online / Física) — esta versión suma ambos, para tener de un
                vistazo "qué se está vendiendo" sin cambiar de pestaña. */}
            <Card>
              <CardHeader><CardTitle>Producto Más Vendido (mes)</CardTitle></CardHeader>
              <CardContent>
                {ventas.topProducts.length > 0 ? (
                  <div className="space-y-4">
                    {ventas.topProducts.map((product, index) => (
                      <div key={product.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                            {index + 1}
                          </span>
                          <p className="font-medium line-clamp-1">{product.title}</p>
                        </div>
                        <Badge variant="secondary">{product.qty} vendidos</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">No hay datos de ventas este mes</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Tendencia últimos 7 días</CardTitle></CardHeader>
              <CardContent>
                {ventas.weeklyTrend.length > 0 ? (
                  <div className="space-y-2">
                    {ventas.weeklyTrend.map((d) => (
                      // Clic en un día -> Ventas del Día de esa fecha exacta
                      // (?date=YYYY-MM-DD, mismo enlace que ya usa Historial
                      // Mensual) — antes esta fila no llevaba a ningún lado.
                      <Link
                        key={d.date}
                        href={`/admin/ventas-dia?date=${d.date}`}
                        className="flex items-center gap-4 rounded-lg p-1 -m-1 transition-colors hover:bg-secondary"
                      >
                        <span className="w-16 text-xs text-muted-foreground">
                          {/* "YYYY-MM-DD" sin hora se interpreta como medianoche
                              UTC — formatearlo con la zona horaria del
                              navegador (la de quien lo mira, no la de
                              Bogotá) podía correr la fecha un día hacia
                              atrás. Se ancla al mediodía de Bogotá (lejos de
                              cualquier medianoche) y se fuerza timeZone para
                              que el resultado no dependa de dónde esté el
                              navegador. */}
                          {new Date(`${d.date}T12:00:00-05:00`).toLocaleDateString('es-CO', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: BOGOTA_TZ,
                          })}
                        </span>
                        <div className="flex-1">
                          <div className="h-5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${(d.cents / maxWeekly) * 100}%` }} />
                        </div>
                        <span className="w-24 text-right text-xs font-medium">{formatPrice(d.cents)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">Sin datos de los últimos 7 días</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'online' && <ChannelPanel stats={online} />}
      {tab === 'fisica' && <ChannelPanel stats={fisica} />}
    </div>
  )
}
