'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Eye, Truck, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDateTime } from '@/lib/utils'
import { Order } from '@/types/database'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/lib/auth-context'

const statusLabels: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'secondary' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  processing: { label: 'Procesando', variant: 'default' },
  shipped: { label: 'Enviado', variant: 'success' },
  delivered: { label: 'Entregado', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'error' },
  refunded: { label: 'Reembolsado', variant: 'secondary' },
}

const paymentLabels: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  paid: { label: 'Pagado', variant: 'success' },
  failed: { label: 'Fallido', variant: 'error' },
  refunded: { label: 'Reembolsado', variant: 'default' },
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const { toast } = useToast()
  const { session } = useAuth()

  // GET/PUT /api/orders exige admin/seller (requireAuth) — sin el header
  // Authorization la API devuelve 401 {error: ...}, y como antes se hacía
  // `setOrders(data || [])` sin validar que fuera un arreglo, ese objeto de
  // error terminaba en el estado y `orders.filter(...)` reventaba la
  // página entera ("Algo salió mal").
  const fetchOrders = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/orders?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, session?.access_token])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const openOrderModal = (order: Order) => {
    setSelectedOrder(order)
    setNewStatus(order.status)
    const meta = (order.metadata as any) || {}
    setTrackingNumber(meta.tracking_number || '')
    setTrackingUrl(meta.tracking_url || '')
    setShowModal(true)
  }

  const handleUpdateOrder = async () => {
    if (!selectedOrder) return
    setUpdating(true)

    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          tracking_number: trackingNumber || undefined,
          tracking_url: trackingUrl || undefined,
        }),
      })

      if (res.ok) {
        toast({ title: 'Orden actualizada', description: `Estado: ${statusLabels[newStatus]?.label || newStatus}` })
        setShowModal(false)
        fetchOrders()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' })
    } finally {
      setUpdating(false)
    }
  }

  // Pagos manuales (transferencia/Nequi/Daviplata) nunca pasan por un
  // webhook de pasarela — hasta este botón, nada descontaba el stock de
  // esas ventas y el admin tenía que ajustar el inventario a mano.
  const handleMarkPaid = async () => {
    if (!selectedOrder) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ mark_paid: true }),
      })

      if (res.ok) {
        toast({ title: 'Pago confirmado', description: 'Se descontó el stock y se envió la confirmación al cliente.' })
        setShowModal(false)
        fetchOrders()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error al confirmar el pago', variant: 'destructive' })
    } finally {
      setUpdating(false)
    }
  }

  const filteredOrders = orders.filter((order) =>
    order.order_number.toLowerCase().includes(search.toLowerCase()) ||
    order.customer_email.toLowerCase().includes(search.toLowerCase()) ||
    order.customer_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Ordenes</h1>
        <p className="text-muted-foreground">
          Gestiona las ordenes de la tienda
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por numero de orden, email o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 rounded-xl border bg-background px-4 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="confirmed">Confirmados</option>
              <option value="processing">Procesando</option>
              <option value="shipped">Enviados</option>
              <option value="delivered">Entregados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredOrders.length} ordenes encontradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-4 font-medium">Orden</th>
                    <th className="pb-4 font-medium">Cliente</th>
                    <th className="pb-4 font-medium">Total</th>
                    <th className="pb-4 font-medium">Pago</th>
                    <th className="pb-4 font-medium">Estado</th>
                    <th className="pb-4 font-medium">Fecha</th>
                    <th className="pb-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOrders.map((order) => {
                    const status = statusLabels[order.status] || { label: order.status, variant: 'default' as const }
                    const payment = paymentLabels[order.payment_status] || { label: order.payment_status, variant: 'default' as const }
                    const meta = (order.metadata as any) || {}

                    return (
                      <tr key={order.id} className="group">
                        <td className="py-4">
                          <p className="font-mono font-medium">
                            {order.order_number}
                          </p>
                          {meta.tracking_number && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Truck className="h-3 w-3" />
                              {meta.tracking_number}
                            </p>
                          )}
                        </td>
                        <td className="py-4">
                          <div>
                            <p className="font-medium">
                              {order.customer_name || 'Sin nombre'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {order.customer_email}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 font-semibold">
                          {formatPrice(order.total_cents)}
                        </td>
                        <td className="py-4">
                          <Badge variant={payment.variant}>
                            {payment.label}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <Badge variant={status.variant}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="py-4 text-sm text-muted-foreground">
                          {formatDateTime(order.created_at)}
                        </td>
                        <td className="py-4">
                          <Button variant="ghost" size="icon" onClick={() => openOrderModal(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No se encontraron ordenes
            </p>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Orden {selectedOrder.order_number}</CardTitle>
              <button onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Customer Info */}
              <div>
                <h3 className="mb-2 font-semibold">Cliente</h3>
                <p className="text-sm">{selectedOrder.customer_name}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.customer_email}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.customer_phone}</p>
              </div>

              {/* Order Total */}
              <div>
                <h3 className="mb-2 font-semibold">Total</h3>
                <p className="text-lg font-bold text-primary">{formatPrice(selectedOrder.total_cents)}</p>
              </div>

              {/* Confirmar pago manual */}
              {selectedOrder.payment_status !== 'paid' && selectedOrder.payment_status !== 'refunded' && (
                <div className="rounded-xl border border-dashed p-4">
                  <p className="mb-2 text-sm text-muted-foreground">
                    Pago pendiente — si ya recibiste la transferencia/Nequi/Daviplata de esta orden, confírmalo aquí para descontar el stock y avisarle al cliente.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleMarkPaid} disabled={updating} className="gap-2">
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Marcar como pagado
                  </Button>
                </div>
              )}

              {/* Status Change */}
              <div>
                <h3 className="mb-2 font-semibold">Estado de la orden</h3>
                <select
                  className="w-full rounded-xl border bg-background px-4 py-2 text-sm"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="pending">Pendiente</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="processing">Procesando</option>
                  <option value="shipped">Enviado</option>
                  <option value="delivered">Entregado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              {/* Tracking Info */}
              <div>
                <h3 className="mb-2 font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Tracking de envio
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">Numero de guia</label>
                    <Input
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Ej: 1234567890"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">URL de seguimiento (opcional)</label>
                    <Input
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://rastreo.transportadora.com/..."
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Al cambiar el estado a &quot;Enviado&quot; se enviara un email al cliente con el tracking.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button onClick={handleUpdateOrder} disabled={updating} className="flex-1">
                  {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Guardar cambios
                </Button>
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
