import { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Truck, Package, Clock, MapPin, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Envíos y Entregas | YB MOTOCOM',
  description: 'Información sobre nuestros métodos de envío, tiempos de entrega y cobertura en Colombia.',
}

export default function EnviosPage() {
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
            <BreadcrumbPage>Envíos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full mb-6">
          <Truck className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Envíos y Entregas
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Entregamos tus productos de forma rápida y segura en toda Colombia
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl mx-auto">
        {/* Métodos de Envío */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Métodos de Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Envío Nacional</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Enviamos a todas las ciudades principales de Colombia a través de Servientrega, Coordinadora e Interrapidísimo
                </p>
                <Badge variant="secondary">Tiempo: 3-5 días hábiles</Badge>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Envío Bogotá</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Entregas en Bogotá con mensajería propia o plataformas de domicilios
                </p>
                <Badge variant="secondary">Tiempo: 1-2 días hábiles</Badge>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Recogida en Tienda</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Puedes recoger tu pedido en nuestra tienda física sin costo adicional
                </p>
                <Badge variant="secondary">Disponible de inmediato</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Costos de Envío */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Costos de Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm">Envío Nacional (ciudades principales)</span>
              <span className="font-semibold">$15.000 - $25.000</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm">Envío Bogotá</span>
              <span className="font-semibold">$8.000 - $12.000</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm">Recogida en tienda</span>
              <span className="font-semibold text-green-600">GRATIS</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium">Envío GRATIS en compras superiores a:</span>
              <span className="font-bold text-primary">$200.000</span>
            </div>
          </CardContent>
        </Card>

        {/* Cobertura */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Cobertura Nacional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Realizamos envíos a las siguientes ciudades y sus áreas metropolitanas:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
                'Bucaramanga', 'Pereira', 'Manizales', 'Ibagué', 'Santa Marta',
                'Cúcuta', 'Villavicencio', 'Neiva', 'Armenia', 'Popayán'
              ].map((city) => (
                <div key={city} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {city}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              ¿No encuentras tu ciudad? Contáctanos y te ayudaremos a coordinar el envío.
            </p>
          </CardContent>
        </Card>

        {/* Proceso de Envío */}
        <Card>
          <CardHeader>
            <CardTitle>¿Cómo funciona?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Realiza tu pedido</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecciona los productos que desees y completa el proceso de compra
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Procesamos tu orden</h3>
                  <p className="text-sm text-muted-foreground">
                    Verificamos el pago y preparamos tu pedido con cuidado
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Enviamos tu paquete</h3>
                  <p className="text-sm text-muted-foreground">
                    Despachamos tu pedido y te enviamos el número de guía de seguimiento
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  4
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Recibe tu pedido</h3>
                  <p className="text-sm text-muted-foreground">
                    ¡Disfruta de tus nuevos productos para moto!
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nota Importante */}
        <div className="p-6 bg-primary/5 border border-primary/20 rounded-lg">
          <h3 className="font-semibold mb-2">📦 Nota Importante</h3>
          <p className="text-sm text-muted-foreground">
            Los tiempos de entrega son estimados y pueden variar según la ubicación, disponibilidad del producto
            y condiciones de la transportadora. Te mantendremos informado del estado de tu pedido en todo momento.
          </p>
        </div>
      </div>
    </div>
  )
}
