import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { productVariantSchema } from '@/lib/validations/product'
import { variantConflictMessage } from '@/lib/variant-conflict-message'

// GET - Listar variantes (tallas/código de barras) de un producto
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', params.id)
      .order('talla', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching product variants:', error)
    return NextResponse.json(
      { error: 'Error al obtener las variantes del producto' },
      { status: 500 }
    )
  }
}

// POST - Crear una variante nueva (talla/código de barras) para un producto
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Solo admin puede crear variantes de inventario (ver PUT/DELETE en
    // /api/product-variants/[id] para el mismo criterio).
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = productVariantSchema.parse(body)

    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', params.id)
      .single()

    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    const { data: variant, error } = await supabase
      .from('product_variants')
      // @ts-ignore - Supabase type inference issue
      .insert({ ...validatedData, product_id: params.id })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: variantConflictMessage(error) }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(variant, { status: 201 })
  } catch (error) {
    console.error('Error creating product variant:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al crear la variante' },
      { status: 500 }
    )
  }
}
