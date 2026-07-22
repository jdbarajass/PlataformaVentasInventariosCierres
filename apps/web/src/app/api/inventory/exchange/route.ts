import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { randomUUID } from 'crypto'
import { z } from 'zod'

const sideSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
})

const exchangeSchema = z.object({
  sale: sideSchema, // se entrega al cliente — el inventario BAJA
  entra: sideSchema, // lo devuelve el cliente — el inventario SUBE
})

// POST - Cambio físico de producto: el cliente devuelve un artículo y se
// lleva otro. Descuenta 1 unidad del que sale y suma 1 al que entra, ambos
// como movimiento tipo 'exchange' enlazados por el mismo reference_id —
// mismo flujo que la pestaña "Cambios" del software local
// (ui/inventario_panel.py: _on_confirmar_cambio, siempre ±1 unidad). Solo
// admin, igual que el resto de escritura de inventario (ver Fase 4.1).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = exchangeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.errors }, { status: 400 })
    }
    const { sale, entra } = validation.data

    const sameSide =
      sale.productId === entra.productId && (sale.variantId || null) === (entra.variantId || null)
    if (sameSide) {
      return NextResponse.json(
        { error: 'El producto que sale y el que entra son el mismo. Selecciona artículos diferentes.' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

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
    if (saleStock < 1) {
      return NextResponse.json(
        { error: 'El producto que sale no tiene stock disponible para entregar al cliente.' },
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

    const saleNewStock = await applyDelta(sale.productId, sale.variantId, -1)
    await (supabase.from('inventory_movements') as any).insert({
      product_id: sale.productId,
      variant_id: sale.variantId || null,
      qty: -1,
      type: 'exchange',
      note: 'Cambio de producto — entregado al cliente',
      reference_id: referenceId,
      reference_type: 'exchange',
      created_by: auth.user.id,
    })

    const entraNewStock = await applyDelta(entra.productId, entra.variantId, 1)
    await (supabase.from('inventory_movements') as any).insert({
      product_id: entra.productId,
      variant_id: entra.variantId || null,
      qty: 1,
      type: 'exchange',
      note: 'Cambio de producto — devuelto por el cliente',
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
