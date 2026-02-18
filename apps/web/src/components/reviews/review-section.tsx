'use client'

import { useState, useEffect } from 'react'
import { Star, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/use-toast'
import { cn, formatDate } from '@/lib/utils'

interface Review {
  id: string
  rating: number
  title: string | null
  comment: string | null
  verified_purchase: boolean
  created_at: string
  users: { name: string | null } | null
}

interface ReviewSectionProps {
  productId: string
  productTitle: string
}

function StarRating({ rating, onRate, interactive = false, size = 'md' }: {
  rating: number
  onRate?: (rating: number) => void
  interactive?: boolean
  size?: 'sm' | 'md'
}) {
  const [hover, setHover] = useState(0)
  const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          className={cn('transition-colors', interactive && 'cursor-pointer hover:scale-110')}
        >
          <Star
            className={cn(
              sizeClass,
              (hover || rating) >= star
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            )}
          />
        </button>
      ))}
    </div>
  )
}

export function ReviewSection({ productId, productTitle }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [newReview, setNewReview] = useState({ rating: 0, title: '', comment: '' })
  const { toast } = useToast()

  useEffect(() => {
    const loadReviews = async () => {
      const { data } = await supabase
        .from('product_reviews')
        .select('id, rating, title, comment, verified_purchase, created_at, users:user_id(name)')
        .eq('product_id', productId)
        .eq('approved', true)
        .order('created_at', { ascending: false })

      setReviews((data as any[]) || [])
      setLoading(false)
    }

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserId(session?.user?.id || null)
    }

    loadReviews()
    checkAuth()
  }, [productId])

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) {
      toast({ title: 'Inicia sesion para dejar una resena', variant: 'destructive' })
      return
    }
    if (newReview.rating === 0) {
      toast({ title: 'Selecciona una calificacion', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const { error } = await (supabase.from('product_reviews') as any).insert({
        product_id: productId,
        user_id: userId,
        rating: newReview.rating,
        title: newReview.title || null,
        comment: newReview.comment || null,
      })

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Ya dejaste una resena para este producto', variant: 'destructive' })
        } else {
          throw error
        }
      } else {
        toast({ title: 'Resena enviada', description: 'Sera visible una vez aprobada por el equipo.' })
        setShowForm(false)
        setNewReview({ rating: 0, title: '', comment: '' })
      }
    } catch {
      toast({ title: 'Error al enviar resena', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Resenas</h2>
          {reviews.length > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <StarRating rating={Math.round(avgRating)} size="sm" />
              <span className="text-sm text-muted-foreground">
                {avgRating.toFixed(1)} ({reviews.length} resena{reviews.length !== 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
        {userId && !showForm && (
          <Button variant="outline" onClick={() => setShowForm(true)}>
            Escribir resena
          </Button>
        )}
      </div>

      {/* Review Form */}
      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Tu resena de {productTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Calificacion</label>
                <StarRating
                  rating={newReview.rating}
                  onRate={(r) => setNewReview(prev => ({ ...prev, rating: r }))}
                  interactive
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Titulo (opcional)</label>
                <Input
                  value={newReview.title}
                  onChange={(e) => setNewReview(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Resumen de tu experiencia"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Comentario (opcional)</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={4}
                  value={newReview.comment}
                  onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Cuenta tu experiencia con este producto..."
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Enviando...' : 'Enviar resena'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Este producto aun no tiene resenas. {userId ? 'Se el primero en opinar!' : 'Inicia sesion para dejar una resena.'}
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{review.users?.name || 'Cliente'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(review.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} size="sm" />
                    {review.verified_purchase && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Compra verificada
                      </span>
                    )}
                  </div>
                </div>
                {review.title && (
                  <h4 className="mt-3 font-semibold">{review.title}</h4>
                )}
                {review.comment && (
                  <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
