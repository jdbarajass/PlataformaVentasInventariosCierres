/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

module.exports = nextConfig
