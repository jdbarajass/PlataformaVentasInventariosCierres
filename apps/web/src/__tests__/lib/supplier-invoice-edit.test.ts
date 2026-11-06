import { describe, it, expect } from 'vitest'
import { applyInvoiceAmountChange } from '@/lib/supplier-invoice-edit'

const P = (pesos: number) => pesos * 100
const TODAY = '2026-11-06'

describe('applyInvoiceAmountChange', () => {
  it('pendiente sin abonos: baja el total y sigue pendiente', () => {
    expect(applyInvoiceAmountChange({ amount_cents: P(1_736_948), status: 'pending', paid_at: null, payments: [] }, P(1_500_000), TODAY))
      .toEqual({ ok: true, paid_cents: 0, status: 'pending', paid_at: null })
  })
  it('no deja bajar el total por debajo de lo abonado', () => {
    const r = applyInvoiceAmountChange({ amount_cents: P(1_000_000), status: 'pending', paid_at: null, payments: [{ amount_cents: P(600_000) }] }, P(500_000), TODAY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/600\.000/)
  })
  it('si los abonos ya cubren el nuevo total, queda pagada hoy', () => {
    expect(applyInvoiceAmountChange({ amount_cents: P(1_000_000), status: 'pending', paid_at: null, payments: [{ amount_cents: P(800_000) }] }, P(800_000), TODAY))
      .toEqual({ ok: true, paid_cents: P(800_000), status: 'paid', paid_at: TODAY })
  })
  it('una pagada a la que se le sube el total vuelve a pendiente', () => {
    expect(applyInvoiceAmountChange({ amount_cents: P(500_000), status: 'paid', paid_at: '2026-10-01', payments: [{ amount_cents: P(500_000) }] }, P(700_000), TODAY))
      .toEqual({ ok: true, paid_cents: P(500_000), status: 'pending', paid_at: null })
  })
  it('una pagada sigue pagada con su fecha si el total baja', () => {
    expect(applyInvoiceAmountChange({ amount_cents: P(500_000), status: 'paid', paid_at: '2026-10-01', payments: [{ amount_cents: P(500_000) }] }, P(400_000), TODAY))
      .toMatchObject({ ok: false }) // 400.000 < 500.000 abonado
    expect(applyInvoiceAmountChange({ amount_cents: P(600_000), status: 'paid', paid_at: '2026-10-01', payments: [{ amount_cents: P(500_000) }, { amount_cents: P(100_000) }] }, P(600_000), TODAY))
      .toEqual({ ok: true, paid_cents: P(600_000), status: 'paid', paid_at: '2026-10-01' })
  })
  it('pagada por fuera del sistema (sin abonos) se queda pagada', () => {
    expect(applyInvoiceAmountChange({ amount_cents: P(2_000_000), status: 'paid', paid_at: null, payments: [] }, P(1_900_000), TODAY))
      .toEqual({ ok: true, paid_cents: 0, status: 'paid', paid_at: null })
  })
})
