'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Wallet,
  ArrowLeftRight,
  Calendar,
  Loader2,
  Plus,
  Minus,
  History,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronRight,
  Trash2,
  HandCoins,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { bogotaDayRange, bogotaToISO } from '@/lib/bogota-time'

interface Account {
  id: string
  name: string
  payment_method: string
  balance_cents: number
  color: string | null
  active: boolean
  sort_order: number
}

interface AccountMovement {
  id: string
  account_id: string
  type: string
  amount_cents: number
  description: string | null
  created_at: string
  account: { id: string; name: string; color: string | null } | null
}

interface AccountReceivable {
  id: string
  account_id: string
  debtor_name: string
  amount_cents: number
  debt_date: string
  notes: string | null
}

interface AccountClosure {
  id: string
  year: number
  month: number
  snapshot: { accounts: Account[]; taken_at: string }
  notes: string | null
  created_at: string
}

const movementTypeLabels: Record<string, string> = {
  sale: 'Venta',
  manual_adjustment: 'Ajuste manual',
  transfer_out: 'Transferencia enviada',
  transfer_in: 'Transferencia recibida',
  operating_expense: 'Gasto operativo',
  expense_reversal: 'Reversión de gasto',
  invoice_payment: 'Pago de factura',
  credit_payment_reversal: 'Reversión de abono',
  sale_reversal: 'Reversión de venta',
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function CuentasPage() {
  const [tab, setTab] = useState<'resumen' | 'movimientos' | 'cierres' | 'por-cobrar'>('resumen')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [movements, setMovements] = useState<AccountMovement[]>([])
  const [closures, setClosures] = useState<AccountClosure[]>([])
  const [receivables, setReceivables] = useState<AccountReceivable[]>([])
  const [loading, setLoading] = useState(true)
  // Margen real de SisteCrédito (ver Configuración POS): la venta se
  // registra por el valor base, pero SisteCrédito paga base+margen (nos
  // cobran 4% de comisión pero le trasladamos al cliente un recargo mayor,
  // hoy 6% — la diferencia es ganancia real que no aparece en la venta).
  const [sistecreditoMarginPct, setSistecreditoMarginPct] = useState(0)

  // "Por Cobrar": deudas ligadas a una cuenta (ej. fiado prometido en
  // Nequi, lo que debe SisteCrédito) -- puramente informativo, nunca toca
  // accounts.balance_cents. Un solo acordeón expandido a la vez.
  const [expandedReceivableAccount, setExpandedReceivableAccount] = useState<string | null>(null)
  const [newReceivable, setNewReceivable] = useState({ debtor_name: '', amount: '', debt_date: '', notes: '' })
  const [savingReceivable, setSavingReceivable] = useState(false)

  // Filtros de la pestaña Movimientos (la API ya los soportaba, faltaba el
  // control en la UI — ver docs/UNIFICACION_YJBMOTOCOM.md sección 13.4, ítem 4.4.8).
  const [movementAccountFilter, setMovementAccountFilter] = useState('')
  const [movementFrom, setMovementFrom] = useState('')
  const [movementTo, setMovementTo] = useState('')

  // Ajuste manual
  const [adjustAccount, setAdjustAccount] = useState('')
  const [adjustDirection, setAdjustDirection] = useState<'in' | 'out'>('in')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [savingAdjust, setSavingAdjust] = useState(false)

  // Transferencia
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNote, setTransferNote] = useState('')
  const [savingTransfer, setSavingTransfer] = useState(false)

  // Cierre mensual
  const [closingMonth, setClosingMonth] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'
  // Admin de solo lectura: ve saldos/movimientos/cierres igual que un
  // admin real, pero no puede hacer un cierre mensual nuevo (el backend
  // de todas formas rechaza esa escritura con 403).
  const isReadOnlyAdmin = userProfile?.role === 'admin_readonly'
  const canView = isAdmin || isReadOnlyAdmin

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const fetchAccounts = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/accounts', { headers: authHeaders() })
      if (!res.ok) throw new Error('Error fetching accounts')
      const { data } = await res.json()
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }, [session?.access_token, authHeaders])

  const fetchMovements = useCallback(async () => {
    // Admin de solo lectura: sin acceso a Movimientos (la API también lo
    // rechaza, ver /api/account-movements) — se evita la llamada para no
    // dejar un 403 innecesario en la consola.
    if (!session?.access_token || isReadOnlyAdmin) return
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (movementAccountFilter) params.set('account_id', movementAccountFilter)
      // Límites explícitos en hora de Bogotá (no naive `${date}T00:00:00`,
      // que Postgres interpreta en UTC y deja la ventana corrida 5 horas).
      if (movementFrom) params.set('from', bogotaToISO(movementFrom, '00:00'))
      if (movementTo) params.set('to', bogotaDayRange(movementTo).to)
      const res = await fetch(`/api/account-movements?${params.toString()}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Error fetching movements')
      const { data } = await res.json()
      setMovements(data || [])
    } catch (error) {
      console.error('Error fetching account movements:', error)
    }
  }, [session?.access_token, isReadOnlyAdmin, authHeaders, movementAccountFilter, movementFrom, movementTo])

  const fetchClosures = useCallback(async () => {
    if (!session?.access_token || !canView) return
    try {
      const res = await fetch('/api/account-closures', { headers: authHeaders() })
      if (!res.ok) throw new Error('Error fetching closures')
      const { data } = await res.json()
      setClosures(data || [])
    } catch (error) {
      console.error('Error fetching account closures:', error)
    }
  }, [session?.access_token, authHeaders, canView])

  const fetchReceivables = useCallback(async () => {
    if (!session?.access_token || !canView) return
    try {
      const res = await fetch('/api/account-receivables', { headers: authHeaders() })
      if (!res.ok) throw new Error('Error fetching receivables')
      const { data } = await res.json()
      setReceivables(data || [])
    } catch (error) {
      console.error('Error fetching account receivables:', error)
    }
  }, [session?.access_token, authHeaders, canView])

  const fetchSistecreditoMargin = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/settings', { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setSistecreditoMarginPct(Number(data?.sistecredito_margin_pct ?? 0))
    } catch (error) {
      console.error('Error fetching sistecredito margin:', error)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchAccounts(), fetchMovements(), fetchClosures(), fetchReceivables(), fetchSistecreditoMargin()])
      setLoading(false)
    }
    load()
  }, [fetchAccounts, fetchMovements, fetchClosures, fetchReceivables, fetchSistecreditoMargin])

  // El "valor esperado" real de una cuenta por cobrar: para SisteCrédito,
  // lo que en verdad va a llegar es el valor base + el margen configurado
  // (ver arriba) — para cualquier otra cuenta, el valor base tal cual.
  const receivableExpectedCents = useCallback(
    (accountPaymentMethod: string, amountCents: number) =>
      accountPaymentMethod === 'sistecredito'
        ? Math.round(amountCents * (1 + sistecreditoMarginPct / 100))
        : amountCents,
    [sistecreditoMarginPct]
  )

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  // Para debt_date (columna DATE simple, sin hora) -- mismo truco que ya
  // usa Facturas (admin/facturas/page.tsx) para evitar que Date lo
  // interprete en UTC y corra la fecha un día hacia atrás/adelante.
  const formatDebtDate = (dateString: string) =>
    new Date(dateString + 'T00:00:00').toLocaleDateString('es-CO', {
      year: 'numeric', month: 'short', day: 'numeric',
    })

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance_cents, 0)
  const accountById = (id: string) => accounts.find((a) => a.id === id)
  const totalReceivables = receivables.reduce(
    (sum, r) => sum + receivableExpectedCents(accountById(r.account_id)?.payment_method || '', r.amount_cents),
    0
  )

  const handleManualAdjustment = async () => {
    if (!session?.access_token || !adjustAccount || !adjustAmount) return
    const amount = Math.round(parseFloat(adjustAmount) * 100)
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' })
      return
    }

    try {
      setSavingAdjust(true)
      const res = await fetch('/api/account-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          account_id: adjustAccount,
          amount_cents: adjustDirection === 'in' ? amount : -amount,
          description: adjustNote || 'Ajuste manual de saldo',
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al ajustar la cuenta')
      }
      toast({ title: 'Cuenta ajustada' })
      setAdjustAmount('')
      setAdjustNote('')
      await Promise.all([fetchAccounts(), fetchMovements()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingAdjust(false)
    }
  }

  const handleTransfer = async () => {
    if (!session?.access_token || !fromAccount || !toAccount || !transferAmount) return
    if (fromAccount === toAccount) {
      toast({ title: 'Error', description: 'Elige dos cuentas distintas', variant: 'destructive' })
      return
    }
    const amount = Math.round(parseFloat(transferAmount) * 100)
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' })
      return
    }

    try {
      setSavingTransfer(true)
      const res = await fetch('/api/account-movements/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          from_account_id: fromAccount,
          to_account_id: toAccount,
          amount_cents: amount,
          description: transferNote || 'Transferencia entre cuentas',
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al transferir')
      }
      toast({ title: 'Transferencia realizada' })
      setTransferAmount('')
      setTransferNote('')
      await Promise.all([fetchAccounts(), fetchMovements()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingTransfer(false)
    }
  }

  const handleCloseMonth = async () => {
    if (!session?.access_token) return
    try {
      setClosingMonth(true)
      const res = await fetch('/api/account-closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ created_by: userProfile?.id }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al hacer el cierre')
      }
      toast({ title: 'Cierre del mes registrado' })
      await fetchClosures()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setClosingMonth(false)
    }
  }

  const handleAddReceivable = async (accountId: string) => {
    if (!session?.access_token || !newReceivable.debtor_name.trim() || !newReceivable.amount) return
    const amount = Math.round(parseFloat(newReceivable.amount) * 100)
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' })
      return
    }
    try {
      setSavingReceivable(true)
      const res = await fetch('/api/account-receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          account_id: accountId,
          debtor_name: newReceivable.debtor_name.trim(),
          amount_cents: amount,
          debt_date: newReceivable.debt_date || undefined,
          notes: newReceivable.notes || null,
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar la deuda')
      }
      toast({ title: 'Deuda registrada' })
      setNewReceivable({ debtor_name: '', amount: '', debt_date: '', notes: '' })
      await fetchReceivables()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingReceivable(false)
    }
  }

  const handleDeleteReceivable = async (id: string) => {
    if (!confirm('¿Ya te pagaron esta deuda? Se elimina de "Por Cobrar" — esto NO mueve el saldo de la cuenta, si el pago ya entró regístralo aparte (venta o ajuste manual).')) return
    try {
      const res = await fetch(`/api/account-receivables/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al eliminar la deuda')
      }
      toast({ title: 'Deuda eliminada' })
      await fetchReceivables()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Cuentas es un módulo 100% de Admin, igual que el software local (el
  // vendedor no ve ni el botón de navegación de este módulo). El admin de
  // solo lectura sí entra (ve todo), pero las acciones de escritura de
  // más abajo se quedan detrás de `isAdmin` a secas.
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Cuentas</h1>
        <p className="text-muted-foreground">
          Saldo por medio de pago, movimientos y cierre mensual
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'resumen', label: 'Resumen', icon: Wallet },
          // Admin de solo lectura: sin acceso a Movimientos (a pedido del
          // usuario) — se oculta la pestaña, no solo el contenido, mismo
          // criterio que el menú lateral con las secciones adminOnly.
          ...(isReadOnlyAdmin ? [] : [{ id: 'movimientos', label: 'Movimientos', icon: History }]),
          { id: 'por-cobrar', label: 'Por Cobrar', icon: HandCoins },
          { id: 'cierres', label: 'Cierres', icon: Calendar },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-cyan-500 text-cyan-500'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === 'resumen' && (
            <div className="space-y-6">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo total (real)</p>
                    <p className="text-3xl font-bold">{formatPrice(totalBalance)}</p>
                  </div>
                  {totalReceivables > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Total esperado (si nos pagan todo lo pendiente)</p>
                      <p className="text-2xl font-bold text-amber-600">{formatPrice(totalBalance + totalReceivables)}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map((account) => {
                  const accountReceivables = receivables.filter((r) => r.account_id === account.id)
                  const pendingBaseCents = accountReceivables.reduce((sum, r) => sum + r.amount_cents, 0)
                  const pendingExpectedCents = accountReceivables.reduce(
                    (sum, r) => sum + receivableExpectedCents(account.payment_method, r.amount_cents),
                    0
                  )
                  const hasMargin = account.payment_method === 'sistecredito' && sistecreditoMarginPct > 0 && pendingBaseCents > 0
                  return (
                    <div key={account.id} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: account.color || '#94a3b8' }}
                        />
                        <p className="font-medium">{account.name}</p>
                      </div>
                      <p className="mt-2 text-2xl font-bold">{formatPrice(account.balance_cents)}</p>
                      {pendingBaseCents > 0 && (
                        <p className="mt-1 text-xs text-amber-600">
                          + {formatPrice(pendingBaseCents)} por cobrar
                          {hasMargin && ` (+${sistecreditoMarginPct}% margen SisteCrédito = ${formatPrice(pendingExpectedCents)})`}
                          {' '}→ total esperado {formatPrice(account.balance_cents + pendingExpectedCents)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {isAdmin && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Ajuste manual */}
                <div className="rounded-xl border bg-card p-6">
                  <h2 className="mb-4 text-lg font-semibold">Ajuste manual de saldo</h2>
                  <div className="space-y-3">
                    <select
                      value={adjustAccount}
                      onChange={(e) => setAdjustAccount(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una cuenta...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={adjustDirection === 'in' ? 'default' : 'outline'}
                        className="flex-1 rounded-lg"
                        onClick={() => setAdjustDirection('in')}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Entrada
                      </Button>
                      <Button
                        type="button"
                        variant={adjustDirection === 'out' ? 'default' : 'outline'}
                        className="flex-1 rounded-lg"
                        onClick={() => setAdjustDirection('out')}
                      >
                        <Minus className="mr-1 h-4 w-4" /> Salida
                      </Button>
                    </div>
                    <MoneyInput
                      placeholder="Monto"
                      value={adjustAmount}
                      onChange={setAdjustAmount}
                      className="rounded-lg"
                    />
                    <Input
                      placeholder="Nota (opcional)"
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      className="rounded-lg"
                    />
                    <Button
                      className="w-full rounded-lg"
                      onClick={handleManualAdjustment}
                      disabled={savingAdjust || !adjustAccount || !adjustAmount}
                    >
                      {savingAdjust && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Registrar ajuste
                    </Button>
                  </div>
                </div>

                {/* Transferencia */}
                <div className="rounded-xl border bg-card p-6">
                  <h2 className="mb-4 text-lg font-semibold">Transferir entre cuentas</h2>
                  <div className="space-y-3">
                    <select
                      value={fromAccount}
                      onChange={(e) => setFromAccount(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Cuenta origen...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({formatPrice(a.balance_cents)})</option>
                      ))}
                    </select>
                    <div className="flex items-center justify-center">
                      <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <select
                      value={toAccount}
                      onChange={(e) => setToAccount(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Cuenta destino...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <MoneyInput
                      placeholder="Monto"
                      value={transferAmount}
                      onChange={setTransferAmount}
                      className="rounded-lg"
                    />
                    <Input
                      placeholder="Nota (opcional)"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      className="rounded-lg"
                    />
                    <Button
                      className="w-full rounded-lg"
                      onClick={handleTransfer}
                      disabled={savingTransfer || !fromAccount || !toAccount || !transferAmount}
                    >
                      {savingTransfer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Transferir
                    </Button>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}

          {tab === 'movimientos' && !isReadOnlyAdmin && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
                <select
                  value={movementAccountFilter}
                  onChange={(e) => setMovementAccountFilter(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas las cuentas</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <Input type="date" value={movementFrom} onChange={(e) => setMovementFrom(e.target.value)} className="w-auto rounded-lg" />
                <span className="text-sm text-muted-foreground">a</span>
                <Input type="date" value={movementTo} onChange={(e) => setMovementTo(e.target.value)} className="w-auto rounded-lg" />
                {(movementAccountFilter || movementFrom || movementTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => { setMovementAccountFilter(''); setMovementFrom(''); setMovementTo('') }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            <div className="rounded-xl border bg-card">
              {movements.length === 0 ? (
                <p className="p-8 text-center text-muted-foreground">
                  No hay movimientos registrados
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Cuenta</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Descripción</th>
                        <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Monto</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: m.account?.color || '#94a3b8' }}
                              />
                              {m.account?.name || 'Cuenta eliminada'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline">{movementTypeLabels[m.type] || m.type}</Badge>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {m.description || '-'}
                          </td>
                          <td
                            className={cn(
                              'px-6 py-4 text-right font-bold',
                              m.amount_cents >= 0 ? 'text-green-500' : 'text-red-500'
                            )}
                          >
                            {m.amount_cents >= 0 ? '+' : ''}
                            {formatPrice(m.amount_cents)}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {formatDate(m.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          )}

          {tab === 'por-cobrar' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Dinero que nos deben, ligado a un medio de pago (fiados, SisteCrédito, etc.) — es solo un registro
                informativo, no afecta el saldo real de la cuenta. Cuando de verdad paguen, registra ese ingreso
                aparte (una venta o un ajuste manual) y luego elimina la deuda de aquí.
              </p>
              {accounts.map((account) => {
                const accountReceivables = receivables.filter((r) => r.account_id === account.id)
                const hasMargin = account.payment_method === 'sistecredito' && sistecreditoMarginPct > 0
                const pendingBaseCents = accountReceivables.reduce((sum, r) => sum + r.amount_cents, 0)
                const pendingExpectedCents = accountReceivables.reduce(
                  (sum, r) => sum + receivableExpectedCents(account.payment_method, r.amount_cents),
                  0
                )
                const isExpanded = expandedReceivableAccount === account.id
                return (
                  <div key={account.id} className="rounded-xl border bg-card">
                    <div
                      className="flex cursor-pointer items-center justify-between p-4"
                      onClick={() => {
                        setExpandedReceivableAccount(isExpanded ? null : account.id)
                        setNewReceivable({ debtor_name: '', amount: '', debt_date: '', notes: '' })
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: account.color || '#94a3b8' }}
                        />
                        <p className="font-medium">{account.name}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn('font-bold', pendingExpectedCents > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                          {pendingExpectedCents > 0 ? formatPrice(pendingExpectedCents) : 'Sin deudas'}
                        </p>
                        {hasMargin && pendingBaseCents > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {formatPrice(pendingBaseCents)} + {sistecreditoMarginPct}%
                          </p>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="space-y-3 border-t p-4">
                        {hasMargin && accountReceivables.length > 0 && (
                          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                            SisteCrédito nos retiene el pago y cobra su propia comisión, pero le trasladamos al
                            cliente un recargo mayor — por eso cada deuda se muestra con +{sistecreditoMarginPct}% de
                            margen real, que es lo que en verdad esperamos recibir.
                          </p>
                        )}
                        {accountReceivables.length > 0 && (
                          <div className="space-y-1">
                            {accountReceivables.map((r) => {
                              const expected = receivableExpectedCents(account.payment_method, r.amount_cents)
                              return (
                                <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                  <span>
                                    {formatDebtDate(r.debt_date)} · <span className="font-medium">{r.debtor_name}</span>
                                    {r.notes ? ` · ${r.notes}` : ''}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    {hasMargin ? (
                                      <span className="text-right">
                                        <span className="block font-medium">{formatPrice(expected)}</span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          {formatPrice(r.amount_cents)} + {sistecreditoMarginPct}%
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="font-medium">{formatPrice(r.amount_cents)}</span>
                                    )}
                                    {isAdmin && (
                                      <button
                                        onClick={() => handleDeleteReceivable(r.id)}
                                        title="Ya pagaron / eliminar"
                                        className="text-red-500 hover:text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                            {hasMargin && (
                              <div className="flex items-center justify-between rounded-lg border-t px-3 pt-2 text-sm font-bold">
                                <span>Total esperado (con margen)</span>
                                <span className="text-amber-600">{formatPrice(pendingExpectedCents)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {isAdmin && (
                          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                            <div>
                              <label className="text-xs text-muted-foreground">Quién debe</label>
                              <Input
                                placeholder="Nombre"
                                value={newReceivable.debtor_name}
                                onChange={(e) => setNewReceivable({ ...newReceivable, debtor_name: e.target.value })}
                                className="h-8 w-40 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Monto</label>
                              <MoneyInput
                                placeholder="Monto"
                                value={newReceivable.amount}
                                onChange={(v) => setNewReceivable({ ...newReceivable, amount: v })}
                                className="h-8 w-28 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Fecha</label>
                              <Input
                                type="date"
                                value={newReceivable.debt_date}
                                onChange={(e) => setNewReceivable({ ...newReceivable, debt_date: e.target.value })}
                                className="h-8 rounded-lg text-xs"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-xs text-muted-foreground">Notas (opcional)</label>
                              <Input
                                placeholder="Notas"
                                value={newReceivable.notes}
                                onChange={(e) => setNewReceivable({ ...newReceivable, notes: e.target.value })}
                                className="h-8 rounded-lg text-xs"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => handleAddReceivable(account.id)}
                              disabled={savingReceivable || !newReceivable.debtor_name.trim() || !newReceivable.amount}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Agregar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'cierres' && (
            <div className="space-y-6">
              {isAdmin ? (
                <div className="rounded-xl border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Cierre del mes actual</h2>
                      <p className="text-sm text-muted-foreground">
                        Guarda una foto del saldo de todas las cuentas para el mes en curso.
                        Si ya existe un cierre para este mes, se sobreescribe.
                      </p>
                    </div>
                    <Button onClick={handleCloseMonth} disabled={closingMonth} className="rounded-lg">
                      {closingMonth ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Hacer cierre
                    </Button>
                  </div>
                </div>
              ) : isReadOnlyAdmin ? (
                <p className="text-sm text-muted-foreground">
                  Los cierres mensuales son de solo lectura para tu perfil.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Los cierres mensuales solo están disponibles para administradores.
                </p>
              )}

              {canView && (
                <div className="space-y-4">
                  {closures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aún no hay cierres registrados.</p>
                  ) : (
                    closures.map((closure) => {
                      const total = closure.snapshot.accounts.reduce(
                        (sum, a) => sum + a.balance_cents,
                        0
                      )
                      return (
                        <div key={closure.id} className="rounded-xl border bg-card p-4">
                          <div className="flex items-center justify-between">
                            <p className="font-medium">
                              {monthNames[closure.month - 1]} {closure.year}
                            </p>
                            <p className="text-lg font-bold">{formatPrice(total)}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {closure.snapshot.accounts.map((a) => (
                              <Badge key={a.id} variant="outline">
                                {a.name}: {formatPrice(a.balance_cents)}
                              </Badge>
                            ))}
                          </div>
                          {closure.notes && (
                            <p className="mt-2 text-sm text-muted-foreground">{closure.notes}</p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
