// Categorías cerradas de gasto operativo / presupuesto — igual que el
// software local (models/gasto_dia.py: CATEGORIAS_GASTO), que restringe la
// categoría a esta lista fija para evitar "gastos huérfanos" (un gasto que
// no coincide con ninguna categoría presupuestada por un simple error de
// tipeo, ya que antes era texto libre en la nube).
export const EXPENSE_CATEGORIES = [
  'Montado',
  'Relleno Cascos',
  'Devueltas de dinero',
  'Sueldo',
  'Arriendo',
  'Luz',
  'Otro',
] as const
