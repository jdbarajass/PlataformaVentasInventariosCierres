'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Calendar, Search, Plus, Trash2, Loader2, Receipt, Pencil, X, CheckCircle2, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'
import { bogotaDateStr, bogotaDayRange, formatBogotaTime } from '@/lib/bogota-time'

interface SaleItem {
  id: string
  product_id: string
  variant_id: string | null
  product_title: string
  product_talla: string | null
  qty: number
  price_cents: number
  cost_cents: number
  discount_cents: number
  total_cents: number
}
interface SalePayment {
  id: string
  method: string
  method_detail: string | null
  account_id: string | null
  amount_cents: number
  commission_cents: number
}
interface Sale {
  id: string
  order_number: string
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  status: string
  total_cents: number
  created_at: string
  order_items: SaleItem[]
  payments: SalePayment[]
}
interface CartLine {
  key: string
  product_id: string
  variant_id: string | null
  title: string
  talla: string | null
  qty: number
  price_cents: number
  discount_cents: number
}
interface PaymentSplit {
  key: string
  method: 'cash' | 'card' | 'nequi' | 'nu' | 'qr' | 'daviplata' | 'addi' | 'sistecredito' | 'other'
  method_detail: string
  account_id: string
  amount: string
}
interface Account { id: string; name: string }
interface ProductResult {
  id: string
  title: string
  price_cents: number
  variants: { id: string; talla: string | null }[]
}
interface Expense { id: string; description: string; amount_cents: number; category: string }
interface Loan { id: string; product_title: string; warehouse: string; status: string; created_at: string }

const methodLabels: Record<PaymentSplit['method'], string> = {
  cash: 'Efectivo', card: 'Datáfono', nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia',
  daviplata: 'Daviplata', addi: 'Addi', sistecredito: 'SisteCrédito', other: 'Otro',
}

function VentasDiaContent() {
  // ?date=YYYY-MM-DD para llegar directo a un día desde Historial Mensual
  // ("Ver Vista del Día" del software local, ver docs/UNIFICACION_YJBMOTOCOM.md
  // sección 21) — sin el parámetro, se abre en el día de hoy como siempre.
  const searchParams = useSearchParams()
  // "Hoy" en hora de Bogotá, no la fecha UTC de `toISOString()` — de 7pm a
  // medianoche en Colombia, la fecha UTC ya es el día siguiente, así que
  // esta página (usada a diario para el cuadre de caja) mostraría el día
  // equivocado (vacío) en la noche si se usara ese patrón.
  const [date, setDate] = useState(() => searchParams.get('date') || bogotaDateStr(new Date()))
  const [sales, setSales] = useState<Sale[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  // Préstamos pendientes: TODOS los que siguen sin devolverse, sin importar
  // la fecha — igual que la Vista del Día del software local
  // (obtener_prestamos_pendientes no filtra por fecha; funciona como
  // recordatorio persistente de mercancía prestada, ver
  // docs/UNIFICACION_YJBMOTOCOM.md sección 21).
  const [pendingLoans, setPendingLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Edit form state
  const [editCart, setEditCart] = useState<CartLine[]>([])
  const [editPayments, setEditPayments] = useState<PaymentSplit[]>([])
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [editQuery, setEditQuery] = useState('')
  const [editResults, setEditResults] = useState<ProductResult[]>([])
  const [saving, setSaving] = useState(false)

  // Gasto form
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: '', account_id: '' })
  const [savingExpense, setSavingExpense] = useState(false)

  const [dailyFixedExpense, setDailyFixedExpense] = useState(0)

  // Selección múltiple para cambio masivo de método de pago
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMethod, setBulkMethod] = useState<PaymentSplit['method']>('cash')
  const [applyingBulk, setApplyingBulk] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  // Igual que en el software local: solo Admin ve costo/ganancia/comisión/utilidad.
  const canViewProfit = userProfile?.role === 'admin'

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const fetchSales = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      // Límites explícitos en hora de Bogotá (no naive `${date}T00:00:00`,
      // que Postgres interpreta en UTC y deja la ventana corrida 5 horas —
      // ver comentario de bogotaDayRange).
      const { from, to } = bogotaDayRange(date)
      const res = await fetch(`/api/pos/sales?from=${from}&to=${to}&limit=200`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setSales(data || [])
    } catch (error) {
      console.error('Error fetching sales:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, authHeaders, date])

  const fetchExpenses = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/operating-expenses?from=${date}&to=${date}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setExpenses(data || [])
    } catch (error) {
      console.error('Error fetching expenses:', error)
    }
  }, [session?.access_token, authHeaders, date])

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

  const fetchLoans = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/loans?status=pending', { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setPendingLoans(data || [])
    } catch (error) {
      console.error('Error fetching loans:', error)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => { fetchSales() }, [fetchSales])
  useEffect(() => { fetchExpenses() }, [fetchExpenses])
  useEffect(() => { fetchAccounts() }, [fetchAccounts])
  useEffect(() => { fetchLoans() }, [fetchLoans])

  useEffect(() => {
    if (!canViewProfit) return
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const fixed = json?.data?.fixed_monthly_expenses
        if (fixed) {
          const total = fixed.arriendo_cents + fixed.sueldo_cents + fixed.servicios_cents + fixed.otros_gastos_cents
          setDailyFixedExpense(total / (fixed.dias_mes || 30))
        }
      })
      .catch(() => {})
  }, [canViewProfit])

  useEffect(() => {
    if (!editQuery.trim() || !session?.access_token) {
      setEditResults([])
      return
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/pos/search?q=${encodeURIComponent(editQuery)}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setEditResults(data || [])
    }, 250)
    return () => clearTimeout(timer)
  }, [editQuery, session?.access_token, authHeaders])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const activeSales = sales.filter((s) => s.status !== 'cancelled')
  const totalDia = activeSales.reduce((sum, s) => sum + s.total_cents, 0)
  const totalGastos = expenses.reduce((sum, e) => sum + e.amount_cents, 0)

  // Costo/ganancia/comisión/utilidad real del día — igual que el software
  // local (calcular_utilidad_real_dia): el gasto fijo mensual se prorratea
  // POR DÍA (total ÷ días del mes) porque esta es la vista de un solo día,
  // a diferencia de Reportes/Historial Mensual que usan el gasto fijo
  // completo sin prorratear (ver docs/UNIFICACION_YJBMOTOCOM.md sección 13.2).
  const totalCost = activeSales.reduce(
    (sum, s) => sum + (s.order_items || []).reduce((c, i) => c + i.qty * (i.cost_cents || 0), 0),
    0
  )
  const totalCommission = activeSales.reduce(
    (sum, s) => sum + (s.payments || []).reduce((c, p) => c + (p.commission_cents || 0), 0),
    0
  )
  const netProfit = totalDia - totalCost
  const netProfitPct = totalDia > 0 ? (netProfit / totalDia) * 100 : 0
  const utilidadReal = netProfit - totalGastos - dailyFixedExpense

  // Ingresos por método de pago del día — igual que "Por método" de Vista
  // del Día en el local (_build_totales en vista_diaria_dialog.py): cada
  // pago se suma a su método real, incluidos los que vienen de una venta
  // con pago combinado (cada split ya es su propia fila en `payments`).
  const revenueByMethod = activeSales.reduce<Record<string, number>>((acc, s) => {
    ;(s.payments || []).forEach((p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount_cents
    })
    return acc
  }, {})

  const methodSummary = (sale: Sale) => {
    if (!sale.payments || sale.payments.length === 0) return '—'
    return sale.payments.map((p) => methodLabels[p.method as PaymentSplit['method']] || p.method).join(' + ')
  }

  // Lista plana de cada producto vendido (no agrupado por factura colapsada)
  // para poder ver/evidenciar de un vistazo todo lo vendido en el día — cada
  // fila conserva la referencia a su factura (order_number) y "Editar" abre
  // la factura completa (todos los productos de esa venta), no solo esa línea.
  const saleLines = activeSales.flatMap((sale) => sale.order_items.map((item) => ({ item, sale })))
  const cancelledSales = sales.filter((s) => s.status === 'cancelled')
  const editingSale = sales.find((s) => s.id === editingId) || null

  const startEdit = (sale: Sale) => {
    setEditingId(sale.id)
    setEditCustomerName(sale.customer_name || '')
    setEditCustomerPhone(sale.customer_phone || '')
    setEditCart(
      sale.order_items.map((item) => ({
        key: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.product_title,
        talla: item.product_talla,
        qty: item.qty,
        price_cents: item.price_cents,
        discount_cents: item.discount_cents,
      }))
    )
    setEditPayments(
      sale.payments.map((p) => ({
        key: p.id,
        method: p.method as PaymentSplit['method'],
        method_detail: p.method_detail || '',
        account_id: p.account_id || '',
        amount: (p.amount_cents / 100).toString(),
      }))
    )
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditCart([])
    setEditPayments([])
    setEditQuery('')
    setEditResults([])
  }

  const addToEditCart = (product: ProductResult, variant: { id: string; talla: string | null } | null) => {
    const key = variant ? `${product.id}:${variant.id}` : product.id
    setEditCart((prev) => {
      if (prev.find((l) => l.key === key)) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...prev, {
        key, product_id: product.id, variant_id: variant?.id || null,
        title: product.title, talla: variant?.talla || null,
        qty: 1, price_cents: product.price_cents, discount_cents: 0,
      }]
    })
    setEditQuery('')
    setEditResults([])
  }

  const addEditPayment = () => {
    setEditPayments((prev) => [...prev, { key: crypto.randomUUID(), method: 'cash', method_detail: '', account_id: '', amount: '' }])
  }

  const editSubtotal = editCart.reduce((sum, l) => sum + l.qty * l.price_cents, 0)
  const editDiscount = editCart.reduce((sum, l) => sum + l.discount_cents, 0)
  const editTotal = editSubtotal - editDiscount
  const editPaymentsTotal = editPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0) * 100, 0)

  const saveEdit = async (saleId: string, force = false) => {
    if (editCart.length === 0) {
      toast({ title: 'Error', description: 'La venta debe tener al menos un producto', variant: 'destructive' })
      return
    }
    const validPayments = editPayments.filter((p) => parseFloat(p.amount) > 0)
    if (validPayments.length === 0) {
      toast({ title: 'Error', description: 'Ingresa al menos un método de pago', variant: 'destructive' })
      return
    }
    // Los pagos deben sumar EXACTO al total, igual que al registrar la venta.
    if (Math.round(editPaymentsTotal) !== editTotal) {
      const diff = Math.round(editPaymentsTotal) - editTotal
      toast({
        title: 'Error',
        description: diff < 0 ? `Faltan ${formatPrice(-diff)} para cubrir el total` : `Sobran ${formatPrice(diff)} — ajusta el monto pagado`,
        variant: 'destructive',
      })
      return
    }
    try {
      setSaving(true)
      const res = await fetch(`/api/pos/sales/${saleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          customer_name: editCustomerName || null,
          customer_phone: editCustomerPhone || null,
          items: editCart.map((l) => ({
            product_id: l.product_id, variant_id: l.variant_id, qty: l.qty,
            price_cents: l.price_cents, discount_cents: l.discount_cents,
          })),
          payments: validPayments.map((p) => ({
            method: p.method, method_detail: p.method_detail || null,
            account_id: p.account_id || null, amount_cents: Math.round(parseFloat(p.amount) * 100),
          })),
          force,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        if (!force && typeof error.error === 'string' && error.error.includes('Stock insuficiente')) {
          setSaving(false)
          if (confirm(`${error.error}\n\n¿Continuar de todas formas?`)) {
            await saveEdit(saleId, true)
          }
          return
        }
        throw new Error(error.error || 'Error al editar la venta')
      }
      toast({ title: 'Venta actualizada' })
      cancelEdit()
      await fetchSales()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelSale = async (id: string) => {
    if (!confirm('¿Cancelar esta venta? Se restaura el stock y el saldo de las cuentas.')) return
    try {
      const res = await fetch(`/api/pos/sales/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Error al cancelar la venta')
      toast({ title: 'Venta cancelada' })
      await fetchSales()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkMethod = async () => {
    if (selectedIds.size < 2 || !session?.access_token) return
    try {
      setApplyingBulk(true)
      const res = await fetch('/api/pos/sales/bulk-method', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ orderIds: Array.from(selectedIds), method: bulkMethod }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al cambiar el método de pago')
      }
      const { data } = await res.json()
      toast({
        title: 'Método de pago actualizado',
        description: `${data.updated} venta(s) actualizada(s)${data.excluded ? ` · ${data.excluded} con pago combinado se excluyeron` : ''}`,
      })
      setSelectedIds(new Set())
      await fetchSales()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setApplyingBulk(false)
    }
  }

  const handleExport = async () => {
    if (!session?.access_token) return
    try {
      setExporting(true)
      const res = await fetch(`/api/pos/sales/export?date=${date}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Error al exportar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ventas-${date}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setExporting(false)
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
          date, description: expenseForm.description, amount_cents: amount,
          category: expenseForm.category, account_id: expenseForm.account_id || null,
          created_by: userProfile?.id,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar el gasto')
      }
      toast({ title: 'Gasto registrado' })
      setExpenseForm({ description: '', amount: '', category: '', account_id: '' })
      await fetchExpenses()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingExpense(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ventas del Día</h1>
          <p className="text-muted-foreground">Ver, editar y cancelar ventas de mostrador por fecha</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto rounded-lg" />
          <Button variant="outline" className="rounded-lg" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar Excel
          </Button>
        </div>
      </div>

      {selectedIds.size >= 2 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <span className="text-sm font-medium">{selectedIds.size} ventas seleccionadas</span>
          <select
            value={bulkMethod}
            onChange={(e) => setBulkMethod(e.target.value as PaymentSplit['method'])}
            className="rounded-lg border bg-background px-2 py-1 text-sm"
          >
            {Object.entries(methodLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <Button size="sm" className="rounded-lg" onClick={handleBulkMethod} disabled={applyingBulk}>
            {applyingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Cambiar método de pago
          </Button>
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setSelectedIds(new Set())}>
            Cancelar selección
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total del día ({activeSales.length} ventas)</p>
          <p className="text-2xl font-bold">{formatPrice(totalDia)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Gastos operativos del día</p>
          <p className="text-2xl font-bold text-red-500">{formatPrice(totalGastos)}</p>
        </div>
        {canViewProfit && (
          <>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Ganancia neta ({netProfitPct.toFixed(1)}%)</p>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(netProfit)}</p>
              <p className="text-xs text-muted-foreground">Costo {formatPrice(totalCost)} · Comisión {formatPrice(totalCommission)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Utilidad real del día</p>
              <p className={`text-2xl font-bold ${utilidadReal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(utilidadReal)}</p>
              <p className="text-xs text-muted-foreground">Ganancia neta − gastos del día − gasto fijo diario ({formatPrice(dailyFixedExpense)})</p>
            </div>
          </>
        )}
      </div>

      {/* Tira compacta de chips en vez de una tarjeta de dos columnas — con
          2-3 métodos de pago la tarjeta anterior desperdiciaba la mitad del
          ancho de la fila; esta franja delgada queda pegada a las tarjetas
          de resumen, igual de "arriba" que pidió el usuario. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <span className="text-sm font-medium text-muted-foreground">Por método de pago:</span>
        {Object.keys(revenueByMethod).length === 0 ? (
          <span className="text-sm text-muted-foreground">Sin pagos registrados este día.</span>
        ) : (
          Object.entries(revenueByMethod)
            .sort((a, b) => b[1] - a[1])
            .map(([method, cents]) => (
              <span key={method} className="rounded-lg border px-3 py-1 text-sm">
                {methodLabels[method as PaymentSplit['method']] || method}: <span className="font-medium">{formatPrice(cents)}</span>
              </span>
            ))
        )}
      </div>

      {/* Ventas a la izquierda (2/3) y préstamos pendientes a la derecha
          (1/3) en paralelo — igual que Vista del Día del software local —
          para que ambos quepan en una sola captura de pantalla en vez de
          apilados uno debajo del otro. */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sales.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              <Receipt className="mx-auto mb-2 h-8 w-8" />
              No hay ventas de mostrador en esta fecha
            </div>
          ) : (
            <div className="rounded-xl border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Producto</th>
                      {canViewProfit && <th className="px-3 py-2 text-right text-muted-foreground">Costo</th>}
                      <th className="px-3 py-2 text-right text-muted-foreground">Precio Venta</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Método de Pago</th>
                      {canViewProfit && <th className="px-3 py-2 text-right text-muted-foreground">G. Neta</th>}
                      <th className="px-3 py-2 text-left text-muted-foreground">Factura</th>
                      <th className="px-3 py-2 text-center text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleLines.map(({ item, sale }) => {
                      const gananciaNeta = item.total_cents - item.qty * (item.cost_cents || 0)
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(sale.id)}
                              onChange={() => toggleSelect(sale.id)}
                              className="h-4 w-4 rounded"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {item.product_title}
                            {item.product_talla && <Badge variant="outline" className="ml-1">{item.product_talla}</Badge>}
                            {item.qty > 1 && <span className="ml-1 text-xs text-muted-foreground">×{item.qty}</span>}
                          </td>
                          {canViewProfit && (
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatPrice(item.qty * (item.cost_cents || 0))}</td>
                          )}
                          <td className="px-3 py-2 text-right font-medium">{formatPrice(item.total_cents)}</td>
                          <td className="px-3 py-2">{methodSummary(sale)}</td>
                          {canViewProfit && (
                            <td className={`px-3 py-2 text-right ${gananciaNeta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatPrice(gananciaNeta)}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <p className="text-xs text-muted-foreground">{sale.order_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatBogotaTime(sale.created_at)}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                title="Editar factura completa"
                                onClick={() => startEdit(sale)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <a
                                href={`/api/orders/${sale.id}/invoice`} target="_blank" rel="noopener noreferrer"
                                title="Ver recibo"
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-cyan-500 hover:bg-muted"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                              </a>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                                title="Cancelar venta"
                                onClick={() => handleCancelSale(sale.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {cancelledSales.length > 0 && (
                <div className="space-y-1 border-t p-3">
                  <p className="text-xs font-medium text-muted-foreground">Ventas canceladas</p>
                  {cancelledSales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{s.order_number} — {s.customer_name || 'Cliente de mostrador'}</span>
                      <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Cancelada</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-3 text-lg font-semibold">Préstamos pendientes ({pendingLoans.length})</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Toda la mercancía prestada que aún no se ha devuelto, sin importar la fecha.
          </p>
          {pendingLoans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay préstamos pendientes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Fecha</th>
                    <th className="py-2 pr-2">Producto</th>
                    <th className="py-2">Almacén</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoans.map((loan) => (
                    <tr key={loan.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 text-muted-foreground">
                        {new Date(loan.created_at).toLocaleDateString('es-CO')}
                      </td>
                      <td className="py-2 pr-2">{loan.product_title}</td>
                      <td className="py-2">{loan.warehouse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Editar factura completa: abre TODOS los productos de esa venta (no
          solo el que se clickeó) para poder cambiar cantidades/método/
          cliente de la factura como tal — pedido explícito del usuario. */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Editar factura {editingSale.order_number}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Nombre del cliente" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} className="rounded-lg" />
                <Input placeholder="Teléfono" value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} className="rounded-lg" />
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Agregar producto..." value={editQuery} onChange={(e) => setEditQuery(e.target.value)} className="rounded-lg pl-10" />
                {editResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full space-y-1 overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
                    {editResults.map((p) =>
                      p.variants.length === 0 ? (
                        <button key={p.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted" onClick={() => addToEditCart(p, null)}>
                          {p.title}
                        </button>
                      ) : (
                        p.variants.map((v) => (
                          <button key={v.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted" onClick={() => addToEditCart(p, v)}>
                            {p.title} {v.talla ? `(${v.talla})` : ''}
                          </button>
                        ))
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left text-muted-foreground">Producto</th>
                      <th className="px-3 py-2 text-center text-muted-foreground">Cant.</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Precio</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editCart.map((line) => (
                      <tr key={line.key} className="border-b last:border-0">
                        <td className="px-3 py-2">{line.title} {line.talla ? `(${line.talla})` : ''}</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number" min="1" value={line.qty}
                            onChange={(e) => setEditCart((prev) => prev.map((l) => l.key === line.key ? { ...l, qty: parseInt(e.target.value) || 1 } : l))}
                            className="h-7 w-16 rounded-lg text-center"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyInput
                            value={String(line.price_cents / 100)}
                            onChange={(v) => setEditCart((prev) => prev.map((l) => l.key === line.key ? { ...l, price_cents: (parseInt(v) || 0) * 100 } : l))}
                            className="h-7 w-24 rounded-lg text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditCart((prev) => prev.filter((l) => l.key !== line.key))}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Pagos</p>
                {editPayments.map((p) => (
                  <div key={p.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                    <select
                      value={p.method}
                      onChange={(e) => setEditPayments((prev) => prev.map((x) => x.key === p.key ? { ...x, method: e.target.value as PaymentSplit['method'] } : x))}
                      className="rounded-lg border bg-background px-2 py-1 text-xs"
                    >
                      {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select
                      value={p.account_id}
                      onChange={(e) => setEditPayments((prev) => prev.map((x) => x.key === p.key ? { ...x, account_id: e.target.value } : x))}
                      className="rounded-lg border bg-background px-2 py-1 text-xs"
                    >
                      <option value="">Sin cuenta</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <MoneyInput
                      placeholder="Monto" value={p.amount}
                      onChange={(v) => setEditPayments((prev) => prev.map((x) => x.key === p.key ? { ...x, amount: v } : x))}
                      className="h-8 w-28 rounded-lg text-xs"
                    />
                    {editPayments.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditPayments((prev) => prev.filter((x) => x.key !== p.key))}>
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg" onClick={addEditPayment}>
                  <Plus className="mr-1 h-3 w-3" /> Agregar método de pago
                </Button>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Total / Pagado</span>
                  <span>{formatPrice(editTotal)} / {formatPrice(Math.round(editPaymentsTotal))}</span>
                </div>
                {Math.round(editPaymentsTotal) !== editTotal && (
                  <div className={`flex justify-between text-xs font-medium ${Math.round(editPaymentsTotal) < editTotal ? 'text-red-500' : 'text-amber-500'}`}>
                    <span>{Math.round(editPaymentsTotal) < editTotal ? 'Falta' : 'Sobra'}</span>
                    <span>{formatPrice(Math.abs(Math.round(editPaymentsTotal) - editTotal))}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button className="rounded-lg" onClick={() => saveEdit(editingSale.id)} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Guardar cambios
                </Button>
                <Button variant="outline" className="rounded-lg" onClick={cancelEdit}>Cancelar edición</Button>
                <a
                  href={`/api/orders/${editingSale.id}/invoice`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-sm text-cyan-500 hover:underline"
                >
                  Ver recibo
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Gastos operativos del día</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Descripción" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="rounded-lg" />
          <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">Categoría...</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <MoneyInput placeholder="Monto" value={expenseForm.amount} onChange={(v) => setExpenseForm({ ...expenseForm, amount: v })} className="rounded-lg" />
          <select value={expenseForm.account_id} onChange={(e) => setExpenseForm({ ...expenseForm, account_id: e.target.value })} className="rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">Sin cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Button className="rounded-lg" onClick={handleAddExpense} disabled={savingExpense}>
            {savingExpense ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Registrar
          </Button>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos registrados en esta fecha.</p>
        ) : (
          <div className="space-y-1">
            {expenses.map((e) => (
              <div key={e.id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{e.description} · {e.category}</span>
                <span className="font-medium">{formatPrice(e.amount_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function VentasDiaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VentasDiaContent />
    </Suspense>
  )
}
