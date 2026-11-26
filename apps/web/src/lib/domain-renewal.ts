// Aviso de renovación del dominio propio (pedido del usuario 2026-11-26).
// El dominio se compró en Vercel con renovación automática anual: se cobra a la
// tarjeta registrada en la cuenta de Vercel. Unos días antes, el panel avisa
// para revisar que la tarjeta esté vigente. Configuración en BRAND.domainRenewal.

/** Días de anticipación con que aparece el aviso. */
export const DIAS_AVISO_RENOVACION = 5

/**
 * Días que faltan, desde `hoy` (YYYY-MM-DD, fecha de Bogotá), hasta la próxima
 * renovación anual en `mesDia` (MM-DD). 0 = hoy se renueva.
 */
export function diasParaRenovacion(hoy: string, mesDia: string): number {
  const [y, m, d] = hoy.split('-').map(Number)
  const [rm, rd] = mesDia.split('-').map(Number)
  const hoyUtc = Date.UTC(y, m - 1, d)
  let renov = Date.UTC(y, rm - 1, rd)
  if (renov < hoyUtc) renov = Date.UTC(y + 1, rm - 1, rd)
  return Math.round((renov - hoyUtc) / 86_400_000)
}

/** true si hoy toca mostrar el aviso (de 5 días antes hasta el día de la renovación). */
export function debeAvisarRenovacion(hoy: string, mesDia: string): boolean {
  return diasParaRenovacion(hoy, mesDia) <= DIAS_AVISO_RENOVACION
}
