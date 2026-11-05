'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLatestRequest } from '@/lib/use-latest-request'
import { formatPrice, MONTH_NAMES } from '@/lib/finance/format'
import { FLOW_CONCEPT_LABEL, type CashFlow, type Payables, type Receivables } from '@/lib/finance/cash-flow'
import { ExportButtons } from '@/components/finanzas/export-buttons'
import { cashFlowReport } from '@/lib/finance/report-builders'
import { BRAND } from '@/config/brand'

// Finanzas → Flujo de caja (docs/PLAN_CONTROL_FINANCIERO.md, Fase 5). Todo
// el cálculo vive en lib/finance/cash-flow.ts y lo hace /api/finance/cash-flow.

interface CashFlowResponse {
  year: number
  month: number
  today: string
  isCurrentMonth: boolean
  flow: CashFlow
  netProfit: number
  receivables: Receivables
  payables: Payables
  available: number
  withdrawable: { value: number; shortfall: number; reserveSuppliers: number; reserveFixed: number }
}

const METHOD_LABEL: Record<string, string> = { datafono: 'Datáfono', addi: 'Addi', sistecredito: 'SisteCrédito' }
const STATUS_LABEL = { vencida: 'Vencida', proxima: 'Vence pronto', despues: 'Más adelante', sin_fecha: 'Sin fecha' } as const
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function Row({ label, value, hint, strong, tone }: { label: string; value: number; hint?: string; strong?: boolean; tone?: 'auto' }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-2 ${strong ? 'font-semibold' : ''}`}>
      <div>
        <p>{label}</p>
        {hint && <p className="text-xs font-normal text-muted-foreground">{hint}</p>}
      </div>
      <p className={`shrink-0 tabular-nums ${tone === 'auto' && value < 0 ? 'text-red-500' : tone === 'auto' && value > 0 ? 'text-green-600 dark:text-green-500' : ''}`}>
        {tone === 'auto' && value > 0 ? '+' : ''}{formatPrice(value)}
      </p>
    </div>
  )
}

export function CashFlowView({ year, month, accessToken }: { year: number; month: number; accessToken: string | undefined }) {
  const [data, setData] = useState<CashFlowResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const beginRequest = useLatestRequest()

  const fetchData = useCallback(async () => {
    if (!accessToken) return
    const isStale = beginRequest()
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/cash-flow?year=${year}&month=${month}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (isStale()) return
      if (!res.ok) {
        setLoadError(json?.error || 'No se pudo calcular el flujo de caja.')
        return
      }
      setData(json.data)
    } catch (error) {
      console.error('Error loading cash flow:', error)
      if (!isStale()) setLoadError('No se pudo calcular el flujo de caja. Intenta de nuevo.')
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

  const { flow, receivables: rc, payables: pay, withdrawable: w } = data
  const monthName = MONTH_NAMES[data.month - 1].toLowerCase()
  const atrasado = rc.porLlegar.atrasado_cents

  return (
    <div className={`space-y-6 sm:space-y-8 ${loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={loading}>
      <div className="flex justify-end">
        <ExportButtons getDoc={() => cashFlowReport(data, BRAND.name)} disabled={loading} />
      </div>
      {atrasado > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          Hay {formatPrice(atrasado)} de Addi / datáfono / SisteCrédito que ya debió llegar a las cuentas y no se ha aplicado. Lo aplica la tarea automática de cada día, que no corre mientras falte CRON_SECRET en Vercel.
        </p>
      )}

      {/* Tarjetas: foto de hoy */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Plata en las cuentas hoy</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.available)}</p>
          <p className="text-xs text-muted-foreground">Saldo real de las cuentas activas</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Se puede retirar <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Estimado</span></p>
          <p className={`text-lg font-bold sm:text-2xl ${w.value > 0 ? 'text-green-600 dark:text-green-500' : ''}`}>{formatPrice(w.value)}</p>
          <p className="text-xs text-muted-foreground">{w.shortfall > 0 ? `Faltan ${formatPrice(w.shortfall)} para cubrir lo de abajo` : 'Sin dejar corta la operación (ver detalle)'}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Nos deben / por llegar</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(rc.total)}</p>
          <p className="text-xs text-muted-foreground">Fiado, por cobrar y ventas por llegar</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Debemos a proveedores</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(pay.total)}</p>
          <p className={`text-xs ${pay.vencido > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{pay.vencido > 0 ? `${formatPrice(pay.vencido)} vencido` : 'Nada vencido'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Flujo del mes */}
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Flujo de caja de {monthName} {data.year}</h2>
          <p className="mb-2 text-xs text-muted-foreground">Plata que de verdad entró y salió de las cuentas{data.isCurrentMonth ? ' (mes en curso, hasta hoy)' : ''}.</p>
          <div className="divide-y text-sm">
            <Row label="Saldo al iniciar el mes" value={flow.opening} strong />
            {flow.concepts.length === 0 && <p className="py-2 text-muted-foreground">No hubo movimientos en este mes.</p>}
            {flow.concepts.map((c) => (
              <Row key={c.concept} label={FLOW_CONCEPT_LABEL[c.concept]} value={c.net} tone="auto" />
            ))}
            <Row label={data.isCurrentMonth ? 'Saldo hoy' : 'Saldo al cerrar el mes'} value={flow.closing} strong hint={`Flujo neto del mes: ${flow.netFlow >= 0 ? '+' : ''}${formatPrice(flow.netFlow)}`} />
          </div>
          {flow.transfersMoved > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Además se movieron {formatPrice(flow.transfersMoved)} entre cuentas propias: no es entrada ni salida.</p>
          )}
        </div>

        {/* Utilidad vs plata + retiro */}
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
            <h2 className="mb-2 text-lg font-semibold">Utilidad vs. plata</h2>
            <div className="divide-y">
              <Row label={`Utilidad neta de ${monthName}`} value={data.netProfit} tone="auto" hint="Del estado de resultados (pestaña Mes)" />
              <Row label={`Flujo de caja de ${monthName}`} value={flow.netFlow} tone="auto" hint="Cuánto cambió la plata en las cuentas" />
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              No tienen por qué coincidir: la utilidad cuenta el costo de lo vendido y los gastos fijos completos; la plata cuenta lo que se le pagó a proveedores, los retiros y lo que todavía no ha llegado (Addi, datáfono, SisteCrédito, fiado).
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
            <h2 className="mb-2 text-lg font-semibold">¿Cuánto puedo retirar?</h2>
            <div className="divide-y">
              <Row label="Plata en las cuentas hoy" value={data.available} />
              <Row label="− Proveedores: vencido, sin fecha y lo que vence en 30 días" value={-w.reserveSuppliers} />
              <Row label="− Un mes de gastos fijos" value={-w.reserveFixed} hint="Arriendo, sueldo, servicios y otros de Configuración" />
              <Row label="= Se puede retirar (estimado)" value={w.value} strong />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Lo que está por llegar ({formatPrice(rc.porLlegar.cents)}) y el fiado no se cuentan hasta que entren. Retirar es plata del negocio que sale: regístralo en Gastos como «Retiro del dueño».</p>
          </div>
        </div>
      </div>

      {/* Por cuenta */}
      <div className="rounded-xl border bg-card">
        <h2 className="p-4 pb-2 text-lg font-semibold sm:px-6">Por cuenta en {monthName}</h2>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium sm:pl-6">Cuenta</th>
                <th className="px-3 py-2 text-right font-medium">Al iniciar</th>
                <th className="px-3 py-2 text-right font-medium">Entró</th>
                <th className="px-3 py-2 text-right font-medium">Salió</th>
                <th className="px-4 py-2 text-right font-medium sm:pr-6">{data.isCurrentMonth ? 'Hoy' : 'Al cerrar'}</th>
              </tr>
            </thead>
            <tbody>
              {flow.accounts.filter((a) => a.active || a.opening || a.closing || a.inflows || a.outflows).map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-2 sm:pl-6">{a.name}{!a.active && <span className="ml-1 text-xs text-muted-foreground">(inactiva)</span>}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(a.opening)}</td>
                  <td className="px-3 py-2 text-right text-green-600 dark:text-green-500">{a.inflows ? `+${formatPrice(a.inflows)}` : '—'}</td>
                  <td className="px-3 py-2 text-right text-red-500">{a.outflows ? `−${formatPrice(a.outflows)}` : '—'}</td>
                  <td className={`px-4 py-2 text-right font-medium sm:pr-6 ${a.closing < 0 ? 'text-red-500' : ''}`}>{formatPrice(a.closing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-semibold">
              <tr>
                <td className="px-4 py-2 sm:pl-6">Total</td>
                <td className="px-3 py-2 text-right">{formatPrice(flow.opening)}</td>
                <td colSpan={2} />
                <td className="px-4 py-2 text-right sm:pr-6">{formatPrice(flow.closing)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 pb-3 text-xs text-muted-foreground sm:px-6">Entró y salió incluyen los traslados entre cuentas propias.</p>
        </div>
        <div className="divide-y px-4 pb-2 md:hidden">
          {flow.accounts.filter((a) => a.active || a.opening || a.closing || a.inflows || a.outflows).map((a) => (
            <div key={a.id} className="py-3 text-sm">
              <div className="flex justify-between gap-2"><p className="font-medium">{a.name}</p><p className="font-semibold tabular-nums">{formatPrice(a.closing)}</p></div>
              <p className="text-xs text-muted-foreground tabular-nums">Inició {formatPrice(a.opening)} · entró {formatPrice(a.inflows)} · salió {formatPrice(a.outflows)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Por cobrar */}
        <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
          <h2 className="mb-2 text-lg font-semibold">Nos deben y por llegar (hoy)</h2>
          <div className="divide-y">
            <Row label={`Fiado (${rc.fiado.count} ${rc.fiado.count === 1 ? 'cliente' : 'clientes'})`} value={rc.fiado.cents} hint="Saldo pendiente de Apartados y Abonos" />
            <Row label={`Por cobrar (${rc.porCobrar.count})`} value={rc.porCobrar.cents} hint="Cuentas → Por Cobrar" />
            {rc.porLlegar.byMethod.map((m) => (
              <Row
                key={m.method}
                label={`${METHOD_LABEL[m.method] || m.method} por llegar`}
                value={m.cents}
                hint={[m.next_date ? `próximo pago ${fmtDate(m.next_date)}` : null, m.atrasado_cents ? `${formatPrice(m.atrasado_cents)} ya debió llegar` : null].filter(Boolean).join(' · ') || undefined}
              />
            ))}
            <Row label="Total" value={rc.total} strong />
          </div>
        </div>

        {/* Por pagar */}
        <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
          <h2 className="mb-2 text-lg font-semibold">Debemos a proveedores (hoy)</h2>
          {pay.invoices.length === 0 ? (
            <p className="text-muted-foreground">No hay facturas pendientes.</p>
          ) : (
            <>
              <ol className="divide-y">
                {pay.invoices.map((i, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 font-medium" title={`${i.supplier} — ${i.description}`}>{i.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.supplier} ·{' '}
                        <span className={i.status === 'vencida' ? 'text-red-500' : i.status === 'proxima' ? 'text-amber-600' : ''}>
                          {STATUS_LABEL[i.status]}
                          {i.days_to_due !== null && (i.days_to_due < 0 ? ` hace ${-i.days_to_due} días` : ` en ${i.days_to_due} días`)}
                        </span>
                      </p>
                    </div>
                    <p className="shrink-0 tabular-nums">{formatPrice(i.balance_cents)}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-2 border-t pt-2"><Row label="Total por pagar" value={pay.total} strong /></div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
