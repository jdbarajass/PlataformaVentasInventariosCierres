// Recibo térmico 80mm — puerto de services/recibo_generator.py del software
// local (VENTAS_YJBMOTOCOM), que genera el comprobante en PDF con ReportLab
// para la impresora térmica del local. Mismo layout/contenido/medidas,
// adaptado a HTML+CSS para imprimir desde el navegador (@page 80mm auto).
// Ver docs/UNIFICACION_YJBMOTOCOM.md sección 61.

import { BRAND } from '@/config/brand'

const NEGOCIO_NIT = BRAND.receipt.nit
const NEGOCIO_DIR = BRAND.receipt.address
const NEGOCIO_TEL = BRAND.receipt.phone
const NEGOCIO_EMAIL = BRAND.supportEmail
const NEGOCIO_REGIMEN = BRAND.receipt.regimen

const GARANTIA =
  'Para cambios o garantías, presenta este comprobante. Plazo máximo: 30 días calendario. Aplican condiciones.'
const LEGAL =
  'Este documento es un comprobante interno de venta. No reemplaza la factura electrónica oficial.'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

// Escudo vectorial — recreación en SVG del escudo dibujado a mano en
// recibo_generator.py (_dibujar_escudo: contorno con dos curvas Bézier
// hacia una punta inferior, "YJB" arriba, línea divisoria, "MOTOCOM" abajo).
const ESCUDO_SVG = `
<svg width="34" height="47" viewBox="0 0 34 47" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 2 H32 V24.5 C32 32 27 36 17 45 C7 36 2 32 2 24.5 Z"
        fill="none" stroke="#141414" stroke-width="1.6"/>
  <line x1="6.5" y1="23.5" x2="27.5" y2="23.5" stroke="#2e2e2e" stroke-width="0.6"/>
  <text x="17" y="18" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="9.5" fill="#0d0d0d">${BRAND.receiptSeal.top}</text>
  <text x="17" y="32.5" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="4" letter-spacing="-0.3" fill="#0d0d0d">${BRAND.receiptSeal.bottom}</text>
</svg>`

function formatCOP(cents: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)
}

interface ReciboOrder {
  order_number: string
  created_at: string
  customer_name: string | null
  customer_phone: string | null
  metadata: Record<string, any> | null
  notes: string | null
  discount_cents: number
  total_cents: number
  channel: string
}
interface ReciboItem {
  product_title: string
  product_talla: string | null
  product_sku: string | null
  qty: number
  price_cents: number
  total_cents: number
}
interface ReciboPayment {
  method: string
  method_detail: string | null
  amount_cents: number
  commission_cents: number
}

export function generarReciboTermicoHTML(
  order: ReciboOrder,
  items: ReciboItem[],
  payments: ReciboPayment[],
  vendedorNombre: string | null
): string {
  const fechaBogota = new Date(order.created_at).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const horaBogota = new Date(order.created_at).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit',
  })

  const cliNombre = order.customer_name || ''
  const cliCedula = order.metadata?.customer_id_number || ''
  const cliTel = order.customer_phone || ''

  const totalComision = payments.reduce((s, p) => s + (p.commission_cents || 0), 0)
  const totalFinal = order.total_cents + totalComision
  const totalItems = items.reduce((s, i) => s + i.qty, 0)

  const filasProductos = items
    .map((item, idx) => {
      const talla = (item.product_talla || '').trim()
      const nombre = talla && talla !== 'N/A' && talla !== '—' ? `${item.product_title} · Talla ${talla}` : item.product_title
      return `
        <div class="fila-producto">
          <div class="fila-nombre"><span class="num">${idx + 1}.</span> ${nombre}</div>
          ${item.product_sku ? `<div class="fila-sku">SKU: ${item.product_sku}</div>` : ''}
          <div class="fila-detalle">${item.qty}u x ${formatCOP(item.price_cents)} = ${formatCOP(item.total_cents)}</div>
        </div>`
    })
    .join('')

  const pagoHTML =
    payments.length > 1
      ? `
        <div class="kv"><span>Método pago:</span><span>Combinado</span></div>
        ${payments.map((p) => `<div class="kv sub"><span>${METHOD_LABELS[p.method] || p.method}:</span><span>${formatCOP(p.amount_cents)}</span></div>`).join('')}`
      : `<div class="kv"><span>Método pago:</span><span>${payments[0] ? METHOD_LABELS[payments[0].method] || payments[0].method : '—'}</span></div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo ${order.order_number} - ${BRAND.name}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; margin: 0 auto; font-family: Helvetica, Arial, sans-serif; color: #000; padding: 4mm; font-size: 7.5pt; line-height: 1.35; }
  .no-print { text-align: center; margin-bottom: 3mm; }
  .no-print button { padding: 8px 20px; background: #e11d48; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; }
  h1 { text-align: center; font-size: 13pt; margin: 1mm 0 2mm; }
  .cabecera { display: flex; align-items: center; gap: 2mm; margin-bottom: 2mm; }
  .cabecera .info { flex: 1; text-align: center; font-size: 6.5pt; font-weight: 700; }
  .cabecera .info div { margin: 0.3mm 0; }
  .sep { border: none; border-top: 1px solid #000; margin: 2mm 0; }
  .sep.dashed { border-top: 1px dashed #000; }
  .centrado { text-align: center; font-weight: 700; }
  .kv { display: flex; justify-content: space-between; font-weight: 700; margin: 0.4mm 0; }
  .kv.sub { font-weight: 400; padding-left: 3mm; font-size: 7pt; }
  .tabla-header { display: flex; justify-content: space-between; font-weight: 700; font-size: 7pt; margin-bottom: 1mm; }
  .fila-producto { margin-bottom: 1.5mm; }
  .fila-nombre { font-weight: 700; }
  .fila-nombre .num { font-weight: 700; }
  .fila-sku { font-size: 6.5pt; padding-left: 4mm; }
  .fila-detalle { text-align: right; font-weight: 700; font-size: 6.5pt; }
  .totales .kv { font-size: 7.5pt; }
  .totales .kv.total { font-size: 10pt; margin-top: 0.5mm; }
  .texto-chico { font-size: 6.5pt; font-weight: 700; text-align: center; margin: 0.3mm 0; }
  .gracias { text-align: center; font-weight: 700; margin-top: 2mm; }
  @media print { .no-print { display: none; } body { padding: 4mm 0; } }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Imprimir / Guardar como PDF</button>
  </div>

  <h1>${BRAND.name}</h1>
  <div class="cabecera">
    ${ESCUDO_SVG}
    <div class="info">
      <div>${NEGOCIO_NIT}</div>
      <div>${NEGOCIO_DIR}</div>
      <div>${NEGOCIO_TEL}</div>
      <div>${NEGOCIO_EMAIL}</div>
    </div>
  </div>
  <hr class="sep">

  <p class="centrado" style="font-size:6.5pt">${NEGOCIO_REGIMEN}</p>
  ${cliNombre
    ? `<div class="kv"><span>Cliente:</span><span>${cliNombre}</span></div>
       ${cliCedula ? `<div class="kv"><span>Cédula:</span><span>${cliCedula}</span></div>` : ''}
       ${cliTel ? `<div class="kv"><span>Tel.:</span><span>${cliTel}</span></div>` : ''}`
    : `<p class="centrado">Cliente: Consumidor Final</p>`}
  <hr class="sep">

  <div class="kv"><span>Comprobante N°:</span><span>#${order.order_number}</span></div>
  <div class="kv"><span>Fecha:</span><span>${fechaBogota}</span></div>
  <div class="kv"><span>Hora:</span><span>${horaBogota}</span></div>
  ${pagoHTML}
  <div class="kv"><span>Vendedor:</span><span>${vendedorNombre || BRAND.receipt.defaultSellerName}</span></div>
  <hr class="sep">

  <div class="tabla-header"><span>#  Descripción</span><span>Total</span></div>
  ${filasProductos}
  <hr class="sep dashed">

  <div class="totales">
    <div class="kv"><span>Subtotal:</span><span>${formatCOP(order.total_cents - totalComision + order.discount_cents)}</span></div>
    ${order.discount_cents > 0 ? `<div class="kv sub" style="font-size:7pt"><span>Descuento:</span><span>- ${formatCOP(order.discount_cents)}</span></div>` : ''}
    ${totalComision > 0 ? `<div class="kv sub" style="font-size:6.5pt"><span>Comisión:</span><span>+ ${formatCOP(totalComision)}</span></div>` : ''}
    <div class="kv total"><span>TOTAL COP:</span><span>${formatCOP(totalFinal)}</span></div>
  </div>
  <hr class="sep">

  <div class="kv"><span>Forma de pago:</span><span>${payments.length > 1 ? 'Combinado' : (payments[0] ? METHOD_LABELS[payments[0].method] || payments[0].method : '—')}</span></div>
  <div class="kv"><span>Items:</span><span>${totalItems}</span></div>

  ${order.notes ? `<p style="font-weight:700;font-size:6.5pt;margin-top:1mm">Observaciones:</p><p style="font-size:6.5pt">${order.notes}</p>` : ''}
  <hr class="sep">

  <p class="texto-chico">${GARANTIA}</p>
  <p class="texto-chico">${LEGAL}</p>
  <p class="gracias">¡Gracias por su compra!</p>
</body>
</html>`
}
