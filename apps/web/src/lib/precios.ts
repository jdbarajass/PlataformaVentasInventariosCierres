// Precios de referencia a partir del costo — los usa la tabla de
// Catálogo → Productos (admin, en el navegador) y /api/products/pricing
// (vendedor, en el servidor, para que el costo nunca viaje a su navegador).

/** Venta a los locales vecinos ("al por mayor"): costo + 30%. */
export const MARKUP_MONTADO = 0.3

/** Opciones rápidas del % del precio mínimo al cliente (sobre el costo). */
export const OPCIONES_PCT_CLIENTE = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 100]

export function precioMontado(costCents: number): number {
  return Math.round(costCents * (1 + MARKUP_MONTADO))
}

/** Precio mínimo de venta al cliente final: costo × (1 + pct/100). */
export function precioMinimoCliente(costCents: number, pct: number): number {
  return Math.round(costCents * (1 + pct / 100))
}

export function rangoCostos(costs: number[]): { min: number; max: number } {
  return { min: Math.min(...costs), max: Math.max(...costs) }
}
