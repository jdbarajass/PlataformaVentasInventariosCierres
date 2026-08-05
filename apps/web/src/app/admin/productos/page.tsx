'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Plus, Search, Edit, Trash2, MoreHorizontal, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { formatPrice, getStockStatus } from '@/lib/utils'
import { Product } from '@/types/database'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

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
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  // Códigos de barras de cada talla/variante, por producto — el producto
  // base suele quedar con barcode=null cuando tiene tallas (el código real
  // vive por variante), así que buscar solo por product.barcode no
  // encontraba nada al escanear/escribir el código de una talla específica.
  const [variantBarcodesByProduct, setVariantBarcodesByProduct] = useState<Map<string, string[]>>(new Map())

  useEffect(() => {
    fetchProducts()
  }, [])

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
        fetch('/api/products?limit=250&include_inactive=true', {
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

  const filteredProducts = products.filter((product) => {
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
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, SKU o código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
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
                              {product.featured && (
                                <Badge variant="secondary" className="text-xs">
                                  Destacado
                                </Badge>
                              )}
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
                          <Badge variant={product.active ? 'success' : 'secondary'}>
                            {product.active ? 'Activo' : 'Inactivo'}
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
