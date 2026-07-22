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

// Validación de datos al importar (hallazgo de la auditoría de fidelidad,
// docs/UNIFICACION_YJBMOTOCOM.md sección 12.6 / 13.3 ítem 4.3.6): el software
// local detecta columnas desplazadas/corrompidas (importador.py) revisando
// que los campos numéricos/monetarios sean parseables — si no lo son,
// pesosToCents/parseInt de sheets.ts los convierte silenciosamente en 0,
// enmascarando el problema. Aquí se detectan ANTES de escribir nada: si más
// de la mitad de las filas de una hoja tienen algún campo numérico
// ilegible, se aborta toda la importación (igual que el "error crítico que
// bloquea la importación" del local), en vez de guardar datos corruptos.
const NUMERIC_COLUMN_HINTS = /monto|costo|stock|saldo|cantidad|precio/i

function findSuspiciousNumericCells(objects: Record<string, any>[], columns: string[]) {
  const numericCols = columns.filter((c) => NUMERIC_COLUMN_HINTS.test(c) && c !== 'ID' && !c.endsWith(' ID'))
  let rowsWithIssues = 0
  for (const obj of objects) {
    const hasIssue = numericCols.some((col) => {
      const raw = obj[col]
      return raw !== null && raw !== undefined && raw !== '' && Number.isNaN(parseFloat(String(raw)))
    })
    if (hasIssue) rowsWithIssues++
  }
  return { numericCols, rowsWithIssues }
}

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

    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Primera pasada: leer y validar TODAS las hojas antes de escribir nada.
    // Si más de la mitad de las filas de alguna hoja tienen un campo
    // numérico/monetario ilegible (columnas desplazadas, texto donde iba un
    // número), se aborta la importación completa — igual que el software
    // local, que nunca escribe datos que detecta como sospechosos.
    const sheetsData: {
      sheetName: string
      def: (typeof sheetDefinitions)[number]
      table: string
      objects: Record<string, any>[]
    }[] = []
    const criticalErrors: string[] = []
    const warnings: string[] = []

    for (const sheetName of importOrder) {
      const def = sheetDefinitions.find((d) => d.name === sheetName && d.importable)
      if (!def || !def.table || !def.fromRow) continue

      const worksheet = workbook.getWorksheet(sheetName)
      if (!worksheet) continue

      const objects = sheetToObjects(worksheet)
      if (objects.length > 0) {
        const { numericCols, rowsWithIssues } = findSuspiciousNumericCells(objects, def.columns)
        if (numericCols.length > 0 && rowsWithIssues / objects.length > 0.5) {
          criticalErrors.push(
            `"${sheetName}": ${rowsWithIssues} de ${objects.length} filas tienen un valor no numérico en una columna de ${numericCols.join('/')} — probable columna desplazada. Revisa el archivo antes de reintentar.`
          )
        }
      }

      sheetsData.push({ sheetName, def, table: def.table, objects })
    }

    if (criticalErrors.length > 0 && !force) {
      return NextResponse.json(
        {
          error: 'Se detectaron datos sospechosos, no se importó nada todavía',
          details: criticalErrors,
          canForce: true,
        },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()
    const results: { sheet: string; imported: number; skipped: number; error?: string }[] = []

    for (const { sheetName, def, table, objects } of sheetsData) {
      let candidateObjects = objects
      let skippedForValidation = 0

      // Gastos con monto negativo no se insertan (nunca debería existir un
      // gasto operativo negativo — igual que el CHECK amount_cents > 0 que
      // ya exige la creación normal vía /api/operating-expenses).
      if (sheetName === 'Gastos') {
        const before = candidateObjects.length
        candidateObjects = candidateObjects.filter((obj) => (parseFloat(String(obj['Monto'])) || 0) > 0)
        skippedForValidation = before - candidateObjects.length
      }

      const mapped = candidateObjects
        .map((obj) => def.fromRow!(obj))
        .filter((row): row is Record<string, any> => row !== null)
      const skipped = objects.length - mapped.length

      if (sheetName === 'Facturas' && objects.length > 0) {
        const zeroCount = objects.filter((obj) => (parseFloat(String(obj['Monto'])) || 0) === 0).length
        if (zeroCount / objects.length > 0.5) {
          warnings.push(`"Facturas": ${zeroCount} de ${objects.length} filas tienen Monto = 0.`)
        }
      }

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

      const { error, data } = await (supabase.from(table) as any)
        .upsert(cleaned, { onConflict: 'id' })
        .select('id')

      if (error) {
        results.push({ sheet: sheetName, imported: 0, skipped: objects.length, error: error.message })
        continue
      }

      results.push({ sheet: sheetName, imported: data?.length || cleaned.length, skipped: skipped + skippedForValidation })
    }

    return NextResponse.json({ results, warnings: warnings.length > 0 ? warnings : undefined })
  } catch (error) {
    console.error('Error importing Excel:', error)
    return NextResponse.json(
      { error: 'Error al importar el archivo Excel' },
      { status: 500 }
    )
  }
}
