import Link from 'next/link'
import {
  ArrowRight, Shield, Truck, CreditCard, Headphones,
  HardHat, Hand, Shirt, Wrench, Bike, Navigation, Mountain, Package,
  Zap, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { ProductCard } from '@/components/products/product-card'
import { supabase } from '@/lib/supabase'
import { Product } from '@/types/database'
import { WebPageSchema } from '@/components/seo/structured-data'
import { BRAND } from '@/config/brand'

// Without this, Next.js statically renders the home page once at build
// time and serves that same snapshot forever — new/edited products and
// images from the admin panel wouldn't show up here even though they
// show up immediately on /producto/[slug] (which is force-dynamic).
export const revalidate = 60

/* ─── Trust badges ─── */
const trustBadges = [
  { icon: Truck,       label: 'Envío rápido',       sub: 'Entrega en 24–48 h'  },
  { icon: Shield,      label: 'Pago 100% seguro',   sub: 'SSL + 3DS protegido' },
  { icon: CreditCard,  label: 'Cuotas sin interés', sub: 'Hasta 12 cuotas'     },
  { icon: Headphones,  label: 'Asesor WhatsApp',    sub: 'Lunes–Sáb · 8–7 pm' },
]

/* ─── Quick-filter chips ─── */
const filterChips = [
  { name: 'Cascos',     href: '/categoria/cascos',     icon: HardHat },
  { name: 'Guantes',    href: '/categoria/guantes',    icon: Hand    },
  { name: 'Chaquetas',  href: '/categoria/chaquetas',  icon: Shirt   },
  { name: 'Accesorios', href: '/categoria/accesorios', icon: Wrench  },
]

/* ─── Use-case cards ─── */
const useCases: { name: string; description: string; icon: LucideIcon; color: string; href: string }[] = [
  { name: 'Urbano',   description: 'Cascos y guantes para la ciudad',         icon: Bike,       color: 'from-blue-500/20  to-blue-600/5',  href: '/productos?uso=urbano'   },
  { name: 'Touring',  description: 'Equipamiento para largo recorrido',       icon: Navigation, color: 'from-amber-500/20 to-amber-600/5', href: '/productos?uso=touring'  },
  { name: 'Off-Road', description: 'Protección para terreno extremo',         icon: Mountain,   color: 'from-green-500/20 to-green-600/5', href: '/productos?uso=off-road' },
  { name: 'Delivery', description: 'Comodidad y durabilidad para el trabajo', icon: Package,    color: 'from-primary/20   to-primary/5',   href: '/productos?uso=delivery' },
]

/* ─── Brand logos ─── */
const brands = ['AGV', 'HJC', 'Shoei', 'Bell', 'Alpinestars', 'Fox', 'Klim', 'Dainese', 'Arai', 'Nolan']

/* ─── Newsletter benefits ─── */
const newsletterBenefits = [
  'Descuentos exclusivos solo para suscriptores',
  'Primero en conocer nuevas llegadas',
  'Tips de seguridad y mantenimiento',
]

/* ─── Data fetch ─── */
async function getFeaturedProducts(): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('*, product_variants(id, talla, stock_qty, active)')
    .eq('active', true)
    .eq('featured', true)
    .limit(8)
    .order('created_at', { ascending: false })
  return (data as unknown as Product[]) || []
}

// Cuenta real de productos activos — nunca un número inventado en la
// tarjeta destacada de la portada (ver BRAND.heroClientsStat/heroYearsStat).
async function getActiveProductCount(): Promise<number> {
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)
  return count || 0
}

/* ═══════════════════════════════════════════════════════════════════ */
export default async function HomePage() {
  const [featuredProducts, activeProductCount] = await Promise.all([
    getFeaturedProducts(),
    getActiveProductCount(),
  ])

  const heroStats = [
    BRAND.heroClientsStat,
    { value: `+${activeProductCount}`, label: 'Productos' },
    BRAND.heroYearsStat,
  ]

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yjbmotocom.com'

  return (
    <div className="flex flex-col">
      <WebPageSchema
        name="YJBMOTOCOM - Equipamiento para Motociclistas"
        description="Tienda especializada en accesorios y equipamiento para motociclistas en Colombia: cascos, guantes, chaquetas y más."
        url={baseUrl}
      />

      {/* ═══════════════════════════════════
          HERO — cinemático
      ═══════════════════════════════════ */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 carbon-texture" />
        <div className="absolute inset-0 aurora-bg" />

        {/* Grid lines */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Animated glow orbs */}
        <div className="absolute top-1/4 right-[15%] h-[500px] w-[500px] rounded-full bg-primary/8 blur-[120px] pointer-events-none animate-breathe" />
        <div className="absolute bottom-1/4 left-[10%] h-72 w-72 rounded-full bg-orange-500/5 blur-[100px] pointer-events-none animate-breathe delay-300" />

        <div className="container relative z-10 py-24 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">

            {/* Left: copy */}
            <div className="space-y-8 animate-slide-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-4 py-1.5 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-semibold tracking-[0.12em] uppercase text-primary">
                  Importadores Oficiales · Colombia
                </span>
              </div>

              <h1 className="text-4xl font-black tracking-tight leading-[1.05] sm:text-5xl lg:text-6xl xl:text-7xl">
                Equipa tu{' '}
                <span className="text-aurora">aventura</span>
                <br />
                <span className="text-foreground/80">sobre ruedas</span>
              </h1>

              <p className="max-w-md text-base sm:text-lg text-muted-foreground leading-relaxed">
                La mejor selección de cascos, guantes, chaquetas y accesorios
                para motociclistas. Seguridad certificada, estilo sin concesiones.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/categoria/cascos" className="btn-racing group inline-flex items-center gap-2 text-sm">
                  Comprar ahora
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/productos" className="btn-outline-racing inline-flex items-center gap-2 text-sm">
                  Ver catálogo
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                {['Envío gratis +$200k', 'Garantía oficial', 'Pago seguro'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: premium glass card */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-8 rounded-3xl bg-gradient-to-br from-primary/25 via-primary/8 to-transparent blur-3xl opacity-60 animate-breathe pointer-events-none" />

              <div
                className="relative w-full card-glass rounded-3xl overflow-hidden border border-white/10"
                style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)' }}
              >
                <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                <div className="p-10 lg:p-12 flex flex-col items-center justify-center gap-6 text-center">
                  {/* Logo mark */}
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary relative"
                    style={{ boxShadow: '0 0 48px rgba(225,6,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2)' }}
                  >
                    <div className="absolute top-1 left-3 right-3 h-px bg-white/25" />
                    <span className="text-3xl font-black text-white tracking-tighter">{BRAND.logoInitials}</span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-2xl font-black tracking-[0.10em] uppercase">{BRAND.shortName}</p>
                    <p className="text-xs text-muted-foreground tracking-[0.2em] uppercase">{BRAND.heroCardSubtitle}</p>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 w-full">
                    {heroStats.map(s => (
                      <div key={s.label} className="rounded-xl border border-border/40 bg-background/40 backdrop-blur-sm px-3 py-3 text-center">
                        <p className="text-lg font-black text-primary leading-none">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Quick category links */}
                  <div className="flex flex-wrap justify-center gap-2 w-full">
                    {filterChips.map(c => (
                      <Link
                        key={c.name}
                        href={c.href}
                        className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                      >
                        <c.icon className="h-3 w-3" />
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
              </div>
            </div>

          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </section>

      {/* ═══════════════════════════════════
          TRUST BADGES
      ═══════════════════════════════════ */}
      <section className="border-y border-border/40 bg-secondary/15 py-8">
        <div className="container">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustBadges.map((badge) => (
              <div
                key={badge.label}
                className="card-glass flex items-center gap-4 rounded-xl px-5 py-4 hover:border-primary/30 hover:shadow-glow-red-sm transition-all group"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <badge.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">{badge.label}</p>
                  <p className="text-xs text-muted-foreground">{badge.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          QUICK CATEGORIES
      ═══════════════════════════════════ */}
      <section className="py-12">
        <div className="container">
          <p className="mb-6 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground text-center">
            Explora por categoría
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {filterChips.map((chip) => (
              <Link key={chip.name} href={chip.href}>
                <div className="group flex items-center gap-2.5 rounded-full border border-border/50 bg-card px-6 py-3 transition-all duration-300 hover:border-primary/50 hover:bg-primary/8 hover:shadow-glow-red-sm cursor-pointer hover:-translate-y-0.5">
                  <chip.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">{chip.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-primary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          COMPRA POR TIPO DE USO
      ═══════════════════════════════════ */}
      <section className="py-16 lg:py-24 bg-secondary/15 border-y border-border/40">
        <div className="container">
          <div className="mb-12 text-center space-y-3">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">
              Encuentra lo que necesitas
            </p>
            <h2 className="text-2xl sm:text-3xl font-black">Compra por tipo de uso</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Equipamiento seleccionado según cómo usas tu moto
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((uc) => (
              <Link key={uc.name} href={uc.href} className="group">
                <div className="card-premium relative h-56 flex flex-col items-center justify-center gap-4 p-6 text-center cursor-pointer">
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${uc.color} opacity-50 group-hover:opacity-100 transition-opacity duration-500`} />
                  <div className="absolute inset-0 rounded-2xl carbon-texture opacity-25" />

                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card/70 backdrop-blur-sm border border-border/40 group-hover:border-primary/50 group-hover:bg-primary/10 transition-all duration-300 group-hover:scale-110 group-hover:shadow-glow-red-sm">
                      <uc.icon className="h-7 w-7 text-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base group-hover:text-primary transition-colors">{uc.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{uc.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                      Ver productos <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          FEATURED PRODUCTS
      ═══════════════════════════════════ */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="mb-10 flex items-end justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">
                Selección premium
              </p>
              <h2 className="text-2xl sm:text-3xl font-black">Productos Destacados</h2>
            </div>
            <Link href="/productos" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors group">
              Ver todos
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {featuredProducts.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="card-glass rounded-3xl border border-dashed border-border/50 p-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/50">
                <HardHat className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="font-medium text-muted-foreground">No hay productos destacados aún.</p>
              <p className="mt-1 text-sm text-muted-foreground/60">Configúralos desde el panel de administración.</p>
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link href="/productos" className="btn-outline-racing text-sm inline-flex items-center gap-2">
              Ver todos los productos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          BRANDS — infinite marquee (2 rows)
      ═══════════════════════════════════ */}
      <section className="py-12 border-y border-border/40 bg-secondary/15 overflow-hidden">
        <div className="container mb-7">
          <p className="text-center text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Marcas oficiales · Importadores certificados
          </p>
        </div>

        {/* Row 1 — forward */}
        <div className="marquee-wrapper overflow-hidden mb-3">
          <div className="marquee-track">
            {[...brands, ...brands].map((brand, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-xl border border-border/35 bg-card px-8 py-3.5 mx-2 min-w-[120px] transition-all duration-300 hover:border-primary/45 hover:bg-primary/5 group shrink-0"
              >
                <span className="text-sm font-bold tracking-[0.08em] text-muted-foreground/55 group-hover:text-primary transition-colors">
                  {brand}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — reverse */}
        <div className="marquee-wrapper overflow-hidden">
          <div className="marquee-track-reverse">
            {[...brands, ...brands].reverse().map((brand, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-xl border border-border/25 bg-card/50 px-8 py-3.5 mx-2 min-w-[120px] shrink-0 transition-all hover:border-border/50"
              >
                <span className="text-sm font-bold tracking-[0.08em] text-muted-foreground/35">
                  {brand}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          COMPARADOR RÁPIDO (visual wizard)
      ═══════════════════════════════════ */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="mb-12 text-center space-y-3">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">
              Asesoría inteligente
            </p>
            <h2 className="text-2xl sm:text-3xl font-black">
              Encuentra tu casco ideal{' '}
              <span className="glow-text">en 30 segundos</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Responde 3 preguntas y te recomendamos el equipo perfecto para ti.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {[
              { step: '01', title: 'Tipo de uso',    desc: 'Ciudad, touring, off-road o trabajo',  icon: Bike },
              { step: '02', title: 'Presupuesto',    desc: 'Rango de precio que se adapta a ti',   icon: CreditCard },
              { step: '03', title: 'Marca favorita', desc: 'AGV, HJC, Shoei, Arai y más...',        icon: Zap },
            ].map((item, idx) => (
              <div key={item.step} className="card-premium relative p-6 rounded-2xl flex flex-col gap-4 group">
                {/* Connector dot */}
                {idx < 2 && (
                  <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 hidden sm:flex items-center justify-center h-5 w-5 rounded-full border border-primary/30 bg-background">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black tracking-[0.2em] text-primary/50 uppercase">{item.step}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <item.icon className="h-[1.125rem] w-[1.125rem] text-primary" />
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/productos" className="btn-racing text-sm inline-flex items-center gap-2">
              Explorar catálogo completo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          NEWSLETTER — split layout premium
      ═══════════════════════════════════ */}
      <section className="py-16 lg:py-24 bg-secondary/10 border-t border-border/40">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card">
            {/* Glow blobs */}
            <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/8 blur-[100px] pointer-events-none animate-breathe" />
            <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-primary/5 blur-[80px] pointer-events-none animate-breathe delay-400" />
            <div className="absolute inset-0 carbon-texture opacity-20 pointer-events-none" />
            <div className="absolute top-0 left-16 right-16 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent pointer-events-none" />

            <div className="relative z-10 grid lg:grid-cols-2">

              {/* Left — copy */}
              <div className="p-8 lg:p-14 space-y-6">
                <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">
                  Newsletter exclusivo
                </p>
                <h2 className="text-2xl sm:text-3xl font-black leading-tight">
                  Ofertas y novedades
                  <br />
                  <span className="glow-text">directo a tu correo</span>
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
                  Recibe descuentos exclusivos, lanzamientos y consejos para motociclistas.
                  Sin spam, solo lo que importa.
                </p>
                <ul className="space-y-2.5">
                  {newsletterBenefits.map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right — form */}
              <div className="p-8 lg:p-14 flex items-center lg:border-l border-border/30">
                <div className="card-glass rounded-2xl p-8 w-full space-y-5">
                  <p className="font-bold text-lg">Únete gratis</p>
                  <form className="space-y-3">
                    <input
                      type="text"
                      placeholder="Tu nombre"
                      className="input-modern text-sm"
                    />
                    <input
                      type="email"
                      placeholder="tu@email.com"
                      className="input-modern text-sm"
                    />
                    <button type="submit" className="btn-racing w-full text-sm inline-flex items-center justify-center gap-2">
                      Suscribirme gratis
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </form>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Sin spam · Cancela cuando quieras
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
