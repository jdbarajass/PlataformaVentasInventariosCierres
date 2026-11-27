import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { z } from 'zod'

const adjustmentSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  qty: z.number().int(),
  type: z.enum(['in', 'out', 'adjustment', 'return']),
  // Solo para 'adjustment': el stock que la persona vio al contar o al abrir
  // el formulario. Con él se aplica la DIFERENCIA (qty - expected_qty) sobre
  // el stock actual, así una venta que entró en medio no se borra
  // (auditoría B11/B12). Sin él, 'adjustment' deja qty como cantidad final.
  expected_qty: z.number().int().min(0).optional(),
  note: z.string().optional(),
  created_by: z.string().uuid().optional(),
})

// Mensajes de regla de negocio de adjust_inventory (migración 00073) que se
// muestran tal cual al usuario.
const RULE_ERRORS = ['negativo', 'tiene tallas', 'no encontrad', 'no válido']

export async function POST(request: NextRequest) {
  try {
    // Solo admin puede ajustar stock, igual que el local exige la clave
    // maestra de Admin para cualquier edición de inventario.
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()
    const validation = adjustmentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { product_id, variant_id, qty, type, expected_qty, note, created_by } = validation.data
    // Use service role for system operations
    const supabase = getServiceSupabase()

    // Todo en una sola transacción de la base (adjust_inventory, 00073):
    // bloquea la fila, calcula el nuevo stock sobre el valor ACTUAL y deja el
    // movimiento y la auditoría igual que antes. Antes se leía el stock, se
    // calculaba aquí y se escribía después, así que una venta en medio quedaba
    // borrada. Con variant_id aplica sobre esa talla; un producto con tallas
    // no se ajusta en el total (el trigger de sincronización lo pisaría).
    const { data, error } = await (supabase.rpc as any)('adjust_inventory', {
      p_product_id: product_id,
      p_variant_id: variant_id ?? null,
      p_type: type,
      p_qty: qty,
      p_expected: type === 'adjustment' ? expected_qty ?? null : null,
      p_note: note ?? null,
      p_created_by: created_by ?? null,
    })

    if (error) {
      const message: string = error.message || ''
      if (RULE_ERRORS.some((s) => message.includes(s))) {
        return NextResponse.json({ error: message }, { status: message.includes('no encontrad') ? 404 : 400 })
      }
      throw error
    }

    const result = (Array.isArray(data) ? data[0] : data) as {
      previous_stock: number
      new_stock: number
      movement_id: string
      sold_meanwhile: number
    }

    // La notificación de reabasto ya no se dispara aquí — un trigger de
    // base de datos (migración 00036) detecta la transición 0 → positivo
    // en products/product_variants sin importar por qué ruta se escribió
    // el stock, y encola el aviso en restock_notification_queue. Un cron
    // (api/cron/restock-notifications) es quien envía el email de verdad.

    return NextResponse.json({
      success: true,
      movement: { id: result.movement_id },
      product: {
        id: product_id,
        variant_id: variant_id ?? null,
        previous_stock: result.previous_stock,
        new_stock: result.new_stock,
        // Unidades que cambiaron entre que se vio el stock y se guardó
        // (ventas en medio). La pantalla lo avisa.
        changed_meanwhile: result.sold_meanwhile,
      },
    })
  } catch (error) {
    console.error('Error adjusting inventory:', error)
    return NextResponse.json(
      { error: 'Error al ajustar inventario' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')
    const variantId = searchParams.get('variant_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Use authenticated client (respects RLS)
    const supabase = createAuthenticatedClient(auth.token)

    let query = supabase
      .from('inventory_movements')
      .select(`
        *,
        product:products(id, title, sku),
        variant:product_variants(id, talla, barcode)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (productId) {
      query = query.eq('product_id', productId)
    }
    if (variantId) {
      query = query.eq('variant_id', variantId)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }
    if (type) {
      query = query.eq('type', type as 'in' | 'out' | 'adjustment' | 'sale' | 'return')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching inventory movements:', error)
    return NextResponse.json(
      { error: 'Error al obtener movimientos de inventario' },
      { status: 500 }
    )
  }
}
