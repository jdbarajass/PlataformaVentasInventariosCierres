import Link from 'next/link'
import { Facebook, Instagram, Twitter, MessageCircle, Mail, Phone, MapPin } from 'lucide-react'
import { getStoreSettings } from '@/lib/settings'

const footerLinks = {
  tienda: [
    { name: 'Cascos', href: '/categoria/cascos' },
    { name: 'Guantes', href: '/categoria/guantes' },
    { name: 'Chaquetas', href: '/categoria/chaquetas' },
    { name: 'Accesorios', href: '/categoria/accesorios' },
    { name: 'Ofertas', href: '/ofertas' },
  ],
  ayuda: [
    { name: 'Contacto', href: '/contacto' },
    { name: 'Envios', href: '/envios' },
    { name: 'Devoluciones', href: '/devoluciones' },
    { name: 'FAQ', href: '/faq' },
  ],
  legal: [
    { name: 'Terminos y condiciones', href: '/terminos' },
    { name: 'Politica de privacidad', href: '/privacidad' },
  ],
}

// Fallbacks para cuando no hay settings en BD
const FALLBACK_CONTACT = {
  phone_primary: '+57 321 411 1371',
  phone_secondary: '+57 314 406 5520',
  email: 'ybmotocom@gmail.com',
  address: 'Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1',
  city: 'Bogotá, Colombia',
}

export async function Footer() {
  const settings = await getStoreSettings()

  const contact = settings?.contact_info ?? FALLBACK_CONTACT
  const social = settings?.social_links

  // Solo mostrar redes sociales que tienen URL configurada
  const socialLinks = [
    social?.facebook   && { name: 'Facebook',  href: social.facebook,                                          icon: Facebook     },
    social?.instagram  && { name: 'Instagram', href: social.instagram,                                         icon: Instagram    },
    social?.twitter    && { name: 'Twitter',   href: social.twitter,                                           icon: Twitter      },
    social?.whatsapp   && { name: 'WhatsApp',  href: `https://wa.me/${social.whatsapp.replace(/\D/g, '')}`,    icon: MessageCircle },
  ].filter(Boolean) as { name: string; href: string; icon: React.ElementType }[]

  return (
    <footer className="border-t bg-secondary/30">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
                <span className="text-xl font-bold text-white">YB</span>
              </div>
              <span className="font-bold">MOTOCOM</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Tu tienda de confianza para accesorios y equipamiento de motos.
              Calidad y seguridad para cada viaje.
            </p>
            {socialLinks.length > 0 && (
              <div className="flex gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.name}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    <social.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Tienda */}
          <div>
            <h3 className="mb-4 font-semibold">Tienda</h3>
            <ul className="space-y-2">
              {footerLinks.tienda.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Ayuda */}
          <div>
            <h3 className="mb-4 font-semibold">Ayuda</h3>
            <ul className="space-y-2">
              {footerLinks.ayuda.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="mb-4 font-semibold">Contacto</h3>
            <ul className="space-y-3">
              {contact.phone_primary && (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{contact.phone_primary}</span>
                </li>
              )}
              {contact.phone_secondary && (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{contact.phone_secondary}</span>
                </li>
              )}
              {contact.email && (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>{contact.email}</span>
                </li>
              )}
              {(contact.address || contact.city) && (
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {contact.address}
                    {contact.address && contact.city ? ', ' : ''}
                    {contact.city}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} YB MOTOCOM. Todos los derechos reservados.
          </p>
          <div className="flex gap-4">
            {footerLinks.legal.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
