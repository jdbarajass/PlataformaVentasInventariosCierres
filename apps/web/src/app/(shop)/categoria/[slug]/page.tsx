import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ProductCard } from '@/components/products/product-card'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal, Grid3X3, List } from 'lucide-react'

interface CategoryPageProps {
  params: { slug: string }
  searchParams: { sort?: string; min?: string; max?: string }
}

async function getCategoryWithProducts(slug: string) {
  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (!category) return null

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('category_id', category.id)
    .eq('active', true)
    .order('created_at', { ascending: false })

  return { category, products: products || [] }
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const data = await getCategoryWithProducts(params.slug)
  if (!data) return { title: 'Categoria no encontrada' }

  return {
    title: `${data.category.name} - YB MOTOCOM`,
    description: data.category.description || `Explora nuestra coleccion de ${data.category.name}`,
  }
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const data = await getCategoryWithProducts(params.slug)

  if (!data) {
    notFound()
  }

  const { category, products } = data

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
