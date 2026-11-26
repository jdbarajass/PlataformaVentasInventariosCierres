import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { precioMontado, precioMinimoCliente, rangoCostos } from '@/lib/precios'

// Mismo criterio que /api/pos/min-price: los precios que salen del costo se
// redondean HACIA ARRIBA al siguiente múltiplo de $500 — nunca quedan por
// debajo del piso real y el costo exacto ya no se puede despejar al peso.
const PASO_REDONDEO_CENTS = 50_000 // $500 COP, en centavos

function redondearArriba(cents: number): number {
  return Math.ceil(cents / PASO_REDONDEO_CENTS) * PASO_REDONDEO_CENTS
}

type Rango = { min: number; max: number }

function aplicar(rango: Rango, fn: (c: number) => number): Rango {
  return { min: redondearArriba(fn(rango.min)), max: redondearArriba(fn(rango.max)) }
}

// GET - Para la tabla de Catálogo → Productos del rol 'seller': devuelve por
// producto SOLO el "precio producto montado" (costo + 30%) y el "precio
// mínimo a la venta cliente" (costo + % del producto), calculados acá. Ni el
// costo ni el % viajan al navegador. El admin no usa esta ruta: ya ve el
// costo y calcula lo mismo en el navegador (lib/precios.ts) para que el
// cambio de % se refleje al instante.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    // Paginado: PostgREST corta en 1000 filas por respuesta, y el catálogo
    // puede pasar de eso (ver docs/UNIFICACION_YJBMOTOCOM.md sección 81.14).
    const PAGE = 1000
    const rows: any[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('products')
        .select('id, price_cents, cost_cents, client_min_markup_pct, variants:product_variants(cost_cents)')
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < PAGE) break
    }

    const pricing: Record<string, { montado: Rango; minimoCliente: Rango | null; bajoMinimo: boolean }> = {}
    for (const p of rows) {
      // Producto con tallas: el costo real vive por variante (mismo criterio
      // que admin/productos/page.tsx).
      const variantCosts = ((p.variants || []) as { cost_cents: number }[]).map((v) => v.cost_cents)
      const costos = rangoCostos(variantCosts.length > 0 ? variantCosts : [p.cost_cents])
      const pct = p.client_min_markup_pct == null ? null : Number(p.client_min_markup_pct)
      pricing[p.id] = {
        montado: aplicar(costos, precioMontado),
        minimoCliente: pct == null ? null : aplicar(costos, (c) => precioMinimoCliente(c, pct)),
        // Contra el mínimo EXACTO, no el redondeado: si no, un precio que sí
        // cubre el mínimo real saldría en rojo solo por el redondeo a $500.
        // Mismo criterio que el admin en admin/productos/page.tsx.
        bajoMinimo: pct != null && p.price_cents < precioMinimoCliente(costos.max, pct),
      }
    }

    return NextResponse.json({ pricing })
  } catch (error) {
    console.error('Error computing product pricing:', error)
    return NextResponse.json({ error: 'Error al calcular los precios' }, { status: 500 })
  }
}
