import { notFound } from 'next/navigation'
import { getServiceSupabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Check, Package, Clock, CreditCard, MapPin } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { BRAND } from '@/config/brand'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ session_id?: string }>
}

export default async function OrderConfirmationPage({
  params,
}: PageProps) {
  const { id } = await params
  const supabase = getServiceSupabase()

  // Fetch order with items and payment info
  const { data: orderData, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*),
      payments(*)
    `)
    .eq('id', id)
    .single()

  if (error || !orderData) {
    notFound()
  }

  const order = orderData as any

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getPaymentMethodName = (method: string) => {
    const methods: Record<string, string> = {
      card: 'Tarjeta de Crédito/Débito',
      transfer: 'Transferencia Bancaria',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      cash: 'Efectivo',
      mercadopago: 'MercadoPago',
    }
    return methods[method] || method
  }

  const getPaymentStatusBadge = (status: string) => {
    // Un cliente puede volver a este enlace después de que un admin marque
    // la orden como reembolsada — sin esta entrada, "refunded" se imprimía
    // tal cual (en inglés) en vez de traducirse (mismo tipo de bug que el
    // badge del Dashboard, ver admin/ordenes/page.tsx paymentLabels).
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      paid: 'default',
      pending: 'secondary',
      failed: 'destructive',
      refunded: 'outline',
    }

    const labels: Record<string, string> = {
      paid: 'Pagado',
      pending: 'Pendiente',
      failed: 'Fallido',
      refunded: 'Reembolsado',
    }

    return (
      <Badge variant={variants[status] || 'outline'}>
        {labels[status] || status}
      </Badge>
    )
  }

  const renderPaymentInstructions = () => {
    // Antes solo se ocultaban si ya estaba paid — un cliente que vuelve a
    // este enlace después de un reembolso o un pago fallido volvía a ver
    // "transfiere a esta cuenta", pidiéndole pagar algo que ya no aplica
    // (o ya pagó y le devolvieron el dinero). Solo tiene sentido mostrarlas
    // mientras el pago sigue realmente pendiente.
    if (order.payment_status !== 'pending' || order.payment_method === 'card') {
      return null
    }

    let instructions
    switch (order.payment_method) {
      case 'transfer':
        instructions = (
          <div className="space-y-2">
            <p className="text-sm"><strong>Banco:</strong> {BRAND.payment.bank.bankName}</p>
            <p className="text-sm"><strong>Tipo de cuenta:</strong> {BRAND.payment.bank.accountType}</p>
            <p className="text-sm"><strong>Número de cuenta:</strong> {BRAND.payment.bank.accountNumber}</p>
            <p className="text-sm"><strong>Titular:</strong> {BRAND.payment.bank.holderName}</p>
            <p className="text-sm"><strong>NIT:</strong> {BRAND.payment.bank.nit}</p>
          </div>
        )
        break
      case 'nequi':
        instructions = (
          <div className="space-y-2">
            <p className="text-sm"><strong>Número de celular:</strong> {BRAND.payment.nequi.phone}</p>
            <p className="text-sm"><strong>Nombre:</strong> {BRAND.payment.nequi.name}</p>
          </div>
        )
        break
      case 'daviplata':
        instructions = (
          <div className="space-y-2">
            <p className="text-sm"><strong>Número de celular:</strong> {BRAND.payment.daviplata.phone}</p>
            <p className="text-sm"><strong>Nombre:</strong> {BRAND.payment.daviplata.name}</p>
          </div>
        )
        break
      default:
        return null
    }

    return (
      <Card className="bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Instrucciones de Pago
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {instructions}
          <div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
            <p className="text-sm font-semibold text-amber-900">
              Referencia de pago: {order.order_number}
            </p>
            <p className="text-xs text-amber-800 mt-1">
              ⚠️ Es muy importante incluir este número como referencia
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Recibirás un email de confirmación una vez validemos tu pago (1-2 horas hábiles)
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="container max-w-4xl py-8 md:py-16">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">¡Gracias por tu compra!</h1>
        <p className="text-muted-foreground">
          {order.payment_status === 'paid'
            ? 'Tu orden ha sido confirmada y estamos procesando tu pedido.'
            : order.payment_status === 'pending'
            ? 'Hemos recibido tu orden. Por favor completa el pago para procesarla.'
            : order.payment_status === 'refunded'
            ? 'Esta orden fue reembolsada.'
            : 'Hubo un problema con el pago de esta orden.'}
        </p>
      </div>

      {/* Order Info */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Información de la Orden
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Número de orden</p>
              <p className="font-semibold">{order.order_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fecha</p>
              <p className="text-sm">{formatDate(order.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estado de pago</p>
              <div className="mt-1">{getPaymentStatusBadge(order.payment_status)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Método de Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Método seleccionado</p>
              <p className="font-semibold">{getPaymentMethodName(order.payment_method)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(order.total_cents)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Instructions (if manual payment) */}
      {renderPaymentInstructions()}

      {/* Order Items */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(order.order_items as any[]).map((item: any) => (
              <div key={item.id} className="flex gap-4 pb-4 border-b last:border-0 last:pb-0">
                {item.product_image && (
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <Image
                      src={item.product_image}
                      alt={item.product_title}
                      fill
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product_title}</p>
                  {item.product_talla && (
                    <p className="text-sm text-muted-foreground">Talla: {item.product_talla}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Cantidad: {item.qty}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(item.total_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.price_cents)} c/u
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Order Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(order.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Envío</span>
              <span>{formatCurrency(order.shipping_cents)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(order.total_cents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipping Address */}
      {order.shipping_address && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Dirección de Envío
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {order.shipping_address.address}
              <br />
              {order.shipping_address.city}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      {order.payment_status === 'paid' && (
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg">Próximos Pasos</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Recibirás un email cuando tu orden sea enviada</li>
              <li>Podrás rastrear tu envío con el número de seguimiento</li>
              <li>Tiempo estimado de entrega: 3-5 días hábiles</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Button asChild>
          <Link href="/">Seguir comprando</Link>
        </Button>
      </div>
    </div>
  )
}
