'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Settings,
  Store,
  Phone,
  Truck,
  Receipt,
  CreditCard,
  Share2,
  Loader2,
  Save,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import type {
  ContactInfo,
  ShippingConfig,
  TaxConfig,
  PaymentMethod,
  SocialLinks,
  Branding,
} from '@/lib/settings'
import { BRAND } from '@/config/brand'

interface SettingsState {
  store_name: string
  store_description: string
  contact_info: ContactInfo
  shipping_config: ShippingConfig
  tax_config: TaxConfig
  payment_methods: PaymentMethod[]
  social_links: SocialLinks
  branding: Branding
}

const defaultSettings: SettingsState = {
  store_name: BRAND.name,
  store_description: '',
  contact_info: {
    phone_primary: '',
    phone_secondary: '',
    email: '',
    address: '',
    city: '',
    business_hours: { weekdays: '', saturday: '', sunday: '' },
  },
  shipping_config: {
    free_shipping_threshold_cents: 20000000,
    default_shipping_cost_cents: 1500000,
    enabled: true,
  },
  tax_config: { enabled: false, percentage: 19 },
  payment_methods: [
    { id: 'card', name: 'Tarjeta de crédito/débito', enabled: true },
    { id: 'transfer', name: 'Transferencia bancaria', enabled: true },
    { id: 'nequi', name: 'Nequi', enabled: true },
    { id: 'daviplata', name: 'Daviplata', enabled: true },
    { id: 'cash', name: 'Efectivo (retiro en tienda)', enabled: true },
  ],
  social_links: { facebook: '', instagram: '', whatsapp: '', tiktok: '', twitter: '' },
  branding: { logo_url: '', primary_color: '#06b6d4', secondary_color: '#2563eb' },
}

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'
  const canView = isAdmin || userProfile?.role === 'admin_readonly'

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/settings')
      if (!res.ok) throw new Error('Error fetching settings')
      const { data } = await res.json()

      if (data) {
        setSettings({
          store_name: data.store_name || defaultSettings.store_name,
          store_description: data.store_description || '',
          contact_info: { ...defaultSettings.contact_info, ...(data.contact_info || {}) },
          shipping_config: { ...defaultSettings.shipping_config, ...(data.shipping_config || {}) },
          tax_config: { ...defaultSettings.tax_config, ...(data.tax_config || {}) },
          payment_methods: data.payment_methods || defaultSettings.payment_methods,
          social_links: { ...defaultSettings.social_links, ...(data.social_links || {}) },
          branding: { ...defaultSettings.branding, ...(data.branding || {}) },
        })
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración. Verifica que la tabla store_settings exista en Supabase.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    if (!session?.access_token) return

    try {
      setSaving(true)
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(settings),
      })

      if (!res.ok) throw new Error('Error saving settings')

      toast({
        title: 'Configuración guardada',
        description: 'Los cambios se han guardado correctamente',
      })
    } catch (error) {
      console.error('Error saving settings:', error)
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const updateContact = (field: keyof ContactInfo, value: string) => {
    setSettings((prev) => ({
      ...prev,
      contact_info: { ...prev.contact_info, [field]: value },
    }))
  }

  const updateBusinessHours = (field: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      contact_info: {
        ...prev.contact_info,
        business_hours: { ...prev.contact_info.business_hours, [field]: value },
      },
    }))
  }

  const updateShipping = (field: keyof ShippingConfig, value: number | boolean) => {
    setSettings((prev) => ({
      ...prev,
      shipping_config: { ...prev.shipping_config, [field]: value },
    }))
  }

  const togglePaymentMethod = (methodId: string) => {
    setSettings((prev) => ({
      ...prev,
      payment_methods: prev.payment_methods.map((m) =>
        m.id === methodId ? { ...m, enabled: !m.enabled } : m
      ),
    }))
  }

  const updateSocial = (field: keyof SocialLinks, value: string) => {
    setSettings((prev) => ({
      ...prev,
      social_links: { ...prev.social_links, [field]: value },
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Cargando configuración...</span>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración</h1>
          <p className="text-muted-foreground">
            Gestiona la configuración general de la tienda
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !isAdmin}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar cambios
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Información de la Tienda */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-cyan-500" />
              Información de la Tienda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Nombre de la tienda</label>
              <Input
                value={settings.store_name}
                onChange={(e) => setSettings((prev) => ({ ...prev, store_name: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Descripción</label>
              <textarea
                value={settings.store_description}
                onChange={(e) => setSettings((prev) => ({ ...prev, store_description: e.target.value }))}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Información de Contacto */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-cyan-500" />
              Información de Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Teléfono principal</label>
                <Input
                  value={settings.contact_info.phone_primary}
                  onChange={(e) => updateContact('phone_primary', e.target.value)}
                  placeholder="+57 300 000 0000"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Teléfono secundario</label>
                <Input
                  value={settings.contact_info.phone_secondary}
                  onChange={(e) => updateContact('phone_secondary', e.target.value)}
                  placeholder="+57 300 000 0000"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <Input
                type="email"
                value={settings.contact_info.email}
                onChange={(e) => updateContact('email', e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Dirección</label>
              <Input
                value={settings.contact_info.address}
                onChange={(e) => updateContact('address', e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ciudad</label>
              <Input
                value={settings.contact_info.city}
                onChange={(e) => updateContact('city', e.target.value)}
                className="rounded-xl"
              />
            </div>
          </CardContent>
        </Card>

        {/* Horarios */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-cyan-500" />
              Horarios de Atención
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Lunes a Viernes</label>
              <Input
                value={settings.contact_info.business_hours.weekdays}
                onChange={(e) => updateBusinessHours('weekdays', e.target.value)}
                placeholder="Lunes a Viernes: 8:00 AM - 6:00 PM"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sábado</label>
              <Input
                value={settings.contact_info.business_hours.saturday}
                onChange={(e) => updateBusinessHours('saturday', e.target.value)}
                placeholder="Sábado: 9:00 AM - 2:00 PM"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Domingo</label>
              <Input
                value={settings.contact_info.business_hours.sunday}
                onChange={(e) => updateBusinessHours('sunday', e.target.value)}
                placeholder="Domingo: Cerrado"
                className="rounded-xl"
              />
            </div>
          </CardContent>
        </Card>

        {/* Envíos */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-cyan-500" />
              Configuración de Envíos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.shipping_config.enabled}
                onChange={(e) => updateShipping('enabled', e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <label className="text-sm font-medium">Envíos habilitados</label>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Envío gratis a partir de (COP)
              </label>
              <Input
                type="number"
                value={settings.shipping_config.free_shipping_threshold_cents / 100}
                onChange={(e) =>
                  updateShipping('free_shipping_threshold_cents', Math.round(parseFloat(e.target.value || '0') * 100))
                }
                className="rounded-xl"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Actualmente: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settings.shipping_config.free_shipping_threshold_cents / 100)}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Costo de envío por defecto (COP)
              </label>
              <Input
                type="number"
                value={settings.shipping_config.default_shipping_cost_cents / 100}
                onChange={(e) =>
                  updateShipping('default_shipping_cost_cents', Math.round(parseFloat(e.target.value || '0') * 100))
                }
                className="rounded-xl"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Actualmente: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settings.shipping_config.default_shipping_cost_cents / 100)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Impuestos */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-cyan-500" />
              Impuestos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.tax_config.enabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    tax_config: { ...prev.tax_config, enabled: e.target.checked },
                  }))
                }
                className="h-4 w-4 rounded"
              />
              <label className="text-sm font-medium">Aplicar impuestos</label>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Porcentaje de impuesto (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={settings.tax_config.percentage}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    tax_config: { ...prev.tax_config, percentage: parseFloat(e.target.value || '0') },
                  }))
                }
                className="rounded-xl"
                disabled={!settings.tax_config.enabled}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                IVA en Colombia: 19%
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Métodos de Pago */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-cyan-500" />
              Métodos de Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.payment_methods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between rounded-xl border p-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={method.enabled}
                    onChange={() => togglePaymentMethod(method.id)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-sm font-medium">{method.name}</span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    method.enabled
                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                      : 'bg-red-500/10 text-red-500 border-red-500/20'
                  }
                >
                  {method.enabled ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Redes Sociales */}
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-cyan-500" />
              Redes Sociales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Facebook</label>
                <Input
                  value={settings.social_links.facebook}
                  onChange={(e) => updateSocial('facebook', e.target.value)}
                  placeholder={`https://facebook.com/${BRAND.socialHandles.facebook}`}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Instagram</label>
                <Input
                  value={settings.social_links.instagram}
                  onChange={(e) => updateSocial('instagram', e.target.value)}
                  placeholder={`https://instagram.com/${BRAND.socialHandles.instagram}`}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">WhatsApp</label>
                <Input
                  value={settings.social_links.whatsapp}
                  onChange={(e) => updateSocial('whatsapp', e.target.value)}
                  placeholder="https://wa.me/573001234567"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">TikTok</label>
                <Input
                  value={settings.social_links.tiktok}
                  onChange={(e) => updateSocial('tiktok', e.target.value)}
                  placeholder={`https://tiktok.com/@${BRAND.socialHandles.tiktok}`}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Twitter / X</label>
                <Input
                  value={settings.social_links.twitter}
                  onChange={(e) => updateSocial('twitter', e.target.value)}
                  placeholder={`https://x.com/${BRAND.socialHandles.twitter}`}
                  className="rounded-xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Floating save button for mobile */}
      <div className="fixed bottom-6 right-6 lg:hidden">
        <Button
          onClick={handleSave}
          disabled={saving || !isAdmin}
          size="lg"
          className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg"
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  )
}
