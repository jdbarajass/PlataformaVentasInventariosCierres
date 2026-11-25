import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Préstamos entre locales (migración 00062): prestar y devolver no mueven
// inventario; cobrar un préstamo crea una venta de mostrador; lo que nos
// prestan se puede vender (ítem manual) y luego se cierra la deuda.

export const loanPaymentSchema = z.object({
  method: z.enum(['card', 'transfer', 'wallet', 'cash', 'nequi', 'nu', 'qr', 'daviplata', 'other', 'addi', 'sistecredito']),
  method_detail: z.string().optional().nullable(),
  account_id: z.string().uuid().optional().nullable(),
})

/** Venta de un préstamo: un solo pago por el valor completo. */
export const loanSaleSchema = z.object({
  price_cents: z.number().int().positive('El valor de venta debe ser mayor a 0'),
  // Solo cuando el producto no está en el catálogo (o, en Debemos, para
  // corregir el costo que se trae del catálogo).
  cost_cents: z.number().int().positive().optional().nullable(),
  // Préstamo de un producto con tallas registrado sin talla.
  variant_id: z.string().uuid().optional().nullable(),
  payment: loanPaymentSchema,
  created_at: z.string().datetime().optional(),
})

export interface LoanRow {
  id: string
  product_id: string | null
  variant_id: string | null
  product_title: string
  warehouse: string
  direction: 'lent' | 'borrowed'
  status: 'pending' | 'returned' | 'charged'
  sale_order_id: string | null
}

export async function loadLoan(supabase: SupabaseClient, id: string): Promise<LoanRow | null> {
  const { data } = await supabase
    .from('loans')
    .select('id, product_id, variant_id, product_title, warehouse, direction, status, sale_order_id')
    .eq('id', id)
    .maybeSingle()
  return (data as LoanRow | null) || null
}

/** true si el producto tiene tallas activas (el stock vive en la talla). */
export async function productHasSizes(supabase: SupabaseClient, productId: string): Promise<boolean> {
  const { count } = await supabase
    .from('product_variants')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('active', true)
  return (count || 0) > 0
}

/** Costo del catálogo (talla si la hay, si no el producto). 0 si no se sabe. */
export async function catalogCost(
  supabase: SupabaseClient,
  productId: string | null,
  variantId: string | null
): Promise<number> {
  if (variantId) {
    const { data } = await supabase.from('product_variants').select('cost_cents').eq('id', variantId).maybeSingle()
    if ((data as any)?.cost_cents) return (data as any).cost_cents
  }
  if (productId) {
    const { data } = await supabase.from('products').select('cost_cents').eq('id', productId).maybeSingle()
    return (data as any)?.cost_cents || 0
  }
  return 0
}

/** Mensajes de las funciones de préstamos que se le muestran tal cual al usuario. */
export function isLoanRuleError(message: string | undefined): boolean {
  if (!message) return false
  return [
    'no está pendiente', 'ya está cerrada', 'ya se vendió', 'cancela la venta', 'Cobrar',
    'no se puede', 'talla', 'Escribe cuánto', 'no debe tocar', 'Solo se', 'no encontrad',
    'suma de los pagos', 'Forma de cierre', 'debe tener una cuenta', 'ya está cancelada',
  ].some((s) => message.includes(s))
}
