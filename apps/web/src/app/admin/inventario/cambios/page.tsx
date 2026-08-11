'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface Variant {
  id: string
  talla: string | null
  barcode: string | null
  stock_qty: number
}

interface ProductResult {
  id: string
  title: string
  sku: string | null
  stock_qty: number
  variants: Variant[]
  matched_variant_id?: string
}

interface Side {
  query: string
  results: ProductResult[]
  selectedProduct: ProductResult | null
  selectedVariantId: string
  qty: string
}

const emptySide: Side = { query: '', results: [], selectedProduct: null, selectedVariantId: '', qty: '1' }

export default function CambiosPage() {
  const [sale, setSale] = useState<Side>(emptySide)
  const [entra, setEntra] = useState<Side>(emptySide)
  const [confirming, setConfirming] = useState(false)

  const { session } = useAuth()
  const { toast } = useToast()

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const search = async (side: 'sale' | 'entra', query: string) => {
    const setSide = side === 'sale' ? setSale : setEntra
    setSide((prev) => ({ ...prev, query }))
    if (!session?.access_token || query.trim().length < 2) {
      setSide((prev) => ({ ...prev, results: [] }))
      return
    }
    const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query.trim())}`, { headers: authHeaders() })
    if (!res.ok) return
    const { data } = await res.json()
    setSide((prev) => ({ ...prev, results: data || [] }))
  }

  const selectProduct = (side: 'sale' | 'entra', product: ProductResult) => {
    const setSide = side === 'sale' ? setSale : setEntra
    setSide((prev) => ({
      ...prev,
      selectedProduct: product,
      selectedVariantId: product.variants[0]?.id || '',
      results: [],
      query: product.title,
      qty: '1',
    }))
  }

  // Stock disponible del lado elegido — si el producto no tiene tallas,
  // `variants` viene vacío y el stock real es el del producto mismo (antes
  // esto no se contemplaba: un producto sin tallas nunca encontraba nada
  // en `variants.find(...)`, así que jamás se podía confirmar un cambio
  // con productos sin talla — la mitad del catálogo quedaba bloqueada).
  const sideStock = (side: Side): number | null => {
    if (!side.selectedProduct) return null
    if (side.selectedProduct.variants.length === 0) return side.selectedProduct.stock_qty
    const v = side.selectedProduct.variants.find((v) => v.id === side.selectedVariantId)
    return v ? v.stock_qty : null
  }

  const saleStock = sideStock(sale)
  const entraStock = sideStock(entra)
  const saleQty = parseInt(sale.qty) || 0
  const entraQty = parseInt(entra.qty) || 0

  const canConfirm =
    sale.selectedProduct &&
    entra.selectedProduct &&
    saleStock !== null &&
    entraStock !== null &&
    saleQty > 0 &&
    entraQty > 0 &&
    saleQty <= saleStock &&
    !(sale.selectedProduct.id === entra.selectedProduct.id && sale.selectedVariantId === entra.selectedVariantId)

  const handleConfirm = async () => {
    if (!session?.access_token || !sale.selectedProduct || !entra.selectedProduct || saleStock === null || entraStock === null) return
    const confirmMsg =
      `¿Confirmar el siguiente cambio?\n\n` +
      `Sale: ${sale.selectedProduct.title} — ${saleQty} unidad${saleQty !== 1 ? 'es' : ''} (stock: ${saleStock} → ${saleStock - saleQty})\n` +
      `Entra: ${entra.selectedProduct.title} — ${entraQty} unidad${entraQty !== 1 ? 'es' : ''} (stock: ${entraStock} → ${entraStock + entraQty})`
    if (!confirm(confirmMsg)) return

    try {
      setConfirming(true)
      const res = await fetch('/api/inventory/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          sale: { productId: sale.selectedProduct.id, variantId: sale.selectedVariantId || null, qty: saleQty },
          entra: { productId: entra.selectedProduct.id, variantId: entra.selectedVariantId || null, qty: entraQty },
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al procesar el cambio')
      }
      toast({ title: 'Cambio realizado' })
      setSale(emptySide)
      setEntra(emptySide)
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setConfirming(false)
    }
  }

  const renderColumn = (
    label: string,
    verbo: 'baja' | 'sube',
    side: Side,
    key: 'sale' | 'entra',
    colorClass: string
  ) => {
    const setSide = key === 'sale' ? setSale : setEntra
    const stock = sideStock(side)
    return (
      <div className={`rounded-xl border p-4 ${colorClass}`}>
        <h2 className="mb-1 font-semibold">{label}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          El inventario de este artículo {verbo} la cantidad que indiques
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={side.query}
            onChange={(e) => search(key, e.target.value)}
            className="rounded-lg pl-10"
          />
        </div>
        {side.results.length > 0 && (
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-card p-1">
            {side.results.map((p) => (
              <button
                key={p.id}
                onClick={() => selectProduct(key, p)}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-secondary"
              >
                {p.title}
              </button>
            ))}
          </div>
        )}
        {side.selectedProduct && (
          <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">{side.selectedProduct.title}</p>
            {side.selectedProduct.variants.length > 0 ? (
              <select
                value={side.selectedVariantId}
                onChange={(e) => setSide((prev) => ({ ...prev, selectedVariantId: e.target.value }))}
                className="w-full rounded-lg border bg-background px-2 py-1 text-xs"
              >
                {side.selectedProduct.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    Talla {v.talla || '-'} · Stock {v.stock_qty}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">Sin tallas · Stock {stock}</p>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Cantidad:</label>
              <Input
                type="number"
                min="1"
                max={key === 'sale' && stock !== null ? stock : undefined}
                value={side.qty}
                onChange={(e) => setSide((prev) => ({ ...prev, qty: e.target.value }))}
                className="h-8 w-20 rounded-lg text-sm"
              />
              {key === 'sale' && stock !== null && parseInt(side.qty) > stock && (
                <span className="text-xs font-medium text-red-500">Solo hay {stock} disponible(s)</span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/admin/inventario" className="rounded-lg p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Cambio de Producto</h1>
          <p className="text-muted-foreground">
            El cliente devuelve un producto y se lleva otro a cambio. Busca ambos artículos.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {renderColumn(
          'Producto que SALE (se le entrega al cliente)',
          'baja',
          sale,
          'sale',
          'border-red-500/20 bg-red-500/5'
        )}
        {renderColumn(
          'Producto que ENTRA (lo devuelve el cliente)',
          'sube',
          entra,
          'entra',
          'border-green-500/20 bg-green-500/5'
        )}
      </div>

      <Button className="w-full rounded-xl" size="lg" onClick={handleConfirm} disabled={!canConfirm || confirming}>
        {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        Confirmar cambio
      </Button>
    </div>
  )
}
