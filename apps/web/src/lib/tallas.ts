// Orden de tallas de menor a mayor — regla única para todo el sistema
// (Inventario, Registrar Venta, Cambios, Préstamos, Calculadora, tienda
// online, exportes). Antes cada lista salía ordenada como texto
// (`order('talla')` / `.sort()`), lo que daba 2XL, L, M, S, XL, XS.
//
// Grupos, en este orden:
//   1. Tallas de letra: XXS, XS, S, M, L, XL, 2XL, 3XL, ... (acepta "XXL",
//      "XXXL" y el prefijo "Talla " que traen algunas variantes viejas).
//   2. Tallas numéricas (38, 40, 42.5...), de menor a mayor.
//   3. Cualquier otro texto, alfabético.
//   4. Sin talla / "N/A", al final.

const LETRAS: Record<string, number> = { XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5 }

function rangoTalla(talla: string | null | undefined): [number, number, string] {
  const t = (talla || '').trim().toUpperCase().replace(/^TALLA\s+/, '')
  if (!t || t === 'N/A' || t === 'NA') return [3, 0, '']

  if (t in LETRAS) return [0, LETRAS[t], '']
  if (t === '2XS') return [0, LETRAS.XXS, '']
  // 2XL, 3XL... y sus equivalentes XXL, XXXL...
  const multiXL = t.match(/^(\d+)XL$/)
  if (multiXL) return [0, LETRAS.XL + parseInt(multiXL[1], 10) - 1, '']
  const xsXL = t.match(/^(X{2,})L$/)
  if (xsXL) return [0, LETRAS.XL + xsXL[1].length - 1, '']

  const num = Number(t.replace(',', '.'))
  if (Number.isFinite(num)) return [1, num, '']

  return [2, 0, t]
}

export function compararTallas(a: string | null | undefined, b: string | null | undefined): number {
  const [ga, va, sa] = rangoTalla(a)
  const [gb, vb, sb] = rangoTalla(b)
  return ga - gb || va - vb || sa.localeCompare(sb)
}

// Devuelve una copia ordenada (no muta el arreglo original).
export function ordenarPorTalla<T extends { talla?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => compararTallas(a.talla, b.talla))
}
