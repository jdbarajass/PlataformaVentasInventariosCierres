import { Metadata } from 'next'
import { Suspense } from 'react'
import { getServiceSupabase } from '@/lib/supabase'
import { ProductFilters } from '@/components/products/product-filters'
import { ProductCard } from '@/components/products/product-card'
import { Product } from '@/types/database'
import { ChevronLeft, ChevronRight, Package, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

// Same issue as the home page: without this, this listing is rendered
// once at build time and never reflects new/edited products from the
// admin panel until the next deploy.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Todos los Productos | YJBMOTOCOM',
  description:
    'Explora nuestro catálogo completo de accesorios para motociclistas. Cascos, guantes, chaquetas, protecciones y más. Envíos a toda Colombia.',
  openGraph: {
    title: 'Todos los Productos | YJBMOTOCOM',
    description: 'Catálogo completo de accesorios para motos. Encuentra lo que necesitas.',
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

const sortOptions = [
  { value: 'newest',     label: 'Más recientes' },
  { value: 'price_asc',  label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'name',       label: 'Nombre A–Z' },
]

export default async function ProductosPage({ searchParams }: PageProps) {
  const supabase = getServiceSupabase()

  const categoryIds = searchParams.category?.split(',')
  const minPrice    = searchParams.minPrice ? parseInt(searchParams.minPrice) : undefined
  const maxPrice    = searchParams.maxPrice ? parseInt(searchParams.maxPrice) : undefined
  const inStock     = searchParams.inStock === 'true'
  const sortBy      = searchParams.sortBy || 'newest'
  const page        = searchParams.page ? parseInt(searchParams.page) : 1

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  let query = supabase
    .from('products')
    .select('*, product_variants(id, talla, stock_qty, active)', { count: 'exact' })
    .eq('active', true)

  if (categoryIds && categoryIds.length > 0) query = query.in('category_id', categoryIds)
  if (minPrice !== undefined) query = query.gte('price_cents', minPrice * 100)
  if (maxPrice !== undefined) query = query.lte('price_cents', maxPrice * 100)
  if (inStock) query = query.gt('stock_qty', 0)

  const orderMap: Record<string, [string, { ascending: boolean }]> = {
    price_asc:  ['price_cents', { ascending: true }],
    price_desc: ['price_cents', { ascending: false }],
    newest:     ['created_at',  { ascending: false }],
    name:       ['title',       { ascending: true }],
  }
  const [orderField, orderOptions] = orderMap[sortBy] || orderMap.newest
  query = query.order(orderField, orderOptions)

  const offset = (page - 1) * PRODUCTS_PER_PAGE
  query = query.range(offset, offset + PRODUCTS_PER_PAGE - 1)

  const { data: products, error, count } = await query
  if (error) console.error('Error fetching products:', error)

  const totalProducts = count || 0
  const totalPages    = Math.ceil(totalProducts / PRODUCTS_PER_PAGE)

  const { data: priceRange } = await supabase
    .from('products')
    .select('price_cents')
    .eq('active', true)
    .order('price_cents', { ascending: false })
    .limit(1)
    .single()

  const maxPriceValue = priceRange ? Math.ceil((priceRange as any).price_cents / 100) : 1000000

  const buildPageUrl = (newPage: number) => {
    const params = new URLSearchParams(searchParams as any)
    params.set('page', newPage.toString())
    return `?${params.toString()}`
  }

  const hasFilters = categoryIds?.length || minPrice || maxPrice || inStock

  return (
    <div className="min-h-screen">

      {/* ─── Sticky top bar ─── */}
      <div className="sticky top-16 z-30 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="container py-3 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" className="text-xs">Inicio</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs">Productos</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Count + sort */}
          <div className="flex items-center gap-3">
            {totalProducts > 0 && (
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {Math.min(offset + 1, totalProducts)}–{Math.min(offset + PRODUCTS_PER_PAGE, totalProducts)} de{' '}
                <span className="font-semibold text-foreground">{totalProducts}</span>
              </span>
            )}
            <div className="relative">
              <select
                className="appearance-none rounded-xl border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs font-medium cursor-pointer hover:border-border transition-colors focus:outline-none pr-7"
                defaultValue={sortBy}
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 rotate-90 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Page header ─── */}
      <div className="container pt-8 pb-2">
        <div className="space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-black">Todos los Productos</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {totalProducts > 0
                ? `${totalProducts} producto${totalProducts !== 1 ? 's' : ''} disponible${totalProducts !== 1 ? 's' : ''}`
                : 'No se encontraron productos'}
            </p>
            {hasFilters && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-semibold">
                <SlidersHorizontal className="h-2.5 w-2.5" />
                Filtros activos
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main layout ─── */}
      <div className="container py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-8">

          {/* Filters Sidebar */}
          <aside>
            <Suspense fallback={
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton h-12 rounded-xl" />
                ))}
              </div>
            }>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {products.map((product: any) => (
                    <ProductCard key={product.id} product={product as Product} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-14 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page <= 1}
                      className="rounded-xl border-border/50 hover:border-primary/40 disabled:opacity-40"
                      asChild
                    >
                      <Link href={buildPageUrl(page - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 5) pageNum = i + 1
                        else if (page <= 3) pageNum = i + 1
                        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                        else pageNum = page - 2 + i

                        return (
                          <Button
                            key={i}
                            variant={pageNum === page ? 'default' : 'outline'}
                            size="icon"
                            className={pageNum === page
                              ? 'w-10 rounded-xl shadow-glow-red-sm'
                              : 'w-10 rounded-xl border-border/50 hover:border-primary/40'}
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
                      className="rounded-xl border-border/50 hover:border-primary/40 disabled:opacity-40"
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
              /* ─── Premium empty state ─── */
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="relative mb-6">
                  <div className="h-24 w-24 rounded-3xl bg-secondary/50 border border-border/40 flex items-center justify-center mx-auto">
                    <Package className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                  <div className="absolute -inset-4 rounded-full bg-primary/5 blur-2xl animate-breathe pointer-events-none" />
                </div>
                <h2 className="text-xl font-bold mb-2">Sin resultados</h2>
                <p className="text-muted-foreground mb-6 max-w-xs text-sm">
                  No hay productos que coincidan con los filtros seleccionados.
                  Intenta ajustar los filtros o explorar todas las categorías.
                </p>
                <Button asChild variant="default">
                  <Link href="/productos">Ver todos los productos</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
