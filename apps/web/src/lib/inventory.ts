import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atomically decrements a product's stock_qty via the `decrement_stock`
 * SQL function (supabase/migrations/00005_payment_integrity.sql).
 *
 * Using a single UPDATE statement inside the DB function means Postgres
 * locks the product row for the duration of the update, so two webhooks
 * decrementing the same product concurrently can no longer read the same
 * stale stock_qty and produce a lost update.
 */
export async function decrementStockAtomic(
  supabase: SupabaseClient,
  productId: string,
  qty: number
): Promise<{ id: string; title: string; stock_qty: number } | null> {
  const { data, error } = await (supabase.rpc as any)('decrement_stock', {
    p_product_id: productId,
    p_qty: qty,
  })

  if (error) {
    throw new Error(`decrement_stock failed for product ${productId}: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}
