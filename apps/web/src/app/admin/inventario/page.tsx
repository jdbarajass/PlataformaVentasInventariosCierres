'use client'

import { useState, useEffect, useCallback } from 'react'
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
                    return (
                      <tr key={product.id} className="border-b last:border-0">
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
