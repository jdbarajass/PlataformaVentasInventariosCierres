import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { slugify } from '@/lib/utils'
import { z } from 'zod'

const confirmItemSchema = z.object({
  nombreSugerido: z.string().min(1),
  talla: z.string().min(1),
  costoCents: z.number().int().min(0),
  cantidad: z.number().int().positive(),
  codigoBarras: z.string().optional().nullable(),
  existingProductId: z.string().uuid().optional().nullable(),
  existingVariantId: z.string().uuid().optional().nullable(),
})

const confirmSchema = z.object({
  items: z.array(confirmItemSchema).min(1),
})

// POST - Confirma la importación de un pedido de proveedor de cascos:
// suma stock a variantes existentes, agrega tallas nuevas a productos ya
// existentes, o crea productos nuevos — siempre INACTIVOS
// (`active: false`) hasta que un admin los revise y complete (precio,
// fotos, descripción) desde Productos, para que el cargue de inventario
// nunca publique algo en la tienda pública sin revisión humana. Ver
// docs/UNIFICACION_YJBMOTOCOM.md sección 13.3 ítem 4.3.1.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = confirmSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.errors }, { status: 400 })
    }

    const supabase = createAuthenticatedClient(auth.token)
    let productsCreated = 0
    let variantsCreated = 0
    let stockUpdated = 0
    let errors = 0

    for (const item of validation.data.items) {
      try {
        if (item.existingVariantId) {
          const { data: variant, error: fetchError } = await supabase
            .from('product_variants')
            .select('id, product_id, stock_qty')
            .eq('id', item.existingVariantId)
            .single()
          if (fetchError || !variant) throw fetchError || new Error('Variante no encontrada')

          const v = variant as { id: string; product_id: string; stock_qty: number }
          const { error: updateError } = await (supabase.from('product_variants') as any)
            .update({ stock_qty: v.stock_qty + item.cantidad })
            .eq('id', v.id)
          if (updateError) throw updateError

          await (supabase.from('inventory_movements') as any).insert({
            product_id: v.product_id,
            variant_id: v.id,
            qty: item.cantidad,
            type: 'in',
            note: `Cargue de pedido de proveedor: ${item.nombreSugerido}`,
            created_by: auth.user.id,
          })
          stockUpdated++
        } else if (item.existingProductId) {
          const { data: newVariant, error: insertError } = await (supabase.from('product_variants') as any)
            .insert({
              product_id: item.existingProductId,
              talla: item.talla,
              barcode: item.codigoBarras || null,
              stock_qty: item.cantidad,
              cost_cents: item.costoCents,
            })
            .select()
            .single()
          if (insertError) throw insertError

          await (supabase.from('inventory_movements') as any).insert({
            product_id: item.existingProductId,
            variant_id: (newVariant as { id: string }).id,
            qty: item.cantidad,
            type: 'in',
            note: `Cargue de pedido de proveedor: ${item.nombreSugerido} (talla nueva)`,
            created_by: auth.user.id,
          })
          variantsCreated++
        } else {
          const baseSlug = slugify(item.nombreSugerido)
          const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`

          const { data: newProduct, error: productError } = await (supabase.from('products') as any)
            .insert({
              title: item.nombreSugerido,
              slug,
              price_cents: 0,
              cost_cents: item.costoCents,
              active: false,
              stock_qty: 0,
            })
            .select()
            .single()
          if (productError) throw productError

          const productId = (newProduct as { id: string }).id

          const { data: newVariant, error: variantError } = await (supabase.from('product_variants') as any)
            .insert({
              product_id: productId,
              talla: item.talla,
              barcode: item.codigoBarras || null,
              stock_qty: item.cantidad,
              cost_cents: item.costoCents,
            })
            .select()
            .single()
          if (variantError) throw variantError

          await (supabase.from('inventory_movements') as any).insert({
            product_id: productId,
            variant_id: (newVariant as { id: string }).id,
            qty: item.cantidad,
            type: 'in',
            note: `Cargue de pedido de proveedor: ${item.nombreSugerido} (producto nuevo)`,
            created_by: auth.user.id,
          })
          productsCreated++
        }
      } catch (itemError) {
        console.error('Error importing item:', item.nombreSugerido, itemError)
        errors++
      }
    }

    return NextResponse.json({
      data: { productsCreated, variantsCreated, stockUpdated, errors },
    })
  } catch (error) {
    console.error('Error confirming inventory import:', error)
    return NextResponse.json({ error: 'Error al confirmar la importación' }, { status: 500 })
  }
}
