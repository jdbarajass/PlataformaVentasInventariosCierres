import type { SupabaseClient } from '@supabase/supabase-js'

export interface SaleItemInput {
  product_id: string
  variant_id?: string | null
  qty: number
  price_cents: number
  discount_cents?: number
}

export interface SalePaymentInput {
  method: string
  method_detail?: string | null
  account_id?: string | null
  amount_cents: number
}

const defaultCommissionRates: Record<string, number> = {
  cash: 0, transfer: 0, wallet: 0, nequi: 0, daviplata: 0, addi: 0, card: 0, other: 0, nu: 0, qr: 0,
}

/**
 * Resuelve título/SKU/imagen/costo reales de cada producto/variante desde la
 * BD (nunca se confía en eso si vino del cliente), calcula subtotal/descuento
 * /total y la comisión informativa por pago. Usado tanto por POST /api/pos/sales
 * (crear) como por PUT /api/pos/sales/[id] (editar) para no duplicar la lógica.
 */
export async function resolveSale(
  supabase: SupabaseClient,
  items: SaleItemInput[],
  payments: SalePaymentInput[]
) {
  const productIds = Array.from(new Set(items.map((i) => i.product_id)))
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, title, sku, images, cost_cents, active')
    .in('id', productIds)

  if (productsError) throw productsError

  const productsById = new Map((products || []).map((p: any) => [p.id, p]))

  const variantIds = items.map((i) => i.variant_id).filter(Boolean) as string[]
  let variantsById = new Map<string, any>()
  if (variantIds.length > 0) {
    const { data: variants, error: variantsError } = await supabase
      .from('product_variants')
      .select('id, product_id, talla, cost_cents, stock_qty')
      .in('id', variantIds)

    if (variantsError) throw variantsError
    variantsById = new Map((variants || []).map((v: any) => [v.id, v]))
  }

  for (const item of items) {
    const product = productsById.get(item.product_id)
    if (!product || !product.active) {
      throw new Error(`Producto no encontrado o inactivo: ${item.product_id}`)
    }
    if (item.variant_id && !variantsById.has(item.variant_id)) {
      throw new Error(`Variante no encontrada: ${item.variant_id}`)
    }
  }

  const resolvedItems = items.map((item) => {
    const product = productsById.get(item.product_id)
    const variant = item.variant_id ? variantsById.get(item.variant_id) : null
    const discount_cents = item.discount_cents || 0
    const total_cents = item.qty * item.price_cents - discount_cents
    return {
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product_title: product.title,
      product_sku: product.sku,
      product_image: (product.images && product.images[0]) || null,
      product_talla: variant?.talla || null,
      qty: item.qty,
      price_cents: item.price_cents,
      cost_cents: variant ? variant.cost_cents : product.cost_cents,
      discount_cents,
      total_cents,
    }
  })

  const subtotal_cents = items.reduce((sum, i) => sum + i.qty * i.price_cents, 0)
  const discount_cents = items.reduce((sum, i) => sum + (i.discount_cents || 0), 0)
  // El descuento no puede superar el total del carrito, igual que el
  // software local ("El descuento no puede ser mayor al total del carrito").
  if (discount_cents > subtotal_cents) {
    throw new Error('El descuento no puede ser mayor al total del carrito')
  }
  const total_cents = subtotal_cents - discount_cents

  // La suma de pagos combinados debe ser EXACTA al total, igual que el
  // software local (no se calcula vuelto dentro del sistema: si el cliente
  // paga de más en efectivo, el vendedor entrega el vuelto por fuera y
  // registra solo el monto que aplica a la venta).
  const paymentsSum = payments.reduce((sum, p) => sum + p.amount_cents, 0)
  if (paymentsSum !== total_cents) {
    throw new Error(
      paymentsSum < total_cents
        ? `La suma de los pagos es menor al total de la venta (faltan ${total_cents - paymentsSum} centavos)`
        : `La suma de los pagos supera el total de la venta (sobran ${paymentsSum - total_cents} centavos) — ajusta el monto o registra el vuelto por fuera`
    )
  }

  // Comisión informativa por método (se traslada al cliente como sobreprecio:
  // no afecta el total de la venta ni la ganancia registrada).
  const { data: settings } = await supabase
    .from('store_settings')
    .select('pos_commission_rates')
    .eq('id', 1)
    .single()
  const rates: Record<string, number> = {
    ...defaultCommissionRates,
    ...((settings as any)?.pos_commission_rates || {}),
  }

  const resolvedPayments = payments.map((p) => ({
    method: p.method,
    method_detail: p.method_detail || null,
    account_id: p.account_id || null,
    amount_cents: p.amount_cents,
    commission_cents: Math.round((p.amount_cents * (rates[p.method] || 0)) / 100),
  }))

  return { resolvedItems, resolvedPayments, subtotal_cents, discount_cents, total_cents }
}
