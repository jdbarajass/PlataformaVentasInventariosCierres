'use client'

import { useState } from 'react'
import { Bell, BellOff, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface OutOfStockVariant {
  id: string
  talla: string | null
}

interface RestockSubscribeProps {
  productId: string
  productTitle: string
  // Tallas agotadas del producto (si tiene variantes) — si se pasan, el
  // cliente debe elegir a cuál quiere que se le avise, en vez de suscribirse
  // al producto completo (que puede tener otras tallas ya disponibles).
  outOfStockVariants?: OutOfStockVariant[]
}

export function RestockSubscribe({ productId, productTitle, outOfStockVariants = [] }: RestockSubscribeProps) {
  const hasVariants = outOfStockVariants.length > 0
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants && outOfStockVariants.length === 1 ? outOfStockVariants[0].id : null
  )
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)

  const needsVariantSelection = hasVariants && !selectedVariantId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || needsVariantSelection) return

    setStatus('loading')
    try {
      const res = await fetch('/api/restock/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, variant_id: selectedVariantId, email }),
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
              {hasVariants ? 'Alguna talla agotada' : 'Agotado'} — avísame cuando vuelva a estar disponible
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

          {hasVariants && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                ¿De qué talla te avisamos?
              </span>
              <div className="flex flex-wrap gap-2">
                {outOfStockVariants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={[
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      v.id === selectedVariantId ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary' : 'hover:border-primary/50',
                    ].join(' ')}
                  >
                    {v.talla}
                  </button>
                ))}
              </div>
            </div>
          )}

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
            <Button type="submit" disabled={status === 'loading' || needsVariantSelection} size="sm">
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
