import { notFound } from 'next/navigation'
import { getServiceSupabase } from '@/lib/supabase'
import { ProductForm } from '@/components/products/product-form'
import { Product } from '@/types/database'

interface EditProductPageProps {
  params: {
    id: string
  }
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  // Cliente de servicio (bypassa RLS): con el cliente anónimo, la política
  // "Anyone can view active products" bloqueaba esta consulta para los 190
  // productos migrados del inventario físico (inactive=true a propósito) —
  // intentar editarlos daba 404 aunque el producto sí existiera.
  const supabase = getServiceSupabase()
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!product) {
    notFound()
  }

  return <ProductForm mode="edit" product={product as Product} />
}
