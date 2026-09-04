import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/providers'
import { WebVitals } from './web-vitals'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { BRAND } from '@/config/brand'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || BRAND.domain),
  title: {
    default: `${BRAND.name} - Accesorios para Motos en Colombia`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  keywords: ['motos', 'accesorios', 'cascos', 'guantes', 'chaquetas', 'motocicletas', 'colombia', 'bogotá', 'equipamiento', 'protecciones'],
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  publisher: BRAND.name,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    url: '/',
    title: `${BRAND.name} - Accesorios para Motos en Colombia`,
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia. Cascos, guantes, chaquetas y más.',
    siteName: BRAND.name,
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: `${BRAND.name} - Accesorios para Motos`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} - Accesorios para Motos en Colombia`,
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia.',
    images: ['/og-image.jpg'],
    creator: BRAND.twitterHandle,
  },
  verification: {
    google: 'google-site-verification-code', // Actualizar con código real
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado antes de que React monte — evita flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||'light';document.documentElement.classList.add(t);}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <AnalyticsProvider />
        <WebVitals />
      </body>
    </html>
  )
}
