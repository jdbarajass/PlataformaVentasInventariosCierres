'use client'

import Image from 'next/image'
import Link from 'next/link'
import { X, GitCompareArrows, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompare } from '@/lib/compare-context'
import { getProductImage, formatPrice } from '@/lib/utils'

export function CompareBar() {
  const { items, removeItem, clear } = useCompare()

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 md:bottom-0">
      <div className="border-t bg-card/95 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex items-center gap-4 py-3">
          {/* Icon */}
          <div className="hidden items-center gap-2 text-sm font-medium sm:flex">
            <GitCompareArrows className="h-5 w-5 text-cyan-500" />
            <span>Comparar ({items.length}/3)</span>
          </div>

          {/* Product thumbnails */}
          <div className="flex flex-1 items-center gap-3 overflow-x-auto">
            {items.map((product) => (
              <div
                key={product.id}
                className="flex shrink-0 items-center gap-2 rounded-xl border bg-background px-3 py-2"
              >
                <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-secondary">
                  <Image
                    src={getProductImage(product.images)}
                    alt={product.title}
                    fill
                    className="object-contain p-1"
                  />
                </div>
                <div className="max-w-[120px]">
                  <p className="truncate text-xs font-medium">{product.title}</p>
                  <p className="text-xs text-cyan-500">{formatPrice(product.price_cents)}</p>
                </div>
                <button
                  onClick={() => removeItem(product.id)}
                  className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: 3 - items.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex h-14 w-36 shrink-0 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground"
              >
                Agregar producto
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </Button>
            <Button asChild size="sm" disabled={items.length < 2}>
              <Link href="/comparar" className="gap-2">
                Comparar
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
