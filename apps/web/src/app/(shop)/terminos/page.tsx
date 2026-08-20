import { Metadata } from 'next'
import Link from 'next/link'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export const metadata: Metadata = {
  title: 'Términos y Condiciones | YJBMOTOCOM',
  description: 'Términos y condiciones de uso de YJBMOTOCOM. Lee nuestras políticas antes de realizar tu compra.',
  openGraph: {
    title: 'Términos y Condiciones | YJBMOTOCOM',
    description: 'Términos y condiciones de uso de YJBMOTOCOM',
  },
}

const sections = [
  {
    title: '1. Aceptación de Términos',
    content: `Al acceder y usar el sitio web de YJBMOTOCOM (en adelante "la Tienda"), aceptas cumplir y estar sujeto a estos Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no debes utilizar nuestros servicios.

La Tienda se reserva el derecho de modificar estos términos en cualquier momento. Es tu responsabilidad revisar periódicamente estos términos para estar informado de cualquier cambio.`,
  },
  {
    title: '2. Uso del Sitio',
    content: `El usuario se compromete a:

• Utilizar la Tienda de manera lícita y conforme a la ley.
• No realizar actividades que puedan dañar, inutilizar o sobrecargar la infraestructura de la Tienda.
• No intentar acceder a áreas restringidas del sistema sin autorización.
• Proporcionar información veraz y actualizada durante el proceso de registro y compra.
• No utilizar la Tienda para actividades fraudulentas o ilegales.

YJBMOTOCOM se reserva el derecho de suspender o cancelar el acceso de cualquier usuario que incumpla estos términos.`,
  },
  {
    title: '3. Productos y Precios',
    content: `Todos los precios mostrados en la Tienda están expresados en Pesos Colombianos (COP) e incluyen el IVA cuando aplique.

• Los precios pueden estar sujetos a cambios sin previo aviso.
• Nos esforzamos por mostrar imágenes precisas de los productos, pero no garantizamos que las imágenes representen exactamente el color o características reales del producto.
• La disponibilidad de productos está sujeta a existencias.
• Nos reservamos el derecho de limitar las cantidades de compra por cliente.
• En caso de error en el precio publicado, nos reservamos el derecho de cancelar o rechazar pedidos realizados con el precio incorrecto.`,
  },
  {
    title: '4. Proceso de Compra',
    content: `Al realizar una compra, el cliente acepta:

• La información proporcionada (nombre, dirección, email, teléfono) es correcta y completa.
• El pedido constituye una oferta de compra que será aceptada por YJBMOTOCOM mediante el envío de un correo electrónico de confirmación.
• Los pedidos están sujetos a disponibilidad de stock.
• Nos reservamos el derecho de rechazar o cancelar cualquier pedido por motivos justificados.

Proceso de compra:
1. Selección de productos y agregado al carrito
2. Revisión del carrito y datos de envío
3. Selección del método de pago
4. Confirmación del pedido
5. Recepción de email de confirmación`,
  },
  {
    title: '5. Métodos de Pago',
    content: `Aceptamos los siguientes métodos de pago:

• **Tarjeta de Crédito/Débito**: Procesamiento seguro a través de Stripe. El pago se procesa inmediatamente.
• **Transferencia Bancaria**: Debes realizar la transferencia en un plazo máximo de 48 horas. El pedido se procesará al confirmar el pago.
• **Nequi**: Pago a través de la plataforma Nequi. Incluye el número de orden como referencia.
• **Daviplata**: Pago a través de Daviplata. Incluye el número de orden como referencia.
• **Efectivo**: Solo disponible para retiro en tienda (si aplica).

Para métodos de pago manuales (transferencia, Nequi, Daviplata), recibirás un correo electrónico con las instrucciones detalladas. Es importante incluir el número de orden como referencia de pago.

Los datos de pago son procesados de manera segura y encriptada. YJBMOTOCOM no almacena información completa de tarjetas de crédito.`,
  },
  {
    title: '6. Envíos y Entregas',
    content: `Los envíos se realizan a nivel nacional en Colombia.

**Tiempo de entrega:**
• El tiempo estimado de entrega es de 3 a 5 días hábiles para ciudades principales.
• Para zonas rurales o municipios alejados, el tiempo puede extenderse de 5 a 10 días hábiles.
• Los tiempos de entrega comienzan a contar desde la confirmación del pago.

**Costos de envío:**
• El costo de envío se calcula según el destino y el peso del paquete.
• Envíos gratuitos pueden aplicar para compras superiores a cierto monto (ver promociones vigentes).

**Proceso de envío:**
1. Confirmación de pago
2. Preparación del pedido (1-2 días hábiles)
3. Envío a través de courier
4. Notificación de envío con número de seguimiento
5. Entrega en la dirección especificada

El cliente es responsable de proporcionar una dirección correcta y completa. No nos hacemos responsables por entregas fallidas debido a información incorrecta.`,
  },
  {
    title: '7. Devoluciones y Garantías',
    content: `**Política de Devoluciones:**

Aceptamos devoluciones dentro de los 30 días siguientes a la recepción del producto, siempre que:
• El producto esté en su empaque original y sin usar.
• Se incluyan todos los accesorios y documentación.
• No presente signos de uso o daño.

**Productos no retornables:**
• Productos personalizados o hechos a medida.
• Productos de higiene personal (cascos, guantes, etc.) que hayan sido abiertos.
• Productos en oferta o liquidación (salvo defecto de fábrica).

**Garantías:**
• Todos los productos cuentan con la garantía del fabricante.
• Los defectos de fábrica están cubiertos según los términos de cada fabricante.
• Para hacer válida la garantía, se debe presentar la factura de compra.

**Proceso de devolución:**
1. Contactar a servicio al cliente a través de contacto@yjbmotocom.com
2. Proporcionar número de orden y motivo de devolución
3. Esperar autorización de devolución
4. Enviar el producto al almacén (costos de envío a cargo del cliente, salvo producto defectuoso)
5. Inspección del producto
6. Reembolso o cambio según corresponda

Los reembolsos se procesan en un plazo de 5 a 10 días hábiles después de recibir y aprobar la devolución.`,
  },
  {
    title: '8. Privacidad y Protección de Datos',
    content: `Respetamos tu privacidad y cumplimos con la Ley 1581 de 2012 de Colombia sobre Protección de Datos Personales.

**Información que recopilamos:**
• Nombre completo
• Dirección de email
• Número de teléfono
• Dirección de envío
• Información de pedidos y transacciones

**Uso de la información:**
• Procesamiento de pedidos
• Comunicación sobre el estado de tu orden
• Mejora de nuestros servicios
• Envío de promociones (con tu consentimiento)

**Protección de datos:**
• No compartimos tu información personal con terceros sin tu consentimiento, salvo cuando sea necesario para procesar tu pedido (ej: courier).
• Utilizamos medidas de seguridad para proteger tu información.
• Tienes derecho a acceder, corregir o eliminar tus datos personales contactándonos.

Para más detalles, consulta nuestra Política de Privacidad completa.`,
  },
  {
    title: '9. Propiedad Intelectual',
    content: `Todo el contenido presente en este sitio web, incluyendo pero no limitado a:
• Textos
• Imágenes
• Logos
• Gráficos
• Diseño del sitio
• Código fuente

Es propiedad exclusiva de YJBMOTOCOM o de sus respectivos propietarios y está protegido por las leyes de propiedad intelectual de Colombia.

Queda prohibido:
• Copiar, reproducir o distribuir cualquier contenido del sitio sin autorización previa.
• Utilizar las marcas registradas de YJBMOTOCOM sin permiso.
• Realizar ingeniería inversa del sitio web.

El uso no autorizado del contenido puede resultar en acciones legales.`,
  },
  {
    title: '10. Limitación de Responsabilidad',
    content: `YJBMOTOCOM se compromete a proporcionar información precisa sobre productos y servicios, sin embargo:

• No garantizamos que el sitio web estará disponible de manera ininterrumpida o libre de errores.
• No somos responsables por daños indirectos, incidentales o consecuentes derivados del uso del sitio o productos.
• La responsabilidad total de YJBMOTOCOM no excederá el valor pagado por el producto en cuestión.
• No somos responsables por retrasos o fallas en la entrega causados por terceros (courier, fuerza mayor, etc.).

El sitio puede contener enlaces a sitios web de terceros. No nos responsabilizamos por el contenido o prácticas de privacidad de estos sitios.`,
  },
  {
    title: '11. Modificaciones a los Términos',
    content: `YJBMOTOCOM se reserva el derecho de modificar estos Términos y Condiciones en cualquier momento.

• Las modificaciones entrarán en vigor inmediatamente después de su publicación en el sitio.
• Es responsabilidad del usuario revisar periódicamente estos términos.
• El uso continuado del sitio después de la publicación de cambios constituye la aceptación de dichos cambios.

**Fecha de última actualización**: Febrero 14, 2026

Recomendamos a los usuarios guardar o imprimir una copia de estos términos para su referencia.`,
  },
  {
    title: '12. Ley Aplicable y Jurisdicción',
    content: `Estos Términos y Condiciones se rigen por las leyes de la República de Colombia.

Cualquier disputa, controversia o reclamo que surja de o en relación con estos términos, o el incumplimiento, terminación o invalidez de los mismos, será resuelto en primera instancia mediante negociación directa entre las partes.

Si no se alcanza un acuerdo, las partes se someten a la jurisdicción de los tribunales de Colombia, renunciando expresamente a cualquier otro fuero que pudiera corresponderles.`,
  },
  {
    title: '13. Contacto',
    content: `Para cualquier consulta, reclamo o solicitud relacionada con estos Términos y Condiciones, puedes contactarnos a través de:

**Email:** contacto@yjbmotocom.com

**Horario de atención:**
Lunes a Viernes: 9:00 AM - 6:00 PM
Sábados: 9:00 AM - 1:00 PM

Tiempo de respuesta estimado: 24-48 horas hábiles.

También puedes contactarnos a través del formulario de contacto disponible en nuestro sitio web.`,
  },
]

export default function TerminosPage() {
  return (
    <div className="container max-w-4xl py-8 md:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Términos y Condiciones
        </h1>
        <p className="text-muted-foreground">
          Última actualización: 14 de febrero de 2026
        </p>
      </div>

      {/* Introduction */}
      <div className="mb-8 p-6 bg-muted/50 rounded-lg border">
        <p className="text-sm md:text-base leading-relaxed">
          Bienvenido a YJBMOTOCOM. Al utilizar nuestro sitio web y realizar compras,
          aceptas estar sujeto a estos Términos y Condiciones. Por favor, léelos
          cuidadosamente antes de realizar cualquier transacción. Si tienes alguna
          pregunta, no dudes en{' '}
          <a href="/contacto" className="text-primary hover:underline">
            contactarnos
          </a>
          .
        </p>
      </div>

      {/* Accordion Sections */}
      <Accordion type="single" collapsible className="w-full">
        {sections.map((section, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left text-base md:text-lg font-semibold hover:no-underline">
              {section.title}
            </AccordionTrigger>
            <AccordionContent>
              <div className="prose prose-sm md:prose-base max-w-none">
                <p className="whitespace-pre-line text-sm md:text-base leading-relaxed text-muted-foreground">
                  {section.content}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Footer Note */}
      <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <strong>Nota importante:</strong> Al realizar una compra en YJBMOTOCOM,
          confirmas que has leído, entendido y aceptado estos Términos y Condiciones
          en su totalidad.
        </p>
      </div>

      {/* Related Links */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/contacto"
          className="inline-flex items-center justify-center px-6 py-3 border border-primary text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          Contactar Soporte
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Ir a la Tienda
        </Link>
      </div>
    </div>
  )
}
