/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

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
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Optimización de producción
  productionBrowserSourceMaps: false, // Deshabilitar source maps en producción
  poweredByHeader: false, // Remover header X-Powered-By
  compress: true, // Habilitar compresión gzip

  // Headers de seguridad y cache
  async headers() {
    return [
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
