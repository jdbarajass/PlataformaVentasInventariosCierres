import { describe, it, expect } from 'vitest'
import {
  expenseClass,
  isCoveredByFixed,
  countsInUtility,
  utilityExpenseCents,
  fixedMonthlyTotalCents,
  expenseCategoryNote,
} from '@/lib/finance/expense-classes'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

const FIXED = { arriendo_cents: 100_000_00, sueldo_cents: 150_000_00, servicios_cents: 0, otros_gastos_cents: 5_000_00, dias_mes: 30 }

describe('expenseClass', () => {
  it('las categorías originales y desconocidas son operativo', () => {
    for (const c of ['Montado', 'Relleno Cascos', 'Devueltas de dinero', 'Sueldo', 'Arriendo', 'Luz', 'Otro', 'texto viejo', '', null]) {
      expect(expenseClass(c as any)).toBe('operativo')
    }
  })
  it('clasifica las nuevas', () => {
    expect(expenseClass('Gastos bancarios')).toBe('financiero')
    expect(expenseClass('Inversión')).toBe('inversion')
    expect(expenseClass('Retiro del dueño')).toBe('retiro')
  })
  it('las categorías originales siguen en la lista con el mismo nombre', () => {
    for (const c of ['Montado', 'Relleno Cascos', 'Devueltas de dinero', 'Sueldo', 'Arriendo', 'Luz', 'Otro']) {
      expect(EXPENSE_CATEGORIES).toContain(c)
    }
  })
})

describe('gastos fijos (sin doble conteo)', () => {
  it('Arriendo y Sueldo configurados no se restan otra vez', () => {
    expect(isCoveredByFixed('Arriendo', FIXED)).toBe(true)
    expect(isCoveredByFixed('Sueldo', FIXED)).toBe(true)
    expect(countsInUtility('Arriendo', FIXED)).toBe(false)
  })
  it('Luz/Servicios en 0 en Configuración sí cuentan', () => {
    expect(isCoveredByFixed('Luz', FIXED)).toBe(false)
    expect(countsInUtility('Luz', FIXED)).toBe(true)
    expect(countsInUtility('Servicios', FIXED)).toBe(true)
  })
  it('sin configuración, todo lo operativo cuenta', () => {
    expect(countsInUtility('Arriendo', null)).toBe(true)
  })
  it('total de gastos fijos', () => {
    expect(fixedMonthlyTotalCents(FIXED)).toBe(255_000_00)
    expect(fixedMonthlyTotalCents(null)).toBe(0)
  })
})

describe('utilityExpenseCents', () => {
  it('excluye retiros, inversiones y lo cubierto por gastos fijos', () => {
    const expenses = [
      { amount_cents: 1_000_00, category: 'Otro' },
      { amount_cents: 2_000_00, category: 'Gastos bancarios' },
      { amount_cents: 100_000_00, category: 'Arriendo' },
      { amount_cents: 50_000_00, category: 'Retiro del dueño' },
      { amount_cents: 30_000_00, category: 'Inversión' },
      { amount_cents: 4_000_00, category: 'Luz' },
    ]
    expect(utilityExpenseCents(expenses, FIXED)).toBe(1_000_00 + 2_000_00 + 4_000_00)
    expect(utilityExpenseCents([], FIXED)).toBe(0)
  })
})

describe('expenseCategoryNote', () => {
  it('avisa en retiro, inversión y gasto fijo cubierto', () => {
    expect(expenseCategoryNote('Retiro del dueño')).toMatch(/no baja la utilidad/)
    expect(expenseCategoryNote('Inversión')).toMatch(/no baja la utilidad/)
    expect(expenseCategoryNote('Arriendo', FIXED)).toMatch(/Gastos Fijos/)
    expect(expenseCategoryNote('Arriendo')).toBeNull()
    expect(expenseCategoryNote('Otro', FIXED)).toBeNull()
  })
})
