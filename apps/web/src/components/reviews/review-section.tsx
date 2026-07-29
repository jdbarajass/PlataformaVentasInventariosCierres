'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, User, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { useToast } from '@/components/ui/use-toast'
import { cn, formatDate } from '@/lib/utils'

interface Review {
  id: string
  user_id: string
  rating: number
  title: string | null
  comment: string | null
  verified_purchase: boolean
  approved: boolean
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
  // null = creando una reseña nueva; string = editando la reseña con ese id
  // (RLS ya permite "Users can update own reviews", y el trigger de la
  // migración 00034 protege verified_purchase/approved de que el propio
  // autor los manipule — mejora de la Fase 5, propuesta A.7).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newReview, setNewReview] = useState({ rating: 0, title: '', comment: '' })
  const { toast } = useToast()

  const loadReviews = useCallback(async (currentUserId: string | null) => {
    // Aprobadas de cualquiera, o la propia (aunque siga pendiente de
    // aprobación) — antes el filtro `approved=true` dejaba al autor sin
    // poder ver ni editar su propia reseña recién enviada.
    let query = supabase
      .from('product_reviews')
      .select('id, user_id, rating, title, comment, verified_purchase, approved, created_at, users:user_id(name)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })

    query = currentUserId ? query.or(`approved.eq.true,user_id.eq.${currentUserId}`) : query.eq('approved', true)

    const { data } = await query
    setReviews((data as any[]) || [])
    setLoading(false)
  }, [productId])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || null
      setUserId(uid)
      await loadReviews(uid)
    }
    init()
  }, [loadReviews])

  // Solo cuentan las aprobadas para el promedio/conteo público — la propia
  // reseña pendiente del usuario (si la tiene) no debe inflar su propio
  // promedio antes de ser revisada.
  const approvedReviews = reviews.filter((r) => r.approved)
  const avgRating = approvedReviews.length > 0
    ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
    : 0

  const myReview = userId ? reviews.find((r) => r.user_id === userId) : undefined

  const handleEditClick = (review: Review) => {
    setEditingId(review.id)
    setNewReview({ rating: review.rating, title: review.title || '', comment: review.comment || '' })
    setShowForm(true)
  }

  const handleWriteClick = () => {
    setEditingId(null)
    setNewReview({ rating: 0, title: '', comment: '' })
    setShowForm(true)
  }

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
      const payload = {
        rating: newReview.rating,
        title: newReview.title || null,
        comment: newReview.comment || null,
      }

      const { error } = editingId
        ? await (supabase.from('product_reviews') as any).update(payload).eq('id', editingId)
        : await (supabase.from('product_reviews') as any).insert({ product_id: productId, user_id: userId, ...payload })

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Ya dejaste una resena para este producto', variant: 'destructive' })
        } else {
          throw error
        }
      } else {
        toast({
          title: editingId ? 'Resena actualizada' : 'Resena enviada',
          description: editingId ? undefined : 'Sera visible una vez aprobada por el equipo.',
        })
        setShowForm(false)
        setEditingId(null)
        setNewReview({ rating: 0, title: '', comment: '' })
        await loadReviews(userId)
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
          {approvedReviews.length > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <StarRating rating={Math.round(avgRating)} size="sm" />
              <span className="text-sm text-muted-foreground">
                {avgRating.toFixed(1)} ({approvedReviews.length} resena{approvedReviews.length !== 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
        {userId && !showForm && !myReview && (
          <Button variant="outline" onClick={handleWriteClick}>
            Escribir resena
          </Button>
        )}
      </div>

      {/* Review Form */}
      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">
              {editingId ? 'Editar tu resena de' : 'Tu resena de'} {productTitle}
            </CardTitle>
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
                  {submitting ? 'Enviando...' : editingId ? 'Guardar cambios' : 'Enviar resena'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>
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
                    {!review.approved && review.user_id === userId && (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Pendiente de aprobación
                      </span>
                    )}
                    {review.user_id === userId && !showForm && (
                      <button
                        onClick={() => handleEditClick(review)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Editar tu reseña"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
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
