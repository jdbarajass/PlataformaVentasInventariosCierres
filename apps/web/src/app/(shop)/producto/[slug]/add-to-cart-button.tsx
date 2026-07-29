'use client'

import { useState } from 'react'
import { ShoppingCart, Minus, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/lib/cart-context'
import { useToast } from '@/components/ui/use-toast'
import { Product, ProductVariant } from '@/types/database'
import { getProductImage } from '@/lib/utils'

interface AddToCartButtonProps {
  product: Product & { product_variants?: ProductVariant[] }
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const variants = (product.product_variants || []).filter((v) => v.active)
  const hasVariants = variants.length > 0

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [isAdded, setIsAdded] = useState(false)
  const { addItem, setCartOpen } = useCart()
  const { toast } = useToast()

  const selectedVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) || null : null
  // Sin variantes: stock del producto base. Con variantes: stock de la
  // talla elegida (0 si todavía no se elige ninguna) — nunca el total
  // sumado de todas las tallas, que no es lo que hay disponible para ESA
  // talla puntual.
  const effectiveStock = hasVariants ? (selectedVariant?.stock_qty ?? 0) : product.stock_qty
  const needsVariantSelection = hasVariants && !selectedVariantId
  const isOutOfStock = !needsVariantSelection && effectiveStock === 0
  const allVariantsOutOfStock = hasVariants && variants.every((v) => v.stock_qty === 0)

  const handleAddToCart = () => {
    if (needsVariantSelection || isOutOfStock) return

    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        variant_id: selectedVariant?.id ?? null,
        talla: selectedVariant?.talla ?? null,
        title: product.title,
        price_cents: product.price_cents,
        image: getProductImage(product.images),
        stock_qty: effectiveStock,
      })
    }

    setIsAdded(true)
    toast({
      title: 'Agregado al carrito',
      description: `${quantity}x ${product.title}${selectedVariant?.talla ? ` (talla ${selectedVariant.talla})` : ''}`,
      variant: 'success',
    })

    setTimeout(() => setIsAdded(false), 2000)
  }

  const handleBuyNow = () => {
    handleAddToCart()
    setTimeout(() => setCartOpen(true), 300)
  }

  return (
    <div className="space-y-4">
      {/* Selector de talla */}
      {hasVariants && (
        <div>
          <span className="mb-2 block text-sm font-medium">
            Talla: {selectedVariant ? selectedVariant.talla : allVariantsOutOfStock ? '' : 'elige una talla'}
          </span>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const outOfStock = v.stock_qty === 0
              const isSelected = v.id === selectedVariantId
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => {
                    setSelectedVariantId(v.id)
                    setQuantity(1)
                  }}
                  className={[
                    'min-w-[3rem] rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    isSelected ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary' : 'hover:border-primary/50',
                    outOfStock ? 'cursor-not-allowed opacity-40 line-through' : '',
                  ].join(' ')}
                  title={outOfStock ? `Talla ${v.talla} agotada` : `Talla ${v.talla}`}
                >
                  {v.talla}
                </button>
              )
            })}
          </div>
          {allVariantsOutOfStock && (
            <p className="mt-2 text-sm text-muted-foreground">Todas las tallas están agotadas.</p>
          )}
        </div>
      )}

      {/* Quantity */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Cantidad:</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center font-semibold">{quantity}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setQuantity(Math.min(effectiveStock, quantity + 1))}
            disabled={quantity >= effectiveStock}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="neon"
          size="lg"
          className="flex-1"
          onClick={handleAddToCart}
          disabled={needsVariantSelection || isOutOfStock || isAdded}
        >
          {isAdded ? (
            <>
              <Check className="mr-2 h-5 w-5" />
              Agregado
            </>
          ) : (
            <>
              <ShoppingCart className="mr-2 h-5 w-5" />
              {needsVariantSelection ? 'Elige una talla' : isOutOfStock ? 'Agotado' : 'Agregar al carrito'}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={handleBuyNow}
          disabled={needsVariantSelection || isOutOfStock}
        >
          Comprar ahora
        </Button>
      </div>
    </div>
  )
}
