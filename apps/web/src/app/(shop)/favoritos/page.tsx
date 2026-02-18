'use client'

import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useWishlist } from '@/lib/wishlist-context'
import { ProductCard } from '@/components/products/product-card'
import { Product } from '@/types/database'

export default function FavoritosPage() {
  const { items } = useWishlist()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProducts = async () => {
      if (items.length === 0) {
        setProducts([])
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('products')
        .select('*')
        .in('id', items)
        .eq('active', true)

      setProducts((data as Product[]) || [])
      setLoading(false)
    }

    loadProducts()
  }, [items])

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Mis Favoritos</h1>
        <p className="mt-2 text-muted-foreground">
          {items.length === 0
            ? 'No tienes productos en favoritos'
            : `${items.length} producto${items.length > 1 ? 's' : ''} en tu lista`}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="text-xl font-semibold">No hay favoritos aun</h2>
          <p className="mt-2 text-muted-foreground">
            Explora nuestros productos y agrega tus favoritos con el icono de corazon.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
