import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Shield, Truck, CreditCard, Headphones } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProductCard } from '@/components/products/product-card'
import { supabase } from '@/lib/supabase'

const features = [
  {
    icon: Shield,
    title: 'Productos Certificados',
    description: 'Todos nuestros productos cumplen con las normas de seguridad',
  },
  {
    icon: Truck,
    title: 'Envio Gratis',
    description: 'En compras mayores a $200.000 COP',
  },
  {
    icon: CreditCard,
    title: 'Pago Seguro',
    description: 'Multiples metodos de pago disponibles',
  },
  {
    icon: Headphones,
    title: 'Soporte 24/7',
    description: 'Estamos aqui para ayudarte siempre',
  },
]

const categories = [
  { name: 'Cascos', slug: 'cascos', image: '/images/categories/cascos.jpg' },
  { name: 'Guantes', slug: 'guantes', image: '/images/categories/guantes.jpg' },
  { name: 'Chaquetas', slug: 'chaquetas', image: '/images/categories/chaquetas.jpg' },
  { name: 'Accesorios', slug: 'accesorios', image: '/images/categories/accesorios.jpg' },
]

async function getFeaturedProducts() {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .eq('featured', true)
    .limit(8)
    .order('created_at', { ascending: false })

  return data || []
}

export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts()

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/10 py-20 lg:py-32">
        <div className="container relative z-10">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-6">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Equipa tu{' '}
                <span className="glow-text">aventura</span>
                <br />
                sobre ruedas
              </h1>
              <p className="max-w-lg text-lg text-muted-foreground">
                Descubre la mejor seleccion de cascos, guantes, chaquetas y
                accesorios para motociclistas. Seguridad y estilo en cada viaje.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/categoria/cascos">
                  <Button variant="neon" size="lg">
                    Explorar catalogo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/ofertas">
                  <Button variant="outline" size="lg">
                    Ver ofertas
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative aspect-square lg:aspect-[4/3]">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 blur-3xl" />
              <div className="relative h-full w-full rounded-3xl bg-secondary/50 flex items-center justify-center overflow-hidden">
                <div className="text-center p-8">
                  <div className="text-8xl font-bold glow-text mb-4">YB</div>
                  <div className="text-2xl font-semibold">MOTOCOM</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/5 to-transparent" />
      </section>

      {/* Features */}
      <section className="border-y bg-secondary/30 py-12">
        <div className="container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold">Categorias</h2>
              <p className="mt-2 text-muted-foreground">
                Encuentra exactamente lo que necesitas
              </p>
            </div>
            <Link href="/categorias" className="hidden sm:block">
              <Button variant="ghost">
                Ver todas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Link key={category.slug} href={`/categoria/${category.slug}`}>
                <Card className="group h-48 overflow-hidden border-0">
                  <CardContent className="relative flex h-full items-end p-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-600/20" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/50 to-transparent" />
                    <div className="relative z-10 p-6">
                      <h3 className="text-xl font-semibold transition-colors group-hover:text-primary">
                        {category.name}
                      </h3>
                      <span className="mt-1 flex items-center text-sm text-muted-foreground">
                        Explorar
                        <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="bg-secondary/30 py-16 lg:py-24">
        <div className="container">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold">Productos Destacados</h2>
              <p className="mt-2 text-muted-foreground">
                Los favoritos de nuestros clientes
              </p>
            </div>
            <Link href="/productos" className="hidden sm:block">
              <Button variant="ghost">
                Ver todos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {featuredProducts.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed p-12 text-center">
              <p className="text-muted-foreground">
                No hay productos destacados disponibles.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Configura los productos en el panel de administracion.
              </p>
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link href="/productos">
              <Button variant="outline">
                Ver todos los productos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 p-8 lg:p-16">
            <div className="relative z-10 max-w-xl">
              <h2 className="text-3xl font-bold text-white lg:text-4xl">
                Suscribete a nuestro boletin
              </h2>
              <p className="mt-4 text-white/80">
                Recibe ofertas exclusivas, novedades y consejos para motociclistas
                directamente en tu correo.
              </p>
              <form className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  className="flex-1 rounded-xl border-0 bg-white/20 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
                />
                <Button
                  type="submit"
                  className="bg-white text-primary hover:bg-white/90"
                  size="lg"
                >
                  Suscribirse
                </Button>
              </form>
            </div>

            {/* Decoration */}
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          </div>
        </div>
      </section>
    </div>
  )
}
