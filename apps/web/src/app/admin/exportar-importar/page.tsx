'use client'

import { useState, useRef } from 'react'
import { Download, Upload, Loader2, Lock, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { BRAND } from '@/config/brand'

interface ImportResult {
  sheet: string
  imported: number
  skipped: number
  error?: string
}

async function downloadBackup(token: string, prefix: string = 'Respaldo') {
  const res = await fetch('/api/admin/excel/export', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Error al generar el respaldo automático')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${BRAND.name}_${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

const importableSheets = [
  'Cuentas', 'Inventario', 'Préstamos', 'Facturas', 'Facturas Items', 'Abonos',
  'Fiado', 'Abonos Fiado', 'Notas', 'Presupuesto', 'Gastos', 'Mov. Cuentas', 'Mov. Inventario',
]
const exportOnlySheets = ['Ventas', 'Configuración', 'Usuarios', 'Log Auditoría', 'Cierres Cuentas']

export default function ExportarImportarPage() {
  const [exporting, setExporting] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [warnings, setWarnings] = useState<string[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'
  // Exportar (descarga) es de solo lectura, así que se deja disponible
  // para el admin de solo lectura — solo se le oculta "Importar" más
  // abajo, que sí escribe datos.
  const canView = isAdmin || userProfile?.role === 'admin_readonly'

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  const handleExport = async () => {
    if (!session?.access_token) return
    try {
      setExporting(true)
      await downloadBackup(session.access_token)
      toast({ title: 'Respaldo generado', description: 'Se descargó el archivo Excel con las 18 hojas' })
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadTemplate = async () => {
    if (!session?.access_token) return
    try {
      setDownloadingTemplate(true)
      const res = await fetch('/api/admin/excel/template', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) throw new Error('Error al generar la plantilla')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${BRAND.name}_Plantilla.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const runImport = async (file: File, force = false) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/admin/excel/import${force ? '?force=true' : ''}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session!.access_token}` },
      body: formData,
    })
    return { res, json: await res.json() }
  }

  const handleImportFile = async (file: File) => {
    if (!session?.access_token) return
    if (!confirm(`¿Importar "${file.name}"? Esto actualizará (o creará) filas en las tablas internas del módulo YJBMOTOCOM según lo que traiga el archivo. Antes de aplicar los cambios se descargará automáticamente un respaldo del estado actual.`)) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    try {
      setImporting(true)
      setResults(null)
      setWarnings(null)

      // Respaldo automático del estado actual antes de tocar nada, igual
      // que el software local (backup_antes_importar_<timestamp>.xlsx).
      await downloadBackup(session.access_token, 'Respaldo_previo_import')

      let { res, json } = await runImport(file)

      if (!res.ok && json.canForce) {
        const detalle = (json.details || []).join('\n')
        if (!confirm(`${json.error}:\n\n${detalle}\n\n¿Importar de todas formas?`)) {
          return
        }
        ;({ res, json } = await runImport(file, true))
      }

      if (!res.ok) {
        throw new Error(json.error || 'Error al importar el archivo')
      }

      setResults(json.results)
      setWarnings(json.warnings || null)
      toast({ title: 'Importación completada' })
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Exportar / Importar</h1>
        <p className="text-muted-foreground">Respaldo maestro en Excel de 18 hojas, igual que el software local</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-cyan-500" />
            <div>
              <h2 className="text-lg font-semibold">Exportar</h2>
              <p className="text-sm text-muted-foreground">Descarga las 18 hojas completas (respaldo de solo lectura)</p>
            </div>
          </div>
          <Button className="mt-4 w-full rounded-lg" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Descargar respaldo (.xlsx)
          </Button>
          <Button variant="outline" className="mt-2 w-full rounded-lg" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
            {downloadingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Descargar plantilla vacía (para llenar a mano)
          </Button>
        </div>

        {isAdmin && (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <Upload className="h-8 w-8 text-cyan-500" />
            <div>
              <h2 className="text-lg font-semibold">Importar</h2>
              <p className="text-sm text-muted-foreground">Sube un .xlsx exportado desde aquí para restaurar/actualizar datos</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="mt-4 w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
            }}
            disabled={importing}
          />
          {importing && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Importando...
            </div>
          )}
        </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold">Qué hojas se pueden reimportar</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Por seguridad, la importación <strong>nunca</strong> escribe en productos/catálogo, órdenes/pagos,
          usuarios ni configuración de la tienda — solo en las tablas internas del módulo YJBMOTOCOM. Así,
          una importación jamás puede afectar el catálogo público, el checkout o el login.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {importableSheets.map((s) => (
            <span key={s} className="rounded-full bg-green-500/10 px-3 py-1 text-green-600">{s}</span>
          ))}
          {exportOnlySheets.map((s) => (
            <span key={s} className="rounded-full bg-muted px-3 py-1 text-muted-foreground">{s} (solo exportación)</span>
          ))}
        </div>
      </div>

      {warnings && warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
          {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {results && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Resultado de la importación</h2>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.sheet} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {r.error ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  <span className="font-medium">{r.sheet}</span>
                </div>
                <div className="text-muted-foreground">
                  {r.error ? (
                    <span className="text-red-500">{r.error}</span>
                  ) : (
                    <span>{r.imported} importadas{r.skipped > 0 ? `, ${r.skipped} omitidas` : ''}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
