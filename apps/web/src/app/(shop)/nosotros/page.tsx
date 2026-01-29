import { Shield, Truck, Award, Users, Bike, Heart } from 'lucide-react'

export default function NosotrosPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-24">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
        <div className="container relative mx-auto px-4 text-center">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold text-white md:text-5xl">
              Sobre{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                YB MOTOCOM
              </span>
            </h1>
            <p className="text-lg text-slate-300">
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
            <div className="rounded-2xl border bg-card p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
                <Bike className="h-6 w-6 text-white" />
              </div>
              <h2 className="mb-4 text-2xl font-bold">Nuestra Misión</h2>
              <p className="text-muted-foreground">
                Proveer a los motociclistas colombianos con accesorios de alta
                calidad que garanticen su seguridad y mejoren su experiencia de
                manejo, ofreciendo productos innovadores a precios accesibles con
                un servicio al cliente excepcional.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
                <Award className="h-6 w-6 text-white" />
              </div>
              <h2 className="mb-4 text-2xl font-bold">Nuestra Visión</h2>
              <p className="text-muted-foreground">
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
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Nuestros Valores
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10">
                <Shield className="h-7 w-7 text-cyan-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Seguridad</h3>
              <p className="text-sm text-muted-foreground">
                Tu protección es nuestra prioridad. Solo vendemos productos que
                cumplen los más altos estándares de seguridad.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10">
                <Award className="h-7 w-7 text-cyan-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Calidad</h3>
              <p className="text-sm text-muted-foreground">
                Seleccionamos cuidadosamente cada producto, trabajando solo con
                marcas reconocidas y certificadas.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10">
                <Heart className="h-7 w-7 text-cyan-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Pasión</h3>
              <p className="text-sm text-muted-foreground">
                Somos motociclistas como tú. Entendemos tus necesidades porque
                compartimos tu pasión por las dos ruedas.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10">
                <Truck className="h-7 w-7 text-cyan-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Servicio</h3>
              <p className="text-sm text-muted-foreground">
                Envíos rápidos a todo el país, atención personalizada y
                asesoría experta en cada compra.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10">
                <Users className="h-7 w-7 text-cyan-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Comunidad</h3>
              <p className="text-sm text-muted-foreground">
                Fomentamos la comunidad motociclista, organizando eventos y
                apoyando a clubes locales.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
                <span className="text-lg font-bold text-white">YB</span>
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
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-500">+5,000</div>
              <p className="mt-2 text-muted-foreground">Clientes satisfechos</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-500">+500</div>
              <p className="mt-2 text-muted-foreground">Productos en catálogo</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-500">9</div>
              <p className="mt-2 text-muted-foreground">Años de experiencia</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-500">32</div>
              <p className="mt-2 text-muted-foreground">
                Ciudades con envío gratis
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-cyan-500 to-blue-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">
            ¿Listo para equiparte?
          </h2>
          <p className="mb-8 text-lg text-white/90">
            Explora nuestra colección y encuentra el equipo perfecto para ti.
          </p>
          <a
            href="/"
            className="inline-flex items-center rounded-xl bg-white px-8 py-3 font-semibold text-cyan-600 transition-transform hover:scale-105"
          >
            Ver productos
          </a>
        </div>
      </section>
    </div>
  )
}
