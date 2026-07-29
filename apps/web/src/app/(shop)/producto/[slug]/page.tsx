import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getServiceSupabase } from '@/lib/supabase'
import { formatPrice, getStockStatus, getStockLabel, getProductImage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/products/product-card'
import { ProductImageGallery } from '@/components/products/product-image-gallery'
import { AddToCartButton } from './add-to-cart-button'
import { ReviewSection } from '@/components/reviews/review-section'
import { RestockSubscribe } from '@/components/products/restock-subscribe'
import { CompareButton } from '@/components/products/compare-button'
import { Product, ProductVariant } from '@/types/database'
import { ProductSchema, BreadcrumbSchema } from '@/components/seo/structured-data'

export const dynamic = 'force-dynamic'

interface ProductWithCategory extends Product {
  categories: { name: string; slug: string } | null
  product_variants: ProductVariant[]
}

async function getProduct(slug: string): Promise<ProductWithCategory | null> {
  try {
    const supabase = getServiceSupabase()
    const { data: product, error } = await supabase
      .from('products')
      .select('*, categories(name, slug), product_variants(*)')
      .eq('slug', slug)
      .eq('active', true)
      .single()

    if (error || !product) return null
    return product as unknown as ProductWithCategory
  } catch {
    return null
  }
}

async function getRelatedProducts(categoryId: string, excludeId: string): Promise<Product[]> {
  try {
    const supabase = getServiceSupabase()
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('category_id', categoryId)
      .eq('active', true)
      .neq('id', excludeId)
      .limit(4)

    return (data as Product[]) || []
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug)
  if (!product) return { title: 'Producto no encontrado' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yjbmotocom.com'
  const title = `${product.title} - YJBMOTOCOM`
  const description = product.description || `Compra ${product.title} en YJBMOTOCOM`
  const image = getProductImage(product.images)
  const url = `${baseUrl}/producto/${product.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug)

  if (!product) {
    notFound()
  }

  const relatedProducts = product.category_id
    ? await getRelatedProducts(product.category_id, product.id)
    : []

  const stockStatus = getStockStatus(product.stock_qty, product.low_stock_threshold)
  const category = product.categories

  const validImages = product.images.filter((img) => {
    if (img.startsWith('/')) return true
    try { new URL(img); return true } catch { return false }
  })

  const mainImage = getProductImage(product.images)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yjbmotocom.com'
  const productUrl = `${baseUrl}/producto/${product.slug}`
  const availability = product.stock_qty > 0 ? 'InStock' : 'OutOfStock'

  return (
    <div className="container py-8">
      <ProductSchema
        url={productUrl}
        product={{
          name: product.title,
          description: product.description || `Compra ${product.title} en YJBMOTOCOM`,
          image: mainImage,
          price: product.price_cents / 100,
          currency: 'COP',
          availability,
          sku: product.sku ?? undefined,
        }}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: baseUrl },
          ...(category ? [{ name: category.name, url: `${baseUrl}/categoria/${category.slug}` }] : []),
          { name: product.title, url: productUrl },
        ]}
      />

      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Inicio</Link>
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
        <ProductImageGallery
          images={validImages.length > 0 ? validImages : [mainImage]}
          title={product.title}
          discountPct={
            product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents
              ? Math.round((1 - product.price_cents / product.compare_at_price_cents) * 100)
              : undefined
          }
        />

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

          {/* Add to Cart / Comparar / Restock Subscribe */}
          <AddToCartButton product={product} />
          <CompareButton product={product} variant="full" className="w-full sm:w-auto" />
          {(() => {
            const activeVariants = (product.product_variants || []).filter((v) => v.active)
            const outOfStockVariants = activeVariants.filter((v) => v.stock_qty === 0)
            // Sin tallas: se muestra si el producto completo está agotado.
            // Con tallas: se muestra si ALGUNA talla está agotada, aunque
            // otras sigan disponibles (el total ya no sirve como señal).
            const shouldShow = activeVariants.length > 0 ? outOfStockVariants.length > 0 : product.stock_qty <= 0
            if (!shouldShow) return null
            return (
              <RestockSubscribe
                productId={product.id}
                productTitle={product.title}
                outOfStockVariants={outOfStockVariants.map((v) => ({ id: v.id, talla: v.talla }))}
              />
            )
          })()}

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
            </dl>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <ReviewSection productId={product.id} productTitle={product.title} />

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">Productos relacionados</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
