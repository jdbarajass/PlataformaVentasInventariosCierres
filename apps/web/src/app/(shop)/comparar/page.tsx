'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GitCompareArrows, ShoppingCart, X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCompare } from '@/lib/compare-context'
import { useCart } from '@/lib/cart-context'
import { useToast } from '@/components/ui/use-toast'
import { formatPrice, getProductImage, getStockLabel, getStockStatus } from '@/lib/utils'

const SPECS = [
  { label: 'Precio', key: 'price' },
  { label: 'Precio original', key: 'compare_price' },
  { label: 'Descuento', key: 'discount' },
  { label: 'Stock', key: 'stock' },
  { label: 'SKU', key: 'sku' },
  { label: 'Peso', key: 'weight' },
  { label: 'Etiquetas', key: 'tags' },
]

export default function CompararPage() {
  const { items, removeItem, clear } = useCompare()
  const { addItem } = useCart()
  const { toast } = useToast()

  const hasVariants = (product: (typeof items)[0]) =>
    ((product as any).product_variants || []).some((v: any) => v.active)

  const handleAddToCart = (product: (typeof items)[0]) => {
    if (product.stock_qty <= 0 || hasVariants(product)) return
    addItem({
      id: product.id,
      title: product.title,
      price_cents: product.price_cents,
      image: getProductImage(product.images),
      stock_qty: product.stock_qty,
    })
    toast({ title: 'Agregado al carrito', description: product.title, variant: 'success' })
  }

  const getSpecValue = (product: (typeof items)[0], key: string): string => {
    switch (key) {
      case 'price':
        return formatPrice(product.price_cents)
      case 'compare_price':
        return product.compare_at_price_cents
          ? formatPrice(product.compare_at_price_cents)
          : '—'
      case 'discount':
        return product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents
          ? `-${Math.round((1 - product.price_cents / product.compare_at_price_cents) * 100)}%`
          : '—'
      case 'stock':
        return getStockLabel(product.stock_qty, product.low_stock_threshold)
      case 'sku':
        return product.sku || '—'
      case 'weight':
        return product.weight_grams ? `${product.weight_grams}g` : '—'
      case 'tags':
        return product.tags?.length ? product.tags.join(', ') : '—'
      default:
        return '—'
    }
  }

  if (items.length === 0) {
    return (
      <div className="container py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <GitCompareArrows className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="mb-3 text-2xl font-bold">Sin productos para comparar</h1>
        <p className="mb-8 text-muted-foreground">
          Agrega productos al comparador desde el catálogo usando el botón &quot;Comparar&quot;.
        </p>
        <Button asChild>
          <Link href="/productos" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Ver catálogo
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Comparar productos</h1>
          <p className="text-muted-foreground">
            Comparando {items.length} producto{items.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={clear} className="gap-2">
            <X className="h-4 w-4" />
            Limpiar
          </Button>
          <Button asChild variant="ghost">
            <Link href="/productos" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Seguir comprando
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse">
          {/* Product headers */}
          <thead>
            <tr>
              <th className="w-36 border-b p-4 text-left text-sm font-medium text-muted-foreground">
                Característica
              </th>
              {items.map((product) => (
                <th key={product.id} className="border-b p-4 text-center">
                  <div className="relative">
                    <button
                      onClick={() => removeItem(product.id)}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="mx-auto mb-3 h-32 w-32 overflow-hidden rounded-xl bg-secondary/50">
                      <Image
                        src={getProductImage(product.images)}
                        alt={product.title}
                        width={128}
                        height={128}
                        className="h-full w-full object-contain p-3"
                      />
                    </div>
                    <Link
                      href={`/producto/${product.slug}`}
                      className="line-clamp-2 text-sm font-semibold hover:text-primary"
                    >
                      {product.title}
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Specs */}
          <tbody>
            {SPECS.map((spec, i) => (
              <tr key={spec.key} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                <td className="p-4 text-sm text-muted-foreground">{spec.label}</td>
                {items.map((product) => {
                  const value = getSpecValue(product, spec.key)
                  const isPrice = spec.key === 'price'
                  const isDiscount = spec.key === 'discount' && value !== '—'
                  const isStock = spec.key === 'stock'
                  const stockStatus = isStock
                    ? getStockStatus(product.stock_qty, product.low_stock_threshold)
                    : null

                  return (
                    <td key={product.id} className="p-4 text-center">
                      {isPrice ? (
                        <span className="text-lg font-bold text-primary">{value}</span>
                      ) : isDiscount ? (
                        <Badge variant="destructive">{value}</Badge>
                      ) : isStock ? (
                        <Badge
                          variant={
                            stockStatus === 'in-stock'
                              ? 'success'
                              : stockStatus === 'low-stock'
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {value}
                        </Badge>
                      ) : (
                        <span className="text-sm">{value}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Description */}
            <tr>
              <td className="p-4 align-top text-sm text-muted-foreground">Descripción</td>
              {items.map((product) => (
                <td key={product.id} className="p-4 align-top">
                  <p className="text-sm text-muted-foreground">
                    {product.description || '—'}
                  </p>
                </td>
              ))}
            </tr>

            {/* Actions */}
            <tr className="border-t">
              <td className="p-4" />
              {items.map((product) => (
                <td key={product.id} className="p-4 text-center">
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock_qty <= 0 || hasVariants(product)}
                      className="w-full gap-2"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      {product.stock_qty <= 0 ? 'Agotado' : hasVariants(product) ? 'Elige talla en el detalle' : 'Agregar al carrito'}
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="w-full">
                      <Link href={`/producto/${product.slug}`}>Ver detalle</Link>
                    </Button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
