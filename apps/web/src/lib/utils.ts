import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number, currency: string = 'COP'): string {
  const amount = cents / 100
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

// ---------------------------------------------------------------------------
// Stock mínimo ("stock bajo"). Regla única para Dashboard, Inventario,
// Catálogo, exportación y el correo de alerta (pedido del usuario,
// 2026-11-26):
//   - Cada fila de inventario (producto sin tallas, o cada talla) tiene su
//     mínimo (`low_stock_threshold`, 2 por defecto, migración 00071).
//   - Sale en rojo cuando quedan el mínimo O MENOS (mínimo 2 → con 2, 1 o 0).
//   - Mínimo 0 = no avisar nunca (tallas que casi no se mueven).
//   - Un producto con tallas está en stock bajo si ALGUNA de sus tallas
//     activas lo está — cada talla con su propio mínimo, no la suma.
// ---------------------------------------------------------------------------

export const STOCK_MINIMO_DEFECTO = 2

export function enStockMinimo(qty: number, minimo: number | null | undefined): boolean {
  const m = minimo ?? STOCK_MINIMO_DEFECTO
  return m > 0 && qty <= m
}

type FilaStock = { stock_qty: number; low_stock_threshold: number | null; active?: boolean | null }

/** Tallas activas de un producto que están en su mínimo o por debajo. */
export function tallasEnStockMinimo<T extends FilaStock>(tallas: T[] | null | undefined): T[] {
  return (tallas || []).filter((t) => t.active !== false && enStockMinimo(t.stock_qty, t.low_stock_threshold))
}

/**
 * ¿El producto está en stock bajo? Con tallas (activas), por cada talla
 * contra su propio mínimo; sin tallas, por su propio stock y mínimo.
 */
export function productoEnStockMinimo(producto: FilaStock, tallas?: FilaStock[] | null): boolean {
  const activas = (tallas || []).filter((t) => t.active !== false)
  if (activas.length > 0) return tallasEnStockMinimo(activas).length > 0
  return enStockMinimo(producto.stock_qty, producto.low_stock_threshold)
}

export function getStockStatus(qty: number, threshold: number = STOCK_MINIMO_DEFECTO): 'in-stock' | 'low-stock' | 'out-of-stock' {
  if (qty <= 0) return 'out-of-stock'
  if (enStockMinimo(qty, threshold)) return 'low-stock'
  return 'in-stock'
}

export function getStockLabel(qty: number, threshold: number = STOCK_MINIMO_DEFECTO): string {
  const status = getStockStatus(qty, threshold)
  switch (status) {
    case 'in-stock':
      return 'En stock'
    case 'low-stock':
      return `Solo ${qty} disponibles`
    case 'out-of-stock':
      return 'Agotado'
  }
}

const PLACEHOLDER_IMAGE = '/images/placeholder.jpg'

/**
 * Returns a safe image URL from a product's images array.
 * Only accepts remote http/https URLs (Supabase storage, CDN).
 * Local paths like /images/products/ are not served because those
 * files don't exist in the public folder — falls back to placeholder.
 */
export function getProductImage(images: string[] | null | undefined, index: number = 0): string {
  if (!images || !Array.isArray(images)) return PLACEHOLDER_IMAGE
  const url = images[index]
  if (!url) return PLACEHOLDER_IMAGE

  // Only accept remote URLs — product images must be in Supabase storage
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
  } catch {
    // Local or invalid URL → fall back to placeholder
  }

  return PLACEHOLDER_IMAGE
}
