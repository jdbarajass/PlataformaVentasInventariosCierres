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
  product_id: string
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
  method: 'cash' | 'card' | 'transfer' | 'addi' | 'other'
  method_detail: string
  account_id: string
  amount: string
}

interface Account {
  id: string
  name: string
  color: string | null
}

const methodLabels: Record<PaymentSplit['method'], string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
  transfer: 'Transferencia',
  addi: 'Addi',
  other: 'Otro',
}

export default function VentasPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [payments, setPayments] = useState<PaymentSplit[]>([
    { key: crypto.randomUUID(), method: 'cash', method_detail: '', account_id: '', amount: '' },
  ])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerIdNumber, setCustomerIdNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [todaySales, setTodaySales] = useState<any[]>([])
  const [loadingSales, setLoadingSales] = useState(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()

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

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)

  const addToCart = (product: ProductResult, variant: ProductVariant | null) => {
    const key = variant ? `${product.id}:${variant.id}` : product.id
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key)
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...prev,
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
    })
  }

  const updateCartLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const removeCartLine = (key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key))
  }

  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.price_cents, 0)
  const totalDiscount = cart.reduce((sum, l) => sum + l.discount_cents, 0)
  const total = subtotal - totalDiscount
  const paymentsTotal = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0) * 100, 0)

  const addPaymentSplit = () => {
    setPayments((prev) => [
      ...prev,
      { key: crypto.randomUUID(), method: 'cash', method_detail: '', account_id: '', amount: '' },
    ])
  }

  const updatePaymentSplit = (key: string, patch: Partial<PaymentSplit>) => {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  const removePaymentSplit = (key: string) => {
    setPayments((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev))
  }

  const resetSale = () => {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setCustomerIdNumber('')
    setNotes('')
    setPayments([{ key: crypto.randomUUID(), method: 'cash', method_detail: '', account_id: '', amount: '' }])
    setLastSaleId(null)
  }

  const handleSubmitSale = async () => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos un producto al carrito', variant: 'destructive' })
      return
    }
    const validPayments = payments.filter((p) => parseFloat(p.amount) > 0)
    if (validPayments.length === 0) {
      toast({ title: 'Error', description: 'Ingresa al menos un método de pago', variant: 'destructive' })
      return
    }
    if (Math.round(paymentsTotal) < total) {
      toast({
        title: 'Error',
        description: `Los pagos (${formatPrice(paymentsTotal)}) no cubren el total (${formatPrice(total)})`,
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
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          customer_id_number: customerIdNumber || null,
          notes: notes || null,
          items: cart.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id,
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
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar la venta')
      }

      const { data } = await res.json()
      toast({ title: 'Venta registrada', description: `Orden ${data.order_number}` })
      setLastSaleId(data.id)
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setCustomerIdNumber('')
      setNotes('')
      setPayments([{ key: crypto.randomUUID(), method: 'cash', method_detail: '', account_id: '', amount: '' }])
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
              <Input placeholder="Nombre" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded-lg" />
              <Input placeholder="Teléfono" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded-lg" />
              <Input placeholder="Cédula" value={customerIdNumber} onChange={(e) => setCustomerIdNumber(e.target.value)} className="rounded-lg" />
            </div>
            <Input
              placeholder="Notas (opcional)"
              value={notes}
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
            </div>
          </div>

          <Button className="w-full rounded-xl" size="lg" onClick={handleSubmitSale} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Registrar venta
          </Button>

          {lastSaleId && (
            <a
              href={`/api/orders/${lastSaleId}/invoice`}
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
            {todaySales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    {sale.order_number} — {sale.customer_name || 'Cliente de mostrador'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(sale.order_items || []).length} producto(s) ·{' '}
                    {new Date(sale.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
