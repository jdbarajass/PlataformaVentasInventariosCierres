'use client'

import { useEffect, useMemo } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { bogotaDateStr } from '@/lib/bogota-time'

// Detalle de lo que ya llegó y lo que falta por llegar de un medio de pago
// con desembolso diferido (SisteCrédito, Addi, Datáfono) — se abre al darle
// click a la tarjeta de la cuenta en Cuentas → Resumen. Solo lectura: lee
// las mismas filas de *_pending_releases que ya usa la tarjeta, así que los
// totales de aquí y los de la tarjeta salen de la misma cuenta.

export type ReleaseKind = 'sistecredito' | 'addi' | 'datafono'

export interface ReleaseDetailRow {
  id: string
  sale_date: string
  release_date: string
  released_at: string | null
  base_cents: number
  margin_pct: number
  final_cents: number
  order_number: string | null
  customer_name: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  kind: ReleaseKind
  accountName: string
  accountColor: string | null
  balanceCents: number
  rows: ReleaseDetailRow[]
}

const KIND_RULE: Record<ReleaseKind, string> = {
  sistecredito:
    'SisteCrédito junta las ventas de cada mes y las paga el día 1 de dos meses después (ventas de octubre → 1 de diciembre), con el margen que se le cobra al cliente.',
  addi: 'Addi (plan de 7 días) paga cada venta 7 días después (9 si la venta fue sábado o domingo), sin descuento.',
  datafono: 'El datáfono consigna cada venta el siguiente día hábil (sin fines de semana ni festivos), completa.',
}

// Fechas DATE sin hora: se fija la medianoche local para que no se corra un día.
const asDate = (d: string) => new Date(d + 'T00:00:00')
const fmtDay = (d: string) => asDate(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtShort = (d: string) => asDate(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
const fmtMonth = (d: string) => asDate(d).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

const formatPrice = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

/** Primer día del mes, `monthsBack` meses antes de `today` (YYYY-MM-DD). */
function monthStart(today: string, monthsBack: number) {
  const [y, m] = today.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1))
  return d.toISOString().slice(0, 10)
}

interface Group {
  releaseDate: string
  rows: ReleaseDetailRow[]
  baseCents: number
  finalCents: number
}

function groupByRelease(rows: ReleaseDetailRow[], ascending: boolean): Group[] {
  const map = new Map<string, ReleaseDetailRow[]>()
  for (const r of rows) {
    const list = map.get(r.release_date) || []
    list.push(r)
    map.set(r.release_date, list)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (ascending ? (a < b ? -1 : 1) : a < b ? 1 : -1))
    .map(([releaseDate, list]) => ({
      releaseDate,
      rows: list.sort((a, b) => (a.sale_date < b.sale_date ? -1 : a.sale_date > b.sale_date ? 1 : 0)),
      baseCents: list.reduce((s, r) => s + r.base_cents, 0),
      finalCents: list.reduce((s, r) => s + r.final_cents, 0),
    }))
}

/** "Ventas de octubre de 2026" (SisteCrédito) o "Ventas del 3 nov" / "del 3 al 5 nov". */
function groupSalesLabel(kind: ReleaseKind, g: Group) {
  const first = g.rows[0]?.sale_date
  const last = g.rows[g.rows.length - 1]?.sale_date
  if (!first) return ''
  if (kind === 'sistecredito') {
    const firstMonth = first.slice(0, 7)
    const lastMonth = last.slice(0, 7)
    return firstMonth === lastMonth
      ? `Ventas de ${fmtMonth(first)}`
      : `Ventas de ${fmtMonth(first)} a ${fmtMonth(last)}`
  }
  return first === last ? `Ventas del ${fmtShort(first)}` : `Ventas del ${fmtShort(first)} al ${fmtShort(last)}`
}

export function ReleaseDetailDialog({ open, onClose, kind, accountName, accountColor, balanceCents, rows }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const today = bogotaDateStr(new Date())
  // "Ya llegó": lo liberado desde el día 1 de hace dos meses (hoy 9-nov →
  // desde el 1-sep), suficiente para cuadrar el ciclo de SisteCrédito.
  const receivedSince = monthStart(today, 2)

  const { pendingGroups, receivedGroups, pendingTotal, pendingBase, receivedTotal, overdueTotal } = useMemo(() => {
    const pending = rows.filter((r) => !r.released_at)
    const received = rows.filter((r) => r.released_at && r.release_date >= receivedSince)
    return {
      pendingGroups: groupByRelease(pending, true),
      receivedGroups: groupByRelease(received, false),
      pendingTotal: pending.reduce((s, r) => s + r.final_cents, 0),
      pendingBase: pending.reduce((s, r) => s + r.base_cents, 0),
      receivedTotal: received.reduce((s, r) => s + r.final_cents, 0),
      overdueTotal: pending.filter((r) => r.release_date < today).reduce((s, r) => s + r.final_cents, 0),
    }
  }, [rows, receivedSince, today])

  if (!open) return null

  const hasMargin = kind === 'sistecredito'

  const renderGroup = (g: Group, received: boolean) => {
    const overdue = !received && g.releaseDate < today
    const marginCents = g.finalCents - g.baseCents
    return (
      <details
        key={g.releaseDate}
        open={!received}
        className="group rounded-lg border [&_summary::-webkit-details-marker]:hidden"
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-2.5 touch:py-3">
          <div className="flex min-w-0 items-start gap-2">
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            <div className="min-w-0">
              <p className={cn('text-sm font-medium', overdue && 'text-amber-600')}>
                {received ? 'Llegó el ' : overdue ? 'Atrasado — debía llegar el ' : 'Llega el '}
                {fmtDay(g.releaseDate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {groupSalesLabel(kind, g)} · {g.rows.length} {g.rows.length === 1 ? 'venta' : 'ventas'}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn('text-sm font-bold tabular-nums', received ? 'text-green-600' : 'text-blue-600')}>
              {formatPrice(g.finalCents)}
            </p>
            {hasMargin && marginCents > 0 && (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatPrice(g.baseCents)} + {formatPrice(marginCents)} margen
              </p>
            )}
          </div>
        </summary>
        <ul className="divide-y border-t">
          {g.rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 pl-9 text-xs">
              <div className="min-w-0">
                <p className="font-medium">{fmtShort(r.sale_date)}{r.order_number ? ` · ${r.order_number}` : ''}</p>
                {r.customer_name && <p className="truncate text-muted-foreground">{r.customer_name}</p>}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="font-medium">{formatPrice(r.final_cents)}</p>
                {hasMargin && r.margin_pct > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {formatPrice(r.base_cents)} + {r.margin_pct}%
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>
    )
  }

  return (
    // < sm: hoja inferior con scroll propio; sm+: diálogo centrado (mismo patrón que Ventas por día).
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-desembolsos-titulo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl border bg-card p-4 pb-6 animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none sm:max-h-[90vh] sm:rounded-xl sm:p-6 sm:animate-none"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: accountColor || '#94a3b8' }} />
            <h2 id="detalle-desembolsos-titulo" className="truncate text-lg font-semibold">
              {accountName}
            </h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Cerrar detalle" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mb-1 text-sm font-medium">Lo que ya llegó y lo que falta por llegar</p>
        <p className="mb-4 text-xs text-muted-foreground">{KIND_RULE[kind]}</p>

        {/* Cuadre: saldo real + por llegar = total esperado (lo mismo que dice la tarjeta). */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Ya llegó (desde {fmtShort(receivedSince)})</p>
            <p className="text-base font-bold tabular-nums text-green-600">{formatPrice(receivedTotal)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Falta por llegar</p>
            <p className="text-base font-bold tabular-nums text-blue-600">{formatPrice(pendingTotal)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Saldo real hoy</p>
            <p className="text-base font-bold tabular-nums">{formatPrice(balanceCents)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Total esperado</p>
            <p className="text-base font-bold tabular-nums text-amber-600">{formatPrice(balanceCents + pendingTotal)}</p>
          </div>
        </div>

        {overdueTotal > 0 && (
          <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Hay {formatPrice(overdueTotal)} que ya debían haber llegado y no se han liberado. Revisa que la tarea
            automática de desembolsos esté corriendo (CRON_SECRET en Vercel).
          </p>
        )}

        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Falta por llegar</h3>
            {hasMargin && pendingTotal > 0 && (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatPrice(pendingBase)} en ventas + {formatPrice(pendingTotal - pendingBase)} de margen
              </p>
            )}
          </div>
          {pendingGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No hay nada pendiente: todo lo vendido ya llegó.
            </p>
          ) : (
            <div className="space-y-2">{pendingGroups.map((g) => renderGroup(g, false))}</div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Ya llegó (desde el {fmtDay(receivedSince)})</h3>
          {receivedGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No ha llegado nada en este periodo.
            </p>
          ) : (
            <div className="space-y-2">{receivedGroups.map((g) => renderGroup(g, true))}</div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            El saldo real puede no coincidir con lo que ha llegado si de esta cuenta se ha sacado o pasado plata
            (transferencias, ajustes, gastos).
          </p>
        </section>
      </div>
    </div>
  )
}
