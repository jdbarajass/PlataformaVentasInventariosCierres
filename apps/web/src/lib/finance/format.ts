// Formato de cifras de las pantallas de Finanzas (pesos sin decimales).
export const formatPrice = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100))

export const formatPct = (r: number | null, digits = 1) => (r === null ? '—' : `${(r * 100).toFixed(digits)}%`)

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
