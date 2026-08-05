'use client'

import { useState, useEffect, useCallback } from 'react'
import { Download, Calendar, TrendingUp, Package, DollarSign, Wallet, PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPrice } from '@/lib/utils'
import { supabaseBrowser as supabase, withTimeout } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { bogotaDateStr, bogotaDayRange, bogotaHour } from '@/lib/bogota-time'

interface SalesData {
  date: string
  total: number
  orders: number
}

interface TopProduct {
  id: string
  title: string
  qty: number
  revenue: number
}

interface OrderWithItems {
  id: string
  total_cents: number
  created_at: string
  order_items: Array<{
    product_id: string
    product_title: string
    qty: number
    total_cents: number
    cost_cents: number
  }>
  payments: Array<{ method: string; commission_cents: number }> | null
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

export default function ReportsPage() {
  // "Hoy" y "hace 30 días" en hora de Bogotá, no la fecha UTC de
  // `toISOString()` — de 7pm a medianoche en Colombia, la fecha UTC ya es
  // el día siguiente, lo que dejaría el rango por defecto corrido un día.
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return bogotaDateStr(date)
  })
  const [dateTo, setDateTo] = useState(() => bogotaDateStr(new Date()))
  const [salesData, setSalesData] = useState<SalesData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [totals, setTotals] = useState({ revenue: 0, orders: 0, avgOrder: 0 })
  const [profitTotals, setProfitTotals] = useState({ cost: 0, commission: 0, grossProfit: 0, expenses: 0, netProfit: 0 })
  const [dailyProfit, setDailyProfit] = useState<{ date: string; total: number; cost: number; profit: number; sinVenta: boolean }[]>([])
  const [commissionByMethod, setCommissionByMethod] = useState<Record<string, number>>({})
  const [methodCounts, setMethodCounts] = useState<Record<string, number>>({})
  const [peakHours, setPeakHours] = useState<{ label: string; count: number }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { userProfile } = useAuth()
  // Igual que en el software local: solo Admin ve costo/comisión/ganancia.
  const canViewProfit = userProfile?.role === 'admin'

  const [loadError, setLoadError] = useState<string | null>(null)

  // Todo el fetch va envuelto en un límite de tiempo único: supabaseBrowser
  // puede colgarse indefinidamente al refrescar la sesión tras un rato de
  // inactividad de la pestaña (ver comentario en lib/supabase-browser.ts).
  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    const run = async () => {
    // Límites explícitos en hora de Bogotá (no naive `${date}T00:00:00`,
    // que Postgres interpreta en UTC y deja la ventana corrida 5 horas —
    // ver comentario de bogotaDayRange en lib/bogota-time.ts).
    const { from: rangeFrom } = bogotaDayRange(dateFrom)
    const { to: rangeTo } = bogotaDayRange(dateTo)
    // Fetch orders in date range
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, total_cents, created_at, order_items(product_id, product_title, qty, total_cents, cost_cents), payments(method, commission_cents)')
      .eq('payment_status', 'paid')
      .gte('created_at', rangeFrom)
      .lt('created_at', rangeTo)
      .order('created_at', { ascending: true })

    const orders = (ordersData as unknown as OrderWithItems[]) || []

    {
      // Calculate daily sales (con costo, para Estado Positivo/Negativo y
      // día más rentable — igual que el resumen diario del local)
      const dailySales: Record<string, { total: number; orders: number; cost: number }> = {}
      const productSales: Record<string, { title: string; qty: number; revenue: number }> = {}
      // Método de pago más usado y horas pico de venta (franjas de 2h) —
      // ambos ausentes por completo antes (sección 12, nunca cerrado).
      const methodCountsAcc: Record<string, number> = {}
      const hourBuckets: Record<string, number> = {}

      orders.forEach((order) => {
        // Día de Bogotá, no el día UTC crudo de `created_at.split('T')[0]`
        // — una venta hecha entre 7pm y medianoche en Colombia ya cae en
        // el día UTC siguiente.
        const date = bogotaDateStr(new Date(order.created_at))
        const dayCost = (order.order_items || []).reduce((s, item) => s + item.qty * (item.cost_cents || 0), 0)
        if (!dailySales[date]) {
          dailySales[date] = { total: 0, orders: 0, cost: 0 }
        }
        dailySales[date].total += order.total_cents
        dailySales[date].orders += 1
        dailySales[date].cost += dayCost

        // Hora explícita de Bogotá, no Date.getHours() (depende de la zona
        // horaria del dispositivo) — mismo cuidado que Préstamos/Historial
        // Mensual, ver docs/UNIFICACION_YJBMOTOCOM.md sección 28.
        const hour = bogotaHour(order.created_at)
        const bucketStart = Math.floor(hour / 2) * 2
        const bucketLabel = `${bucketStart}-${bucketStart + 2}h`
        hourBuckets[bucketLabel] = (hourBuckets[bucketLabel] || 0) + 1

        ;(order.payments || []).forEach((p) => {
          methodCountsAcc[p.method] = (methodCountsAcc[p.method] || 0) + 1
        })

        // Track product sales
        if (order.order_items && Array.isArray(order.order_items)) {
          order.order_items.forEach((item: { product_id: string; product_title: string; qty: number; total_cents: number }) => {
            if (item.product_id) {
              if (!productSales[item.product_id]) {
                productSales[item.product_id] = { title: item.product_title, qty: 0, revenue: 0 }
              }
              productSales[item.product_id].qty += item.qty
              productSales[item.product_id].revenue += item.total_cents
            }
          })
        }
      })

      // Días sin NINGUNA orden en el rango no quedaban en `dailySales` en
      // absoluto — simplemente desaparecían de "Ventas Diarias"/"Resumen
      // diario" en vez de mostrarse como "no hubo venta ese día" (mismo
      // hueco ya corregido en Historial Mensual, sección 40). Se rellena
      // cada día del rango elegido hasta hoy (en hora de Bogotá — nunca
      // días futuros, que obviamente aún no han pasado).
      const todayBogota = bogotaDateStr(new Date())
      const finalDateTo = dateTo > todayBogota ? todayBogota : dateTo
      if (dateFrom <= finalDateTo) {
        const [fy, fm, fd] = dateFrom.split('-').map(Number)
        const [ty, tm, td] = finalDateTo.split('-').map(Number)
        const cursor = new Date(Date.UTC(fy, fm - 1, fd))
        const end = new Date(Date.UTC(ty, tm - 1, td))
        while (cursor <= end) {
          const dayStr = cursor.toISOString().split('T')[0]
          if (!dailySales[dayStr]) dailySales[dayStr] = { total: 0, orders: 0, cost: 0 }
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
      }

      // Convert to arrays
      const salesArray = Object.entries(dailySales)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setDailyProfit(
        // "Sin venta": no hubo ninguna orden ese día (pudo no abrirse, o el
        // día estuvo difícil) — distinto de un día con ventas que dio
        // pérdida, que sigue siendo "Negativo".
        salesArray.map((d) => ({ date: d.date, total: d.total, cost: d.cost, profit: d.total - d.cost, sinVenta: d.orders === 0 }))
      )
      setMethodCounts(methodCountsAcc)
      setPeakHours(
        Object.entries(hourBuckets)
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => parseInt(a.label) - parseInt(b.label))
      )

      const topProductsArray = Object.entries(productSales)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)

      // Calculate totals
      const totalRevenue = orders.reduce((sum, o) => sum + o.total_cents, 0)
      const totalOrders = orders.length
      const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0

      setSalesData(salesArray)
      setTopProducts(topProductsArray)
      setTotals({ revenue: totalRevenue, orders: totalOrders, avgOrder })

      // Costo, comisión y ganancia (solo se muestran a Admin, ver canViewProfit)
      const totalCost = orders.reduce(
        (sum, o) => sum + (o.order_items || []).reduce((s, item) => s + item.qty * (item.cost_cents || 0), 0),
        0
      )
      const totalCommission = orders.reduce(
        (sum, o) => sum + (o.payments || []).reduce((s, p) => s + (p.commission_cents || 0), 0),
        0
      )
      const commissionByMethodAcc: Record<string, number> = {}
      orders.forEach((o) => {
        (o.payments || []).forEach((p) => {
          if (p.commission_cents > 0) commissionByMethodAcc[p.method] = (commissionByMethodAcc[p.method] || 0) + p.commission_cents
        })
      })
      setCommissionByMethod(commissionByMethodAcc)
      const grossProfit = totalRevenue - totalCost

      // Gasto real del periodo (gastos operativos registrados en Presupuesto),
      // para aproximar la "utilidad real" del software local.
      const { data: expensesData } = await supabase
        .from('operating_expenses')
        .select('amount_cents')
        .gte('date', dateFrom)
        .lte('date', dateTo)
      const totalOperatingExpenses = ((expensesData as { amount_cents: number }[]) || []).reduce(
        (sum, e) => sum + e.amount_cents,
        0
      )

      // Gastos fijos mensuales (Arriendo/Sueldo/Servicios/Otros de
      // Configuración > Comisiones y Gastos Fijos). Igual que el software
      // local (calcular_utilidad_real_mes en services/calculator.py): se
      // resta el gasto fijo del MES COMPLETO tal cual está configurado,
      // sin prorratear por la cantidad de días del rango elegido — el local
      // nunca prorratea, sin importar si el rango consultado es corto o
      // largo, para que ambos sistemas den el mismo número.
      const { data: settingsData } = await supabase
        .from('store_settings')
        .select('fixed_monthly_expenses')
        .eq('id', 1)
        .single()
      const fixed = (settingsData as any)?.fixed_monthly_expenses
      const totalFixedExpenses = fixed
        ? fixed.arriendo_cents + fixed.sueldo_cents + fixed.servicios_cents + fixed.otros_gastos_cents
        : 0
      const totalExpenses = totalOperatingExpenses + totalFixedExpenses

      setProfitTotals({
        cost: totalCost,
        commission: totalCommission,
        grossProfit,
        expenses: totalExpenses,
        netProfit: grossProfit - totalExpenses,
      })
    }
    }

    try {
      await withTimeout(run(), 12000, 'Reportes')
    } catch (error) {
      console.error('Error loading reportes:', error)
      setLoadError('No se pudo cargar el reporte. Puede ser un problema temporal de la sesión — intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const exportCSV = () => {
    const headers = ['Fecha', 'Ventas (COP)', 'Ordenes']
    const rows = salesData.map((d) => [d.date, d.total / 100, d.orders])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-ventas-${dateFrom}-${dateTo}.csv`
    a.click()
  }

  const maxSales = Math.max(...salesData.map((d) => d.total), 1)
  const maxPeakHour = Math.max(...peakHours.map((h) => h.count), 1)
  const mostUsedMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]
  // Excluye días sin venta — que un día sin ninguna orden (ganancia = 0)
  // no gane por accidente si todos los días con venta real del periodo
  // dieron pérdida.
  const diasConVenta = dailyProfit.filter((d) => !d.sinVenta)
  const mostProfitableDay = diasConVenta.length > 0
    ? [...diasConVenta].sort((a, b) => b.profit - a.profit)[0]
    : null
  const noSalesDaysCount = dailyProfit.filter((d) => d.sinVenta).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reportes</h1>
          <p className="text-muted-foreground">
            Analisis de ventas y rendimiento
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {loadError && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" className="rounded-lg" onClick={fetchReports}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Date Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Rango:</span>
            </div>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-auto"
            />
            <span className="text-muted-foreground">a</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-auto"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(totals.revenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Ordenes</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.orders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Orden Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(totals.avgOrder)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Método más usado</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mostUsedMethod ? (methodLabels[mostUsedMethod[0]] || mostUsedMethod[0]) : '—'}</div>
            {mostUsedMethod && <p className="text-xs text-muted-foreground">{mostUsedMethod[1]} pago(s)</p>}
          </CardContent>
        </Card>
      </div>

      {/* Costo, comisión y ganancia — igual que en el software local, solo Admin las ve */}
      {canViewProfit && (
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(profitTotals.cost)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Comisiones</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(profitTotals.commission)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ganancia Neta</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{formatPrice(profitTotals.grossProfit)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Utilidad Real</CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(profitTotals.netProfit)}</div>
              <p className="text-xs text-muted-foreground">Ganancia neta − gastos operativos del periodo y gasto fijo mensual completo ({formatPrice(profitTotals.expenses)})</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Día más rentable</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {mostProfitableDay ? new Date(mostProfitableDay.date).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }) : '—'}
              </div>
              {mostProfitableDay && <p className="text-xs text-muted-foreground">Ganancia: {formatPrice(mostProfitableDay.profit)}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Días sin venta</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${noSalesDaysCount > 0 ? 'text-red-500' : ''}`}>{noSalesDaysCount}</div>
              <p className="text-xs text-muted-foreground">No se vendió nada ese día</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comisión por método y horas pico — completamente ausentes antes
          (sección 12 de la auditoría, nunca cerrado) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {canViewProfit && Object.keys(commissionByMethod).length > 0 && (
          <Card>
            <CardHeader><CardTitle>Comisión por método de pago</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(commissionByMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([method, cents]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{methodLabels[method] || method}</span>
                    <span className="font-medium">{formatPrice(cents)}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        {peakHours.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Horas pico de venta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {peakHours.map((h) => (
                <div key={h.label} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-muted-foreground">{h.label}</span>
                  <div className="flex-1">
                    <div className="h-4 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${(h.count / maxPeakHour) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm font-medium">{h.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Ventas Diarias</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : salesData.length > 0 ? (
              <div className="space-y-2">
                {salesData.slice(-14).map((day) => (
                  <div key={day.date} className="flex items-center gap-4">
                    <span className="w-20 text-sm text-muted-foreground">
                      {new Date(day.date).toLocaleDateString('es-CO', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <div className="flex-1">
                      <div
                        className="h-6 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                        style={{ width: `${(day.total / maxSales) * 100}%` }}
                      />
                    </div>
                    <span className="w-28 text-right text-sm font-medium">
                      {formatPrice(day.total)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No hay datos para el rango seleccionado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Productos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : topProducts.length > 0 ? (
              <div className="space-y-4">
                {topProducts.map((product, index) => (
                  <div key={product.id} className="flex items-center gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium line-clamp-1">{product.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {product.qty} unidades
                      </p>
                    </div>
                    <span className="font-semibold text-primary">
                      {formatPrice(product.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No hay datos para el rango seleccionado
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumen diario con Estado Positivo/Negativo — el local lo muestra
          en tabla además de la gráfica; antes solo había gráfica de barras. */}
      {canViewProfit && dailyProfit.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Resumen diario</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4 text-right">Ventas</th>
                    <th className="py-2 pr-4 text-right">Ganancia</th>
                    <th className="py-2 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyProfit.map((d) => (
                    <tr key={d.date} className="border-b last:border-0">
                      <td className="py-2 pr-4">{new Date(d.date).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 pr-4 text-right">{formatPrice(d.total)}</td>
                      <td className={`py-2 pr-4 text-right ${d.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(d.profit)}</td>
                      <td className="py-2 text-right">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            d.sinVenta
                              ? 'border-red-500/20 bg-red-500/10 text-red-500'
                              : d.profit >= 0
                              ? 'border-green-500/20 bg-green-500/10 text-green-500'
                              : 'border-red-500/20 bg-red-500/10 text-red-500'
                          }`}
                        >
                          {d.sinVenta ? 'Sin venta' : d.profit >= 0 ? 'Positivo' : 'Negativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
