'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLatestRequest } from '@/lib/use-latest-request'
import { formatPrice, formatPct } from '@/lib/finance/format'
import type { InventoryInsights, ProductInsight } from '@/lib/finance/inventory-insights'
import { ExportButtons } from '@/components/finanzas/export-buttons'
import { inventoryReport } from '@/lib/finance/report-builders'
import { BRAND } from '@/config/brand'

// Finanzas → Inventario (docs/PLAN_CONTROL_FINANCIERO.md, Fase 4). Todo el
// cálculo vive en lib/finance/inventory-insights.ts y lo hace /api/finance/inventory.

interface InventoryResponse extends InventoryInsights {
  today: string
  lookbackDays: number
}

const WINDOWS = [30, 90, 180, 365]
const QUIET = [60, 90, 180]

const days = (n: number | null) => (n === null ? '—' : `${Math.round(n).toLocaleString('es-CO')} días`)
const coverage = (n: number | null) => (n === null ? '—' : n > 999 ? '+999 días' : `${Math.round(n)} días`)

function ProductList({
  title,
  hint,
  items,
  empty,
  right,
  sub,
}: {
  title: string
  hint: string
  items: ProductInsight[]
  empty: string
  right: (p: ProductInsight) => React.ReactNode
  sub: (p: ProductInsight) => string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="divide-y text-sm">
          {items.map((p, i) => (
            <li key={p.id} className="flex items-start justify-between gap-3 py-2">
              <div className="flex min-w-0 gap-2">
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium" title={p.title}>{p.title}</p>
                  <p className="text-xs text-muted-foreground">{sub(p)}</p>
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums">{right(p)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function InventoryView({ accessToken }: { accessToken: string | undefined }) {
  const [windowDays, setWindowDays] = useState(90)
  const [quietDays, setQuietDays] = useState(90)
  const [showAllQuiet, setShowAllQuiet] = useState(false)
  const [data, setData] = useState<InventoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const beginRequest = useLatestRequest()

  const fetchData = useCallback(async () => {
    if (!accessToken) return
    const isStale = beginRequest()
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/inventory?window=${windowDays}&quiet=${quietDays}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (isStale()) return
      if (!res.ok) {
        setLoadError(json?.error || 'No se pudo calcular la rotación del inventario.')
        return
      }
      setData(json.data)
    } catch (error) {
      console.error('Error loading inventory insights:', error)
      if (!isStale()) setLoadError('No se pudo calcular la rotación del inventario. Intenta de nuevo.')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [accessToken, windowDays, quietDays, beginRequest])

  useEffect(() => { fetchData() }, [fetchData])

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3 text-sm sm:p-4">
      <label className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
        <span className="text-muted-foreground">Rotación y rentabilidad de los últimos</span>
        <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="rounded-lg border bg-background px-3 py-2 touch:h-11">
          {WINDOWS.map((w) => <option key={w} value={w}>{w} días</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
        <span className="text-muted-foreground">Quieto si no se vende hace más de</span>
        <select value={quietDays} onChange={(e) => setQuietDays(Number(e.target.value))} className="rounded-lg border bg-background px-3 py-2 touch:h-11">
          {QUIET.map((q) => <option key={q} value={q}>{q} días</option>)}
        </select>
      </label>
    </div>
  )

  if (loading && !data) {
    return <div className="space-y-6">{controls}<div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></div>
  }
  if (loadError) {
    return (
      <div className="space-y-6">
        {controls}
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" className="rounded-lg" onClick={fetchData}>Reintentar</Button>
        </div>
      </div>
    )
  }
  if (!data) return null

  const quietShown = showAllQuiet ? data.quiet : data.quiet.slice(0, 20)
  const lastSaleText = (p: ProductInsight) =>
    p.daysSinceSale === null ? `sin ventas en el último año` : `última venta hace ${p.daysSinceSale} días`

  return (
    <div className={`space-y-6 sm:space-y-8 ${loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={loading}>
      <div className="flex justify-end">
        <ExportButtons getDoc={() => inventoryReport(data, BRAND.name)} disabled={loading} />
      </div>
      {controls}

      {/* Tarjetas */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Inventario a costo</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.inventory.value_cents)}</p>
          <p className="text-xs text-muted-foreground">{data.inventory.units.toLocaleString('es-CO')} unidades · {data.inventory.refs.toLocaleString('es-CO')} referencias</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Días de inventario</p>
          <p className="text-lg font-bold sm:text-2xl">{days(data.daysOfInventory)}</p>
          <p className="text-xs text-muted-foreground">Al ritmo de venta de los últimos 30 días, lo que hay alcanza para eso</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Rotación <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Estimado</span></p>
          <p className="text-lg font-bold sm:text-2xl">{data.turnoverPerYear === null ? '—' : `${data.turnoverPerYear.toFixed(1)} veces/año`}</p>
          <p className="text-xs text-muted-foreground">Costo vendido en {data.windowDays} días llevado a un año ÷ inventario de hoy</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Plata quieta</p>
          <p className={`text-lg font-bold sm:text-2xl ${data.quietTotals.value > 0 ? 'text-amber-600 dark:text-amber-500' : ''}`}>{formatPrice(data.quietTotals.value)}</p>
          <p className="text-xs text-muted-foreground">{formatPct(data.quietTotals.shareOfInventory)} del inventario · {data.quietTotals.products} productos sin venta en más de {data.quietDays} días</p>
        </div>
      </div>

      {/* Rentabilidad por categoría */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-2 sm:px-6">
          <h2 className="text-lg font-semibold">Rentabilidad por categoría</h2>
          <p className="text-xs text-muted-foreground">Ventas de los últimos {data.windowDays} días · inventario de hoy</p>
        </div>
        {data.categories.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">No hay ventas ni inventario.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium sm:pl-6">Categoría</th>
                    <th className="px-3 py-2 text-right font-medium">Unidades</th>
                    <th className="px-3 py-2 text-right font-medium">Ventas</th>
                    <th className="px-3 py-2 text-right font-medium">Utilidad bruta</th>
                    <th className="px-3 py-2 text-right font-medium">Margen</th>
                    <th className="px-3 py-2 text-right font-medium">% de la utilidad</th>
                    <th className="px-4 py-2 text-right font-medium sm:pr-6">Inventario hoy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.category} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium sm:pl-6">{c.category}</td>
                      <td className="px-3 py-2 text-right">{c.units.toLocaleString('es-CO')}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(c.sales)}</td>
                      <td className={`px-3 py-2 text-right ${c.profit < 0 ? 'text-red-500' : ''}`}>{formatPrice(c.profit)}</td>
                      <td className="px-3 py-2 text-right">{formatPct(c.margin)}</td>
                      <td className="px-3 py-2 text-right">{formatPct(c.profitShare)}</td>
                      <td className="px-4 py-2 text-right sm:pr-6">{formatPrice(c.stockValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y px-4 pb-2 md:hidden">
              {data.categories.map((c) => (
                <div key={c.category} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{c.category}</p>
                    <p className={`font-semibold tabular-nums ${c.profit < 0 ? 'text-red-500' : ''}`}>{formatPrice(c.profit)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Ventas {formatPrice(c.sales)} · margen {formatPct(c.margin)} · {formatPct(c.profitShare)} de la utilidad · inventario {formatPrice(c.stockValue)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Productos quietos */}
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Productos quietos</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Tienen stock, no se venden hace más de {data.quietDays} días y no les entró mercancía en ese tiempo. Es plata parada: candidatos a promoción, combo o devolución al proveedor.
        </p>
        {data.quiet.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay productos quietos con este criterio.</p>
        ) : (
          <>
            <ol className="divide-y text-sm">
              {quietShown.map((p, i) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="flex min-w-0 gap-2">
                    <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="line-clamp-1 font-medium" title={p.title}>{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.category} · {p.stock} uds · {lastSaleText(p)}</p>
                    </div>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">{formatPrice(p.stockValue)}</p>
                </li>
              ))}
            </ol>
            {data.quiet.length > 20 && (
              <Button variant="outline" className="mt-3 rounded-lg touch:h-11 max-sm:w-full" onClick={() => setShowAllQuiet((v) => !v)}>
                {showAllQuiet ? 'Ver solo los 20 de más valor' : `Ver los ${data.quiet.length}`}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <ProductList
          title="Los que más rotan"
          hint={`Más unidades vendidas en ${data.windowDays} días. Que no les falte stock.`}
          items={data.topMovers}
          empty="No hubo ventas en este periodo."
          sub={(p) => `${p.stock} en stock · alcanza para ${coverage(p.coverageDays)}`}
          right={(p) => <span className="font-medium">{p.unitsWindow} uds</span>}
        />
        <ProductList
          title="Baja rotación"
          hint={`Se venden, pero despacio: con el ritmo de ${data.windowDays} días el stock tarda mucho en salir.`}
          items={data.slowMovers}
          empty="No hay productos con stock y ventas en este periodo."
          sub={(p) => `${p.stock} en stock · ${p.unitsWindow} vendidas · ${formatPrice(p.stockValue)} a costo`}
          right={(p) => <span className="font-medium">{coverage(p.coverageDays)}</span>}
        />
      </div>

      <ProductList
        title="Productos que más utilidad dejan"
        hint={`Utilidad bruta (ventas − costo) en ${data.windowDays} días.`}
        items={data.mostProfitable}
        empty="No hubo ventas en este periodo."
        sub={(p) => `${p.unitsWindow} uds · ventas ${formatPrice(p.salesWindow)} · margen ${formatPct(p.marginWindow)}`}
        right={(p) => <span className={`font-medium ${p.profitWindow < 0 ? 'text-red-500' : ''}`}>{formatPrice(p.profitWindow)}</span>}
      />

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Los costos salen de lo guardado en cada venta y del costo actual de cada producto en Inventario: si un producto no tiene costo cargado, su utilidad sale inflada y su inventario en $0. Las alertas de stock bajo siguen en Dashboard e Inventario.
      </p>
    </div>
  )
}
