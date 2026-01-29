import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'YB MOTOCOM - Accesorios para Motos',
  description: 'Tu tienda de accesorios y equipamiento para motociclistas. Cascos, guantes, chaquetas y más.',
  keywords: ['motos', 'accesorios', 'cascos', 'guantes', 'chaquetas', 'motocicletas'],
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
      </body>
    </html>
  )
}
