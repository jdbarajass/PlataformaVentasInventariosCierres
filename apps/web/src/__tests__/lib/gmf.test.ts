import { describe, it, expect } from 'vitest'
import { gmfOf, accountPaysGmf, expenseGmfCents } from '@/lib/finance/gmf'

// 4x1000 de los gastos (misma fórmula que record_operating_expense, migración 00061).
describe('4x1000 de los gastos', () => {
  it('es el 0,4 % del valor, redondeado al peso', () => {
    expect(gmfOf(5_000_000)).toBe(20_000) // $50.000 → $200
    expect(gmfOf(123_400)).toBe(500) // $1.234 → $4,936 → $5
    expect(gmfOf(0)).toBe(0)
  })

  it('solo lo paga una cuenta que no es efectivo', () => {
    expect(accountPaysGmf('cash')).toBe(false)
    expect(accountPaysGmf('nequi')).toBe(true)
    expect(accountPaysGmf('qr')).toBe(true)
    expect(accountPaysGmf(null)).toBe(false)
  })

  it('respeta la casilla "cobrar" y no cobra sin cuenta', () => {
    expect(expenseGmfCents(5_000_000, 'nequi', true)).toBe(20_000)
    expect(expenseGmfCents(5_000_000, 'nequi', false)).toBe(0)
    expect(expenseGmfCents(5_000_000, 'cash', true)).toBe(0)
    expect(expenseGmfCents(5_000_000, undefined, true)).toBe(0)
  })
})
