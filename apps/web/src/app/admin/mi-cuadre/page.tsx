'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Wallet, Package, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', daviplata: 'Daviplata', addi: 'Addi', card: 'Datáfono', other: 'Otro',
}

interface Sale {
  id: string
  total_cents: number
  status: string
  order_items: { qty: number }[]
  payments: { method: string; amount_cents: number }[]
}

export default function MiCuadrePage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const { session } = useAuth()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchToday = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const res = await fetch(`/api/pos/sales?from=${startOfDay.toISOString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { data } = await res.json()
      setSales((data || []).filter((s: Sale) => s.status !== 'cancelled'))
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Error fetching Mi Cuadre:', error)
    }
  }, [session?.access_token])

  useEffect(() => {
    fetchToday()
    intervalRef.current = setInterval(fetchToday, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchToday])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const totalUnidades = sales.reduce((sum, s) => sum + (s.order_items || []).reduce((s2, i) => s2 + i.qty, 0), 0)
  const totalRecaudado = sales.reduce((sum, s) => sum + s.total_cents, 0)
  const porMetodo = sales.reduce<Record<string, number>>((acc, s) => {
    (s.payments || []).forEach((p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount_cents
    })
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mi Cuadre</h1>
          <p className="text-muted-foreground">Resumen de ventas de hoy — sin costos ni márgenes</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es-CO')}` : 'Cargando...'}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sales.length}</p>
              <p className="text-sm text-muted-foreground">Ventas de hoy</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
              <Package className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalUnidades}</p>
              <p className="text-sm text-muted-foreground">Unidades vendidas</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <Wallet className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatPrice(totalRecaudado)}</p>
              <p className="text-sm text-muted-foreground">Total recaudado</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Desglose por método de pago</h2>
        {Object.keys(porMetodo).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ventas registradas hoy todavía.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(porMetodo)
              .sort((a, b) => b[1] - a[1])
              .map(([method, cents]) => (
                <div key={method} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="font-medium">{methodLabels[method] || method}</span>
                  <span className="font-bold">{formatPrice(cents)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
