// Clasificación de las salidas de plata (docs/PLAN_CONTROL_FINANCIERO.md, Fase 1).
//
// No toda salida de plata es gasto del negocio. Cada categoría de
// operating_expenses cae en una clase, y la clase decide si resta de la
// utilidad. TODAS las salidas siguen descontándose de su cuenta (eso lo hace
// la BD al registrar el gasto, no se toca aquí): esta clasificación solo
// afecta los cálculos de utilidad.
//
// Fuente única: cualquier cálculo de utilidad (Historial Mensual, Reportes,
// Ventas del Día y las pantallas de Finanzas) debe usar utilityExpenseCents /
// countsInUtility en vez de sumar operating_expenses directamente.

export type ExpenseClass = 'operativo' | 'financiero' | 'inversion' | 'retiro'

export interface FixedMonthlyExpenses {
  arriendo_cents: number
  sueldo_cents: number
  servicios_cents: number
  otros_gastos_cents: number
  dias_mes?: number
}

const CATEGORY_CLASS: Record<string, ExpenseClass> = {
  'Gastos bancarios': 'financiero',
  'Inversión': 'inversion',
  'Retiro del dueño': 'retiro',
}

export const EXPENSE_CLASS_LABEL: Record<ExpenseClass, string> = {
  operativo: 'Gasto operativo',
  financiero: 'Gasto financiero',
  inversion: 'Inversión',
  retiro: 'Retiro del dueño',
}

/** Clase de una categoría. Las desconocidas (texto viejo o importado) cuentan como operativo. */
export function expenseClass(category: string | null | undefined): ExpenseClass {
  return CATEGORY_CLASS[(category || '').trim()] || 'operativo'
}

// Categorías que también existen como gasto fijo en Configuración →
// Comisiones y Gastos Fijos. Decisión del usuario (2026-11-05): si el gasto
// fijo está configurado, se cuenta SOLO como gasto fijo; el pago registrado
// en Ventas del Día / Presupuesto mueve la cuenta pero no se resta otra vez de
// la utilidad. Si el gasto fijo está en 0, el pago registrado sí cuenta (si
// no, ese gasto no se restaría en ningún lado).
const FIXED_FIELD_BY_CATEGORY: Record<string, keyof Omit<FixedMonthlyExpenses, 'dias_mes'>> = {
  Arriendo: 'arriendo_cents',
  Sueldo: 'sueldo_cents',
  Luz: 'servicios_cents',
  Servicios: 'servicios_cents',
}

/** true si el gasto ya está contado en los gastos fijos configurados. */
export function isCoveredByFixed(category: string | null | undefined, fixed: FixedMonthlyExpenses | null | undefined): boolean {
  const field = FIXED_FIELD_BY_CATEGORY[(category || '').trim()]
  if (!field || !fixed) return false
  return (fixed[field] || 0) > 0
}

/** true si el gasto resta de la utilidad. */
export function countsInUtility(category: string | null | undefined, fixed: FixedMonthlyExpenses | null | undefined): boolean {
  const cls = expenseClass(category)
  if (cls === 'inversion' || cls === 'retiro') return false
  return !isCoveredByFixed(category, fixed)
}

/** Suma de los gastos que restan de la utilidad. */
export function utilityExpenseCents(
  expenses: { amount_cents: number; category: string | null }[],
  fixed: FixedMonthlyExpenses | null | undefined
): number {
  return expenses.reduce((sum, e) => (countsInUtility(e.category, fixed) ? sum + e.amount_cents : sum), 0)
}

/** Total de gastos fijos configurados del mes (Arriendo + Sueldo + Servicios + Otros). */
export function fixedMonthlyTotalCents(fixed: FixedMonthlyExpenses | null | undefined): number {
  if (!fixed) return 0
  return (fixed.arriendo_cents || 0) + (fixed.sueldo_cents || 0) + (fixed.servicios_cents || 0) + (fixed.otros_gastos_cents || 0)
}

/**
 * Aviso corto para mostrar debajo del selector de categoría, o null si la
 * categoría resta de la utilidad normalmente.
 */
export function expenseCategoryNote(category: string | null | undefined, fixed?: FixedMonthlyExpenses | null): string | null {
  const cls = expenseClass(category)
  if (cls === 'retiro') return 'Retiro del dueño: sale de la cuenta, pero no es gasto del negocio (no baja la utilidad).'
  if (cls === 'inversion') return 'Inversión: sale de la cuenta, pero no baja la utilidad del mes (se usa por años).'
  if (fixed !== undefined && isCoveredByFixed(category, fixed)) {
    return 'Ya está en Gastos Fijos: sale de la cuenta, pero la utilidad usa el valor fijo y no lo resta otra vez.'
  }
  return null
}
