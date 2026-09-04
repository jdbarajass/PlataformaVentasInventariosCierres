import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { BottomNav } from '@/components/layout/bottom-nav'
import { OrganizationSchema } from '@/components/seo/structured-data'
import { LiveChat } from '@/components/chat/live-chat'
import { CompareBar } from '@/components/products/compare-bar'
import { getStoreSettings } from '@/lib/settings'
import { BRAND } from '@/config/brand'

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || BRAND.domain

  // Mismo número que usa el Footer para el CTA de WhatsApp — antes el Header
  // tenía un WHATSAPP_NUMBER fijo propio y podía mostrar un número distinto
  // al del Footer si alguien lo cambiaba en /admin/configuracion.
  const settings = await getStoreSettings()
  const whatsappNumber = settings?.social_links?.whatsapp?.replace(/\D/g, '') || BRAND.whatsapp

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema url={baseUrl} />
      <Header whatsappNumber={whatsappNumber} />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <CartDrawer />
      <BottomNav />
      <CompareBar />
      <LiveChat />
    </div>
  )
}
