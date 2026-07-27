import { z } from 'zod'

export const productSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres').max(200, 'El título no puede exceder 200 caracteres'),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price_cents: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  cost_cents: z.number().min(0, 'El costo debe ser mayor o igual a 0').default(0),
  compare_at_price_cents: z.number().min(0).optional().nullable(),
  category_id: z.string().uuid('ID de categoría inválido').optional().nullable(),
  images: z.array(z.string().url('URL de imagen inválida')).default([]),
  stock_qty: z.number().int('La cantidad debe ser un número entero').min(0, 'El stock no puede ser negativo').default(0),
  low_stock_threshold: z.number().int().min(0).default(5),
  tags: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
})

export type ProductFormData = z.infer<typeof productSchema>

export const productVariantSchema = z.object({
  talla: z.string().max(20, 'La talla no puede exceder 20 caracteres').optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  stock_qty: z.number().int('La cantidad debe ser un número entero').min(0, 'El stock no puede ser negativo').default(0),
  low_stock_threshold: z.number().int().min(0).default(5),
  cost_cents: z.number().int().min(0, 'El costo debe ser mayor o igual a 0').default(0),
  active: z.boolean().default(true),
})

export type ProductVariantFormData = z.infer<typeof productVariantSchema>
