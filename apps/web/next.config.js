/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimización de imágenes
  images: {
    // Formatos modernos con mejor compresión
    formats: ['image/webp', 'image/avif'],

    // Tamaños de dispositivos comunes para responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],

    // Tamaños de imágenes para diferentes contextos
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    // Cache TTL mínimo (en segundos)
    minimumCacheTTL: 31536000, // 1 año

    // Patrones de dominios remotos permitidos
    remotePatterns: [
      // Supabase Storage (imágenes de producción)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Picsum Photos (imágenes demo de desarrollo)
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'fastly.picsum.photos',
      },
    ],
  },

  // Optimización de producción
  productionBrowserSourceMaps: false, // Deshabilitar source maps en producción
  poweredByHeader: false, // Remover header X-Powered-By
  compress: true, // Habilitar compresión gzip

  // Headers de seguridad y cache
  async headers() {
    // CSP en modo Report-Only: registra violaciones sin bloquear nada.
    // El sitio carga Stripe.js, Tawk.to, GA/PostHog y Supabase Storage desde
    // el cliente, y no tenemos forma de verificar en este cambio que una CSP
    // enforced no rompa alguno de esos widgets en producción. Recomendado:
    // monitorear los reportes un par de semanas y luego pasar a
    // "Content-Security-Policy" (enforced) si no aparecen violaciones
    // inesperadas.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://embed.tawk.to https://www.googletagmanager.com https://www.google-analytics.com https://*.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://picsum.photos https://fastly.picsum.photos https://www.google-analytics.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://embed.tawk.to wss://*.tawk.to https://*.posthog.com https://www.google-analytics.com https://*.sentry.io https://*.ingest.sentry.io",
      "frame-src 'self' https://js.stripe.com https://embed.tawk.to",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
      {
        source: '/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
