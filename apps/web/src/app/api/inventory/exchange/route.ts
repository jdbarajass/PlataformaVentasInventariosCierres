import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { randomUUID } from 'crypto'
import { z } from 'zod'

const sideSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  // Talla estándar elegida en "Producto que ENTRA" cuando el producto
  // todavía no tiene esa talla registrada como variante (ej. el cliente
  // devuelve una XS de un casco que hoy solo tiene M/L/XL con stock) — se
  // usa solo cuando variantId viene vacío, para crear esa variante al vuelo
  // en vez de bloquear el cambio por no tenerla ya cargada.
  talla: z.string().trim().min(1).max(20).optional().nullable(),
  // Cuántas unidades cambian de lado — antes era siempre 1 fijo (mismo
  // comportamiento que el software local), pero un cambio real puede ser
  // de varias unidades a la vez (ej. cambiar 3 cascos talla M por 3 talla
  // L) — cada lado tiene su propia cantidad, no tienen que coincidir.
  qty: z.number().int().positive().default(1),
})

const exchangeSchema = z.object({
  sale: sideSchema, // se entrega al cliente — el inventario BAJA
  entra: sideSchema, // lo devuelve el cliente — el inventario SUBE
})

// POST - Cambio físico de producto: el cliente devuelve un artículo y se
// lleva otro (ej. la misma talla de casco en otro color/talla) — descuenta
// del que sale y suma al que entra, ambos como movimiento tipo 'exchange'
// enlazados por el mismo reference_id. Admin y vendedor (igual que
// Registrar Venta, es una operación normal de mostrador, no administrativa).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = exchangeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.errors }, { status: 400 })
    }
    const { sale, entra } = validation.data

    const supabase = getServiceSupabase()

    // Si "entra" trae una talla en vez de variantId (talla estándar que el
    // producto todavía no tenía registrada, ver TALLAS_ENTRA_EXTRA en la
    // página), la busca por si ya existe (talla no distingue mayúsculas) o
    // la crea con stock 0 — copiando costo/umbral de una variante hermana
    // del mismo producto para no dejar el costeo de inventario en $0.
    async function resolveEntraVariantId(
      productId: string,
      variantId: string | null | undefined,
      talla: string | null | undefined
    ): Promise<string | null> {
      if (variantId) return variantId
      if (!talla) return null

      const { data: existing } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', productId)
        .ilike('talla', talla)
        .maybeSingle()
      if (existing) return (existing as { id: string }).id

      const { data: sibling } = await supabase
        .from('product_variants')
        .select('cost_cents, low_stock_threshold')
        .eq('product_id', productId)
        .limit(1)
        .maybeSingle()
      const { cost_cents, low_stock_threshold } = (sibling as { cost_cents: number; low_stock_threshold: number } | null) || {
        cost_cents: 0,
        low_stock_threshold: 5,
      }

      const { data: created, error: createError } = await (supabase.from('product_variants') as any)
        .insert({ product_id: productId, talla, stock_qty: 0, cost_cents, low_stock_threshold, active: true })
        .select('id')
        .single()
      if (createError) {
        // Carrera: otra petición creó la misma talla justo antes (UNIQUE
        // product_id+talla) — se usa la que ya quedó creada.
        if (createError.code === '23505') {
          const { data: retry } = await supabase
            .from('product_variants')
            .select('id')
            .eq('product_id', productId)
            .ilike('talla', talla)
            .maybeSingle()
          if (retry) return (retry as { id: string }).id
        }
        throw createError
      }
      return (created as { id: string }).id
    }

    const entraVariantId = await resolveEntraVariantId(entra.productId, entra.variantId, entra.talla)

    const sameSide = sale.productId === entra.productId && (sale.variantId || null) === (entraVariantId || null)
    if (sameSide) {
      return NextResponse.json(
        { error: 'El producto que sale y el que entra son el mismo. Selecciona artículos diferentes.' },
        { status: 400 }
      )
    }

    async function getStock(productId: string, variantId?: string | null) {
      if (variantId) {
        const { data, error } = await supabase
          .from('product_variants')
          .select('stock_qty')
          .eq('id', variantId)
          .single()
        if (error || !data) throw new Error('Variante no encontrada')
        return (data as { stock_qty: number }).stock_qty
      }
      const { data, error } = await supabase.from('products').select('stock_qty').eq('id', productId).single()
      if (error || !data) throw new Error('Producto no encontrado')
      return (data as { stock_qty: number }).stock_qty
    }

    const saleStock = await getStock(sale.productId, sale.variantId)
    if (saleStock < sale.qty) {
      return NextResponse.json(
        { error: `El producto que sale solo tiene ${saleStock} unidad(es) disponible(s) — no alcanza para entregar ${sale.qty}.` },
        { status: 400 }
      )
    }

    async function applyDelta(productId: string, variantId: string | null | undefined, delta: number) {
      if (variantId) {
        const { data, error } = await supabase
          .from('product_variants')
          .select('stock_qty')
          .eq('id', variantId)
          .single()
        if (error || !data) throw new Error('Variante no encontrada')
        const newStock = (data as { stock_qty: number }).stock_qty + delta
        const { error: updateError } = await (supabase.from('product_variants') as any)
          .update({ stock_qty: newStock })
          .eq('id', variantId)
        if (updateError) throw updateError
        return newStock
      }
      const { data, error } = await supabase.from('products').select('stock_qty').eq('id', productId).single()
      if (error || !data) throw new Error('Producto no encontrado')
      const newStock = (data as { stock_qty: number }).stock_qty + delta
      const { error: updateError } = await (supabase.from('products') as any)
        .update({ stock_qty: newStock })
        .eq('id', productId)
      if (updateError) throw updateError
      return newStock
    }

    const referenceId = randomUUID()

    const saleNewStock = await applyDelta(sale.productId, sale.variantId, -sale.qty)
    await (supabase.from('inventory_movements') as any).insert({
      product_id: sale.productId,
      variant_id: sale.variantId || null,
      qty: -sale.qty,
      type: 'exchange',
      note: `Cambio de producto — entregado al cliente (${sale.qty} unidad${sale.qty !== 1 ? 'es' : ''})`,
      reference_id: referenceId,
      reference_type: 'exchange',
      created_by: auth.user.id,
    })

    const entraNewStock = await applyDelta(entra.productId, entraVariantId, entra.qty)
    await (supabase.from('inventory_movements') as any).insert({
      product_id: entra.productId,
      variant_id: entraVariantId,
      qty: entra.qty,
      type: 'exchange',
      note: `Cambio de producto — devuelto por el cliente (${entra.qty} unidad${entra.qty !== 1 ? 'es' : ''})`,
      reference_id: referenceId,
      reference_type: 'exchange',
      created_by: auth.user.id,
    })

    return NextResponse.json({
      data: { saleNewStock, entraNewStock, referenceId },
    })
  } catch (error) {
    console.error('Error processing product exchange:', error)
    const message = error instanceof Error ? error.message : 'Error al procesar el cambio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
