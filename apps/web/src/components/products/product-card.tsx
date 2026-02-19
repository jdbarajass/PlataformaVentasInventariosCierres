'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ShoppingCart, GitCompareArrows } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useCart } from '@/lib/cart-context'
import { useCompare } from '@/lib/compare-context'
import { formatPrice, getStockStatus, getStockLabel, getProductImage } from '@/lib/utils'
import { Product } from '@/types/database'
import { useToast } from '@/components/ui/use-toast'
import { WishlistButton } from '@/components/products/wishlist-button'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart()
  const { addItem: addToCompare, removeItem: removeFromCompare, hasItem: isInCompare, isFull } = useCompare()
  const { toast } = useToast()
  const stockStatus = getStockStatus(product.stock_qty, product.low_stock_threshold)
  const isOutOfStock = stockStatus === 'out-of-stock'
  const inCompare = isInCompare(product.id)

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isOutOfStock) return

    addItem({
      id: product.id,
      title: product.title,
      price_cents: product.price_cents,
      image: getProductImage(product.images),
      stock_qty: product.stock_qty,
    })

    toast({
      title: 'Agregado al carrito',
      description: product.title,
      variant: 'success',
    })
  }

  const handleToggleCompare = (e: React.MouseEvent) => {
    e.preventDefault()
    if (inCompare) {
      removeFromCompare(product.id)
    } else if (!isFull) {
      addToCompare(product)
      toast({ title: 'Agregado al comparador', description: product.title })
    } else {
      toast({
        title: 'Comparador lleno',
        description: 'Puedes comparar hasta 3 productos. Elimina uno para continuar.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Link href={`/producto/${product.slug}`}>
      <Card className="group h-full overflow-hidden border-0 bg-card/50 backdrop-blur transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-white dark:bg-secondary/50">
          <Image
            src={getProductImage(product.images)}
            alt={product.title}
            fill
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-110"
          />

          {/* Badges */}
          <div className="absolute left-3 top-3 flex flex-col gap-2">
            {product.featured && (
              <Badge variant="default" className="bg-primary/90 backdrop-blur">
                Destacado
              </Badge>
            )}
            {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
              <Badge variant="destructive" className="backdrop-blur">
                -{Math.round((1 - product.price_cents / product.compare_at_price_cents) * 100)}%
              </Badge>
            )}
          </div>

          {/* Bottom-left: Wishlist + Compare buttons */}
          <div className="absolute bottom-3 left-3 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <WishlistButton productId={product.id} productTitle={product.title} />
            <button
              onClick={handleToggleCompare}
              title={inCompare ? 'Quitar del comparador' : 'Agregar al comparador'}
              className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${
                inCompare
                  ? 'bg-cyan-500 text-white'
                  : 'bg-background/80 text-foreground hover:bg-cyan-500/20 hover:text-cyan-500'
              }`}
            >
              <GitCompareArrows className="h-4 w-4" />
            </button>
          </div>

          {/* Stock Badge */}
          <div className="absolute right-3 top-3">
            <Badge
              variant={
                stockStatus === 'in-stock'
                  ? 'success'
                  : stockStatus === 'low-stock'
                  ? 'warning'
                  : 'error'
              }
              className="backdrop-blur"
            >
              {getStockLabel(product.stock_qty, product.low_stock_threshold)}
            </Badge>
          </div>

          {/* Quick Add Button */}
          <div className="absolute bottom-0 left-0 right-0 translate-y-full bg-gradient-to-t from-background/95 to-transparent p-4 transition-transform duration-300 group-hover:translate-y-0">
            <Button
              variant="neon"
              className="w-full"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {isOutOfStock ? 'Agotado' : 'Agregar al carrito'}
            </Button>
          </div>
        </div>

        <CardContent className="p-4">
          {/* Title */}
          <h3 className="mb-2 line-clamp-2 font-semibold transition-colors group-hover:text-primary">
            {product.title}
          </h3>

          {/* Price */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">
              {formatPrice(product.price_cents)}
            </span>
            {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.compare_at_price_cents)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
