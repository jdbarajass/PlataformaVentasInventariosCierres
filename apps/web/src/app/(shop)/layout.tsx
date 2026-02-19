import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { BottomNav } from '@/components/layout/bottom-nav'
import { OrganizationSchema } from '@/components/seo/structured-data'
import { LiveChat } from '@/components/chat/live-chat'
import { CompareBar } from '@/components/products/compare-bar'

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ybmotocom.com'

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema url={baseUrl} />
      <Header />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <CartDrawer />
      <BottomNav />
      <CompareBar />
      <LiveChat />
    </div>
  )
}
