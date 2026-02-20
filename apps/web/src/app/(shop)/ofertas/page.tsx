import { Metadata } from 'next'
import { getServiceSupabase } from '@/lib/supabase'
import { ProductCard } from '@/components/products/product-card'
import { Product } from '@/types/database'
import { Flame, Package, ArrowRight, Bell, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export const metadata: Metadata = {
  title: 'Ofertas Especiales | YB MOTOCOM',
  description:
    'Descubre nuestras ofertas especiales en accesorios para motociclistas. Descuentos de hasta 50% en cascos, guantes, chaquetas y más. ¡Aprovecha ahora!',
  openGraph: {
    title: 'Ofertas Especiales | YB MOTOCOM',
    description: 'Ofertas especiales en accesorios para motos. Descuentos de hasta 50%.',
    images: ['/images/ofertas-og.jpg'],
  },
}

export default async function OfertasPage() {
  const supabase = getServiceSupabase()

  const { data: products, error } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .eq('active', true)
    .not('compare_at_price_cents', 'is', null)
    .gt('compare_at_price_cents', 0)
    .order('created_at', { ascending: false })

  if (error) console.error('Error fetching ofertas:', error)

  const discountedProducts =
    products?.filter((p: any) => p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents) || []

  const productsWithDiscount = discountedProducts
    .map((product: any) => ({
      ...product,
      discountPercent: product.compare_at_price_cents
        ? Math.round(((product.compare_at_price_cents - product.price_cents) / product.compare_at_price_cents) * 100)
        : 0,
    }))
    .sort((a: any, b: any) => b.discountPercent - a.discountPercent)

  const averageDiscount =
    productsWithDiscount.length > 0
      ? Math.round(productsWithDiscount.reduce((sum: number, p: any) => sum + p.discountPercent, 0) / productsWithDiscount.length)
      : 0

  const maxDiscount =
    productsWithDiscount.length > 0
      ? Math.max(...productsWithDiscount.map((p: any) => p.discountPercent))
      : 0

  return (
    <div className="min-h-screen">

      {/* ─── Hero section ─── */}
      <section className="relative overflow-hidden bg-secondary/15 border-b border-border/40 py-16 lg:py-20">
        <div className="absolute inset-0 aurora-bg" />
        <div className="absolute inset-0 carbon-texture opacity-30" />
        {/* Flame glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-primary/8 blur-[100px] pointer-events-none animate-breathe" />

        <div className="container relative text-center space-y-5">
          <Breadcrumb className="justify-center">
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

          {/* Flame icon */}
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 mx-auto"
               style={{ boxShadow: '0 0 48px rgba(225,6,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
            <Flame className="h-10 w-10 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-black">
            <span className="glow-text">Ofertas Especiales</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Las mejores ofertas en accesorios para motociclistas.{' '}
            {maxDiscount > 0 && (
              <span className="font-semibold text-primary">
                ¡Descuentos de hasta {maxDiscount}%!
              </span>
            )}
          </p>
        </div>
      </section>

      <div className="container py-10 md:py-14">

        {/* ─── Stats glass cards ─── */}
        {productsWithDiscount.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
            {[
              { value: productsWithDiscount.length, label: 'Productos en oferta', color: 'text-primary' },
              { value: `${maxDiscount}%`,            label: 'Descuento máximo',   color: 'text-amber-500' },
              { value: `${averageDiscount}%`,        label: 'Descuento promedio', color: 'text-green-500' },
            ].map(stat => (
              <div key={stat.label} className="card-glass rounded-2xl p-6 text-center space-y-1 border border-border/40 hover:border-primary/30 transition-all">
                <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ─── Products Grid ─── */}
        {productsWithDiscount.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {productsWithDiscount.map((product) => (
                <div key={product.id} className="relative">
                  {product.discountPercent >= 30 && (
                    <div className="absolute -top-2 -right-2 z-10">
                      <Badge className="bg-gradient-to-r from-red-600 to-orange-600 text-white border-0 text-sm font-bold px-3 py-1"
                             style={{ boxShadow: '0 4px 16px rgba(225,6,0,0.4)' }}>
                        -{product.discountPercent}%
                      </Badge>
                    </div>
                  )}
                  <ProductCard product={product as Product} />
                </div>
              ))}
            </div>

            {/* CTA bottom */}
            <div className="mt-14 relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-8 text-center">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/8 blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-xl font-bold mb-2">¿No encontraste lo que buscabas?</h2>
                <p className="text-muted-foreground text-sm mb-5">
                  Explora nuestro catálogo completo con cientos de productos para motociclistas
                </p>
                <Button asChild className="btn-racing inline-flex items-center gap-2 text-sm" variant="default">
                  <Link href="/productos">
                    Ver todos los productos <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        ) : (

          /* ─── PREMIUM EMPTY STATE ─── */
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative max-w-lg w-full">
              {/* Glow behind card */}
              <div className="absolute inset-4 rounded-3xl bg-primary/8 blur-3xl animate-breathe pointer-events-none" />

              <div className="relative card-glass rounded-3xl border border-border/40 p-10 text-center space-y-7">
                {/* Top line */}
                <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                {/* Icon */}
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border/50">
                  <Package className="h-10 w-10 text-muted-foreground/60" />
                </div>

                <div className="space-y-3">
                  <h2 className="text-2xl font-black">Sin ofertas por ahora</h2>
                  <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto text-sm">
                    En este momento no tenemos productos en oferta.
                    Vuelve pronto o suscríbete para ser el primero en enterarte de nuestras próximas promociones.
                  </p>
                </div>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/productos"
                    className="btn-racing inline-flex items-center justify-center gap-2 text-sm"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Ver catálogo completo
                  </Link>
                  <Link
                    href="/"
                    className="btn-outline-racing inline-flex items-center justify-center gap-2 text-sm"
                  >
                    <Bell className="h-4 w-4" />
                    Suscribirme a alertas
                  </Link>
                </div>

                {/* Trust pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-border/40 px-4 py-2 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Nuevas ofertas cada semana
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
