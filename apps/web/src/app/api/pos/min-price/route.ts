import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// Precios mínimos sugeridos a partir del costo — mismas fórmulas que la
// columna "Costo" de Productos (admin/productos/page.tsx) y el panel
// "Costo + Margen deseado" de la Calculadora:
//   - margen real 30% (sobre el precio de venta): costo / 0.7
//   - +30% sobre el costo (markup): costo * 1.3
//
// Ambos son transformaciones lineales invertibles del costo — un vendedor
// con calculadora siempre podría despejar costo ≈ minMargen30 * 0.7 (o
// minMarkup30 / 1.3) con precisión exacta. Eso no lo evita ningún código
// (es inherente a mostrar "hasta dónde puedo bajar"), así que en vez de
// devolver el número exacto se redondea HACIA ARRIBA al siguiente múltiplo
// de $500 — nunca sugiere un precio por debajo del piso real, da un valor
// más natural para cotizar de viva voz, y de paso el costo exacto ya no se
// puede reconstruir al peso.
const PASO_REDONDEO_CENTS = 50_000 // $500 COP, en centavos

function redondearArriba(cents: number, paso: number): number {
  return Math.ceil(cents / paso) * paso
}

function preciosMinimos(costCents: number) {
  return {
    minMargen30: redondearArriba(costCents / 0.7, PASO_REDONDEO_CENTS),
    minMarkup30: redondearArriba(costCents * 1.3, PASO_REDONDEO_CENTS),
  }
}

// GET - Busca productos por nombre/SKU y devuelve SOLO los dos precios
// mínimos sugeridos por variante (o por producto, si no tiene tallas) —
// nunca el costo real. A diferencia de /api/pos/search (que sí incluye
// cost_cents y por eso su buscador equivalente en la Calculadora general
// está bloqueado para 'seller'), esta ruta calcula los precios en el
// servidor y descarta el costo antes de responder: el vendedor puede
// cotizar el mínimo al que puede bajar un producto sin que el costo real
// viaje nunca a su navegador (ni siquiera visible en las herramientas de
// desarrollador). Pensado para "Precio Mínimo" en /admin/calculadora.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const qRaw = searchParams.get('q')?.trim()
    if (!qRaw || qRaw.length < 2) {
      return NextResponse.json({ data: [] })
    }
    // `.or()` arma un filtro PostgREST crudo separado por comas — sin
    // sanear, un valor como `x,cost_cents.gt.500000` inyecta una condición
    // extra que permite ubicar productos por costo (binary search sobre el
    // umbral) y así reconstruir el costo real que esta ruta existe para
    // nunca exponer. Se quitan los caracteres con significado especial en
    // ese filtro (`,`.()"\`); son puntuación que no aporta nada a una
    // búsqueda por nombre/SKU.
    const q = qRaw.replace(/[,.()"\\]/g, '').trim()
    if (q.length < 2) {
      return NextResponse.json({ data: [] })
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data: products, error } = await supabase
      .from('products')
      .select('id, title, sku, cost_cents, variants:product_variants(id, talla, cost_cents, active)')
      .is('deleted_at', null)
      .or(`title.ilike.%${q}%,sku.ilike.%${q}%`)
      .order('title', { ascending: true })
      .limit(20)

    if (error) {
      throw error
    }

    const data = (products || [])
      .map((p: any) => {
        // Producto con tallas: el costo real vive por variante, no en
        // products.cost_cents (ese campo no se mantiene actualizado ahí —
        // mismo criterio que admin/productos/page.tsx). Si tiene filas de
        // variante pero ninguna activa, no hay nada sellable que cotizar
        // todavía — se descarta en vez de caer de vuelta al costo del
        // producto, que sería un número obsoleto o en $0.
        const allVariants = p.variants || []
        if (allVariants.length > 0) {
          const activeVariants = allVariants.filter((v: any) => v.active)
          if (activeVariants.length === 0) return null
          return {
            id: p.id,
            title: p.title,
            variants: activeVariants.map((v: any) => ({
              id: v.id,
              talla: v.talla,
              ...preciosMinimos(v.cost_cents),
            })),
          }
        }
        return {
          id: p.id,
          title: p.title,
          variants: [],
          ...preciosMinimos(p.cost_cents),
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error searching min price:', error)
    return NextResponse.json({ error: 'Error al buscar el producto' }, { status: 500 })
  }
}
