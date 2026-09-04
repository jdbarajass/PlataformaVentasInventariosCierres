import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAuth } from '@/lib/auth-helpers'
import { sheetDefinitions } from '@/lib/excel/sheets'
import { BRAND } from '@/config/brand'

// GET - Plantilla en blanco (solo encabezados, sin datos) para llenar a
// mano y luego importar — equivalente a "⬇ Descargar Plantilla" del
// software local (services/exportador.py: generar_plantilla_todo()).
// Solo incluye las hojas importables (las de solo-exportación, como Ventas
// o Usuarios, nunca se reescriben desde un Excel — no tiene sentido darles
// plantilla).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = BRAND.name
    workbook.created = new Date()

    for (const def of sheetDefinitions) {
      if (!def.importable) continue
      const sheet = workbook.addWorksheet(def.name)
      sheet.addRow(def.columns).font = { bold: true }
      sheet.columns.forEach((col) => { col.width = 18 })
    }

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${BRAND.name}_Plantilla.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error generating Excel template:', error)
    return NextResponse.json(
      { error: 'Error al generar la plantilla' },
      { status: 500 }
    )
  }
}
