import { Shield, Truck, Award, Users, Bike, Heart, ArrowRight, Star, Zap } from 'lucide-react'
import Link from 'next/link'
import { BRAND } from '@/config/brand'
import { getActiveProductCount } from '@/lib/inventory'
import { supabase } from '@/lib/supabase'

const values = [
  { icon: Shield, label: 'Seguridad',  text: 'Tu protección es nuestra prioridad. Solo vendemos productos que cumplen los más altos estándares de seguridad.' },
  { icon: Award,  label: 'Calidad',    text: 'Seleccionamos cuidadosamente cada producto, trabajando solo con marcas reconocidas y certificadas a nivel internacional.' },
  { icon: Heart,  label: 'Pasión',     text: 'Somos motociclistas como tú. Entendemos tus necesidades porque compartimos tu pasión por las dos ruedas.' },
  { icon: Truck,  label: 'Servicio',   text: 'Envíos rápidos a todo el país, atención personalizada y asesoría experta en cada compra.' },
  { icon: Users,  label: 'Comunidad',  text: 'Fomentamos la comunidad motociclista, organizando eventos y apoyando a clubes locales.' },
  { icon: Zap,    label: 'Innovación', text: 'Buscamos constantemente las últimas tendencias y tecnologías para ofrecerte siempre lo mejor.' },
]

// "Clientes satisfechos" y "Ciudades con envío" son cifras de marketing
// (decisión del usuario: mejor mostrar algo que nada). "Productos en
// catálogo" y "Años de experiencia" deben ser reales — el conteo de
// productos se agrega en tiempo de render (ver NosotrosPage), y los años
// (15) son el dato real del negocio, igual que en la portada.
const baseStats = [
  { value: '+5,000', label: 'Clientes satisfechos' },
  { value: '32',     label: 'Ciudades con envío' },
]

const timeline = [
  { year: '2015', title: 'Fundación',         desc: 'Abrimos nuestras puertas en Bogotá con una pequeña selección de cascos y guantes importados.' },
  { year: '2017', title: 'Expansión digital',  desc: 'Lanzamos nuestro primer e-commerce y comenzamos a llegar a todo el territorio nacional.' },
  { year: '2019', title: 'Importación directa',desc: 'Firmamos acuerdos directos con AGV, HJC y Alpinestars, reduciendo precios hasta 30%.' },
  { year: '2021', title: '+2,000 clientes',    desc: 'Alcanzamos nuestra primera gran meta de clientes y abrimos un showroom físico en el CC Megacentro.' },
  { year: '2024', title: `${BRAND.logoInitials} 2.0`, desc: 'Rediseño completo de la plataforma, nuevas marcas y entrega express en Bogotá en 24 horas.' },
]

export default async function NosotrosPage() {
  const activeProductCount = await getActiveProductCount(supabase)
  const stats = [
    baseStats[0],
    { value: `+${activeProductCount}`, label: 'Productos en catálogo' },
    { value: '15', label: 'Años de experiencia' },
    baseStats[1],
  ]

  return (
    <div className="min-h-screen">

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden border-b border-border/40 py-24 lg:py-32">
        <div className="absolute inset-0 bg-secondary/15" />
        <div className="absolute inset-0 aurora-bg" />
        <div className="absolute inset-0 carbon-texture opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-primary/6 blur-[120px] pointer-events-none animate-breathe" />

        <div className="container relative text-center">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold tracking-[0.12em] uppercase text-primary">
                Desde 2015 · Bogotá, Colombia
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black leading-tight">
              Sobre{' '}
              <span className="glow-text">{BRAND.name}</span>
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Somos apasionados por las motos y comprometidos con tu seguridad.
              Desde 2015, hemos equipado a miles de motociclistas con los mejores
              accesorios del mercado colombiano e internacional.
            </p>

            {/* Star rating */}
            <div className="flex items-center justify-center gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 text-amber-400 fill-amber-400" />
              ))}
              <span className="text-sm text-muted-foreground ml-1">+5,000 clientes satisfechos</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats strip ─── */}
      <section className="border-b border-border/40 bg-secondary/10 py-10">
        <div className="container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(stat => (
              <div key={stat.label} className="text-center group">
                <p className="text-4xl font-black text-primary group-hover:scale-110 transition-transform inline-block">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Misión & Visión ─── */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="grid gap-6 md:grid-cols-2">

            {/* Misión */}
            <div className="card-premium relative p-8 rounded-2xl group overflow-hidden">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

              <div className="relative z-10 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary"
                     style={{ boxShadow: '0 0 24px rgba(225,6,0,0.35)' }}>
                  <Bike className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-2xl font-black">Nuestra Misión</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Proveer a los motociclistas colombianos con accesorios de alta calidad que garanticen
                  su seguridad y mejoren su experiencia de manejo, ofreciendo productos innovadores a
                  precios accesibles con un servicio al cliente excepcional.
                </p>
              </div>
            </div>

            {/* Visión */}
            <div className="card-premium relative p-8 rounded-2xl group overflow-hidden">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

              <div className="relative z-10 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary"
                     style={{ boxShadow: '0 0 24px rgba(225,6,0,0.35)' }}>
                  <Award className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-2xl font-black">Nuestra Visión</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Ser la tienda líder en accesorios para motos en Colombia, reconocida por nuestra
                  excelencia en calidad, innovación y compromiso con la comunidad motociclista,
                  expandiendo nuestra presencia a toda Latinoamérica.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── Timeline ─── */}
      <section className="py-16 lg:py-24 bg-secondary/15 border-y border-border/40">
        <div className="container">
          <div className="mb-12 text-center space-y-3">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">Nuestra historia</p>
            <h2 className="text-2xl sm:text-3xl font-black">9 años equipando a Colombia</h2>
          </div>

          <div className="relative max-w-3xl mx-auto">
            {/* Central line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-primary/20 to-transparent hidden sm:block" />

            <div className="space-y-6">
              {timeline.map((item, idx) => (
                <div key={item.year} className="relative sm:pl-16 group">
                  {/* Year dot */}
                  <div className="absolute left-0 top-4 hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-card border-2 border-border group-hover:border-primary transition-colors z-10"
                       style={{ boxShadow: '0 0 0 4px hsl(var(--background))' }}>
                    <span className="text-[10px] font-black text-primary">{item.year.slice(2)}</span>
                  </div>

                  <div className="card-premium p-6 rounded-2xl group-hover:border-primary/30 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="sm:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <span className="text-[10px] font-black text-primary">{item.year}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="hidden sm:inline text-xs font-bold tracking-widest text-primary/70 uppercase">
                            {item.year}
                          </span>
                          <h3 className="font-bold">{item.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Valores ─── */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <div className="mb-12 text-center space-y-3">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">Lo que nos define</p>
            <h2 className="text-2xl sm:text-3xl font-black">Nuestros Valores</h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {values.map(({ icon: Icon, label, text }) => (
              <div key={label} className="card-premium p-7 rounded-2xl text-center group hover:-translate-y-1.5">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-16 lg:py-24 bg-secondary/10 border-t border-border/40">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-10 lg:p-16 text-center">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/8 blur-3xl pointer-events-none animate-breathe" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl pointer-events-none animate-breathe delay-300" />
            <div className="absolute inset-0 carbon-texture opacity-20 pointer-events-none" />
            <div className="absolute top-0 left-16 right-16 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />

            <div className="relative z-10 space-y-5">
              <h2 className="text-3xl font-black">¿Listo para equiparte?</h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Explora nuestra colección y encuentra el equipo perfecto para cada aventura.
              </p>
              <Link href="/productos" className="btn-racing inline-flex items-center gap-2 text-sm">
                Ver productos <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
