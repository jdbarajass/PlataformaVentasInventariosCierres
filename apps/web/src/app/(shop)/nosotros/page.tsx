import { Shield, Truck, Award, Users, Bike, Heart } from 'lucide-react'

export default function NosotrosPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-secondary/30 border-b border-border/50 py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(225,6,0,0.06),transparent_70%)]" />
        <div className="container relative mx-auto px-4 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold tracking-[0.12em] uppercase text-primary">
                Desde 2015 · Bogotá, Colombia
              </span>
            </div>
            <h1 className="mb-6 text-4xl font-black leading-tight md:text-5xl">
              Sobre{' '}
              <span className="glow-text">YB MOTOCOM</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Somos apasionados por las motos y comprometidos con tu seguridad.
              Desde 2015, hemos equipado a miles de motociclistas con los mejores
              accesorios del mercado.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-card p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-card-hover">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Bike className="h-6 w-6 text-white" />
              </div>
              <h2 className="mb-4 text-2xl font-bold">Nuestra Misión</h2>
              <p className="text-muted-foreground leading-relaxed">
                Proveer a los motociclistas colombianos con accesorios de alta
                calidad que garanticen su seguridad y mejoren su experiencia de
                manejo, ofreciendo productos innovadores a precios accesibles con
                un servicio al cliente excepcional.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-card-hover">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Award className="h-6 w-6 text-white" />
              </div>
              <h2 className="mb-4 text-2xl font-bold">Nuestra Visión</h2>
              <p className="text-muted-foreground leading-relaxed">
                Ser la tienda líder en accesorios para motos en Colombia,
                reconocida por nuestra excelencia en calidad, innovación y
                compromiso con la comunidad motociclista, expandiendo nuestra
                presencia a toda Latinoamérica.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-secondary/20 border-y border-border/50 py-16">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center space-y-2">
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-primary">
              Lo que nos define
            </p>
            <h2 className="text-3xl font-black">Nuestros Valores</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {([
              { icon: Shield, label: 'Seguridad',  text: 'Tu protección es nuestra prioridad. Solo vendemos productos que cumplen los más altos estándares de seguridad.' },
              { icon: Award,  label: 'Calidad',    text: 'Seleccionamos cuidadosamente cada producto, trabajando solo con marcas reconocidas y certificadas.' },
              { icon: Heart,  label: 'Pasión',     text: 'Somos motociclistas como tú. Entendemos tus necesidades porque compartimos tu pasión por las dos ruedas.' },
              { icon: Truck,  label: 'Servicio',   text: 'Envíos rápidos a todo el país, atención personalizada y asesoría experta en cada compra.' },
              { icon: Users,  label: 'Comunidad',  text: 'Fomentamos la comunidad motociclista, organizando eventos y apoyando a clubes locales.' },
            ] as const).map(({ icon: Icon, label, text }) => (
              <div key={label} className="rounded-2xl border border-border/40 bg-card p-6 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-card-hover hover:-translate-y-1">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{label}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-border/40 bg-card p-6 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
                <span className="text-lg font-black text-white">YB</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Innovación</h3>
              <p className="text-sm text-muted-foreground">
                Constantemente buscamos las últimas tendencias y tecnologías
                para ofrecerte lo mejor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: '+5,000', label: 'Clientes satisfechos' },
              { value: '+500',   label: 'Productos en catálogo' },
              { value: '9',      label: 'Años de experiencia' },
              { value: '32',     label: 'Ciudades con envío gratis' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-4xl font-black text-primary">{value}</div>
                <p className="mt-2 text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-secondary/20 border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-8 lg:p-14 text-center">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h2 className="mb-4 text-3xl font-black">¿Listo para equiparte?</h2>
              <p className="mb-8 text-lg text-muted-foreground">
                Explora nuestra colección y encuentra el equipo perfecto para ti.
              </p>
              <a href="/productos" className="btn-racing inline-flex items-center gap-2 text-sm">
                Ver productos
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
