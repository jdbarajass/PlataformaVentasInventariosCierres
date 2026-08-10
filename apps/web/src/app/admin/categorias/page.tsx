'use client'

import { useState, useEffect, useCallback } from 'react'
import { Layers, Plus, Loader2, Trash2, Check, Pencil, X, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  active: boolean
  sort_order: number
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const { session } = useAuth()
  const { toast } = useToast()

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const fetchCategories = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch('/api/categories?include_inactive=true', { headers: authHeaders() })
      if (!res.ok) return
      const { categories } = await res.json()
      setCategories(categories || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Escribe el nombre de la categoría', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name, description: description || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear la categoría')
      toast({ title: 'Categoría creada' })
      setName('')
      setDescription('')
      await fetchCategories()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (category: Category) => {
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ active: !category.active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar la categoría')
      await fetchCategories()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const startEdit = (category: Category) => {
    setEditingId(category.id)
    setEditName(category.name)
    setEditDescription(category.description || '')
  }

  const handleSaveEdit = async (categoryId: string) => {
    if (!editName.trim()) {
      toast({ title: 'Error', description: 'El nombre no puede estar vacío', variant: 'destructive' })
      return
    }
    try {
      setSavingEdit(true)
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: editName, description: editDescription || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar la categoría')
      toast({ title: 'Categoría actualizada' })
      setEditingId(null)
      await fetchCategories()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (category: Category) => {
    if (!confirm(`¿Eliminar la categoría "${category.name}"? Esta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`/api/categories/${category.id}`, { method: 'DELETE', headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar la categoría')
      toast({ title: 'Categoría eliminada' })
      await fetchCategories()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Categorías</h1>
        <p className="text-muted-foreground">Organiza los productos del catálogo por categoría</p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Nueva categoría</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Ej: Cascos"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg"
          />
          <Input
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-w-[240px] flex-[2] rounded-lg"
          />
          <Button className="rounded-lg" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Agregar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <Layers className="mx-auto mb-2 h-8 w-8" />
          No hay categorías todavía
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => {
            if (editingId === category.id) {
              return (
                <div key={category.id} data-testid={`category-row-${category.slug}`} className="space-y-2 rounded-xl border bg-card p-4">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-lg" placeholder="Nombre" />
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="rounded-lg"
                    placeholder="Descripción (opcional)"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="rounded-lg" onClick={() => handleSaveEdit(category.id)} disabled={savingEdit}>
                      {savingEdit ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setEditingId(null)}>
                      <X className="mr-1 h-3 w-3" /> Cancelar
                    </Button>
                  </div>
                </div>
              )
            }
            return (
              <div key={category.id} data-testid={`category-row-${category.slug}`} className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className={cn('font-medium', !category.active && 'text-muted-foreground')}>{category.name}</p>
                    <span className="text-xs text-muted-foreground">/{category.slug}</span>
                    {!category.active && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">Inactiva</span>
                    )}
                  </div>
                  {category.description && <p className="text-sm text-muted-foreground">{category.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={category.active ? 'Desactivar' : 'Activar'}
                    onClick={() => handleToggleActive(category)}
                  >
                    {category.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(category)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(category)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
