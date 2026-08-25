'use client'

import { useState, useEffect, useCallback } from 'react'
import { Percent, Building2, Loader2, Save, Lock, Target } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

interface FixedExpenses {
  arriendo_cents: number
  sueldo_cents: number
  servicios_cents: number
  otros_gastos_cents: number
  dias_mes: number
}

export default function ConfiguracionPosPage() {
  const [rates, setRates] = useState<Record<string, string>>({})
  const [expenses, setExpenses] = useState<FixedExpenses>({
    arriendo_cents: 0, sueldo_cents: 0, servicios_cents: 0, otros_gastos_cents: 0, dias_mes: 30,
  })
  const [sellerGoal, setSellerGoal] = useState({ goal: '0', bonus: '0' })
  const [loading, setLoading] = useState(true)
  const [savingRates, setSavingRates] = useState(false)
  const [savingExpenses, setSavingExpenses] = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'
  // Admin de solo lectura: ve la configuración igual que un admin real,
  // pero los botones de "Guardar" quedan deshabilitados (el backend de
  // todas formas rechaza cualquier escritura suya con 403).
  const canView = isAdmin || userProfile?.role === 'admin_readonly'

  const fetchSettings = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      // Con token: sin él, la API oculta pos_commission_rates/
      // fixed_monthly_expenses por ser datos internos del negocio (ver
      // docs/UNIFICACION_YJBMOTOCOM.md, hallazgo de la Fase 3).
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { data } = await res.json()
      const rawRates = data?.pos_commission_rates || {}
      setRates(Object.fromEntries(Object.keys(methodLabels).map((k) => [k, String(rawRates[k] ?? 0)])))
      if (data?.fixed_monthly_expenses) {
        setExpenses(data.fixed_monthly_expenses)
      }
      setSellerGoal({
        goal: String((data?.seller_monthly_goal_cents ?? 0) / 100),
        bonus: String((data?.seller_goal_bonus_cents ?? 0) / 100),
      })
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleSaveRates = async () => {
    if (!session?.access_token) return
    const payload = Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, parseFloat(v) || 0]))
    const outOfRange = Object.entries(payload).find(([, v]) => v < 0 || v > 100)
    if (outOfRange) {
      toast({ title: 'Error', description: `${methodLabels[outOfRange[0]] || outOfRange[0]}: la comisión debe estar entre 0 y 100%`, variant: 'destructive' })
      return
    }
    try {
      setSavingRates(true)
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pos_commission_rates: payload }),
      })
      if (!res.ok) throw new Error('Error al guardar las comisiones')
      toast({ title: 'Comisiones guardadas' })
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingRates(false)
    }
  }

  const handleSaveGoal = async () => {
    if (!session?.access_token) return
    const goal_cents = Math.round((parseFloat(sellerGoal.goal) || 0) * 100)
    const bonus_cents = Math.round((parseFloat(sellerGoal.bonus) || 0) * 100)
    if (goal_cents < 0 || bonus_cents < 0) {
      toast({ title: 'Error', description: 'La meta y el bono no pueden ser negativos', variant: 'destructive' })
      return
    }
    try {
      setSavingGoal(true)
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ seller_monthly_goal_cents: goal_cents, seller_goal_bonus_cents: bonus_cents }),
      })
      if (!res.ok) throw new Error('Error al guardar la meta de ventas')
      toast({ title: 'Meta de ventas guardada' })
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingGoal(false)
    }
  }

  const handleSaveExpenses = async () => {
    if (!session?.access_token) return
    try {
      setSavingExpenses(true)
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fixed_monthly_expenses: expenses }),
      })
      if (!res.ok) throw new Error('Error al guardar los gastos fijos')
      toast({ title: 'Gastos fijos guardados' })
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingExpenses(false)
    }
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Comisiones y Gastos Fijos</h1>
        <p className="text-muted-foreground">Configuración del punto de venta — alimenta Calculadora, Registrar Venta y Utilidad Real</p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Percent className="h-5 w-5" /> Comisión por método de pago
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(methodLabels).map(([key, label]) => (
            <div key={key}>
              <label className="text-sm text-muted-foreground">{label} (%)</label>
              <Input
                type="number" min="0" max="100" step="0.1"
                value={rates[key] ?? '0'}
                onChange={(e) => setRates((prev) => ({ ...prev, [key]: e.target.value }))}
                className="rounded-lg"
              />
            </div>
          ))}
        </div>
        <Button className="mt-4 rounded-lg" onClick={handleSaveRates} disabled={savingRates || !isAdmin}>
          {savingRates ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar comisiones
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Target className="h-5 w-5" /> Meta mensual de ventas y bono
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Meta compartida por todo el equipo (no individual): si entre todos los vendedores se llega a la meta de ventas de mostrador en el mes, se ofrece el bono. Todos ven el mismo avance combinado y el desglose por vendedor en el Dashboard.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-muted-foreground">Meta mensual (ventas de mostrador)</label>
            <MoneyInput value={sellerGoal.goal} onChange={(v) => setSellerGoal({ ...sellerGoal, goal: v })} className="rounded-lg" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Bono al alcanzarla</label>
            <MoneyInput value={sellerGoal.bonus} onChange={(v) => setSellerGoal({ ...sellerGoal, bonus: v })} className="rounded-lg" />
          </div>
        </div>
        <Button className="mt-4 rounded-lg" onClick={handleSaveGoal} disabled={savingGoal || !isAdmin}>
          {savingGoal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar meta
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5" /> Gastos fijos mensuales
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-sm text-muted-foreground">Arriendo</label>
            <MoneyInput value={String(expenses.arriendo_cents / 100)} onChange={(v) => setExpenses({ ...expenses, arriendo_cents: (parseInt(v) || 0) * 100 })} className="rounded-lg" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Sueldo</label>
            <MoneyInput value={String(expenses.sueldo_cents / 100)} onChange={(v) => setExpenses({ ...expenses, sueldo_cents: (parseInt(v) || 0) * 100 })} className="rounded-lg" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Servicios</label>
            <MoneyInput value={String(expenses.servicios_cents / 100)} onChange={(v) => setExpenses({ ...expenses, servicios_cents: (parseInt(v) || 0) * 100 })} className="rounded-lg" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Otros gastos</label>
            <MoneyInput value={String(expenses.otros_gastos_cents / 100)} onChange={(v) => setExpenses({ ...expenses, otros_gastos_cents: (parseInt(v) || 0) * 100 })} className="rounded-lg" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Días del mes</label>
            <Input type="number" min="1" max="31" value={expenses.dias_mes} onChange={(e) => setExpenses({ ...expenses, dias_mes: parseInt(e.target.value) || 30 })} className="rounded-lg" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Se usan completos (sin prorratear) en la Utilidad Real de Reportes e Historial Mensual, y prorrateados por día (total ÷ días del mes) en la Utilidad Real de Ventas del Día — igual que el software local.
        </p>
        <Button className="mt-4 rounded-lg" onClick={handleSaveExpenses} disabled={savingExpenses || !isAdmin}>
          {savingExpenses ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar gastos fijos
        </Button>
      </div>
    </div>
  )
}
