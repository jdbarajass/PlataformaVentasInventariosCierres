'use client'

import { useState } from 'react'
import {
  Users,
  Search,
  Plus,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  Eye,
  Pencil,
  Trash2,
  Mail,
  Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// Mock data for users
const mockUsers = [
  {
    id: '1',
    email: 'admin@ybmotocom.com',
    name: 'Administrador Principal',
    phone: '+57 300 123 4567',
    role: 'admin' as const,
    avatar_url: null,
    created_at: '2024-01-15T10:00:00Z',
    last_login: '2024-12-20T14:30:00Z',
  },
  {
    id: '2',
    email: 'vendedor1@ybmotocom.com',
    name: 'Carlos Rodríguez',
    phone: '+57 301 234 5678',
    role: 'seller' as const,
    avatar_url: null,
    created_at: '2024-03-10T09:00:00Z',
    last_login: '2024-12-19T16:45:00Z',
  },
  {
    id: '3',
    email: 'vendedor2@ybmotocom.com',
    name: 'María García',
    phone: '+57 302 345 6789',
    role: 'seller' as const,
    avatar_url: null,
    created_at: '2024-05-20T11:00:00Z',
    last_login: '2024-12-20T09:15:00Z',
  },
  {
    id: '4',
    email: 'visor@ybmotocom.com',
    name: 'Juan Pérez',
    phone: null,
    role: 'viewer' as const,
    avatar_url: null,
    created_at: '2024-08-01T14:00:00Z',
    last_login: '2024-12-18T11:00:00Z',
  },
]

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

export default function UsuariosPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('all')

  const filteredUsers = mockUsers.filter((user) => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = selectedRole === 'all' || user.role === selectedRole
    return matchesSearch && matchesRole
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
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
        <Button className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{mockUsers.length}</p>
              <p className="text-sm text-muted-foreground">Total usuarios</p>
            </div>
          </div>
        </div>
        {Object.entries(roleConfig).map(([role, config]) => {
          const count = mockUsers.filter((u) => u.role === role).length
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
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                  Último acceso
                </th>
                <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const roleInfo = roleConfig[user.role]
                const RoleIcon = roleInfo.icon
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
                      <Badge
                        variant="outline"
                        className={`${roleInfo.color} gap-1`}
                      >
                        <RoleIcon className="h-3 w-3" />
                        {roleInfo.label}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatDate(user.last_login)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              No se encontraron usuarios
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
