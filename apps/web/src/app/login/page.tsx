'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        console.error('Auth error:', authError)
        setError('Credenciales inválidas. Verifica tu email y contraseña.')
        setLoading(false)
        return
      }

      if (data.session) {
        window.location.href = redirectTo
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('Error al iniciar sesión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600">
            <span className="text-2xl font-bold text-white">YB</span>
          </div>
          <h1 className="text-2xl font-bold text-white">YB MOTOCOM</h1>
          <p className="mt-2 text-slate-400">Panel de Administracion</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8 backdrop-blur">
          <h2 className="mb-6 text-xl font-semibold text-white">Iniciar Sesion</h2>

          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ybmotocom.com"
                className="rounded-xl border-slate-600 bg-slate-700 text-white placeholder:text-slate-400"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Contraseña
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="rounded-xl border-slate-600 bg-slate-700 pr-10 text-white placeholder:text-slate-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-6 text-base font-semibold hover:from-cyan-600 hover:to-blue-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </Button>
        </form>

        {/* Back to store */}
        <p className="mt-6 text-center text-sm text-slate-500">
          <a href="/" className="hover:text-slate-300">
            ← Volver a la tienda
          </a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
