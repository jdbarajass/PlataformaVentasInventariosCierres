'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Pencil, Trash2, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/use-toast'
import { useLatestRequest } from '@/lib/use-latest-request'
import { bogotaDateStr } from '@/lib/bogota-time'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'
import { EXPENSE_CLASS_LABEL, expenseCategoryNote, type FixedMonthlyExpenses } from '@/lib/finance/expense-classes'
import { filterExpenseRows, type ExpenseFilters, type ExpenseRow, type ExpensesMonth, type FixedStatus } from '@/lib/finance/expenses-month'
import { formatPrice, MONTH_NAMES } from '@/lib/finance/format'
import { ExportButtons } from '@/components/finanzas/export-buttons'
import { expensesMonthReport } from '@/lib/finance/report-builders'
import { BRAND } from '@/config/brand'

// Finanzas → Gastos: los gastos del mes con filtros, totales y gastos fijos
// (como Cuentas → Gastos de KOAJ). Cálculo en lib/finance/expenses-month.ts.
// Registrar / editar / borrar usa /api/operating-expenses (mismas reglas de
// saldo y auditoría que Ventas del Día).

interface Account { id: string; name: string; active: boolean; balance_cents: number }
interface ExpensesResponse extends ExpensesMonth {
  year: number
  month: number
  fromDate: string
  toDate: string
  daysElapsed: number
  daysInMonth: number
  fixedConfig: FixedMonthlyExpenses | null
  accounts: Account[]
}

const STATUS: Record<FixedStatus, { label: string; cls: string }> = {
  pagado: { label: 'Pagado', cls: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  parcial: { label: 'Parcial', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  pendiente: { label: 'Pendiente', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  sin_valor: { label: 'Sin valor configurado', cls: 'bg-muted text-muted-foreground' },
  sin_seguimiento: { label: 'Sin categoría para revisar', cls: 'bg-muted text-muted-foreground' },
}
const NO_FILTERS: ExpenseFilters = { search: '', account: '', category: '', cls: '', from: '', to: '' }
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const reason = (r: ExpenseRow) => (r.cls === 'retiro' ? 'No resta: retiro del dueño' : r.cls === 'inversion' ? 'No resta: inversión' : r.coveredByFixed ? 'No resta: ya está en gastos fijos' : 'Resta utilidad')

interface FormState { id: string | null; date: string; description: string; category: string; amount: string; account_id: string }

export function ExpensesMonthView({ year, month, accessToken, canEdit }: { year: number; month: number; accessToken: string | undefined; canEdit: boolean }) {
  const [data, setData] = useState<ExpensesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ExpenseFilters>(NO_FILTERS)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const beginRequest = useLatestRequest()

  const fetchData = useCallback(async () => {
    if (!accessToken) return
    const isStale = beginRequest()
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/expenses-month?year=${year}&month=${month}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (isStale()) return
      if (!res.ok) {
        setLoadError(json?.error || 'No se pudieron cargar los gastos del mes.')
        return
      }
      setData(json.data)
    } catch (error) {
      console.error('Error loading expenses month:', error)
      if (!isStale()) setLoadError('No se pudieron cargar los gastos del mes. Intenta de nuevo.')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [accessToken, year, month, beginRequest])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setFilters(NO_FILTERS); setForm(null) }, [year, month])

  const rows = useMemo(() => (data ? filterExpenseRows(data.rows, filters) : []), [data, filters])
  const filtered = rows.length !== data?.rows.length
  const filteredTotal = rows.reduce((s, r) => s + r.amount_cents, 0)

  const openNew = () => {
    if (!data) return
    const today = bogotaDateStr(new Date())
    const date = today >= data.fromDate && today < data.toDate ? today : data.fromDate
    setForm({ id: null, date, description: '', category: '', amount: '', account_id: '' })
  }
  const openEdit = (r: ExpenseRow) =>
    setForm({ id: r.id, date: r.date, description: r.description, category: r.category, amount: String(Math.round(r.amount_cents / 100)), account_id: r.account_id || '' })

  const save = async () => {
    if (!form || !accessToken) return
    const amount_cents = Math.round((parseFloat(form.amount) || 0) * 100)
    if (!form.description.trim() || !form.category || amount_cents <= 0 || !form.date) {
      toast({ title: 'Faltan datos', description: 'Fecha, descripción, categoría y monto son obligatorios.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = { description: form.description.trim(), amount_cents, category: form.category, account_id: form.account_id || null }
      const res = await fetch(form.id ? `/api/operating-expenses/${form.id}` : '/api/operating-expenses', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(form.id ? body : { ...body, date: form.date }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar el gasto')
      toast({ title: form.id ? 'Gasto actualizado' : 'Gasto registrado' })
      setForm(null)
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
      fetchData()
    }
  }

  const remove = async (r: ExpenseRow) => {
    if (!accessToken) return
    const back = r.account_id ? ' La plata vuelve a su cuenta.' : ''
    if (!confirm(`¿Eliminar el gasto "${r.description}" por ${formatPrice(r.amount_cents)}?${back}`)) return
    try {
      const res = await fetch(`/api/operating-expenses/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar el gasto')
      toast({ title: 'Gasto eliminado' })
      fetchData()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  if (loading && !data) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }
  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" className="rounded-lg" onClick={fetchData}>Reintentar</Button>
      </div>
    )
  }
  if (!data) return null

  const monthName = MONTH_NAMES[data.month - 1].toLowerCase()
  const categories = Array.from(new Set([...EXPENSE_CATEGORIES, ...data.rows.map((r) => r.category)]))
  const activeAccounts = data.accounts.filter((a) => a.active)
  const note = form ? expenseCategoryNote(form.category, data.fixedConfig) : null
  const selectCls = 'rounded-lg border bg-background px-3 py-2 text-sm touch:h-11'

  return (
    <div className={`space-y-6 sm:space-y-8 ${loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButtons getDoc={() => expensesMonthReport(data, BRAND.name)} disabled={loading} />
        {canEdit && (
          <Button size="sm" className="rounded-lg touch:h-11 max-sm:w-full" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Registrar gasto
          </Button>
        )}
      </div>

      {/* Formulario registrar / editar */}
      {form && (
        <div className="rounded-xl border border-primary/40 bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{form.id ? 'Editar gasto' : 'Registrar gasto'}</h2>
            <Button variant="ghost" size="sm" className="rounded-lg touch:h-11" onClick={() => setForm(null)} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Fecha</span>
              <Input type="date" value={form.date} disabled={!!form.id} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-lg touch:h-11" />
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted-foreground">Descripción</span>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej: arriendo de noviembre" className="rounded-lg touch:h-11" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Categoría</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">Categoría…</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Monto</span>
              <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="$ 0" className="rounded-lg touch:h-11" />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-2">
              <span className="text-muted-foreground">Sale de la cuenta</span>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">Sin cuenta (no mueve saldos)</option>
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} — saldo {formatPrice(a.balance_cents)}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button className="rounded-lg touch:h-11 max-sm:flex-1" onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {form.id ? 'Guardar cambios' : 'Registrar'}
              </Button>
              <Button variant="ghost" className="rounded-lg touch:h-11" onClick={() => setForm(null)} disabled={saving}>Cancelar</Button>
            </div>
          </div>
          {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
          {form.id && <p className="mt-2 text-xs text-muted-foreground">La fecha de un gasto ya registrado no se cambia: si quedó en otro día, elimínalo y regístralo de nuevo.</p>}
        </div>
      )}

      {/* Tarjetas */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="col-span-2 rounded-xl border bg-card p-3 sm:p-4 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Salió en {monthName}</p>
          <p className="text-lg font-bold text-red-600 sm:text-2xl dark:text-red-400">{formatPrice(data.totals.out)}</p>
          <p className="text-xs text-muted-foreground">{data.totals.count} {data.totals.count === 1 ? 'gasto registrado' : 'gastos registrados'}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">Restan utilidad</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.totals.counted)}</p>
          <p className="text-xs text-muted-foreground">Gastos del negocio</p>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-sm text-muted-foreground">No restan utilidad</p>
          <p className="text-lg font-bold sm:text-2xl">{formatPrice(data.totals.notCounted)}</p>
          <p className="text-xs text-muted-foreground">Retiros, inversiones y lo ya contado en fijos</p>
        </div>
        <div className="col-span-2 rounded-xl border bg-card p-3 sm:p-4 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Por cuenta</p>
          <div className="mt-1 space-y-0.5">
            {data.byAccount.length === 0 && <p className="text-xs text-muted-foreground">Sin gastos</p>}
            {data.byAccount.slice(0, 5).map((a) => (
              <div key={a.account} className="flex justify-between gap-2 text-xs"><span className="truncate text-muted-foreground">{a.account}</span><span className="tabular-nums">{formatPrice(a.cents)}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Gastos fijos del mes */}
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Gastos fijos de {monthName}</h2>
          <Link href="/admin/configuracion-pos" className="text-xs text-primary hover:underline">Cambiar valores en Comisiones y Gastos Fijos</Link>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Compara lo configurado contra lo registrado este mes con esa categoría.</p>
        <div className="divide-y text-sm">
          {data.fixed.items.map((i) => (
            <div key={i.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <div>
                <p className="font-medium">{i.label}</p>
                <p className="text-xs text-muted-foreground">
                  {i.categories.length ? `Categorías: ${i.categories.join(', ')}` : 'No tiene una categoría propia en los gastos'}
                </p>
              </div>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-xs text-muted-foreground">{i.categories.length ? `${formatPrice(i.registered)} de ` : ''}{formatPrice(i.configured)}</span>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Movimientos del mes */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 pb-2 sm:px-6">
          <h2 className="text-lg font-semibold">Gastos de {monthName}</h2>
        </div>
        <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <label className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Buscar descripción…" aria-label="Buscar" className="rounded-lg pl-9 touch:h-11" />
          </label>
          <select value={filters.account} onChange={(e) => setFilters({ ...filters, account: e.target.value })} aria-label="Cuenta" className={`${selectCls} min-w-0`}>
            <option value="">Todas las cuentas</option>
            <option value="__none__">Sin cuenta</option>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} aria-label="Categoría" className={`${selectCls} min-w-0`}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.cls} onChange={(e) => setFilters({ ...filters, cls: e.target.value as ExpenseFilters['cls'] })} aria-label="Tipo" className={`${selectCls} min-w-0`}>
            <option value="">Todos los tipos</option>
            <option value="resta">Restan utilidad</option>
            <option value="no_resta">No restan utilidad</option>
            <option value="operativo">Gasto operativo</option>
            <option value="financiero">Gasto financiero</option>
            <option value="retiro">Retiro del dueño</option>
            <option value="inversion">Inversión</option>
          </select>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:col-span-2 lg:col-span-3">
            <Input type="date" value={filters.from} min={data.fromDate} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="Desde" title="Desde" className="min-w-0 rounded-lg touch:h-11" />
            <Input type="date" value={filters.to} min={data.fromDate} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="Hasta" title="Hasta" className="min-w-0 rounded-lg touch:h-11" />
          </div>
        </div>
        {filtered && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-sm sm:px-6">
            <span>{rows.length} de {data.rows.length} gastos · <strong className="tabular-nums">{formatPrice(filteredTotal)}</strong></span>
            <Button variant="ghost" size="sm" className="rounded-lg touch:h-10" onClick={() => setFilters(NO_FILTERS)}>Quitar filtros</Button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="border-t px-6 py-6 text-sm text-muted-foreground">{data.rows.length ? 'Ningún gasto coincide con los filtros.' : `No hay gastos registrados en ${monthName}.`}</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium sm:pl-6">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Descripción</th>
                    <th className="px-3 py-2 text-left font-medium">Categoría</th>
                    <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    {canEdit && <th className="w-20 px-4 sm:pr-6" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2 sm:pl-6"><Link href={`/admin/ventas-dia?date=${r.date}`} className="hover:underline">{fmtDate(r.date)}</Link></td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2">
                        <p>{r.category}</p>
                        <p className={`text-xs ${r.counted ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>{EXPENSE_CLASS_LABEL[r.cls]} · {reason(r)}</p>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.account_name || 'Sin cuenta'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-red-600 dark:text-red-400">−{formatPrice(r.amount_cents)}</td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-4 py-1 text-right sm:pr-6">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(r)} aria-label={`Editar ${r.description}`}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => remove(r)} aria-label={`Eliminar ${r.description}`}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y border-t md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{r.description}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(r.date)} · {r.category} · {r.account_name || 'Sin cuenta'}</p>
                      <p className={`text-xs ${r.counted ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>{reason(r)}</p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums text-red-600 dark:text-red-400">−{formatPrice(r.amount_cents)}</p>
                  </div>
                  {canEdit && (
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" className="rounded-lg touch:h-10" onClick={() => openEdit(r)}><Pencil className="mr-1 h-3 w-3" /> Editar</Button>
                      <Button variant="outline" size="sm" className="rounded-lg text-red-500 touch:h-10" onClick={() => remove(r)}><Trash2 className="mr-1 h-3 w-3" /> Eliminar</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Por categoría */}
      {data.byCategory.length > 0 && (
        <div className="rounded-xl border bg-card p-4 text-sm sm:p-6">
          <h2 className="mb-2 text-lg font-semibold">Por categoría</h2>
          <div className="divide-y">
            {data.byCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-3 py-2">
                <div><p className="font-medium">{c.category}</p><p className="text-xs text-muted-foreground">{EXPENSE_CLASS_LABEL[c.cls]} · {c.count} {c.count === 1 ? 'gasto' : 'gastos'}</p></div>
                <p className="tabular-nums">{formatPrice(c.cents)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
