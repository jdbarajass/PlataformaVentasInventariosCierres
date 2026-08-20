'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
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
  Gift,
  Copy,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { MIN_REDEMPTION_POINTS, REDEMPTION_CENTS_PER_POINT } from '@/lib/loyalty'

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

interface LoyaltyLedgerEntry {
  id: string
  points: number
  type: 'earn' | 'redeem' | 'adjustment'
  description: string | null
  created_at: string
}

export default function MiCuentaPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'perfil' | 'ordenes' | 'puntos'>('ordenes')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Puntos de fidelización (Fase 6 del plan de mejoras integrales, docs/
  // UNIFICACION_YJBMOTOCOM.md sección 80.10).
  const [loyaltyBalance, setLoyaltyBalance] = useState(0)
  const [loyaltyLedger, setLoyaltyLedger] = useState<LoyaltyLedgerEntry[]>([])
  const [redeemPointsInput, setRedeemPointsInput] = useState(String(MIN_REDEMPTION_POINTS))
  const [redeeming, setRedeeming] = useState(false)
  const [redeemedCoupon, setRedeemedCoupon] = useState<{ code: string; discount_value: number } | null>(null)
  const accessTokenRef = useRef<string | null>(null)

  const loadData = useCallback(async () => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado')), 10000)
    )

    try {
      const { data: { session } } = await Promise.race([supabase.auth.getSession(), timeout])

      if (!session) {
        router.push('/iniciar-sesion')
        return
      }

      // Load profile
      // (createClientComponentClient de @supabase/auth-helpers-nextjs@0.9.0
      // tiene tipos desactualizados frente a @supabase/supabase-js instalado
      // — ver docs/UNIFICACION_YJBMOTOCOM.md, limitaciones de tipos)
      const { data: userDataRaw } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()
      const userData = userDataRaw as UserProfile | null

      if (userData) {
        setProfile(userData)
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

      // Load orders — por user_id O por email (case-insensitive: ni el
      // registro ni el checkout normalizan mayúsculas, así que un pedido
      // como invitado con distinta capitalización del mismo email no debe
      // quedar invisible aquí). `_`/`%` se escapan porque ilike los trata
      // como comodines y sí pueden aparecer en un email real.
      const escapedEmail = (session.user.email || '').replace(/[\\%_]/g, (c) => `\\${c}`)
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .or(`user_id.eq.${session.user.id},customer_email.ilike.${escapedEmail}`)
        .order('created_at', { ascending: false })

      if (ordersData) {
        setOrders(ordersData as unknown as Order[])
      }

      // Puntos de fidelización — best-effort: si falla, el resto de la
      // cuenta (perfil, pedidos) ya cargó bien y sigue funcionando.
      accessTokenRef.current = session.access_token
      try {
        const loyaltyRes = await fetch('/api/loyalty', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (loyaltyRes.ok) {
          const { data } = await loyaltyRes.json()
          setLoyaltyBalance(data.balance || 0)
          setLoyaltyLedger(data.ledger || [])
        }
      } catch (loyaltyErr) {
        console.error('Error loading loyalty points:', loyaltyErr)
      }
    } catch (err) {
      console.error('Error loading account data:', err)
      toast({
        title: 'Error al cargar tu cuenta',
        description: 'No se pudo conectar con el servidor. Intenta recargar la página.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [router, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)

    const { error } = await supabase
      .from('users')
      // @ts-ignore - ver docs/UNIFICACION_YJBMOTOCOM.md, limitaciones de tipos
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

  async function handleRedeemPoints() {
    const points = parseInt(redeemPointsInput, 10) || 0
    if (points < MIN_REDEMPTION_POINTS || points % 100 !== 0) {
      toast({
        title: 'Cantidad inválida',
        description: `Los puntos se canjean en múltiplos de 100, mínimo ${MIN_REDEMPTION_POINTS}.`,
        variant: 'destructive',
      })
      return
    }
    if (points > loyaltyBalance) {
      toast({ title: 'No tienes suficientes puntos', variant: 'destructive' })
      return
    }
    if (!accessTokenRef.current) return

    setRedeeming(true)
    try {
      const res = await fetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessTokenRef.current}` },
        body: JSON.stringify({ points }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast({ title: 'No se pudo canjear', description: body.error, variant: 'destructive' })
        return
      }
      setRedeemedCoupon({ code: body.data.code, discount_value: body.data.discount_value })
      setLoyaltyBalance((b) => b - points)
      setRedeemPointsInput(String(MIN_REDEMPTION_POINTS))
      loadData() // refresca el historial con el movimiento nuevo
    } catch (err) {
      console.error('Error redeeming points:', err)
      toast({ title: 'Error al canjear los puntos', variant: 'destructive' })
    } finally {
      setRedeeming(false)
    }
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
          variant={activeTab === 'puntos' ? 'default' : 'outline'}
          onClick={() => setActiveTab('puntos')}
        >
          <Gift className="mr-2 h-4 w-4" />
          Mis puntos
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

      {/* Puntos Tab */}
      {activeTab === 'puntos' && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Gift className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tienes</p>
                  <p className="text-3xl font-bold text-primary">{loyaltyBalance} puntos</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Ganas 1 punto por cada $1.000 COP que gastes, en la tienda online y en el local. Canjea desde{' '}
                {MIN_REDEMPTION_POINTS} puntos por un cupón de descuento.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Canjear puntos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {redeemedCoupon ? (
                <div className="rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 p-6 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Tu cupón de descuento</p>
                  <p className="mt-1 text-2xl font-bold tracking-wide text-primary">{redeemedCoupon.code}</p>
                  <p className="mt-1 text-sm font-medium">{formatPrice(redeemedCoupon.discount_value)} de descuento</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => navigator.clipboard.writeText(redeemedCoupon.code)}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copiar código
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => setRedeemedCoupon(null)}>
                      Canjear otro
                    </Button>
                  </div>
                </div>
              ) : loyaltyBalance < MIN_REDEMPTION_POINTS ? (
                <p className="text-sm text-muted-foreground">
                  Necesitas al menos {MIN_REDEMPTION_POINTS} puntos para canjear tu primer cupón.
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Puntos a canjear</label>
                    <Input
                      type="number"
                      min={MIN_REDEMPTION_POINTS}
                      max={loyaltyBalance - (loyaltyBalance % 100)}
                      step={100}
                      value={redeemPointsInput}
                      onChange={(e) => setRedeemPointsInput(e.target.value)}
                      className="w-32 rounded-xl"
                    />
                  </div>
                  <p className="pb-2 text-sm text-muted-foreground">
                    ={' '}
                    {formatPrice(
                      (parseInt(redeemPointsInput, 10) || 0) * REDEMPTION_CENTS_PER_POINT
                    )}{' '}
                    de descuento
                  </p>
                  <Button type="button" disabled={redeeming} onClick={handleRedeemPoints} className="rounded-xl">
                    {redeeming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
                    Canjear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {loyaltyLedger.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historial de puntos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loyaltyLedger.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p>{entry.description || (entry.type === 'earn' ? 'Puntos ganados' : 'Canje de puntos')}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                    <span className={`font-semibold ${entry.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.points > 0 ? '+' : ''}
                      {entry.points}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
