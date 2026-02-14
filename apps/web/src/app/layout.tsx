import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/providers'
import { WebVitals } from './web-vitals'

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ybmotocom.com'),
  title: {
    default: 'YB MOTOCOM - Accesorios para Motos en Colombia',
    template: '%s | YB MOTOCOM',
  },
  description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia. Cascos, guantes, chaquetas, protecciones y más. Envíos a todo el país.',
  keywords: ['motos', 'accesorios', 'cascos', 'guantes', 'chaquetas', 'motocicletas', 'colombia', 'bogotá', 'equipamiento', 'protecciones'],
  authors: [{ name: 'YB MOTOCOM' }],
  creator: 'YB MOTOCOM',
  publisher: 'YB MOTOCOM',
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
    title: 'YB MOTOCOM - Accesorios para Motos en Colombia',
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia. Cascos, guantes, chaquetas y más.',
    siteName: 'YB MOTOCOM',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'YB MOTOCOM - Accesorios para Motos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YB MOTOCOM - Accesorios para Motos en Colombia',
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia.',
    images: ['/og-image.jpg'],
    creator: '@ybmotocom',
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
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <WebVitals />
      </body>
    </html>
  )
}
