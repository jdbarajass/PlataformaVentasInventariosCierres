'use client'

import { useState } from 'react'
import { FileSpreadsheet, Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { downloadReportExcel, openReportPrintable, type ReportDoc } from '@/lib/finance/report'

// Botones de exportar de las pestañas de Finanzas (Fase 6). `getDoc` arma el
// reporte con los datos que la pantalla ya tiene cargados.
export function ExportButtons({ getDoc, disabled }: { getDoc: () => ReportDoc | null; disabled?: boolean }) {
  const [excelBusy, setExcelBusy] = useState(false)
  const { toast } = useToast()

  const onExcel = async () => {
    const doc = getDoc()
    if (!doc) return
    setExcelBusy(true)
    try {
      await downloadReportExcel(doc)
    } catch (error) {
      console.error('Error exportando a Excel:', error)
      toast({ title: 'Error', description: 'No se pudo generar el Excel. Intenta de nuevo.', variant: 'destructive' })
    } finally {
      setExcelBusy(false)
    }
  }

  const onPdf = () => {
    const doc = getDoc()
    if (!doc) return
    if (!openReportPrintable(doc)) {
      toast({ title: 'Ventana bloqueada', description: 'El navegador bloqueó la ventana del reporte. Permite las ventanas emergentes para este sitio.', variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="rounded-lg touch:h-11 max-sm:flex-1" onClick={onExcel} disabled={disabled || excelBusy}>
        {excelBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
        Excel
      </Button>
      <Button variant="outline" size="sm" className="rounded-lg touch:h-11 max-sm:flex-1" onClick={onPdf} disabled={disabled}>
        <Printer className="mr-2 h-4 w-4" />
        PDF / Imprimir
      </Button>
    </div>
  )
}
