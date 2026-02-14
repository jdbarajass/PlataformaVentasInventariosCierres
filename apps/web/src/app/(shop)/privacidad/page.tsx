import { Metadata } from 'next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Shield, Lock, Eye, UserCheck, Database, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Política de Privacidad | YB MOTOCOM',
  description: 'Política de privacidad y protección de datos personales de YB MOTOCOM. Conoce cómo protegemos tu información.',
}

const sections = [
  {
    title: '1. Información que Recopilamos',
    icon: Database,
    content: `En YB MOTOCOM recopilamos la siguiente información personal cuando utilizas nuestro sitio web o realizas una compra:

**Información de Cuenta:**
- Nombre completo
- Dirección de correo electrónico
- Número de teléfono
- Dirección de envío y facturación

**Información de Pago:**
- Los datos de pago son procesados de forma segura por Stripe. No almacenamos información completa de tarjetas de crédito en nuestros servidores.

**Información de Navegación:**
- Dirección IP
- Tipo de navegador
- Páginas visitadas
- Tiempo de permanencia en el sitio
- Productos visualizados

**Comunicaciones:**
- Correos electrónicos que nos envías
- Mensajes a través de formularios de contacto
- Historial de conversaciones con servicio al cliente`,
  },
  {
    title: '2. Cómo Utilizamos tu Información',
    icon: UserCheck,
    content: `Utilizamos la información recopilada para los siguientes propósitos:

**Procesamiento de Pedidos:**
- Procesar y completar tus transacciones
- Enviar confirmaciones de pedido
- Gestionar envíos y entregas
- Procesar devoluciones y reembolsos

**Comunicación:**
- Responder a tus consultas
- Enviarte actualizaciones sobre el estado de tu pedido
- Notificarte sobre cambios en nuestros servicios
- Enviar ofertas promocionales (solo si has dado tu consentimiento)

**Mejora del Servicio:**
- Personalizar tu experiencia de compra
- Analizar el comportamiento de navegación
- Mejorar nuestro sitio web y servicios
- Desarrollar nuevos productos y funcionalidades

**Seguridad:**
- Prevenir fraudes y actividades sospechosas
- Proteger nuestros sistemas de amenazas cibernéticas
- Cumplir con obligaciones legales`,
  },
  {
    title: '3. Compartir Información con Terceros',
    icon: Eye,
    content: `Compartimos tu información solo en las siguientes circunstancias:

**Proveedores de Servicios:**
- **Stripe:** Procesamiento de pagos (cumple con PCI DSS)
- **Empresas de Envío:** Servientrega, Coordinadora, Interrapidísimo (solo dirección de envío)
- **Servicios de Email:** Resend (solo email para notificaciones)
- **Supabase:** Almacenamiento seguro de datos (servidores con cifrado)

**Cumplimiento Legal:**
- Cuando sea requerido por ley o autoridades competentes
- Para proteger nuestros derechos legales
- Para investigar actividades fraudulentas

**Nunca vendemos ni alquilamos tu información personal a terceros para fines de marketing.**`,
  },
  {
    title: '4. Protección de Datos',
    icon: Lock,
    content: `Implementamos múltiples medidas de seguridad para proteger tu información:

**Seguridad Técnica:**
- Cifrado SSL/TLS para todas las transmisiones de datos
- Almacenamiento seguro con cifrado en reposo
- Autenticación de dos factores para cuentas administrativas
- Firewalls y sistemas de detección de intrusos
- Backups automáticos y encriptados

**Seguridad Operativa:**
- Acceso restringido a información personal
- Capacitación del personal en protección de datos
- Políticas internas de seguridad
- Auditorías periódicas de seguridad

**Conformidad:**
- Cumplimiento de la Ley 1581 de 2012 (Protección de Datos Personales en Colombia)
- Estándares internacionales de seguridad (ISO 27001)
- Políticas de privacidad de proveedores certificados`,
  },
  {
    title: '5. Cookies y Tecnologías de Rastreo',
    icon: Database,
    content: `Utilizamos cookies y tecnologías similares para mejorar tu experiencia:

**Cookies Esenciales:**
- Autenticación de sesión
- Carrito de compras
- Preferencias de seguridad
- Estas cookies son necesarias para el funcionamiento del sitio

**Cookies de Análisis:**
- Google Analytics (opcional, puedes desactivarlo)
- Análisis de uso del sitio
- Métricas de rendimiento

**Cookies de Marketing:**
- Publicidad personalizada (solo con tu consentimiento)
- Remarketing en redes sociales
- Seguimiento de conversiones

**Gestión de Cookies:**
Puedes controlar las cookies desde la configuración de tu navegador. Ten en cuenta que deshabilitar cookies puede afectar la funcionalidad del sitio.`,
  },
  {
    title: '6. Tus Derechos',
    icon: Shield,
    content: `Según la Ley 1581 de 2012, tienes los siguientes derechos:

**Derecho de Acceso:**
- Conocer qué información personal tenemos sobre ti
- Solicitar una copia de tus datos

**Derecho de Rectificación:**
- Corregir información inexacta o incompleta
- Actualizar tus datos personales

**Derecho de Supresión:**
- Solicitar la eliminación de tu información (sujeto a obligaciones legales)
- "Derecho al olvido"

**Derecho de Oposición:**
- Oponerte al procesamiento de tus datos para fines específicos
- Cancelar suscripciones a comunicaciones de marketing

**Derecho de Portabilidad:**
- Recibir tus datos en un formato estructurado
- Transferir tus datos a otro servicio

**Cómo Ejercer tus Derechos:**
Envía un correo a **ybmotocom@gmail.com** con tu solicitud. Responderemos en un plazo máximo de 15 días hábiles.`,
  },
  {
    title: '7. Retención de Datos',
    icon: Database,
    content: `Conservamos tu información personal durante el tiempo necesario para:

**Cuentas Activas:**
- Mientras mantengas tu cuenta activa
- Hasta que solicites su eliminación

**Información Transaccional:**
- Facturas y comprobantes: 10 años (requisito legal contable)
- Historial de pedidos: 5 años
- Comunicaciones de servicio al cliente: 3 años

**Información de Marketing:**
- Hasta que canceles tu suscripción
- 2 años sin actividad

**Tras la Eliminación:**
Una vez eliminada tu cuenta, conservaremos solo la información necesaria para cumplir con obligaciones legales (facturas, registros fiscales).`,
  },
  {
    title: '8. Transferencias Internacionales',
    icon: Mail,
    content: `Algunos de nuestros proveedores de servicios pueden estar ubicados fuera de Colombia:

**Proveedores Internacionales:**
- Stripe (Estados Unidos) - Procesamiento de pagos
- Supabase (Estados Unidos) - Almacenamiento de datos
- Resend (Estados Unidos) - Servicio de email

**Protecciones:**
Estos proveedores cumplen con estándares internacionales de protección de datos y han implementado salvaguardas adecuadas para proteger tu información.`,
  },
  {
    title: '9. Menores de Edad',
    icon: Shield,
    content: `Nuestros servicios están dirigidos a mayores de 18 años.

No recopilamos intencionalmente información de menores de edad. Si descubrimos que hemos recopilado datos de un menor sin consentimiento parental, eliminaremos esa información de inmediato.

Si eres padre/madre y crees que tu hijo ha proporcionado información personal, contáctanos en ybmotocom@gmail.com.`,
  },
  {
    title: '10. Cambios a esta Política',
    icon: Mail,
    content: `Podemos actualizar esta Política de Privacidad periódicamente para reflejar cambios en nuestras prácticas o por razones legales.

**Notificación de Cambios:**
- Te notificaremos sobre cambios significativos por email
- Publicaremos la fecha de la última actualización en la parte superior
- Los cambios entran en vigor inmediatamente después de su publicación

**Última actualización:** Febrero 2026`,
  },
  {
    title: '11. Contacto',
    icon: Mail,
    content: `Si tienes preguntas sobre esta Política de Privacidad o sobre cómo manejamos tus datos personales, contáctanos:

**Email:** ybmotocom@gmail.com
**Teléfono:** +57 321 411 1371 / +57 314 406 5520
**Dirección:** Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1, Bogotá, Colombia
**Horario de Atención:** Lunes a Viernes 8:00 AM - 6:00 PM, Sábados 9:00 AM - 2:00 PM

**Responsable del Tratamiento de Datos:**
YB MOTOCOM
NIT: [Pendiente de configuración]

Responderemos a todas las consultas relacionadas con privacidad en un plazo máximo de 15 días hábiles.`,
  },
  {
    title: '12. Marco Legal',
    icon: Shield,
    content: `Esta Política de Privacidad se rige por las siguientes leyes y regulaciones:

**Colombia:**
- Ley 1581 de 2012 (Protección de Datos Personales)
- Decreto 1377 de 2013
- Ley 1266 de 2008 (Habeas Data)

**Autoridad de Control:**
Superintendencia de Industria y Comercio (SIC)
Delegatura para la Protección de Datos Personales

**Normativas Internacionales:**
- Principios de privacidad GDPR (cuando aplique)
- Estándares ISO 27001 de seguridad de la información`,
  },
]

export default function PrivacidadPage() {
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
            <BreadcrumbPage>Política de Privacidad</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full mb-6">
          <Shield className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Política de Privacidad
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Tu privacidad es importante para nosotros. Conoce cómo recopilamos, usamos y protegemos tu información personal
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Última actualización: Febrero 2026
        </p>
      </div>

      {/* Intro */}
      <div className="max-w-4xl mx-auto mb-8 p-6 bg-primary/5 border border-primary/20 rounded-lg">
        <p className="text-muted-foreground leading-relaxed">
          En <strong>YB MOTOCOM</strong>, nos comprometemos a proteger tu privacidad y garantizar la seguridad
          de tus datos personales. Esta Política de Privacidad describe cómo recopilamos, utilizamos, almacenamos
          y protegemos tu información cuando utilizas nuestro sitio web y servicios, en cumplimiento con la
          Ley 1581 de 2012 de Protección de Datos Personales de Colombia.
        </p>
      </div>

      {/* Accordion */}
      <div className="max-w-4xl mx-auto">
        <Accordion type="single" collapsible className="space-y-4">
          {sections.map((section, index) => {
            const Icon = section.icon
            return (
              <AccordionItem
                key={index}
                value={`section-${index}`}
                className="border rounded-lg px-6 bg-card"
              >
                <AccordionTrigger className="hover:no-underline py-6">
                  <div className="flex items-center gap-3 text-left">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-semibold">{section.title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-6 pt-2">
                  <div className="pl-13 text-muted-foreground whitespace-pre-line leading-relaxed">
                    {section.content}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {/* Final Note */}
        <div className="mt-8 p-6 bg-muted/50 rounded-lg">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Tu Confianza es Nuestra Prioridad
          </h3>
          <p className="text-sm text-muted-foreground">
            En YB MOTOCOM trabajamos constantemente para mejorar nuestras prácticas de privacidad y seguridad.
            Si tienes alguna pregunta o inquietud sobre cómo manejamos tus datos, no dudes en contactarnos.
            Estamos aquí para ayudarte.
          </p>
        </div>
      </div>
    </div>
  )
}
