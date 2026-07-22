'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, RefreshCw, Loader2, Lock } from 'lucide-react'
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
  variants: Variant[]
  matched_variant_id?: string
}

interface Side {
  query: string
  results: ProductResult[]
  selectedProduct: ProductResult | null
  selectedVariantId: string
}

const emptySide: Side = { query: '', results: [], selectedProduct: null, selectedVariantId: '' }

export default function CambiosPage() {
  const [sale, setSale] = useState<Side>(emptySide)
  const [entra, setEntra] = useState<Side>(emptySide)
  const [confirming, setConfirming] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'

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
    }))
  }

  const formatSide = (side: Side) => {
    if (!side.selectedProduct) return null
    return side.selectedProduct.variants.find((v) => v.id === side.selectedVariantId) || null
  }

  const saleVariant = formatSide(sale)
  const entraVariant = formatSide(entra)
  const saleStock = saleVariant?.stock_qty ?? 0
  const entraStock = entraVariant?.stock_qty ?? 0

  const canConfirm =
    sale.selectedProduct &&
    entra.selectedProduct &&
    saleVariant &&
    entraVariant &&
    !(sale.selectedProduct.id === entra.selectedProduct.id && sale.selectedVariantId === entra.selectedVariantId)

  const handleConfirm = async () => {
    if (!session?.access_token || !sale.selectedProduct || !entra.selectedProduct) return
    const confirmMsg =
      `¿Confirmar el siguiente cambio?\n\n` +
      `Sale: ${sale.selectedProduct.title} (stock: ${saleStock} → ${saleStock - 1})\n` +
      `Entra: ${entra.selectedProduct.title} (stock: ${entraStock} → ${entraStock + 1})`
    if (!confirm(confirmMsg)) return

    try {
      setConfirming(true)
      const res = await fetch('/api/inventory/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          sale: { productId: sale.selectedProduct.id, variantId: sale.selectedVariantId || null },
          entra: { productId: entra.selectedProduct.id, variantId: entra.selectedVariantId || null },
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

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  const renderColumn = (
    label: string,
    hint: string,
    side: Side,
    key: 'sale' | 'entra',
    colorClass: string
  ) => (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <h2 className="mb-1 font-semibold">{label}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
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
        <div className="mt-3 rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">{side.selectedProduct.title}</p>
          {side.selectedProduct.variants.length > 0 && (
            <select
              value={side.selectedVariantId}
              onChange={(e) =>
                (key === 'sale' ? setSale : setEntra)((prev) => ({ ...prev, selectedVariantId: e.target.value }))
              }
              className="mt-2 w-full rounded-lg border bg-background px-2 py-1 text-xs"
            >
              {side.selectedProduct.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  Talla {v.talla || '-'} · Stock {v.stock_qty}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )

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
          'El inventario de este artículo baja 1 unidad',
          sale,
          'sale',
          'border-red-500/20 bg-red-500/5'
        )}
        {renderColumn(
          'Producto que ENTRA (lo devuelve el cliente)',
          'El inventario de este artículo sube 1 unidad',
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
