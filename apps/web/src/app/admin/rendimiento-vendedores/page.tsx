'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Loader2, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'

interface SellerPerformance {
  seller_id: string | null
  name: string
  orders: number
  units: number
  revenue_cents: number
}

export default function RendimientoVendedoresPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [data, setData] = useState<SellerPerformance[]>([])
  const [loading, setLoading] = useState(true)

  const { session, userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'admin'

  const fetchData = useCallback(async () => {
    if (!session?.access_token || !isAdmin) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/reports/seller-performance?from=${dateFrom}T00:00:00&to=${dateTo}T23:59:59`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return
      const { data } = await res.json()
      setData(data || [])
    } catch (error) {
      console.error('Error fetching seller performance:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, isAdmin, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  const totalRevenue = data.reduce((sum, s) => sum + s.revenue_cents, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Rendimiento Vendedores</h1>
        <p className="text-muted-foreground">Ventas de mostrador agrupadas por vendedor</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
        <span className="text-sm font-medium">Rango:</span>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto rounded-lg" />
        <span className="text-muted-foreground">a</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto rounded-lg" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <Trophy className="mx-auto mb-2 h-8 w-8" />
          No hay ventas de mostrador en el rango seleccionado
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Vendedor</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Ventas</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Unidades</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Ingresos</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">% del total</th>
                </tr>
              </thead>
              <tbody>
                {data.map((seller) => (
                  <tr key={seller.seller_id || 'sin_vendedor'} className="border-b last:border-0">
                    <td className="px-6 py-4 font-medium">{seller.name}</td>
                    <td className="px-6 py-4 text-center">{seller.orders}</td>
                    <td className="px-6 py-4 text-center">{seller.units}</td>
                    <td className="px-6 py-4 text-right font-bold">{formatPrice(seller.revenue_cents)}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {totalRevenue > 0 ? ((seller.revenue_cents / totalRevenue) * 100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
