import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// GET - Generate invoice HTML for an order (printable as PDF)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Unauthenticated by design (customers open this from their confirmation
  // email/page without logging in), so the order UUID is the only access
  // control — rate limit to make brute-force enumeration impractical.
  const rateLimited = checkRateLimit(request, { limit: 20, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  const supabase = getServiceSupabase()

  const { data: orderData, error } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .eq('id', params.id)
    .single()

  if (error || !orderData) {
    return new NextResponse('Orden no encontrada', { status: 404 })
  }

  // El select combina '*' con dos relaciones embebidas (order_items, payments)
  // sobre .single() — ese combo específico no lo resuelve bien el parser de
  // tipos de @supabase/postgrest-js (ver docs/UNIFICACION_YJBMOTOCOM.md,
  // limitaciones conocidas de tipos). Mismo patrón ya usado en
  // (shop)/orden/[id]/confirmacion/page.tsx para el mismo caso.
  const order = orderData as any
  const items = (order.order_items || []) as any[]
  const payments = (order.payments || []) as any[]
  const isPos = order.channel === 'pos'
  const shipping = order.shipping_address || {}

  const methodLabels: Record<string, string> = {
    cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
    nequi: 'Nequi', daviplata: 'Daviplata', addi: 'Addi', card: 'Datáfono', other: 'Otro',
  }
  const createdAt = new Date(order.created_at).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const formatCOP = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isPos ? 'Recibo' : 'Factura'} ${order.order_number} - YJBMOTOCOM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #e11d48; padding-bottom: 20px; }
    .brand h1 { font-size: 28px; color: #e11d48; margin-bottom: 4px; }
    .brand p { font-size: 12px; color: #666; }
    .invoice-info { text-align: right; }
    .invoice-info h2 { font-size: 20px; color: #333; margin-bottom: 8px; }
    .invoice-info p { font-size: 13px; color: #666; margin-bottom: 2px; }
    .details { display: flex; gap: 40px; margin-bottom: 32px; }
    .details-box { flex: 1; }
    .details-box h3 { font-size: 14px; color: #e11d48; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .details-box p { font-size: 13px; color: #444; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #f8f8f8; padding: 12px 8px; font-size: 12px; color: #666; text-align: left; border-bottom: 2px solid #ddd; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody td { padding: 12px 8px; font-size: 13px; border-bottom: 1px solid #eee; }
    .text-right { text-align: right; }
    .totals { margin-left: auto; width: 280px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .totals .row.total { border-top: 2px solid #1a1a1a; padding-top: 10px; margin-top: 6px; font-size: 18px; font-weight: bold; color: #e11d48; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #999; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:20px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#e11d48;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
      Imprimir / Guardar como PDF
    </button>
  </div>

  <div class="header">
    <div class="brand">
      <h1>YJBMOTOCOM</h1>
      <p>Accesorios para Motociclistas</p>
      <p>NIT: Pendiente de registro</p>
    </div>
    <div class="invoice-info">
      <h2>${isPos ? 'RECIBO DE VENTA' : 'FACTURA'}</h2>
      <p><strong>No.</strong> ${order.order_number}</p>
      <p><strong>Fecha:</strong> ${createdAt}</p>
      <p><strong>Estado:</strong> ${order.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE'}</p>
    </div>
  </div>

  <div class="details">
    <div class="details-box">
      <h3>Cliente</h3>
      <p><strong>${order.customer_name || 'Cliente de mostrador'}</strong></p>
      ${order.customer_email && order.customer_email !== 'mostrador@yjbmotocom.com' ? `<p>${order.customer_email}</p>` : ''}
      ${order.customer_phone ? `<p>${order.customer_phone}</p>` : ''}
    </div>
    <div class="details-box">
      ${isPos ? `
      <h3>Pago</h3>
      ${payments.map((p: any) => `<p>${methodLabels[p.method] || p.method}${p.method_detail ? ` (${p.method_detail})` : ''}: ${formatCOP(p.amount_cents)}</p>`).join('') || '<p>N/A</p>'}
      ` : `
      <h3>Envio</h3>
      <p>${shipping.address || 'N/A'}</p>
      <p>${shipping.city || ''}</p>
      `}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th class="text-right">Cant.</th>
        <th class="text-right">Precio Unit.</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item: any) => `
      <tr>
        <td>${item.product_title}</td>
        <td class="text-right">${item.qty}</td>
        <td class="text-right">${formatCOP(item.price_cents)}</td>
        <td class="text-right">${formatCOP(item.total_cents)}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span>Subtotal</span>
      <span>${formatCOP(order.subtotal_cents)}</span>
    </div>
    ${order.discount_cents > 0 ? `
    <div class="row" style="color:#16a34a;">
      <span>Descuento</span>
      <span>-${formatCOP(order.discount_cents)}</span>
    </div>
    ` : ''}
    ${!isPos ? `
    <div class="row">
      <span>Envio</span>
      <span>${order.shipping_cents === 0 ? 'Gratis' : formatCOP(order.shipping_cents)}</span>
    </div>
    ` : ''}
    ${order.tax_cents > 0 ? `
    <div class="row">
      <span>IVA</span>
      <span>${formatCOP(order.tax_cents)}</span>
    </div>
    ` : ''}
    <div class="row total">
      <span>TOTAL</span>
      <span>${formatCOP(order.total_cents)}</span>
    </div>
  </div>

  <div class="footer">
    <p>YJBMOTOCOM - Accesorios para Motociclistas en Colombia</p>
    <p>yjbmotocom@gmail.com | yjbmotocom.com</p>
    <p style="margin-top:8px;">Gracias por tu compra</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
