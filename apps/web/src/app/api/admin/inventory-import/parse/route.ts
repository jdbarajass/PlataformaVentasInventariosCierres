import { NextRequest, NextResponse } from 'next/server'
// Se importa el módulo interno (no la raíz del paquete) porque el índice de
// pdf-parse ejecuta un auto-test contra un PDF de muestra cuando detecta
// `!module.parent` — bajo el bundling de Next.js eso rompe el build en
// "Collecting page data" (intenta leer test/data/05-versions-space.pdf, que
// no existe en este proyecto). El módulo interno expone la misma función
// sin ese efecto secundario.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { parseXtrong, generateXtrongBarcodes, buildXtrongModelMap } from '@/lib/pdf-import/xtrong'
import { parseDistrifabrica } from '@/lib/pdf-import/distrifabrica'
import type { ParsedHelmetItem, ProviderKey } from '@/lib/pdf-import/types'

export interface ImportPreviewItem extends ParsedHelmetItem {
  matchStatus: 'nuevo' | 'nueva_talla' | 'suma'
  existingProductId: string | null
  existingVariantId: string | null
}

// POST - Sube un PDF de pedido de proveedor de cascos (ACCESORIOS PARA MOTOS
// S.A.S. o DISTRIFABRICA RAMIREZ SAS), lo parsea y resuelve cada ítem contra
// el catálogo (nuevo producto / nueva talla de un producto existente / suma
// de stock a una variante existente) — mismo flujo que
// VENTAS_YJBMOTOCOM/ui/cargue_pedidos_widget.py, ver docs/UNIFICACION_YJBMOTOCOM.md
// sección 13.3 ítem 4.3.1. Solo admin (misma regla que el resto de escritura
// de inventario).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const provider = formData.get('provider') as ProviderKey | null

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Falta el archivo PDF' }, { status: 400 })
    }
    if (provider !== 'xtrong' && provider !== 'distrifabrica') {
      return NextResponse.json({ error: 'Proveedor no reconocido' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { text } = await pdfParse(buffer)

    const supabase = createAuthenticatedClient(auth.token)

    let items: ParsedHelmetItem[]

    if (provider === 'xtrong') {
      const rawItems = parseXtrong(text)
      if (rawItems.length === 0) {
        return NextResponse.json({ data: [] })
      }

      const { data: existingVariants } = await supabase
        .from('product_variants')
        .select('barcode, product:products(title)')
        .like('barcode', '1106%')

      const rows = (existingVariants || []) as unknown as { barcode: string | null; product: { title: string } | null }[]
      const existingBarcodes = rows.map((r) => r.barcode || '').filter((b) => b.length === 10)
      const existingProducts = rows
        .filter((r) => r.barcode && r.product)
        .map((r) => ({ title: r.product!.title, barcode: r.barcode! }))
      const modelMap = buildXtrongModelMap(existingProducts)
      const barcodes = generateXtrongBarcodes(rawItems, existingBarcodes, modelMap)

      items = rawItems.map((it, i) => ({
        nombreSugerido: it.nombreSugerido,
        talla: it.talla,
        costoSinIva: it.costoSinIva,
        cantidad: it.cantidad,
        codigoBarrasSugerido: barcodes.get(i) || '',
      }))
    } else {
      const rawItems = parseDistrifabrica(text)
      items = rawItems.map((it) => ({
        nombreSugerido: it.descripcion,
        talla: it.talla,
        costoSinIva: it.costoSinIva,
        cantidad: it.cantidad,
        codigoBarrasSugerido: it.codigoProveedor,
      }))
    }

    if (items.length === 0) {
      return NextResponse.json({ data: [] })
    }

    // Resolver cada ítem contra el catálogo existente: mismo nombre de
    // producto (ilike exacto) + misma talla → suma stock a la variante;
    // mismo nombre pero talla nueva → agrega variante al producto existente;
    // sin coincidencia de nombre → producto nuevo (inactivo hasta revisión).
    const preview: ImportPreviewItem[] = []
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .ilike('title', item.nombreSugerido)
        .limit(1)
        .maybeSingle()

      if (!product) {
        preview.push({ ...item, matchStatus: 'nuevo', existingProductId: null, existingVariantId: null })
        continue
      }

      const { data: variant } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', (product as { id: string }).id)
        .ilike('talla', item.talla)
        .limit(1)
        .maybeSingle()

      if (variant) {
        preview.push({
          ...item,
          matchStatus: 'suma',
          existingProductId: (product as { id: string }).id,
          existingVariantId: (variant as { id: string }).id,
        })
      } else {
        preview.push({
          ...item,
          matchStatus: 'nueva_talla',
          existingProductId: (product as { id: string }).id,
          existingVariantId: null,
        })
      }
    }

    return NextResponse.json({ data: preview })
  } catch (error) {
    console.error('Error parsing supplier PDF:', error)
    return NextResponse.json({ error: 'Error al leer o parsear el PDF' }, { status: 500 })
  }
}
