'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Trash2, CheckCircle, XCircle, Star, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'

type Review = {
  id: string
  product_id: string
  user_id: string
  rating: number
  title: string | null
  comment: string | null
  verified_purchase: boolean
  approved: boolean
  created_at: string
  users: { name: string | null; email: string } | null
  products: { title: string; slug: string } | null
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  )
}

export default function ResenasPage() {
  const { toast } = useToast()
  const [reviews, setReviews] = useState<Review[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterRating, setFilterRating] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus === 'pending') params.set('approved', 'false')
      if (filterStatus === 'approved') params.set('approved', 'true')

      const res = await fetch(`/api/reviews?${params}`)
      const data = await res.json()
      setReviews(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: 'Error al cargar resenas', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [filterStatus, toast])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleApprove = async (review: Review) => {
    setProcessingId(review.id)
    try {
      const res = await fetch('/api/reviews', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id, approved: !review.approved }),
      })
      if (res.ok) {
        toast({
          title: review.approved ? 'Resena rechazada' : 'Resena aprobada',
          description: `${review.products?.title || 'Producto'} — ${review.users?.name || review.users?.email || 'Usuario'}`,
        })
        fetchReviews()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (review: Review) => {
    if (
      !confirm(
        `¿Eliminar la resena de "${review.users?.name || review.users?.email}"? Esta accion no se puede deshacer.`
      )
    )
      return

    setProcessingId(review.id)
    try {
      const res = await fetch(`/api/reviews?id=${review.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Resena eliminada' })
        fetchReviews()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  const filtered = reviews.filter((r) => {
    const matchSearch =
      (r.users?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.users?.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.products?.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.comment || '').toLowerCase().includes(search.toLowerCase())

    const matchRating =
      filterRating === 'all' || r.rating === Number(filterRating)

    return matchSearch && matchRating
  })

  const pendingCount = reviews.filter((r) => !r.approved).length
  const approvedCount = reviews.filter((r) => r.approved).length
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
      : '—'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Resenas de Productos</h1>
        <p className="text-muted-foreground">Modera y gestiona las resenas de los clientes</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{reviews.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-500">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Aprobadas</p>
            <p className="text-2xl font-bold text-green-500">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Promedio</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{avgRating}</p>
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, producto o contenido..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 rounded-xl border bg-background px-4 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes de aprobacion</option>
              <option value="approved">Aprobadas</option>
            </select>
            <select
              className="h-10 rounded-xl border bg-background px-4 text-sm"
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value)}
            >
              <option value="all">Todas las estrellas</option>
              <option value="5">5 estrellas</option>
              <option value="4">4 estrellas</option>
              <option value="3">3 estrellas</option>
              <option value="2">2 estrellas</option>
              <option value="1">1 estrella</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} resenas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 opacity-30" />
              <p>No hay resenas con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((review) => (
                <div
                  key={review.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    !review.approved ? 'border-yellow-500/30 bg-yellow-500/5' : ''
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left: review content */}
                    <div className="flex-1 space-y-2">
                      {/* Rating + badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <StarRating rating={review.rating} />
                        {review.approved ? (
                          <Badge variant="success">Aprobada</Badge>
                        ) : (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                        {review.verified_purchase && (
                          <Badge variant="secondary">Compra verificada</Badge>
                        )}
                      </div>

                      {/* Title */}
                      {review.title && (
                        <p className="font-semibold">{review.title}</p>
                      )}

                      {/* Comment */}
                      {review.comment && (
                        <p className="text-sm text-muted-foreground">{review.comment}</p>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">Producto:</span>{' '}
                          {review.products?.title || review.product_id}
                        </span>
                        <span>
                          <span className="font-medium text-foreground">Cliente:</span>{' '}
                          {review.users?.name || review.users?.email || 'Anonimo'}
                        </span>
                        <span>
                          {new Date(review.created_at).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApprove(review)}
                        disabled={processingId === review.id}
                        className={`gap-2 ${
                          review.approved
                            ? 'text-yellow-600 hover:bg-yellow-500/10'
                            : 'text-green-600 hover:bg-green-500/10'
                        }`}
                      >
                        {processingId === review.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : review.approved ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        {review.approved ? 'Rechazar' : 'Aprobar'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(review)}
                        disabled={processingId === review.id}
                        className="gap-2 text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
