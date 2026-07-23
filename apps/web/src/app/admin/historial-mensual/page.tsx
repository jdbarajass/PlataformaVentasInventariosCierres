'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Printer, TrendingUp, Package, DollarSign, PiggyBank, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface OrderRow {
  id: string
  total_cents: number
  created_at: string
  order_items: { product_id: string; product_title: string; qty: number; total_cents: number; cost_cents: number }[]
  payments: { method: string; commission_cents: number }[]
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', other: 'Otro',
}

async function fetchMonthOrders(year: number, month: number) {
  const from = new Date(year, month - 1, 1).toISOString()
  const to = new Date(year, month, 1).toISOString()
  const { data } = await supabase
    .from('orders')
    .select('id, total_cents, created_at, order_items(product_id, product_title, qty, total_cents, cost_cents), payments(method, commission_cents)')
    .eq('payment_status', 'paid')
    .gte('created_at', from)
    .lt('created_at', to)
    .order('created_at', { ascending: true })
  return (data as unknown as OrderRow[]) || []
}

export default function HistorialMensualPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [prevRevenue, setPrevRevenue] = useState(0)
  const [prevProfit, setPrevProfit] = useState(0)
  const [totalOperatingExpenses, setTotalOperatingExpenses] = useState(0)
  const [fixedMonthlyTotal, setFixedMonthlyTotal] = useState(0)
  const [diasMes, setDiasMes] = useState(30)
  const [expensesByDay, setExpensesByDay] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const { userProfile } = useAuth()
  const canViewProfit = userProfile?.role === 'admin'

  const fetchMonth = useCallback(async () => {
    setLoading(true)

    const data = await fetchMonthOrders(year, month)
    setOrders(data)

    // Mes anterior, para la comparativa (misma fuente, solo revenue/ganancia).
    const prevMonthDate = new Date(year, month - 2, 1)
    const prevData = await fetchMonthOrders(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1)
    const pRevenue = prevData.reduce((sum, o) => sum + o.total_cents, 0)
    const pCost = prevData.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0), 0)
    setPrevRevenue(pRevenue)
    setPrevProfit(pRevenue - pCost)

    if (canViewProfit) {
      const from = new Date(year, month - 1, 1).toISOString().split('T')[0]
      const to = new Date(year, month, 1).toISOString().split('T')[0]
      const { data: expensesData } = await supabase
        .from('operating_expenses')
        .select('amount_cents, date')
        .gte('date', from)
        .lt('date', to)
      const expensesRows = (expensesData as { amount_cents: number; date: string }[]) || []
      setTotalOperatingExpenses(expensesRows.reduce((sum, e) => sum + e.amount_cents, 0))
      setExpensesByDay(
        expensesRows.reduce<Record<string, number>>((acc, e) => {
          acc[e.date] = (acc[e.date] || 0) + e.amount_cents
          return acc
        }, {})
      )

      const { data: settingsData } = await supabase
        .from('store_settings')
        .select('fixed_monthly_expenses')
        .eq('id', 1)
        .single()
      const fixed = (settingsData as any)?.fixed_monthly_expenses
      setFixedMonthlyTotal(
        fixed ? fixed.arriendo_cents + fixed.sueldo_cents + fixed.servicios_cents + fixed.otros_gastos_cents : 0
      )
      setDiasMes(fixed?.dias_mes || 30)
    }

    setLoading(false)
  }, [year, month, canViewProfit])

  useEffect(() => { fetchMonth() }, [fetchMonth])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const totalRevenue = orders.reduce((sum, o) => sum + o.total_cents, 0)
  const totalOrders = orders.length
  const totalUnits = orders.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty, 0), 0)
  const totalCost = orders.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0), 0)
  const totalCommission = orders.reduce((sum, o) => sum + (o.payments || []).reduce((s, p) => s + (p.commission_cents || 0), 0), 0)
  const grossProfit = totalRevenue - totalCost

  // Desglose de comisión por método de pago — igual que el local
  // (_panel_comisiones en ui/historial_panel.py), que no se limitaba al total.
  const commissionByMethod = orders.reduce<Record<string, number>>((acc, o) => {
    (o.payments || []).forEach((p) => {
      if (p.commission_cents > 0) acc[p.method] = (acc[p.method] || 0) + p.commission_cents
    })
    return acc
  }, {})

  // Utilidad Real: igual fórmula que Reportes (sección 13.2 / 4.2.1) — el
  // gasto fijo mensual se resta completo, sin prorratear.
  const utilidadReal = grossProfit - totalOperatingExpenses - fixedMonthlyTotal

  // Comparativa vs. mes anterior.
  const revenueDeltaPct = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null
  const profitDeltaPct = prevProfit !== 0 ? ((grossProfit - prevProfit) / Math.abs(prevProfit)) * 100 : null

  // Utilidad Real POR DÍA (distinta de la del mes): el gasto fijo mensual se
  // prorratea (÷ días del mes) y se le suma el gasto operativo puntual de
  // ESE día — misma fórmula que Ventas del Día y que calcular_resumen_diario
  // del software local (ver docs/UNIFICACION_YJBMOTOCOM.md sección 13.2).
  // Los días que solo tuvieron gastos (sin ventas) también cuentan, igual
  // que el local (todas_fechas = ventas ∪ gastos_por_dia.keys()).
  const dailyFixedExpense = fixedMonthlyTotal / diasMes
  const dailyMap = orders.reduce<Record<string, { revenue: number; cost: number }>>((acc, o) => {
    const day = o.created_at.split('T')[0]
    if (!acc[day]) acc[day] = { revenue: 0, cost: 0 }
    acc[day].revenue += o.total_cents
    acc[day].cost += (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0)
    return acc
  }, {})
  for (const day of Object.keys(expensesByDay)) {
    if (!dailyMap[day]) dailyMap[day] = { revenue: 0, cost: 0 }
  }
  const dailyArray = Object.entries(dailyMap)
    .map(([day, d]) => {
      const gastosDia = expensesByDay[day] || 0
      const utilidadRealDia = canViewProfit ? d.revenue - d.cost - dailyFixedExpense - gastosDia : d.revenue - d.cost
      return { day, ...d, gastosDia, utilidadRealDia }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
  const maxDaily = Math.max(...dailyArray.map((d) => d.revenue), 1)
  const positiveDays = dailyArray.filter((d) => d.utilidadRealDia >= 0).length
  const negativeDays = dailyArray.length - positiveDays

  const productMap = orders.reduce<Record<string, { title: string; qty: number; revenue: number; cost: number }>>((acc, o) => {
    (o.order_items || []).forEach((item) => {
      if (!acc[item.product_id]) acc[item.product_id] = { title: item.product_title, qty: 0, revenue: 0, cost: 0 }
      acc[item.product_id].qty += item.qty
      acc[item.product_id].revenue += item.total_cents
      acc[item.product_id].cost += item.qty * (item.cost_cents || 0)
    })
    return acc
  }, {})
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  const mostProfitableProducts = Object.values(productMap)
    .map((p) => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const rows = dailyArray.map((d) => `<tr><td>${d.day}</td><td style="text-align:right">${formatPrice(d.revenue)}</td></tr>`).join('')
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Historial ${monthNames[month - 1]} ${year} - YJBMOTOCOM</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; }
        h1 { color: #e11d48; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
        .totals { margin-top: 24px; }
        .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
      </style></head><body>
      <button onclick="window.print()" style="margin-bottom:20px;padding:10px 24px;background:#e11d48;color:white;border:none;border-radius:8px;cursor:pointer;">Imprimir / Guardar como PDF</button>
      <h1>Historial Mensual — ${monthNames[month - 1]} ${year}</h1>
      <div class="totals">
        <div><span>Ingresos totales</span><strong>${formatPrice(totalRevenue)}</strong></div>
        <div><span>Órdenes</span><strong>${totalOrders}</strong></div>
        <div><span>Unidades vendidas</span><strong>${totalUnits}</strong></div>
        ${canViewProfit ? `
        <div><span>Costo total</span><strong>${formatPrice(totalCost)}</strong></div>
        <div><span>Comisiones acumuladas</span><strong>${formatPrice(totalCommission)}</strong></div>
        <div><span>Ganancia neta</span><strong>${formatPrice(grossProfit)}</strong></div>
        <div><span>Utilidad real del mes</span><strong>${formatPrice(utilidadReal)}</strong></div>
        <div><span>Días positivos / negativos</span><strong>${positiveDays} / ${negativeDays}</strong></div>
        ` : ''}
      </div>
      <h3>Ventas por día</h3>
      <table><thead><tr><th>Fecha</th><th style="text-align:right">Ventas</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Historial Mensual</h1>
          <p className="text-muted-foreground">Ventas del mes, con comisiones acumuladas</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="rounded-lg border bg-background px-3 py-2 text-sm">
            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-24 rounded-lg border bg-background px-3 py-2 text-sm">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {canViewProfit && (
            <Button variant="outline" className="rounded-lg" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Exportar / Imprimir
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{formatPrice(totalRevenue)}</p>
                  <p className="text-sm text-muted-foreground">Ingresos del mes</p>
                  {revenueDeltaPct !== null && (
                    <p className={`flex items-center text-xs ${revenueDeltaPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {revenueDeltaPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(revenueDeltaPct).toFixed(1)}% vs. mes anterior
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div><p className="text-2xl font-bold">{totalOrders}</p><p className="text-sm text-muted-foreground">Órdenes ({totalUnits} unidades)</p></div>
              </div>
            </div>
            {canViewProfit && (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-green-500">{formatPrice(grossProfit)}</p>
                    <p className="text-sm text-muted-foreground">Ganancia neta</p>
                    {profitDeltaPct !== null && (
                      <p className={`flex items-center text-xs ${profitDeltaPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {profitDeltaPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(profitDeltaPct).toFixed(1)}% vs. mes anterior
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {canViewProfit && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Costo total</p>
                <p className="text-xl font-bold">{formatPrice(totalCost)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Comisiones acumuladas</p>
                <p className="text-xl font-bold">{formatPrice(totalCommission)}</p>
                {Object.keys(commissionByMethod).length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {Object.entries(commissionByMethod)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, cents]) => (
                        <div key={method} className="flex justify-between text-xs text-muted-foreground">
                          <span>{methodLabels[method] || method}</span>
                          <span>{formatPrice(cents)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Utilidad real del mes</p>
                </div>
                <p className={`text-xl font-bold ${utilidadReal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(utilidadReal)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Días positivos / negativos</p>
                <p className="text-xl font-bold">{positiveDays} / {negativeDays}</p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Ventas por día</h2>
                <p className="text-xs text-muted-foreground">Haz clic en un día para ver el detalle</p>
              </div>
              {dailyArray.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
              ) : (
                <div className="space-y-2">
                  {dailyArray.map((d) => (
                    <Link
                      key={d.day}
                      href={`/admin/ventas-dia?date=${d.day}`}
                      className="flex items-center gap-4 rounded-lg p-1 -m-1 hover:bg-muted"
                    >
                      <span className="w-20 text-sm text-muted-foreground">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                      <div className="flex-1"><div className="h-5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${(d.revenue / maxDaily) * 100}%` }} /></div>
                      <span className="w-28 text-right text-sm font-medium">{formatPrice(d.revenue)}</span>
                      {canViewProfit && (
                        <Badge variant="outline" className={d.utilidadRealDia >= 0 ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}>
                          {d.utilidadRealDia >= 0 ? 'Positivo' : 'Negativo'}
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold">Top 10 Productos del mes</h2>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm">{i + 1}</span>
                      <div className="flex-1"><p className="line-clamp-1 font-medium">{p.title}</p><p className="text-sm text-muted-foreground">{p.qty} unidades</p></div>
                      <span className="font-semibold">{formatPrice(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canViewProfit && (
              <div className="rounded-xl border bg-card p-6 lg:col-span-2">
                <h2 className="mb-4 text-lg font-semibold">Rentabilidad por producto (top 10 por ganancia neta)</h2>
                {mostProfitableProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
                ) : (
                  <div className="space-y-3">
                    {mostProfitableProducts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm">{i + 1}</span>
                        <div className="flex-1">
                          <p className="line-clamp-1 font-medium">{p.title}</p>
                          <p className="text-sm text-muted-foreground">{p.qty} unidades · margen {p.margin.toFixed(1)}%</p>
                        </div>
                        <span className={`font-semibold ${p.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(p.profit)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
