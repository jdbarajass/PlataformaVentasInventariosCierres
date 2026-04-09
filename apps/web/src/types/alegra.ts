// ============================================================
// Tipos de Alegra API — Integración YJBMOTOCOM
// ============================================================

export interface AlegraPayment {
  paymentMethod: string
  amount: number
}

export interface AlegraInvoice {
  id: number | string
  number?: string
  date: string
  datetime?: string
  total: number
  status?: string
  payments?: AlegraPayment[]
  client?: { name?: string }
  seller?: { name?: string }
}

export interface AlegraPaymentResult {
  label: string
  total: number
  formatted: string
}

export interface AlegraResponse {
  date_requested: string
  username_used: string
  results: {
    cash: AlegraPaymentResult
    transfer: AlegraPaymentResult
    'credit-card': AlegraPaymentResult
    'debit-card': AlegraPaymentResult
  }
  total_sale: AlegraPaymentResult
  invoices_summary: {
    total_invoices: number
    active_invoices: number
    voided_invoices: number
  }
  voided_invoices?: {
    voided_count: number
    total_voided_amount: number
    total_voided_amount_formatted: string
    voided_summary: VoidedInvoiceSummary[]
  }
}

export interface VoidedInvoiceSummary {
  id: number | string
  number?: string
  total: number
  total_formatted: string
  client_name: string
}

// ----------- Tipos de Cierre de Caja -----------

export interface CoinCount {
  [denomination: number]: number
}

export interface BillCount {
  [denomination: number]: number
}

export interface ExcedentItem {
  tipo: 'efectivo' | 'datafono' | 'qr_transferencias'
  subtipo?: 'nequi' | 'daviplata' | 'qr'
  valor: number
}

export interface DesfaseItem {
  tipo: 'faltante_caja' | 'sobrante_caja'
  valor: number
  nota: string
}

export interface MetodosPago {
  addi_datafono: number
  nequi: number
  daviplata: number
  qr: number
  tarjeta_debito: number
  tarjeta_credito: number
}

export interface CashClosingPayload {
  date: string
  monedas: CoinCount
  billetes: BillCount
  excedentes: ExcedentItem[]
  gastos_operativos: number
  gastos_operativos_nota: string
  prestamos: number
  prestamos_nota: string
  desfases: DesfaseItem[]
  metodos_pago: MetodosPago
}

// ----------- Tipos de Analíticas -----------

export interface PeakHour {
  hour: number
  hour_label: string
  invoice_count: number
  total_sales: number
  total_sales_formatted: string
}

export interface TopCustomer {
  name: string
  invoice_count: number
  total_purchases: number
  total_purchases_formatted: string
  average_purchase: number
}

export interface TopSeller {
  name: string
  invoice_count: number
  total_sales: number
  total_sales_formatted: string
}

export interface SalesTrend {
  date: string
  total: number
  total_formatted: string
  invoice_count: number
}
