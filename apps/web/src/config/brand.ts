/**
 * Identidad de marca de este deployment — fuente única para nombre, dominio,
 * contacto, redes y datos de pago que hoy están escritos a mano en decenas
 * de archivos (footer, header, metadata SEO, emails, recibo térmico, etc).
 *
 * Al hacer fork de este proyecto para otro negocio, este es el ÚNICO archivo
 * que hace falta editar para cambiar la identidad de marca — el resto del
 * código debe importar de aquí en vez de repetir literales.
 *
 * No confundir con `store_settings` (tabla en Supabase, ver lib/settings.ts):
 * eso es configuración editable en runtime desde /admin/configuracion
 * (teléfono, redes, logo, colores) y sigue siendo la fuente de verdad
 * cuando está disponible — los valores de aquí son el fallback estático
 * que se usa mientras esa tabla no responde, y lo único que existe para
 * datos que store_settings no cubre (SEO, emails, recibo térmico, pagos).
 */

const DOMAIN_FALLBACK = 'https://yjbmotocom.com'

export const BRAND = {
  /** Nombre de marca corto, en mayúsculas (usado en textos, copyright, subjects de email) */
  name: 'YJBMOTOCOM',
  /** Texto del logo en header/footer (junto al ícono) */
  shortName: 'MOTOCOM',
  /** Iniciales del ícono cuadrado del logo en header/footer */
  logoInitials: 'YB',
  /** Textos del escudo/sello dibujado en el recibo térmico POS (distinto del logo del sitio) */
  receiptSeal: { top: 'YJB', bottom: 'MOTOCOM' },
  tagline: 'Tu tienda de confianza para accesorios y equipamiento de motos en Colombia.',
  description:
    'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia. Cascos, guantes, chaquetas, protecciones y más. Envíos a todo el país.',

  /** Dominio público del sitio — fallback estático cuando la env var no está definida */
  domain: DOMAIN_FALLBACK,

  supportEmail: 'yjbmotocom@gmail.com',
  ordersFromAddress: 'YJBMOTOCOM <pedidos@yjbmotocom.com>',

  /** Sin '+', tal como lo usan los enlaces wa.me. Solo fallback si store_settings no trae uno propio. */
  whatsapp: '573214111371',
  twitterHandle: '@yjbmotocom',

  /** Handles (sin URL completa) usados para armar los sameAs de structured data */
  socialHandles: {
    facebook: 'yjbmotocom',
    instagram: 'yjbmotocom',
    twitter: 'yjbmotocom',
    tiktok: 'yjbmotocom',
  },

  /** Contacto/ubicación mostrados en el sitio público (footer, structured data). Fallback si store_settings no trae contact_info. */
  contact: {
    phonePrimary: '+57 321 411 1371',
    phoneSecondary: '+57 314 406 5520',
    address: 'Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1',
    city: 'Bogotá',
    cityCountry: 'Bogotá, Colombia',
    region: 'Cundinamarca',
    postalCode: '110111',
    country: 'CO',
    geo: { latitude: 4.598889, longitude: -74.075833 },
  },

  /** Datos fiscales/ubicación impresos en el recibo térmico POS (venta de mostrador) */
  receipt: {
    nit: 'NIT 1032464724-2',
    address: 'AK 14 # 17-21 LOCAL 127, Bogotá D.C.',
    phone: 'Tel: +57 314 406 5520',
    regimen: 'No responsable de IVA',
    /** Nombre de vendedor mostrado cuando la venta no tiene uno asociado */
    defaultSellerName: 'YJB Motocom',
  },

  /** Datos de pago manual (transferencia/Nequi/Daviplata) mostrados al cliente tras el checkout */
  payment: {
    bank: {
      bankName: 'Bancolombia',
      accountType: 'Ahorros',
      accountNumber: '912-962660-81',
      /** Persona natural con registro de Cámara de Comercio — sin razón social ni NIT, no inventar ninguno de los dos. */
      holderName: 'YJBMOTOCOM',
    },
    nequi: { phone: '314 406 5520', name: 'YJBMOTOCOM' },
    daviplata: { phone: '314 406 5520', name: 'YJBMOTOCOM' },
  },
} as const
