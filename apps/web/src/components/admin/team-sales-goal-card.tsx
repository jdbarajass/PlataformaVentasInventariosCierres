'use client'

import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { formatPrice } from '@/lib/utils'

interface SellerShare {
  seller_id: string | null
  name: string
  revenue_cents: number
}

interface TeamSales {
  sellers: SellerShare[]
  total_cents: number
  goal_cents: number
  bonus_cents: number
}

// Meta mensual de ventas de mostrador y bono asociado — es una meta del
// equipo completo (no de cada vendedor por separado), a propósito: el
// objetivo es un propósito común, no generar competencia entre vendedores.
// Todos (admin y seller) ven el mismo desglose por persona y el mismo
// avance combinado. Ver docs/UNIFICACION_YJBMOTOCOM.md sección 81.15.
export function TeamSalesGoalCard() {
  const { session } = useAuth()
  const [data, setData] = useState<TeamSales | null>(null)

  useEffect(() => {
    if (!session?.access_token) return
    fetch('/api/reports/team-sales', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json && setData(json.data))
      .catch(() => {})
  }, [session?.access_token])

  if (!data || data.goal_cents <= 0) {
    return null
  }

  const progress = Math.min(100, Math.round((data.total_cents / data.goal_cents) * 100))
  const reached = data.total_cents >= data.goal_cents
  const maxSellerRevenue = Math.max(...data.sellers.map((s) => s.revenue_cents), 1)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Meta de ventas del equipo este mes</CardTitle>
        <Target className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatPrice(data.total_cents)}</div>
        <p className="text-xs text-muted-foreground">de {formatPrice(data.goal_cents)}</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={reached ? 'h-full bg-green-500' : 'h-full bg-cyan-500'}
            style={{ width: `${progress}%` }}
          />
        </div>
        {reached ? (
          <p className="mt-2 text-xs font-medium text-green-500">
            ¡Meta alcanzada entre todos! Bono: {formatPrice(data.bonus_cents)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {progress}% — faltan {formatPrice(data.goal_cents - data.total_cents)} entre todos para el bono de {formatPrice(data.bonus_cents)}
          </p>
        )}

        {data.sellers.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-3">
            {data.sellers.map((s) => (
              <div key={s.seller_id || 'sin_vendedor'} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-medium">{formatPrice(s.revenue_cents)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-cyan-500/60"
                    style={{ width: `${(s.revenue_cents / maxSellerRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
