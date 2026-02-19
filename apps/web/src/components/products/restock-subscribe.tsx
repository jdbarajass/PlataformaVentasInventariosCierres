'use client'

import { useState } from 'react'
import { Bell, BellOff, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface RestockSubscribeProps {
  productId: string
  productTitle: string
}

export function RestockSubscribe({ productId, productTitle }: RestockSubscribeProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    try {
      const res = await fetch('/api/restock/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, email }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.message || '¡Listo! Te avisaremos cuando vuelva a haber stock.')
      } else {
        setStatus('error')
        setMessage(data.error || 'No se pudo registrar. Intenta de nuevo.')
      }
    } catch {
      setStatus('error')
      setMessage('Error de conexión. Intenta de nuevo.')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
        <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
        <div>
          <p className="font-medium text-green-600 dark:text-green-400">Suscripción confirmada</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dashed p-4">
      {!showForm ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BellOff className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Agotado — avísame cuando vuelva a estar disponible
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            className="shrink-0 gap-2"
          >
            <Bell className="h-4 w-4" />
            Notificarme
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 shrink-0 text-cyan-500" />
            <p className="text-sm font-medium">
              Notificarme cuando {productTitle} esté disponible
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === 'loading'}
              className="flex-1"
            />
            <Button type="submit" disabled={status === 'loading'} size="sm">
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Avisarme'
              )}
            </Button>
          </div>
          {status === 'error' && (
            <p className="text-xs text-red-500">{message}</p>
          )}
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-xs text-muted-foreground hover:underline"
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  )
}
