import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPrice, getStockStatus, getStockLabel, getProductImage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/products/product-card'
import { AddToCartButton } from './add-to-cart-button'
import { Product } from '@/types/database'
import { ProductSchema, BreadcrumbSchema } from '@/components/seo/structured-data'

interface ProductPageProps {
  params: { slug: string }
}

interface ProductWithCategory extends Product {
  categories: { name: string; slug: string } | null
}

async function getProduct(slug: string): Promise<ProductWithCategory | null> {
  const { data: product } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  return product as ProductWithCategory | null
}

async function getRelatedProducts(categoryId: string, excludeId: string): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('category_id', categoryId)
    .eq('active', true)
    .neq('id', excludeId)
    .limit(4)

  return (data as Product[]) || []
}

export async function generateMetadata({ params }: ProductPageProps) {
  const product = await getProduct(params.slug)
  if (!product) return { title: 'Producto no encontrado' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ybmotocom.com'
  const imageUrl = getProductImage(product.images) || `${baseUrl}/images/placeholder.jpg`

  return {
    title: `${product.title} - YB MOTOCOM`,
    description: product.description || `Compra ${product.title} en YB MOTOCOM. Accesorios y equipamiento para motociclistas en Colombia.`,
    keywords: [product.title, 'motos', 'accesorios', 'Colombia', product.categories?.name || ''].filter(Boolean),
    openGraph: {
      title: `${product.title} - YB MOTOCOM`,
      description: product.description || `Compra ${product.title} en YB MOTOCOM`,
      images: [imageUrl],
      url: `${baseUrl}/producto/${product.slug}`,
      type: 'product',
      siteName: 'YB MOTOCOM',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.title} - YB MOTOCOM`,
      description: product.description || `Compra ${product.title} en YB MOTOCOM`,
      images: [imageUrl],
    },
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.slug)

  if (!product) {
    notFound()
  }

  const relatedProducts = product.category_id
    ? await getRelatedProducts(product.category_id, product.id)
    : []

  const stockStatus = getStockStatus(product.stock_qty, product.low_stock_threshold)
  const category = product.categories as { name: string; slug: string } | null

  // Filter valid image URLs to avoid Next.js Image crashes
  const validImages = product.images.filter((img) => {
    if (img.startsWith('/')) return true
    try { new URL(img); return true } catch { return false }
  })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ybmotocom.com'
  const productUrl = `${baseUrl}/producto/${product.slug}`
  const imageUrl = getProductImage(product.images) || `${baseUrl}/images/placeholder.jpg`

  // Breadcrumb items for structured data
  const breadcrumbItems = [
    { name: 'Inicio', url: baseUrl },
    ...(category ? [{ name: category.name, url: `${baseUrl}/categoria/${category.slug}` }] : []),
    { name: product.title, url: productUrl },
  ]

  // Stock availability for schema
  const availability = product.stock_qty > 0 ? 'InStock' : 'OutOfStock'

  return (
    <div className="container py-8">
      {/* Structured Data */}
      <ProductSchema
        product={{
          name: product.title,
          description: product.description || `Compra ${product.title} en YB MOTOCOM`,
          image: imageUrl,
          price: product.price_cents / 100,
          currency: 'COP',
          availability,
          sku: product.sku || undefined,
          brand: 'YB MOTOCOM',
        }}
        url={productUrl}
      />
      <BreadcrumbSchema items={breadcrumbItems} />
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Inicio
        </Link>
        <ChevronRight className="h-4 w-4" />
        {category && (
          <>
            <Link href={`/categoria/${category.slug}`} className="hover:text-foreground">
              {category.name}
            </Link>
            <ChevronRight className="h-4 w-4" />
          </>
        )}
        <span className="text-foreground">{product.title}</span>
      </nav>

      {/* Product */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Images */}
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary">
            <Image
              src={getProductImage(product.images)}
              alt={product.title}
              fill
              className="object-cover"
              priority
            />
            {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
              <Badge variant="destructive" className="absolute left-4 top-4">
                -{Math.round((1 - product.price_cents / product.compare_at_price_cents) * 100)}%
              </Badge>
            )}
          </div>
          {validImages.length > 1 && (
            <div className="grid grid-cols-4 gap-4">
              {validImages.slice(0, 4).map((image, index) => (
                <button
                  key={index}
                  className="relative aspect-square overflow-hidden rounded-xl bg-secondary ring-2 ring-transparent transition-all hover:ring-primary focus:ring-primary"
                >
                  <Image
                    src={image}
                    alt={`${product.title} - imagen ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{product.title}</h1>
            {product.sku && (
              <p className="mt-1 text-sm text-muted-foreground">SKU: {product.sku}</p>
            )}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-primary">
              {formatPrice(product.price_cents)}
            </span>
            {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
              <span className="text-xl text-muted-foreground line-through">
                {formatPrice(product.compare_at_price_cents)}
              </span>
            )}
          </div>

          {/* Stock */}
          <Badge
            variant={
              stockStatus === 'in-stock'
                ? 'success'
                : stockStatus === 'low-stock'
                ? 'warning'
                : 'error'
            }
            className="text-sm"
          >
            {getStockLabel(product.stock_qty, product.low_stock_threshold)}
          </Badge>

          {/* Description */}
          {product.description && (
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground">{product.description}</p>
            </div>
          )}

          {/* Add to Cart */}
          <AddToCartButton product={product} />

          {/* Details */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold">Detalles del producto</h3>
            <dl className="grid gap-2 text-sm">
              {product.sku && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">SKU</dt>
                  <dd>{product.sku}</dd>
                </div>
              )}
              {category && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Categoria</dt>
                  <dd>{category.name}</dd>
                </div>
              )}
              {product.weight_grams && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Peso</dt>
                  <dd>{product.weight_grams}g</dd>
                </div>
              )}
              {product.tags && product.tags.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Etiquetas</dt>
                  <dd>{product.tags.join(', ')}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">Productos relacionados</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
