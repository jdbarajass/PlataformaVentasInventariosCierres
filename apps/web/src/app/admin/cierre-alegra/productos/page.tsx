'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, LayoutGrid } from 'lucide-react'

function getMonthRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  })
  const end = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return { start, end }
}

export default function ProductosPage() {
  const range = getMonthRange()
  const [startDate, setStartDate] = useState(range.start)
  const [endDate, setEndDate] = useState(range.end)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/alegra/analytics?start_date=${startDate}&end_date=${endDate}`
      )
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Error consultando productos')
      } else {
        setData(json)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const trends = data?.sales_trends as Array<{
    date: string
    total: number
    total_formatted: string
    invoice_count: number
  }> | undefined
  const summary = data?.summary as Record<string, unknown> | undefined

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
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Analizar Productos
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

      {data && (
        <>
          {/* Resumen */}
          <Card className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0">
            <CardContent className="pt-6">
              <p className="text-sm opacity-80 font-medium">RESUMEN DEL PERIODO</p>
              <p className="text-3xl font-bold mt-1">
                {String(summary?.total_sales_formatted || '-')}
              </p>
              <p className="text-sm opacity-70 mt-2">
                {String(summary?.total_invoices || 0)} facturas · Promedio diario:{' '}
                {String(summary?.average_daily_sales_formatted || '-')}
              </p>
            </CardContent>
          </Card>

          {/* Gráfico de barras de ventas diarias */}
          {trends && trends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ventas Diarias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {trends.map((day) => {
                    const maxTotal = Math.max(...trends.map((d) => d.total))
                    const pct = maxTotal > 0 ? (day.total / maxTotal) * 100 : 0
                    return (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-28 shrink-0">
                          {day.date}
                        </span>
                        <div className="flex-1 bg-secondary rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-orange-500 h-4 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold w-36 text-right shrink-0">
                          {day.total_formatted}
                        </span>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          {day.invoice_count} fact.
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <LayoutGrid className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Análisis de Productos</p>
            <p className="text-sm mt-1">
              Selecciona un rango de fechas y presiona Analizar Productos
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
