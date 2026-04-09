'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, BarChart2 } from 'lucide-react'

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function getMonthRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  })
  const end = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return { start, end }
}

type Tab = 'tendencias' | 'horas' | 'clientes' | 'vendedores'

export default function AnalyticsPage() {
  const range = getMonthRange()
  const [startDate, setStartDate] = useState(range.start)
  const [endDate, setEndDate] = useState(range.end)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('tendencias')

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/alegra/analytics?start_date=${startDate}&end_date=${endDate}`
      )
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Error consultando analíticas')
      } else {
        setData(json)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const summary = data?.summary as Record<string, unknown> | undefined
  const salesTrends = data?.sales_trends as Array<{
    date: string
    total: number
    total_formatted: string
    invoice_count: number
  }> | undefined
  const peakHours = data?.peak_hours as Array<{
    hour: number
    hour_label: string
    invoice_count: number
    total_sales_formatted: string
  }> | undefined
  const topCustomers = data?.top_customers as Array<{
    name: string
    invoice_count: number
    total_purchases_formatted: string
    average_purchase: number
  }> | undefined
  const topSellers = data?.top_sellers as Array<{
    name: string
    invoice_count: number
    total_sales_formatted: string
  }> | undefined

  const TABS: { id: Tab; label: string }[] = [
    { id: 'tendencias', label: 'Tendencias' },
    { id: 'horas', label: 'Horas Pico' },
    { id: 'clientes', label: 'Top Clientes' },
    { id: 'vendedores', label: 'Vendedores' },
  ]

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Fecha inicio</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-auto"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Fecha fin</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-auto"
              />
            </div>
            <Button
              onClick={fetchData}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <BarChart2 className="mr-2 h-4 w-4" />
                  Analizar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'TOTAL VENTAS', value: String(summary.total_sales_formatted || '-') },
            { label: 'FACTURAS', value: String(summary.total_invoices || '-') },
            { label: 'PROMEDIO DIARIO', value: String(summary.average_daily_sales_formatted || '-') },
            { label: 'DÍAS', value: String(salesTrends?.length ?? '-') },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className="text-xl font-bold mt-2">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-500'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tendencias */}
          {activeTab === 'tendencias' && salesTrends && (
            <Card>
              <CardHeader>
                <CardTitle>Tendencias por Día</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Fecha</th>
                      <th className="pb-3 font-medium text-right">Facturas</th>
                      <th className="pb-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {salesTrends.map((row) => (
                      <tr key={row.date} className="hover:bg-secondary/50">
                        <td className="py-3">{row.date}</td>
                        <td className="py-3 text-right">{row.invoice_count}</td>
                        <td className="py-3 text-right font-semibold">{row.total_formatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Horas Pico */}
          {activeTab === 'horas' && peakHours && (
            <Card>
              <CardHeader>
                <CardTitle>Horas Pico de Ventas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...peakHours]
                    .sort((a, b) => b.invoice_count - a.invoice_count)
                    .map((row) => (
                      <div key={row.hour} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-16">{row.hour_label}</span>
                        <div className="flex-1 bg-secondary rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-orange-500 h-5 rounded-full"
                            style={{
                              width: `${Math.min(
                                (row.invoice_count /
                                  (peakHours[0]?.invoice_count || 1)) *
                                  100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold w-10 text-right">
                          {row.invoice_count}
                        </span>
                        <span className="text-sm text-muted-foreground w-32 text-right">
                          {row.total_sales_formatted}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Clientes */}
          {activeTab === 'clientes' && topCustomers && (
            <Card>
              <CardHeader>
                <CardTitle>Top Clientes</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">#</th>
                      <th className="pb-3 font-medium">Cliente</th>
                      <th className="pb-3 font-medium text-right">Compras</th>
                      <th className="pb-3 font-medium text-right">Total</th>
                      <th className="pb-3 font-medium text-right">Promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {topCustomers.map((c, i) => (
                      <tr key={c.name} className="hover:bg-secondary/50">
                        <td className="py-3 text-muted-foreground">{i + 1}</td>
                        <td className="py-3 font-medium">{c.name}</td>
                        <td className="py-3 text-right">{c.invoice_count}</td>
                        <td className="py-3 text-right font-semibold">
                          {c.total_purchases_formatted}
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          {formatCOP(c.average_purchase)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Vendedores */}
          {activeTab === 'vendedores' && topSellers && (
            <Card>
              <CardHeader>
                <CardTitle>Rendimiento de Vendedores</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">#</th>
                      <th className="pb-3 font-medium">Vendedor</th>
                      <th className="pb-3 font-medium text-right">Facturas</th>
                      <th className="pb-3 font-medium text-right">Total Ventas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {topSellers.map((s, i) => (
                      <tr key={s.name} className="hover:bg-secondary/50">
                        <td className="py-3 text-muted-foreground">{i + 1}</td>
                        <td className="py-3 font-medium">{s.name}</td>
                        <td className="py-3 text-right">{s.invoice_count}</td>
                        <td className="py-3 text-right font-semibold">{s.total_sales_formatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecciona un rango de fechas</p>
            <p className="text-sm mt-1">y presiona Analizar para ver las métricas detalladas</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
