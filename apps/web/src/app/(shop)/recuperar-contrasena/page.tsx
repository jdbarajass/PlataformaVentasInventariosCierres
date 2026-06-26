'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react'

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nueva-contrasena`,
      })

      if (resetError) {
        setError('Error al enviar el email. Verifica tu dirección e intenta de nuevo.')
        setLoading(false)
        return
      }

      setSent(true)
    } catch (err) {
      console.error('Reset error:', err)
      setError('Error inesperado. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="container py-12">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold">Revisa tu email</h1>
          <p className="mt-4 text-muted-foreground">
            Hemos enviado un enlace de recuperación a <strong>{email}</strong>.
            Revisa tu bandeja de entrada (y spam) y sigue las instrucciones.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/iniciar-sesion">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a iniciar sesión
            </Link>
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
            <KeyRound className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Recuperar contraseña</h1>
          <p className="mt-2 text-muted-foreground">
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-8">
          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="rounded-xl"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-primary py-6 text-base font-semibold hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar enlace de recuperación'
            )}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/iniciar-sesion" className="text-primary hover:underline">
              <ArrowLeft className="mr-1 inline h-3 w-3" />
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
