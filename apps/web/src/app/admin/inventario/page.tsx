'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import {
  Package,
  Search,
  Plus,
  Minus,
  RefreshCw,
  AlertTriangle,
  Download,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface ProductStock {
  id: string
  sku: string | null
  title: string
  stock_qty: number
  low_stock_threshold: number
  price_cents: number
  category: { name: string } | null
}

interface ProductVariant {
  id: string
  product_id: string
  talla: string | null
  sku: string | null
  barcode: string | null
  stock_qty: number
  low_stock_threshold: number
  cost_cents: number
  active: boolean
}

interface InventoryMovement {
  id: string
  qty: number
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'return'
  note: string | null
  created_at: string
  product: { id: string; title: string; sku: string | null } | null
}

const typeLabels: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment: 'Ajuste',
  sale: 'Venta',
  return: 'Devolución',
}

export default function InventarioPage() {
  const [products, setProducts] = useState<ProductStock[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)

  // Adjustment modal state
  const [adjustingProduct, setAdjustingProduct] = useState<string | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<'in' | 'out' | 'adjustment'>('in')
  const [adjustmentQty, setAdjustmentQty] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Variantes por talla / código de barras
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, ProductVariant[]>>({})
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [newVariant, setNewVariant] = useState({ talla: '', barcode: '', stock_qty: '', cost_cents: '' })
  const [savingVariant, setSavingVariant] = useState(false)
  const [adjustingVariant, setAdjustingVariant] = useState<string | null>(null)
  const [variantAdjType, setVariantAdjType] = useState<'in' | 'out' | 'adjustment'>('in')
  const [variantAdjQty, setVariantAdjQty] = useState('')

  const { session, userProfile } = useAuth()
  const { toast } = useToast()

  const fetchProducts = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const res = await fetch('/api/products?limit=200&include_inactive=true', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!res.ok) throw new Error('Error fetching products')

      const result = await res.json()
      const data = result.data || result.products || []
      setProducts(
        data.map((p: any) => ({
          id: p.id,
          sku: p.sku,
          title: p.title,
          stock_qty: p.stock_qty,
          low_stock_threshold: p.low_stock_threshold,
          price_cents: p.price_cents,
          category: p.category || p.categories || null,
        }))
      )
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }, [session?.access_token])

  const fetchMovements = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const res = await fetch('/api/inventory/adjust?limit=10', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!res.ok) throw new Error('Error fetching movements')

      const { data } = await res.json()
      setMovements(data || [])
    } catch (error) {
      console.error('Error fetching movements:', error)
    }
  }, [session?.access_token])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchProducts(), fetchMovements()])
      setLoading(false)
    }
    load()
  }, [fetchProducts, fetchMovements])

  const handleAdjust = async () => {
    if (!session?.access_token || !adjustingProduct || !adjustmentQty) return

    const qty = parseInt(adjustmentQty)
    if (isNaN(qty) || qty <= 0) {
      toast({
        title: 'Error',
        description: 'La cantidad debe ser un número positivo',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          product_id: adjustingProduct,
          qty,
          type: adjustmentType,
          note: adjustmentNote || `Ajuste manual - ${typeLabels[adjustmentType]}`,
          created_by: userProfile?.id,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al ajustar inventario')
      }

      toast({
        title: 'Inventario ajustado',
        description: `Se registró ${adjustmentType === 'in' ? 'entrada' : adjustmentType === 'out' ? 'salida' : 'ajuste'} de ${qty} unidades`,
      })

      setAdjustingProduct(null)
      setAdjustmentQty('')
      setAdjustmentNote('')
      await Promise.all([fetchProducts(), fetchMovements()])
    } catch (error: any) {
      console.error('Error adjusting inventory:', error)
      toast({
        title: 'Error',
        description: error.message || 'No se pudo ajustar el inventario',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const fetchVariants = useCallback(
    async (productId: string) => {
      if (!session?.access_token) return
      setLoadingVariants(true)
      try {
        const res = await fetch(`/api/products/${productId}/variants`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) throw new Error('Error fetching variants')
        const { data } = await res.json()
        setVariantsByProduct((prev) => ({ ...prev, [productId]: data || [] }))
      } catch (error) {
        console.error('Error fetching product variants:', error)
      } finally {
        setLoadingVariants(false)
      }
    },
    [session?.access_token]
  )

  const toggleVariants = (productId: string) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null)
      return
    }
    setExpandedProduct(productId)
    setNewVariant({ talla: '', barcode: '', stock_qty: '', cost_cents: '' })
    if (!variantsByProduct[productId]) {
      fetchVariants(productId)
    }
  }

  const handleAddVariant = async (productId: string) => {
    if (!session?.access_token) return
    if (!newVariant.talla.trim() && !newVariant.barcode.trim()) {
      toast({
        title: 'Error',
        description: 'Ingresa al menos la talla o el código de barras',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingVariant(true)
      const res = await fetch(`/api/products/${productId}/variants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          talla: newVariant.talla.trim() || null,
          barcode: newVariant.barcode.trim() || null,
          stock_qty: parseInt(newVariant.stock_qty) || 0,
          cost_cents: Math.round((parseFloat(newVariant.cost_cents) || 0) * 100),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al crear la variante')
      }

      toast({ title: 'Variante creada', description: 'Se agregó la talla al producto' })
      setNewVariant({ talla: '', barcode: '', stock_qty: '', cost_cents: '' })
      await fetchVariants(productId)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la variante',
        variant: 'destructive',
      })
    } finally {
      setSavingVariant(false)
    }
  }

  const handleDeleteVariant = async (productId: string, variantId: string) => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/product-variants/${variantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Error al eliminar la variante')
      toast({ title: 'Variante desactivada' })
      await fetchVariants(productId)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo desactivar la variante',
        variant: 'destructive',
      })
    }
  }

  const handleAdjustVariant = async (productId: string, variantId: string) => {
    if (!session?.access_token || !variantAdjQty) return
    const qty = parseInt(variantAdjQty)
    if (isNaN(qty) || qty <= 0) {
      toast({
        title: 'Error',
        description: 'La cantidad debe ser un número positivo',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          product_id: productId,
          variant_id: variantId,
          qty,
          type: variantAdjType,
          note: `Ajuste manual variante - ${typeLabels[variantAdjType]}`,
          created_by: userProfile?.id,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al ajustar la variante')
      }

      toast({ title: 'Variante ajustada' })
      setAdjustingVariant(null)
      setVariantAdjQty('')
      await fetchVariants(productId)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo ajustar la variante',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    const matchesLowStock = !showLowStock || product.stock_qty <= product.low_stock_threshold
    return matchesSearch && matchesLowStock
  })

  const lowStockCount = products.filter(
    (p) => p.stock_qty <= p.low_stock_threshold
  ).length

  const outOfStockCount = products.filter((p) => p.stock_qty === 0).length

  const totalStock = products.reduce((sum, p) => sum + p.stock_qty, 0)

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStockStatus = (qty: number, threshold: number) => {
    if (qty === 0) {
      return { label: 'Sin stock', color: 'bg-red-500/10 text-red-500 border-red-500/20' }
    }
    if (qty <= threshold) {
      return { label: 'Stock bajo', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' }
    }
    return { label: 'En stock', color: 'bg-green-500/10 text-green-500 border-green-500/20' }
  }

  const handleExportCSV = () => {
    const headers = ['SKU', 'Producto', 'Stock', 'Umbral', 'Estado', 'Precio']
    const rows = filteredProducts.map((p) => {
      const status = getStockStatus(p.stock_qty, p.low_stock_threshold)
      return [
        p.sku || '',
        p.title,
        p.stock_qty.toString(),
        p.low_stock_threshold.toString(),
        status.label,
        formatPrice(p.price_cents),
      ]
    })

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventario-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventario</h1>
          <p className="text-muted-foreground">
            Gestiona el stock de tus productos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-sm text-muted-foreground">Productos</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <Package className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalStock}</p>
              <p className="text-sm text-muted-foreground">Unidades totales</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{lowStockCount}</p>
              <p className="text-sm text-muted-foreground">Stock bajo</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <Package className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{outOfStockCount}</p>
              <p className="text-sm text-muted-foreground">Sin stock</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-10"
          />
        </div>
        <Button
          variant={showLowStock ? 'default' : 'outline'}
          onClick={() => setShowLowStock(!showLowStock)}
          className="rounded-xl"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Stock bajo ({lowStockCount})
        </Button>
      </div>

      {/* Products Table */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Cargando inventario...</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Producto
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      SKU
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Categoría
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                      Stock
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Estado
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Precio
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                      Tallas
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const status = getStockStatus(
                      product.stock_qty,
                      product.low_stock_threshold
                    )
                    const isAdjusting = adjustingProduct === product.id
                    const isExpanded = expandedProduct === product.id
                    const variants = variantsByProduct[product.id] || []
                    return (
                      <Fragment key={product.id}>
                      <tr className="border-b last:border-0">
                        <td className="px-6 py-4">
                          <p className="font-medium">{product.title}</p>
                        </td>
                        <td className="px-6 py-4">
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {product.sku || '-'}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {product.category?.name || 'Sin categoría'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xl font-bold">{product.stock_qty}</span>
                          <span className="text-sm text-muted-foreground">
                            {' '}/ mín {product.low_stock_threshold}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className={status.color}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {formatPrice(product.price_cents)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => toggleVariants(product.id)}
                          >
                            <Tags className="mr-1 h-4 w-4" />
                            {variantsByProduct[product.id]?.length ?? '·'}
                            {isExpanded ? (
                              <ChevronDown className="ml-1 h-3 w-3" />
                            ) : (
                              <ChevronRight className="ml-1 h-3 w-3" />
                            )}
                          </Button>
                        </td>
                        <td className="px-6 py-4">
                          {isAdjusting ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-1">
                                <select
                                  value={adjustmentType}
                                  onChange={(e) => setAdjustmentType(e.target.value as 'in' | 'out' | 'adjustment')}
                                  className="rounded-lg border bg-background px-2 py-1 text-xs"
                                >
                                  <option value="in">Entrada</option>
                                  <option value="out">Salida</option>
                                  <option value="adjustment">Ajuste</option>
                                </select>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="Cant."
                                  value={adjustmentQty}
                                  onChange={(e) => setAdjustmentQty(e.target.value)}
                                  className="h-7 w-16 rounded-lg text-xs"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <Input
                                  placeholder="Nota..."
                                  value={adjustmentNote}
                                  onChange={(e) => setAdjustmentNote(e.target.value)}
                                  className="h-7 rounded-lg text-xs"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={handleAdjust}
                                  disabled={saving}
                                >
                                  {saving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => {
                                    setAdjustingProduct(null)
                                    setAdjustmentQty('')
                                    setAdjustmentNote('')
                                  }}
                                >
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Entrada de stock"
                                onClick={() => {
                                  setAdjustingProduct(product.id)
                                  setAdjustmentType('in')
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Salida de stock"
                                onClick={() => {
                                  setAdjustingProduct(product.id)
                                  setAdjustmentType('out')
                                }}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Ajuste de stock"
                                onClick={() => {
                                  setAdjustingProduct(product.id)
                                  setAdjustmentType('adjustment')
                                }}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b bg-muted/30 last:border-0">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">
                                Tallas / variantes de &quot;{product.title}&quot;
                              </p>
                              {loadingVariants && variants.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Cargando variantes...</p>
                              ) : variants.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Este producto no tiene tallas/variantes registradas — sigue usando el stock general de arriba.
                                </p>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border bg-card">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Talla</th>
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Código de barras</th>
                                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">Stock</th>
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Costo</th>
                                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">Acciones</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {variants.map((variant) => {
                                        const variantAdjusting = adjustingVariant === variant.id
                                        return (
                                          <tr key={variant.id} className="border-b last:border-0">
                                            <td className="px-4 py-2">{variant.talla || '-'}</td>
                                            <td className="px-4 py-2">
                                              <code className="rounded bg-muted px-2 py-1 text-xs">
                                                {variant.barcode || '-'}
                                              </code>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <span className="font-bold">{variant.stock_qty}</span>
                                              {variant.stock_qty <= variant.low_stock_threshold && (
                                                <Badge variant="outline" className="ml-2 bg-orange-500/10 text-orange-500 border-orange-500/20">
                                                  Bajo
                                                </Badge>
                                              )}
                                            </td>
                                            <td className="px-4 py-2">{formatPrice(variant.cost_cents)}</td>
                                            <td className="px-4 py-2">
                                              {variantAdjusting ? (
                                                <div className="flex items-center justify-center gap-1">
                                                  <select
                                                    value={variantAdjType}
                                                    onChange={(e) => setVariantAdjType(e.target.value as 'in' | 'out' | 'adjustment')}
                                                    className="rounded-lg border bg-background px-2 py-1 text-xs"
                                                  >
                                                    <option value="in">Entrada</option>
                                                    <option value="out">Salida</option>
                                                    <option value="adjustment">Ajuste</option>
                                                  </select>
                                                  <Input
                                                    type="number"
                                                    min="1"
                                                    placeholder="Cant."
                                                    value={variantAdjQty}
                                                    onChange={(e) => setVariantAdjQty(e.target.value)}
                                                    className="h-7 w-16 rounded-lg text-xs"
                                                  />
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    onClick={() => handleAdjustVariant(product.id, variant.id)}
                                                    disabled={saving}
                                                  >
                                                    <Check className="h-3 w-3 text-green-500" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    onClick={() => {
                                                      setAdjustingVariant(null)
                                                      setVariantAdjQty('')
                                                    }}
                                                  >
                                                    <X className="h-3 w-3 text-red-500" />
                                                  </Button>
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-center gap-1">
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-lg"
                                                    title="Ajustar stock de la variante"
                                                    onClick={() => {
                                                      setAdjustingVariant(variant.id)
                                                      setVariantAdjType('in')
                                                    }}
                                                  >
                                                    <RefreshCw className="h-3 w-3" />
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-lg"
                                                    title="Desactivar variante"
                                                    onClick={() => handleDeleteVariant(product.id, variant.id)}
                                                  >
                                                    <Trash2 className="h-3 w-3 text-red-500" />
                                                  </Button>
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  placeholder="Talla (ej. M, L, 42)"
                                  value={newVariant.talla}
                                  onChange={(e) => setNewVariant({ ...newVariant, talla: e.target.value })}
                                  className="h-8 w-32 rounded-lg text-xs"
                                />
                                <Input
                                  placeholder="Código de barras"
                                  value={newVariant.barcode}
                                  onChange={(e) => setNewVariant({ ...newVariant, barcode: e.target.value })}
                                  className="h-8 w-40 rounded-lg text-xs"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Stock inicial"
                                  value={newVariant.stock_qty}
                                  onChange={(e) => setNewVariant({ ...newVariant, stock_qty: e.target.value })}
                                  className="h-8 w-28 rounded-lg text-xs"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Costo unitario"
                                  value={newVariant.cost_cents}
                                  onChange={(e) => setNewVariant({ ...newVariant, cost_cents: e.target.value })}
                                  className="h-8 w-28 rounded-lg text-xs"
                                />
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg"
                                  onClick={() => handleAddVariant(product.id)}
                                  disabled={savingVariant}
                                >
                                  {savingVariant ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <Plus className="mr-1 h-3 w-3" />
                                  )}
                                  Agregar talla
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredProducts.length === 0 && (
              <div className="p-8 text-center">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  No se encontraron productos
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recent Movements */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Movimientos recientes</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay movimientos registrados</p>
        ) : (
          <div className="space-y-3">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      movement.type === 'in' || movement.type === 'return'
                        ? 'bg-green-500/10 text-green-500'
                        : movement.type === 'out' || movement.type === 'sale'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-blue-500/10 text-blue-500'
                    }`}
                  >
                    {movement.type === 'in' || movement.type === 'return' ? (
                      <Plus className="h-4 w-4" />
                    ) : movement.type === 'out' || movement.type === 'sale' ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {movement.product?.title || 'Producto eliminado'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {movement.note || typeLabels[movement.type] || movement.type}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`font-bold ${
                      movement.type === 'in' || movement.type === 'return'
                        ? 'text-green-500'
                        : movement.type === 'out' || movement.type === 'sale'
                          ? 'text-red-500'
                          : 'text-blue-500'
                    }`}
                  >
                    {movement.type === 'in' || movement.type === 'return' ? '+' :
                     movement.type === 'out' || movement.type === 'sale' ? '-' : ''}
                    {Math.abs(movement.qty)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(movement.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
