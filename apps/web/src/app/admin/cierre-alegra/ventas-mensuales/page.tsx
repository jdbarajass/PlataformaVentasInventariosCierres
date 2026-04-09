'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, TrendingUp } from 'lucide-react'

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

export default function VentasMensualesPage() {
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
        `/api/alegra/ventas-mensuales?start_date=${startDate}&end_date=${endDate}`
      )
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Error consultando ventas')
      } else {
        setData(json)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const paymentMethods = data?.payment_methods as Record<
    string,
    { label: string; total: number; formatted: string }
  > | undefined
  const totalVendido = data?.total_vendido as { formatted: string; total: number } | undefined
  const invoicesSummary = data?.invoices_summary as {
    total_invoices: number
    active_invoices: number
    voided_invoices: number
  } | undefined

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
                  Consultando...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Consultar
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
          {/* Total destacado */}
          <Card className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0">
            <CardContent className="pt-6">
              <p className="text-sm opacity-80 font-medium">TOTAL VENDIDO</p>
              <p className="text-4xl font-bold mt-1">{totalVendido?.formatted || '-'}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm opacity-80">
                <span>Facturas activas: {invoicesSummary?.active_invoices ?? '-'}</span>
                {(invoicesSummary?.voided_invoices ?? 0) > 0 && (
                  <span>Anuladas: {invoicesSummary?.voided_invoices}</span>
                )}
                <span>
                  Rango: {startDate} → {endDate}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Por método de pago */}
          {paymentMethods && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(paymentMethods).map(([key, val]) => (
                <Card key={key}>
                  <CardContent className="pt-6 text-center">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                      {val.label}
                    </p>
                    <p className="text-xl font-bold mt-2">{val.formatted}</p>
                    {totalVendido && totalVendido.total > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {Math.round((val.total / totalVendido.total) * 100)}% del total
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecciona un rango de fechas</p>
            <p className="text-sm mt-1">y presiona Consultar para ver las ventas del periodo</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
