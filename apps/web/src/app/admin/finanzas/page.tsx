'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Lock, AlertTriangle, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { useAuth } from '@/lib/auth-context'
import { useLatestRequest } from '@/lib/use-latest-request'
import { salesForTargetProfit, percentChange, type IncomeStatement } from '@/lib/finance/income-statement'
import { EXPENSE_CLASS_LABEL, type FixedMonthlyExpenses } from '@/lib/finance/expense-classes'
import { formatPrice, formatPct, MONTH_NAMES } from '@/lib/finance/format'
import { YearView } from '@/components/finanzas/year-view'
import { InventoryView } from '@/components/finanzas/inventory-view'
import { CashFlowView } from '@/components/finanzas/cash-flow-view'
import { SalesMonthView } from '@/components/finanzas/sales-month-view'
import { ExpensesMonthView } from '@/components/finanzas/expenses-month-view'
import { ExportButtons } from '@/components/finanzas/export-buttons'
import { monthReport } from '@/lib/finance/report-builders'
import { BRAND } from '@/config/brand'
import { cn } from '@/lib/utils'

// Finanzas → Estado de resultados (docs/PLAN_CONTROL_FINANCIERO.md, Fase 2).
// Todo el cálculo vive en lib/finance/income-statement.ts y lo hace la API
// /api/finance/month; esta pantalla solo lo muestra.

const monthNames = MONTH_NAMES

// Pestañas de Finanzas: título, descripción y qué selectores de fecha usan.
const TABS = [
  { id: 'mes', label: 'Mes', title: 'Estado de resultados', subtitle: 'Cuánto se vendió, cuánto costó, cuánto se gastó y cuánto se ganó en el mes', month: true, year: true },
  { id: 'ventas', label: 'Ventas por día', title: 'Ventas por día', subtitle: 'Lo vendido cada día por medio de pago, la calificación del día y lo que está por llegar', month: true, year: true },
  { id: 'gastos', label: 'Gastos', title: 'Gastos del mes', subtitle: 'Todo lo que salió en el mes, por categoría y cuenta, y si los gastos fijos ya se pagaron', month: true, year: true },
  { id: 'ano', label: 'Año', title: 'Resumen del año', subtitle: 'El cierre general mes a mes: ventas, compras, gastos, utilidad e inventario', month: false, year: true },
  { id: 'inventario', label: 'Inventario', title: 'Inventario y rentabilidad', subtitle: 'Qué tan rápido sale la mercancía, dónde hay plata parada y qué deja más utilidad', month: false, year: false },
  { id: 'flujo', label: 'Flujo de caja', title: 'Flujo de caja', subtitle: 'Cuánta plata entró y salió, cuánto nos deben, cuánto debemos y cuánto se puede retirar', month: true, year: true },
] as const
type TabId = (typeof TABS)[number]['id']

interface PeriodStatement {
  year: number
  month: number
  lastDay: string
  daysInMonth: number
  daysElapsed: number
  statement: IncomeStatement
}

interface MonthResponse {
  current: PeriodStatement
  previous: PeriodStatement
  lastYear: PeriodStatement
  fixedConfig: FixedMonthlyExpenses | null
  comparedSameDays: boolean
}


function Delta({ current, base, goodWhenUp = true, label }: { current: number; base: number | null; goodWhenUp?: boolean; label: string }) {
  if (base === null) return <span className="text-xs text-muted-foreground">{label}: sin datos</span>
  const change = percentChange(current, base)
  if (change === null) return <span className="text-xs text-muted-foreground">{label}: antes $ 0</span>
  const up = change >= 0
  const good = up === goodWhenUp
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${good ? 'text-green-600 dark:text-green-500' : 'text-red-500'}`} title={`${label}: ${formatPrice(base)}`}>
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
      {Math.abs(change * 100).toFixed(1)}% {label}
    </span>
  )
}

export default function FinanzasPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<MonthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [tab, setTab] = useState<TabId>('mes')
  const currentTab = TABS.find((t) => t.id === tab)!

  const { session, userProfile } = useAuth()
  const canView = userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'

  const beginRequest = useLatestRequest()
  const fetchData = useCallback(async () => {
    if (!session?.access_token || !canView || tab !== 'mes') return
    const isStale = beginRequest()
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/month?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json().catch(() => null)
      if (isStale()) return
      if (!res.ok) {
        setLoadError(json?.error || 'No se pudo calcular el estado de resultados.')
        return
      }
      setData(json.data)
    } catch (error) {
      console.error('Error loading finanzas:', error)
      if (!isStale()) setLoadError('No se pudo calcular el estado de resultados. Intenta de nuevo.')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [session?.access_token, canView, year, month, tab, beginRequest])

  useEffect(() => { fetchData() }, [fetchData])

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  const s = data?.current.statement
  const prev = data?.previous.statement
  const ly = data?.lastYear.statement
  const isCurrentMonth = !!data && data.current.daysElapsed > 0 && data.current.daysElapsed < data.current.daysInMonth
  const prevLabel = data ? `vs ${monthNames[data.previous.month - 1].slice(0, 3).toLowerCase()}` : ''
  const lyLabel = data ? `vs ${data.lastYear.year}` : ''

  const targetCents = Number(target || 0) * 100
  const totalExpenses = s ? s.operatingExpenses + s.financialExpenses : 0
  const salesForTarget = s ? salesForTargetProfit(totalExpenses, targetCents, s.grossMargin) : null

  // Filas del estado de resultados. `sign` es solo visual: el cálculo ya viene hecho.
  const rows: { key: string; label: string; sign?: '−' | '='; value: number; goodWhenUp: boolean; pick: (x: IncomeStatement) => number; formula: string; strong?: boolean }[] = s ? [
    { key: 'net', label: 'Ventas netas', value: s.netSales, goodWhenUp: true, pick: (x) => x.netSales, formula: 'Suma de lo cobrado en ventas pagadas (mostrador + tienda online), ya con descuentos.', strong: true },
    { key: 'cost', label: 'Costo de lo vendido', sign: '−', value: s.costOfSales, goodWhenUp: false, pick: (x) => x.costOfSales, formula: 'Cantidad × costo guardado en cada venta.' },
    { key: 'gross', label: 'Utilidad bruta', sign: '=', value: s.grossProfit, goodWhenUp: true, pick: (x) => x.grossProfit, formula: 'Ventas netas − costo de lo vendido.', strong: true },
    { key: 'opex', label: 'Gastos operativos', sign: '−', value: s.operatingExpenses, goodWhenUp: false, pick: (x) => x.operatingExpenses, formula: 'Gastos fijos de Configuración + gastos registrados que restan (sin retiros, inversiones ni pagos ya contados en fijos).' },
    { key: 'op', label: 'Utilidad operacional', sign: '=', value: s.operatingProfit, goodWhenUp: true, pick: (x) => x.operatingProfit, formula: 'Utilidad bruta − gastos operativos.', strong: true },
    { key: 'fin', label: 'Gastos financieros', sign: '−', value: s.financialExpenses, goodWhenUp: false, pick: (x) => x.financialExpenses, formula: 'Gastos con categoría "Gastos bancarios" (4x1000, cuota de manejo, intereses).' },
    { key: 'netp', label: 'Utilidad neta', sign: '=', value: s.netProfit, goodWhenUp: true, pick: (x) => x.netProfit, formula: 'Utilidad operacional − gastos financieros. Antes de impuestos. Es la misma "utilidad real" de Historial Mensual.', strong: true },
  ] : []

  const reasonNotCounted = (l: IncomeStatement['expenseLines'][number]) => {
    if (l.cls === 'retiro') return 'No: retiro del dueño'
    if (l.cls === 'inversion') return 'No: inversión'
    if (l.coveredByFixed) return 'No: ya está en gastos fijos'
    return 'Sí'
  }

  const fixedConfig = data?.fixedConfig
  const breakEvenProgress = s && s.breakEvenSales ? Math.min(s.netSales / s.breakEvenSales, 1) : null

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{currentTab.title}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {currentTab.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentTab.month && (
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} aria-label="Mes" className="rounded-lg border bg-background px-3 py-2 text-sm touch:h-11 max-sm:flex-1">
              {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          )}
          {currentTab.year && (
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} aria-label="Año" className="w-24 rounded-lg border bg-background px-3 py-2 text-sm touch:h-11">
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Pestañas — mismo estilo que Cuentas */}
      <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex shrink-0 items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors touch:min-h-11',
              tab === id ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'gastos' ? (
        <ExpensesMonthView year={year} month={month} accessToken={session?.access_token} canEdit={userProfile?.role === 'admin'} />
      ) : tab === 'ventas' ? (
        <SalesMonthView year={year} month={month} accessToken={session?.access_token} />
      ) : tab === 'flujo' ? (
        <CashFlowView year={year} month={month} accessToken={session?.access_token} />
      ) : tab === 'inventario' ? (
        <InventoryView accessToken={session?.access_token} />
      ) : tab === 'ano' ? (
        <YearView year={year} accessToken={session?.access_token} canEdit={userProfile?.role === 'admin'} />
      ) : loading && !s ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" className="rounded-lg" onClick={fetchData}>Reintentar</Button>
        </div>
      ) : s && prev && ly && data ? (
        <div className={`space-y-6 sm:space-y-8 ${loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={loading}>
          <div className="flex justify-end">
            <ExportButtons getDoc={() => monthReport(data, BRAND.name)} disabled={loading} />
          </div>
          {/* Avisos: qué tan confiables son las cifras */}
          {(s.itemsWithoutCost.lines > 0 || isCurrentMonth || data.current.daysElapsed === 0) && (
            <div className="space-y-2">
              {data.current.daysElapsed === 0 && (
                <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Este mes todavía no empieza.</p>
              )}
              {isCurrentMonth && (
                <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Mes en curso: van {data.current.daysElapsed} de {data.current.daysInMonth} días. Los gastos fijos se cuentan completos, así que la utilidad sube a medida que avanza el mes.
                </p>
              )}
              {s.itemsWithoutCost.lines > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  {s.itemsWithoutCost.lines} {s.itemsWithoutCost.lines === 1 ? 'línea vendida no tiene' : 'líneas vendidas no tienen'} costo ({formatPrice(s.itemsWithoutCost.sales_cents)} en ventas): para el sistema costaron $0, así que la utilidad sale más alta de lo real. Suele pasar con ítems manuales o productos sin costo cargado en Inventario.
                </p>
              )}
            </div>
          )}

          {/* Tarjetas principales */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className="rounded-xl border bg-card p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">Ventas netas</p>
              <p className="text-lg font-bold sm:text-2xl">{formatPrice(s.netSales)}</p>
              <div className="mt-1 flex flex-col gap-0.5">
                <Delta current={s.netSales} base={prev.hasData ? prev.netSales : null} label={prevLabel} />
                <Delta current={s.netSales} base={ly.hasData ? ly.netSales : null} label={lyLabel} />
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">Utilidad bruta</p>
              <p className={`text-lg font-bold sm:text-2xl ${s.grossProfit >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-500'}`}>{formatPrice(s.grossProfit)}</p>
              <p className="text-xs text-muted-foreground">Margen bruto {formatPct(s.grossMargin)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">Utilidad neta</p>
              <p className={`text-lg font-bold sm:text-2xl ${s.netProfit >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-500'}`}>{formatPrice(s.netProfit)}</p>
              <p className="text-xs text-muted-foreground">Margen neto {formatPct(s.netMargin)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">Punto de equilibrio</p>
              <p className="text-lg font-bold sm:text-2xl">{s.breakEvenSales === null ? '—' : formatPrice(s.breakEvenSales)}</p>
              {breakEvenProgress !== null ? (
                <>
                  <div className="mt-2 h-2 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(breakEvenProgress * 100)} aria-label="Avance hacia el punto de equilibrio">
                    <div className={`h-2 rounded-full ${breakEvenProgress >= 1 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${breakEvenProgress * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{breakEvenProgress >= 1 ? 'Ya se cubrieron los gastos del mes' : `Faltan ${formatPrice(s.breakEvenSales! - s.netSales)}`}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sin ventas con margen para calcularlo</p>
              )}
            </div>
          </div>

          {/* Estado de resultados */}
          <div className="rounded-xl border bg-card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{monthNames[month - 1]} {year}</h2>
              <p className="text-xs text-muted-foreground">
                % sobre ventas netas · comparado con {monthNames[data.previous.month - 1].toLowerCase()} {data.previous.year} y {monthNames[data.lastYear.month - 1].toLowerCase()} {data.lastYear.year}
                {data.comparedSameDays && ` (solo del 1 al ${Number(data.previous.lastDay.slice(8, 10))}, los mismos días que van de este mes)`}
              </p>
            </div>
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.key} className={`grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_8rem_4.5rem_14rem] sm:items-center ${r.strong ? 'font-semibold' : ''}`}>
                  <div>
                    <p className={r.strong ? '' : 'pl-4 text-muted-foreground'}>{r.sign && <span className="mr-1 text-muted-foreground" aria-hidden>{r.sign}</span>}{r.label}</p>
                    <p className="text-xs font-normal text-muted-foreground">{r.formula}</p>
                    {r.key === 'net' && (s.discounts > 0 || s.grossSales > 0) && (
                      <p className="text-xs font-normal text-muted-foreground">Precio de lista {formatPrice(s.grossSales)} · descuentos dados {formatPrice(s.discounts)}</p>
                    )}
                  </div>
                  <p className={`text-right tabular-nums ${r.value < 0 ? 'text-red-500' : ''}`}>{formatPrice(r.value)}</p>
                  <p className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{r.key === 'net' ? '100%' : formatPct(s.netSales ? r.value / s.netSales : null)}</p>
                  <div className="col-span-2 flex flex-wrap gap-x-3 font-normal sm:col-span-1 sm:flex-col sm:items-end">
                    <Delta current={r.pick(s)} base={prev.hasData ? r.pick(prev) : null} goodWhenUp={r.goodWhenUp} label={prevLabel} />
                    <Delta current={r.pick(s)} base={ly.hasData ? r.pick(ly) : null} goodWhenUp={r.goodWhenUp} label={lyLabel} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Las comisiones de los medios de pago ({formatPrice(s.commissions)}) no se restan: se le cobran al cliente como sobreprecio.
              Los meses anteriores usan los gastos fijos configurados hoy (el sistema no guarda su historial).
            </p>
          </div>

          {/* Indicadores */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {[
              { label: 'Transacciones', value: String(s.transactions), hint: `${s.units} unidades` },
              { label: 'Ticket promedio', value: s.averageTicket === null ? '—' : formatPrice(s.averageTicket), hint: 'Ventas netas ÷ transacciones' },
              { label: 'Markup', value: formatPct(s.markup), hint: 'Utilidad bruta ÷ costo' },
              { label: 'Gastos / ventas', value: formatPct(s.expensesToSales), hint: 'Gastos operativos y financieros ÷ ventas' },
              { label: 'Nómina / ventas', value: formatPct(s.payrollToSales), hint: `Sueldos ${formatPrice(s.payroll)}` },
              { label: 'Retiros del dueño', value: formatPrice(s.ownerWithdrawals), hint: 'Salieron de las cuentas; no son gasto' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border bg-card p-3 sm:p-4">
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="text-lg font-bold sm:text-xl">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {/* Gastos del mes */}
            <div className="rounded-xl border bg-card p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold">Gastos y salidas del mes</h2>
              <p className="mb-4 text-xs text-muted-foreground">Todo lo que salió de las cuentas. Solo lo marcado «Sí» baja la utilidad.</p>
              <div className="divide-y text-sm">
                {fixedConfig && s.fixedExpenses > 0 && (
                  <div className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p className="font-medium">Gastos fijos (Configuración)</p>
                      <p className="text-xs text-muted-foreground">
                        Arriendo {formatPrice(fixedConfig.arriendo_cents)} · Sueldo {formatPrice(fixedConfig.sueldo_cents)} · Servicios {formatPrice(fixedConfig.servicios_cents)} · Otros {formatPrice(fixedConfig.otros_gastos_cents)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{formatPrice(s.fixedExpenses)}</p>
                      <p className="text-xs text-muted-foreground">Sí</p>
                    </div>
                  </div>
                )}
                {s.expenseLines.length === 0 && s.fixedExpenses === 0 ? (
                  <p className="py-2 text-muted-foreground">No hay gastos registrados en este mes.</p>
                ) : (
                  s.expenseLines.map((l) => (
                    <div key={l.category} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <p className="font-medium">{l.category}</p>
                        <p className="text-xs text-muted-foreground">{EXPENSE_CLASS_LABEL[l.cls]}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums">{formatPrice(l.amount_cents)}</p>
                        <p className={`text-xs ${l.counted ? 'text-muted-foreground' : 'text-amber-600'}`}>{reasonNotCounted(l)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Metas */}
            <div className="rounded-xl border bg-card p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold">¿Cuánto hay que vender?</h2>
              <p className="mb-4 text-xs text-muted-foreground">Con el margen bruto de este mes ({formatPct(s.grossMargin)}) y sus gastos ({formatPrice(totalExpenses)}).</p>
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Para no perder (punto de equilibrio)</p>
                    <p className="text-xs text-muted-foreground">Gastos ÷ margen bruto</p>
                  </div>
                  <p className="text-right tabular-nums">{s.breakEvenSales === null ? '—' : formatPrice(s.breakEvenSales)}</p>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Por día</p>
                    <p className="text-xs text-muted-foreground">÷ {s.openDays} días (los «días del mes» de Comisiones y Gastos Fijos)</p>
                  </div>
                  <p className="text-right tabular-nums">{s.breakEvenDaily === null ? '—' : formatPrice(s.breakEvenDaily)}</p>
                </div>
                {s.projectedNetSales !== null && (
                  <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 p-2">
                    <div>
                      <p className="font-medium">Ventas al ritmo actual <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Estimado</span></p>
                      <p className="text-xs text-muted-foreground">Ventas hasta hoy ÷ {data.current.daysElapsed} días × {data.current.daysInMonth}</p>
                    </div>
                    <p className="text-right tabular-nums">{formatPrice(s.projectedNetSales)}</p>
                  </div>
                )}
                <div className="border-t pt-3">
                  <label htmlFor="target-profit" className="font-medium">Utilidad que quiero ganar en el mes</label>
                  <MoneyInput id="target-profit" placeholder="Ej: 3.000.000" value={target} onChange={setTarget} className="mt-2 rounded-lg touch:h-11" />
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Ventas necesarias</p>
                      <p className="text-xs text-muted-foreground">(Gastos + utilidad deseada) ÷ margen bruto</p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p>{salesForTarget === null ? '—' : formatPrice(salesForTarget)}</p>
                      {salesForTarget !== null && <p className="text-xs text-muted-foreground">{formatPrice(salesForTarget / s.openDays)} por día</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
