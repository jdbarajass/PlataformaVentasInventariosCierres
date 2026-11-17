'use client'

import { formatPrice } from '@/lib/finance/format'
import { accountPaysGmf, expenseGmfCents } from '@/lib/finance/gmf'

// Resumen del gasto antes de guardarlo (como KOAJ): subtotal (lo digitado),
// 4x1000 automático si la cuenta no es efectivo, y el total que sale de la
// cuenta. Se usa en Ventas del Día, Presupuesto y Finanzas → Gastos.
// Fórmula en lib/finance/gmf.ts (la misma que cobra la BD).
export function ExpenseGmfSummary({
  amountCents,
  paymentMethod,
  hasAccount,
  applyGmf,
  onApplyGmfChange,
}: {
  amountCents: number
  /** payment_method de la cuenta elegida (null si no hay cuenta). */
  paymentMethod: string | null | undefined
  hasAccount: boolean
  applyGmf: boolean
  onApplyGmfChange: (v: boolean) => void
}) {
  const pays = hasAccount && accountPaysGmf(paymentMethod)
  const gmf = hasAccount ? expenseGmfCents(amountCents, paymentMethod, applyGmf) : 0
  const total = amountCents + gmf

  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="rounded-lg bg-muted/60 px-3 py-2">
        <p className="text-xs text-muted-foreground">Subtotal</p>
        <p className="font-semibold tabular-nums">{formatPrice(amountCents)}</p>
      </div>
      <div className={`rounded-lg px-3 py-2 ${pays ? 'bg-amber-500/10' : 'bg-muted/60'}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs ${pays ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
            4x1000 {pays ? '(automático)' : !hasAccount ? '(sin cuenta)' : '(efectivo, no aplica)'}
          </p>
          {pays && (
            <label className="flex cursor-pointer items-center gap-1 text-xs text-amber-800 dark:text-amber-300">
              <input type="checkbox" checked={applyGmf} onChange={(e) => onApplyGmfChange(e.target.checked)} className="h-3.5 w-3.5 accent-amber-600" />
              cobrar
            </label>
          )}
        </div>
        <p className={`font-semibold tabular-nums ${pays ? 'text-amber-800 dark:text-amber-300' : ''}`}>{formatPrice(gmf)}</p>
      </div>
      <div className="rounded-lg bg-red-500/10 px-3 py-2">
        <p className="text-xs text-red-700 dark:text-red-400">{hasAccount ? 'Total que sale de la cuenta' : 'Total'}</p>
        <p className="font-semibold tabular-nums text-red-700 dark:text-red-400">{formatPrice(total)}</p>
      </div>
    </div>
  )
}

/** Desglose corto de un gasto ya guardado: "Subtotal $X + 4x1000 $Y". */
export function expenseBreakdown(e: { amount_cents: number; gmf_cents?: number | null }): string | null {
  const gmf = Number(e.gmf_cents || 0)
  if (gmf <= 0) return null
  return `Subtotal ${formatPrice(e.amount_cents)} + 4x1000 ${formatPrice(gmf)}`
}
