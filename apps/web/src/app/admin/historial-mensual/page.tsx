'use client'

import { useState, useEffect, useCallback } from 'react'
import { Printer, TrendingUp, Package, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  payments: { commission_cents: number }[]
}

export default function HistorialMensualPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const { userProfile } = useAuth()
  const canViewProfit = userProfile?.role === 'admin'

  const fetchMonth = useCallback(async () => {
    setLoading(true)
    const from = new Date(year, month - 1, 1).toISOString()
    const to = new Date(year, month, 1).toISOString()

    const { data } = await supabase
      .from('orders')
      .select('id, total_cents, created_at, order_items(product_id, product_title, qty, total_cents, cost_cents), payments(commission_cents)')
      .eq('payment_status', 'paid')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: true })

    setOrders((data as unknown as OrderRow[]) || [])
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchMonth() }, [fetchMonth])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const totalRevenue = orders.reduce((sum, o) => sum + o.total_cents, 0)
  const totalOrders = orders.length
  const totalUnits = orders.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty, 0), 0)
  const totalCost = orders.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0), 0)
  const totalCommission = orders.reduce((sum, o) => sum + (o.payments || []).reduce((s, p) => s + (p.commission_cents || 0), 0), 0)
  const grossProfit = totalRevenue - totalCost

  const dailyMap = orders.reduce<Record<string, number>>((acc, o) => {
    const day = o.created_at.split('T')[0]
    acc[day] = (acc[day] || 0) + o.total_cents
    return acc
  }, {})
  const dailyArray = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]))
  const maxDaily = Math.max(...dailyArray.map((d) => d[1]), 1)

  const productMap = orders.reduce<Record<string, { title: string; qty: number; revenue: number }>>((acc, o) => {
    (o.order_items || []).forEach((item) => {
      if (!acc[item.product_id]) acc[item.product_id] = { title: item.product_title, qty: 0, revenue: 0 }
      acc[item.product_id].qty += item.qty
      acc[item.product_id].revenue += item.total_cents
    })
    return acc
  }, {})
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const rows = dailyArray.map(([day, cents]) => `<tr><td>${day}</td><td style="text-align:right">${formatPrice(cents)}</td></tr>`).join('')
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
                <div><p className="text-2xl font-bold">{formatPrice(totalRevenue)}</p><p className="text-sm text-muted-foreground">Ingresos del mes</p></div>
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
                  <div><p className="text-2xl font-bold text-green-500">{formatPrice(grossProfit)}</p><p className="text-sm text-muted-foreground">Ganancia neta</p></div>
                </div>
              </div>
            )}
          </div>

          {canViewProfit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Costo total</p>
                <p className="text-xl font-bold">{formatPrice(totalCost)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Comisiones acumuladas</p>
                <p className="text-xl font-bold">{formatPrice(totalCommission)}</p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold">Ventas por día</h2>
              {dailyArray.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
              ) : (
                <div className="space-y-2">
                  {dailyArray.map(([day, cents]) => (
                    <div key={day} className="flex items-center gap-4">
                      <span className="w-20 text-sm text-muted-foreground">{day.slice(8, 10)}/{day.slice(5, 7)}</span>
                      <div className="flex-1"><div className="h-5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${(cents / maxDaily) * 100}%` }} /></div>
                      <span className="w-28 text-right text-sm font-medium">{formatPrice(cents)}</span>
                    </div>
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
          </div>
        </>
      )}
    </div>
  )
}
