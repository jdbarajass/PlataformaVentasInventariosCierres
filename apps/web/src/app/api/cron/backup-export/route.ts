import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { Resend } from 'resend'
import { getServiceSupabase } from '@/lib/supabase'
import { sheetDefinitions } from '@/lib/excel/sheets'
import { bogotaDateStr } from '@/lib/bogota-time'
import { verifyCronRequest } from '@/lib/cron-auth'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', other: 'Otro',
}

// GET - Genera el mismo respaldo de las 18 hojas que ya existe como botón
// manual en /admin/exportar-importar, y lo envía por email al admin de
// forma recurrente — para tener un respaldo aunque nadie lo pida a mano
// (mejora de la Fase 5, propuesta B.11).
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const supabase = getServiceSupabase()
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'YJBMOTOCOM'
    workbook.created = new Date()

    for (const def of sheetDefinitions) {
      const sheet = workbook.addWorksheet(def.name)
      sheet.addRow(def.columns).font = { bold: true }

      if (def.name === 'Ventas') {
        const orders = await def.fetch(supabase)
        orders.forEach((order: any) => {
          const paymentsStr = (order.payments || [])
            .map((p: any) => `${methodLabels[p.method] || p.method}${p.method_detail ? ` (${p.method_detail})` : ''}: ${(p.amount_cents / 100).toFixed(0)}`)
            .join(' | ')
          const commissionTotal = (order.payments || []).reduce((s: number, p: any) => s + (p.commission_cents || 0), 0) / 100

          ;(order.order_items || []).forEach((item: any) => {
            sheet.addRow([
              item.id, order.id, order.order_number, order.channel, order.created_at,
              item.product_title, item.product_sku || '', item.product_talla || '',
              item.qty, (item.cost_cents || 0) / 100, item.price_cents / 100,
              (item.discount_cents || 0) / 100, item.total_cents / 100,
              order.seller?.email || '', order.customer_name || '', order.customer_phone || '',
              order.notes || '', order.payment_status, paymentsStr, commissionTotal,
            ])
          })
        })
      } else {
        const rows = await def.fetch(supabase)
        rows.forEach((row) => sheet.addRow(def.toRow(row)))
      }

      sheet.columns.forEach((col) => { col.width = 18 })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const dateStr = bogotaDateStr(new Date())
    const filename = `YJBMOTOCOM_Respaldo_${dateStr}.xlsx`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'YJBMOTOCOM <pedidos@yjbmotocom.com>'
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'yjbmotocom@gmail.com'

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `Respaldo automático YJBMOTOCOM — ${dateStr}`,
      html: `<p>Adjunto el respaldo automático de esta semana (${dateStr}) con las 18 hojas de datos del negocio.</p>`,
      attachments: [{ filename, content: Buffer.from(buffer) }],
    })

    if (error) {
      console.error('[Cron Backup] Error sending email:', error)
      return NextResponse.json({ error: 'Error al enviar el respaldo' }, { status: 500 })
    }

    return NextResponse.json({ sent: true, filename })
  } catch (error) {
    console.error('[Cron Backup] Error:', error)
    return NextResponse.json({ error: 'Error generando el respaldo' }, { status: 500 })
  }
}
