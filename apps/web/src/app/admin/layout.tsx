'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Calendar,
  Users,
  Settings,
  FileText,
  LogOut,
  Shield,
  Store,
  Loader2,
  Lock,
  Tag,
  MessageSquare,
  Landmark,
  Wallet,
  Receipt,
  FileStack,
  HandCoins,
  PackageOpen,
  StickyNote,
  PiggyBank,
  Trophy,
  FileSpreadsheet,
  Calculator,
  Gauge,
  CalendarClock,
  History,
  Percent,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { SessionAlerts } from '@/components/admin/session-alerts'

// adminOnly: oculta el enlace del menú a 'seller', igual que el software
// local oculta el botón de navegación completo para estas páginas
// (main_window._ocultas_vendedor). Cada una de estas páginas ya rechaza
// o bloquea el acceso a 'seller' por su cuenta (servidor y/o cliente); esto
// solo evita que el vendedor vea el enlace en primer lugar.
const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Productos', href: '/admin/productos', icon: Package },
  { name: 'Ordenes', href: '/admin/ordenes', icon: ShoppingCart },
  { name: 'Registrar Venta', href: '/admin/ventas', icon: Receipt },
  { name: 'Calculadora', href: '/admin/calculadora', icon: Calculator },
  { name: 'Mi Cuadre', href: '/admin/mi-cuadre', icon: Gauge },
  { name: 'Ventas del Día', href: '/admin/ventas-dia', icon: CalendarClock },
  { name: 'Historial Mensual', href: '/admin/historial-mensual', icon: History },
  { name: 'Inventario', href: '/admin/inventario', icon: BarChart3 },
  { name: 'Cuentas', href: '/admin/cuentas', icon: Wallet, adminOnly: true },
  { name: 'Facturas', href: '/admin/facturas', icon: FileStack },
  { name: 'Fiado', href: '/admin/fiado', icon: HandCoins },
  { name: 'Préstamos', href: '/admin/prestamos', icon: PackageOpen },
  { name: 'Notas', href: '/admin/notas', icon: StickyNote },
  { name: 'Presupuesto', href: '/admin/presupuesto', icon: PiggyBank },
  { name: 'Cierres', href: '/admin/cierres', icon: Calendar },
  { name: 'Cierre Alegra', href: '/admin/cierre-alegra', icon: Landmark },
  { name: 'Reportes', href: '/admin/reportes', icon: FileText },
  { name: 'Rendimiento Vendedores', href: '/admin/rendimiento-vendedores', icon: Trophy, adminOnly: true },
  { name: 'Cupones', href: '/admin/cupones', icon: Tag },
  { name: 'Resenas', href: '/admin/resenas', icon: MessageSquare },
  { name: 'Usuarios', href: '/admin/usuarios', icon: Users, adminOnly: true },
  { name: 'Auditoria', href: '/admin/auditoria', icon: Shield, adminOnly: true },
  { name: 'Exportar/Importar', href: '/admin/exportar-importar', icon: FileSpreadsheet, adminOnly: true },
  { name: 'Comisiones y Gastos Fijos', href: '/admin/configuracion-pos', icon: Percent, adminOnly: true },
  { name: 'Configuracion', href: '/admin/configuracion', icon: Settings, adminOnly: true },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { user, userProfile, loading, signOut } = useAuth()

  // Colapsar el sidebar para dar más espacio al contenido — preferencia
  // persistida en localStorage, pedida explícitamente por el usuario.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(localStorage.getItem('admin_sidebar_collapsed') === 'true')
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('admin_sidebar_collapsed', String(next))
      return next
    })
  }

  // Redirigir al login si no hay usuario autenticado
  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/iniciar-sesion'
    }
  }, [loading, user])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  // Mostrar pantalla de acceso denegado mientras redirige
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white">Acceso Restringido</h1>
          <p className="mt-2 text-slate-400">Debes iniciar sesion para acceder</p>
          <p className="mt-4 text-sm text-slate-500">Redirigiendo al login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 border-r bg-card transition-all duration-200',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={cn('flex h-16 items-center border-b', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
            <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
                <span className="text-sm font-bold text-white">YB</span>
              </div>
              {!collapsed && <span className="font-bold">Admin</span>}
            </Link>
            {!collapsed && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggleCollapsed} title="Colapsar menú">
                <Menu className="h-4 w-4" />
              </Button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              title="Expandir menú"
              className="flex items-center justify-center border-b py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          {/* User Info */}
          {user && (
            <div className={cn('border-b p-4', collapsed && 'flex justify-center px-2')}>
              <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                  <span className="text-sm font-bold text-white">
                    {userProfile?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </span>
                </div>
                {!collapsed && (
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium">
                      {userProfile?.name || user.email?.split('@')[0]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {userProfile?.role || 'admin'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navigation
              .filter((item) => !item.adminOnly || userProfile?.role === 'admin')
              .map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname?.startsWith(item.href))

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-500'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-4 space-y-2">
            <Link
              href="/"
              title={collapsed ? 'Ver tienda' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              <Store className="h-5 w-5 shrink-0" />
              {!collapsed && 'Ver tienda'}
            </Link>
            <Button
              variant="ghost"
              onClick={signOut}
              title={collapsed ? 'Cerrar sesion' : undefined}
              className={cn(
                'w-full gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 hover:text-red-500',
                collapsed ? 'justify-center px-2' : 'justify-start'
              )}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {!collapsed && 'Cerrar sesion'}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={cn('flex-1 transition-all duration-200', collapsed ? 'pl-16' : 'pl-64')}>
        <div className="p-8">{children}</div>
      </main>
      <SessionAlerts />
    </div>
  )
}
