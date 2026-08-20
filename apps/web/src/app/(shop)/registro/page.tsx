'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Loader2, UserPlus, Gift, Copy, Check } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { BOGOTA_TZ } from '@/lib/bogota-time'

export default function RegistroPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Cupón de bienvenida (Fase 5 del plan de mejoras integrales, docs/
  // UNIFICACION_YJBMOTOCOM.md sección 80.9) — si se genera bien, se
  // muestra en una pantalla de éxito antes de continuar a Mi Cuenta; si
  // falla por lo que sea, no bloquea el registro (couponError se ignora
  // en la UI, solo detiene el intento de mostrarlo).
  const [welcomeCoupon, setWelcomeCoupon] = useState<{ code: string; validUntil: string } | null>(null)
  const [registered, setRegistered] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)

    // Minúsculas: si queda mezclado con mayúsculas, un pedido guardado con
    // otra capitalización del mismo email (ej. checkout de invitado) puede
    // no coincidir luego al buscar "Mis Pedidos" contra public.users.email.
    const normalizedEmail = formData.email.trim().toLowerCase()

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            phone: formData.phone,
          },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Este email ya está registrado. Intenta iniciar sesión.')
        } else {
          setError(authError.message)
        }
        setLoading(false)
        return
      }

      if (data.user) {
        // Create user profile in public.users table
        // @ts-ignore - ver docs/UNIFICACION_YJBMOTOCOM.md, limitaciones de tipos
        const { error: profileError } = await supabase.from('users').insert({
          id: data.user.id,
          email: normalizedEmail,
          name: formData.name,
          phone: formData.phone,
          role: 'viewer',
        })

        if (profileError) {
          // Bug real encontrado en la Fase 5 (docs/UNIFICACION_YJBMOTOCOM.md
          // sección 80.9): hasta la migración 00043, esto fallaba SIEMPRE
          // en silencio (RLS sin política de INSERT propio) y nadie se
          // enteraba — la cuenta de Auth quedaba creada pero sin fila de
          // perfil. Ahora si vuelve a fallar (ej. la migración no se ha
          // aplicado todavía), al menos se avisa en vez de fingir éxito.
          console.error('Error creating profile:', profileError)
          toast({
            title: 'Cuenta creada con un problema',
            description: 'Tu cuenta se creó, pero no pudimos guardar tu perfil completo. Escríbenos si algo no funciona bien.',
            variant: 'destructive',
          })
          setRegistered(true)
          setLoading(false)
          return
        }

        toast({
          title: 'Cuenta creada',
          description: 'Tu cuenta ha sido creada exitosamente.',
        })

        // El cupón de bienvenida es un bono, no un requisito del registro
        // — si falla (red, rate limit, lo que sea), la cuenta ya quedó
        // creada de todas formas y el cliente sigue sin ningún cupón,
        // nunca se le bloquea ni se le muestra un error por esto.
        try {
          const res = await fetch('/api/coupons/welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: data.user.id }),
          })
          if (res.ok) {
            const { data: coupon } = await res.json()
            if (coupon?.code) {
              setWelcomeCoupon({ code: coupon.code, validUntil: coupon.valid_until })
            }
          }
        } catch (couponErr) {
          console.error('Error fetching welcome coupon:', couponErr)
        }

        setRegistered(true)
      }
    } catch (err) {
      console.error('Register error:', err)
      setError('Error al crear la cuenta. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    if (!welcomeCoupon) return
    navigator.clipboard.writeText(welcomeCoupon.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (registered) {
    const validUntilFormatted = welcomeCoupon
      ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: BOGOTA_TZ }).format(
          new Date(welcomeCoupon.validUntil)
        )
      : null

    return (
      <div className="container py-12">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <Check className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">¡Cuenta creada!</h1>
          <p className="mt-2 text-muted-foreground">Bienvenido a YJBMOTOCOM.</p>

          {welcomeCoupon && (
            <div className="mt-6 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 p-6">
              <div className="mb-2 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
                <Gift className="h-4 w-4" /> Tu regalo de bienvenida
              </div>
              <p className="text-2xl font-bold tracking-wide text-primary">{welcomeCoupon.code}</p>
              <p className="mt-1 text-sm font-medium">10% de descuento en tu primera compra</p>
              {validUntilFormatted && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Válido hasta el {validUntilFormatted}, sin monto mínimo. Un solo uso. También te lo enviamos por email.
                </p>
              )}
              <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl" onClick={copyCode}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> Copiar código
                  </>
                )}
              </Button>
            </div>
          )}

          <Button
            type="button"
            className="mt-6 w-full rounded-xl bg-primary py-6 text-base font-semibold hover:bg-primary/90"
            onClick={() => router.push('/mi-cuenta')}
          >
            Ir a mi cuenta
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <UserPlus className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Crear cuenta</h1>
          <p className="mt-2 text-muted-foreground">
            Regístrate para guardar tus pedidos y agilizar tus compras.
          </p>
        </div>

        <form onSubmit={handleRegister} className="rounded-2xl border bg-card p-8">
          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Nombre completo *
              </label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Tu nombre completo"
                className="rounded-xl"
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
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Teléfono
              </label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+57 300 123 4567"
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Contraseña *
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Confirmar contraseña *
              </label>
              <Input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Repite tu contraseña"
                className="rounded-xl"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-primary py-6 text-base font-semibold hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : (
              'Crear cuenta'
            )}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link href="/iniciar-sesion" className="font-medium text-primary hover:underline">
              Iniciar sesión
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Al registrarte, aceptas nuestros{' '}
            <Link href="/terminos" className="underline">
              términos y condiciones
            </Link>{' '}
            y{' '}
            <Link href="/privacidad" className="underline">
              política de privacidad
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  )
}
