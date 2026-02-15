'use client'

import { useState } from 'react'
import { ShoppingCart, Minus, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/lib/cart-context'
import { useToast } from '@/components/ui/use-toast'
import { Product } from '@/types/database'
import { getProductImage } from '@/lib/utils'

interface AddToCartButtonProps {
  product: Product
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1)
  const [isAdded, setIsAdded] = useState(false)
  const { addItem, setCartOpen } = useCart()
  const { toast } = useToast()

  const isOutOfStock = product.stock_qty === 0

  const handleAddToCart = () => {
    if (isOutOfStock) return

    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        title: product.title,
        price_cents: product.price_cents,
        image: getProductImage(product.images),
        stock_qty: product.stock_qty,
      })
    }

    setIsAdded(true)
    toast({
      title: 'Agregado al carrito',
      description: `${quantity}x ${product.title}`,
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
            onClick={() => setQuantity(Math.min(product.stock_qty, quantity + 1))}
            disabled={quantity >= product.stock_qty}
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
          disabled={isOutOfStock || isAdded}
        >
          {isAdded ? (
            <>
              <Check className="mr-2 h-5 w-5" />
              Agregado
            </>
          ) : (
            <>
              <ShoppingCart className="mr-2 h-5 w-5" />
              {isOutOfStock ? 'Agotado' : 'Agregar al carrito'}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={handleBuyNow}
          disabled={isOutOfStock}
        >
          Comprar ahora
        </Button>
      </div>
    </div>
  )
}
