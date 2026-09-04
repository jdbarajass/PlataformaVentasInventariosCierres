import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { sheetDefinitions } from '@/lib/excel/sheets'
import { bogotaDateStr } from '@/lib/bogota-time'
import { BRAND } from '@/config/brand'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

// GET - Exporta las 18 hojas del respaldo maestro a un .xlsx. Solo admin
// (equivalente a "Exportar/Importar" protegido por contraseña en el local).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()
    const workbook = new ExcelJS.Workbook()
    workbook.creator = BRAND.name
    workbook.created = new Date()

    for (const def of sheetDefinitions) {
      const sheet = workbook.addWorksheet(def.name)
      sheet.addRow(def.columns).font = { bold: true }

      if (def.name === 'Ventas') {
        // Caso especial: una fila por línea de venta (order_item), con
        // datos de la orden y de los pagos aplanados.
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
    const filename = `${BRAND.name}_Respaldo_${bogotaDateStr(new Date())}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting Excel:', error)
    return NextResponse.json(
      { error: 'Error al generar el respaldo en Excel' },
      { status: 500 }
    )
  }
}
