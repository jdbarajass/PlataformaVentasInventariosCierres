import { Metadata } from 'next'
import { Suspense } from 'react'
import { getServiceSupabase } from '@/lib/supabase'
import { ProductFilters } from '@/components/products/product-filters'
import { ProductCard } from '@/components/products/product-card'
import { Product } from '@/types/database'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export const metadata: Metadata = {
  title: 'Todos los Productos | YB MOTOCOM',
  description:
    'Explora nuestro catálogo completo de accesorios para motociclistas. Cascos, guantes, chaquetas, protecciones y más. Envíos a toda Colombia.',
  openGraph: {
    title: 'Todos los Productos | YB MOTOCOM',
    description:
      'Catálogo completo de accesorios para motos. Encuentra lo que necesitas.',
  },
}

interface PageProps {
  searchParams: {
    category?: string
    minPrice?: string
    maxPrice?: string
    inStock?: string
    sortBy?: string
    page?: string
  }
}

const PRODUCTS_PER_PAGE = 20

export default async function ProductosPage({ searchParams }: PageProps) {
  const supabase = getServiceSupabase()

  // Parse search params
  const categoryIds = searchParams.category?.split(',')
  const minPrice = searchParams.minPrice ? parseInt(searchParams.minPrice) : undefined
  const maxPrice = searchParams.maxPrice ? parseInt(searchParams.maxPrice) : undefined
  const inStock = searchParams.inStock === 'true'
  const sortBy = searchParams.sortBy || 'newest'
  const page = searchParams.page ? parseInt(searchParams.page) : 1

  // Fetch categories with product count
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  // Build products query
  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('active', true)

  // Apply filters
  if (categoryIds && categoryIds.length > 0) {
    query = query.in('category_id', categoryIds)
  }
  if (minPrice !== undefined) {
    query = query.gte('price_cents', minPrice * 100)
  }
  if (maxPrice !== undefined) {
    query = query.lte('price_cents', maxPrice * 100)
  }
  if (inStock) {
    query = query.gt('stock_qty', 0)
  }

  // Apply sorting
  const orderMap: Record<string, [string, { ascending: boolean }]> = {
    price_asc: ['price_cents', { ascending: true }],
    price_desc: ['price_cents', { ascending: false }],
    newest: ['created_at', { ascending: false }],
    name: ['title', { ascending: true }],
  }
  const [orderField, orderOptions] = orderMap[sortBy] || orderMap.newest
  query = query.order(orderField, orderOptions)

  // Apply pagination
  const offset = (page - 1) * PRODUCTS_PER_PAGE
  query = query.range(offset, offset + PRODUCTS_PER_PAGE - 1)

  // Execute query
  const { data: products, error, count } = await query

  if (error) {
    console.error('Error fetching products:', error)
  }

  const totalProducts = count || 0
  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE)

  // Calculate max price for slider
  const { data: priceRange } = await supabase
    .from('products')
    .select('price_cents')
    .eq('active', true)
    .order('price_cents', { ascending: false })
    .limit(1)
    .single()

  const maxPriceValue = priceRange ? Math.ceil((priceRange as any).price_cents / 100) : 1000000

  // Generate pagination params
  const buildPageUrl = (newPage: number) => {
    const params = new URLSearchParams(searchParams as any)
    params.set('page', newPage.toString())
    return `?${params.toString()}`
  }

  return (
    <div className="container py-8 md:py-12">
      {/* Breadcrumbs */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Productos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Todos los Productos
        </h1>
        <p className="text-muted-foreground">
          {totalProducts > 0
            ? `Mostrando ${Math.min(offset + 1, totalProducts)}-${Math.min(
                offset + PRODUCTS_PER_PAGE,
                totalProducts
              )} de ${totalProducts} producto${totalProducts !== 1 ? 's' : ''}`
            : 'No se encontraron productos'}
        </p>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-8">
        {/* Filters Sidebar */}
        <aside>
          <Suspense fallback={<div>Cargando filtros...</div>}>
            <ProductFilters
              categories={categories || []}
              minPrice={0}
              maxPrice={maxPriceValue}
            />
          </Suspense>
        </aside>

        {/* Products Grid */}
        <div>
          {products && products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                {products.map((product: any) => (
                  <ProductCard key={product.id} product={product as Product} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    asChild
                  >
                    <Link href={buildPageUrl(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      // Show first 2, current page, last 2
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (page <= 3) {
                        pageNum = i + 1
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = page - 2 + i
                      }

                      return (
                        <Button
                          key={i}
                          variant={pageNum === page ? 'default' : 'outline'}
                          size="icon"
                          className="w-10"
                          asChild
                        >
                          <Link href={buildPageUrl(pageNum)}>{pageNum}</Link>
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= totalPages}
                    asChild
                  >
                    <Link href={buildPageUrl(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-2xl font-semibold mb-2">
                No se encontraron productos
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md">
                No hay productos que coincidan con los filtros seleccionados.
                Intenta ajustar los filtros o explorar todas las categorías.
              </p>
              <Button asChild>
                <Link href="/productos">Ver todos los productos</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
