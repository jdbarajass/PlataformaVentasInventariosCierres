// Categorías cerradas de gasto operativo / presupuesto — igual que el
// software local (models/gasto_dia.py: CATEGORIAS_GASTO), que restringe la
// categoría a esta lista fija para evitar "gastos huérfanos" (un gasto que
// no coincide con ninguna categoría presupuestada por un simple error de
// tipeo, ya que antes era texto libre en la nube).
//
// Las 7 primeras son las originales. Las demás se agregaron con el plan de
// control financiero (docs/PLAN_CONTROL_FINANCIERO.md, Fase 1) para poder
// separar lo que NO es gasto del negocio (inversión, retiro del dueño) y lo
// financiero. Cada categoría tiene su clase en lib/finance/expense-classes.ts
// — si se agrega una categoría aquí, revisar su clase allá (por defecto cae en
// "operativo"). Los nombres se guardan tal cual en operating_expenses.category
// y monthly_budgets.category: NO renombrar una categoría existente.
//
// La compra de mercancía NO es una categoría a propósito: se registra en
// Facturas (decisión del usuario, 2026-11-05).
//
// 2026-11-21 (pedido del usuario): "Gastos bancarios" se renombró a
// GMF_CATEGORY (migración 00064, que también cambió los gastos y
// presupuestos guardados). El nombre viejo sigue contando como financiero
// (LEGACY_GMF_CATEGORY), por si llega de un Excel anterior. Se agregó
// "Gasto operativo" (clase operativo).

/** Categoría del 4x1000 automático (y de cuota de manejo, intereses…). */
export const GMF_CATEGORY = '4X1000 impuestos (Gastos Bancarios)'
/** Nombre anterior de GMF_CATEGORY (antes de la migración 00064). */
export const LEGACY_GMF_CATEGORY = 'Gastos bancarios'

export const EXPENSE_CATEGORIES = [
  'Montado',
  'Relleno Cascos',
  'Devueltas de dinero',
  'Sueldo',
  'Arriendo',
  'Luz',
  'Servicios',
  'Transporte',
  'Publicidad',
  'Mantenimiento',
  'Gasto operativo',
  GMF_CATEGORY,
  'Inversión',
  'Retiro del dueño',
  'Otro',
] as const
