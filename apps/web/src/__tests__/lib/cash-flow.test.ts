import { describe, it, expect } from 'vitest'
import { buildCashFlow, buildReceivables, buildPayables, withdrawable, movementConcept } from '@/lib/finance/cash-flow'

const FROM = '2026-10-01T05:00:00.000Z'
const TO = '2026-11-01T05:00:00.000Z'
const mv = (account_id: string, type: string, amount_cents: number, created_at: string, extra: object = {}) => ({
  account_id, type, amount_cents, created_at, reference_type: null, ...extra,
})

describe('buildCashFlow', () => {
  const accounts = [
    { id: 'efe', name: 'Efectivo', balance_cents: 500, active: true },
    { id: 'qr', name: 'QR', balance_cents: 1_000, active: true },
  ]
  const movements = [
    mv('efe', 'sale', 800, '2026-10-02T15:00:00Z'),
    mv('efe', 'operating_expense', -100, '2026-10-03T15:00:00Z', { reference_type: 'operating_expense', expense_category: 'Arriendo' }),
    mv('efe', 'operating_expense', -200, '2026-10-04T15:00:00Z', { reference_type: 'operating_expense', expense_category: 'Retiro del dueño' }),
    mv('efe', 'transfer_out', -300, '2026-10-05T15:00:00Z'),
    mv('qr', 'transfer_in', 300, '2026-10-05T15:00:00Z'),
    mv('qr', 'invoice_payment', -400, '2026-10-06T15:00:00Z'),
    mv('qr', 'card_release', 250, '2026-10-07T15:00:00Z'),
    mv('efe', 'sale', 50, '2026-11-02T15:00:00Z'), // después del mes
  ]
  const f = buildCashFlow({ accounts, movements, fromISO: FROM, toISO: TO })

  it('saldo inicial y final por cuenta, reconstruidos desde el saldo de hoy', () => {
    const efe = f.accounts.find((a) => a.id === 'efe')!
    expect(efe.closing).toBe(450) // 500 − 50 de noviembre
    expect(efe.opening).toBe(450 - (800 - 100 - 200 - 300))
    expect(efe.inflows).toBe(800)
    expect(efe.outflows).toBe(600)
    expect(f.current).toBe(1_500)
  })

  it('conceptos; los traslados no son entrada ni salida', () => {
    const c = Object.fromEntries(f.concepts.map((x) => [x.concept, x.net]))
    expect(c).toEqual({ ventas: 800, liberaciones: 250, gastos: -100, proveedores: -400, retiros: -200 })
    expect(f.inflows).toBe(1_050)
    expect(f.outflows).toBe(700)
    expect(f.transfersMoved).toBe(300)
    expect(f.netFlow).toBe(f.closing - f.opening)
  })

  it('reversas', () => {
    expect(movementConcept({ type: 'expense_reversal', reference_type: 'supplier_invoice' })).toBe('proveedores')
    expect(movementConcept({ type: 'expense_reversal', reference_type: 'operating_expense', expense_category: 'Inversión' })).toBe('inversiones')
    expect(movementConcept({ type: 'manual_adjustment', reference_type: null })).toBe('ajustes')
  })
})

describe('por cobrar y por pagar', () => {
  it('fiado, por cobrar y plata por llegar (con lo atrasado aparte)', () => {
    const r = buildReceivables({
      credits: [{ total_amount_cents: 1_000, paid_cents: 400 }, { total_amount_cents: 500, paid_cents: 500 }],
      receivables: [{ amount_cents: 300 }],
      pending: {
        addi: [{ amount_cents: 200, release_date: '2026-11-01' }, { amount_cents: 100, release_date: '2026-12-01' }],
        datafono: [],
      },
      today: '2026-11-05',
    })
    expect(r.fiado).toEqual({ count: 1, cents: 600 })
    expect(r.porCobrar.cents).toBe(300)
    expect(r.porLlegar.byMethod).toEqual([{ method: 'addi', cents: 300, atrasado_cents: 200, next_date: '2026-12-01' }])
    expect(r.total).toBe(1_200)
  })

  it('facturas por vencimiento y retiro posible', () => {
    const p = buildPayables(
      [
        { supplier: 'A', description: 'x', balance_cents: 100, due_date: '2026-11-01' },
        { supplier: 'B', description: 'y', balance_cents: 200, due_date: '2026-11-20' },
        { supplier: 'C', description: 'z', balance_cents: 400, due_date: '2027-02-01' },
        { supplier: 'D', description: 'w', balance_cents: 50, due_date: null },
        { supplier: 'E', description: 'pagada', balance_cents: 0, due_date: null },
      ],
      '2026-11-05'
    )
    expect(p).toMatchObject({ total: 750, vencido: 100, next30: 200, later: 400, sinFecha: 50 })
    expect(p.invoices.map((i) => i.status)).toEqual(['vencida', 'proxima', 'despues', 'sin_fecha'])
    expect(withdrawable({ available: 1_000, payables: p, monthlyFixed: 300 })).toEqual({ value: 350, shortfall: 0, reserveSuppliers: 350, reserveFixed: 300 })
    expect(withdrawable({ available: 100, payables: p, monthlyFixed: 300 })).toMatchObject({ value: 0, shortfall: 550 })
  })
})
