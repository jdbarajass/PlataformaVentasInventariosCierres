'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertTriangle, Info, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useLatestRequest } from '@/lib/use-latest-request'
import { formatPrice, formatPct, MONTH_NAMES } from '@/lib/finance/format'
import type { YearSummary, YearMonth } from '@/lib/finance/year-summary'

// Finanzas → Año (docs/PLAN_CONTROL_FINANCIERO.md, Fase 3): el "CierreGeneral"
// del Excel. Los números los calcula /api/finance/year (lib/finance/year-summary.ts).

interface YearResponse extends YearSummary {
  year: number
  snapshotsMissing: boolean
  hasLiveInventory: boolean
}

const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatPrice(v))
const tone = (v: number | null | undefined) => (v === null || v === undefined ? '' : v < 0 ? 'text-red-500' : '')

function StatusBadge({ m }: { m: YearMonth }) {
  if (m.status === 'open') return <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">En curso</span>
  if (m.status === 'no-data') return <span className="text-xs text-muted-foreground">sin datos</span>
  if (m.status === 'future') return <span className="text-xs text-muted-foreground">—</span>
  return null
}

function InventoryCell({ m }: { m: YearMonth }) {
  if (!m.inventory) return <span className="text-muted-foreground">—</span>
  return (
    <span title={m.inventory.source === 'live' ? 'Valor de hoy, en vivo' : `Foto del ${m.inventory.as_of}`}>
      {formatPrice(m.inventory.value_cents)}
      {m.inventory.source === 'live' && <span className="ml-1 text-[10px] font-semibold uppercase text-muted-foreground">hoy</span>}
    </span>
  )
}

export function YearView({ year, accessToken, canEdit }: { year: number; accessToken: string | undefined; canEdit: boolean }) {
  const [data, setData] = useState<YearResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const beginRequest = useLatestRequest()

  const fetchData = useCallback(async () => {
    if (!accessToken) return
    const isStale = beginRequest()
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/year?year=${year}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (isStale()) return
      if (!res.ok) {
        setLoadError(json?.error || 'No se pudo calcular el resumen del año.')
        return
      }
      setData(json.data)
    } catch (error) {
      console.error('Error loading year summary:', error)
      if (!isStale()) setLoadError('No se pudo calcular el resumen del año. Intenta de nuevo.')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [accessToken, year, beginRequest])

  useEffect(() => { fetchData() }, [fetchData])

  const takeSnapshot = async () => {
    if (!accessToken) return
    setSaving(true)
    try {
      const res = await fetch('/api/finance/inventory-snapshot', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar la foto')
      toast({ title: 'Foto guardada', description: `Inventario de ${MONTH_NAMES[json.data.month - 1].toLowerCase()}: ${formatPrice(json.data.value_cents)}` })
      fetchData()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

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

  const { months, totals, averages } = data
  const live = months.find((m) => m.inventory?.source === 'live') || null
  const lastClosedInventory = [...months].reverse().find((m) => m.inventory && m.inventory.source !== 'live') || null
  const hasAnySnapshot = months.some((m) => m.inventory && m.inventory.source !== 'live')

  return (
    <div className={`space-y-6 sm:space-y-8 ${loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={loading}>
      {(data.snapshotsMissing || !hasAnySnapshot) && (
        <div className="space-y-2">
          {data.snapshotsMissing ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              Falta crear la tabla de las fotos del inventario (migración 00059 en Supabase). Mientras tanto solo se ve el inventario de hoy.
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              El inventario de fin de mes empieza a guardarse desde ahora (el de meses anteriores no se puede reconstruir). La foto se toma sola cada noche; la última del mes queda como cierre.
            </p>
          )}
        </div>
      )}

      {/* Tarjetas del año */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Ventas del año</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(totals.netSales)}</p>
          <p className="text-xs text-muted-foreground">{totals.months_counted} {totals.months_counted === 1 ? 'mes' : 'meses'} con datos · promedio {averages ? formatPrice(averages.netSales) : '—'}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Utilidad neta del año</p>
          <p className={`text-lg font-bold sm:text-2xl ${totals.netProfit >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-500'}`}>{formatPrice(totals.netProfit)}</p>
          <p className="text-xs text-muted-foreground">Margen neto {formatPct(totals.netMargin)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Lo que quedó</p>
          <p className={`text-lg font-bold sm:text-2xl ${totals.leftover_cents < 0 ? 'text-red-500' : ''}`}>{formatPrice(totals.leftover_cents)}</p>
          <p className="text-xs text-muted-foreground">Ventas − pagado a proveedores − gastos</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Inventario {live ? 'hoy' : lastClosedInventory ? `a ${MONTH_NAMES[lastClosedInventory.month - 1].toLowerCase()}` : ''}</p>
          <p className="text-lg font-bold sm:text-2xl">{live?.inventory ? formatPrice(live.inventory.value_cents) : lastClosedInventory?.inventory ? formatPrice(lastClosedInventory.inventory.value_cents) : '—'}</p>
          <p className="text-xs text-muted-foreground">
            {live && live.inventory_change_cents !== null
              ? `${live.inventory_change_cents >= 0 ? 'Subió' : 'Bajó'} ${formatPrice(Math.abs(live.inventory_change_cents))} desde el cierre del mes anterior`
              : 'A costo (stock × costo)'}
          </p>
          {canEdit && !data.snapshotsMissing && data.hasLiveInventory && (
            <Button variant="outline" size="sm" className="mt-2 rounded-lg touch:h-10" onClick={takeSnapshot} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Guardar foto de hoy
            </Button>
          )}
        </div>
      </div>

      {/* Cierre general: tabla en pantallas grandes */}
      <div className="hidden rounded-xl border bg-card lg:block">
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-2 sm:px-6">
          <h2 className="text-lg font-semibold">Cierre general {data.year}</h2>
          <p className="text-xs text-muted-foreground">Utilidad neta = la del estado de resultados de cada mes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Mes</th>
                <th className="px-1.5 py-2 text-right font-medium">Ventas</th>
                <th className="px-1.5 py-2 text-right font-medium">Utilidad bruta</th>
                <th className="px-1.5 py-2 text-right font-medium">Gastos</th>
                <th className="px-1.5 py-2 text-right font-medium">Utilidad neta</th>
                <th className="px-1.5 py-2 text-right font-medium">Margen</th>
                <th className="px-1.5 py-2 text-right font-medium">Compras</th>
                <th className="px-1.5 py-2 text-right font-medium">Pagado prov.</th>
                <th className="px-1.5 py-2 text-right font-medium">Lo que quedó</th>
                <th className="px-3 py-2 text-right font-medium">Inventario</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const s = m.statement
                const show = m.status === 'open' || m.status === 'closed'
                return (
                  <tr key={m.month} className={`border-b last:border-0 ${!show ? 'text-muted-foreground' : ''}`}>
                    <td className="px-3 py-2"><span className="block">{MONTH_NAMES[m.month - 1]}</span>{m.status !== 'closed' && m.status !== 'future' && <span className="block"><StatusBadge m={m} /></span>}</td>
                    <td className="px-1.5 py-2 text-right">{show ? money(s?.netSales) : ''}</td>
                    <td className={`px-1.5 py-2 text-right ${tone(s?.grossProfit)}`}>{show ? money(s?.grossProfit) : ''}</td>
                    <td className="px-1.5 py-2 text-right">{show && s ? money(s.operatingExpenses + s.financialExpenses) : ''}</td>
                    <td className={`px-1.5 py-2 text-right font-medium ${show ? tone(s?.netProfit) : ''}`}>{show ? money(s?.netProfit) : ''}</td>
                    <td className="px-1.5 py-2 text-right">{show && s ? formatPct(s.netMargin) : ''}</td>
                    {/* Compras y pagos se muestran aunque el mes no cuente (ej. facturas cargadas de antes de vender con el sistema). */}
                    <td className="px-1.5 py-2 text-right">{m.status !== 'future' && (show || m.purchases_cents) ? money(m.purchases_cents) : ''}</td>
                    <td className="px-1.5 py-2 text-right">{m.status !== 'future' && (show || m.supplier_payments_cents) ? money(m.supplier_payments_cents) : ''}</td>
                    <td className={`px-1.5 py-2 text-right ${tone(m.leftover_cents)}`}>{show ? money(m.leftover_cents) : ''}</td>
                    <td className="px-3 py-2 text-right">
                      <InventoryCell m={m} />
                      {m.inventory_change_cents !== null && (
                        <span className={`block text-xs ${m.inventory_change_cents < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {m.inventory_change_cents >= 0 ? '+' : ''}{formatPrice(m.inventory_change_cents)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 font-semibold">
              <tr>
                <td className="px-3 py-2 ">Total</td>
                <td className="px-1.5 py-2 text-right">{formatPrice(totals.netSales)}</td>
                <td className={`px-1.5 py-2 text-right ${tone(totals.grossProfit)}`}>{formatPrice(totals.grossProfit)}</td>
                <td className="px-1.5 py-2 text-right">{formatPrice(totals.operatingExpenses + totals.financialExpenses)}</td>
                <td className={`px-1.5 py-2 text-right ${tone(totals.netProfit)}`}>{formatPrice(totals.netProfit)}</td>
                <td className="px-1.5 py-2 text-right">{formatPct(totals.netMargin)}</td>
                <td className="px-1.5 py-2 text-right">{formatPrice(totals.purchases_cents)}</td>
                <td className="px-1.5 py-2 text-right">{formatPrice(totals.supplier_payments_cents)}</td>
                <td className={`px-1.5 py-2 text-right ${tone(totals.leftover_cents)}`}>{formatPrice(totals.leftover_cents)}</td>
                <td />
              </tr>
              {averages && (
                <tr className="font-normal text-muted-foreground">
                  <td className="px-3 py-2 ">Promedio por mes</td>
                  <td className="px-1.5 py-2 text-right">{formatPrice(averages.netSales)}</td>
                  <td className="px-1.5 py-2 text-right">{formatPrice(averages.grossProfit)}</td>
                  <td />
                  <td className="px-1.5 py-2 text-right">{formatPrice(averages.netProfit)}</td>
                  <td />
                  <td className="px-1.5 py-2 text-right">{formatPrice(averages.purchases_cents)}</td>
                  <td />
                  <td className="px-1.5 py-2 text-right">{formatPrice(averages.leftover_cents)}</td>
                  <td />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Cierre general: tarjetas en celular y tablet */}
      <div className="space-y-3 lg:hidden">
        <h2 className="text-lg font-semibold">Cierre general {data.year}</h2>
        {months.filter((m) => m.status === 'open' || m.status === 'closed').length === 0 && (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No hay meses con datos en {data.year}.</p>
        )}
        {[...months].reverse().filter((m) => m.status === 'open' || m.status === 'closed').map((m) => {
          const s = m.statement!
          return (
            <div key={m.month} className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold">{MONTH_NAMES[m.month - 1]} <StatusBadge m={m} /></p>
                <p className={`font-semibold tabular-nums ${tone(s.netProfit)}`}>{formatPrice(s.netProfit)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                <dt className="text-muted-foreground">Ventas</dt><dd className="text-right">{formatPrice(s.netSales)}</dd>
                <dt className="text-muted-foreground">Utilidad bruta</dt><dd className={`text-right ${tone(s.grossProfit)}`}>{formatPrice(s.grossProfit)}</dd>
                <dt className="text-muted-foreground">Gastos</dt><dd className="text-right">{formatPrice(s.operatingExpenses + s.financialExpenses)}</dd>
                <dt className="text-muted-foreground">Margen neto</dt><dd className="text-right">{formatPct(s.netMargin)}</dd>
                <dt className="text-muted-foreground">Compras</dt><dd className="text-right">{formatPrice(m.purchases_cents)}</dd>
                <dt className="text-muted-foreground">Pagado a prov.</dt><dd className="text-right">{formatPrice(m.supplier_payments_cents)}</dd>
                <dt className="text-muted-foreground">Lo que quedó</dt><dd className={`text-right ${tone(m.leftover_cents)}`}>{money(m.leftover_cents)}</dd>
                <dt className="text-muted-foreground">Inventario</dt><dd className="text-right"><InventoryCell m={m} /></dd>
                {m.inventory_change_cents !== null && (<><dt className="text-muted-foreground">Variación</dt><dd className={`text-right ${tone(m.inventory_change_cents)}`}>{m.inventory_change_cents >= 0 ? '+' : ''}{formatPrice(m.inventory_change_cents)}</dd></>)}
              </dl>
            </div>
          )
        })}
      </div>

      {/* Cómo leerlo */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
          <h2 className="mb-2 text-base font-semibold">Utilidad neta vs. lo que quedó</h2>
          <p className="text-muted-foreground">
            La <strong className="text-foreground">utilidad neta</strong> resta el costo de lo que se vendió. <strong className="text-foreground">Lo que quedó</strong> (la «ganancia real» del Excel) resta lo que se le pagó a los proveedores ese mes.
            Si en un mes se compró más mercancía de la que se vendió, lo que quedó sale menor que la utilidad, pero esa plata no se perdió: está en el inventario (por eso se muestra cuánto subió).
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
          <h2 className="mb-2 text-base font-semibold">Otras salidas del año (no son gasto)</h2>
          <dl className="grid grid-cols-2 gap-y-1 tabular-nums">
            <dt className="text-muted-foreground">Retiros del dueño</dt><dd className="text-right">{formatPrice(totals.ownerWithdrawals)}</dd>
            <dt className="text-muted-foreground">Inversiones</dt><dd className="text-right">{formatPrice(totals.investments)}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Compras = facturas de proveedor por fecha de llegada. Pagado a prov. = abonos de Facturas por fecha de pago, más las facturas marcadas pagadas sin abonos (por su fecha de pago o de llegada).
            Un mes sin ventas ni gastos muestra sus compras pero no suma en los totales.
          </p>
        </div>
      </div>
    </div>
  )
}
