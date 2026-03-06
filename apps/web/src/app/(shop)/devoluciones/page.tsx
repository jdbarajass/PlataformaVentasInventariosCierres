import { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { RotateCcw, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Devoluciones y Garantías | YJBMOTOCOM',
  description: 'Política de devoluciones, cambios y garantías de productos. Compra con confianza en YJBMOTOCOM.',
}

export default function DevolucionesPage() {
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
            <BreadcrumbPage>Devoluciones</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-6">
          <RotateCcw className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Devoluciones y Garantías
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Tu satisfacción es nuestra prioridad. Conoce nuestra política de devoluciones y garantías
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl mx-auto">
        {/* Política de Devoluciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Política de Devoluciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              En YJBMOTOCOM aceptamos devoluciones dentro de los <strong>30 días</strong> posteriores
              a la recepción del producto, siempre que se cumplan las siguientes condiciones:
            </p>

            <div className="grid gap-3">
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                    Producto sin usar
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    El producto debe estar en perfecto estado, sin señales de uso
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                    Empaque original
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Con etiquetas, manuales y accesorios incluidos
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                    Factura de compra
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Presentar factura o comprobante de compra
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Productos NO Retornables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Productos NO Retornables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Por razones de higiene y seguridad, los siguientes productos NO son retornables:
            </p>
            <ul className="space-y-2">
              {[
                'Cascos que hayan sido usados o ajustados',
                'Guantes que presenten señales de uso',
                'Productos de higiene personal (balaclava, bandanas)',
                'Productos en oferta o liquidación (salvo defectos de fábrica)',
                'Productos personalizados o hechos a medida',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Proceso de Devolución */}
        <Card>
          <CardHeader>
            <CardTitle>¿Cómo realizar una devolución?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Contacta con nosotros</h3>
                  <p className="text-sm text-muted-foreground">
                    Envía un email a <strong>yjbmotocom@gmail.com</strong> con tu número de orden
                    y el motivo de la devolución
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Espera nuestra autorización</h3>
                  <p className="text-sm text-muted-foreground">
                    Te enviaremos las instrucciones de devolución y la dirección de envío
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Envía el producto</h3>
                  <p className="text-sm text-muted-foreground">
                    Empaca el producto de forma segura y envíalo a la dirección indicada
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                  4
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Recibe tu reembolso</h3>
                  <p className="text-sm text-muted-foreground">
                    Una vez recibido e inspeccionado el producto, procesaremos tu reembolso en 5-10 días hábiles
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Garantías */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Garantías del Fabricante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Todos nuestros productos cuentan con garantía del fabricante contra defectos de fábrica:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Cascos</h4>
                <p className="text-sm text-muted-foreground mb-1">Garantía: <strong>1 año</strong></p>
                <p className="text-sm text-muted-foreground">
                  Cubre defectos en materiales y fabricación
                </p>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Chaquetas y Ropa</h4>
                <p className="text-sm text-muted-foreground mb-1">Garantía: <strong>6 meses</strong></p>
                <p className="text-sm text-muted-foreground">
                  Cubre costuras, cierres y materiales
                </p>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Accesorios Electrónicos</h4>
                <p className="text-sm text-muted-foreground mb-1">Garantía: <strong>1 año</strong></p>
                <p className="text-sm text-muted-foreground">
                  Cubre componentes electrónicos
                </p>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Guantes y Protecciones</h4>
                <p className="text-sm text-muted-foreground mb-1">Garantía: <strong>3 meses</strong></p>
                <p className="text-sm text-muted-foreground">
                  Cubre defectos de fabricación
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cambios */}
        <Card>
          <CardHeader>
            <CardTitle>Cambios por Talla o Color</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Si necesitas cambiar un producto por otra talla o color:
            </p>
            <ul className="space-y-2 mb-4">
              <li className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>El cambio es <strong>gratuito</strong> dentro de los primeros 15 días</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>El producto debe estar sin usar y con etiquetas</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Cubrimos el envío del nuevo producto</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Alert Final */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Importante:</strong> Los costos de envío de la devolución corren por cuenta del cliente,
            excepto en casos de productos defectuosos o error en el envío. En esos casos, YJBMOTOCOM asumirá
            todos los costos asociados.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
