import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDayRange, formatBogotaTime } from '@/lib/bogota-time'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

// GET - Exporta a Excel las ventas de mostrador de una fecha (Ventas del
// Día), igual que el botón "Exportar Excel" del software local
// (controllers/ventas_dia_controller.py: exportar_excel). Costo/comisión/
// ganancia solo se incluyen si quien exporta es admin.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    if (!date) {
      return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 })
    }
    const isAdmin = auth.user.role === 'admin'

    // Límites explícitos en hora de Bogotá (no naive `${date}T00:00:00`,
    // que Postgres interpreta en UTC y deja la ventana corrida 5 horas —
    // ver comentario de bogotaDayRange en lib/bogota-time.ts).
    const { from, to } = bogotaDayRange(date)
    const supabase = createAuthenticatedClient(auth.token)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), payments(*)')
      .eq('channel', 'pos')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: true })

    if (error) throw error

    const sales = (data || []) as any[]

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Ventas del Día')

    const columns = [
      { header: 'Orden', key: 'orden', width: 16 },
      { header: 'Hora', key: 'hora', width: 10 },
      { header: 'Cliente', key: 'cliente', width: 22 },
      { header: 'Producto(s)', key: 'productos', width: 40 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Método(s) de pago', key: 'metodos', width: 22 },
      { header: 'Estado', key: 'estado', width: 12 },
    ]
    if (isAdmin) {
      columns.splice(6, 0, { header: 'Costo', key: 'costo', width: 14 })
      columns.splice(7, 0, { header: 'Comisión', key: 'comision', width: 14 })
      columns.splice(8, 0, { header: 'Ganancia neta', key: 'ganancia', width: 14 })
    }
    sheet.columns = columns

    for (const sale of sales) {
      const items = sale.order_items || []
      const payments = sale.payments || []
      const cost = items.reduce((s: number, i: any) => s + i.qty * (i.cost_cents || 0), 0)
      const commission = payments.reduce((s: number, p: any) => s + (p.commission_cents || 0), 0)
      const row: Record<string, any> = {
        orden: sale.order_number,
        hora: formatBogotaTime(sale.created_at),
        cliente: sale.customer_name || 'Cliente de mostrador',
        productos: items.map((i: any) => `${i.product_title}${i.product_talla ? ` (T:${i.product_talla})` : ''} x${i.qty}`).join(', '),
        cantidad: items.reduce((s: number, i: any) => s + i.qty, 0),
        total: (sale.total_cents || 0) / 100,
        metodos: payments.map((p: any) => methodLabels[p.method] || p.method).join(' + '),
        estado: sale.status === 'cancelled' ? 'Cancelada' : 'Completada',
      }
      if (isAdmin) {
        row.costo = cost / 100
        row.comision = commission / 100
        row.ganancia = (sale.total_cents - cost) / 100
      }
      sheet.addRow(row)
    }

    sheet.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ventas-${date}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error exporting daily sales:', error)
    return NextResponse.json({ error: 'Error al exportar las ventas' }, { status: 500 })
  }
}
