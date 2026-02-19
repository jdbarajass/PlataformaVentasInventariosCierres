'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import {
  User,
  Package,
  LogOut,
  Loader2,
  ShoppingBag,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface UserProfile {
  id: string
  email: string
  name: string | null
  phone: string | null
  role: string
}

interface Order {
  id: string
  order_number: string
  total_cents: number
  payment_status: string
  status: string
  payment_method: string
  created_at: string
  order_items: Array<{
    id: string
    product_title: string
    qty: number
    price_cents: number
  }>
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'bg-blue-100 text-blue-800' },
  processing: { label: 'En proceso', icon: Package, color: 'bg-indigo-100 text-indigo-800' },
  shipped: { label: 'Enviado', icon: Truck, color: 'bg-purple-100 text-purple-800' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-red-100 text-red-800' },
}

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pago pendiente', color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
  failed: { label: 'Pago fallido', color: 'bg-red-100 text-red-800' },
  refunded: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-800' },
}

export default function MiCuentaPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'perfil' | 'ordenes'>('ordenes')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/iniciar-sesion')
      return
    }

    // Load profile
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (userData) {
      setProfile(userData as UserProfile)
      setEditName(userData.name || '')
      setEditPhone(userData.phone || '')
    } else {
      setProfile({
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.user_metadata?.name || null,
        phone: session.user.user_metadata?.phone || null,
        role: 'viewer',
      })
      setEditName(session.user.user_metadata?.name || '')
      setEditPhone(session.user.user_metadata?.phone || '')
    }

    // Load orders
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_email', session.user.email)
      .order('created_at', { ascending: false })

    if (ordersData) {
      setOrders(ordersData as unknown as Order[])
    }

    setLoading(false)
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)

    const { error } = await supabase
      .from('users')
      .update({ name: editName, phone: editPhone })
      .eq('id', profile.id)

    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el perfil.', variant: 'destructive' })
    } else {
      setProfile({ ...profile, name: editName, phone: editPhone })
      toast({ title: 'Perfil actualizado', description: 'Tus datos se guardaron correctamente.' })
    }
    setSaving(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="container py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando tu cuenta...</p>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mi cuenta</h1>
          <p className="text-muted-foreground">
            Hola, {profile?.name || profile?.email}
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={activeTab === 'ordenes' ? 'default' : 'outline'}
          onClick={() => setActiveTab('ordenes')}
        >
          <Package className="mr-2 h-4 w-4" />
          Mis pedidos
        </Button>
        <Button
          variant={activeTab === 'perfil' ? 'default' : 'outline'}
          onClick={() => setActiveTab('perfil')}
        >
          <User className="mr-2 h-4 w-4" />
          Mi perfil
        </Button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'perfil' && (
        <Card>
          <CardHeader>
            <CardTitle>Información personal</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Email</label>
                <Input value={profile?.email || ''} disabled className="rounded-xl bg-muted" />
                <p className="mt-1 text-xs text-muted-foreground">El email no se puede cambiar.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Nombre completo</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Tu nombre"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Teléfono</label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="rounded-xl"
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Orders Tab */}
      {activeTab === 'ordenes' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No tienes pedidos aún</h3>
                <p className="mt-2 text-muted-foreground">
                  Cuando realices tu primera compra, aparecerá aquí.
                </p>
                <Button asChild className="mt-4">
                  <Link href="/productos">Ver productos</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            orders.map((order) => {
              const status = statusConfig[order.status] || statusConfig.pending
              const paymentStatus = paymentStatusConfig[order.payment_status] || paymentStatusConfig.pending
              const StatusIcon = status.icon

              return (
                <Card key={order.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">Orden #{order.order_number}</h3>
                          <Badge variant="outline" className={status.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {status.label}
                          </Badge>
                          <Badge variant="outline" className={paymentStatus.color}>
                            {paymentStatus.label}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">
                          {formatPrice(order.total_cents)}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {order.payment_method === 'card' ? 'Tarjeta' : order.payment_method}
                        </p>
                      </div>
                    </div>

                    <Separator className="my-4" />

                    <div className="space-y-2">
                      {order.order_items?.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {item.product_title} x{item.qty}
                          </span>
                          <span>{formatPrice(item.price_cents * item.qty)}</span>
                        </div>
                      ))}
                    </div>

                    {order.payment_status === 'pending' && (
                      <div className="mt-4">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/orden/${order.id}/confirmacion`}>
                            Ver instrucciones de pago
                          </Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
