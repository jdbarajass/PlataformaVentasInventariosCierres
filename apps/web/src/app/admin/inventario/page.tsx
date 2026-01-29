'use client'

import { useState } from 'react'
import {
  Package,
  Search,
  Plus,
  Minus,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// Mock data
const mockProducts = [
  {
    id: '1',
    sku: 'CSC-001',
    title: 'Casco Integral Pro',
    stock_qty: 15,
    low_stock_threshold: 5,
    category: 'Cascos',
    price_cents: 35000000,
    last_movement: '2024-12-20T10:00:00Z',
  },
  {
    id: '2',
    sku: 'GNT-002',
    title: 'Guantes Touring Premium',
    stock_qty: 3,
    low_stock_threshold: 5,
    category: 'Guantes',
    price_cents: 12000000,
    last_movement: '2024-12-19T15:30:00Z',
  },
  {
    id: '3',
    sku: 'CHQ-003',
    title: 'Chaqueta Protección Total',
    stock_qty: 8,
    low_stock_threshold: 3,
    category: 'Chaquetas',
    price_cents: 45000000,
    last_movement: '2024-12-18T09:00:00Z',
  },
  {
    id: '4',
    sku: 'BTS-004',
    title: 'Botas Racing Carbon',
    stock_qty: 0,
    low_stock_threshold: 2,
    category: 'Botas',
    price_cents: 28000000,
    last_movement: '2024-12-15T14:00:00Z',
  },
  {
    id: '5',
    sku: 'ACC-005',
    title: 'Kit de Herramientas Moto',
    stock_qty: 25,
    low_stock_threshold: 10,
    category: 'Accesorios',
    price_cents: 8500000,
    last_movement: '2024-12-20T11:30:00Z',
  },
]

const mockMovements = [
  {
    id: '1',
    product_title: 'Casco Integral Pro',
    qty: 5,
    type: 'in',
    note: 'Reposición de inventario',
    created_at: '2024-12-20T10:00:00Z',
  },
  {
    id: '2',
    product_title: 'Guantes Touring Premium',
    qty: -2,
    type: 'sale',
    note: 'Orden #ORD-001',
    created_at: '2024-12-19T15:30:00Z',
  },
  {
    id: '3',
    product_title: 'Botas Racing Carbon',
    qty: -1,
    type: 'out',
    note: 'Producto defectuoso',
    created_at: '2024-12-15T14:00:00Z',
  },
]

export default function InventarioPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [adjustmentQty, setAdjustmentQty] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'in' | 'out' | 'adjustment'>('in')

  const filteredProducts = mockProducts.filter((product) => {
    const matchesSearch =
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesLowStock = !showLowStock || product.stock_qty <= product.low_stock_threshold
    return matchesSearch && matchesLowStock
  })

  const lowStockCount = mockProducts.filter(
    (p) => p.stock_qty <= p.low_stock_threshold
  ).length

  const outOfStockCount = mockProducts.filter((p) => p.stock_qty === 0).length

  const totalStock = mockProducts.reduce((sum, p) => sum + p.stock_qty, 0)

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
          <Button variant="outline" className="rounded-xl">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <Button className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
            <Plus className="mr-2 h-4 w-4" />
            Ajuste masivo
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
              <p className="text-2xl font-bold">{mockProducts.length}</p>
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
                return (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="px-6 py-4">
                      <p className="font-medium">{product.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Último mov: {formatDate(product.last_movement)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <code className="rounded bg-muted px-2 py-1 text-sm">
                        {product.sku}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm">{product.category}</td>
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
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => setSelectedProduct(product.id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => setSelectedProduct(product.id)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => setSelectedProduct(product.id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
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
      </div>

      {/* Recent Movements */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Movimientos recientes</h2>
        <div className="space-y-3">
          {mockMovements.map((movement) => (
            <div
              key={movement.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    movement.qty > 0
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-red-500/10 text-red-500'
                  }`}
                >
                  {movement.qty > 0 ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{movement.product_title}</p>
                  <p className="text-sm text-muted-foreground">{movement.note}</p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-bold ${
                    movement.qty > 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {movement.qty > 0 ? '+' : ''}
                  {movement.qty}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(movement.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
