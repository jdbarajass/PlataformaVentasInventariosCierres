import Link from 'next/link'
import {
  ArrowRight, Shield, Truck, CreditCard, Headphones,
  HardHat, Hand, Shirt, Wrench, Bike, Navigation, Mountain, Package,
  type LucideIcon,
} from 'lucide-react'
import { ProductCard } from '@/components/products/product-card'
import { supabase } from '@/lib/supabase'
import { Product } from '@/types/database'

/* ─── Trust badges ─────────────────────────────────────────────── */
const trustBadges = [
  { icon: Truck,       label: 'Envío rápido',      sub: 'Entrega en 24–48 h'       },
  { icon: Shield,      label: 'Pago seguro',        sub: 'SSL + 3DS protegido'      },
  { icon: CreditCard,  label: 'Cuotas sin interés', sub: 'Hasta 12 cuotas'          },
  { icon: Headphones,  label: 'Asesor WhatsApp',    sub: 'Lunes a sábado 8–7 pm'    },
]

/* ─── Quick-filter chips ────────────────────────────────────────── */
const filterChips = [
  { name: 'Cascos',      href: '/categoria/cascos',     icon: HardHat },
  { name: 'Guantes',     href: '/categoria/guantes',    icon: Hand    },
  { name: 'Chaquetas',   href: '/categoria/chaquetas',  icon: Shirt   },
  { name: 'Accesorios',  href: '/categoria/accesorios', icon: Wrench  },
]

/* ─── Compra por uso (cards) ────────────────────────────────────── */
const useCases: { name: string; description: string; icon: LucideIcon; color: string }[] = [
  { name: 'Urbano',    description: 'Cascos y guantes para ciudad',         icon: Bike,        color: 'from-blue-500/20 to-blue-600/10'   },
  { name: 'Touring',   description: 'Equipamiento para largo recorrido',    icon: Navigation,  color: 'from-amber-500/20 to-amber-600/10' },
  { name: 'Off-Road',  description: 'Protección para terreno extremo',      icon: Mountain,    color: 'from-green-500/20 to-green-600/10' },
  { name: 'Delivery',  description: 'Comodidad y durabilidad para trabajo', icon: Package,     color: 'from-primary/20 to-primary/10'     },
]

/* ─── Brand logos (placeholder names) ───────────────────────────── */
const brands = [
  'AGV', 'HJC', 'Shoei', 'Bell', 'Alpinestars', 'Fox', 'Klim', 'Dainese',
]

/* ─── Data fetch ─────────────────────────────────────────────────── */
async function getFeaturedProducts(): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .eq('featured', true)
    .limit(8)
    .order('created_at', { ascending: false })
  return (data as Product[]) || []
}

/* ═══════════════════════════════════════════════════════════════════ */
export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts()

  return (
    <div className="flex flex-col">

      {/* ─────────────────────── HERO ────────────────────────────── */}
      <section className="relative overflow-hidden hero-gradient">

        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_50%,rgba(225,6,0,0.08)_0%,transparent_70%)]" />

        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="container relative z-10 py-24 lg:py-36">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 items-center">

            {/* Left: copy */}
            <div className="space-y-8 animate-slide-up">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-semibold tracking-[0.12em] uppercase text-primary">
                  Importadores Oficiales · Colombia
                </span>
              </div>

              <h1 className="text-4xl font-black tracking-tight leading-[1.05] sm:text-5xl lg:text-6xl xl:text-7xl">
                Equipa tu{' '}
                <span className="glow-text">aventura</span>
                <br />
                <span className="text-foreground/80">sobre ruedas</span>
              </h1>

              <p className="max-w-md text-base sm:text-lg text-muted-foreground leading-relaxed">
                La mejor selección de cascos, guantes, chaquetas y accesorios
                para motociclistas. Seguridad certificada, estilo sin concesiones.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/categoria/cascos"
                  className="btn-racing group inline-flex items-center gap-2 text-sm"
                >
                  Comprar ahora
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/categoria/cascos"
                  className="btn-outline-racing inline-flex items-center gap-2 text-sm"
                >
                  Ver cascos
                </Link>
              </div>

              {/* Mini trust */}
              <div className="flex flex-wrap gap-4 pt-2">
                {['Envío gratis +$200k', 'Garantía oficial', 'Pago seguro'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: visual placeholder */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/20 to-transparent blur-3xl opacity-40" />
              <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden border border-border/30 bg-secondary/30 flex items-center justify-center">
                <div className="text-center space-y-2 p-8">
                  <div className="text-7xl sm:text-8xl font-black glow-text tracking-tighter">YB</div>
                  <div className="text-xl sm:text-2xl font-bold tracking-[0.12em] uppercase text-foreground/70">
                    MOTOCOM
                  </div>
                  <div className="text-xs text-muted-foreground tracking-widest uppercase mt-4">
                    Racing Dark Premium
                  </div>
                </div>
                {/* Decorative glow */}
                <div className="absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ────────────── TRUST BADGES ──────────────────────────────── */}
      <section className="border-y border-border/50 bg-secondary/20 py-8">
        <div className="container">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustBadges.map((badge) => (
              <div
                key={badge.label}
                className="card-glass flex items-center gap-4 rounded-xl px-5 py-4 hover:border-primary/30 transition-all"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <badge.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{badge.label}</p>
                  <p className="text-xs text-muted-foreground">{badge.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── QUICK FILTER CHIPS ───────────────────────── */}
      <section className="py-10">
        <div className="container">
          <p className="mb-5 text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground text-center">
            Explora por categoría
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {filterChips.map((chip) => (
              <Link key={chip.name} href={chip.href}>
                <div className="group flex items-center gap-2 rounded-full border border-border/50 bg-card px-5 py-2.5 transition-all duration-200 hover:border-primary/50 hover:bg-primary/10 hover:shadow-glow-red-sm cursor-pointer">
                  <chip.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                    {chip.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── COMPRA POR USO ────────────────────────────── */}
      <section className="py-16 lg:py-24 bg-secondary/20 border-y border-border/50">
        <div className="container">
          <div className="mb-10 text-center space-y-2">
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-primary">
              Encuentra lo que necesitas
            </p>
            <h2 className="text-2xl sm:text-3xl font-black">Compra por tipo de uso</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Equipamiento seleccionado según cómo usas tu moto
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((uc) => (
              <Link
                key={uc.name}
                href={`/productos?uso=${uc.name.toLowerCase()}`}
                className="group"
              >
                <div className="relative h-44 overflow-hidden rounded-2xl border border-border/40 bg-card transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-card-hover group-hover:-translate-y-1 flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer">
                  <div className={`absolute inset-0 bg-gradient-to-br ${uc.color} transition-opacity opacity-60 group-hover:opacity-100`} />
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card/80 border border-border/50 group-hover:border-primary/40 transition-all group-hover:scale-110">
                      <uc.icon className="h-6 w-6 text-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base group-hover:text-primary transition-colors">
                        {uc.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{uc.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Ver productos <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── FEATURED PRODUCTS ────────────────────────── */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="mb-10 flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase text-primary">
                Selección premium
              </p>
              <h2 className="text-2xl sm:text-3xl font-black">Productos Destacados</h2>
            </div>
            <Link href="/productos" className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
              Ver todos
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {featuredProducts.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/50 p-12 text-center">
              <HardHat className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No hay productos destacados disponibles.</p>
              <p className="mt-1 text-sm text-muted-foreground/60">
                Configura los productos en el panel de administración.
              </p>
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link
              href="/productos"
              className="btn-outline-racing text-sm inline-flex items-center gap-2"
            >
              Ver todos los productos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ────────────── BRANDS CAROUSEL ───────────────────────────── */}
      <section className="py-12 border-y border-border/50 bg-secondary/20 overflow-hidden">
        <div className="container">
          <p className="text-center text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-6">
            Marcas oficiales · Importadores certificados
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {brands.map((brand) => (
              <div
                key={brand}
                className="flex items-center justify-center rounded-xl border border-border/40 bg-card px-6 py-3 transition-all duration-200 hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="text-sm font-bold tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors">
                  {brand}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── CTA NEWSLETTER ────────────────────────────── */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-8 lg:p-14">
            {/* Glow decoration */}
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-xl">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase text-primary mb-3">
                Newsletter exclusivo
              </p>
              <h2 className="text-2xl sm:text-3xl font-black leading-tight">
                Ofertas y novedades
                <br />
                <span className="glow-text">directo a tu correo</span>
              </h2>
              <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
                Recibe descuentos exclusivos, lanzamientos y consejos para motociclistas.
                Sin spam, solo lo que importa.
              </p>
              <form className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  className="flex-1 rounded-xl border border-border/50 bg-secondary/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <button
                  type="submit"
                  className="btn-racing text-sm shrink-0 inline-flex items-center gap-2"
                >
                  Suscribirme
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
