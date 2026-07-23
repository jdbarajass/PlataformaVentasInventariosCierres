'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  ShoppingCart,
  Receipt,
  X,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface ProductVariant {
  id: string
  talla: string | null
  barcode: string | null
  stock_qty: number
  cost_cents: number
}

interface ProductResult {
  id: string
  title: string
  sku: string | null
  price_cents: number
  cost_cents: number
  stock_qty: number
  images: string[]
  variants: ProductVariant[]
  matched_variant_id?: string
}

interface CartLine {
  key: string
  // null = ítem manual fuera de catálogo (igual que el software local, que
  // permite vender un producto que no está en inventario con nombre/costo
  // /precio libres — ver _LineaProducto._cargar_variantes en venta_form.py).
  product_id: string | null
  variant_id: string | null
  title: string
  talla: string | null
  qty: number
  price_cents: number
  cost_cents: number
  discount_cents: number
  max_stock: number
}

interface PaymentSplit {
  key: string
  method: 'cash' | 'card' | 'nequi' | 'nu' | 'qr' | 'daviplata' | 'addi' | 'other'
  method_detail: string
  account_id: string
  amount: string
}

interface Account {
  id: string
  name: string
  color: string | null
}

// Los 4 sub-tipos de transferencia (Nequi/NU/QR/Daviplata) tienen comisión
// propia configurable en Comisiones y Gastos Fijos — igual que el software
// local, que nunca ofrece un "Transferencia" genérico, solo estos 4 nombres.
const methodLabels: Record<PaymentSplit['method'], string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
  nequi: 'Nequi',
  nu: 'NU',
  qr: 'QR/Bancolombia',
  daviplata: 'Daviplata',
  addi: 'Addi',
  other: 'Otro',
}

const emptyPayment = (): PaymentSplit => ({
  key: crypto.randomUUID(),
  method: 'cash',
  method_detail: '',
  account_id: '',
  amount: '',
})

// Una "sesión de venta" = una pestaña de la barra de arriba (inspirada en la
// interfaz de Alegra: varias ventas en curso en paralelo, cada una con su
// propio carrito/cliente/pagos, cambiando de una a otra con un clic — sin el
// paso extra de "pausar" que tenía el prototipo anterior). Reemplaza al
// standby-por-chips (parquear/restaurar) del software local con algo más
// directo, aunque el concepto de fondo (varios carritos en memoria del
// navegador, sin persistencia en BD hasta que se registra la venta) es el
// mismo que venta_form.py.
interface SaleSession {
  id: string
  label: string
  cart: CartLine[]
  payments: PaymentSplit[]
  customerName: string
  customerPhone: string
  customerIdNumber: string
  notes: string
  lastSaleId: string | null
}

const newSession = (label: string): SaleSession => ({
  id: crypto.randomUUID(),
  label,
  cart: [],
  payments: [emptyPayment()],
  customerName: '',
  customerPhone: '',
  customerIdNumber: '',
  notes: '',
  lastSaleId: null,
})

export default function VentasPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [searching, setSearching] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [saving, setSaving] = useState(false)
  const [todaySales, setTodaySales] = useState<any[]>([])
  const [loadingSales, setLoadingSales] = useState(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [commissionRates, setCommissionRates] = useState<Record<string, number>>({})

  // Pestañas de venta en paralelo (ver comentario de SaleSession arriba).
  const [sessions, setSessions] = useState<SaleSession[]>([newSession('Venta principal')])
  const [activeSessionId, setActiveSessionId] = useState(sessions[0].id)
  const sessionCounter = useRef(1)

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0]

  const updateActiveSession = useCallback(
    (updater: (s: SaleSession) => SaleSession) => {
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updater(s) : s)))
    },
    [activeSessionId]
  )

  const addSessionTab = () => {
    sessionCounter.current += 1
    const s = newSession(`Venta ${sessionCounter.current}`)
    setSessions((prev) => [...prev, s])
    setActiveSessionId(s.id)
  }

  const closeSessionTab = (id: string) => {
    const target = sessions.find((s) => s.id === id)
    if (!target) return
    if (sessions.length === 1) return // siempre debe quedar al menos una pestaña
    if (target.cart.length > 0 && !confirm('Esta venta tiene productos sin registrar. ¿Cerrar de todas formas?')) {
      return
    }
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id)
      setActiveSessionId(remaining[0].id)
    }
  }

  // Ítem manual fuera de catálogo (ver CartLine.product_id) — mismo caso de
  // uso que el software local: un producto que no está en inventario.
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [manualCost, setManualCost] = useState('')

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  // Igual que en el software local: solo Admin ve costo/ganancia/comisión.
  const canViewProfit = userProfile?.role === 'admin'

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

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

  const fetchTodaySales = useCallback(async () => {
    if (!session?.access_token) return
    setLoadingSales(true)
    try {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const res = await fetch(`/api/pos/sales?from=${startOfDay.toISOString()}`, {
        headers: authHeaders(),
      })
      if (!res.ok) return
      const { data } = await res.json()
      setTodaySales(data || [])
    } catch (error) {
      console.error('Error fetching today sales:', error)
    } finally {
      setLoadingSales(false)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    fetchAccounts()
    fetchTodaySales()
  }, [fetchAccounts, fetchTodaySales])

  useEffect(() => {
    if (!canViewProfit) return
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.pos_commission_rates) setCommissionRates(json.data.pos_commission_rates)
      })
      .catch(() => {})
  }, [canViewProfit])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      if (!session?.access_token) return
      setSearching(true)
      try {
        const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query)}`, {
          headers: authHeaders(),
        })
        if (!res.ok) return
        const { data } = await res.json()
        setResults(data || [])
      } catch (error) {
        console.error('Error searching products:', error)
      } finally {
        setSearching(false)
      }
    }, 250)
  }, [query, session?.access_token, authHeaders])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)

  const addToCart = (product: ProductResult, variant: ProductVariant | null) => {
    const key = variant ? `${product.id}:${variant.id}` : product.id
    updateActiveSession((s) => {
      const existing = s.cart.find((l) => l.key === key)
      const cart = existing
        ? s.cart.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
        : [
            ...s.cart,
            {
              key,
              product_id: product.id,
              variant_id: variant?.id || null,
              title: product.title,
              talla: variant?.talla || null,
              qty: 1,
              price_cents: product.price_cents,
              cost_cents: variant ? variant.cost_cents : product.cost_cents,
              discount_cents: 0,
              max_stock: variant ? variant.stock_qty : product.stock_qty,
            },
          ]
      return { ...s, cart }
    })
  }

  const handleBarcodeEnter = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !query.trim() || !session?.access_token) return
    try {
      const res = await fetch(`/api/pos/search?barcode=${encodeURIComponent(query.trim())}`, {
        headers: authHeaders(),
      })
      if (!res.ok) return
      const { data } = await res.json()
      if (data && data[0]) {
        const product = data[0] as ProductResult
        const variant = product.variants.find((v) => v.id === product.matched_variant_id)
        addToCart(product, variant || null)
        setQuery('')
        setResults([])
      }
    } catch (error) {
      console.error('Error scanning barcode:', error)
    }
  }

  const addManualItem = () => {
    const price = Math.round((parseFloat(manualPrice) || 0) * 100)
    if (!manualTitle.trim() || price <= 0) {
      toast({ title: 'Error', description: 'Ingresa un nombre y un precio mayor a cero', variant: 'destructive' })
      return
    }
    const cost = canViewProfit ? Math.round((parseFloat(manualCost) || 0) * 100) : 0
    updateActiveSession((s) => ({
      ...s,
      cart: [
        ...s.cart,
        {
          key: crypto.randomUUID(),
          product_id: null,
          variant_id: null,
          title: manualTitle.trim(),
          talla: null,
          qty: 1,
          price_cents: price,
          cost_cents: cost,
          discount_cents: 0,
          max_stock: 999999,
        },
      ],
    }))
    setManualTitle('')
    setManualPrice('')
    setManualCost('')
    setShowManualForm(false)
  }

  const updateCartLine = (key: string, patch: Partial<CartLine>) => {
    updateActiveSession((s) => ({ ...s, cart: s.cart.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))
  }

  const removeCartLine = (key: string) => {
    updateActiveSession((s) => ({ ...s, cart: s.cart.filter((l) => l.key !== key) }))
  }

  const cart = activeSession.cart
  const payments = activeSession.payments

  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.price_cents, 0)
  const totalDiscount = cart.reduce((sum, l) => sum + l.discount_cents, 0)
  const total = subtotal - totalDiscount
  const paymentsTotal = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0) * 100, 0)

  // Costo/ganancia/comisión estimados del carrito actual — solo Admin (ver
  // canViewProfit). La comisión se traslada al cliente como sobreprecio y
  // no afecta la ganancia registrada, igual que en el software local.
  const totalCost = cart.reduce((sum, l) => sum + l.qty * l.cost_cents, 0)
  const estimatedProfit = total - totalCost
  const estimatedCommission = payments.reduce((sum, p) => {
    const amount = (parseFloat(p.amount) || 0) * 100
    return sum + amount * ((commissionRates[p.method] || 0) / 100)
  }, 0)

  const addPaymentSplit = () => {
    updateActiveSession((s) => ({ ...s, payments: [...s.payments, emptyPayment()] }))
  }

  const updatePaymentSplit = (key: string, patch: Partial<PaymentSplit>) => {
    updateActiveSession((s) => ({ ...s, payments: s.payments.map((p) => (p.key === key ? { ...p, ...patch } : p)) }))
  }

  const removePaymentSplit = (key: string) => {
    updateActiveSession((s) => ({
      ...s,
      payments: s.payments.length > 1 ? s.payments.filter((p) => p.key !== key) : s.payments,
    }))
  }

  const setCustomerName = (v: string) => updateActiveSession((s) => ({ ...s, customerName: v }))
  const setCustomerPhone = (v: string) => updateActiveSession((s) => ({ ...s, customerPhone: v }))
  const setCustomerIdNumber = (v: string) => updateActiveSession((s) => ({ ...s, customerIdNumber: v }))
  const setNotes = (v: string) => updateActiveSession((s) => ({ ...s, notes: v }))

  const handleSubmitSale = async (force = false) => {
    const activeId = activeSessionId
    const current = sessions.find((s) => s.id === activeId)
    if (!current) return
    if (current.cart.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos un producto al carrito', variant: 'destructive' })
      return
    }
    const validPayments = current.payments.filter((p) => parseFloat(p.amount) > 0)
    if (validPayments.length === 0) {
      toast({ title: 'Error', description: 'Ingresa al menos un método de pago', variant: 'destructive' })
      return
    }
    const currentTotal =
      current.cart.reduce((sum, l) => sum + l.qty * l.price_cents, 0) -
      current.cart.reduce((sum, l) => sum + l.discount_cents, 0)
    const currentPaymentsTotal = validPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0) * 100, 0)
    // Los pagos deben sumar EXACTO al total (igual que el software local: no
    // se calcula vuelto dentro del sistema, el vendedor lo entrega por fuera).
    if (Math.round(currentPaymentsTotal) !== currentTotal) {
      const diff = Math.round(currentPaymentsTotal) - currentTotal
      toast({
        title: 'Error',
        description: diff < 0
          ? `Faltan ${formatPrice(-diff)} para cubrir el total`
          : `Sobran ${formatPrice(diff)} — ajusta el monto pagado (el vuelto se entrega por fuera del sistema)`,
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          customer_name: current.customerName || null,
          customer_phone: current.customerPhone || null,
          customer_id_number: current.customerIdNumber || null,
          notes: current.notes || null,
          items: current.cart.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id,
            manual_title: l.product_id ? undefined : l.title,
            manual_cost_cents: l.product_id ? undefined : l.cost_cents,
            qty: l.qty,
            price_cents: l.price_cents,
            discount_cents: l.discount_cents,
          })),
          payments: validPayments.map((p) => ({
            method: p.method,
            method_detail: p.method_detail || null,
            account_id: p.account_id || null,
            amount_cents: Math.round(parseFloat(p.amount) * 100),
          })),
          force,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        // Igual que el software local: avisa "Stock insuficiente" con opción
        // de continuar de todas formas (el stock nunca queda negativo).
        if (!force && typeof error.error === 'string' && error.error.includes('Stock insuficiente')) {
          setSaving(false)
          if (confirm(`${error.error}\n\n¿Continuar de todas formas?`)) {
            await handleSubmitSale(true)
          }
          return
        }
        throw new Error(error.error || 'Error al registrar la venta')
      }

      const { data } = await res.json()
      toast({ title: 'Venta registrada', description: `Orden ${data.order_number}` })

      // Si era una pestaña extra (no la primera), se cierra sola para no
      // acumular pestañas vacías; la primera pestaña se deja lista para la
      // siguiente venta, mostrando el link al recibo.
      const isFirst = sessions[0]?.id === activeId
      if (!isFirst && sessions.length > 1) {
        const remaining = sessions.filter((s) => s.id !== activeId)
        setSessions(remaining)
        setActiveSessionId(remaining[0].id)
      } else {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeId ? { ...newSession(s.label), lastSaleId: data.id } : s))
        )
      }
      await Promise.all([fetchAccounts(), fetchTodaySales()])
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
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al cancelar la venta')
      }
      toast({ title: 'Venta cancelada' })
      await fetchTodaySales()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Registrar Venta</h1>
        <p className="text-muted-foreground">Venta de mostrador — carrito, tallas y pagos combinados</p>
      </div>

      {/* Pestañas de venta en paralelo (estilo Alegra) */}
      <div className="flex flex-wrap items-center gap-1 border-b">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSessionId(s.id)}
            className={`group flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              s.id === activeSessionId
                ? 'border-primary bg-card text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {s.label}
            {s.cart.length > 0 && s.id !== activeSessionId && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
            {sessions.length > 1 && (
              <X
                className="h-3 w-3 text-muted-foreground opacity-0 hover:text-red-500 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  closeSessionTab(s.id)
                }}
              />
            )}
          </button>
        ))}
        <button
          onClick={addSessionTab}
          title="Nueva venta en paralelo"
          className="flex items-center gap-1 rounded-t-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Búsqueda + carrito */}
        <div className="space-y-4 lg:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre/SKU o escanear código de barras..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleBarcodeEnter}
              className="rounded-xl pl-10"
              autoFocus
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Ítem manual fuera de catálogo — igual que el software local,
              que permite vender un producto que no está en inventario. */}
          <div>
            {showManualForm ? (
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Producto fuera de catálogo</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="Nombre del producto"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="rounded-lg"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Precio de venta"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="rounded-lg"
                  />
                  {canViewProfit && (
                    <Input
                      type="number"
                      min="0"
                      placeholder="Costo (opcional)"
                      value={manualCost}
                      onChange={(e) => setManualCost(e.target.value)}
                      className="rounded-lg"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-lg" onClick={addManualItem}>
                    <Plus className="mr-1 h-3 w-3" /> Agregar al carrito
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setShowManualForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setShowManualForm(true)}>
                <Plus className="mr-1 h-3 w-3" /> Producto fuera de catálogo
              </Button>
            )}
          </div>

          {results.length > 0 && (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border bg-card p-2">
              {results.map((product) => (
                <div key={product.id} className="rounded-lg p-2 hover:bg-muted">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.sku || 'sin SKU'} · {formatPrice(product.price_cents)}
                      </p>
                    </div>
                    {product.variants.length === 0 ? (
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => addToCart(product, null)}>
                        <Plus className="mr-1 h-3 w-3" /> Agregar ({product.stock_qty})
                      </Button>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {product.variants.map((v) => (
                          <Button
                            key={v.id}
                            size="sm"
                            variant="outline"
                            className="rounded-lg"
                            onClick={() => addToCart(product, v)}
                          >
                            {v.talla || 'Única'} ({v.stock_qty})
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Carrito */}
          <div className="rounded-xl border bg-card">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <ShoppingCart className="mx-auto mb-2 h-8 w-8" />
                Busca un producto para agregarlo a la venta
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Producto</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">Cant.</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Precio</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Desc.</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((line) => (
                      <tr key={line.key} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          <p className="font-medium">{line.title}</p>
                          {line.talla && <Badge variant="outline" className="mt-1">{line.talla}</Badge>}
                          {!line.product_id && (
                            <Badge variant="outline" className="mt-1 border-amber-500/30 bg-amber-500/10 text-amber-600">
                              Fuera de catálogo
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="1"
                            max={line.max_stock}
                            value={line.qty}
                            onChange={(e) => updateCartLine(line.key, { qty: parseInt(e.target.value) || 1 })}
                            className="h-8 w-16 rounded-lg text-center"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="0"
                            value={line.price_cents / 100}
                            onChange={(e) =>
                              updateCartLine(line.key, { price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                            }
                            className="h-8 w-28 rounded-lg text-right"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="0"
                            value={line.discount_cents / 100}
                            onChange={(e) =>
                              updateCartLine(line.key, { discount_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                            }
                            className="h-8 w-24 rounded-lg text-right"
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatPrice(line.qty * line.price_cents - line.discount_cents)}
                        </td>
                        <td className="px-4 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeCartLine(line.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Datos del cliente */}
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Cliente (opcional)</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="Nombre" value={activeSession.customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded-lg" />
              <Input placeholder="Teléfono" value={activeSession.customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded-lg" />
              <Input placeholder="Cédula" value={activeSession.customerIdNumber} onChange={(e) => setCustomerIdNumber(e.target.value)} className="rounded-lg" />
            </div>
            <Input
              placeholder="Notas (opcional)"
              value={activeSession.notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-3 rounded-lg"
            />
          </div>
        </div>

        {/* Pagos + resumen */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-green-500"><span>Descuento</span><span>-{formatPrice(totalDiscount)}</span></div>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{formatPrice(total)}</span></div>
              {canViewProfit && (
                <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Costo</span><span>{formatPrice(totalCost)}</span></div>
                  <div className="flex justify-between"><span>Ganancia estimada</span><span className={estimatedProfit >= 0 ? 'text-green-500' : 'text-red-500'}>{formatPrice(estimatedProfit)}</span></div>
                  <div className="flex justify-between"><span>Comisión estimada</span><span>{formatPrice(Math.round(estimatedCommission))}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Pago</h2>
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.key} className="space-y-2 rounded-lg border p-2">
                  <div className="flex gap-2">
                    <select
                      value={p.method}
                      onChange={(e) => updatePaymentSplit(p.key, { method: e.target.value as PaymentSplit['method'] })}
                      className="flex-1 rounded-lg border bg-background px-2 py-1 text-xs"
                    >
                      {Object.entries(methodLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {payments.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePaymentSplit(p.key)}>
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                  </div>
                  {(p.method === 'card' || p.method === 'other') && (
                    <Input
                      placeholder={p.method === 'card' ? 'Débito o Crédito' : 'Especifica...'}
                      value={p.method_detail}
                      onChange={(e) => updatePaymentSplit(p.key, { method_detail: e.target.value })}
                      className="h-8 rounded-lg text-xs"
                    />
                  )}
                  <select
                    value={p.account_id}
                    onChange={(e) => updatePaymentSplit(p.key, { account_id: e.target.value })}
                    className="w-full rounded-lg border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Cuenta (opcional)...</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Monto"
                    value={p.amount}
                    onChange={(e) => updatePaymentSplit(p.key, { amount: e.target.value })}
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={addPaymentSplit}>
                <Plus className="mr-1 h-3 w-3" /> Agregar otro método
              </Button>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Pagado</span>
                <span>{formatPrice(Math.round(paymentsTotal))}</span>
              </div>
              {Math.round(paymentsTotal) !== total && (
                <div className={`flex justify-between text-xs font-medium ${Math.round(paymentsTotal) < total ? 'text-red-500' : 'text-amber-500'}`}>
                  <span>{Math.round(paymentsTotal) < total ? 'Falta' : 'Sobra (vuelto por fuera)'}</span>
                  <span>{formatPrice(Math.abs(Math.round(paymentsTotal) - total))}</span>
                </div>
              )}
            </div>
          </div>

          <Button className="w-full rounded-xl" size="lg" onClick={() => handleSubmitSale()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Registrar venta
          </Button>

          {sessions.length > 1 && (
            <p className="text-center text-xs text-muted-foreground">
              Tienes {sessions.length} ventas en paralelo — cambia de pestaña arriba para atender otro cliente sin perder esta.
            </p>
          )}

          {activeSession.lastSaleId && (
            <a
              href={`/api/orders/${activeSession.lastSaleId}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium text-cyan-500 hover:bg-cyan-500/10"
            >
              <Receipt className="h-4 w-4" /> Ver recibo de la última venta
            </a>
          )}
        </div>
      </div>

      {/* Ventas de hoy */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Ventas de hoy</h2>
        {loadingSales ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : todaySales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay ventas de mostrador registradas hoy.</p>
        ) : (
          <div className="space-y-2">
            {todaySales.map((sale) => {
              const saleCost = (sale.order_items || []).reduce(
                (sum: number, i: any) => sum + i.qty * (i.cost_cents || 0),
                0
              )
              const saleProfit = sale.total_cents - saleCost
              return (
              <div key={sale.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    {sale.order_number} — {sale.customer_name || 'Cliente de mostrador'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(sale.order_items || []).length} producto(s) ·{' '}
                    {new Date(sale.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {canViewProfit && (
                    <p className="text-xs text-muted-foreground">
                      Costo {formatPrice(saleCost)} · Ganancia{' '}
                      <span className={saleProfit >= 0 ? 'text-green-500' : 'text-red-500'}>{formatPrice(saleProfit)}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold">{formatPrice(sale.total_cents)}</p>
                  {sale.status === 'cancelled' ? (
                    <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Cancelada</Badge>
                  ) : (
                    <>
                      <a
                        href={`/api/orders/${sale.id}/invoice`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-cyan-500 hover:underline"
                      >
                        Recibo
                      </a>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleCancelSale(sale.id)}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
