'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { ProductCard } from '@/components/products/product-card'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal, Grid3X3, List, Loader2 } from 'lucide-react'
import { Product, Category } from '@/types/database'

// Datos de prueba para cuando Supabase no está disponible
const mockCategories: Record<string, Category> = {
  cascos: { id: '1', name: 'Cascos', slug: 'cascos', description: 'Protege tu cabeza con los mejores cascos del mercado', image_url: null, parent_id: null, sort_order: 1, active: true, created_at: '', updated_at: '' },
  guantes: { id: '2', name: 'Guantes', slug: 'guantes', description: 'Guantes de alta calidad para todo tipo de conduccion', image_url: null, parent_id: null, sort_order: 2, active: true, created_at: '', updated_at: '' },
  chaquetas: { id: '3', name: 'Chaquetas', slug: 'chaquetas', description: 'Chaquetas con proteccion y estilo', image_url: null, parent_id: null, sort_order: 3, active: true, created_at: '', updated_at: '' },
  accesorios: { id: '4', name: 'Accesorios', slug: 'accesorios', description: 'Accesorios esenciales para tu moto', image_url: null, parent_id: null, sort_order: 4, active: true, created_at: '', updated_at: '' },
  repuestos: { id: '5', name: 'Repuestos', slug: 'repuestos', description: 'Repuestos y partes para motos', image_url: null, parent_id: null, sort_order: 5, active: true, created_at: '', updated_at: '' },
  lubricantes: { id: '6', name: 'Lubricantes', slug: 'lubricantes', description: 'Aceites y lubricantes', image_url: null, parent_id: null, sort_order: 6, active: true, created_at: '', updated_at: '' },
}

const createMockProduct = (id: string, title: string, slug: string, priceCents: number, compareAtPriceCents: number | null, stockQty: number, categoryId: string): Product => ({
  id,
  sku: `SKU-${id}`,
  title,
  slug,
  description: null,
  price_cents: priceCents,
  cost_cents: 0,
  compare_at_price_cents: compareAtPriceCents,
  category_id: categoryId,
  images: [],
  stock_qty: stockQty,
  low_stock_threshold: 5,
  weight_grams: null,
  dimensions: null,
  tags: [],
  active: true,
  featured: false,
  barcode: null,
  deleted_at: null,
  created_at: '',
  updated_at: '',
})

const mockProducts: Product[] = [
  createMockProduct('1', 'Casco Integral Pro Carbon', 'casco-integral-pro-carbon', 45000000, 55000000, 15, '1'),
  createMockProduct('2', 'Casco Modular Adventure', 'casco-modular-adventure', 38000000, null, 8, '1'),
  createMockProduct('3', 'Casco Jet Urban Style', 'casco-jet-urban-style', 25000000, 30000000, 20, '1'),
  createMockProduct('4', 'Guantes Racing Pro', 'guantes-racing-pro', 12000000, null, 25, '2'),
  createMockProduct('5', 'Guantes Touring Premium', 'guantes-touring-premium', 15000000, 18000000, 18, '2'),
  createMockProduct('6', 'Chaqueta Moto Adventure', 'chaqueta-moto-adventure', 28000000, null, 10, '3'),
  createMockProduct('7', 'Candado Alarma Premium', 'candado-alarma-premium', 8500000, 10000000, 30, '4'),
]

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

        const typedCategory = categoryData as Category
        setCategory(typedCategory)

        // Obtener productos de la categoría
        const { data: productsData } = await supabase
          .from('products')
          .select('*, product_variants(id, talla, stock_qty, active)')
          .eq('category_id', typedCategory.id)
          .eq('active', true)
          .order('created_at', { ascending: false })

        setProducts((productsData as Product[]) || [])
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            <Link href="/">Volver al inicio</Link>
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
