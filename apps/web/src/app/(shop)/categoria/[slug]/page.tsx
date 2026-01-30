'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ProductCard } from '@/components/products/product-card'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal, Grid3X3, List, Loader2 } from 'lucide-react'

// Datos de prueba para cuando Supabase no está disponible
const mockCategories: Record<string, { id: string; name: string; slug: string; description: string }> = {
  cascos: { id: '1', name: 'Cascos', slug: 'cascos', description: 'Protege tu cabeza con los mejores cascos del mercado' },
  guantes: { id: '2', name: 'Guantes', slug: 'guantes', description: 'Guantes de alta calidad para todo tipo de conduccion' },
  chaquetas: { id: '3', name: 'Chaquetas', slug: 'chaquetas', description: 'Chaquetas con proteccion y estilo' },
  accesorios: { id: '4', name: 'Accesorios', slug: 'accesorios', description: 'Accesorios esenciales para tu moto' },
  repuestos: { id: '5', name: 'Repuestos', slug: 'repuestos', description: 'Repuestos y partes para motos' },
  lubricantes: { id: '6', name: 'Lubricantes', slug: 'lubricantes', description: 'Aceites y lubricantes' },
}

const mockProducts = [
  {
    id: '1',
    title: 'Casco Integral Pro Carbon',
    slug: 'casco-integral-pro-carbon',
    price_cents: 45000000,
    compare_at_price_cents: 55000000,
    images: [],
    stock_qty: 15,
    category_id: '1',
  },
  {
    id: '2',
    title: 'Casco Modular Adventure',
    slug: 'casco-modular-adventure',
    price_cents: 38000000,
    compare_at_price_cents: null,
    images: [],
    stock_qty: 8,
    category_id: '1',
  },
  {
    id: '3',
    title: 'Casco Jet Urban Style',
    slug: 'casco-jet-urban-style',
    price_cents: 25000000,
    compare_at_price_cents: 30000000,
    images: [],
    stock_qty: 20,
    category_id: '1',
  },
  {
    id: '4',
    title: 'Guantes Racing Pro',
    slug: 'guantes-racing-pro',
    price_cents: 12000000,
    compare_at_price_cents: null,
    images: [],
    stock_qty: 25,
    category_id: '2',
  },
  {
    id: '5',
    title: 'Guantes Touring Premium',
    slug: 'guantes-touring-premium',
    price_cents: 15000000,
    compare_at_price_cents: 18000000,
    images: [],
    stock_qty: 18,
    category_id: '2',
  },
  {
    id: '6',
    title: 'Chaqueta Moto Adventure',
    slug: 'chaqueta-moto-adventure',
    price_cents: 28000000,
    compare_at_price_cents: null,
    images: [],
    stock_qty: 10,
    category_id: '3',
  },
  {
    id: '7',
    title: 'Candado Alarma Premium',
    slug: 'candado-alarma-premium',
    price_cents: 8500000,
    compare_at_price_cents: 10000000,
    images: [],
    stock_qty: 30,
    category_id: '4',
  },
]

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
}

interface Product {
  id: string
  title: string
  slug: string
  price_cents: number
  compare_at_price_cents: number | null
  images: string[]
  stock_qty: number
  category_id: string | null
}

export default function CategoryPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [category, setCategory] = useState<Category | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!slug) return

      setLoading(true)
      setError(null)

      try {
        // Intentar obtener de Supabase
        const { data: categoryData, error: catError } = await supabase
          .from('categories')
          .select('*')
          .eq('slug', slug)
          .eq('active', true)
          .single()

        if (catError || !categoryData) {
          // Usar datos mock
          const mockCategory = mockCategories[slug]
          if (mockCategory) {
            setCategory(mockCategory)
            const categoryProducts = mockProducts.filter(
              (p) => p.category_id === mockCategory.id
            )
            setProducts(categoryProducts)
          } else {
            setError('Categoría no encontrada')
          }
          setLoading(false)
          return
        }

        setCategory(categoryData)

        // Obtener productos de la categoría
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('category_id', categoryData.id)
          .eq('active', true)
          .order('created_at', { ascending: false })

        setProducts(productsData || [])
      } catch (err) {
        console.error('Error fetching category:', err)
        // Fallback a datos mock
        const mockCategory = mockCategories[slug]
        if (mockCategory) {
          setCategory(mockCategory)
          const categoryProducts = mockProducts.filter(
            (p) => p.category_id === mockCategory.id
          )
          setProducts(categoryProducts)
        } else {
          setError('Error al cargar la categoría')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug])

  if (loading) {
    return (
      <div className="container flex min-h-[50vh] items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (error || !category) {
    return (
      <div className="container py-8">
        <div className="rounded-2xl border-2 border-dashed p-12 text-center">
          <p className="text-lg font-medium">Categoría no encontrada</p>
          <p className="mt-2 text-sm text-muted-foreground">
            La categoría que buscas no existe o no está disponible.
          </p>
          <Button asChild className="mt-4">
            <a href="/">Volver al inicio</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{category.name}</h1>
        {category.description && (
          <p className="mt-2 text-muted-foreground">{category.description}</p>
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {products.length} productos encontrados
        </p>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </Button>
          <div className="flex rounded-lg border">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none">
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none">
              <List className="h-4 w-4" />
            </Button>
          </div>
          <select className="h-9 rounded-lg border bg-background px-3 text-sm">
            <option value="newest">Mas recientes</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="name">Nombre A-Z</option>
          </select>
        </div>
      </div>

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center">
          <p className="text-lg font-medium">No hay productos en esta categoria</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vuelve pronto, estamos agregando nuevos productos constantemente.
          </p>
        </div>
      )}
    </div>
  )
}
