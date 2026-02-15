'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { ImageUploader } from '@/components/products/image-uploader'
import { productSchema, type ProductFormData } from '@/lib/validations/product'
import { supabase } from '@/lib/supabase'
import { Product, Category } from '@/types/database'

interface ProductFormProps {
  product?: Product
  mode: 'create' | 'edit'
}

export function ProductForm({ product, mode }: ProductFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [formData, setFormData] = useState({
    title: product?.title || '',
    sku: product?.sku || '',
    description: product?.description || '',
    price: product ? (product.price_cents / 100).toString() : '',
    cost: product ? (product.cost_cents / 100).toString() : '',
    compareAtPrice: product?.compare_at_price_cents
      ? (product.compare_at_price_cents / 100).toString()
      : '',
    categoryId: product?.category_id || '',
    images: product?.images || [],
    stock: product?.stock_qty.toString() || '0',
    lowStockThreshold: product?.low_stock_threshold.toString() || '5',
    tags: product?.tags.join(', ') || '',
    active: product?.active ?? true,
    featured: product?.featured ?? false,
  })

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    setCategories(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Obtener token de autenticación
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('No estás autenticado. Por favor inicia sesión nuevamente.')
      }

      // Preparar datos para validación
      const dataToValidate: ProductFormData = {
        title: formData.title,
        sku: formData.sku || null,
        description: formData.description || null,
        price_cents: parseFloat(formData.price) * 100,
        cost_cents: parseFloat(formData.cost || '0') * 100,
        compare_at_price_cents: formData.compareAtPrice
          ? parseFloat(formData.compareAtPrice) * 100
          : null,
        category_id: formData.categoryId || null,
        images: formData.images,
        stock_qty: parseInt(formData.stock),
        low_stock_threshold: parseInt(formData.lowStockThreshold),
        tags: formData.tags
          ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        active: formData.active,
        featured: formData.featured,
      }

      // Validar con Zod
      const validatedData = productSchema.parse(dataToValidate)

      // Generar slug desde el título
      const slug = formData.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      if (mode === 'create') {
        // Crear producto
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...validatedData,
            slug,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Error al crear producto')
        }

        toast({
          title: 'Producto creado',
          description: 'El producto se creó exitosamente',
          variant: 'success',
        })

        router.push('/admin/productos')
      } else {
        // Editar producto
        const response = await fetch(`/api/products/${product!.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...validatedData,
            slug,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Error al actualizar producto')
        }

        toast({
          title: 'Producto actualizado',
          description: 'Los cambios se guardaron exitosamente',
          variant: 'success',
        })

        router.push('/admin/productos')
      }
    } catch (error) {
      console.error('Form error:', error)

      if (error instanceof Error) {
        // Errores de Zod
        if (error.message.includes('Expected')) {
          toast({
            title: 'Error de validación',
            description: 'Por favor verifica todos los campos',
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          })
        }
      } else {
        toast({
          title: 'Error',
          description: 'Ocurrió un error al guardar el producto',
          variant: 'destructive',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

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
        <Button type="submit" disabled={isLoading}>
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
              />
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
        <Button type="submit" disabled={isLoading}>
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
