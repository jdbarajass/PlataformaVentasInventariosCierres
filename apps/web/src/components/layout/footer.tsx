import Link from 'next/link'
import { Facebook, Instagram, Twitter, MessageCircle, Mail, Phone, MapPin, ArrowRight } from 'lucide-react'
import { getStoreSettings } from '@/lib/settings'

const footerLinks = {
  tienda: [
    { name: 'Cascos',     href: '/categoria/cascos'    },
    { name: 'Guantes',    href: '/categoria/guantes'   },
    { name: 'Chaquetas',  href: '/categoria/chaquetas' },
    { name: 'Accesorios', href: '/categoria/accesorios'},
    { name: 'Ofertas',    href: '/ofertas'             },
  ],
  ayuda: [
    { name: 'Contacto',      href: '/contacto'     },
    { name: 'Envíos',        href: '/envios'       },
    { name: 'Devoluciones',  href: '/devoluciones' },
    { name: 'FAQ',           href: '/faq'          },
    { name: 'Mi cuenta',     href: '/mi-cuenta'    },
  ],
  legal: [
    { name: 'Términos y condiciones',  href: '/terminos'   },
    { name: 'Política de privacidad',  href: '/privacidad' },
  ],
}

const FALLBACK_CONTACT = {
  phone_primary:   '+57 321 411 1371',
  phone_secondary: '+57 314 406 5520',
  email:           'ybmotocom@gmail.com',
  address:         'Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1',
  city:            'Bogotá, Colombia',
}

export async function Footer() {
  const settings    = await getStoreSettings()
  const contact     = settings?.contact_info ?? FALLBACK_CONTACT
  const social      = settings?.social_links

  const whatsappHref = social?.whatsapp
    ? `https://wa.me/${social.whatsapp.replace(/\D/g, '')}?text=Hola!%20Quiero%20información%20sobre%20sus%20productos`
    : `https://wa.me/${FALLBACK_CONTACT.phone_primary.replace(/\D/g, '')}?text=Hola!%20Quiero%20información`

  const socialLinks = [
    social?.facebook  && { name: 'Facebook',  href: social.facebook,   icon: Facebook      },
    social?.instagram && { name: 'Instagram', href: social.instagram,  icon: Instagram     },
    social?.twitter   && { name: 'Twitter',   href: social.twitter,    icon: Twitter       },
    social?.whatsapp  && { name: 'WhatsApp',  href: whatsappHref,      icon: MessageCircle },
  ].filter(Boolean) as { name: string; href: string; icon: React.ElementType }[]

  return (
    <footer className="border-t border-border/50 bg-secondary/20">
      {/* ── Top CTA strip ── */}
      <div className="border-b border-border/40 bg-primary/5">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-sm">¿Tienes dudas? Te ayudamos en segundos.</p>
            <p className="text-xs text-muted-foreground">Nuestro equipo está listo para asesorarte.</p>
          </div>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(37,211,102,0.35)] hover:shadow-[0_6px_24px_rgba(37,211,102,0.5)] transition-all shrink-0"
          >
            <MessageCircle className="h-4 w-4" />
            Chatear por WhatsApp
          </a>
        </div>
      </div>

      {/* ── Main footer ── */}
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">

          {/* Brand */}
          <div className="space-y-5">
            <Link href="/" className="flex items-center gap-2.5 group w-fit">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-glow-red-sm group-hover:shadow-glow-red transition-shadow">
                <span className="text-sm font-black tracking-tighter text-white">YB</span>
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-black text-sm tracking-[0.12em] uppercase">MOTOCOM</span>
                <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Accesorios</span>
              </div>
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Tu tienda de confianza para accesorios y equipamiento de motos en Colombia.
              Calidad certificada y seguridad en cada viaje.
            </p>

            {/* Social */}
            {socialLinks.length > 0 && (
              <div className="flex gap-2">
                {socialLinks.map((s) => (
                  <a
                    key={s.name}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.name}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-card transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                  >
                    <s.icon className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Tienda */}
          <div>
            <h3 className="mb-5 text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
              Tienda
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.tienda.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Ayuda */}
          <div>
            <h3 className="mb-5 text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
              Ayuda
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.ayuda.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="mb-5 text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
              Contacto
            </h3>
            <ul className="space-y-3">
              {contact.phone_primary && (
                <li>
                  <a
                    href={`tel:${contact.phone_primary.replace(/\s/g,'')}`}
                    className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-primary/60" />
                    {contact.phone_primary}
                  </a>
                </li>
              )}
              {contact.phone_secondary && (
                <li>
                  <a
                    href={`tel:${contact.phone_secondary.replace(/\s/g,'')}`}
                    className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-primary/60" />
                    {contact.phone_secondary}
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-primary/60" />
                    {contact.email}
                  </a>
                </li>
              )}
              {(contact.address || contact.city) && (
                <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary/60" />
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
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-border/40">
        <div className="container py-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} YB MOTOCOM · Todos los derechos reservados.
          </p>
          <div className="flex gap-5">
            {footerLinks.legal.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
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
