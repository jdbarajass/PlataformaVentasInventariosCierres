import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'

// GET - Buscar productos (con sus variantes) para el carrito de Registrar Venta.
// Soporta búsqueda por nombre/SKU (?q=) o por código de barras exacto (?barcode=),
// como el escaneo de un lector USB en el software local.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const barcode = searchParams.get('barcode')?.trim()
    const categoryId = searchParams.get('category_id')?.trim()

    const supabase = createAuthenticatedClient(auth.token)

    if (barcode) {
      const { data: variant, error: variantError } = await supabase
        .from('product_variants')
        .select('*, product:products!inner(*)')
        .eq('barcode', barcode)
        .eq('active', true)
        // El producto puede seguir "sin publicar" (active=false, ver
        // comentario más abajo) y aun así debe poder venderse — lo único
        // que de verdad lo saca de Registrar Venta es que lo hayan
        // eliminado (deleted_at). !inner para poder filtrar por una
        // columna del producto embebido.
        .is('product.deleted_at', null)
        .maybeSingle()

      if (variantError) {
        throw variantError
      }

      if (variant && (variant as any).product) {
        const product = (variant as any).product
        const { data: variants } = await supabase
          .from('product_variants')
          .select('*')
          .eq('product_id', product.id)
          .eq('active', true)

        return NextResponse.json({
          data: [{ ...product, variants: variants || [], matched_variant_id: (variant as any).id }],
        })
      }

      // Sin coincidencia en variantes: el producto puede no tener tallas,
      // caso en el que su propio código de barras vive en `products.barcode`
      // directamente (~71 productos migrados sin talla, ver sección 20) —
      // antes el escaneo de estos productos no encontraba nada.
      // El select con relación embebida aliaseada ("variants:product_variants(*)")
      // hace que el parser de tipos de @supabase/postgrest-js no reconozca
      // "barcode" como columna válida de products para el .eq() siguiente
      // — mismo tipo de limitación ya documentada en otras rutas de este
      // proyecto (ver docs/UNIFICACION_YJBMOTOCOM.md, limitaciones de tipos).
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*, variants:product_variants(*)')
        // @ts-ignore - Supabase type inference issue
        .eq('barcode', barcode)
        .is('deleted_at', null)
        .maybeSingle()

      if (productError) {
        throw productError
      }

      if (!product) {
        return NextResponse.json({ data: [] })
      }

      return NextResponse.json({
        data: [{ ...product, variants: ((product as any).variants || []).filter((v: any) => v.active) }],
      })
    }

    // No se filtra por products.active: ese campo solo controla si el
    // producto se muestra en la tienda pública — el POS (Registrar Venta)
    // es una operación interna de admin/vendedor y debe poder vender
    // cualquier producto con stock real, esté publicado o no (ej. uno
    // recién cargado desde "Ingresar" en Inventario, todavía sin foto/
    // descripción). Lo que sí se filtra es deleted_at: un producto
    // realmente eliminado (distinto de "sin publicar todavía", ver
    // migración 00040) no debe poder venderse ni volver a aparecer aquí.
    let query = supabase.from('products').select('*, variants:product_variants(*)').is('deleted_at', null)

    if (q) {
      // El código de barras de un producto CON tallas vive por variante
      // (products.barcode queda null) — sin esto, escribir/pegar el código
      // de una talla en el buscador no encontraba el producto (mismo bug
      // que ya se corrigió en el buscador de Detalle de Inventario).
      const { data: variantesConBarcode } = await supabase
        .from('product_variants')
        .select('product_id')
        .ilike('barcode', `%${q}%`)
      const idsPorBarcode = Array.from(new Set((variantesConBarcode || []).map((v: any) => v.product_id)))
      const filtroIds = idsPorBarcode.length > 0 ? `,id.in.(${idsPorBarcode.join(',')})` : ''
      query = query.or(`title.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%${filtroIds}`)
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }
    // Sin texto de búsqueda: modo catálogo (grilla navegable, como el POS de
    // Alegra), muestra un lote de productos en vez de nada.
    query = q ? query.limit(20) : query.order('title', { ascending: true }).limit(60)

    const { data: products, error } = await query

    if (error) {
      throw error
    }

    const data = (products || []).map((p: any) => ({
      ...p,
      variants: (p.variants || []).filter((v: any) => v.active),
    }))

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error searching products for POS:', error)
    return NextResponse.json(
      { error: 'Error al buscar productos' },
      { status: 500 }
    )
  }
}
