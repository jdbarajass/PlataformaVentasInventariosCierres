'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ShoppingCart, Eye, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/lib/cart-context'
import { formatPrice, getStockStatus, getStockLabel, getProductImage } from '@/lib/utils'
import { Product } from '@/types/database'
import { useToast } from '@/components/ui/use-toast'
import { WishlistButton } from '@/components/products/wishlist-button'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart()
  const { toast }   = useToast()

  const stockStatus  = getStockStatus(product.stock_qty, product.low_stock_threshold)
  const isOutOfStock = stockStatus === 'out-of-stock'
  const isOnSale     = !!(product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents)
  const discountPct  = isOnSale
    ? Math.round((1 - product.price_cents / product.compare_at_price_cents!) * 100)
    : 0

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isOutOfStock) return
    addItem({
      id:          product.id,
      title:       product.title,
      price_cents: product.price_cents,
      image:       getProductImage(product.images),
      stock_qty:   product.stock_qty,
    })
    toast({
      title:       '¡Agregado!',
      description: product.title,
      variant:     'success',
    })
  }

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl bg-card border border-border/40 transition-all duration-500 hover:border-primary/40 hover:-translate-y-1.5 cursor-pointer"
         style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)' }}
    >
      {/* Hover shadow upgrade */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
           style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(225,6,0,0.12)' }} />

      {/* Top inset highlight */}
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none z-10" />

      {/* Full-cover link — below interactive elements */}
      <Link
        href={`/producto/${product.slug}`}
        className="absolute inset-0 z-10"
        aria-label={product.title}
      />

      {/* ── Image area ── */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-secondary/50 to-secondary/20">
        <Image
          src={getProductImage(product.images)}
          alt={product.title}
          fill
          className="object-contain p-5 transition-transform duration-500 group-hover:scale-[1.06]"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Gradient overlay on hover for buttons */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/95 via-background/50 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-20 pointer-events-none" />

        {/* ── Top-left badges ── */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-30">
          {product.featured && (
            <span className="inline-flex items-center rounded-lg bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ boxShadow: '0 0 12px rgba(225,6,0,0.5)' }}>
              Top ventas
            </span>
          )}
          {isOnSale && (
            <span className="inline-flex items-center rounded-lg bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              -{discountPct}%
            </span>
          )}
        </div>

        {/* ── Top-right: stock ── */}
        <div className="absolute right-3 top-3 z-30">
          <Badge
            variant={
              stockStatus === 'in-stock'  ? 'success' :
              stockStatus === 'low-stock' ? 'warning' : 'error'
            }
            className="text-[10px] font-medium backdrop-blur-sm"
          >
            {getStockLabel(product.stock_qty, product.low_stock_threshold)}
          </Badge>
        </div>

        {/* ── Hover actions (z-30, above overlay link) ── */}
        {/* Wishlist */}
        <div className="absolute bottom-3 left-3 z-30 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <WishlistButton productId={product.id} productTitle={product.title} />
        </div>

        {/* Quick view */}
        <div className="absolute bottom-3 right-3 z-30 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 delay-75">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/50 hover:text-primary transition-all"
            onClick={(e) => e.stopPropagation()}
            title="Vista rápida"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Add to cart — slides up */}
        <div className="absolute bottom-0 left-0 right-0 translate-y-full transition-transform duration-300 group-hover:translate-y-0 z-30">
          <div className="px-3 pb-3 pt-6">
            <button
              className={[
                'btn-racing w-full text-xs py-2.5 inline-flex items-center justify-center gap-2',
                isOutOfStock ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
              onClick={handleAddToCart}
              disabled={isOutOfStock}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {isOutOfStock ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Info area ── */}
      <div className="p-4 space-y-2.5">
        {/* Rating (decorative) */}
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${i < 4 ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
            />
          ))}
          <span className="text-[10px] text-muted-foreground ml-0.5">(4.8)</span>
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
          {product.title}
        </h3>

        <div className="flex items-baseline gap-2">
          <span className="text-base font-black text-primary">
            {formatPrice(product.price_cents)}
          </span>
          {isOnSale && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(product.compare_at_price_cents!)}
            </span>
          )}
        </div>
      </div>

      {/* Red inset border on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
           style={{ boxShadow: 'inset 0 0 0 1px rgba(225,6,0,0.22)' }} />
    </div>
  )
}
