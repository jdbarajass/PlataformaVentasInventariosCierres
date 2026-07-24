'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PackageOpen, Plus, Loader2, Search, Trash2, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface Loan {
  id: string
  product_title: string
  warehouse: string
  observations: string | null
  status: 'pending' | 'returned' | 'charged'
  created_at: string
}

interface ProductResult {
  id: string
  title: string
  variants: { id: string; talla: string | null }[]
}

const statusLabels: Record<Loan['status'], string> = {
  pending: 'Pendiente',
  returned: 'Devuelto',
  charged: 'Cobrado',
}

const statusColors: Record<Loan['status'], string> = {
  pending: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  returned: 'bg-green-500/10 text-green-500 border-green-500/20',
  charged: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
}

// Colombia no tiene horario de verano — UTC-5 todo el año, así que el
// desfase es siempre fijo. Todo el formateo/cálculo de fecha usa
// explícitamente 'America/Bogota' en vez de confiar en la zona horaria del
// sistema operativo del navegador — el software local tuvo justo este
// problema (la hora mostrada no siempre coincidía con la hora real de
// Colombia porque dependía de la configuración del equipo).
const BOGOTA_TZ = 'America/Bogota'

function bogotaDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ }).format(d)
}

function bogotaTimeStr(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}

// Combina una fecha (YYYY-MM-DD) y hora (HH:MM) locales de Bogotá en el
// instante UTC correcto, sin depender de la zona horaria del navegador.
function bogotaToISO(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00-05:00`).toISOString()
}

function diasPendientes(iso: string): number {
  const loanDate = new Date(`${bogotaDateStr(new Date(iso))}T00:00:00Z`)
  const today = new Date(`${bogotaDateStr(new Date())}T00:00:00Z`)
  return Math.max(0, Math.round((today.getTime() - loanDate.getTime()) / 86400000))
}

function diasBadgeColor(dias: number, status: Loan['status']): string {
  if (status !== 'pending') return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
  if (dias < 30) return 'bg-green-500/10 text-green-600 border-green-500/20'
  if (dias < 60) return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  return 'bg-red-500/10 text-red-600 border-red-500/20'
}

export default function PrestamosPage() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | Loan['status']>('pending')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; title: string; variantId: string | null; talla: string | null } | null>(null)
  // El local no exige que el producto prestado exista en inventario (es
  // simplemente un texto libre en models/prestamo.py) — se permite el mismo
  // caso para algo que no está en el catálogo (ej. una exhibición, una
  // herramienta prestada, no solo mercancía).
  const [manualMode, setManualMode] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [observations, setObservations] = useState('')
  // Fecha editable al crear (por defecto hoy en Bogotá); la hora siempre se
  // toma real al momento del clic — igual que el local (comentario explícito
  // en ui/prestamos_panel.py: "Captura la hora real en el momento exacto del
  // clic, no la hora de apertura"), para evitar que quede una hora vieja si
  // el formulario se deja abierto un rato antes de registrar.
  const [createDate, setCreateDate] = useState(() => bogotaDateStr(new Date()))
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ product_title: '', warehouse: '', observations: '', date: '', time: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const { session } = useAuth()
  const { toast } = useToast()

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  // Se trae siempre todo (sin filtrar por status en el servidor) para poder
  // calcular el banner de alerta sobre el total real de pendientes, igual
  // que el local (_actualizar_alerta usa todos los pendientes en memoria,
  // sin importar el filtro visual activo) — el filtro de estado se aplica
  // solo al mostrar la lista.
  const fetchLoans = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch('/api/loans', { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setLoans(data || [])
    } catch (error) {
      console.error('Error fetching loans:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    fetchLoans()
  }, [fetchLoans])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      if (!session?.access_token) return
      try {
        const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() })
        if (!res.ok) return
        const { data } = await res.json()
        setResults(data || [])
      } catch (error) {
        console.error('Error searching products:', error)
      }
    }, 250)
  }, [query, session?.access_token, authHeaders])

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const visibleLoans = statusFilter === 'all' ? loans : loans.filter((l) => l.status === statusFilter)
  const pendingLoans = loans.filter((l) => l.status === 'pending')
  const urgentCount = pendingLoans.filter((l) => diasPendientes(l.created_at) >= 30).length

  const handleCreate = async () => {
    if ((!selectedProduct && !manualTitle.trim()) || !warehouse.trim()) {
      toast({ title: 'Error', description: 'Selecciona un producto (o escribe su nombre) e ingresa el almacén', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          product_id: selectedProduct?.id || null,
          variant_id: selectedProduct?.variantId || null,
          product_title: selectedProduct
            ? (selectedProduct.talla ? `${selectedProduct.title} (${selectedProduct.talla})` : selectedProduct.title)
            : manualTitle.trim(),
          warehouse,
          observations: observations || null,
          created_at: bogotaToISO(createDate, bogotaTimeStr(new Date())),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar el préstamo')
      }
      toast({ title: 'Préstamo registrado' })
      setSelectedProduct(null)
      setManualMode(false)
      setManualTitle('')
      setWarehouse('')
      setObservations('')
      setQuery('')
      setCreateDate(bogotaDateStr(new Date()))
      await fetchLoans()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (loan: Loan, status: Loan['status']) => {
    try {
      const res = await fetch(`/api/loans/${loan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Error al actualizar el préstamo')
      toast({ title: 'Préstamo actualizado' })
      await fetchLoans()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const startEdit = (loan: Loan) => {
    setEditingId(loan.id)
    const d = new Date(loan.created_at)
    setEditForm({
      product_title: loan.product_title,
      warehouse: loan.warehouse,
      observations: loan.observations || '',
      date: bogotaDateStr(d),
      time: bogotaTimeStr(d),
    })
  }

  const handleSaveEdit = async (loanId: string) => {
    if (!editForm.product_title.trim() || !editForm.warehouse.trim()) {
      toast({ title: 'Error', description: 'Producto y almacén son obligatorios', variant: 'destructive' })
      return
    }
    try {
      setSavingEdit(true)
      const res = await fetch(`/api/loans/${loanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          product_title: editForm.product_title,
          warehouse: editForm.warehouse,
          observations: editForm.observations || null,
          created_at: bogotaToISO(editForm.date, editForm.time),
        }),
      })
      if (!res.ok) throw new Error('Error al actualizar el préstamo')
      toast({ title: 'Préstamo actualizado' })
      setEditingId(null)
      await fetchLoans()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (loan: Loan) => {
    if (!confirm(`¿Eliminar el préstamo de "${loan.product_title}"?`)) return
    try {
      const res = await fetch(`/api/loans/${loan.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Error al eliminar el préstamo')
      toast({ title: 'Préstamo eliminado' })
      await fetchLoans()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Préstamos</h1>
        <p className="text-muted-foreground">Productos prestados a otros almacenes</p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Nuevo préstamo</h2>
        <div className="space-y-3">
          {!selectedProduct && manualMode ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nombre del producto (fuera de catálogo)"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="rounded-lg"
                autoFocus
              />
              <Button variant="ghost" size="sm" onClick={() => { setManualMode(false); setManualTitle('') }}>Cancelar</Button>
            </div>
          ) : !selectedProduct ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-lg pl-10"
              />
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="mt-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                ¿No está en el catálogo? Escribe el nombre a mano
              </button>
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full space-y-1 overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
                  {results.map((product) =>
                    product.variants.length === 0 ? (
                      <button
                        key={product.id}
                        className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSelectedProduct({ id: product.id, title: product.title, variantId: null, talla: null })
                          setResults([])
                        }}
                      >
                        {product.title}
                      </button>
                    ) : (
                      product.variants.map((v) => (
                        <button
                          key={v.id}
                          className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSelectedProduct({ id: product.id, title: product.title, variantId: v.id, talla: v.talla })
                            setResults([])
                          }}
                        >
                          {product.title} {v.talla ? `(${v.talla})` : ''}
                        </button>
                      ))
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">
                {selectedProduct.talla ? `${selectedProduct.title} (${selectedProduct.talla})` : selectedProduct.title}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>Cambiar</Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Fecha (la hora se toma real al registrar)</label>
              <Input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <Input placeholder="Almacén / destino" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="rounded-lg self-end" />
          </div>
          <Input placeholder="Observaciones (opcional)" value={observations} onChange={(e) => setObservations(e.target.value)} className="rounded-lg" />
          <Button className="rounded-lg" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Registrar préstamo
          </Button>
        </div>
      </div>

      {pendingLoans.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {pendingLoans.length} préstamo{pendingLoans.length !== 1 ? 's' : ''} pendiente{pendingLoans.length !== 1 ? 's' : ''}
            {urgentCount > 0 && ` — ${urgentCount} con más de 30 días sin resolver`}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        {(['pending', 'returned', 'charged', 'all'] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            className="rounded-lg"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'Todos' : statusLabels[s]}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visibleLoans.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <PackageOpen className="mx-auto mb-2 h-8 w-8" />
          No hay préstamos registrados
        </div>
      ) : (
        <div className="space-y-2">
          {visibleLoans.map((loan) =>
            editingId === loan.id ? (
              <div key={loan.id} className="space-y-2 rounded-xl border bg-card p-4">
                <Input
                  value={editForm.product_title}
                  onChange={(e) => setEditForm({ ...editForm, product_title: e.target.value })}
                  className="rounded-lg"
                  placeholder="Producto"
                />
                <Input
                  value={editForm.warehouse}
                  onChange={(e) => setEditForm({ ...editForm, warehouse: e.target.value })}
                  className="rounded-lg"
                  placeholder="Almacén"
                />
                <Input
                  value={editForm.observations}
                  onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                  className="rounded-lg"
                  placeholder="Observaciones"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Fecha</label>
                    <Input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Hora</label>
                    <Input
                      type="time"
                      value={editForm.time}
                      onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                      className="rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-lg" onClick={() => handleSaveEdit(loan.id)} disabled={savingEdit}>
                    {savingEdit ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setEditingId(null)}>
                    <X className="mr-1 h-3 w-3" /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div key={loan.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div>
                  <p className="font-medium">{loan.product_title}</p>
                  <p className="text-sm text-muted-foreground">
                    {loan.warehouse} · {formatDateTime(loan.created_at)}
                    {loan.observations ? ` · ${loan.observations}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={diasBadgeColor(diasPendientes(loan.created_at), loan.status)}>
                    {diasPendientes(loan.created_at)}d
                  </Badge>
                  <Badge variant="outline" className={statusColors[loan.status]}>{statusLabels[loan.status]}</Badge>
                  <select
                    value={loan.status}
                    onChange={(e) => handleStatusChange(loan, e.target.value as Loan['status'])}
                    className="rounded-lg border bg-background px-2 py-1 text-xs"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="returned">Devuelto</option>
                    <option value="charged">Cobrado</option>
                  </select>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(loan)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(loan)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
