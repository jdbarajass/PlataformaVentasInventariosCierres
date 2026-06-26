'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, CreditCard, Banknote, Smartphone, Loader2, ShoppingBag, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCart } from '@/lib/cart-context'
import { formatPrice } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { customerSchema } from '@/lib/validations/order'
import { apiFetch, ApiError } from '@/lib/api-client'
import type { PaymentMethod, ShippingConfig } from '@/lib/settings'

// Icono por método de pago
const PAYMENT_ICONS: Record<string, React.ElementType> = {
  card:         CreditCard,
  transfer:     Banknote,
  nequi:        Smartphone,
  daviplata:    Smartphone,
  cash:         Banknote,
  mercadopago:  ShoppingBag,
}

// Valores por defecto mientras carga la BD
const DEFAULT_SHIPPING: ShippingConfig = {
  free_shipping_threshold_cents: 20000000,
  default_shipping_cost_cents: 1500000,
  enabled: true,
}

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'card',      name: 'Tarjeta de credito/debito', enabled: true },
  { id: 'transfer',  name: 'Transferencia bancaria',    enabled: true },
  { id: 'nequi',     name: 'Nequi',                     enabled: true },
  { id: 'daviplata', name: 'Daviplata',                  enabled: true },
]

export default function CheckoutPage() {
  const { state, totalPrice } = useCart()
  const { toast } = useToast()
  const [selectedPayment, setSelectedPayment] = useState('card')
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
    address: '',
    city: '',
    notes: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Cupón de descuento
  const [couponCode, setCouponCode] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: string; code: string; description: string | null;
    discount_type: string; discount_value: number; discount_cents: number;
  } | null>(null)
  const [couponError, setCouponError] = useState('')

  // Settings desde BD
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig>(DEFAULT_SHIPPING)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS)

  useEffect(() => {
    apiFetch<{ data: { shipping_config?: ShippingConfig; payment_methods?: PaymentMethod[] } }>('/api/settings')
      .then(({ data }) => {
        if (!data) return
        if (data.shipping_config) setShippingConfig(data.shipping_config)
        if (data.payment_methods) {
          // Solo mostrar métodos habilitados
          const enabled = data.payment_methods.filter((m) => m.enabled)
          if (enabled.length > 0) setPaymentMethods(enabled)
        }
      })
      .catch(() => {
        // Si falla, mantiene los defaults — la tienda sigue funcionando
      })
  }, [])

  // Calcular envío con valores de la BD
  const shippingCost =
    shippingConfig.enabled && totalPrice < shippingConfig.free_shipping_threshold_cents
      ? shippingConfig.default_shipping_cost_cents
      : 0

  const discountCents = appliedCoupon?.discount_cents || 0
  const finalTotal = Math.max(0, totalPrice - discountCents + shippingCost)

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponError('')

    try {
      const data = await apiFetch<{ coupon: typeof appliedCoupon }>('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponCode, subtotal_cents: totalPrice }),
      })
      setAppliedCoupon(data.coupon)
      setCouponError('')
    } catch (error) {
      setCouponError(error instanceof ApiError ? error.message : 'Error al validar cupon')
      setAppliedCoupon(null)
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validation = customerSchema.safeParse(formData)
    if (!validation.success) {
      const errors: Record<string, string> = {}
      for (const issue of validation.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !errors[field]) {
          errors[field] = issue.message
        }
      }
      setFieldErrors(errors)
      toast({
        title: 'Revisa el formulario',
        description: 'Hay datos incompletos o invalidos antes de continuar.',
        variant: 'destructive',
      })
      return
    }
    setFieldErrors({})
    setIsLoading(true)

    try {
      const data = await apiFetch<{ checkout_url?: string; order_id?: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: state.items,
          customer: formData,
          payment_method: selectedPayment,
          coupon_code: appliedCoupon?.code || null,
        }),
      })

      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else if (data.order_id) {
        window.location.href = `/orden/${data.order_id}/confirmacion`
      }
    } catch (error) {
      console.error('Error creating order:', error)
      toast({
        title: 'No pudimos procesar tu orden',
        description: error instanceof ApiError ? error.message : 'No pudimos comunicarnos con el servidor. Verifica tu internet e intenta de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (state.items.length === 0) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-2xl font-bold">Tu carrito esta vacio</h1>
        <p className="mt-2 text-muted-foreground">
          Agrega productos antes de continuar al checkout.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Volver a la tienda
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <Link href="/" className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="mr-1 h-4 w-4" />
        Volver a la tienda
      </Link>

      <h1 className="mb-8 text-3xl font-bold">Checkout</h1>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Form */}
          <div className="space-y-6 lg:col-span-2">
            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle>Informacion de contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Nombre completo *
                    </label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Tu nombre"
                      className={fieldErrors.name ? 'border-red-500' : ''}
                    />
                    {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Email *
                    </label>
                    <Input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="tu@email.com"
                      className={fieldErrors.email ? 'border-red-500' : ''}
                    />
                    {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Telefono *
                  </label>
                  <Input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+57 314 406 5520"
                    className={fieldErrors.phone ? 'border-red-500' : ''}
                  />
                  {fieldErrors.phone && <p className="mt-1 text-xs text-red-500">{fieldErrors.phone}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Shipping */}
            <Card>
              <CardHeader>
                <CardTitle>Direccion de envio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Direccion *
                  </label>
                  <Input
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Calle, numero, apartamento"
                    className={fieldErrors.address ? 'border-red-500' : ''}
                  />
                  {fieldErrors.address && <p className="mt-1 text-xs text-red-500">{fieldErrors.address}</p>}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Ciudad *
                  </label>
                  <Input
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Ciudad"
                    className={fieldErrors.city ? 'border-red-500' : ''}
                  />
                  {fieldErrors.city && <p className="mt-1 text-xs text-red-500">{fieldErrors.city}</p>}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Notas (opcional)
                  </label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Instrucciones especiales de entrega"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            <Card>
              <CardHeader>
                <CardTitle>Metodo de pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentMethods.map((method) => {
                    const Icon = PAYMENT_ICONS[method.id] ?? CreditCard
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedPayment(method.id)}
                        className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                          selectedPayment === method.id
                            ? 'border-primary bg-primary/5 ring-2 ring-primary'
                            : 'hover:border-primary/50'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{method.name}</span>
                      </button>
                    )
                  })}
                </div>
                {(selectedPayment === 'nequi' || selectedPayment === 'daviplata') && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    * Recibiras instrucciones de pago por email despues de confirmar tu orden.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Resumen del pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Items */}
                <ul className="divide-y">
                  {state.items.map((item) => (
                    <li key={item.id} className="flex gap-3 py-3">
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                        <Image
                          src={item.image}
                          alt={item.title}
                          fill
                          className="object-cover"
                        />
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {item.qty}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium line-clamp-2">
                          {item.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatPrice(item.price_cents * item.qty)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Coupon */}
                <div className="border-t pt-4">
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          {appliedCoupon.code}
                        </span>
                        <span className="text-xs text-green-600 dark:text-green-500">
                          (-{formatPrice(appliedCoupon.discount_cents)})
                        </span>
                      </div>
                      <button onClick={handleRemoveCoupon} className="text-green-600 hover:text-green-800">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Codigo de cupon"
                          value={couponCode}
                          onChange={(e) => { setCouponCode(e.target.value); setCouponError('') }}
                          className="text-sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading || !couponCode.trim()}
                        >
                          {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                        </Button>
                      </div>
                      {couponError && (
                        <p className="mt-1 text-xs text-red-500">{couponError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="space-y-2 border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  {discountCents > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Descuento</span>
                      <span>-{formatPrice(discountCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Envio</span>
                    <span>
                      {shippingCost === 0 ? (
                        <span className="text-green-600">Gratis</span>
                      ) : (
                        formatPrice(shippingCost)
                      )}
                    </span>
                  </div>
                  {shippingCost > 0 && shippingConfig.free_shipping_threshold_cents > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Envio gratis en compras mayores a{' '}
                      {formatPrice(shippingConfig.free_shipping_threshold_cents)}
                    </p>
                  )}
                  <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(finalTotal)}</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="neon"
                  size="lg"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    `Pagar ${formatPrice(finalTotal)}`
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Al completar tu compra, aceptas nuestros{' '}
                  <Link href="/terminos" className="underline">
                    terminos y condiciones
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
