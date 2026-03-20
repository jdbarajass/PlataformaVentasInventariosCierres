// ============================================================
// Cliente para la API de Alegra — YJBMOTOCOM
// ============================================================

import type { AlegraInvoice, AlegraResponse, AlegraPaymentResult } from '@/types/alegra'

const ALEGRA_USER = process.env.ALEGRA_USER!
const ALEGRA_TOKEN = process.env.ALEGRA_TOKEN!
const ALEGRA_BASE_URL = process.env.ALEGRA_API_BASE_URL || 'https://api.alegra.com/api/v1'
const ALEGRA_TIMEOUT = parseInt(process.env.ALEGRA_TIMEOUT || '30') * 1000

function getAuthHeader(): string {
  const credentials = Buffer.from(`${ALEGRA_USER}:${ALEGRA_TOKEN}`).toString('base64')
  return `Basic ${credentials}`
}

const defaultHeaders = {
  Authorization: getAuthHeader(),
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

// ----------- Helpers -----------

export function safeNumber(value: unknown): number {
  const n = Number(value)
  return isNaN(n) ? 0 : n
}

export function normalizePaymentMethod(raw: string): string {
  const lower = (raw || '').toLowerCase().trim()
  if (lower.includes('credit') || lower.includes('credito')) return 'credit-card'
  if (lower.includes('debit') || lower.includes('debito')) return 'debit-card'
  if (
    lower.includes('transfer') ||
    lower.includes('nequi') ||
    lower.includes('daviplata') ||
    lower.includes('qr')
  )
    return 'transfer'
  if (lower.includes('cash') || lower.includes('efectivo')) return 'cash'
  return 'cash'
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function getPaymentLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'Efectivo',
    'credit-card': 'Tarjeta Crédito',
    'debit-card': 'Tarjeta Débito',
    transfer: 'Transferencias',
  }
  return labels[method] || method
}

export function filterVoidedInvoices(invoices: AlegraInvoice[]) {
  const VOIDED_STATUSES = ['void', 'voided', 'anulada', 'cancelled', 'canceled']

  const voidedInvoices = invoices.filter((inv) => {
    const status = (inv.status || '').toLowerCase()
    return VOIDED_STATUSES.some((s) => status.includes(s))
  })

  const activeInvoices = invoices.filter((inv) => {
    const status = (inv.status || '').toLowerCase()
    return !VOIDED_STATUSES.some((s) => status.includes(s))
  })

  const totalVoidedAmount = voidedInvoices.reduce(
    (sum, inv) => sum + safeNumber(inv.total),
    0
  )

  return {
    activeInvoices,
    voidedInvoices,
    voidedCount: voidedInvoices.length,
    totalVoidedAmount,
    totalVoidedAmountFormatted: formatCOP(totalVoidedAmount),
    voidedSummary: voidedInvoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      total: safeNumber(inv.total),
      totalFormatted: formatCOP(safeNumber(inv.total)),
      clientName: inv.client?.name || 'Sin nombre',
    })),
  }
}

// ----------- API Calls -----------

async function alegraFetch(
  endpoint: string,
  params?: Record<string, string | number>
): Promise<unknown> {
  const url = new URL(`${ALEGRA_BASE_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ALEGRA_TIMEOUT)

  try {
    const response = await fetch(url.toString(), {
      headers: defaultHeaders,
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (response.status === 401 || response.status === 403) {
      throw new Error('Credenciales de Alegra inválidas')
    }
    if (response.status >= 500) {
      throw new Error(`Error del servidor de Alegra (HTTP ${response.status})`)
    }
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} en Alegra`)
    }

    return response.json()
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Timeout al conectar con Alegra (>${ALEGRA_TIMEOUT / 1000}s)`)
    }
    throw err
  }
}

// ----------- Invoice Methods -----------

export async function getInvoicesByDate(date: string): Promise<AlegraInvoice[]> {
  const allInvoices: AlegraInvoice[] = []
  const limit = 30

  const firstResponse = (await alegraFetch('/invoices', {
    date,
    start: 0,
    metadata: 'true',
  })) as
    | { metadata?: { total?: number }; data?: AlegraInvoice[] }
    | AlegraInvoice[]

  let totalInvoices = 0
  let firstData: AlegraInvoice[] = []

  if (Array.isArray(firstResponse)) {
    firstData = firstResponse
    totalInvoices = firstData.length
  } else if (firstResponse && typeof firstResponse === 'object') {
    const typed = firstResponse as { metadata?: { total?: number }; data?: AlegraInvoice[] }
    totalInvoices = typed.metadata?.total ?? 0
    firstData = typed.data ?? []
  }

  allInvoices.push(...firstData)

  if (totalInvoices > limit) {
    const pagesNeeded = Math.ceil(totalInvoices / limit)
    for (let page = 2; page <= pagesNeeded; page++) {
      const start = (page - 1) * limit
      const pageData = (await alegraFetch('/invoices', { date, start })) as
        | { data?: AlegraInvoice[] }
        | AlegraInvoice[]
      const pageInvoices = Array.isArray(pageData)
        ? pageData
        : (pageData as { data?: AlegraInvoice[] }).data ?? []
      allInvoices.push(...pageInvoices)
    }
  }

  return allInvoices
}

export async function getAllInvoicesInRange(
  startDate: string,
  endDate: string
): Promise<AlegraInvoice[]> {
  if (startDate === endDate) return getInvoicesByDate(startDate)

  const start = new Date(startDate)
  const end = new Date(endDate)
  const allInvoices: AlegraInvoice[] = []

  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]
    try {
      const daily = await getInvoicesByDate(dateStr)
      allInvoices.push(...daily)
    } catch {
      // Continuar con el siguiente día si falla uno
    }
    current.setDate(current.getDate() + 1)
  }

  return allInvoices
}

export function processInvoices(invoices: AlegraInvoice[]) {
  const filterResult = filterVoidedInvoices(invoices)
  const activeInvoices = filterResult.activeInvoices

  const totals: Record<string, number> = {
    'credit-card': 0,
    'debit-card': 0,
    transfer: 0,
    cash: 0,
  }

  for (const inv of activeInvoices) {
    const payments = inv.payments ?? []
    for (const p of payments) {
      const amount = safeNumber(p.amount)
      const method = normalizePaymentMethod(p.paymentMethod)
      totals[method] = (totals[method] ?? 0) + amount
    }
  }

  return {
    totals,
    voidedInfo: {
      voidedCount: filterResult.voidedCount,
      totalVoidedAmount: filterResult.totalVoidedAmount,
      totalVoidedAmountFormatted: filterResult.totalVoidedAmountFormatted,
      voidedSummary: filterResult.voidedSummary,
    },
    processedCount: activeInvoices.length,
    totalInvoices: invoices.length,
  }
}

export function buildAlegraResponse(
  totals: Record<string, number>,
  date: string,
  voidedInfo: ReturnType<typeof processInvoices>['voidedInfo'],
  processedCount: number,
  totalInvoices: number
): AlegraResponse {
  const results: Record<string, AlegraPaymentResult> = {}
  for (const [method, total] of Object.entries(totals)) {
    results[method] = {
      label: getPaymentLabel(method),
      total: Math.round(total),
      formatted: formatCOP(total),
    }
  }

  const totalSum = Object.values(totals).reduce((a, b) => a + b, 0)

  const response: AlegraResponse = {
    date_requested: date,
    username_used: ALEGRA_USER,
    results: results as AlegraResponse['results'],
    total_sale: {
      label: 'TOTAL VENTA DEL DÍA',
      total: Math.round(totalSum),
      formatted: formatCOP(totalSum),
    },
    invoices_summary: {
      total_invoices: totalInvoices,
      active_invoices: processedCount,
      voided_invoices: voidedInfo.voidedCount,
    },
  }

  if (voidedInfo.voidedCount > 0) {
    response.voided_invoices = {
      voided_count: voidedInfo.voidedCount,
      total_voided_amount: voidedInfo.totalVoidedAmount,
      total_voided_amount_formatted: voidedInfo.totalVoidedAmountFormatted,
      voided_summary: voidedInfo.voidedSummary.map((v) => ({
        id: v.id,
        number: v.number,
        total: v.total,
        total_formatted: v.totalFormatted,
        client_name: v.clientName,
      })),
    }
  }

  return response
}

export async function getSalesSummary(date: string): Promise<AlegraResponse> {
  const invoices = await getInvoicesByDate(date)
  const processed = processInvoices(invoices)
  return buildAlegraResponse(
    processed.totals,
    date,
    processed.voidedInfo,
    processed.processedCount,
    processed.totalInvoices
  )
}

export async function getMonthlySalesSummary(startDate: string, endDate: string) {
  const allInvoices = await getAllInvoicesInRange(startDate, endDate)
  const filterResult = filterVoidedInvoices(allInvoices)
  const activeInvoices = filterResult.activeInvoices

  let totalVendido = 0
  const totalesPorMetodo: Record<string, number> = {
    'credit-card': 0,
    'debit-card': 0,
    transfer: 0,
    cash: 0,
  }

  for (const inv of activeInvoices) {
    totalVendido += safeNumber(inv.total)
    for (const p of inv.payments ?? []) {
      const amount = safeNumber(p.amount)
      const method = normalizePaymentMethod(p.paymentMethod)
      totalesPorMetodo[method] = (totalesPorMetodo[method] ?? 0) + amount
    }
  }

  const paymentDetails: Record<string, AlegraPaymentResult> = {}
  for (const [method, total] of Object.entries(totalesPorMetodo)) {
    paymentDetails[method] = {
      label: getPaymentLabel(method),
      total: Math.round(total),
      formatted: formatCOP(total),
    }
  }

  return {
    date_range: { start: startDate, end: endDate },
    total_vendido: {
      label: 'TOTAL VENDIDO EN EL PERIODO',
      total: Math.round(totalVendido),
      formatted: formatCOP(totalVendido),
    },
    cantidad_facturas: activeInvoices.length,
    payment_methods: paymentDetails,
    username_used: ALEGRA_USER,
    invoices_summary: {
      total_invoices: allInvoices.length,
      active_invoices: activeInvoices.length,
      voided_invoices: filterResult.voidedCount,
    },
  }
}

export async function getActiveItems() {
  return alegraFetch('/items', { status: 'active' })
}

export async function getSalesComparisonYoY(currentDate: string) {
  const prevDt = new Date(currentDate)
  prevDt.setFullYear(prevDt.getFullYear() - 1)
  const previousDate = prevDt.toISOString().split('T')[0]

  const [currentSales, previousSales] = await Promise.all([
    getSalesSummary(currentDate),
    getSalesSummary(previousDate),
  ])

  const currentTotal = currentSales.total_sale.total
  const previousTotal = previousSales.total_sale.total
  const difference = currentTotal - previousTotal
  const percentageChange =
    previousTotal > 0
      ? ((currentTotal - previousTotal) / previousTotal) * 100
      : currentTotal > 0
        ? 100
        : 0

  return {
    current: {
      date: currentDate,
      total: currentTotal,
      formatted: formatCOP(currentTotal),
      invoices_count: currentSales.invoices_summary.active_invoices,
    },
    previous_year: {
      date: previousDate,
      total: previousTotal,
      formatted: formatCOP(previousTotal),
      invoices_count: previousSales.invoices_summary.active_invoices,
    },
    comparison: {
      difference,
      difference_formatted: formatCOP(Math.abs(difference)),
      percentage_change: Math.round(percentageChange * 100) / 100,
      is_growth: difference >= 0,
      growth_label: difference >= 0 ? 'crecimiento' : 'decrecimiento',
    },
  }
}
