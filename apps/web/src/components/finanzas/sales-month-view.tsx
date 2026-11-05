'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLatestRequest } from '@/lib/use-latest-request'
import { formatPrice, MONTH_NAMES } from '@/lib/finance/format'
import { DAY_RATINGS, type DayRating, type SalesMonth } from '@/lib/finance/sales-month'
import type { Receivables } from '@/lib/finance/cash-flow'
import { ExportButtons } from '@/components/finanzas/export-buttons'
import { salesMonthReport } from '@/lib/finance/report-builders'
import { BRAND } from '@/config/brand'

// Finanzas → Ventas por día: la "Hoja del mes" (ventas de cada día por medio
// de pago). Cálculo en lib/finance/sales-month.ts vía /api/finance/sales-month.

interface SalesMonthResponse extends SalesMonth {
  year: number
  month: number
  today: string
  daysInMonth: number
  daysElapsed: number
  porLlegar: Receivables['porLlegar']
}

export const RATING_STYLE: Record<DayRating, { label: string; cls: string }> = {
  mala: { label: 'Mala', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  media: { label: 'Media', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  normal: { label: 'Normal', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  buena: { label: 'Buena', cls: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  sin_venta: { label: 'Sin venta', cls: 'bg-muted text-muted-foreground' },
}
const METHOD_LABEL: Record<string, string> = { datafono: 'Datáfono', addi: 'Addi', sistecredito: 'SisteCrédito' }
const money = (v: number | undefined) => (v ? formatPrice(v) : '')
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function RatingBadge({ rating }: { rating: DayRating }) {
  const r = RATING_STYLE[rating]
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${r.cls}`}>{r.label}</span>
}

export function SalesMonthView({ year, month, accessToken }: { year: number; month: number; accessToken: string | undefined }) {
  const [data, setData] = useState<SalesMonthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const beginRequest = useLatestRequest()

  const fetchData = useCallback(async () => {
    if (!accessToken) return
    const isStale = beginRequest()
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/sales-month?year=${year}&month=${month}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (isStale()) return
      if (!res.ok) {
        setLoadError(json?.error || 'No se pudieron calcular las ventas del mes.')
        return
      }
      setData(json.data)
    } catch (error) {
      console.error('Error loading sales month:', error)
      if (!isStale()) setLoadError('No se pudieron calcular las ventas del mes. Intenta de nuevo.')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [accessToken, year, month, beginRequest])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }
  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" className="rounded-lg" onClick={fetchData}>Reintentar</Button>
      </div>
    )
  }
  if (!data) return null

  const daysDesc = [...data.days].reverse()
  const monthName = MONTH_NAMES[data.month - 1].toLowerCase()

  return (
    <div className={`space-y-6 sm:space-y-8 ${loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={loading}>
      <div className="flex justify-end">
        <ExportButtons getDoc={() => salesMonthReport(data, BRAND.name)} disabled={loading} />
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="col-span-2 rounded-xl border bg-card p-3 sm:p-4 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Venta del mes</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.totals.total)}</p>
          <p className="text-xs text-muted-foreground">{data.totals.orders} ventas en {data.daysElapsed} {data.daysElapsed === 1 ? 'día' : 'días'}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {DAY_RATINGS.map((r) => (
              <span key={r.key} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${RATING_STYLE[r.key].cls}`} title={`${data.ratingCounts[r.key].days} días · ${formatPrice(data.ratingCounts[r.key].cents)}`}>
                {RATING_STYLE[r.key].label} {data.ratingCounts[r.key].days}
              </span>
            ))}
            {data.ratingCounts.sin_venta.days > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${RATING_STYLE.sin_venta.cls}`}>Sin venta {data.ratingCounts.sin_venta.days}</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Promedio por día</p>
          <p className="text-lg font-bold sm:text-2xl">{data.averagePerDay === null ? '—' : formatPrice(data.averagePerDay)}</p>
          <p className="text-xs text-muted-foreground">{data.bestDay ? `Mejor día: ${fmtDate(data.bestDay.date)} con ${formatPrice(data.bestDay.total)}` : 'Sin ventas'}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Comisiones del mes</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.commissions.total)}</p>
          <p className="text-xs text-muted-foreground">Se le cobran al cliente como recargo: no bajan la ganancia</p>
        </div>
        <div className="col-span-2 rounded-xl border bg-card p-3 sm:p-4 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Por llegar (hoy)</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.porLlegar.cents)}</p>
          {data.porLlegar.byMethod.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada pendiente de Datáfono, Addi ni SisteCrédito</p>
          ) : (
            <div className="mt-1 space-y-0.5">
              {data.porLlegar.byMethod.map((m) => (
                <div key={m.method} className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>{METHOD_LABEL[m.method] || m.method}{m.next_date ? ` · llega ${fmtDate(m.next_date)}` : ''}</span>
                  <span className="tabular-nums">{formatPrice(m.cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla: computador */}
      <div className="hidden rounded-xl border bg-card lg:block">
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-2 sm:px-6">
          <h2 className="text-lg font-semibold">Ventas diarias por medio de pago — {monthName}</h2>
          <p className="text-xs text-muted-foreground">Clic en un día para ver sus ventas</p>
        </div>
        {data.days.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Este mes todavía no empieza.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Día</th>
                  {data.columns.map((c) => <th key={c.key} className="px-2 py-2 text-right font-medium">{c.label}</th>)}
                  <th className="px-3 py-2 text-right font-semibold text-foreground">Total</th>
                  <th className="px-3 py-2 text-left font-medium">Venta</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className="border-b hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link href={`/admin/ventas-dia?date=${d.date}`} className="hover:underline">{d.weekday} {Number(d.date.slice(8, 10))}</Link>
                    </td>
                    {data.columns.map((c) => <td key={c.key} className="px-2 py-2 text-right">{money(d.byColumn[c.key])}</td>)}
                    <td className="px-3 py-2 text-right font-semibold">{d.total ? formatPrice(d.total) : '—'}</td>
                    <td className="px-3 py-2"><RatingBadge rating={d.rating} /></td>
                    <td className="pr-3"><Link href={`/admin/ventas-dia?date=${d.date}`} aria-label={`Ver ventas del ${d.date}`}><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {data.halves.map((h) => (
                  <tr key={h.label} className="border-b text-muted-foreground">
                    <td className="whitespace-nowrap px-4 py-2">{h.label}</td>
                    {data.columns.map((c) => <td key={c.key} className="px-2 py-2 text-right">{money(h.byColumn[c.key])}</td>)}
                    <td className="px-3 py-2 text-right">{formatPrice(h.total)}</td>
                    <td colSpan={2} />
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  {data.columns.map((c) => <td key={c.key} className="px-2 py-2 text-right">{money(data.totals[c.key])}</td>)}
                  <td className="px-3 py-2 text-right">{formatPrice(data.totals.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Tarjetas por día: celular y tablet */}
      <div className="space-y-3 lg:hidden">
        <h2 className="text-lg font-semibold">Ventas diarias — {monthName}</h2>
        {daysDesc.length === 0 && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Este mes todavía no empieza.</p>}
        {daysDesc.map((d) => (
          <Link key={d.date} href={`/admin/ventas-dia?date=${d.date}`} className="block rounded-xl border bg-card p-3 text-sm touch:min-h-11">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{d.weekday} {Number(d.date.slice(8, 10))}</p>
              <div className="flex items-center gap-2">
                <RatingBadge rating={d.rating} />
                <span className="font-semibold tabular-nums">{d.total ? formatPrice(d.total) : '—'}</span>
              </div>
            </div>
            {d.total > 0 && (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {data.columns.filter((c) => d.byColumn[c.key]).map((c) => `${c.label} ${formatPrice(d.byColumn[c.key])}`).join(' · ')}
              </p>
            )}
          </Link>
        ))}
        {data.days.length > 0 && (
          <div className="rounded-xl border bg-card p-3 text-sm">
            {data.halves.map((h) => (
              <div key={h.label} className="flex justify-between text-muted-foreground"><span>{h.label}</span><span className="tabular-nums">{formatPrice(h.total)}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatPrice(data.totals.total)}</span></div>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">{data.columns.map((c) => `${c.label} ${formatPrice(data.totals[c.key] || 0)}`).join(' · ')}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Calificación del día: Mala menos de $300.000 · Media hasta $599.999 · Normal hasta $1.499.999 · Buena desde $1.500.000.
        Las ventas de la tienda en línea van en su propia columna. «Sin medio» son ventas que no tienen el pago registrado.
      </p>
    </div>
  )
}
