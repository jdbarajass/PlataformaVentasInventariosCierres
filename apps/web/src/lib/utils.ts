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

export function getStockStatus(qty: number, threshold: number = 5): 'in-stock' | 'low-stock' | 'out-of-stock' {
  if (qty === 0) return 'out-of-stock'
  if (qty <= threshold) return 'low-stock'
  return 'in-stock'
}

export function getStockLabel(qty: number, threshold: number = 5): string {
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
 * Falls back to placeholder if the URL is invalid or empty.
 */
export function getProductImage(images: string[], index: number = 0): string {
  const url = images[index]
  if (!url) return PLACEHOLDER_IMAGE

  // Accept local paths
  if (url.startsWith('/')) return url

  // Validate remote URLs
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
  } catch {
    // Invalid URL
  }

  return PLACEHOLDER_IMAGE
}
