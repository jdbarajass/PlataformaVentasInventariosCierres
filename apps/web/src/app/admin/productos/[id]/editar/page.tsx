import { notFound } from 'next/navigation'
import { getServiceSupabase } from '@/lib/supabase'
import { ProductForm } from '@/components/products/product-form'
import { Product } from '@/types/database'

// Sin esto, la primera visita a la página de edición de un producto se
// cachea (no hay generateStaticParams, pero Next igual guarda el render
// dinámico-bajo-demanda) y visitas futuras a ese MISMO producto pueden
// mostrar datos viejos — un admin podría editar sobre un stock/precio ya
// desactualizado y pisar sin darse cuenta un cambio más reciente hecho
// desde Inventario u otra pestaña (mismo problema de fondo que el
// Dashboard, ver admin/page.tsx).
export const dynamic = 'force-dynamic'

interface EditProductPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params
  // Cliente de servicio (bypassa RLS): con el cliente anónimo, la política
  // "Anyone can view active products" bloqueaba esta consulta para los 190
  // productos migrados del inventario físico (inactive=true a propósito) —
  // intentar editarlos daba 404 aunque el producto sí existiera.
  const supabase = getServiceSupabase()
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (!product) {
    notFound()
  }

  return <ProductForm mode="edit" product={product as Product} />
}
