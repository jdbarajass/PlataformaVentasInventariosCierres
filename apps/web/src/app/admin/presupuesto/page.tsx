'use client'

import { useState, useEffect, useCallback } from 'react'
import { PiggyBank, Plus, Loader2, Trash2, Receipt, Copy, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

interface Budget {
  id: string
  year: number
  month: number
  category: string
  budgeted_amount_cents: number
}

interface Expense {
  id: string
  date: string
  description: string
  amount_cents: number
  category: string
  account_id: string | null
}

interface Account {
  id: string
  name: string
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function PresupuestoPage() {
  const now = new Date()
  const [tab, setTab] = useState<'presupuesto' | 'gastos'>('presupuesto')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Gastos fijos mensuales (Arriendo/Sueldo/Servicios/Otros de Comisiones y
  // Gastos Fijos) — panel de contexto que el local sí muestra junto al
  // presupuesto variable (_panel_gastos_fijos en ui/presupuesto_panel.py),
  // para saber cuánto es el "piso" fijo del mes además de lo presupuestado
  // por categoría aquí.
  const [fixedExpenses, setFixedExpenses] = useState<{ arriendo_cents: number; sueldo_cents: number; servicios_cents: number; otros_gastos_cents: number } | null>(null)

  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)
  const [copyingPrevMonth, setCopyingPrevMonth] = useState(false)

  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: '', account_id: '' })
  const [savingExpense, setSavingExpense] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  // operating_expenses.date es DATE (sin hora/zona horaria) — se construyen
  // los límites directamente como strings, sin pasar por Date/toISOString,
  // que sí dependen de la zona horaria del dispositivo.
  const monthRange = useCallback(() => {
    const lastDay = new Date(year, month, 0).getDate()
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { from, to }
  }, [year, month])

  const fetchBudgets = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/monthly-budgets?year=${year}&month=${month}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setBudgets(data || [])
    } catch (error) {
      console.error('Error fetching budgets:', error)
    }
  }, [session?.access_token, authHeaders, year, month])

  const fetchExpenses = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const { from, to } = monthRange()
      const res = await fetch(`/api/operating-expenses?from=${from}&to=${to}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setExpenses(data || [])
    } catch (error) {
      console.error('Error fetching expenses:', error)
    }
  }, [session?.access_token, authHeaders, monthRange])

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

  const fetchFixedExpenses = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/settings', { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      if (data?.fixed_monthly_expenses) setFixedExpenses(data.fixed_monthly_expenses)
    } catch (error) {
      console.error('Error fetching fixed expenses:', error)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchBudgets(), fetchExpenses(), fetchAccounts(), fetchFixedExpenses()])
      setLoading(false)
    }
    load()
  }, [fetchBudgets, fetchExpenses, fetchAccounts, fetchFixedExpenses])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const formatDate = (dateString: string) =>
    new Date(dateString + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })

  const spentByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount_cents
    return acc
  }, {})

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgeted_amount_cents, 0)
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount_cents, 0)

  const handleSaveBudget = async () => {
    if (!newCategory.trim() || !newAmount) {
      toast({ title: 'Error', description: 'Categoría y monto son obligatorios', variant: 'destructive' })
      return
    }
    try {
      setSavingBudget(true)
      const res = await fetch('/api/monthly-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          year, month, category: newCategory,
          budgeted_amount_cents: Math.round(parseFloat(newAmount) * 100),
        }),
      })
      if (!res.ok) throw new Error('Error al guardar el presupuesto')
      toast({ title: 'Presupuesto guardado' })
      setNewCategory('')
      setNewAmount('')
      await fetchBudgets()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingBudget(false)
    }
  }

  const handleCopyPrevMonth = async () => {
    if (!session?.access_token) return
    try {
      setCopyingPrevMonth(true)
      const prevDate = new Date(year, month - 2, 1)
      const prevYear = prevDate.getFullYear()
      const prevMonth = prevDate.getMonth() + 1

      const res = await fetch(`/api/monthly-budgets?year=${prevYear}&month=${prevMonth}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Error al leer el presupuesto del mes anterior')
      const { data: prevBudgets } = await res.json()

      if (!prevBudgets || prevBudgets.length === 0) {
        toast({ title: 'Sin datos', description: `${monthNames[prevMonth - 1]} ${prevYear} no tiene presupuesto configurado` })
        return
      }

      let copied = 0
      for (const b of prevBudgets as Budget[]) {
        const copyRes = await fetch('/api/monthly-budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ year, month, category: b.category, budgeted_amount_cents: b.budgeted_amount_cents }),
        })
        if (copyRes.ok) copied++
      }
      toast({ title: 'Presupuesto copiado', description: `${copied} categoría(s) copiadas de ${monthNames[prevMonth - 1]} ${prevYear}` })
      await fetchBudgets()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setCopyingPrevMonth(false)
    }
  }

  const handleAddExpense = async () => {
    const amount = Math.round((parseFloat(expenseForm.amount) || 0) * 100)
    if (!expenseForm.description.trim() || !expenseForm.category.trim() || amount <= 0) {
      toast({ title: 'Error', description: 'Descripción, categoría y monto son obligatorios', variant: 'destructive' })
      return
    }
    try {
      setSavingExpense(true)
      const res = await fetch('/api/operating-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          description: expenseForm.description,
          amount_cents: amount,
          category: expenseForm.category,
          account_id: expenseForm.account_id || null,
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar el gasto')
      }
      toast({ title: 'Gasto registrado' })
      setExpenseForm({ description: '', amount: '', category: '', account_id: '' })
      await Promise.all([fetchExpenses(), fetchAccounts()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingExpense(false)
    }
  }

  const handleDeleteExpense = async (expense: Expense) => {
    if (!confirm(`¿Eliminar el gasto "${expense.description}"?`)) return
    try {
      const res = await fetch(`/api/operating-expenses/${expense.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Error al eliminar el gasto')
      toast({ title: 'Gasto eliminado' })
      await Promise.all([fetchExpenses(), fetchAccounts()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Presupuesto Mensual</h1>
          <p className="text-muted-foreground">Comparativo de presupuesto vs. gasto real por categoría</p>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="rounded-lg border bg-background px-3 py-2 text-sm">
            {monthNames.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} className="w-24 rounded-lg" />
          {tab === 'presupuesto' && (
            <Button variant="outline" className="rounded-lg" onClick={handleCopyPrevMonth} disabled={copyingPrevMonth}>
              {copyingPrevMonth ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar mes anterior
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {[
          { id: 'presupuesto', label: 'Presupuesto', icon: PiggyBank },
          { id: 'gastos', label: 'Gastos', icon: Receipt },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === t.id ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-muted-foreground hover:text-foreground'
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
      ) : tab === 'presupuesto' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Presupuestado</p>
              <p className="text-2xl font-bold">{formatPrice(totalBudgeted)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Gastado (todas las categorías)</p>
              <p className="text-2xl font-bold">{formatPrice(totalSpent)}</p>
            </div>
          </div>

          {fixedExpenses && (
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                Gastos fijos mensuales (contexto — no forman parte del presupuesto por categoría de arriba)
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div><span className="text-muted-foreground">Arriendo:</span> {formatPrice(fixedExpenses.arriendo_cents)}</div>
                <div><span className="text-muted-foreground">Sueldo:</span> {formatPrice(fixedExpenses.sueldo_cents)}</div>
                <div><span className="text-muted-foreground">Servicios:</span> {formatPrice(fixedExpenses.servicios_cents)}</div>
                <div><span className="text-muted-foreground">Otros:</span> {formatPrice(fixedExpenses.otros_gastos_cents)}</div>
              </div>
              <p className="mt-2 border-t pt-2 text-sm font-semibold">
                Total fijo del mes: {formatPrice(
                  fixedExpenses.arriendo_cents + fixedExpenses.sueldo_cents + fixedExpenses.servicios_cents + fixedExpenses.otros_gastos_cents
                )}
              </p>
            </div>
          )}

          <div className="rounded-xl border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Agregar/actualizar categoría</h2>
            <div className="flex flex-wrap gap-2">
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="">Categoría...</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <MoneyInput placeholder="Monto presupuestado" value={newAmount} onChange={setNewAmount} className="rounded-lg" />
              <Button className="rounded-lg" onClick={handleSaveBudget} disabled={savingBudget}>
                {savingBudget ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </div>
          </div>

          {(() => {
            const atRisk = budgets.filter((b) => {
              const spent = spentByCategory[b.category] || 0
              return b.budgeted_amount_cents > 0 && spent / b.budgeted_amount_cents >= 0.8
            })
            if (atRisk.length === 0) return null
            return (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {atRisk.length} categoría(s) al 80% o más del presupuesto:
                  </p>
                  <p>{atRisk.map((b) => b.category).join(', ')}</p>
                </div>
              </div>
            )
          })()}

          {budgets.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              <PiggyBank className="mx-auto mb-2 h-8 w-8" />
              No hay presupuesto configurado para {monthNames[month - 1]} {year}
            </div>
          ) : (
            <div className="space-y-2">
              {budgets.map((b) => {
                const spent = spentByCategory[b.category] || 0
                const rawPct = b.budgeted_amount_cents > 0 ? (spent / b.budgeted_amount_cents) * 100 : 0
                const pct = Math.min(rawPct, 100)
                const over = spent > b.budgeted_amount_cents
                const nearLimit = !over && rawPct >= 80
                const diff = b.budgeted_amount_cents - spent
                return (
                  <div key={b.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{b.category}</p>
                      <p className={cn('text-sm font-medium', over ? 'text-red-500' : nearLimit && 'text-amber-500')}>
                        {formatPrice(spent)} / {formatPrice(b.budgeted_amount_cents)} ({rawPct.toFixed(0)}%)
                      </p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', over ? 'bg-red-500' : nearLimit ? 'bg-amber-500' : 'bg-cyan-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className={cn('mt-1 text-xs text-muted-foreground', over && 'text-red-500')}>
                      {over ? `Superado por ${formatPrice(-diff)}` : `Diferencia: ${formatPrice(diff)}`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Nuevo gasto operativo</h2>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Descripción" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="rounded-lg" />
              <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="">Categoría...</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <MoneyInput placeholder="Monto" value={expenseForm.amount} onChange={(v) => setExpenseForm({ ...expenseForm, amount: v })} className="rounded-lg" />
              <select
                value={expenseForm.account_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, account_id: e.target.value })}
                className="rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="">Sin cuenta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <Button className="rounded-lg" onClick={handleAddExpense} disabled={savingExpense}>
                {savingExpense ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Registrar
              </Button>
            </div>
          </div>

          {expenses.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              <Receipt className="mx-auto mb-2 h-8 w-8" />
              No hay gastos registrados en {monthNames[month - 1]} {year}
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
                  <div>
                    <p className="font-medium">{e.description}</p>
                    <p className="text-sm text-muted-foreground">{e.category} · {formatDate(e.date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold">{formatPrice(e.amount_cents)}</p>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteExpense(e)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
