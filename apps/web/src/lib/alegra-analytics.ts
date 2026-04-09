// ============================================================
// Servicio de Analíticas de Alegra — YJBMOTOCOM
// ============================================================

import { getAllInvoicesInRange, filterVoidedInvoices, safeNumber, formatCOP } from './alegra'
import type { AlegraInvoice } from '@/types/alegra'

function getHourFromInvoice(inv: AlegraInvoice): number | null {
  const dt = inv.datetime || inv.date || ''
  if (dt.includes(' ')) {
    const timePart = dt.split(' ')[1]
    return parseInt(timePart.split(':')[0])
  }
  if (dt.includes('T')) {
    const timePart = dt.split('T')[1]
    return parseInt(timePart.split(':')[0])
  }
  return null
}

export async function getPeakHours(startDate: string, endDate: string) {
  const allInvoices = await getAllInvoicesInRange(startDate, endDate)
  const { activeInvoices } = filterVoidedInvoices(allInvoices)

  const hourMap: Record<number, { count: number; total: number }> = {}

  for (const inv of activeInvoices) {
    const hour = getHourFromInvoice(inv)
    if (hour !== null) {
      if (!hourMap[hour]) hourMap[hour] = { count: 0, total: 0 }
      hourMap[hour].count++
      hourMap[hour].total += safeNumber(inv.total)
    }
  }

  return Object.entries(hourMap)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      hour_label: `${String(hour).padStart(2, '0')}:00`,
      invoice_count: data.count,
      total_sales: Math.round(data.total),
      total_sales_formatted: formatCOP(data.total),
    }))
    .sort((a, b) => a.hour - b.hour)
}

export async function getTopCustomers(
  startDate: string,
  endDate: string,
  limit = 10
) {
  const allInvoices = await getAllInvoicesInRange(startDate, endDate)
  const { activeInvoices } = filterVoidedInvoices(allInvoices)

  const customerMap: Record<string, { count: number; total: number }> = {}

  for (const inv of activeInvoices) {
    const name = inv.client?.name || 'Sin nombre'
    if (!customerMap[name]) customerMap[name] = { count: 0, total: 0 }
    customerMap[name].count++
    customerMap[name].total += safeNumber(inv.total)
  }

  return Object.entries(customerMap)
    .map(([name, data]) => ({
      name,
      invoice_count: data.count,
      total_purchases: Math.round(data.total),
      total_purchases_formatted: formatCOP(data.total),
      average_purchase: Math.round(data.total / data.count),
    }))
    .sort((a, b) => b.total_purchases - a.total_purchases)
    .slice(0, limit)
}

export async function getTopSellers(
  startDate: string,
  endDate: string,
  limit = 10
) {
  const allInvoices = await getAllInvoicesInRange(startDate, endDate)
  const { activeInvoices } = filterVoidedInvoices(allInvoices)

  const sellerMap: Record<string, { count: number; total: number }> = {}

  for (const inv of activeInvoices) {
    const name = inv.seller?.name || 'Sin vendedor'
    if (!sellerMap[name]) sellerMap[name] = { count: 0, total: 0 }
    sellerMap[name].count++
    sellerMap[name].total += safeNumber(inv.total)
  }

  return Object.entries(sellerMap)
    .map(([name, data]) => ({
      name,
      invoice_count: data.count,
      total_sales: Math.round(data.total),
      total_sales_formatted: formatCOP(data.total),
    }))
    .sort((a, b) => b.total_sales - a.total_sales)
    .slice(0, limit)
}

export async function getSalesTrends(startDate: string, endDate: string) {
  const allInvoices = await getAllInvoicesInRange(startDate, endDate)
  const { activeInvoices } = filterVoidedInvoices(allInvoices)

  const dateMap: Record<string, { count: number; total: number }> = {}

  for (const inv of activeInvoices) {
    const date = (inv.date || inv.datetime || '').split(' ')[0].split('T')[0]
    if (!date) continue
    if (!dateMap[date]) dateMap[date] = { count: 0, total: 0 }
    dateMap[date].count++
    dateMap[date].total += safeNumber(inv.total)
  }

  return Object.entries(dateMap)
    .map(([date, data]) => ({
      date,
      total: Math.round(data.total),
      total_formatted: formatCOP(data.total),
      invoice_count: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function getAnalyticsDashboard(startDate: string, endDate: string) {
  const [peakHours, topCustomers, topSellers, salesTrends] = await Promise.all([
    getPeakHours(startDate, endDate),
    getTopCustomers(startDate, endDate),
    getTopSellers(startDate, endDate),
    getSalesTrends(startDate, endDate),
  ])

  const totalSales = salesTrends.reduce((s, d) => s + d.total, 0)
  const totalInvoices = salesTrends.reduce((s, d) => s + d.invoice_count, 0)
  const days = salesTrends.length || 1

  return {
    peak_hours: peakHours,
    top_customers: topCustomers,
    top_sellers: topSellers,
    sales_trends: salesTrends,
    summary: {
      total_sales: totalSales,
      total_sales_formatted: formatCOP(totalSales),
      total_invoices: totalInvoices,
      average_daily_sales: Math.round(totalSales / days),
      average_daily_sales_formatted: formatCOP(totalSales / days),
      date_range: { start: startDate, end: endDate },
    },
  }
}
