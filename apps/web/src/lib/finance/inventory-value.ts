// Valor del inventario a costo (docs/PLAN_CONTROL_FINANCIERO.md, Fase 3).
//
// Misma regla que "Valor del inventario" de /admin/inventario
// (fetchInventoryValue): se excluyen productos borrados (deleted_at) y, si un
// producto tiene variantes de talla, su stock y costo viven en
// product_variants (no se suma también el del producto, para no contarlo dos
// veces).

import type { SupabaseClient } from '@supabase/supabase-js'
import { bogotaDateStr } from '@/lib/bogota-time'

export interface InventoryProductRow { id: string; cost_cents: number | null; stock_qty: number | null }
export interface InventoryVariantRow { product_id: string; cost_cents: number | null; stock_qty: number | null }

export interface InventoryValue {
  value_cents: number
  units: number
  /** Referencias: una por variante, o una por producto sin variantes. */
  refs: number
}

export function computeInventoryValue(products: InventoryProductRow[], variants: InventoryVariantRow[]): InventoryValue {
  const productIds = new Set(products.map((p) => p.id))
  const liveVariants = variants.filter((v) => productIds.has(v.product_id))
  const withVariants = new Set(liveVariants.map((v) => v.product_id))
  let value_cents = 0
  let units = 0
  let refs = 0
  for (const p of products) {
    if (withVariants.has(p.id)) continue
    // Stock negativo (venta forzada sin stock) no resta valor.
    const qty = Math.max(p.stock_qty || 0, 0)
    value_cents += qty * (p.cost_cents || 0)
    units += qty
    refs += 1
  }
  for (const v of liveVariants) {
    const qty = Math.max(v.stock_qty || 0, 0)
    value_cents += qty * (v.cost_cents || 0)
    units += qty
    refs += 1
  }
  return { value_cents, units, refs }
}

const PAGE = 1000

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/** Valor actual del inventario (lado servidor, con service role). */
export async function fetchInventoryValue(supabase: SupabaseClient): Promise<InventoryValue> {
  const [products, variants] = await Promise.all([
    fetchAll<InventoryProductRow>((a, b) =>
      supabase.from('products').select('id, cost_cents, stock_qty').is('deleted_at', null).order('id').range(a, b)
    ),
    fetchAll<InventoryVariantRow>((a, b) =>
      supabase.from('product_variants').select('product_id, cost_cents, stock_qty').order('id').range(a, b)
    ),
  ])
  return computeInventoryValue(products, variants)
}

/**
 * Guarda (o reemplaza) la foto del inventario del mes en curso (hora de
 * Bogotá). La última foto de cada mes queda como su inventario de cierre.
 */
export async function takeInventorySnapshot(
  supabase: SupabaseClient,
  opts: { source: 'cron' | 'manual'; userId?: string | null; now?: Date }
) {
  const today = bogotaDateStr(opts.now || new Date())
  const value = await fetchInventoryValue(supabase)
  const row = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
    as_of: today,
    value_cents: value.value_cents,
    units: value.units,
    refs: value.refs,
    source: opts.source,
    created_by: opts.userId || null,
    taken_at: new Date().toISOString(),
  }
  const { data, error } = await (supabase.from('inventory_snapshots') as any)
    .upsert(row, { onConflict: 'year,month' })
    .select()
    .single()
  if (error) throw error
  return data
}
