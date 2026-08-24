'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { productSchema, type ProductFormData } from '@/lib/validations/product'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { Product, Category } from '@/types/database'

interface UseProductFormParams {
  product?: Product
  mode: 'create' | 'edit'
  hasVariants?: boolean
}

// Combining diacritical marks (U+0300–U+036F), built from char codes to
// avoid embedding literal combining characters in this source file.
const DIACRITICS_REGEX = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g')

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function useProductForm({ product, mode, hasVariants }: UseProductFormParams) {
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
    supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => setCategories(data || []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Filtrar URLs de imágenes inválidas/rotas antes de guardar
      const validImages = formData.images.filter((url) => {
        try {
          new URL(url)
          return true
        } catch {
          return false
        }
      })

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
        images: validImages,
        // Si el producto tiene tallas, `stock_qty` lo mantiene un trigger
        // como la suma de sus variantes (migración 00030/00039) — se envía
        // sin cambios para no pisarlo con el número mostrado en este
        // formulario, que ni siquiera puede editarse aquí (ver "Inventario"
        // → Tallas para eso). Confirmado con pruebas: escribir aquí se
        // pierde en el siguiente movimiento de cualquier talla.
        stock_qty: hasVariants ? product?.stock_qty ?? 0 : parseInt(formData.stock),
        low_stock_threshold: parseInt(formData.lowStockThreshold),
        tags: formData.tags
          ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        active: formData.active,
        featured: formData.featured,
      }

      const validatedData = productSchema.parse(dataToValidate)
      const slug = slugify(formData.title)

      if (mode === 'create') {
        await authenticatedFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify({ ...validatedData, slug }),
        })
        toast({
          title: 'Producto creado',
          description: 'El producto se creó exitosamente',
          variant: 'success',
        })
      } else {
        await authenticatedFetch(`/api/products/${product!.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...validatedData, slug }),
        })
        toast({
          title: 'Producto actualizado',
          description: 'Los cambios se guardaron exitosamente',
          variant: 'success',
        })
      }

      router.push('/admin/productos')
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

  return { formData, setFormData, categories, isLoading, handleSubmit }
}
