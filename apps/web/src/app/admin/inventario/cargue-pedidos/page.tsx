'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, Loader2, CheckCircle2, X, Trash2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

type Provider = 'xtrong' | 'distrifabrica'

interface ReviewItem {
  key: string
  nombreSugerido: string
  talla: string
  costoSinIva: number
  cantidad: number
  codigoBarrasSugerido: string
  matchStatus: 'nuevo' | 'nueva_talla' | 'suma'
  existingProductId: string | null
  existingVariantId: string | null
}

const statusConfig: Record<ReviewItem['matchStatus'], { label: string; color: string }> = {
  nuevo: { label: 'NUEVO PRODUCTO', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  nueva_talla: { label: 'NUEVA TALLA', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  suma: { label: 'SUMA STOCK', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' },
}

export default function CarguePedidosPage() {
  const [provider, setProvider] = useState<Provider | ''>('')
  const [fileName, setFileName] = useState('')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [parsing, setParsing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session?.access_token) return
    if (!provider) {
      toast({ title: 'Selecciona un proveedor', description: 'Elige el proveedor antes de cargar el PDF', variant: 'destructive' })
      return
    }

    setFileName(file.name)
    setItems([])
    setParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('provider', provider)
      const res = await fetch('/api/admin/inventory-import/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al leer el PDF')
      }
      const { data } = await res.json()
      if (!data || data.length === 0) {
        toast({
          title: 'Sin ítems',
          description: 'No se encontraron cascos en el PDF. Verifica que sea el proveedor correcto.',
        })
        return
      }
      setItems(
        (data as Omit<ReviewItem, 'key'>[]).map((it, i) => ({ ...it, key: `${i}-${it.codigoBarrasSugerido}` }))
      )
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  const updateItem = (key: string, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  const handleConfirm = async () => {
    if (!session?.access_token || items.length === 0) return
    try {
      setConfirming(true)
      const res = await fetch('/api/admin/inventory-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          items: items.map((it) => ({
            nombreSugerido: it.nombreSugerido,
            talla: it.talla,
            costoCents: Math.round(it.costoSinIva * 100),
            cantidad: it.cantidad,
            codigoBarras: it.codigoBarrasSugerido || null,
            existingProductId: it.existingProductId,
            existingVariantId: it.existingVariantId,
          })),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al importar')
      }
      const { data } = await res.json()
      toast({
        title: 'Importación completada',
        description: `${data.productsCreated} productos nuevos · ${data.variantsCreated} tallas nuevas · ${data.stockUpdated} con stock sumado${data.errors ? ` · ${data.errors} errores` : ''}`,
      })
      setItems([])
      setFileName('')
      setProvider('')
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setConfirming(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  const nNew = items.filter((i) => i.matchStatus === 'nuevo').length
  const nNewTalla = items.filter((i) => i.matchStatus === 'nueva_talla').length
  const nSuma = items.filter((i) => i.matchStatus === 'suma').length

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/admin/inventario" className="rounded-lg p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Cargue de Pedidos (Cascos)</h1>
          <p className="text-muted-foreground">
            Selecciona el proveedor, carga el PDF del pedido y el sistema extrae los cascos, sugiere nombres y
            códigos de barras. Los productos nuevos se crean inactivos hasta que los revises en Productos.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider | '')}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">— Selecciona proveedor —</option>
            <option value="xtrong">ACCESORIOS PARA MOTOS S.A.S. (XTRONG)</option>
            <option value="distrifabrica">DISTRIFABRICA RAMIREZ SAS (SHAFT / HRO / ICH)</option>
          </select>

          <label>
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} disabled={parsing} />
            <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Cargar PDF de pedido
            </span>
          </label>

          <span className="text-sm text-muted-foreground">{fileName || 'Ningún archivo cargado'}</span>

          {items.length > 0 && (
            <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-600">
              {items.length} cascos · {nNew} nuevos · {nNewTalla} tallas nuevas · {nSuma} suman stock
            </span>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Nombre en inventario (editable)</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Talla</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Costo unit.</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Cantidad</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Código barras</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const cfg = statusConfig[item.matchStatus]
                  return (
                    <tr key={item.key} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={item.nombreSugerido}
                          onChange={(e) => updateItem(item.key, { nombreSugerido: e.target.value })}
                          className="h-8 rounded-lg text-xs"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Input
                          value={item.talla}
                          onChange={(e) => updateItem(item.key, { talla: e.target.value })}
                          className="h-8 w-14 rounded-lg text-center text-xs"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{formatPrice(Math.round(item.costoSinIva * 100))}</td>
                      <td className="px-3 py-2 text-center">
                        <Input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => updateItem(item.key, { cantidad: parseInt(e.target.value) || 1 })}
                          className="h-8 w-16 rounded-lg text-center text-xs"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <code className="rounded bg-muted px-2 py-1 text-xs">{item.codigoBarrasSugerido || '—'}</code>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.key)}>
                          <X className="h-3 w-3 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t p-4">
            <p className="text-xs text-muted-foreground">
              🟢 NUEVO PRODUCTO = se crea inactivo, revísalo en Productos · 🔵 NUEVA TALLA = se agrega al producto existente · 🩵 SUMA STOCK = se suma a la variante existente
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-lg" onClick={() => { setItems([]); setFileName('') }}>
                <Trash2 className="mr-2 h-4 w-4" /> Limpiar
              </Button>
              <Button className="rounded-lg" onClick={handleConfirm} disabled={confirming}>
                {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Confirmar e Importar al Inventario
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
