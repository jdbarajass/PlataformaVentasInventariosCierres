'use client'

import { useState, useEffect } from 'react'
import { Download, Calendar, TrendingUp, Package, DollarSign, Wallet, PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPrice } from '@/lib/utils'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'

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
  payments: Array<{ commission_cents: number }> | null
}

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [salesData, setSalesData] = useState<SalesData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [totals, setTotals] = useState({ revenue: 0, orders: 0, avgOrder: 0 })
  const [profitTotals, setProfitTotals] = useState({ cost: 0, commission: 0, grossProfit: 0, expenses: 0, netProfit: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const { userProfile } = useAuth()
  // Igual que en el software local: solo Admin ve costo/comisión/ganancia.
  const canViewProfit = userProfile?.role === 'admin'

  useEffect(() => {
    fetchReports()
  }, [dateFrom, dateTo])

  const fetchReports = async () => {
    setIsLoading(true)

    // Fetch orders in date range
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, total_cents, created_at, order_items(product_id, product_title, qty, total_cents, cost_cents), payments(commission_cents)')
      .eq('payment_status', 'paid')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at', { ascending: true })

    const orders = (ordersData as unknown as OrderWithItems[]) || []

    if (orders.length > 0) {
      // Calculate daily sales
      const dailySales: Record<string, { total: number; orders: number }> = {}
      const productSales: Record<string, { title: string; qty: number; revenue: number }> = {}

      orders.forEach((order) => {
        const date = order.created_at.split('T')[0]
        if (!dailySales[date]) {
          dailySales[date] = { total: 0, orders: 0 }
        }
        dailySales[date].total += order.total_cents
        dailySales[date].orders += 1

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

      // Convert to arrays
      const salesArray = Object.entries(dailySales)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date))

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
    } else {
      setSalesData([])
      setTopProducts([])
      setTotals({ revenue: 0, orders: 0, avgOrder: 0 })
      setProfitTotals({ cost: 0, commission: 0, grossProfit: 0, expenses: 0, netProfit: 0 })
    }

    setIsLoading(false)
  }

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
      <div className="grid gap-4 md:grid-cols-3">
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
      </div>

      {/* Costo, comisión y ganancia — igual que en el software local, solo Admin las ve */}
      {canViewProfit && (
        <div className="grid gap-4 md:grid-cols-4">
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
        </div>
      )}

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
    </div>
  )
}
