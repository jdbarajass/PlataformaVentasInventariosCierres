'use client'

import { useState, useEffect, useCallback } from 'react'
import { StickyNote, PackageSearch, ListChecks, ShieldAlert, Plus, Loader2, Trash2, Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  // 'admin_task' — "Pendientes Generales Admin": pestaña adicional pedida
  // por el usuario, exclusiva para admin (ni la ve ni la puede tocar un
  // vendedor — reforzado por RLS en la base de datos, no solo oculta en
  // la interfaz, ver migración 00029).
  type: 'task' | 'restock' | 'admin_task'
  text: string
  completed: boolean
  due_date: string | null
}

export default function NotasPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  // Igual que el software local: "Por Pedir / Resurtido" y "Tareas
  // Operativas" son dos pestañas separadas, no una sola lista mezclada.
  // "Pendientes Generales Admin" es una tercera pestaña exclusiva de admin.
  const [activeTab, setActiveTab] = useState<'restock' | 'task' | 'admin_task'>('restock')
  const [showCompleted, setShowCompleted] = useState(false)

  const [text, setText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token]
  )

  // Se cargan todas las notas (no solo las del filtro activo) para poder
  // mostrar el contador "N pendientes • N en total • ⚠ N vencidas" — igual
  // que _lbl_count del local, que cuenta sobre el total, no solo lo visible.
  const fetchNotes = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch('/api/notes', { headers: authHeaders() })
      if (!res.ok) return
      const { data } = await res.json()
      setNotes(data || [])
    } catch (error) {
      console.error('Error fetching notes:', error)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, authHeaders])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const formatDate = (dateString: string) =>
    new Date(dateString + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })

  // Gradiente de urgencia (vencida/hoy/≤3 días/futura) — igual que el
  // software local (_badge_dias en ui/notas_panel.py), que resalta las
  // notas próximas a vencer en vez de solo distinguir vencida sí/no.
  const getUrgency = (dueDate: string | null) => {
    if (!dueDate) return { label: null, colorClass: '', rank: 4 }
    const days = Math.floor((new Date(dueDate + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
    if (days < 0) return { label: `Vencida hace ${-days}d`, colorClass: 'text-red-500 font-medium', rank: 0 }
    if (days === 0) return { label: 'Vence hoy', colorClass: 'text-red-500 font-medium', rank: 1 }
    if (days <= 3) return { label: `Vence en ${days}d`, colorClass: 'text-amber-500 font-medium', rank: 2 }
    return { label: `Vence ${formatDate(dueDate)}`, colorClass: 'text-muted-foreground', rank: 3 }
  }

  // Cada pestaña filtra por su propio tipo — la mezcla de "por pedir" y
  // "tareas operativas" en una sola lista era justo lo que se quería evitar.
  const tabNotes = notes.filter((n) => n.type === activeTab)

  // Orden combinado: vencidas primero, luego hoy, luego próximas, luego
  // futuras, sin fecha al final — igual que obtener_notas() del local.
  const sortedNotes = tabNotes
    .filter((n) => n.completed === showCompleted)
    .sort((a, b) => getUrgency(a.due_date).rank - getUrgency(b.due_date).rank)

  // Contador "N pendientes • N en total • ⚠ N vencidas" — igual que
  // _lbl_count del local (ui/notas_panel.py), calculado sobre la pestaña activa.
  const pendingCount = tabNotes.filter((n) => !n.completed).length
  const overdueCount = tabNotes.filter((n) => !n.completed && getUrgency(n.due_date).rank === 0).length

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
        body: JSON.stringify({ type: activeTab, text, due_date: dueDate || null }),
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

  const startEdit = (note: Note) => {
    setEditingId(note.id)
    setEditText(note.text)
    setEditDueDate(note.due_date || '')
  }

  const handleSaveEdit = async (noteId: string) => {
    if (!editText.trim()) {
      toast({ title: 'Error', description: 'El texto no puede estar vacío', variant: 'destructive' })
      return
    }
    try {
      setSavingEdit(true)
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text: editText, due_date: editDueDate || null }),
      })
      if (!res.ok) throw new Error('Error al actualizar la nota')
      toast({ title: 'Nota actualizada' })
      setEditingId(null)
      await fetchNotes()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSavingEdit(false)
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

      <div className="flex gap-2 border-b">
        {(
          [
            { key: 'restock' as const, label: 'Por Pedir / Resurtido', icon: PackageSearch },
            { key: 'task' as const, label: 'Tareas Operativas', icon: ListChecks },
            // Exclusiva de admin — ni la pestaña se muestra a un vendedor
            // ni, aunque se forzara la petición, RLS le dejaría ver estas
            // filas (migración 00029).
            ...(isAdmin ? [{ key: 'admin_task' as const, label: 'Pendientes Generales Admin', icon: ShieldAlert }] : []),
          ]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key)
              setShowCompleted(false)
            }}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {activeTab === 'restock' ? 'Nuevo pendiente por pedir' : activeTab === 'admin_task' ? 'Nuevo pendiente general admin' : 'Nueva tarea'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={
              activeTab === 'restock'
                ? 'Ej: Cascos XTR-M70 talla M x 5...'
                : activeTab === 'admin_task'
                ? 'Ej: Revisar contrato de arriendo antes de fin de mes...'
                : 'Ej: Revisar cuentas de Addi del mes...'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-w-[240px] flex-1 rounded-lg"
          />
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg" />
          <Button className="rounded-lg" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Agregar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Button variant={!showCompleted ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setShowCompleted(false)}>
            Pendientes
          </Button>
          <Button variant={showCompleted ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setShowCompleted(true)}>
            Completadas
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''} · {tabNotes.length} en total
          {overdueCount > 0 && <span className="text-red-500"> · ⚠ {overdueCount} vencida{overdueCount !== 1 ? 's' : ''}</span>}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tabNotes.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <StickyNote className="mx-auto mb-2 h-8 w-8" />
          No hay notas {showCompleted ? 'completadas' : 'pendientes'}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedNotes.map((note) => {
            const urgency = getUrgency(note.due_date)
            if (editingId === note.id) {
              return (
                <div key={note.id} className="space-y-2 rounded-xl border bg-card p-4">
                  <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="rounded-lg" placeholder="Texto de la nota" />
                  <div className="flex items-center gap-2">
                    <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="rounded-lg" />
                    <Button size="sm" className="rounded-lg" onClick={() => handleSaveEdit(note.id)} disabled={savingEdit}>
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
                    {urgency.label && (
                      <div className="text-sm text-muted-foreground">
                        <span className={cn(!note.completed && urgency.colorClass)}>{urgency.label}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(note)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(note)}>
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
