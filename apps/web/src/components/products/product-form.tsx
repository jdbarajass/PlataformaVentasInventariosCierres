'use client'

import { useRouter } from 'next/navigation'
import { Loader2, Save, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageUploader } from '@/components/products/image-uploader'
import { useProductForm } from '@/components/products/use-product-form'
import { useAuth } from '@/lib/auth-context'
import { Product } from '@/types/database'

interface ProductFormProps {
  product?: Product
  mode: 'create' | 'edit'
  hasVariants?: boolean
}

export function ProductForm({ product, mode, hasVariants }: ProductFormProps) {
  const router = useRouter()
  const { formData, setFormData, categories, isLoading, handleSubmit } = useProductForm({ product, mode, hasVariants })
  const { userProfile } = useAuth()
  // El rol 'seller' no ve el costo real del producto (igual que el
  // Vendedor del software local) — el valor sigue viajando en formData.cost
  // y se guarda sin cambios al enviar el formulario, solo se oculta el input.
  const canViewCost = userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'
  const isAdmin = userProfile?.role === 'admin'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.push('/admin/productos')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {mode === 'create' ? 'Nuevo Producto' : 'Editar Producto'}
            </h1>
            <p className="text-muted-foreground">
              {mode === 'create'
                ? 'Agrega un nuevo producto al catálogo'
                : 'Modifica la información del producto'}
            </p>
          </div>
        </div>
        <Button type="submit" disabled={isLoading || !isAdmin}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </>
          )}
        </Button>
      </div>

      {/* Información Básica */}
      <Card>
        <CardHeader>
          <CardTitle>Información Básica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Título <span className="text-destructive">*</span>
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej: Casco Integral Negro Mate"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">SKU</label>
              <Input
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Ej: CASCO-001"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción detallada del producto..."
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Categoría</label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Precios */}
      <Card>
        <CardHeader>
          <CardTitle>Precios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Precio de Venta <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
            </div>

            {canViewCost && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Precio de Costo</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Precio de Comparación
                <Badge variant="secondary" className="ml-2 text-xs">
                  Para descuentos
                </Badge>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.compareAtPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, compareAtPrice: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {formData.compareAtPrice && parseFloat(formData.compareAtPrice) > parseFloat(formData.price) && (
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-sm text-muted-foreground">
                Descuento:{' '}
                <span className="font-semibold text-primary">
                  {Math.round(
                    (1 - parseFloat(formData.price) / parseFloat(formData.compareAtPrice)) * 100
                  )}
                  %
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Imágenes */}
      <Card>
        <CardHeader>
          <CardTitle>Imágenes</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader
            images={formData.images}
            onChange={(images) => setFormData({ ...formData, images })}
          />
        </CardContent>
      </Card>

      {/* Inventario */}
      <Card>
        <CardHeader>
          <CardTitle>Inventario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Stock Disponible</label>
              <Input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="0"
                disabled={hasVariants}
              />
              {hasVariants && (
                <p className="text-xs text-muted-foreground">
                  Este producto tiene tallas — el stock se suma automáticamente de cada talla.
                  Edítalo desde{' '}
                  <a href="/admin/inventario" className="underline">
                    Inventario
                  </a>
                  .
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Umbral de Stock Bajo
                <Badge variant="secondary" className="ml-2 text-xs">
                  Alerta
                </Badge>
              </label>
              <Input
                type="number"
                min="0"
                value={formData.lowStockThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, lowStockThreshold: e.target.value })
                }
                placeholder="5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organización */}
      <Card>
        <CardHeader>
          <CardTitle>Organización</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Etiquetas
              <span className="ml-2 text-xs text-muted-foreground">
                Separadas por comas
              </span>
            </label>
            <Input
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="Ej: nuevo, oferta, destacado"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">Producto activo</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">Producto destacado</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Footer Buttons */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/productos')}
          disabled={isLoading}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading || !isAdmin}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {mode === 'create' ? 'Crear Producto' : 'Guardar Cambios'}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
