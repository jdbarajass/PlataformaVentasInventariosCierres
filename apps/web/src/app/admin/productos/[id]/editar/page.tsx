import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ProductForm } from '@/components/products/product-form'
import { Product } from '@/types/database'

interface EditProductPageProps {
  params: {
    id: string
  }
}

export default async function EditProductPage({ params }: EditProductPageProps) {
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
