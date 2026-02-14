import { Metadata } from 'next'
import { getServiceSupabase } from '@/lib/supabase'
import { ProductCard } from '@/components/products/product-card'
import { Product } from '@/types/database'
import { Flame, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export const metadata: Metadata = {
  title: 'Ofertas Especiales | YB MOTOCOM',
  description:
    'Descubre nuestras ofertas especiales en accesorios para motociclistas. Descuentos de hasta 50% en cascos, guantes, chaquetas y más. ¡Aprovecha ahora!',
  openGraph: {
    title: 'Ofertas Especiales | YB MOTOCOM',
    description:
      'Ofertas especiales en accesorios para motos. Descuentos de hasta 50%.',
    images: ['/images/ofertas-og.jpg'],
  },
}

export default async function OfertasPage() {
  const supabase = getServiceSupabase()

  // Fetch products with discounts (compare_at_price_cents > price_cents)
  const { data: products, error } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .eq('active', true)
    .not('compare_at_price_cents', 'is', null)
    .gt('compare_at_price_cents', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching ofertas:', error)
  }

  // Filter products where compare_at_price_cents > price_cents
  const discountedProducts =
    products?.filter((p: any) => p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents) || []

  // Calculate discount percentage and sort by discount (highest first)
  const productsWithDiscount = discountedProducts
    .map((product: any) => ({
      ...product,
      discountPercent: product.compare_at_price_cents
        ? Math.round(
            ((product.compare_at_price_cents - product.price_cents) /
              product.compare_at_price_cents) *
              100
          )
        : 0,
    }))
    .sort((a: any, b: any) => b.discountPercent - a.discountPercent)

  // Calculate average discount
  const averageDiscount =
    productsWithDiscount.length > 0
      ? Math.round(
          productsWithDiscount.reduce((sum: number, p: any) => sum + p.discountPercent, 0) /
            productsWithDiscount.length
        )
      : 0

  // Find max discount
  const maxDiscount =
    productsWithDiscount.length > 0
      ? Math.max(...productsWithDiscount.map((p: any) => p.discountPercent))
      : 0

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
            <BreadcrumbPage>Ofertas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Hero Section */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-full mb-6 animate-pulse">
          <Flame className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 bg-clip-text text-transparent">
          Ofertas Especiales
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Descubre nuestras mejores ofertas en accesorios para motociclistas.
          {maxDiscount > 0 && (
            <span className="block mt-2 font-semibold text-primary">
              ¡Descuentos de hasta {maxDiscount}%!
            </span>
          )}
        </p>
      </div>

      {/* Stats */}
      {productsWithDiscount.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="p-6 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 rounded-lg border border-red-200 dark:border-red-900">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {productsWithDiscount.length}
            </div>
            <div className="text-sm text-muted-foreground">
              Productos en oferta
            </div>
          </div>
          <div className="p-6 bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950/20 dark:to-yellow-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {maxDiscount}%
            </div>
            <div className="text-sm text-muted-foreground">
              Descuento máximo
            </div>
          </div>
          <div className="p-6 bg-gradient-to-br from-yellow-50 to-green-50 dark:from-yellow-950/20 dark:to-green-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              {averageDiscount}%
            </div>
            <div className="text-sm text-muted-foreground">
              Descuento promedio
            </div>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {productsWithDiscount.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {productsWithDiscount.map((product) => (
            <div key={product.id} className="relative">
              {/* Discount Badge Overlay */}
              {product.discountPercent >= 30 && (
                <div className="absolute -top-2 -right-2 z-10">
                  <Badge className="bg-gradient-to-r from-red-600 to-orange-600 text-white border-0 text-sm font-bold px-3 py-1 shadow-lg">
                    -{product.discountPercent}%
                  </Badge>
                </div>
              )}
              <ProductCard product={product as Product} />
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-20 w-20 text-muted-foreground mb-6 opacity-50" />
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">
            No hay ofertas disponibles
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            En este momento no tenemos productos en oferta. Vuelve pronto para
            descubrir nuestras próximas promociones o explora nuestro catálogo
            completo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/productos">Ver todos los productos</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/">Ir al inicio</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Call to Action */}
      {productsWithDiscount.length > 0 && (
        <div className="mt-12 p-8 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg border border-primary/20 text-center">
          <h2 className="text-2xl font-bold mb-3">¿No encontraste lo que buscabas?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Explora nuestro catálogo completo con cientos de productos para motociclistas
          </p>
          <Button asChild size="lg" variant="neon">
            <Link href="/productos">Ver todos los productos</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
