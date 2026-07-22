'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Search,
  Shield,
  ShieldCheck,
  Eye,
  Pencil,
  Mail,
  Phone,
  Loader2,
  Check,
  X,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface UserData {
  id: string
  email: string
  name: string | null
  phone: string | null
  role: 'admin' | 'seller' | 'viewer'
  avatar_url: string | null
  created_at: string
  updated_at: string
}

const roleConfig = {
  admin: {
    label: 'Administrador',
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    icon: ShieldCheck,
  },
  seller: {
    label: 'Vendedor',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    icon: Shield,
  },
  viewer: {
    label: 'Visor',
    color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    icon: Eye,
  },
}

const roles: Array<'admin' | 'seller' | 'viewer'> = ['admin', 'seller', 'viewer']

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<'admin' | 'seller' | 'viewer'>('viewer')
  const [saving, setSaving] = useState(false)
  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'

  const fetchUsers = useCallback(async () => {
    if (!session?.access_token || !isAdmin) return

    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (selectedRole !== 'all') params.set('role', selectedRole)

      const res = await fetch(`/api/users?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!res.ok) {
        throw new Error('Error al obtener usuarios')
      }

      const { data } = await res.json()
      setUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los usuarios',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [session?.access_token, isAdmin, searchQuery, selectedRole, toast])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleEditRole = (user: UserData) => {
    setEditingUser(user.id)
    setEditRole(user.role)
  }

  const handleSaveRole = async (userId: string) => {
    if (!session?.access_token) return

    try {
      setSaving(true)
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId, role: editRole }),
      })

      if (!res.ok) {
        throw new Error('Error al actualizar rol')
      }

      toast({
        title: 'Rol actualizado',
        description: `El rol fue cambiado a ${roleConfig[editRole].label}`,
      })

      setEditingUser(null)
      fetchUsers()
    } catch (error) {
      console.error('Error updating role:', error)
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el rol',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const roleCounts = {
    admin: users.filter((u) => u.role === 'admin').length,
    seller: users.filter((u) => u.role === 'seller').length,
    viewer: users.filter((u) => u.role === 'viewer').length,
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Lock className="h-10 w-10" />
        <p>Esta sección solo está disponible para administradores.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground">
            Gestiona los usuarios y sus permisos
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-sm text-muted-foreground">Total usuarios</p>
            </div>
          </div>
        </div>
        {Object.entries(roleConfig).map(([role, config]) => {
          const count = roleCounts[role as keyof typeof roleCounts]
          const Icon = config.icon
          return (
            <div key={role} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-sm text-muted-foreground">{config.label}s</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={selectedRole === 'all' ? 'default' : 'outline'}
            onClick={() => setSelectedRole('all')}
            className="rounded-xl"
          >
            Todos
          </Button>
          {Object.entries(roleConfig).map(([role, config]) => (
            <Button
              key={role}
              variant={selectedRole === role ? 'default' : 'outline'}
              onClick={() => setSelectedRole(role)}
              className="rounded-xl"
            >
              {config.label}s
            </Button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Cargando usuarios...</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Usuario
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Contacto
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Rol
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Creado
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const roleInfo = roleConfig[user.role]
                    const RoleIcon = roleInfo.icon
                    const isEditing = editingUser === user.id
                    return (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                              <span className="text-sm font-bold text-white">
                                {user.name?.charAt(0) || user.email.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">
                                {user.name || 'Sin nombre'}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span>{user.email}</span>
                            </div>
                            {user.phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span>{user.phone}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as 'admin' | 'seller' | 'viewer')}
                                className="rounded-lg border bg-background px-2 py-1 text-sm"
                              >
                                {roles.map((r) => (
                                  <option key={r} value={r}>
                                    {roleConfig[r].label}
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleSaveRole(user.id)}
                                disabled={saving}
                              >
                                {saving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3 text-green-500" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setEditingUser(null)}
                              >
                                <X className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`${roleInfo.color} gap-1`}
                            >
                              <RoleIcon className="h-3 w-3" />
                              {roleInfo.label}
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                              onClick={() => handleEditRole(user)}
                              title="Editar rol"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="p-8 text-center">
                <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  No se encontraron usuarios
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
