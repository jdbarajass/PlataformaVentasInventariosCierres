'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface SupplierInvoicePayment {
  id: string
  amount_cents: number
  account_id: string | null
  notes: string | null
  paid_at: string
}

interface SupplierInvoiceItem {
  id: string
  description: string
  qty: number
  unit_price_cents: number
  subtotal_cents: number
}

interface SupplierInvoice {
  id: string
  description: string
  supplier: string
  amount_cents: number
  arrival_date: string | null
  due_date: string | null
  status: 'pending' | 'paid'
  notes: string | null
  paid_at: string | null
  payments: SupplierInvoicePayment[]
  items: SupplierInvoiceItem[]
}

interface Account {
  id: string
  name: string
}

export default function FacturasPage() {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('pending')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', supplier: '', amount: '', arrival_date: '', due_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payAccount, setPayAccount] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)

  const [newItem, setNewItem] = useState({ description: '', qty: '1', unit_price: '' })
  const [savingItem, setSavingItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState({ description: '', qty: '', unit_price: '' })

  const { session, userProfile } = useAuth()
  const { toast } = useToast()

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const fetchInvoices = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/supplier-invoices${params}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setInvoices(data || [])
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, authHeaders, statusFilter])

  const fetchAccounts = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/accounts', { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const formatDate = (dateString: string | null) =>
    dateString ? new Date(dateString + 'T00:00:00').toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'

  const paidSoFar = (invoice: SupplierInvoice) =>
    (invoice.payments || []).reduce((sum, p) => sum + p.amount_cents, 0)

  const isDueSoon = (dueDate: string | null) => {
    if (!dueDate) return false
    const days = (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 7
  }

  const isOverdue = (dueDate: string | null, status: string) =>
    !!dueDate && status === 'pending' && new Date(dueDate).getTime() < Date.now()

  const dueSoonCount = invoices.filter((i) => i.status === 'pending' && isDueSoon(i.due_date)).length
  const totalPending = invoices
    .filter((i) => i.status === 'pending')
    .reduce((sum, i) => sum + (i.amount_cents - paidSoFar(i)), 0)

  // Barra de vencimiento en $ por franja — igual que el local (barra resumen
  // de ui/facturas_panel.py: Vencidas / 7 días / 30 días, en valor de dinero,
  // no solo conteo). Cada franja es el saldo pendiente (ya descontados los
  // abonos) de las facturas cuyo vencimiento cae en esa ventana.
  const daysUntilDue = (dueDate: string) => (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  const pendingWithDueDate = invoices.filter((i) => i.status === 'pending' && i.due_date)
  const overdueAmount = pendingWithDueDate
    .filter((i) => daysUntilDue(i.due_date as string) < 0)
    .reduce((sum, i) => sum + (i.amount_cents - paidSoFar(i)), 0)
  const dueSoon7Amount = pendingWithDueDate
    .filter((i) => { const d = daysUntilDue(i.due_date as string); return d >= 0 && d <= 7 })
    .reduce((sum, i) => sum + (i.amount_cents - paidSoFar(i)), 0)
  const dueSoon30Amount = pendingWithDueDate
    .filter((i) => { const d = daysUntilDue(i.due_date as string); return d >= 0 && d <= 30 })
    .reduce((sum, i) => sum + (i.amount_cents - paidSoFar(i)), 0)

  const handleCreate = async () => {
    if (!form.description.trim() || !form.supplier.trim() || !form.amount) {
      toast({ title: 'Error', description: 'Descripción, proveedor y monto son obligatorios', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/supplier-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          description: form.description,
          supplier: form.supplier,
          amount_cents: Math.round(parseFloat(form.amount) * 100),
          arrival_date: form.arrival_date || null,
          due_date: form.due_date || null,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al crear la factura')
      }
      toast({ title: 'Factura creada' })
      setForm({ description: '', supplier: '', amount: '', arrival_date: '', due_date: '', notes: '' })
      setShowForm(false)
      await fetchInvoices()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handlePay = async (invoice: SupplierInvoice) => {
    const amount = Math.round((parseFloat(payAmount) || 0) * 100)
    if (amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' })
      return
    }
    try {
      setPayingId(invoice.id)
      const res = await fetch(`/api/supplier-invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          amount_cents: amount,
          account_id: payAccount || null,
          notes: payNotes || null,
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar el abono')
      }
      toast({ title: 'Abono registrado' })
      setPayAmount('')
      setPayAccount('')
      setPayNotes('')
      await fetchInvoices()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setPayingId(null)
    }
  }

  const handleDelete = async (invoice: SupplierInvoice) => {
    if (!confirm(`¿Eliminar la factura "${invoice.description}"? Se revertirán los abonos que hayan afectado alguna cuenta.`)) return
    try {
      const res = await fetch(`/api/supplier-invoices/${invoice.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al eliminar la factura')
      }
      toast({ title: 'Factura eliminada' })
      await fetchInvoices()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleAddItem = async (invoiceId: string) => {
    const qty = parseInt(newItem.qty) || 1
    const unitPrice = Math.round((parseFloat(newItem.unit_price) || 0) * 100)
    if (!newItem.description.trim()) {
      toast({ title: 'Error', description: 'La descripción del ítem es obligatoria', variant: 'destructive' })
      return
    }
    try {
      setSavingItem(true)
      const res = await fetch(`/api/supplier-invoices/${invoiceId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ description: newItem.description, qty, unit_price_cents: unitPrice }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al agregar el ítem')
      }
      setNewItem({ description: '', qty: '1', unit_price: '' })
      await fetchInvoices()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingItem(false)
    }
  }

  const startEditItem = (item: SupplierInvoiceItem) => {
    setEditingItemId(item.id)
    setEditItem({
      description: item.description,
      qty: String(item.qty),
      unit_price: String(item.unit_price_cents / 100),
    })
  }

  const handleSaveEditItem = async (itemId: string) => {
    try {
      setSavingItem(true)
      const res = await fetch(`/api/supplier-invoice-items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          description: editItem.description,
          qty: parseInt(editItem.qty) || 1,
          unit_price_cents: Math.round((parseFloat(editItem.unit_price) || 0) * 100),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al actualizar el ítem')
      }
      setEditingItemId(null)
      await fetchInvoices()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingItem(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('¿Quitar este ítem de la factura?')) return
    try {
      const res = await fetch(`/api/supplier-invoice-items/${itemId}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Error al eliminar el ítem')
      await fetchInvoices()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">Facturas a proveedores, con abonos parciales</p>
        </div>
        <Button className="rounded-xl" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva factura
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total pendiente</p>
          <p className="text-2xl font-bold">{formatPrice(totalPending)}</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm text-muted-foreground">Vencidas</p>
          </div>
          <p className="text-2xl font-bold text-red-500">{formatPrice(overdueAmount)}</p>
        </div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <p className="text-sm text-muted-foreground">Vencen en ≤7 días ({dueSoonCount})</p>
          </div>
          <p className="text-2xl font-bold text-orange-500">{formatPrice(dueSoon7Amount)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Vencen en ≤30 días</p>
          <p className="text-2xl font-bold">{formatPrice(dueSoon30Amount)}</p>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Nueva factura</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg" />
            <Input placeholder="Proveedor" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="rounded-lg" />
            <MoneyInput placeholder="Monto" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} className="rounded-lg" />
            <Input type="date" placeholder="Fecha de llegada" value={form.arrival_date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} className="rounded-lg" />
            <Input type="date" placeholder="Fecha de vencimiento" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded-lg" />
            <Input placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-lg" />
          </div>
          <Button className="mt-4 rounded-lg" onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar factura
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        {(['pending', 'paid', 'all'] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            className="rounded-lg"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'pending' ? 'Pendientes' : s === 'paid' ? 'Pagadas' : 'Todas'}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8" />
          No hay facturas registradas
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const paid = paidSoFar(invoice)
            const remaining = invoice.amount_cents - paid
            const isExpanded = expanded === invoice.id
            return (
              <div key={invoice.id} className="rounded-xl border bg-card">
                <div
                  className="flex cursor-pointer items-center justify-between p-4"
                  onClick={() => setExpanded(isExpanded ? null : invoice.id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <p className="font-medium">{invoice.description}</p>
                      <p className="text-sm text-muted-foreground">{invoice.supplier}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isOverdue(invoice.due_date, invoice.status) && (
                      <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Vencida</Badge>
                    )}
                    {invoice.status === 'pending' && isDueSoon(invoice.due_date) && !isOverdue(invoice.due_date, invoice.status) && (
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">Vence pronto</Badge>
                    )}
                    <Badge variant="outline" className={invoice.status === 'paid' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}>
                      {invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                    </Badge>
                    <p className="font-bold">{formatPrice(invoice.amount_cents)}</p>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-4 border-t p-4">
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <p><span className="text-muted-foreground">Llegada:</span> {formatDate(invoice.arrival_date)}</p>
                      <p><span className="text-muted-foreground">Vencimiento:</span> {formatDate(invoice.due_date)}</p>
                      <p><span className="text-muted-foreground">Saldo:</span> {formatPrice(remaining)}</p>
                    </div>
                    {invoice.notes && <p className="text-sm text-muted-foreground">{invoice.notes}</p>}

                    <div>
                      <p className="mb-2 text-sm font-medium">Ítems</p>
                      {invoice.items.length > 0 && (
                        <div className="space-y-1">
                          {invoice.items.map((item) => (
                            <div key={item.id} className="rounded-lg border px-3 py-2 text-sm">
                              {editingItemId === item.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Input
                                    value={editItem.description}
                                    onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                                    className="h-7 flex-1 rounded-lg text-xs"
                                  />
                                  <Input
                                    type="number" min="1" value={editItem.qty}
                                    onChange={(e) => setEditItem({ ...editItem, qty: e.target.value })}
                                    className="h-7 w-14 rounded-lg text-xs"
                                  />
                                  <MoneyInput
                                    value={editItem.unit_price}
                                    onChange={(v) => setEditItem({ ...editItem, unit_price: v })}
                                    className="h-7 w-24 rounded-lg text-xs"
                                  />
                                  <Button size="sm" className="h-7 rounded-lg" onClick={() => handleSaveEditItem(item.id)} disabled={savingItem}>
                                    <CheckCircle2 className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => setEditingItemId(null)}>
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span>{item.description} — {item.qty} x {formatPrice(item.unit_price_cents)}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{formatPrice(item.subtotal_cents)}</span>
                                    <button onClick={() => startEditItem(item)} className="text-muted-foreground hover:text-foreground">
                                      Editar
                                    </button>
                                    <button onClick={() => handleDeleteItem(item.id)} className="text-red-500 hover:underline">
                                      Quitar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                          placeholder="Descripción del ítem"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          className="h-8 flex-1 rounded-lg text-xs"
                        />
                        <Input
                          type="number" min="1" placeholder="Cant." value={newItem.qty}
                          onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
                          className="h-8 w-16 rounded-lg text-xs"
                        />
                        <MoneyInput
                          placeholder="Precio unit." value={newItem.unit_price}
                          onChange={(v) => setNewItem({ ...newItem, unit_price: v })}
                          className="h-8 w-28 rounded-lg text-xs"
                        />
                        <Button size="sm" className="h-8 rounded-lg" onClick={() => handleAddItem(invoice.id)} disabled={savingItem}>
                          <Plus className="mr-1 h-3 w-3" /> Agregar
                        </Button>
                      </div>
                    </div>

                    {invoice.payments.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium">Abonos</p>
                        <div className="space-y-1">
                          {invoice.payments.map((p) => (
                            <div key={p.id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
                              <span>{formatDate(p.paid_at)} {p.notes ? `· ${p.notes}` : ''}</span>
                              <span className="font-medium">{formatPrice(p.amount_cents)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invoice.status === 'pending' && (
                      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Monto</label>
                          <MoneyInput
                            value={payAmount}
                            onChange={setPayAmount}
                            className="h-8 w-28 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Cuenta</label>
                          <select
                            value={payAccount}
                            onChange={(e) => setPayAccount(e.target.value)}
                            className="h-8 rounded-lg border bg-background px-2 text-xs"
                          >
                            <option value="">Sin cuenta</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                        <Input
                          placeholder="Notas"
                          value={payNotes}
                          onChange={(e) => setPayNotes(e.target.value)}
                          className="h-8 w-40 rounded-lg text-xs"
                        />
                        <Button size="sm" className="h-8 rounded-lg" onClick={() => handlePay(invoice)} disabled={payingId === invoice.id}>
                          {payingId === invoice.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                          Abonar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg"
                          onClick={() => setPayAmount((remaining / 100).toString())}
                        >
                          Usar saldo restante
                        </Button>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => handleDelete(invoice)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Eliminar factura
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
