import type { SupabaseClient } from '@supabase/supabase-js'
import { decrementStockAtomic, decrementVariantStockAtomic } from '@/lib/inventory'

/**
 * Descuenta stock (por variante si aplica) para cada item de una orden y
 * deja el movimiento de inventario correspondiente — mismo patrón que ya
 * usan los webhooks de Stripe/MercadoPago al confirmar un pago, pero para
 * pagos manuales (transferencia/Nequi/Daviplata) que nunca pasan por un
 * webhook: hasta esta función, esos métodos nunca disparaban ningún
 * descuento de inventario (el admin tenía que ajustarlo a mano).
 */
export async function decrementStockForOrder(
  supabase: SupabaseClient,
  orderId: string,
  note: string
): Promise<void> {
  const { data: orderItemsData, error: itemsError } = await supabase
    .from('order_items')
    .select('id, product_id, variant_id, qty')
    .eq('order_id', orderId)

  if (itemsError) throw itemsError

  const orderItems = (orderItemsData as any[]) || []

  for (const item of orderItems) {
    if (!item.product_id) continue

    const updated = item.variant_id
      ? await decrementVariantStockAtomic(supabase, item.variant_id, item.qty)
      : await decrementStockAtomic(supabase, item.product_id, item.qty)

    if (!updated) {
      console.error(`[Order Fulfillment] ${item.variant_id ? 'Variant' : 'Product'} ${item.variant_id || item.product_id} not found for stock decrement`)
      continue
    }

    // Se guarda cuánto se descontó REALMENTE (nunca deja stock negativo,
    // ver decrement_stock/decrement_variant_stock) para que cancelar esta
    // orden más adelante restaure ese mismo monto, no el `qty` nominal
    // pedido — mismo patrón que ya usa `create_pos_sale` desde la
    // migración 00028.
    await (supabase.from('order_items') as any)
      .update({ stock_deducted: updated.actual_deducted })
      .eq('id', item.id)

    await (supabase.from('inventory_movements') as any).insert({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      qty: -updated.actual_deducted,
      type: 'sale',
      reference_id: orderId,
      reference_type: 'order',
      note,
    })
  }
}
