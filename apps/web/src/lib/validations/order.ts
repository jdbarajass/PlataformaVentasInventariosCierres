import { z } from 'zod'

export const orderItemSchema = z.object({
  id: z.string().min(1, 'ID de producto requerido'),
  variant_id: z.string().uuid().optional().nullable(),
  qty: z.number().int('La cantidad debe ser un numero entero').positive('La cantidad debe ser mayor a 0'),
})

export const customerSchema = z.object({
  email: z.string().trim().email('Email invalido'),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120, 'El nombre es demasiado largo'),
  phone: z.string().trim().min(7, 'Telefono invalido').max(20, 'Telefono invalido'),
  address: z.string().trim().min(5, 'La direccion debe tener al menos 5 caracteres').max(300, 'La direccion es demasiado larga'),
  city: z.string().trim().min(2, 'La ciudad es requerida').max(100, 'La ciudad es demasiado larga'),
  notes: z.string().trim().max(500, 'Las notas no pueden exceder 500 caracteres').optional().nullable(),
})

export const paymentMethodSchema = z.enum(['card', 'mercadopago', 'transfer', 'nequi', 'daviplata', 'cash'])

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'El carrito esta vacio'),
  customer: customerSchema,
  payment_method: paymentMethodSchema,
  coupon_code: z.string().trim().max(50).optional().nullable(),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
