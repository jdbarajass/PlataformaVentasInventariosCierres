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
        .select('*, product:products(*)')
        .eq('barcode', barcode)
        .eq('active', true)
        .maybeSingle()

      if (variantError) {
        throw variantError
      }

      if (!variant || !(variant as any).product) {
        return NextResponse.json({ data: [] })
      }

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

    // No se filtra por products.active: ese campo solo controla si el
    // producto se muestra en la tienda pública — el POS (Registrar Venta)
    // es una operación interna de admin/vendedor y debe poder vender
    // cualquier producto con stock real, esté publicado o no (ej. los 190
    // productos migrados del inventario físico, aún sin foto/descripción).
    let query = supabase.from('products').select('*, variants:product_variants(*)')

    if (q) {
      query = query.or(`title.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
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
