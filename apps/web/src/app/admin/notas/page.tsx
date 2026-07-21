'use client'

import { useState, useEffect, useCallback } from 'react'
import { StickyNote, Plus, Loader2, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  type: 'task' | 'restock'
  text: string
  completed: boolean
  due_date: string | null
}

export default function NotasPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  const [text, setText] = useState('')
  const [type, setType] = useState<'task' | 'restock'>('task')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const { session } = useAuth()
  const { toast } = useToast()

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  const fetchNotes = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/notes?completed=${showCompleted}`, { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setNotes(data || [])
    } catch (error) {
      console.error('Error fetching notes:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, authHeaders, showCompleted])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const isOverdue = (dueDate: string | null) => !!dueDate && new Date(dueDate).getTime() < Date.now()

  const formatDate = (dateString: string) =>
    new Date(dateString + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })

  const handleCreate = async () => {
    if (!text.trim()) {
      toast({ title: 'Error', description: 'Escribe el texto de la nota', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ type, text, due_date: dueDate || null }),
      })
      if (!res.ok) throw new Error('Error al crear la nota')
      toast({ title: 'Nota creada' })
      setText('')
      setDueDate('')
      await fetchNotes()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleCompleted = async (note: Note) => {
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ completed: !note.completed }),
      })
      if (!res.ok) throw new Error('Error al actualizar la nota')
      await fetchNotes()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (note: Note) => {
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Error al eliminar la nota')
      await fetchNotes()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Notas y Pendientes</h1>
        <p className="text-muted-foreground">Tareas y recordatorios de resurtido</p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Nueva nota</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'task' | 'restock')}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="task">Tarea</option>
            <option value="restock">Por pedir / resurtido</option>
          </select>
          <Input placeholder="Texto de la nota" value={text} onChange={(e) => setText(e.target.value)} className="min-w-[240px] flex-1 rounded-lg" />
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg" />
          <Button className="rounded-lg" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Agregar
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={!showCompleted ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setShowCompleted(false)}>
          Pendientes
        </Button>
        <Button variant={showCompleted ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setShowCompleted(true)}>
          Completadas
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <StickyNote className="mx-auto mb-2 h-8 w-8" />
          No hay notas {showCompleted ? 'completadas' : 'pendientes'}
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className={cn('h-7 w-7 rounded-full', note.completed && 'bg-green-500/10 text-green-500 border-green-500/30')}
                  onClick={() => handleToggleCompleted(note)}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <div>
                  <p className={cn('font-medium', note.completed && 'line-through text-muted-foreground')}>{note.text}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{note.type === 'task' ? 'Tarea' : 'Resurtido'}</Badge>
                    {note.due_date && (
                      <span className={cn(isOverdue(note.due_date) && !note.completed && 'text-red-500 font-medium')}>
                        Vence {formatDate(note.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(note)}>
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
