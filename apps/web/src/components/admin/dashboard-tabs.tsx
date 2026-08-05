'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  ArrowUpRight,
  Store,
  Wallet,
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

interface TiendaOnlineStats {
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
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

export function DashboardTabs({ tiendaOnline, ventas }: { tiendaOnline: TiendaOnlineStats; ventas: VentasStats }) {
  const [tab, setTab] = useState<'ventas' | 'tienda'>('ventas')
  const { userProfile } = useAuth()
  const canViewProfit = userProfile?.role === 'admin'
  const stats = tiendaOnline

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
          onClick={() => setTab('tienda')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            tab === 'tienda' ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Store className="h-4 w-4" /> Tienda Online
        </button>
      </div>

      {tab === 'ventas' ? (
        <div className="space-y-6">
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
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
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

            <Card>
              <CardHeader><CardTitle>Tendencia últimos 7 días</CardTitle></CardHeader>
              <CardContent>
                {ventas.weeklyTrend.length > 0 ? (
                  <div className="space-y-2">
                    {ventas.weeklyTrend.map((d) => (
                      <div key={d.date} className="flex items-center gap-4">
                        <span className="w-16 text-xs text-muted-foreground">
                          {new Date(d.date).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })}
                        </span>
                        <div className="flex-1">
                          <div className="h-5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${(d.cents / maxWeekly) * 100}%` }} />
                        </div>
                        <span className="w-24 text-right text-xs font-medium">{formatPrice(d.cents)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">Sin datos de los últimos 7 días</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  )
}
