import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/providers'
import { WebVitals } from './web-vitals'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://yjbmotocom.com'),
  title: {
    default: 'YJBMOTOCOM - Accesorios para Motos en Colombia',
    template: '%s | YJBMOTOCOM',
  },
  description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia. Cascos, guantes, chaquetas, protecciones y más. Envíos a todo el país.',
  keywords: ['motos', 'accesorios', 'cascos', 'guantes', 'chaquetas', 'motocicletas', 'colombia', 'bogotá', 'equipamiento', 'protecciones'],
  authors: [{ name: 'YJBMOTOCOM' }],
  creator: 'YJBMOTOCOM',
  publisher: 'YJBMOTOCOM',
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
    title: 'YJBMOTOCOM - Accesorios para Motos en Colombia',
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia. Cascos, guantes, chaquetas y más.',
    siteName: 'YJBMOTOCOM',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'YJBMOTOCOM - Accesorios para Motos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YJBMOTOCOM - Accesorios para Motos en Colombia',
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia.',
    images: ['/og-image.jpg'],
    creator: '@yjbmotocom',
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
