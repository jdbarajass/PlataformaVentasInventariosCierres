'use client'

import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { formatPrice } from '@/lib/utils'

interface MySales {
  total_cents: number
  goal_cents: number
  bonus_cents: number
}

// Meta mensual de ventas de mostrador y bono asociado — solo para el rol
// vendedor (el admin ya ve el desglose de todos en Rendimiento Vendedores).
// Ver docs/UNIFICACION_YJBMOTOCOM.md sección 81.12.
export function MySalesGoalCard() {
  const { session, userProfile } = useAuth()
  const [data, setData] = useState<MySales | null>(null)

  useEffect(() => {
    if (!session?.access_token || userProfile?.role !== 'seller') return
    fetch('/api/reports/my-sales', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json && setData(json.data))
      .catch(() => {})
  }, [session?.access_token, userProfile?.role])

  if (userProfile?.role !== 'seller' || !data || data.goal_cents <= 0) {
    return null
  }

  const progress = Math.min(100, Math.round((data.total_cents / data.goal_cents) * 100))
  const reached = data.total_cents >= data.goal_cents

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Tu meta de ventas este mes</CardTitle>
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
            ¡Meta alcanzada! Bono: {formatPrice(data.bonus_cents)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {progress}% — te faltan {formatPrice(data.goal_cents - data.total_cents)} para el bono de {formatPrice(data.bonus_cents)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
