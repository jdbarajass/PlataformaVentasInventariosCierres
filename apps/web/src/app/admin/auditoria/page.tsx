'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  Database,
  Activity,
  Loader2,
  Lock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'

interface AuditLog {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

const actionConfig: Record<string, { label: string; color: string }> = {
  create: { label: 'Crear', color: 'bg-green-500/10 text-green-500' },
  update: { label: 'Actualizar', color: 'bg-blue-500/10 text-blue-500' },
  delete: { label: 'Eliminar', color: 'bg-red-500/10 text-red-500' },
  inventory_adjustment: {
    label: 'Ajuste inventario',
    color: 'bg-orange-500/10 text-orange-500',
  },
  payment_confirmed: {
    label: 'Pago confirmado',
    color: 'bg-emerald-500/10 text-emerald-500',
  },
  user_created: { label: 'Usuario creado', color: 'bg-green-500/10 text-green-500' },
  user_updated: { label: 'Usuario actualizado', color: 'bg-blue-500/10 text-blue-500' },
  user_password_reset: { label: 'Contraseña restablecida', color: 'bg-amber-500/10 text-amber-500' },
  user_deleted: { label: 'Usuario eliminado', color: 'bg-red-500/10 text-red-500' },
}

const tableConfig: Record<string, string> = {
  products: 'Productos',
  orders: 'Órdenes',
  daily_closures: 'Cierres',
  users: 'Usuarios',
  inventory_movements: 'Inventario',
  payments: 'Pagos',
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAction, setSelectedAction] = useState<string>('all')
  const [selectedTable, setSelectedTable] = useState<string>('all')
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const { session, userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'admin'

  const fetchLogs = useCallback(async () => {
    if (!session?.access_token || !isAdmin) return
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/audit-logs?limit=100', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Error fetching audit logs')
      const { data } = await res.json()
      setLogs(data || [])
    } catch (error) {
      console.error('Error fetching audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [session?.access_token, isAdmin])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.actor_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.record_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesAction =
      selectedAction === 'all' || log.action === selectedAction
    const matchesTable =
      selectedTable === 'all' || log.table_name === selectedTable
    return matchesSearch && matchesAction && matchesTable
  })

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedLogs(newExpanded)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)))
  const uniqueTables = Array.from(new Set(logs.map((l) => l.table_name)))

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Cargando auditoría...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Auditoría</h1>
        <p className="text-muted-foreground">
          Registro de todas las acciones realizadas en el sistema
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs.length}</p>
              <p className="text-sm text-muted-foreground">Total registros</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <FileText className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {logs.filter((l) => l.action === 'create').length}
              </p>
              <p className="text-sm text-muted-foreground">Creaciones</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <FileText className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {logs.filter((l) => l.action === 'update').length}
              </p>
              <p className="text-sm text-muted-foreground">Actualizaciones</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {new Set(logs.map((l) => l.actor_email)).size}
              </p>
              <p className="text-sm text-muted-foreground">Usuarios activos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuario, acción o registro..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-10"
          />
        </div>
        <select
          value={selectedAction}
          onChange={(e) => setSelectedAction(e.target.value)}
          className="rounded-xl border bg-background px-4 py-2 text-sm"
        >
          <option value="all">Todas las acciones</option>
          {uniqueActions.map((action) => (
            <option key={action} value={action}>
              {actionConfig[action]?.label || action}
            </option>
          ))}
        </select>
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="rounded-xl border bg-background px-4 py-2 text-sm"
        >
          <option value="all">Todas las tablas</option>
          {uniqueTables.map((table) => (
            <option key={table} value={table}>
              {tableConfig[table] || table}
            </option>
          ))}
        </select>
      </div>

      {/* Logs List */}
      <div className="space-y-3">
        {filteredLogs.map((log) => {
          const isExpanded = expandedLogs.has(log.id)
          const actionInfo = actionConfig[log.action] || {
            label: log.action,
            color: 'bg-gray-500/10 text-gray-500',
          }

          return (
            <div key={log.id} className="rounded-xl border bg-card">
              <button
                onClick={() => toggleExpand(log.id)}
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-8 w-8 items-center justify-center">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={actionInfo.color}>
                      {actionInfo.label}
                    </Badge>
                    <Badge variant="outline">
                      <Database className="mr-1 h-3 w-3" />
                      {tableConfig[log.table_name] || log.table_name}
                    </Badge>
                    {log.record_id && (
                      <span className="text-sm text-muted-foreground">
                        ID: {log.record_id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {log.actor_email || 'Sistema'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t px-4 py-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {log.old_data && (
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                          Datos anteriores
                        </h4>
                        <pre className="rounded-lg bg-muted p-3 text-xs">
                          {JSON.stringify(log.old_data, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.new_data && (
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                          Datos nuevos
                        </h4>
                        <pre className="rounded-lg bg-muted p-3 text-xs">
                          {JSON.stringify(log.new_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                  {(log.ip_address || log.user_agent) && (
                    <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                      {log.ip_address && <span>IP: {log.ip_address}</span>}
                      {log.user_agent && (
                        <span className="truncate">
                          User Agent: {log.user_agent}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filteredLogs.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              No se encontraron registros de auditoría
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
