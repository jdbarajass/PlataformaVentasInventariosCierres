// Reglas para editar el total de una factura de proveedor (Facturas → Editar).
//
// - El nuevo total no puede ser menor a lo ya abonado (quedaría plata pagada de más).
// - Si la factura tiene abonos, el estado se recalcula: pagada si los abonos ya
//   cubren el nuevo total, pendiente si no (igual que pay_supplier_invoice, que
//   la marca pagada al completar el monto).
// - Si la factura está pagada SIN abonos (se pagó por fuera del sistema, como
//   las cargadas en jul-2026), se queda pagada: no hay abonos para recalcular.

export interface InvoiceForEdit {
  amount_cents: number
  status: 'pending' | 'paid'
  paid_at: string | null
  payments: { amount_cents: number }[] | null
}

export type InvoiceEditResult =
  | { ok: true; status: 'pending' | 'paid'; paid_at: string | null; paid_cents: number }
  | { ok: false; error: string; paid_cents: number }

export function applyInvoiceAmountChange(current: InvoiceForEdit, newAmount: number, today: string): InvoiceEditResult {
  const paid = (current.payments || []).reduce((s, p) => s + Number(p.amount_cents || 0), 0)
  if (newAmount < paid) {
    return { ok: false, paid_cents: paid, error: `El nuevo total no puede ser menor a lo ya abonado (${formatCop(paid)}).` }
  }
  if (paid === 0) {
    // Sin abonos: una pagada por fuera del sistema sigue pagada; una pendiente sigue pendiente.
    return { ok: true, paid_cents: 0, status: current.status, paid_at: current.paid_at }
  }
  if (paid >= newAmount) {
    return { ok: true, paid_cents: paid, status: 'paid', paid_at: current.status === 'paid' && current.paid_at ? current.paid_at : today }
  }
  return { ok: true, paid_cents: paid, status: 'pending', paid_at: null }
}

function formatCop(cents: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100))
}
