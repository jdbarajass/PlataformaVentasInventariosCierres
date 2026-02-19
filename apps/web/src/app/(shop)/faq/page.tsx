import { Metadata } from 'next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent } from '@/components/ui/card'
import { HelpCircle, Package, CreditCard, Truck, RotateCcw, Shield } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Preguntas Frecuentes (FAQ) | YB MOTOCOM',
  description: 'Encuentra respuestas a las preguntas más comunes sobre compras, envíos, devoluciones y más.',
}

const faqCategories = [
  {
    title: 'Compras y Pedidos',
    icon: Package,
    questions: [
      {
        question: '¿Cómo puedo realizar una compra?',
        answer: 'Para realizar una compra, navega por nuestro catálogo, agrega los productos que desees al carrito, y procede al checkout. Deberás proporcionar tu información de envío y seleccionar un método de pago. Una vez confirmado el pago, recibirás un email con la confirmación de tu pedido.',
      },
      {
        question: '¿Puedo modificar mi pedido después de realizarlo?',
        answer: 'Puedes modificar tu pedido contactándonos inmediatamente a ybmotocom@gmail.com o al +57 321 411 1371. Sin embargo, si el pedido ya ha sido procesado y enviado, no podremos realizar cambios.',
      },
      {
        question: '¿Cómo puedo rastrear mi pedido?',
        answer: 'Una vez que tu pedido sea despachado, recibirás un email con el número de guía de la transportadora. Podrás rastrearlo directamente en el sitio web de la empresa de envíos.',
      },
      {
        question: '¿Puedo comprar sin registrarme?',
        answer: 'Sí, puedes realizar compras como invitado. Sin embargo, crear una cuenta te permitirá ver el historial de tus pedidos, guardar direcciones de envío y acceder a ofertas exclusivas.',
      },
    ],
  },
  {
    title: 'Métodos de Pago',
    icon: CreditCard,
    questions: [
      {
        question: '¿Qué métodos de pago aceptan?',
        answer: 'Aceptamos tarjetas de crédito y débito (Visa, Mastercard, American Express), transferencias bancarias, Nequi y Daviplata. Para pagos en efectivo, puedes coordinar la recogida en nuestra tienda física.',
      },
      {
        question: '¿Es seguro pagar con tarjeta?',
        answer: 'Sí, completamente seguro. Utilizamos Stripe como procesador de pagos, que cumple con los más altos estándares de seguridad PCI DSS Level 1. Tus datos bancarios están encriptados y nunca son almacenados en nuestros servidores.',
      },
      {
        question: '¿Puedo pagar en cuotas?',
        answer: 'Sí, al pagar con tarjeta de crédito, puedes diferir el pago en cuotas según los beneficios de tu tarjeta. El número de cuotas disponibles depende de tu banco emisor.',
      },
      {
        question: '¿Emiten factura?',
        answer: 'Sí, emitimos factura electrónica para todas las compras. La recibirás en tu email una vez confirmado el pago. Si necesitas factura a nombre de una empresa, indícalo en las notas del pedido con el NIT.',
      },
    ],
  },
  {
    title: 'Envíos y Entregas',
    icon: Truck,
    questions: [
      {
        question: '¿Cuánto demora el envío?',
        answer: 'Los envíos en Bogotá toman 1-2 días hábiles. Para el resto del país, el tiempo estimado es de 3-5 días hábiles, dependiendo de la ciudad de destino.',
      },
      {
        question: '¿Cuánto cuesta el envío?',
        answer: 'El costo de envío varía según la ciudad de destino. En Bogotá el costo es de $8.000 a $12.000. Para otras ciudades principales, el costo es de $15.000 a $25.000. El envío es GRATIS en compras superiores a $200.000.',
      },
      {
        question: '¿Hacen envíos a todo Colombia?',
        answer: 'Sí, enviamos a todas las ciudades principales de Colombia. Si tu ciudad no aparece en el listado, contáctanos y coordinaremos el envío.',
      },
      {
        question: '¿Puedo recoger mi pedido en tienda?',
        answer: 'Sí, ofrecemos recogida gratuita en nuestra tienda ubicada en Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1, Bogotá. Recibirás un email cuando tu pedido esté listo para recoger.',
      },
    ],
  },
  {
    title: 'Devoluciones y Cambios',
    icon: RotateCcw,
    questions: [
      {
        question: '¿Puedo devolver un producto?',
        answer: 'Sí, aceptamos devoluciones dentro de los 30 días posteriores a la recepción del producto, siempre que esté sin usar, con etiquetas y en su empaque original. Los productos de higiene personal no son retornables.',
      },
      {
        question: '¿Cómo realizo un cambio de talla?',
        answer: 'Para cambios de talla, contacta con nosotros en los primeros 15 días. El cambio es gratuito y cubrimos el envío del nuevo producto. El producto debe estar sin usar y con etiquetas.',
      },
      {
        question: '¿Quién paga el envío de la devolución?',
        answer: 'El costo de envío de la devolución es responsabilidad del cliente, excepto en casos de productos defectuosos o error en el envío, donde YB MOTOCOM asume todos los costos.',
      },
      {
        question: '¿Cuándo recibiré mi reembolso?',
        answer: 'Una vez recibamos y verifiquemos el producto devuelto, procesaremos tu reembolso en 5-10 días hábiles. El reembolso se realizará al mismo método de pago utilizado en la compra.',
      },
    ],
  },
  {
    title: 'Productos y Garantías',
    icon: Shield,
    questions: [
      {
        question: '¿Los productos son originales?',
        answer: 'Sí, todos nuestros productos son 100% originales y cuentan con garantía del fabricante. Trabajamos directamente con distribuidores autorizados de las marcas más reconocidas.',
      },
      {
        question: '¿Qué garantía tienen los productos?',
        answer: 'La garantía varía según el tipo de producto: Cascos 1 año, Chaquetas y ropa 6 meses, Accesorios electrónicos 1 año, Guantes y protecciones 3 meses. La garantía cubre defectos de fabricación y materiales.',
      },
      {
        question: '¿Cómo sé qué talla elegir?',
        answer: 'En la página de cada producto encontrarás una guía de tallas detallada. Si tienes dudas, contáctanos por WhatsApp al +57 321 411 1371 y te asesoraremos personalmente.',
      },
      {
        question: '¿Tienen tienda física?',
        answer: 'Sí, nuestra tienda física está ubicada en Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1, Bogotá. Estamos abiertos de lunes a viernes de 8:00 AM a 6:00 PM y sábados de 9:00 AM a 2:00 PM.',
      },
    ],
  },
]

export default function FAQPage() {
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
            <BreadcrumbPage>FAQ</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary rounded-full mb-6">
          <HelpCircle className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Preguntas Frecuentes
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Encuentra respuestas rápidas a las preguntas más comunes sobre nuestros productos y servicios
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {faqCategories.map((category, idx) => {
          const Icon = category.icon
          return (
            <div key={idx}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">{category.title}</h2>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <Accordion type="single" collapsible className="w-full">
                    {category.questions.map((item, qIdx) => (
                      <AccordionItem key={qIdx} value={`item-${idx}-${qIdx}`}>
                        <AccordionTrigger className="text-left">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          )
        })}

        {/* Contact CTA */}
        <div className="mt-12 p-8 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg border border-primary/20 text-center">
          <h2 className="text-2xl font-bold mb-3">¿No encontraste lo que buscabas?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Nuestro equipo está listo para ayudarte. Contáctanos y responderemos todas tus preguntas
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/contacto"
              className="inline-flex items-center justify-center h-10 px-6 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Contactar con nosotros
            </Link>
            <a
              href="https://wa.me/573214111371"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-10 px-6 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              WhatsApp: +57 321 411 1371
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
