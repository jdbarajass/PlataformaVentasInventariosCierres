import { MetadataRoute } from 'next'
import { getServiceSupabase } from '@/lib/supabase'
import { BRAND } from '@/config/brand'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || BRAND.domain
  const supabase = getServiceSupabase()

  // Páginas estáticas
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/productos`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categorias`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/ofertas`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/nosotros`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contacto`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/envios`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/devoluciones`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terminos`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacidad`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  // Obtener productos activos
  const { data: products } = await supabase
    .from('products')
    .select('slug, updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })

  const productPages: MetadataRoute.Sitemap = products
    ? products.map((product) => ({
        url: `${baseUrl}/producto/${product.slug}`,
        lastModified: new Date(product.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    : []

  // Obtener categorías activas
  const { data: categories } = await supabase
    .from('categories')
    .select('slug, updated_at')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const categoryPages: MetadataRoute.Sitemap = categories
    ? categories.map((category) => ({
        url: `${baseUrl}/categoria/${category.slug}`,
        lastModified: new Date(category.updated_at || new Date()),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    : []

  return [...staticPages, ...categoryPages, ...productPages]
}
