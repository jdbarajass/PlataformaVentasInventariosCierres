// Rotación, productos quietos y rentabilidad por categoría / producto
// (docs/PLAN_CONTROL_FINANCIERO.md, Fase 4). Funciones puras.
//
// Definiciones:
//   Días de inventario  = valor del inventario ÷ (costo de lo vendido en 30 días ÷ 30)
//   Rotación (veces/año) = costo de lo vendido en la ventana × (365 ÷ días de la ventana) ÷ inventario actual
//                          (ESTIMADO: usa el inventario de hoy, no el promedio del periodo)
//   Días de cobertura de un producto = stock ÷ (unidades vendidas en la ventana ÷ días de la ventana)
//   Producto quieto = tiene stock, no se vende hace más de N días y su última entrada de
//                     mercancía (o su creación) también es de hace más de N días.
// Las alertas de stock BAJO ya existen en Dashboard e Inventario: aquí no se repiten.

import { computeInventoryValue, type InventoryProductRow, type InventoryVariantRow, type InventoryValue } from './inventory-value'
import { ratio } from './income-statement'

export interface InsightProduct extends InventoryProductRow {
  title: string
  created_at: string
  /** Nombre de la categoría asignada, o null (se infiere del nombre). */
  category: string | null
}

export interface InsightSale {
  product_id: string | null
  title: string
  qty: number
  total_cents: number
  cost_cents: number | null
  /** Día de la venta en hora de Bogotá, 'YYYY-MM-DD'. */
  date: string
}

export interface ProductInsight {
  id: string
  title: string
  category: string
  stock: number
  stockValue: number
  unitsWindow: number
  salesWindow: number
  costWindow: number
  profitWindow: number
  marginWindow: number | null
  lastSale: string | null
  daysSinceSale: number | null
  lastArrival: string
  coverageDays: number | null
}

export interface CategoryInsight {
  category: string
  units: number
  sales: number
  cost: number
  profit: number
  margin: number | null
  profitShare: number | null
  stockValue: number
  stockUnits: number
}

export interface InventoryInsights {
  inventory: InventoryValue
  windowDays: number
  quietDays: number
  cogs30: number
  window: { sales: number; cost: number; profit: number; units: number }
  daysOfInventory: number | null
  turnoverPerYear: number | null
  quiet: ProductInsight[]
  quietTotals: { products: number; units: number; value: number; shareOfInventory: number | null }
  topMovers: ProductInsight[]
  slowMovers: ProductInsight[]
  mostProfitable: ProductInsight[]
  categories: CategoryInsight[]
}

const MANUAL = 'ÍTEMS MANUALES'
const DAY = 86_400_000

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
}

export function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * DAY).toISOString().slice(0, 10)
}

/** Igual que inferCategoria de Inventario / Historial Mensual: primera palabra del nombre. */
export function inferCategory(title: string): string {
  const limpio = (title || '').replace(/\s*-T:\S*/gi, '').trim()
  return limpio ? limpio.split(/\s+/)[0].toUpperCase() : 'OTRO'
}

export function productCategory(p: { title: string; category: string | null }): string {
  return p.category?.trim() ? p.category.trim().toUpperCase() : inferCategory(p.title)
}

export function buildInventoryInsights(input: {
  products: InsightProduct[]
  variants: InventoryVariantRow[]
  /** Ventas pagadas de al menos los últimos max(windowDays, quietDays, 30) días. */
  sales: InsightSale[]
  /** Última entrada de mercancía por producto ('YYYY-MM-DD'). */
  lastIn: Record<string, string>
  today: string
  windowDays: number
  quietDays: number
  listLimit?: number
}): InventoryInsights {
  const { products, variants, sales, lastIn, today, windowDays, quietDays } = input
  const limit = input.listLimit ?? 15
  const inventory = computeInventoryValue(products, variants)

  const windowStart = addDays(today, -(windowDays - 1))
  const start30 = addDays(today, -29)

  // Stock y valor por producto (mismo criterio que computeInventoryValue).
  const productIds = new Set(products.map((p) => p.id))
  const variantsByProduct = new Map<string, InventoryVariantRow[]>()
  for (const v of variants) {
    if (!productIds.has(v.product_id)) continue
    const list = variantsByProduct.get(v.product_id) || []
    list.push(v)
    variantsByProduct.set(v.product_id, list)
  }

  const byProduct = new Map<string, { units: number; sales: number; cost: number; lastSale: string | null }>()
  const cat = new Map<string, Omit<CategoryInsight, 'margin' | 'profitShare'>>()
  const catOf = new Map(products.map((p) => [p.id, productCategory(p)]))
  const getCat = (name: string) => {
    let c = cat.get(name)
    if (!c) {
      c = { category: name, units: 0, sales: 0, cost: 0, profit: 0, stockValue: 0, stockUnits: 0 }
      cat.set(name, c)
    }
    return c
  }

  let cogs30 = 0
  const win = { sales: 0, cost: 0, profit: 0, units: 0 }
  for (const s of sales) {
    const cost = s.qty * (s.cost_cents || 0)
    if (s.date >= start30 && s.date <= today) cogs30 += cost
    if (s.product_id) {
      const b = byProduct.get(s.product_id) || { units: 0, sales: 0, cost: 0, lastSale: null }
      if (!b.lastSale || s.date > b.lastSale) b.lastSale = s.date
      if (s.date >= windowStart && s.date <= today) {
        b.units += s.qty
        b.sales += s.total_cents
        b.cost += cost
      }
      byProduct.set(s.product_id, b)
    }
    if (s.date >= windowStart && s.date <= today) {
      win.sales += s.total_cents
      win.cost += cost
      win.units += s.qty
      const c = getCat(s.product_id ? catOf.get(s.product_id) || inferCategory(s.title) : MANUAL)
      c.units += s.qty
      c.sales += s.total_cents
      c.cost += cost
    }
  }
  win.profit = win.sales - win.cost

  const insights: ProductInsight[] = products.map((p) => {
    const vs = variantsByProduct.get(p.id)
    const stock = vs && vs.length ? vs.reduce((s, v) => s + Math.max(v.stock_qty || 0, 0), 0) : Math.max(p.stock_qty || 0, 0)
    const stockValue = vs && vs.length
      ? vs.reduce((s, v) => s + Math.max(v.stock_qty || 0, 0) * (v.cost_cents || 0), 0)
      : Math.max(p.stock_qty || 0, 0) * (p.cost_cents || 0)
    const b = byProduct.get(p.id) || { units: 0, sales: 0, cost: 0, lastSale: null }
    const category = catOf.get(p.id)!
    const c = getCat(category)
    c.stockValue += stockValue
    c.stockUnits += stock
    const created = (p.created_at || today).slice(0, 10)
    const lastArrival = lastIn[p.id] && lastIn[p.id] > created ? lastIn[p.id] : created
    return {
      id: p.id,
      title: p.title,
      category,
      stock,
      stockValue,
      unitsWindow: b.units,
      salesWindow: b.sales,
      costWindow: b.cost,
      profitWindow: b.sales - b.cost,
      marginWindow: ratio(b.sales - b.cost, b.sales),
      lastSale: b.lastSale,
      daysSinceSale: b.lastSale ? daysBetween(b.lastSale, today) : null,
      lastArrival,
      coverageDays: b.units > 0 ? stock / (b.units / windowDays) : null,
    }
  })

  const quiet = insights
    .filter((p) => p.stock > 0 && (p.daysSinceSale === null || p.daysSinceSale > quietDays) && daysBetween(p.lastArrival, today) > quietDays)
    .sort((a, b) => b.stockValue - a.stockValue)
  const quietValue = quiet.reduce((s, p) => s + p.stockValue, 0)

  const categories: CategoryInsight[] = Array.from(cat.values())
    .map((c) => ({ ...c, profit: c.sales - c.cost, margin: ratio(c.sales - c.cost, c.sales), profitShare: ratio(c.sales - c.cost, win.profit) }))
    .filter((c) => c.sales > 0 || c.stockValue > 0)
    .sort((a, b) => b.profit - a.profit || b.stockValue - a.stockValue)

  return {
    inventory,
    windowDays,
    quietDays,
    cogs30,
    window: win,
    daysOfInventory: cogs30 > 0 ? inventory.value_cents / (cogs30 / 30) : null,
    turnoverPerYear: ratio(win.cost * (365 / windowDays), inventory.value_cents),
    quiet,
    quietTotals: { products: quiet.length, units: quiet.reduce((s, p) => s + p.stock, 0), value: quietValue, shareOfInventory: ratio(quietValue, inventory.value_cents) },
    topMovers: insights.filter((p) => p.unitsWindow > 0).sort((a, b) => b.unitsWindow - a.unitsWindow).slice(0, limit),
    slowMovers: insights
      .filter((p) => p.stock > 0 && p.coverageDays !== null)
      .sort((a, b) => (b.coverageDays as number) - (a.coverageDays as number))
      .slice(0, limit),
    mostProfitable: insights.filter((p) => p.salesWindow > 0).sort((a, b) => b.profitWindow - a.profitWindow).slice(0, limit),
    categories,
  }
}
