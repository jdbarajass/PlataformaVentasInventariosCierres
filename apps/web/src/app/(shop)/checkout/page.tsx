'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, CreditCard, Banknote, Smartphone, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCart } from '@/lib/cart-context'
import { formatPrice } from '@/lib/utils'

const paymentMethods = [
  { id: 'card', name: 'Tarjeta de credito/debito', icon: CreditCard },
  { id: 'transfer', name: 'Transferencia bancaria', icon: Banknote },
  { id: 'nequi', name: 'Nequi', icon: Smartphone },
  { id: 'daviplata', name: 'Daviplata', icon: Smartphone },
]

export default function CheckoutPage() {
  const { state, totalPrice } = useCart()
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

  const shippingCost = totalPrice >= 20000000 ? 0 : 1500000 // Envio gratis sobre $200,000
  const finalTotal = totalPrice + shippingCost

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: state.items,
          customer: formData,
          payment_method: selectedPayment,
          subtotal_cents: totalPrice,
          shipping_cents: shippingCost,
          total_cents: finalTotal,
        }),
      })

      const data = await response.json()

      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else if (data.order_id) {
        window.location.href = `/orden/${data.order_id}/confirmacion`
      }
    } catch (error) {
      console.error('Error creating order:', error)
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
        <Link href="/">
          <Button className="mt-6">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Volver a la tienda
          </Button>
        </Link>
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
                    />
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
                    />
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
                  />
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
                  />
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
                  />
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
                  {paymentMethods.map((method) => (
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
                      <method.icon className="h-5 w-5" />
                      <span className="font-medium">{method.name}</span>
                    </button>
                  ))}
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

                {/* Totals */}
                <div className="space-y-2 border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
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
