'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Plus, Search, Edit, Trash2, MoreHorizontal, ImageIcon, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { formatPrice, getStockStatus } from '@/lib/utils'
import { Product } from '@/types/database'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'

function ProductThumbnail({ src, alt }: { src: string; alt: string }) {
  const [hasError, setHasError] = useState(false)

  let isValid = false
  try {
    new URL(src)
    isValid = true
  } catch {}

  if (!isValid || hasError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      onError={() => setHasError(true)}
    />
  )
}

export default function ProductsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { userProfile } = useAuth()
  // Mismo criterio que Editar Producto: el rol 'seller' no ve el costo real.
  const canViewCost = userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  // Códigos de barras de cada talla/variante, por producto — el producto
  // base suele quedar con barcode=null cuando tiene tallas (el código real
  // vive por variante), así que buscar solo por product.barcode no
  // encontraba nada al escanear/escribir el código de una talla específica.
  const [variantBarcodesByProduct, setVariantBarcodesByProduct] = useState<Map<string, string[]>>(new Map())
  // Costo por variante/talla, por producto — un producto con tallas no tiene
  // un solo costo (cada talla puede costar distinto), así que la columna
  // "Costo" de la tabla necesita el rango real en vez de leer
  // product.cost_cents (que ahí no se usa).
  const [variantCostsByProduct, setVariantCostsByProduct] = useState<Map<string, number[]>>(new Map())

  useEffect(() => {
    fetchProducts()
  }, [])

  // Costo por variante, en un efecto aparte gatillado por canViewCost (no en
  // fetchProducts): si esto viajara siempre, un vendedor lo recibiría en la
  // respuesta de red aunque la columna esté oculta en la UI — justo lo que
  // esta sección de Productos quiere evitar (ver /api/pos/min-price, que
  // existe por el mismo motivo). Se dispara de nuevo si canViewCost pasa de
  // false a true (ej. el perfil del usuario carga después del primer render).
  useEffect(() => {
    if (!canViewCost) {
      setVariantCostsByProduct(new Map())
      return
    }
    supabase
      .from('product_variants')
      .select('product_id, cost_cents')
      .then(({ data }) => {
        const costMap = new Map<string, number[]>()
        for (const v of (data || []) as { product_id: string; cost_cents: number }[]) {
          const costs = costMap.get(v.product_id) || []
          costs.push(v.cost_cents)
          costMap.set(v.product_id, costs)
        }
        setVariantCostsByProduct(costMap)
      })
  }, [canViewCost])

  const fetchProducts = async () => {
    try {
      // include_inactive=true: sin esto (y sin el token de sesión) esta
      // lista solo mostraba productos activos — los 190 productos migrados
      // del inventario físico (inactive=true a propósito, sin foto/
      // descripción aún) no aparecían para poder completarlos y publicarlos.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const [response, { data: allVariants }] = await Promise.all([
        // Límite alto a propósito — mismo bug ya encontrado en Inventario
        // (docs/UNIFICACION_YJBMOTOCOM.md sección 81.14): un límite bajo acá
        // deja productos completos fuera del listado en silencio en cuanto
        // el catálogo lo supera.
        fetch('/api/products?limit=2000&include_inactive=true', {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        }),
        supabase.from('product_variants').select('product_id, barcode'),
      ])
      const data = await response.json()
      setProducts(data.products || [])

      const map = new Map<string, string[]>()
      for (const v of (allVariants || []) as { product_id: string; barcode: string | null }[]) {
        if (!v.barcode) continue
        const list = map.get(v.product_id) || []
        list.push(v.barcode)
        map.set(v.product_id, list)
      }
      setVariantBarcodesByProduct(map)
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Un producto activo/publicable sin foto o sin descripción no está listo
  // para verse bien en la tienda pública. Los productos ya eliminados no
  // cuentan — no tiene sentido pedirles foto/descripción.
  const isProductIncomplete = (product: Product) =>
    !product.deleted_at && (product.images.length === 0 || !product.description?.trim())

  const incompleteCount = products.filter(isProductIncomplete).length

  // Costo a mostrar para un producto: si no tiene tallas, el costo del
  // producto mismo; si tiene tallas, el rango de costo entre todas ellas
  // (suelen costar igual, pero no siempre — ver docs/UNIFICACION_YJBMOTOCOM.md).
  const getProductCost = (product: Product): { min: number; max: number } => {
    const variantCosts = variantCostsByProduct.get(product.id)
    if (!variantCosts || variantCosts.length === 0) {
      return { min: product.cost_cents, max: product.cost_cents }
    }
    return { min: Math.min(...variantCosts), max: Math.max(...variantCosts) }
  }

  // Precios mínimos sugeridos a partir del costo — solo de referencia
  // visual, no tocan formData.price ni se guardan en ningún lado:
  //   - margen 30% sobre el precio: costo / 0.7 (el costo queda siendo el
  //     70% del precio de venta).
  //   - +30% sobre el costo (markup): costo * 1.3.
  const costoEntreMargen = (cents: number) => Math.round(cents / 0.7)
  const costoMasMarkup = (cents: number) => Math.round(cents * 1.3)

  const formatCostRange = (range: { min: number; max: number }, transform: (cents: number) => number) => {
    const min = transform(range.min)
    const max = transform(range.max)
    return min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`
  }

  const filteredProducts = products.filter((product) => {
    if (showIncompleteOnly && !isProductIncomplete(product)) return false
    const q = search.toLowerCase().trim()
    if (!q) return true
    if (product.title.toLowerCase().includes(q)) return true
    if (product.sku?.toLowerCase().includes(q)) return true
    if (product.barcode?.toLowerCase().includes(q)) return true
    const variantCodes = variantBarcodesByProduct.get(product.id) || []
    return variantCodes.some((c) => c.toLowerCase().includes(q))
  })

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`¿Estás seguro de eliminar el producto "${title}"?`)) {
      return
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al eliminar')
      }

      toast({
        title: 'Producto eliminado',
        description: 'El producto se eliminó exitosamente',
        variant: 'success',
      })

      // Refrescar lista
      fetchProducts()
    } catch (error) {
      console.error('Error deleting product:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al eliminar producto',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Productos</h1>
          <p className="text-muted-foreground">
            Gestiona el catalogo de productos de la tienda
          </p>
        </div>
        <Button onClick={() => router.push('/admin/productos/nuevo')}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, SKU o código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={showIncompleteOnly}
              onCheckedChange={(checked) => setShowIncompleteOnly(checked === true)}
            />
            <span>
              Solo incompletos (sin foto o descripción)
              {incompleteCount > 0 && (
                <Badge variant="warning" className="ml-2">
                  {incompleteCount}
                </Badge>
              )}
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredProducts.length} productos encontrados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-4 font-medium">Producto</th>
                    <th className="pb-4 font-medium">SKU</th>
                    <th className="pb-4 font-medium">Precio</th>
                    {canViewCost && (
                      <>
                        <th className="pb-4 font-medium">Costo</th>
                        <th className="pb-4 font-medium" title="Costo ÷ 0.7 — el costo queda siendo el 70% del precio de venta">
                          Mín. margen 30%
                        </th>
                        <th className="pb-4 font-medium" title="Costo × 1.3 — 30% de utilidad sobre el costo">
                          Mín. +30% costo
                        </th>
                      </>
                    )}
                    <th className="pb-4 font-medium">Stock</th>
                    <th className="pb-4 font-medium">Estado</th>
                    <th className="pb-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map((product) => {
                    const stockStatus = getStockStatus(
                      product.stock_qty,
                      product.low_stock_threshold
                    )
                    const costRange = canViewCost ? getProductCost(product) : null
                    return (
                      <tr key={product.id} className="group">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-secondary">
                              <ProductThumbnail
                                src={product.images[0] || ''}
                                alt={product.title}
                              />
                            </div>
                            <div>
                              <p className="font-medium line-clamp-1">
                                {product.title}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {product.featured && (
                                  <Badge variant="secondary" className="text-xs">
                                    Destacado
                                  </Badge>
                                )}
                                {isProductIncomplete(product) && (
                                  <Badge
                                    variant="warning"
                                    className="gap-1 text-xs"
                                    title={
                                      [
                                        product.images.length === 0 && 'sin foto',
                                        !product.description?.trim() && 'sin descripción',
                                      ]
                                        .filter(Boolean)
                                        .join(' y ')
                                    }
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {product.images.length === 0 && !product.description?.trim()
                                      ? 'Sin foto ni descripción'
                                      : product.images.length === 0
                                        ? 'Sin foto'
                                        : 'Sin descripción'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-muted-foreground">
                          {product.sku || '-'}
                        </td>
                        <td className="py-4">
                          <div>
                            <p className="font-medium">
                              {formatPrice(product.price_cents)}
                            </p>
                            {product.compare_at_price_cents && (
                              <p className="text-sm text-muted-foreground line-through">
                                {formatPrice(product.compare_at_price_cents)}
                              </p>
                            )}
                          </div>
                        </td>
                        {canViewCost && costRange && (
                          <>
                            <td className="py-4 text-muted-foreground">{formatCostRange(costRange, (c) => c)}</td>
                            <td className="py-4 text-muted-foreground">{formatCostRange(costRange, costoEntreMargen)}</td>
                            <td className="py-4 text-muted-foreground">{formatCostRange(costRange, costoMasMarkup)}</td>
                          </>
                        )}
                        <td className="py-4">
                          <Badge
                            variant={
                              stockStatus === 'in-stock'
                                ? 'success'
                                : stockStatus === 'low-stock'
                                ? 'warning'
                                : 'error'
                            }
                          >
                            {product.stock_qty}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <Badge variant={product.active ? 'success' : product.deleted_at ? 'error' : 'secondary'}>
                            {product.active ? 'Activo' : product.deleted_at ? 'Eliminado' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/admin/productos/${product.id}/editar`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(product.id, product.title)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No se encontraron productos
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
