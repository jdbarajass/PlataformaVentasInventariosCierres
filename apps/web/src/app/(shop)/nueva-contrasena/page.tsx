'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react'

export default function NuevaContrasenaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/mi-cuenta')
      }, 3000)
    } catch (err) {
      console.error('Password update error:', err)
      setError('Error al actualizar la contraseña.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="container py-12">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold">Contraseña actualizada</h1>
          <p className="mt-4 text-muted-foreground">
            Tu contraseña se ha actualizado correctamente.
            Redirigiendo a tu cuenta...
          </p>
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
          <h1 className="text-3xl font-bold">Nueva contraseña</h1>
          <p className="mt-2 text-muted-foreground">
            Ingresa tu nueva contraseña.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-8">
          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Nueva contraseña</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <label className="mb-2 block text-sm font-medium">Confirmar contraseña</label>
              <Input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                Actualizando...
              </>
            ) : (
              'Actualizar contraseña'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
