'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Search,
  Trash2,
  Edit,
  X,
  Loader2,
  Tag,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/lib/auth-context'
import { Coupon } from '@/types/database'
import { formatPrice } from '@/lib/utils'

type FormData = {
  code: string
  description: string
  discount_type: 'percentage' | 'fixed'
  discount_value: string
  min_purchase_cents: string
  max_uses: string
  valid_from: string
  valid_until: string
  active: boolean
}

const emptyForm: FormData = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  min_purchase_cents: '',
  max_uses: '',
  valid_from: '',
  valid_until: '',
  active: true,
}

export default function CuponesPage() {
  const { toast } = useToast()
  const { session } = useAuth()
  // /api/coupons exige rol admin (requireAuth) — sin este header todas las
  // operaciones (ver/crear/editar/eliminar) fallaban en silencio con 401.
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)

  const fetchCoupons = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/coupons', { headers: authHeaders() })
      const data = await res.json()
      setCoupons(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: 'Error al cargar cupones', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [toast, session?.access_token, authHeaders])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const openCreateModal = () => {
    setEditingCoupon(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon)
    setForm({
      code: coupon.code,
      description: coupon.description || '',
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_purchase_cents: coupon.min_purchase_cents
        ? String(coupon.min_purchase_cents / 100)
        : '',
      max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
      valid_from: coupon.valid_from ? coupon.valid_from.split('T')[0] : '',
      valid_until: coupon.valid_until ? coupon.valid_until.split('T')[0] : '',
      active: coupon.active,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCoupon(null)
    setForm(emptyForm)
  }

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast({ title: 'El codigo es obligatorio', variant: 'destructive' })
      return
    }
    if (!form.discount_value || Number(form.discount_value) <= 0) {
      toast({ title: 'El valor de descuento debe ser mayor a 0', variant: 'destructive' })
      return
    }
    if (form.discount_type === 'percentage' && Number(form.discount_value) > 100) {
      toast({ title: 'El porcentaje no puede superar 100', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...(editingCoupon && { id: editingCoupon.id }),
        code: form.code.toUpperCase().trim(),
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_purchase_cents: form.min_purchase_cents
          ? Math.round(Number(form.min_purchase_cents) * 100)
          : 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        active: form.active,
      }

      const method = editingCoupon ? 'PUT' : 'POST'
      const res = await fetch('/api/coupons', {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast({
          title: editingCoupon ? 'Cupon actualizado' : 'Cupon creado',
          description: `Codigo: ${payload.code}`,
        })
        closeModal()
        fetchCoupons()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch('/api/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id: coupon.id, active: !coupon.active }),
      })
      if (res.ok) {
        toast({
          title: coupon.active ? 'Cupon desactivado' : 'Cupon activado',
          description: coupon.code,
        })
        fetchCoupons()
      }
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' })
    }
  }

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`¿Eliminar el cupon "${coupon.code}"? Esta accion no se puede deshacer.`)) return
    setDeletingId(coupon.id)
    try {
      const res = await fetch(`/api/coupons?id=${coupon.id}`, { method: 'DELETE', headers: authHeaders() })
      if (res.ok) {
        toast({ title: 'Cupon eliminado', description: coupon.code })
        fetchCoupons()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = coupons.filter((c) => {
    const matchSearch =
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase())
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && c.active) ||
      (filterActive === 'inactive' && !c.active)
    return matchSearch && matchActive
  })

  const isExpired = (coupon: Coupon) =>
    coupon.valid_until ? new Date(coupon.valid_until) < new Date() : false

  const formatDiscount = (coupon: Coupon) =>
    coupon.discount_type === 'percentage'
      ? `${coupon.discount_value}%`
      : formatPrice(coupon.discount_value * 100)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cupones de Descuento</h1>
          <p className="text-muted-foreground">Gestiona los codigos de descuento de la tienda</p>
        </div>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Cupon
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total cupones</p>
            <p className="text-2xl font-bold">{coupons.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Activos</p>
            <p className="text-2xl font-bold text-green-500">
              {coupons.filter((c) => c.active).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Usos totales</p>
            <p className="text-2xl font-bold text-cyan-500">
              {coupons.reduce((acc, c) => acc + c.used_count, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por codigo o descripcion..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 rounded-xl border bg-background px-4 text-sm"
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} cupones</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Tag className="h-10 w-10 opacity-30" />
              <p>No hay cupones. Crea el primero.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-4 font-medium">Codigo</th>
                    <th className="pb-4 font-medium">Descuento</th>
                    <th className="pb-4 font-medium">Minimo</th>
                    <th className="pb-4 font-medium">Usos</th>
                    <th className="pb-4 font-medium">Validez</th>
                    <th className="pb-4 font-medium">Estado</th>
                    <th className="pb-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((coupon) => {
                    const expired = isExpired(coupon)
                    return (
                      <tr key={coupon.id} className="group">
                        <td className="py-4">
                          <div>
                            <p className="font-mono font-semibold tracking-wide text-cyan-500">
                              {coupon.code}
                            </p>
                            {coupon.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {coupon.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-4">
                          <Badge variant="default" className="font-semibold">
                            {formatDiscount(coupon)}
                          </Badge>
                        </td>
                        <td className="py-4 text-sm">
                          {coupon.min_purchase_cents > 0
                            ? formatPrice(coupon.min_purchase_cents)
                            : '—'}
                        </td>
                        <td className="py-4 text-sm">
                          {coupon.used_count}
                          {coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                        </td>
                        <td className="py-4 text-sm text-muted-foreground">
                          {coupon.valid_until ? (
                            <span className={expired ? 'text-red-500' : ''}>
                              {expired ? 'Vencido ' : ''}
                              {new Date(coupon.valid_until).toLocaleDateString('es-CO')}
                            </span>
                          ) : (
                            'Sin limite'
                          )}
                        </td>
                        <td className="py-4">
                          {coupon.active && !expired ? (
                            <Badge variant="success">Activo</Badge>
                          ) : expired ? (
                            <Badge variant="error">Vencido</Badge>
                          ) : (
                            <Badge variant="secondary">Inactivo</Badge>
                          )}
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={coupon.active ? 'Desactivar' : 'Activar'}
                              onClick={() => handleToggleActive(coupon)}
                            >
                              {coupon.active ? (
                                <ToggleRight className="h-5 w-5 text-green-500" />
                              ) : (
                                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => openEditModal(coupon)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Eliminar"
                              onClick={() => handleDelete(coupon)}
                              disabled={deletingId === coupon.id}
                            >
                              {deletingId === coupon.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {editingCoupon ? 'Editar Cupon' : 'Nuevo Cupon'}
              </CardTitle>
              <button onClick={closeModal}>
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Codigo */}
              <div>
                <Label htmlFor="code">Codigo *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="Ej: DESCUENTO20"
                  className="mt-1 font-mono"
                />
              </div>

              {/* Descripcion */}
              <div>
                <Label htmlFor="desc">Descripcion</Label>
                <Input
                  id="desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ej: Descuento de bienvenida"
                  className="mt-1"
                />
              </div>

              {/* Tipo y valor de descuento */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dtype">Tipo de descuento *</Label>
                  <select
                    id="dtype"
                    className="mt-1 h-10 w-full rounded-xl border bg-background px-4 text-sm"
                    value={form.discount_type}
                    onChange={(e) =>
                      setForm({ ...form, discount_type: e.target.value as 'percentage' | 'fixed' })
                    }
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Valor fijo ($)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="dval">
                    Valor *{' '}
                    <span className="text-muted-foreground">
                      {form.discount_type === 'percentage' ? '(%)' : '($)'}
                    </span>
                  </Label>
                  <Input
                    id="dval"
                    type="number"
                    min="1"
                    max={form.discount_type === 'percentage' ? '100' : undefined}
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                    placeholder={form.discount_type === 'percentage' ? '20' : '15000'}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Compra minima */}
              <div>
                <Label htmlFor="minp">Compra minima ($) — dejar vacio para sin minimo</Label>
                <Input
                  id="minp"
                  type="number"
                  min="0"
                  value={form.min_purchase_cents}
                  onChange={(e) => setForm({ ...form, min_purchase_cents: e.target.value })}
                  placeholder="50000"
                  className="mt-1"
                />
              </div>

              {/* Maximo de usos */}
              <div>
                <Label htmlFor="maxu">Maximo de usos — dejar vacio para ilimitado</Label>
                <Input
                  id="maxu"
                  type="number"
                  min="1"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="100"
                  className="mt-1"
                />
              </div>

              {/* Fechas de validez */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vfrom">Valido desde</Label>
                  <Input
                    id="vfrom"
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="vuntil">Valido hasta</Label>
                  <Input
                    id="vuntil"
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Activo */}
              <div className="flex items-center gap-3 rounded-xl border p-4">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, active: !form.active })}
                  className="focus:outline-none"
                >
                  {form.active ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-muted-foreground" />
                  )}
                </button>
                <div>
                  <p className="text-sm font-medium">
                    {form.active ? 'Cupon activo' : 'Cupon inactivo'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {form.active
                      ? 'Los clientes pueden usar este cupon'
                      : 'El cupon no sera aceptado en el checkout'}
                  </p>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingCoupon ? 'Guardar cambios' : 'Crear cupon'}
                </Button>
                <Button variant="outline" onClick={closeModal}>
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
