'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckCircle2,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface CreditPayment {
  id: string
  amount_cents: number
  notes: string | null
  paid_at: string
}

interface CustomerCredit {
  id: string
  customer_name: string
  customer_id_number: string | null
  customer_phone: string | null
  description: string | null
  total_amount_cents: number
  status: 'pending' | 'paid'
  notes: string | null
  created_at: string
  payments: CreditPayment[]
}

// Antigüedad del fiado — igual que la columna "Días" coloreada del local
// (ui/fiado_panel.py): verde ≤7 días, naranja ≤30, rojo >30.
function daysOld(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
}
function ageBadgeClass(days: number): string {
  if (days <= 7) return 'bg-green-500/10 text-green-500 border-green-500/20'
  if (days <= 30) return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
  return 'bg-red-500/10 text-red-500 border-red-500/20'
}

interface Account {
  id: string
  name: string
}

export default function FiadoPage() {
  const [credits, setCredits] = useState<CustomerCredit[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('pending')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    customer_name: '', customer_id_number: '', customer_phone: '',
    description: '', total_amount: '', initial_payment: '', initial_payment_account_id: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payAccount, setPayAccount] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)

  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [savingAmount, setSavingAmount] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const fetchCredits = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/customer-credits${params}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setCredits(data || [])
    } catch (error) {
      console.error('Error fetching customer credits:', error)
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
    fetchCredits()
  }, [fetchCredits])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const formatDate = (dateString: string) =>
    new Date(dateString + 'T00:00:00').toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })

  const paidSoFar = (credit: CustomerCredit) =>
    (credit.payments || []).reduce((sum, p) => sum + p.amount_cents, 0)

  const totalPending = credits
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + (c.total_amount_cents - paidSoFar(c)), 0)

  const handleCreate = async () => {
    if (!form.customer_name.trim() || !form.description.trim() || !form.total_amount || parseFloat(form.total_amount) <= 0) {
      toast({ title: 'Error', description: 'Nombre del cliente, descripción y un monto mayor a cero son obligatorios', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/customer-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          customer_name: form.customer_name,
          customer_id_number: form.customer_id_number || null,
          customer_phone: form.customer_phone || null,
          description: form.description || null,
          total_amount_cents: Math.round(parseFloat(form.total_amount) * 100),
          notes: form.notes || null,
          initial_payment_cents: form.initial_payment ? Math.round(parseFloat(form.initial_payment) * 100) : undefined,
          initial_payment_account_id: form.initial_payment_account_id || null,
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al crear el fiado')
      }
      toast({ title: 'Fiado creado' })
      setForm({ customer_name: '', customer_id_number: '', customer_phone: '', description: '', total_amount: '', initial_payment: '', initial_payment_account_id: '', notes: '' })
      setShowForm(false)
      await fetchCredits()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handlePay = async (credit: CustomerCredit) => {
    const amount = Math.round((parseFloat(payAmount) || 0) * 100)
    if (amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' })
      return
    }
    try {
      setPayingId(credit.id)
      const res = await fetch(`/api/customer-credits/${credit.id}/payments`, {
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
      await fetchCredits()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setPayingId(null)
    }
  }

  const handleSaveAmount = async (creditId: string) => {
    const amount = Math.round((parseFloat(editAmount) || 0) * 100)
    try {
      setSavingAmount(true)
      const res = await fetch(`/api/customer-credits/${creditId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ total_amount_cents: amount }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al actualizar el monto')
      }
      toast({ title: 'Monto actualizado' })
      setEditingAmountId(null)
      await fetchCredits()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingAmount(false)
    }
  }

  const handleMarkPaid = async (credit: CustomerCredit) => {
    if (!confirm(`¿Marcar el fiado de "${credit.customer_name}" como pagado? Esto condona el saldo pendiente sin registrar un abono por esa diferencia.`)) return
    try {
      setMarkingPaidId(credit.id)
      const res = await fetch(`/api/customer-credits/${credit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ force_paid: true }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al marcar el fiado como pagado')
      }
      toast({ title: 'Fiado marcado como pagado' })
      await fetchCredits()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setMarkingPaidId(null)
    }
  }

  const handleDelete = async (credit: CustomerCredit) => {
    if (!confirm(`¿Eliminar el fiado de "${credit.customer_name}"? Se revertirán los abonos que hayan afectado alguna cuenta.`)) return
    try {
      const res = await fetch(`/api/customer-credits/${credit.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al eliminar el fiado')
      }
      toast({ title: 'Fiado eliminado' })
      await fetchCredits()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Apartados y Abonos de Clientes</h1>
          <p className="text-muted-foreground">Clientes deudores/apartados, con abonos parciales</p>
        </div>
        <Button className="rounded-xl" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo fiado
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Total pendiente por cobrar</p>
        <p className="text-2xl font-bold">{formatPrice(totalPending)}</p>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Nuevo fiado / apartado</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="Nombre del cliente" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="rounded-lg" />
            <Input placeholder="Cédula" value={form.customer_id_number} onChange={(e) => setForm({ ...form, customer_id_number: e.target.value })} className="rounded-lg" />
            <Input placeholder="Teléfono" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="rounded-lg" />
            <Input placeholder="Descripción (qué se apartó/fio)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg sm:col-span-2" />
            <MoneyInput placeholder="Monto total" value={form.total_amount} onChange={(v) => setForm({ ...form, total_amount: v })} className="rounded-lg" />
            <MoneyInput placeholder="Abono inicial (opcional)" value={form.initial_payment} onChange={(v) => setForm({ ...form, initial_payment: v })} className="rounded-lg" />
            <select
              value={form.initial_payment_account_id}
              onChange={(e) => setForm({ ...form, initial_payment_account_id: e.target.value })}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="">Cuenta del abono inicial...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <Input placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-lg" />
          </div>
          <Button className="mt-4 rounded-lg" onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar fiado
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
            {s === 'pending' ? 'Pendientes' : s === 'paid' ? 'Pagados' : 'Todos'}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : credits.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8" />
          No hay fiados registrados
        </div>
      ) : (
        <div className="space-y-3">
          {credits.map((credit) => {
            const paid = paidSoFar(credit)
            const remaining = credit.total_amount_cents - paid
            const isExpanded = expanded === credit.id
            return (
              <div key={credit.id} className="rounded-xl border bg-card">
                <div
                  className="flex cursor-pointer items-center justify-between p-4"
                  onClick={() => setExpanded(isExpanded ? null : credit.id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <p className="font-medium">{credit.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{credit.description || 'Sin descripción'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {credit.status === 'pending' && (
                      <Badge variant="outline" className={ageBadgeClass(daysOld(credit.created_at))}>
                        {daysOld(credit.created_at)}d
                      </Badge>
                    )}
                    <Badge variant="outline" className={credit.status === 'paid' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}>
                      {credit.status === 'paid' ? 'Pagado' : 'Pendiente'}
                    </Badge>
                    <p className="font-bold">{formatPrice(credit.total_amount_cents)}</p>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-4 border-t p-4">
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      {credit.customer_id_number && <p><span className="text-muted-foreground">Cédula:</span> {credit.customer_id_number}</p>}
                      {credit.customer_phone && <p><span className="text-muted-foreground">Teléfono:</span> {credit.customer_phone}</p>}
                      <p><span className="text-muted-foreground">Saldo:</span> {formatPrice(remaining)}</p>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Monto total:</span>
                      {editingAmountId === credit.id ? (
                        <>
                          <Input
                            type="number"
                            min="0"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="h-7 w-28 rounded-lg text-xs"
                          />
                          <Button size="sm" className="h-7 rounded-lg" onClick={() => handleSaveAmount(credit.id)} disabled={savingAmount}>
                            {savingAmount ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => setEditingAmountId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="font-medium">{formatPrice(credit.total_amount_cents)}</span>
                          <button
                            onClick={() => { setEditingAmountId(credit.id); setEditAmount((credit.total_amount_cents / 100).toString()) }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                    {credit.notes && <p className="text-sm text-muted-foreground">{credit.notes}</p>}

                    {credit.payments.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium">Abonos</p>
                        <div className="space-y-1">
                          {credit.payments.map((p) => (
                            <div key={p.id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
                              <span>{formatDate(p.paid_at)} {p.notes ? `· ${p.notes}` : ''}</span>
                              <span className="font-medium">{formatPrice(p.amount_cents)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {credit.status === 'pending' && (
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
                        <Button size="sm" className="h-8 rounded-lg" onClick={() => handlePay(credit)} disabled={payingId === credit.id}>
                          {payingId === credit.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
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
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-amber-600"
                            onClick={() => handleMarkPaid(credit)}
                            disabled={markingPaidId === credit.id}
                          >
                            {markingPaidId === credit.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Marcar como pagado (condonar saldo)
                          </Button>
                        )}
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => handleDelete(credit)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Eliminar fiado
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
