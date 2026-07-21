import type { SupabaseClient } from '@supabase/supabase-js'

// Definición central de las 18 hojas del Excel maestro (equivalente al
// YJBMOTOCOM_Historial.xlsx del software local). Cada hoja declara cómo se
// exporta (fetch + toRow) y, si es "importable", cómo se vuelve a escribir
// en la base de datos (fromRow + table + conflictKey).
//
// Las hojas ligadas a la tienda pública (Ventas, Usuarios, Configuración,
// Log Auditoría) son SOLO EXPORTACIÓN — nunca se reescriben desde el Excel,
// para que una importación nunca pueda afectar el catálogo, el checkout,
// el login o los pedidos reales.

const centsToPesos = (cents: number | null | undefined) => (cents ?? 0) / 100
const pesosToCents = (pesos: any) => Math.round((parseFloat(pesos) || 0) * 100)
const dateStr = (value: string | null | undefined) => (value ? value.split('T')[0] : '')

export interface SheetDefinition {
  name: string
  importable: boolean
  table?: string
  conflictKey?: string
  columns: string[]
  fetch: (supabase: SupabaseClient) => Promise<any[]>
  toRow: (row: any) => any[]
  fromRow?: (values: Record<string, any>) => Record<string, any> | null
}

export const sheetDefinitions: SheetDefinition[] = [
  {
    name: 'Ventas',
    importable: false,
    columns: [
      'ID Item', 'Orden ID', 'N° Orden', 'Canal', 'Fecha', 'Producto', 'SKU', 'Talla',
      'Cant.', 'Costo', 'Precio Venta', 'Descuento', 'Total Línea', 'Vendedor',
      'Cliente', 'Teléfono', 'Notas Orden', 'Estado Pago', 'Métodos de Pago', 'Comisión Orden',
    ],
    fetch: async (supabase) => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, channel, created_at, customer_name, customer_phone, notes, payment_status, seller:users!orders_seller_id_fkey(email), payments(method, method_detail, amount_cents, commission_cents), order_items(id, product_title, product_sku, product_talla, qty, cost_cents, price_cents, discount_cents, total_cents)')
        .order('created_at', { ascending: false })
        .limit(5000)
      return data || []
    },
    toRow: () => [],
  },
  {
    name: 'Préstamos',
    importable: true,
    table: 'loans',
    columns: ['ID', 'Producto', 'Almacén', 'Observaciones', 'Estado', 'Fecha'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('loans').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.product_title, r.warehouse, r.observations || '', r.status, dateStr(r.created_at)],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      product_title: v['Producto'],
      warehouse: v['Almacén'],
      observations: v['Observaciones'] || null,
      status: v['Estado'] || 'pending',
    }),
  },
  {
    name: 'Inventario',
    importable: true,
    table: 'product_variants',
    columns: ['ID', 'Producto ID', 'Producto', 'Talla', 'Código Barras', 'Stock', 'Stock Mínimo', 'Costo Unitario'],
    fetch: async (supabase) => {
      const { data } = await supabase
        .from('product_variants')
        .select('*, product:products(title)')
        .order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [
      r.id, r.product_id, r.product?.title || '', r.talla || '', r.barcode || '',
      r.stock_qty, r.low_stock_threshold, centsToPesos(r.cost_cents),
    ],
    fromRow: (v) => {
      if (!v['Producto ID']) return null
      return {
        id: v['ID'] || undefined,
        product_id: v['Producto ID'],
        talla: v['Talla'] || null,
        barcode: v['Código Barras'] || null,
        stock_qty: parseInt(v['Stock']) || 0,
        low_stock_threshold: parseInt(v['Stock Mínimo']) || 5,
        cost_cents: pesosToCents(v['Costo Unitario']),
      }
    },
  },
  {
    name: 'Facturas',
    importable: true,
    table: 'supplier_invoices',
    columns: ['ID', 'Descripción', 'Proveedor', 'Monto', 'Fecha Llegada', 'Fecha Vencimiento', 'Estado', 'Notas', 'Fecha Pago', 'Cuenta ID'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('supplier_invoices').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [
      r.id, r.description, r.supplier, centsToPesos(r.amount_cents), r.arrival_date || '',
      r.due_date || '', r.status, r.notes || '', r.paid_at || '', r.account_id || '',
    ],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      description: v['Descripción'],
      supplier: v['Proveedor'],
      amount_cents: pesosToCents(v['Monto']),
      arrival_date: v['Fecha Llegada'] || null,
      due_date: v['Fecha Vencimiento'] || null,
      status: v['Estado'] || 'pending',
      notes: v['Notas'] || null,
      paid_at: v['Fecha Pago'] || null,
      account_id: v['Cuenta ID'] || null,
    }),
  },
  {
    name: 'Facturas Items',
    importable: true,
    table: 'supplier_invoice_items',
    columns: ['ID', 'Factura ID', 'Descripción', 'Cantidad', 'Precio Unitario', 'Subtotal'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('supplier_invoice_items').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.invoice_id, r.description, r.qty, centsToPesos(r.unit_price_cents), centsToPesos(r.subtotal_cents)],
    fromRow: (v) => {
      if (!v['Factura ID']) return null
      const qty = parseInt(v['Cantidad']) || 1
      const unitPrice = pesosToCents(v['Precio Unitario'])
      return {
        id: v['ID'] || undefined,
        invoice_id: v['Factura ID'],
        description: v['Descripción'],
        qty,
        unit_price_cents: unitPrice,
        subtotal_cents: qty * unitPrice,
      }
    },
  },
  {
    name: 'Abonos',
    importable: true,
    table: 'supplier_invoice_payments',
    columns: ['ID', 'Factura ID', 'Monto', 'Cuenta ID', 'Notas', 'Fecha'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('supplier_invoice_payments').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.invoice_id, centsToPesos(r.amount_cents), r.account_id || '', r.notes || '', r.paid_at],
    fromRow: (v) => {
      if (!v['Factura ID']) return null
      return {
        id: v['ID'] || undefined,
        invoice_id: v['Factura ID'],
        amount_cents: pesosToCents(v['Monto']),
        account_id: v['Cuenta ID'] || null,
        notes: v['Notas'] || null,
        paid_at: v['Fecha'] || undefined,
      }
    },
  },
  {
    name: 'Gastos',
    importable: true,
    table: 'operating_expenses',
    columns: ['ID', 'Fecha', 'Descripción', 'Monto', 'Categoría', 'Cuenta ID'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('operating_expenses').select('*').order('date', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.date, r.description, centsToPesos(r.amount_cents), r.category, r.account_id || ''],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      date: v['Fecha'] || undefined,
      description: v['Descripción'],
      amount_cents: pesosToCents(v['Monto']),
      category: v['Categoría'],
      account_id: v['Cuenta ID'] || null,
    }),
  },
  {
    name: 'Configuración',
    importable: false,
    columns: ['Nombre Tienda', 'Comisión Efectivo %', 'Comisión Transferencia %', 'Comisión Addi %', 'Comisión Datáfono %'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('store_settings').select('*').eq('id', 1).single()
      return data ? [data] : []
    },
    toRow: (r) => {
      const rates = r.pos_commission_rates || {}
      return [r.store_name, rates.cash ?? 0, rates.transfer ?? 0, rates.addi ?? 0, rates.card ?? 0]
    },
  },
  {
    name: 'Notas',
    importable: true,
    table: 'notes',
    columns: ['ID', 'Tipo', 'Texto', 'Completado', 'Fecha Límite'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.type, r.text, r.completed ? 'Sí' : 'No', r.due_date || ''],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      type: v['Tipo'] === 'restock' ? 'restock' : 'task',
      text: v['Texto'],
      completed: String(v['Completado']).toLowerCase().startsWith('s') || v['Completado'] === true,
      due_date: v['Fecha Límite'] || null,
    }),
  },
  {
    name: 'Usuarios',
    importable: false,
    columns: ['Nombre', 'Email', 'Rol'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.name || '', r.email, r.role],
  },
  {
    name: 'Presupuesto',
    importable: true,
    table: 'monthly_budgets',
    columns: ['ID', 'Año', 'Mes', 'Categoría', 'Monto Presupuestado'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('monthly_budgets').select('*').order('year', { ascending: false }).order('month', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.year, r.month, r.category, centsToPesos(r.budgeted_amount_cents)],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      year: parseInt(v['Año']),
      month: parseInt(v['Mes']),
      category: v['Categoría'],
      budgeted_amount_cents: pesosToCents(v['Monto Presupuestado']),
    }),
  },
  {
    name: 'Cuentas',
    importable: true,
    table: 'accounts',
    columns: ['ID', 'Nombre', 'Método Pago', 'Balance Actual', 'Color', 'Activa', 'Orden'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('accounts').select('*').order('sort_order', { ascending: true })
      return data || []
    },
    toRow: (r) => [r.id, r.name, r.payment_method, centsToPesos(r.balance_cents), r.color || '', r.active ? 'Sí' : 'No', r.sort_order],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      name: v['Nombre'],
      payment_method: v['Método Pago'],
      balance_cents: pesosToCents(v['Balance Actual']),
      color: v['Color'] || null,
      active: String(v['Activa']).toLowerCase().startsWith('s') || v['Activa'] === true,
      sort_order: parseInt(v['Orden']) || 0,
    }),
  },
  {
    name: 'Mov. Cuentas',
    importable: true,
    table: 'account_movements',
    columns: ['ID', 'Cuenta ID', 'Fecha', 'Tipo', 'Monto', 'Descripción', 'Referencia ID'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('account_movements').select('*').order('created_at', { ascending: false }).limit(5000)
      return data || []
    },
    toRow: (r) => [r.id, r.account_id, r.created_at, r.type, centsToPesos(r.amount_cents), r.description || '', r.reference_id || ''],
    fromRow: (v) => {
      if (!v['Cuenta ID']) return null
      return {
        id: v['ID'] || undefined,
        account_id: v['Cuenta ID'],
        type: v['Tipo'],
        amount_cents: pesosToCents(v['Monto']),
        description: v['Descripción'] || null,
        reference_id: v['Referencia ID'] || null,
      }
    },
  },
  {
    name: 'Cierres Cuentas',
    // Solo exportación: el snapshot de saldos (jsonb) no se puede reconstruir
    // de forma fiel desde columnas simples de Excel — reimportar sin él
    // borraría el historial de saldos del cierre. Ver docs/UNIFICACION_YJBMOTOCOM.md.
    importable: false,
    columns: ['ID', 'Año', 'Mes', 'Notas'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('account_closures').select('*').order('year', { ascending: false }).order('month', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.year, r.month, r.notes || ''],
  },
  {
    name: 'Fiado',
    importable: true,
    table: 'customer_credits',
    columns: ['ID', 'Cliente', 'Cédula', 'Teléfono', 'Descripción', 'Deuda Total', 'Estado', 'Notas'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('customer_credits').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.customer_name, r.customer_id_number || '', r.customer_phone || '', r.description || '', centsToPesos(r.total_amount_cents), r.status, r.notes || ''],
    fromRow: (v) => ({
      id: v['ID'] || undefined,
      customer_name: v['Cliente'],
      customer_id_number: v['Cédula'] || null,
      customer_phone: v['Teléfono'] || null,
      description: v['Descripción'] || null,
      total_amount_cents: pesosToCents(v['Deuda Total']),
      status: v['Estado'] || 'pending',
      notes: v['Notas'] || null,
    }),
  },
  {
    name: 'Abonos Fiado',
    importable: true,
    table: 'customer_credit_payments',
    columns: ['ID', 'Fiado ID', 'Monto', 'Notas', 'Fecha'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('customer_credit_payments').select('*').order('created_at', { ascending: false })
      return data || []
    },
    toRow: (r) => [r.id, r.credit_id, centsToPesos(r.amount_cents), r.notes || '', r.paid_at],
    fromRow: (v) => {
      if (!v['Fiado ID']) return null
      return {
        id: v['ID'] || undefined,
        credit_id: v['Fiado ID'],
        amount_cents: pesosToCents(v['Monto']),
        notes: v['Notas'] || null,
        paid_at: v['Fecha'] || undefined,
      }
    },
  },
  {
    name: 'Mov. Inventario',
    importable: true,
    table: 'inventory_movements',
    columns: ['ID', 'Producto ID', 'Variante ID', 'Fecha', 'Tipo', 'Cambio', 'Notas'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('inventory_movements').select('*').order('created_at', { ascending: false }).limit(5000)
      return data || []
    },
    toRow: (r) => [r.id, r.product_id, r.variant_id || '', r.created_at, r.type, r.qty, r.note || ''],
    fromRow: (v) => {
      if (!v['Producto ID']) return null
      return {
        id: v['ID'] || undefined,
        product_id: v['Producto ID'],
        variant_id: v['Variante ID'] || null,
        type: v['Tipo'],
        qty: parseInt(v['Cambio']) || 0,
        note: v['Notas'] || null,
      }
    },
  },
  {
    name: 'Log Auditoría',
    importable: false,
    columns: ['Fecha', 'Usuario', 'Acción', 'Tabla', 'Detalle'],
    fetch: async (supabase) => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5000)
      return data || []
    },
    toRow: (r) => [r.created_at, r.actor_email || '', r.action, r.table_name, r.record_id || ''],
  },
]
