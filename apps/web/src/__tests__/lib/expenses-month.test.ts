import { describe, it, expect } from 'vitest'
import { buildExpensesMonth, filterExpenseRows } from '@/lib/finance/expenses-month'

const P = (pesos: number) => pesos * 100
const FIXED = { arriendo_cents: P(1_000_000), sueldo_cents: P(1_500_000), servicios_cents: P(200_000), otros_gastos_cents: P(50_000), dias_mes: 30 }
const e = (id: string, date: string, category: string, pesos: number, account_id: string | null = 'efe', description = id) => ({
  id, date, description, amount_cents: P(pesos), category, account_id,
})

const m = buildExpensesMonth({
  fixed: FIXED,
  accounts: [{ id: 'efe', name: 'Efectivo' }, { id: 'qr', name: 'QR' }],
  expenses: [
    e('arr', '2026-10-05', 'Arriendo', 1_000_000, 'qr', 'Arriendo octubre'),
    e('sue1', '2026-10-15', 'Sueldo', 750_000),
    e('luz', '2026-10-02', 'Luz', 80_000),
    e('ret', '2026-10-20', 'Retiro del dueño', 300_000),
    e('mont', '2026-10-21', 'Montado', 20_000, null, 'montaje de casco'),
    e('viejo', '2026-10-22', 'Categoría vieja', 5_000, 'borrada'),
  ],
})

describe('buildExpensesMonth', () => {
  it('ordena por fecha y marca si resta utilidad', () => {
    expect(m.rows.map((r) => r.id)).toEqual(['luz', 'arr', 'sue1', 'ret', 'mont', 'viejo'])
    const byId = Object.fromEntries(m.rows.map((r) => [r.id, r]))
    expect(byId.arr).toMatchObject({ counted: false, coveredByFixed: true, account_name: 'QR' })
    expect(byId.ret).toMatchObject({ cls: 'retiro', counted: false, coveredByFixed: false })
    expect(byId.mont).toMatchObject({ counted: true, account_name: null })
    expect(byId.viejo).toMatchObject({ cls: 'operativo', account_name: 'Cuenta borrada' })
  })

  it('totales del mes', () => {
    expect(m.totals).toEqual({ out: P(2_155_000), counted: P(25_000), notCounted: P(2_130_000), count: 6 })
    expect(m.byCategory[0]).toMatchObject({ category: 'Arriendo', cents: P(1_000_000) })
    expect(m.byAccount.find((a) => a.account === 'Sin cuenta')!.cents).toBe(P(20_000))
  })

  it('estado de los gastos fijos', () => {
    const st = Object.fromEntries(m.fixed.items.map((i) => [i.key, i.status]))
    expect(st).toEqual({ arriendo: 'pagado', sueldo: 'parcial', servicios: 'parcial', otros: 'sin_seguimiento' })
    expect(m.fixed.configuredTotal).toBe(P(2_750_000))
    const sinConfig = buildExpensesMonth({ fixed: null, accounts: [], expenses: [] })
    expect(sinConfig.fixed.items.every((i) => i.status === 'sin_valor')).toBe(true)
    const pendiente = buildExpensesMonth({ fixed: FIXED, accounts: [], expenses: [] })
    expect(pendiente.fixed.items[0].status).toBe('pendiente')
  })
})

describe('filterExpenseRows', () => {
  const base = { search: '', account: '', category: '', cls: '' as const, from: '', to: '' }
  it('busca, filtra por cuenta, categoría, tipo y fechas', () => {
    expect(filterExpenseRows(m.rows, { ...base, search: 'casco' }).map((r) => r.id)).toEqual(['mont'])
    expect(filterExpenseRows(m.rows, { ...base, account: 'qr' }).map((r) => r.id)).toEqual(['arr'])
    expect(filterExpenseRows(m.rows, { ...base, account: '__none__' }).map((r) => r.id)).toEqual(['mont'])
    expect(filterExpenseRows(m.rows, { ...base, cls: 'resta' }).map((r) => r.id)).toEqual(['mont', 'viejo'])
    expect(filterExpenseRows(m.rows, { ...base, cls: 'retiro' }).map((r) => r.id)).toEqual(['ret'])
    expect(filterExpenseRows(m.rows, { ...base, from: '2026-10-15', to: '2026-10-20' }).map((r) => r.id)).toEqual(['sue1', 'ret'])
  })
})
