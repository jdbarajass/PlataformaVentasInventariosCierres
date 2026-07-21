import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { sheetDefinitions } from '@/lib/excel/sheets'

// Orden de importación: primero las tablas sin dependencias (Cuentas,
// Fiado, Notas, Presupuesto), luego las que referencian a esas por ID
// (Facturas → sus Items/Abonos, Fiado → sus Abonos, Cuentas → sus
// Movimientos). Evita errores de llave foránea al insertar.
const importOrder = [
  'Cuentas', 'Inventario', 'Préstamos', 'Facturas', 'Facturas Items', 'Abonos',
  'Fiado', 'Abonos Fiado', 'Notas', 'Presupuesto', 'Gastos', 'Mov. Cuentas',
  'Mov. Inventario',
]

function sheetToObjects(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const headers: string[] = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim()
  })

  const rows: Record<string, any>[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const obj: Record<string, any> = {}
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber]
      if (header) obj[header] = cell.value
    })
    const hasData = Object.values(obj).some((v) => v !== null && v !== undefined && v !== '')
    if (hasData) rows.push(obj)
  })
  return rows
}

// POST - Importa un .xlsx generado por /api/admin/excel/export. Solo
// escribe en las tablas internas del módulo YJBMOTOCOM (nunca en
// products/orders/order_items/payments/users/store_settings) — así una
// importación nunca puede afectar el catálogo, el checkout o el login.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)

    const supabase = getServiceSupabase()
    const results: { sheet: string; imported: number; skipped: number; error?: string }[] = []

    for (const sheetName of importOrder) {
      const def = sheetDefinitions.find((d) => d.name === sheetName && d.importable)
      if (!def || !def.table || !def.fromRow) continue

      const worksheet = workbook.getWorksheet(sheetName)
      if (!worksheet) {
        results.push({ sheet: sheetName, imported: 0, skipped: 0, error: 'Hoja no encontrada en el archivo (se omite)' })
        continue
      }

      const objects = sheetToObjects(worksheet)
      const mapped = objects
        .map((obj) => def.fromRow!(obj))
        .filter((row): row is Record<string, any> => row !== null)
      const skipped = objects.length - mapped.length

      if (mapped.length === 0) {
        results.push({ sheet: sheetName, imported: 0, skipped })
        continue
      }

      // Filas sin ID dejan que Postgres genere uno nuevo (altas hechas a
      // mano en el Excel); las que sí traen ID actualizan la fila existente.
      const cleaned = mapped.map((row) => {
        const copy = { ...row }
        if (!copy.id) delete copy.id
        return copy
      })

      const { error, data } = await (supabase.from(def.table) as any)
        .upsert(cleaned, { onConflict: 'id' })
        .select('id')

      if (error) {
        results.push({ sheet: sheetName, imported: 0, skipped: objects.length, error: error.message })
        continue
      }

      results.push({ sheet: sheetName, imported: data?.length || cleaned.length, skipped })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error importing Excel:', error)
    return NextResponse.json(
      { error: 'Error al importar el archivo Excel' },
      { status: 500 }
    )
  }
}
