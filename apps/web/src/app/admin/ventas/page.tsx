'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  ShoppingCart,
  Receipt,
  X,
  ChevronDown,
  Package,
  Banknote,
  CreditCard,
  Smartphone,
  QrCode,
  Wallet,
  MoreHorizontal,
  Layers,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { bogotaDateStr, bogotaDayRange, bogotaTimeStr, bogotaToISO, formatBogotaTime } from '@/lib/bogota-time'

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
  barcode: string | null
  price_cents: number
  cost_cents: number
  stock_qty: number
  images: string[]
  variants: ProductVariant[]
  matched_variant_id?: string
}

interface Category {
  id: string
  name: string
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

type Method = 'cash' | 'card' | 'nequi' | 'nu' | 'qr' | 'daviplata' | 'addi' | 'sistecredito' | 'other'

interface PaymentSplit {
  key: string
  method: Method
  method_detail: string
  account_id: string
  amount: string
}

interface Account {
  id: string
  name: string
  payment_method: string
  color: string | null
}

// Los 4 sub-tipos de transferencia (Nequi/NU/QR/Daviplata) tienen comisión
// propia configurable en Comisiones y Gastos Fijos — igual que el software
// local, que nunca ofrece un "Transferencia" genérico, solo estos 4 nombres.
const methodLabels: Record<Method, string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
  nequi: 'Nequi',
  nu: 'NU',
  qr: 'QR/Bancolombia',
  daviplata: 'Daviplata',
  addi: 'Addi',
  sistecredito: 'SisteCrédito',
  other: 'Otro',
}

const methodIcons: Record<Method, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  card: CreditCard,
  nequi: Smartphone,
  nu: Smartphone,
  qr: QrCode,
  daviplata: Smartphone,
  addi: Wallet,
  sistecredito: Wallet,
  other: MoreHorizontal,
}

const emptyPayment = (method: Method = 'cash'): PaymentSplit => ({
  key: crypto.randomUUID(),
  method,
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
  // Fecha editable de la venta (por defecto hoy en Bogotá) — el software
  // local permite elegirla para registrar ventas de días anteriores (ej. si
  // se fue la luz y no se pudo registrar a tiempo). La hora siempre se
  // captura real al momento de dar clic en "Vender" (ver handleSubmitSale),
  // igual que Préstamos, para no arrastrar una hora vieja si el formulario
  // quedó abierto un rato — ver docs/UNIFICACION_YJBMOTOCOM.md sección 24.
  saleDate: string
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
  saleDate: bogotaDateStr(new Date()),
  lastSaleId: null,
})

export default function VentasPage() {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
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

  // Elegir talla de un producto con variantes — panel flotante sobre la
  // grilla en vez de expandir cada card (más simple de mantener en un grid).
  const [pickingVariantsFor, setPickingVariantsFor] = useState<ProductResult | null>(null)

  // Cliente colapsado por defecto (como "Consumidor final" en Alegra),
  // se expande solo si el vendedor necesita registrar los datos.
  const [showCustomerFields, setShowCustomerFields] = useState(false)

  // Modal de pago (se abre al presionar "Vender", igual que "Pagar factura"
  // en Alegra): primero se eligen tiles de método, o "Combinado" para el
  // editor de pagos divididos que ya existía.
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentStep, setPaymentStep] = useState<'methods' | 'single' | 'combined'>('methods')

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
      // Inicio del día en hora de Bogotá explícita — `setHours(0,0,0,0)`
      // usa la medianoche de la zona horaria del dispositivo, que solo es
      // correcta si el equipo está configurado en hora de Colombia.
      const { from } = bogotaDayRange(bogotaDateStr(new Date()))
      const res = await fetch(`/api/pos/sales?from=${from}`, {
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
    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setCategories(json?.categories || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!canViewProfit) return
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.pos_commission_rates) setCommissionRates(json.data.pos_commission_rates)
      })
      .catch(() => {})
  }, [canViewProfit])

  // Sin texto de búsqueda se muestra igual una grilla navegable (modo
  // catálogo, como el POS de Alegra) — /api/pos/search ya soporta esto.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      if (!session?.access_token) return
      setSearching(true)
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        if (categoryId) params.set('category_id', categoryId)
        const res = await fetch(`/api/pos/search?${params.toString()}`, {
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
  }, [query, categoryId, session?.access_token, authHeaders])

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
              // Si ya está en 0, no hay un tope real de inventario que
              // respetar — se deja un margen amplio para poder forzar la
              // cantidad que el vendedor necesite; el backend sigue
              // exigiendo confirmar "Stock insuficiente ¿continuar?" al
              // registrar la venta (create_pos_sale con p_force).
              max_stock: (variant ? variant.stock_qty : product.stock_qty) || 999,
            },
          ]
      return { ...s, cart }
    })
  }

  const handleCardClick = (product: ProductResult) => {
    if (product.variants.length === 0) {
      addToCart(product, null)
    } else {
      setPickingVariantsFor(product)
    }
  }

  const handlePickVariant = (product: ProductResult, variant: ProductVariant) => {
    addToCart(product, variant)
    setPickingVariantsFor(null)
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
    // El costo de un ítem fuera de catálogo no revela ningún margen del
    // catálogo real (el vendedor es quien acaba de fijar ese costo, ej. un
    // producto que consiguió en otro local para revender) — a diferencia
    // del costo de un producto SÍ catalogado, este campo no se oculta por
    // rol. Antes se forzaba a 0 para cualquiera que no fuera admin,
    // perdiendo el costo real que la vendedora sí necesitaba registrar.
    const cost = Math.round((parseFloat(manualCost) || 0) * 100)
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

  // Cada método de pago se abona siempre a la cuenta del mismo nombre (ver
  // /admin/cuentas) — antes había un selector "Cuenta (opcional)" aparte que
  // permitía elegir cualquier cuenta sin importar el método, algo que
  // generaba confusión y en la práctica esta tienda nunca usa (una cuenta
  // por método, sin excepciones). Si no existe una cuenta con ese método
  // (ej. la desactivaron), la venta se registra igual pero sin abonar a
  // ninguna cuenta — mismo comportamiento que antes al dejar el campo vacío.
  const resolveAccountId = useCallback(
    (method: Method) => accounts.find((a) => a.payment_method === method)?.id || '',
    [accounts]
  )

  const addPaymentSplit = () => {
    updateActiveSession((s) => ({ ...s, payments: [...s.payments, { ...emptyPayment(), account_id: resolveAccountId('cash') }] }))
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
  const setSaleDate = (v: string) => updateActiveSession((s) => ({ ...s, saleDate: v }))

  // Vacía la pestaña activa (carrito, cliente, pagos, ítem manual) — pide
  // confirmación para no perder por accidente una venta a medio armar.
  const limpiarVenta = () => {
    if (!confirm('¿Limpiar esta venta? Se borrará el carrito, el cliente y el método de pago de esta pestaña.')) return
    updateActiveSession((s) => ({
      ...s,
      cart: [],
      payments: [emptyPayment()],
      customerName: '',
      customerPhone: '',
      customerIdNumber: '',
      notes: '',
      saleDate: bogotaDateStr(new Date()),
    }))
    setManualTitle('')
    setManualPrice('')
    setManualCost('')
    setShowManualForm(false)
    setShowCustomerFields(false)
  }

  // Abre el modal de pago — "Vender" en Alegra abre "Pagar factura". Si solo
  // hay un producto o el carrito está vacío se avisa antes de abrir nada.
  const openPaymentModal = () => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos un producto al carrito', variant: 'destructive' })
      return
    }
    setPaymentStep('methods')
    setShowPaymentModal(true)
  }

  const selectQuickMethod = (method: Method) => {
    updateActiveSession((s) => ({
      ...s,
      payments: [{ ...emptyPayment(method), account_id: resolveAccountId(method), amount: (total / 100).toString() }],
    }))
    setPaymentStep('single')
  }

  const selectCombined = () => {
    updateActiveSession((s) => ({
      ...s,
      payments: s.payments.length > 1
        ? s.payments
        : [
            { ...emptyPayment(), account_id: resolveAccountId('cash') },
            { ...emptyPayment(), account_id: resolveAccountId('cash') },
          ],
    }))
    setPaymentStep('combined')
  }

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
          // La hora siempre se captura real al momento del clic en "Vender"
          // (no la de apertura del formulario) — solo la fecha es editable,
          // igual que Préstamos (ver docs/UNIFICACION_YJBMOTOCOM.md sección 28).
          created_at: bogotaToISO(current.saleDate, bogotaTimeStr(new Date())),
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
      setShowPaymentModal(false)

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

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Búsqueda + grilla de productos */}
        <div className="space-y-4 lg:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
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
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-xl border bg-background px-3 py-2 text-sm"
            >
              <option value="">Categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
                  <MoneyInput placeholder="Precio de venta" value={manualPrice} onChange={setManualPrice} className="rounded-lg" />
                  <MoneyInput placeholder="Costo (opcional)" value={manualCost} onChange={setManualCost} className="rounded-lg" />
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

          {/* Elegir talla — panel flotante sobre la grilla */}
          {pickingVariantsFor && (
            <div className="rounded-xl border-2 border-primary bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Elige la talla de &quot;{pickingVariantsFor.title}&quot;</p>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPickingVariantsFor(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pickingVariantsFor.variants.map((v) => (
                  <Button
                    key={v.id}
                    size="sm"
                    variant="outline"
                    className={v.stock_qty === 0 ? 'rounded-lg border-amber-500/40 text-amber-600' : 'rounded-lg'}
                    // No se deshabilita aunque esté en 0: bloquear aquí le
                    // quitaba al vendedor la opción de forzar la venta (ej.
                    // "CASCO SHAFT 560 NEGRO MATE" sin unidades) — el
                    // backend igual exige confirmar "Stock insuficiente
                    // ¿continuar?" al registrar, igual que ya pasa con
                    // productos sin tallas.
                    title={
                      v.stock_qty === 0
                        ? `Sin stock — se puede forzar la venta al confirmar${v.barcode ? ` · ${v.barcode}` : ''}`
                        : v.barcode || undefined
                    }
                    onClick={() => handlePickVariant(pickingVariantsFor, v)}
                  >
                    {v.talla || 'Única'} ({v.stock_qty === 0 ? 'agotada' : v.stock_qty})
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Grilla de productos (estilo Alegra) */}
          <div className="max-h-[42rem] overflow-y-auto rounded-xl border bg-card p-3">
            {searching && results.length === 0 ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No se encontraron productos</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {results.map((product) => {
                  const totalStock =
                    product.variants.length > 0
                      ? product.variants.reduce((s, v) => s + v.stock_qty, 0)
                      : product.stock_qty
                  const agotado = totalStock === 0
                  // Un producto con tallas no tiene un solo código de barras
                  // (cada talla tiene el suyo, ver el selector de talla más
                  // abajo) — en ese caso la insignia de arriba muestra el
                  // conteo de tallas en vez de un código, y no se mezcla con
                  // "Inv. N" (antes iban juntos en la misma línea y era
                  // fácil confundir cuál número era cuál). Para un producto
                  // sin tallas, la insignia sigue mostrando su código de
                  // barras o SKU — nunca el fragmento del id interno que se
                  // mostraba antes (ej. "F57BE55C"), que no significaba nada.
                  const insignia =
                    product.variants.length > 0
                      ? `${product.variants.length} talla${product.variants.length !== 1 ? 's' : ''}`
                      : product.barcode || product.sku
                  return (
                    <button
                      key={product.id}
                      onClick={() => handleCardClick(product)}
                      className="flex flex-col rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary hover:shadow-sm"
                    >
                      {insignia && (
                        <span className="mb-1 self-start rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-cyan-600">
                          {insignia}
                        </span>
                      )}
                      <div className="flex h-16 items-center justify-center">
                        <Package className="h-9 w-9 text-muted-foreground/30" />
                      </div>
                      <p
                        className={`text-center text-xs font-medium ${
                          agotado ? 'text-amber-600' : 'text-cyan-600'
                        }`}
                      >
                        {agotado ? 'Agotado' : `Inv. ${totalStock}`}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-tight">{product.title}</p>
                      <p className="mt-1 font-bold">{formatPrice(product.price_cents)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Factura de venta */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Factura de venta</h2>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={activeSession.saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  title="Fecha de la venta — se puede cambiar para registrar ventas de días anteriores"
                  className="h-8 w-auto rounded-lg text-xs"
                />
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs font-normal" onClick={limpiarVenta}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Limpiar
                </Button>
              </div>
            </div>

            <button
              onClick={() => setShowCustomerFields((v) => !v)}
              className="mb-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <span>Cliente: {activeSession.customerName || 'Consumidor final'}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showCustomerFields ? 'rotate-180' : ''}`} />
            </button>
            {showCustomerFields && (
              <div className="mb-3 space-y-2 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder="Nombre" value={activeSession.customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded-lg" />
                  <Input placeholder="Teléfono" value={activeSession.customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded-lg" />
                  <Input placeholder="Cédula" value={activeSession.customerIdNumber} onChange={(e) => setCustomerIdNumber(e.target.value)} className="rounded-lg" />
                </div>
                <Input
                  placeholder="Notas (opcional)"
                  value={activeSession.notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-lg"
                />
              </div>
            )}

            {/* Carrito compacto */}
            <div className="rounded-lg border">
              {cart.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <ShoppingCart className="mx-auto mb-2 h-8 w-8" />
                  Busca un producto para agregarlo a la venta
                </div>
              ) : (
                <div className="max-h-80 divide-y overflow-y-auto">
                  {cart.map((line) => (
                    <div key={line.key} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{line.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {line.talla && <Badge variant="outline">{line.talla}</Badge>}
                            {!line.product_id && (
                              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">
                                Fuera de catálogo
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeCartLine(line.key)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 rounded-lg border">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateCartLine(line.key, { qty: Math.max(1, line.qty - 1) })}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <input
                            type="number"
                            min="1"
                            max={line.max_stock}
                            value={line.qty}
                            onChange={(e) =>
                              updateCartLine(line.key, {
                                qty: Math.min(line.max_stock, Math.max(1, parseInt(e.target.value) || 1)),
                              })
                            }
                            className="w-10 border-0 bg-transparent text-center text-sm font-medium focus:outline-none"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateCartLine(line.key, { qty: Math.min(line.max_stock, line.qty + 1) })}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Precio</span>
                          <MoneyInput
                            value={String(line.price_cents / 100)}
                            onChange={(v) => updateCartLine(line.key, { price_cents: (parseInt(v) || 0) * 100 })}
                            className="h-7 w-24 rounded-lg text-right text-xs"
                          />
                        </div>
                        <p className="font-medium">{formatPrice(line.qty * line.price_cents - line.discount_cents)}</p>
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <span>Descuento</span>
                        <MoneyInput
                          value={String(line.discount_cents / 100)}
                          onChange={(v) => updateCartLine(line.key, { discount_cents: (parseInt(v) || 0) * 100 })}
                          className="h-7 w-24 rounded-lg text-right text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-green-500"><span>Descuento</span><span>-{formatPrice(totalDiscount)}</span></div>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{formatPrice(total)}</span></div>
              {canViewProfit && (
                <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Costo</span><span>{formatPrice(totalCost)}</span></div>
                  <div className="flex justify-between"><span>Ganancia estimada</span><span className={estimatedProfit >= 0 ? 'text-green-500' : 'text-red-500'}>{formatPrice(estimatedProfit)}</span></div>
                </div>
              )}
            </div>
          </div>

          <Button className="w-full rounded-xl" size="lg" onClick={openPaymentModal} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Vender {formatPrice(total)}
          </Button>

          {sessions.length > 1 && (
            <p className="text-center text-xs text-muted-foreground">
              Tienes {sessions.length} ventas en paralelo — cambia de pestaña arriba para atender otro cliente sin perder esta.
            </p>
          )}

          {activeSession.lastSaleId && (
            <div className="flex items-center justify-center gap-3 rounded-xl border p-3">
              <a
                href={`/api/orders/${activeSession.lastSaleId}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-cyan-500 hover:underline"
              >
                <Receipt className="h-4 w-4" /> Ver recibo de la última venta
              </a>
              <a
                href={`/api/orders/${activeSession.lastSaleId}/invoice?formato=clasico`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:underline"
                title="Recibo clásico tamaño carta (en vez del térmico 80mm)"
              >
                (clásico)
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Modal de pago — "Pagar factura" al estilo Alegra */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {paymentStep === 'methods' ? 'Pagar factura' : 'Confirmar pago'}
              </h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPaymentModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4 text-center">
              <p className="text-xs uppercase text-muted-foreground">Total</p>
              <p className="text-3xl font-bold">{formatPrice(total)}</p>
            </div>

            {paymentStep === 'methods' && (
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(methodLabels) as Method[]).map((m) => {
                  const Icon = methodIcons[m]
                  return (
                    <button
                      key={m}
                      onClick={() => selectQuickMethod(m)}
                      className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center hover:border-primary hover:bg-muted"
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{methodLabels[m]}</span>
                    </button>
                  )
                })}
                <button
                  onClick={selectCombined}
                  className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center hover:border-primary hover:bg-muted"
                >
                  <Layers className="h-6 w-6" />
                  <span className="text-xs font-medium">Combinado</span>
                </button>
              </div>
            )}

            {paymentStep === 'single' && payments.length === 1 && (
              <div className="space-y-3">
                <button
                  onClick={() => setPaymentStep('methods')}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Cambiar método
                </button>
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">{methodLabels[payments[0].method]}</p>
                  {(payments[0].method === 'card' || payments[0].method === 'other') && (
                    <Input
                      placeholder={payments[0].method === 'card' ? 'Débito o Crédito' : 'Especifica...'}
                      value={payments[0].method_detail}
                      onChange={(e) => updatePaymentSplit(payments[0].key, { method_detail: e.target.value })}
                      className="mb-2 rounded-lg"
                    />
                  )}
                  <label className="mb-1 block text-xs text-muted-foreground">Monto recibido</label>
                  <MoneyInput
                    value={payments[0].amount}
                    onChange={(v) => updatePaymentSplit(payments[0].key, { amount: v })}
                    className="rounded-lg"
                  />
                </div>
                {Math.round(paymentsTotal) !== total && (
                  <p className={`text-xs font-medium ${Math.round(paymentsTotal) < total ? 'text-red-500' : 'text-amber-500'}`}>
                    {Math.round(paymentsTotal) < total
                      ? `Faltan ${formatPrice(total - Math.round(paymentsTotal))}`
                      : `Sobran ${formatPrice(Math.round(paymentsTotal) - total)} (vuelto por fuera del sistema)`}
                  </p>
                )}
                {canViewProfit && estimatedCommission > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Comisión estimada: {formatPrice(Math.round(estimatedCommission))}
                  </p>
                )}
                <Button className="w-full rounded-xl" size="lg" onClick={() => handleSubmitSale()} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar venta
                </Button>
              </div>
            )}

            {paymentStep === 'combined' && (
              <div className="space-y-3">
                <button
                  onClick={() => setPaymentStep('methods')}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Cambiar método
                </button>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {payments.map((p) => (
                    <div key={p.key} className="space-y-2 rounded-lg border p-2">
                      <div className="flex gap-2">
                        <select
                          value={p.method}
                          onChange={(e) => {
                            const newMethod = e.target.value as Method
                            updatePaymentSplit(p.key, { method: newMethod, account_id: resolveAccountId(newMethod) })
                          }}
                          className="flex-1 rounded-lg border bg-background px-2 py-1 text-xs"
                        >
                          {(Object.keys(methodLabels) as Method[]).map((value) => (
                            <option key={value} value={value}>{methodLabels[value]}</option>
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
                      <MoneyInput
                        placeholder="Monto"
                        value={p.amount}
                        onChange={(v) => updatePaymentSplit(p.key, { amount: v })}
                        className="h-8 rounded-lg text-xs"
                      />
                    </div>
                  ))}
                </div>
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
                {canViewProfit && estimatedCommission > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Comisión estimada: {formatPrice(Math.round(estimatedCommission))}
                  </p>
                )}
                <Button className="w-full rounded-xl" size="lg" onClick={() => handleSubmitSale()} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar venta
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

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
                    {formatBogotaTime(sale.created_at)}
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
                      <a
                        href={`/api/orders/${sale.id}/invoice?formato=clasico`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline"
                        title="Recibo clásico tamaño carta"
                      >
                        (clásico)
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
