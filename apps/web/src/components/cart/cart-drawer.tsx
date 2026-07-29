'use client'

import Image from 'next/image'
import Link from 'next/link'
import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/lib/cart-context'
import { formatPrice, cn } from '@/lib/utils'

export function CartDrawer() {
  const { state, setCartOpen, removeItem, updateQty, totalPrice, totalItems } = useCart()

  if (!state.isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={() => setCartOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l bg-background shadow-2xl animate-slide-up">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Carrito</h2>
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {totalItems}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-6">
            {state.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShoppingBag className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium mb-2">Tu carrito esta vacio</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Agrega productos para comenzar tu compra
                </p>
                <Button onClick={() => setCartOpen(false)}>
                  Explorar productos
                </Button>
              </div>
            ) : (
              <ul className="space-y-4">
                {state.items.map((item) => (
                  <li
                    key={item.line_id}
                    className="flex gap-4 rounded-xl border bg-card p-4"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium line-clamp-2">{item.title}</h3>
                          {item.talla && (
                            <p className="text-xs text-muted-foreground">Talla: {item.talla}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.line_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-auto flex items-center justify-between">
                        {/* Quantity */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQty(item.line_id, item.qty - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">
                            {item.qty}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQty(item.line_id, item.qty + 1)}
                            disabled={item.qty >= item.stock_qty}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Price */}
                        <span className="font-semibold text-primary">
                          {formatPrice(item.price_cents * item.qty)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {state.items.length > 0 && (
            <div className="border-t p-6">
              <div className="mb-4 flex items-center justify-between text-lg font-semibold">
                <span>Total</span>
                <span className="text-primary">{formatPrice(totalPrice)}</span>
              </div>
              <Button asChild variant="neon" size="lg" className="w-full">
                <Link href="/checkout" onClick={() => setCartOpen(false)}>
                  Proceder al pago
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => setCartOpen(false)}
              >
                Seguir comprando
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
